import assert from 'node:assert/strict';
import { existsSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { chromium, type Browser } from 'playwright-core';
import { verifyCanPost } from '../facebook/membership';

/**
 * "שיש את השגיאה הזאת לא מצאתי כתוב משהו בפייסבוק לבצע אימות חוזר ובמידה ואין
 *  להתנתק מהקבוצה הזאת, ולהסיר אותה מהרשימת קבוצות שלנו שזה לא יעקב אותנו פעם
 *  הבאה."
 *
 * Two halves, and the second is the dangerous one.
 *
 *   1. The re-verification itself — worker/facebook/membership.ts — against
 *      local HTML fixtures in a real Chromium. No network: every page is a
 *      file:// URL, which is the whole reason the address check lives at the
 *      call site rather than inside the function (same arrangement as
 *      publishToGroup; see the note at the top of composer.ts).
 *   2. What the worker is allowed to DO with each answer. A group switched off
 *      stops receiving publications, so the one thing this must never do is
 *      switch a group off on anything but Facebook's own sentence — and the
 *      sidebar of SUGGESTED groups, every card of which says "הצטרפות
 *      לקבוצה", is exactly the page furniture that would do it.
 *
 *   npx tsx worker/test/reverify.test.ts
 */

let checks = 0;
const ok = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = <T>(a: T, b: T, what: string) => {
  checks += 1;
  assert.deepEqual(a, b, what);
};

/** Comments are not code. A grep that a comment satisfies proves nothing. */
function stripComments(src: string): string {
  let out = '';
  let i = 0;
  while (i < src.length) {
    const two = src.slice(i, i + 2);
    if (two === '/*') {
      const end = src.indexOf('*/', i + 2);
      i = end === -1 ? src.length : end + 2;
      continue;
    }
    if (two === '//') {
      const end = src.indexOf('\n', i);
      i = end === -1 ? src.length : end;
      continue;
    }
    const ch = src[i];
    if (ch === "'" || ch === '"' || ch === '`') {
      out += ch;
      i += 1;
      while (i < src.length && src[i] !== ch) {
        if (src[i] === '\\') {
          out += src.slice(i, i + 2);
          i += 2;
          continue;
        }
        out += src[i];
        i += 1;
      }
      out += ch;
      i += 1;
      continue;
    }
    out += ch;
    i += 1;
  }
  return out;
}

/** playwright-core only looks for its own build — find a usable Chromium. */
function findChromium(): string | undefined {
  if (process.env.SOCIAL_BROWSER_EXECUTABLE) return process.env.SOCIAL_BROWSER_EXECUTABLE;
  for (const fixed of ['/opt/pw-browsers/chromium']) if (existsSync(fixed)) return fixed;
  const root = process.env.PLAYWRIGHT_BROWSERS_PATH;
  if (!root || !existsSync(root)) return undefined;
  for (const dir of readdirSync(root).filter((d) => d.startsWith('chromium')).sort().reverse()) {
    for (const rel of ['chrome-linux/chrome', 'chrome-linux/headless_shell', 'chrome-win/chrome.exe', 'chrome-mac/Chromium.app/Contents/MacOS/Chromium']) {
      const candidate = path.join(root, dir, rel);
      if (existsSync(candidate)) return candidate;
    }
  }
  return undefined;
}

function fixture(name: string, html: string): string {
  const file = path.join(tmpdir(), `hapitaron-reverify-${name}.html`);
  writeFileSync(file, `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>קבוצה | Facebook</title></head><body>${html}</body></html>`);
  return `file://${file}`;
}

/* The group's own column, and a rail of suggestions beside it. Facebook draws
   both; only one of them is about THIS group. */
const SIDEBAR = '<div role="complementary"><h3>קבוצות שאולי תאהבו</h3><div><span>רמת גן ביחד</span><button type="button">הצטרפות לקבוצה</button></div></div>';
const COMPOSER = '<button type="button" id="t">כתבו משהו…</button>';

async function theVerification(browser: Browser): Promise<void> {
  const context = await browser.newContext({ locale: 'he-IL' });
  const page = await context.newPage();

  /* 1. Facebook says it, in the group's own column. The one certain answer. */
  const refused = await verifyCanPost(page, fixture('refused', `<div role="main"><h1>באר שבע ביחד</h1><div>אי אפשר לפרסם בקבוצה הזו</div></div>`));
  eq(refused.verdict, 'cannot-post', 'Facebook printing "אי אפשר לפרסם" where the composer belongs is the certain answer');
  eq(refused.said, 'אי אפשר לפרסם בקבוצה הזו', 'and the owner is shown Facebook’s own sentence, not our description of it');

  /* 2. The other shape of the same fact: a join button where the box belongs. */
  const notMember = await verifyCanPost(page, fixture('join', `<div role="main"><h1>קבוצה</h1><button type="button">הצטרפות לקבוצה</button></div>`));
  eq(notMember.verdict, 'cannot-post', 'a join button inside the group’s own column means the same thing: not a member');

  /*
   * 3. THE FALSE POSITIVE THIS FILE EXISTS FOR.
   *
   * The owner is a member, the box is there, and the suggestions rail carries
   * three "הצטרפות לקבוצה" buttons. Read from the whole document that rail
   * retires a perfectly good group — and at fifty groups a round it retires
   * the list.
   */
  const member = await verifyCanPost(page, fixture('rail-ok', `<div role="main">${COMPOSER}</div>${SIDEBAR}`));
  eq(member.verdict, 'can-post', 'the suggestions rail is not the group’s own refusal');

  /*
   * 4. And the same rail with NO box — the exact page the publication failed
   * on. 'unknown', never 'cannot-post': the rail still says nothing about this
   * group, and the missing box is the question, not the answer.
   */
  const unclear = await verifyCanPost(page, fixture('rail-nobox', `<div role="main"><h1>קבוצה</h1><div>פוסטים</div></div>${SIDEBAR}`));
  eq(unclear.verdict, 'unknown', 'no box and no refusal of our own is "could not tell" — nothing may be switched off on it');

  /*
   * 5. A FACEBOOK REDESIGN, which is the failure mode that must never cost
   * the owner his groups: our selectors find nothing at all.
   */
  const redesign = await verifyCanPost(page, fixture('redesign', `<div role="main"><div data-x="1"><span>Something new</span></div></div>`));
  eq(redesign.verdict, 'unknown', 'a redesign answers "unknown" — a round may be lost, a group list may not');

  /* 6. A security check answers every address the same way. Never a verdict. */
  const checkpoint = await verifyCanPost(page, fixture('checkpoint', `<h1>Confirm your identity</h1><p>Enter the security code we sent.</p><div role="main">אי אפשר לפרסם</div>`));
  eq(checkpoint.verdict, 'unknown', 'a checkpoint is about the account, not the group — and it even outranks a refusal on the page');

  /* 7. The real fixture the composer is tested against: a healthy group. */
  const healthy = await verifyCanPost(page, `file://${path.resolve(__dirname, 'mock-group.html')}`);
  eq(healthy.verdict, 'can-post', 'the healthy group fixture reads as "you can post here"');

  /* 8. An address that does not open at all is this computer's line. */
  const gone = await verifyCanPost(page, 'file:///definitely/not/here/at/all.html');
  eq(gone.verdict, 'unknown', 'a page that never opened says nothing about the group');

  await context.close();
}

/* ------------------------------------------------- the throw that asks */

function theSignal(): void {
  const composer = stripComments(readFileSync(new URL('../facebook/composer.ts', import.meta.url), 'utf8'));
  ok(/why:\s*''\s*\|\s*'no-composer-box'/.test(composer), 'PublishError carries WHICH composer failure this is, in a field rather than in its wording');
  const carriers = composer.split('no-composer-box').length - 1;
  /* Once in the type, once at the throw. A third would mean a second throw has
     started claiming the one failure that triggers a re-verification. */
  eq(carriers, 2, 'exactly one throw claims it: the missing "כתבו משהו…" box');
  const atSentence = composer.indexOf('לא מצאתי את תיבת');
  ok(atSentence > 0, 'the sentence the owner reads is still the one in the file');
  ok(/no-composer-box/.test(composer.slice(atSentence, atSentence + 400)), 'and it is that throw that carries the signal — the one whose sentence the owner reads');
  /* The three composer failures that prove the box DID open must not carry it:
     they say nothing about the group and a second look would be spent for
     nothing. */
  for (const other of ['חלון הפוסט נפתח אבל אין בו תיבת טקסט', 'לא הפך לזמין']) {
    const at = composer.indexOf(other);
    ok(at > 0, `the fixture for "${other}" is still in the file`);
    const near = composer.slice(at, at + 400);
    ok(!/no-composer-box/.test(near), `"${other}" proves the composer opened — it must not ask for a re-verification`);
  }
}

/* ------------------------------------------- what the worker may do with it */

function theBranch(): void {
  const raw = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
  const worker = stripComments(raw);

  /* The branch exists, and it is reached by the field rather than by a regex
     over a Hebrew sentence somebody will improve one day. */
  ok(/err instanceof PublishError && err\.why === 'no-composer-box'/.test(worker), 'the failure path recognises the one ambiguous composer miss by its own field');

  /* AND ONLY FROM A PERSONAL PROFILE. Most groups refuse Pages; reading that
     as "you left" is how a working group list gets retired. */
  const head = worker.slice(worker.indexOf("err.why === 'no-composer-box'"));
  ok(/^[^\n]*!state\.asPage/.test(head), 'and never while signed in as a Page — the same guard the cannot_post branch carries');

  const branch = head.slice(0, head.indexOf('ONE ATTEMPT') > 0 ? head.indexOf('ONE ATTEMPT') : 4000);

  /* enabled:false is the whole of "שזה לא יעקב אותנו פעם הבאה" — rules.ts
     skips a disabled target before it is ever claimed. */
  ok(/enabled:\s*false/.test(branch), 'a confirmed refusal switches the group off, so no later round can queue, wait on, or fail it again');
  ok(/last_status:\s*'left'/.test(branch), 'and it is marked as left, which is the state the groups screen draws in amber');

  /* The two writes that must be gated on the CERTAIN verdict only. */
  /*
   * ONE switch-off in this branch, and the test asks which verdict guards it
   * rather than hoping the lines stay in the order they are in today: the
   * LAST verdict compared before the write is the one that decides it.
   */
  eq(branch.split('enabled: false').length - 1, 1, 'exactly one place in this branch switches a group off');
  const disabling = branch.slice(0, branch.indexOf('enabled: false'));
  /* EVERY comparison, `!==` included. Written as `=== 'cannot-post'` only,
     this passed a tree where the guard had become `!== 'can-post'` — which
     switches a group off on "could not tell", which is the verdict a Facebook
     redesign produces. That mutation is the whole reason this file exists. */
  const verdicts = disabling.match(/verdict\s*[=!]==\s*'[a-z-]+'/g) ?? [];
  ok(verdicts.length > 0, 'the switch-off is guarded by a verdict at all');
  eq(verdicts[verdicts.length - 1], "verdict === 'cannot-post'", 'and the test it is guarded by is EQUALS the certain verdict — not "anything but can-post", which would retire a group on "could not tell"');

  /* The blast radius. */
  ok(/LEFT_AFTER_VERIFY_CAP/.test(branch), 'one run may only switch off so many groups — the cap is consulted in the branch');
  /* And the cap's own branch is still about the certain verdict. Without this
     the "we stopped switching groups off" sentence lands on a group that reads
     perfectly well, once the cap has been reached by other groups. */
  ok(/verdict === 'cannot-post' && \(state\.leftAfterVerify \?\? 0\) >= LEFT_AFTER_VERIFY_CAP/.test(branch), 'the cap only ever holds back a CONFIRMED refusal — it never speaks for a group that reads fine');
  ok(/const LEFT_AFTER_VERIFY_CAP = \d+;/.test(worker), 'and the cap is a number in this file, not a guess at the call site');
  const capAt = branch.indexOf('>= LEFT_AFTER_VERIFY_CAP');
  ok(capAt > 0, 'the cap is compared in this branch, not merely declared somewhere');
  ok(branch.indexOf('enabled: false') > capAt, 'and it is compared BEFORE this branch switches anything off');
  ok(/leftAfterVerify = \(state\.leftAfterVerify \?\? 0\) \+ 1/.test(worker), 'each switch-off is counted, or the cap never arrives');

  /* The owner is told, by name, every time — never a number that moved on its
     own. */
  ok(/logActivity\('warn', 'target_left'/.test(branch), 'and the owner is told which group was switched off, in the activity log');

  /* THE ADDRESS IS PARSED AT THE CALL SITE. verifyCanPost takes a page
     carrying his live Facebook session; social_targets.url is a column. */
  const helper = worker.slice(worker.indexOf('async function reverifyPosting'));
  ok(/parseGroupUrl\(target\.url\)/.test(helper.slice(0, 500)), 'the re-verification parses the address before opening a page with it');
  ok(helper.indexOf('parseGroupUrl') < helper.indexOf('session.newPage'), 'before the browser page exists, not after');
  ok(/verifyCanPost\(p, group\.url\)/.test(helper), 'and it is the PARSED address that is opened, never the raw column');
  ok(/REVERIFY_BUDGET_MS/.test(helper) && /const REVERIFY_BUDGET_MS = /.test(worker), 'a verification that hangs cannot hold the queue — it is raced against a clock');
  ok(/page\?\.close\(\)/.test(helper), 'and the window is closed whatever happens, or the owner watches them pile up');

  /*
   * LEAVING THE REAL FACEBOOK GROUP IS NOT AUTOMATED, and this holds that
   * line: it is irreversible on his own account (a closed group can ask
   * questions, or an admin, to get back in), it would be driven by a reading
   * that is right most of the time rather than always, and the stated goal —
   * "שזה לא יעקב אותנו פעם הבאה" — is already met by a group that is off.
   */
  ok(!/(leaveGroup|leaveOneGroup|עזיבת הקבוצה)/.test(worker), 'nothing here leaves a Facebook group by itself — that stays his call');
}

async function run(): Promise<void> {
  theSignal();
  theBranch();
  const executablePath = findChromium();
  const browser = await chromium.launch({ headless: true, executablePath, args: ['--no-sandbox'] });
  try {
    await theVerification(browser);
  } finally {
    await browser.close();
  }
  console.log(`✓ reverify: ${checks} בדיקות עברו`);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
