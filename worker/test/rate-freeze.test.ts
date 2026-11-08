/*
 * ─── FACEBOOK SAID "TOO FAST": VERIFY TWICE, FREEZE THREE HOURS, COME BACK ─
 *
 * "ברגע שיש התראה כזאת, אתה נכנס לפייסבוק מאמת פעמיים שרשום שפייסבוק הגבילה
 *  את הפרסום למניעת ספאם, נותן צילום מסך של התקלה — ומקפיא את הפרסום למשך
 *  3 שעות — אחרי שנגמר 3 שעות חוזר לפרסם רגיל — ושיהיה גם טיימר במסך הראשי
 *  ליד כרטיסיית הקמפיין שזה סופר את ה-3 שעות בגלל המגבלה."
 *
 * WHAT THIS REPLACES, measured on his own account on 06/11: the answer to a
 * rate limit was a string on the running worker process. It stopped the queue
 * until somebody pressed "המשך" — four hours of a working day, 104
 * publications overdue, the oldest 51 minutes late — and closing the program
 * cleared it silently, so the queue went back to the pace that earned the
 * limit with nobody deciding.
 *
 * THE TWO HALVES THAT MATTER MOST ARE OPPOSITES, and both are here:
 *
 *   A FREEZE MUST BE EARNED. Three hours of a working day is a far bigger
 *   hammer than the one parked row this check used to produce, and the check
 *   HAS had a false positive in production (05/11, his account, a group he
 *   could post to by hand a minute later). So the notice is put to the page
 *   twice and both reads must see it.
 *
 *   AND IT MUST END BY ITSELF. An instant in the database, not a flag in
 *   memory: it survives the restart that used to wipe it, and the first tick
 *   past it lifts the freeze and publishes.
 *
 *   npx tsx worker/test/rate-freeze.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { CONFIRM_DELAY_MS, facebookSaidTooFastTwice } from '../facebook/rateLimit';
import { RATE_LIMIT_FREEZE_HOURS, RATE_LIMIT_FREEZE_MS } from '../../src/lib/social/types';

let checks = 0;
const is = (cond: unknown, claim: string) => {
  checks += 1;
  assert.ok(cond, claim);
};
const eq = (actual: unknown, expected: unknown, claim: string) => {
  checks += 1;
  assert.deepEqual(actual, expected, `${claim}\n  expected: ${JSON.stringify(expected)}\n  got     : ${JSON.stringify(actual)}`);
};

/* Verbatim from the owner's screenshot, 03/11 19:08. */
const REAL =
  'אנו מגבילים את התדירות שבה אפשר לפרסם, להגיב או לעשות דברים אחרים בפרק זמן נתון כדי לסייע בהגנה על הקהילה מפני ספאם. אפשר לנסות שוב מאוחר יותר. מידע נוסף';
const DRAFT = 'מציעים שירות ניקוי ספות בבאר שבע — התקשרו עכשיו לתיאום';

/* ─── §1 — the number, in one place ─────────────────────────────────────── */

{
  eq(RATE_LIMIT_FREEZE_HOURS, 3, 'the freeze he asked for is three hours');
  eq(RATE_LIMIT_FREEZE_MS, 3 * 3_600_000, 'and the milliseconds are derived from it, not typed out beside it');

  /*
   * AND NOBODY KEEPS THEIR OWN COPY. Three things have to agree about this
   * number — the machine that sets the freeze, the gate that holds the queue
   * behind it, and the countdown on the phone. A literal in one of them is
   * how a screen ends up counting down to an instant nothing is waiting for.
   */
  const worker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
  const code = worker.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  is(
    !/3\s*\*\s*3_?600_?000/.test(code) && !/10_?800_?000/.test(code),
    'the worker spends RATE_LIMIT_FREEZE_MS rather than three hours written out',
  );
  is(/RATE_LIMIT_FREEZE_MS/.test(code), 'and it really uses it');
}

/* ─── §2 — the second read, driven in a real browser ────────────────────── */

async function browserPass(): Promise<void> {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage();
    const mount = async (html: string) => {
      await page.setContent(`<!doctype html><html lang="he" dir="rtl"><body>${html}</body></html>`);
      return page.$('#composer');
    };
    /* Every pause is recorded instead of slept through: the test must be able
       to say the second read happened AFTER a wait, without spending it. */
    const waits: number[] = [];
    const pause = async (ms: number) => {
      waits.push(ms);
    };

    /* ── 2a. SEEN TWICE — the real thing, in the dialog the post was clicked
           in, still there a beat later. This is the only shape that may
           freeze the account. */
    {
      const composer = await mount(`
        <div id="composer" role="dialog" aria-label="צור פוסט">
          <div contenteditable="true">${DRAFT}</div>
          <div id="notice">${REAL}</div>
        </div>`);
      waits.length = 0;
      const seen = await facebookSaidTooFastTwice(page, composer, DRAFT, pause);
      is(seen !== null, "Facebook's own notice is found");
      eq(seen!.confirmed, true, 'and found AGAIN on the second read — this is what may freeze three hours of the day');
      is(seen!.notice.includes('מגבילים את התדירות'), `the sentence is carried, not a boolean — "${seen!.notice.slice(0, 40)}…"`);
      is(Boolean(seen!.secondNotice), 'and what the second read saw is carried too, for the log');
      eq(waits, [CONFIRM_DELAY_MS], 'with exactly one wait between the two reads, of the length this file declares');
      eq(seen!.draftHeld, true, 'and the draft is still in the box, so the post was visibly refused');
    }

    /* ── 2b. SEEN ONCE — the notice is gone by the second read. THIS IS THE
           05/11 SHAPE: something that matched for a moment. It must not
           freeze the account. */
    {
      const composer = await mount(`
        <div id="composer" role="dialog" aria-label="צור פוסט">
          <div contenteditable="true">${DRAFT}</div>
          <div id="notice">${REAL}</div>
        </div>`);
      waits.length = 0;
      /* The pause is where the page changes — exactly where a transient
         banner would go away in the real one. */
      const vanishing = async (ms: number) => {
        waits.push(ms);
        await page.evaluate(() => document.getElementById('notice')?.remove());
      };
      const seen = await facebookSaidTooFastTwice(page, composer, DRAFT, vanishing);
      is(seen !== null, 'the first sighting is still reported — the row is still parked and he is still told');
      eq(seen!.confirmed, false, 'A SIGHTING THAT DID NOT SURVIVE A SECOND LOOK MAY NOT STOP THE ACCOUNT');
      eq(seen!.secondNotice, null, 'and the log is told the second read found nothing');
    }

    /* ── 2c. AND AN ORDINARY PAGE IS STILL SILENT — including the group whose
           rules, moderation note and comments all match the pattern, which is
           the page that halted his business on 05/11. The second read must
           not be a second chance to get it wrong. */
    {
      const composer = await mount(`
        <div id="feed">
          <div>חוקי הקבוצה: אנו מגבילים את התדירות שבה אפשר לפרסם כדי לסייע בהגנה על הקהילה מפני ספאם.</div>
          <div>הפוסט הוסר על ידי מנהל כדי להגן על הקהילה מפני ספאם</div>
        </div>
        <div id="composer" role="dialog" aria-label="צור פוסט">
          <div contenteditable="true">${DRAFT}</div>
        </div>`);
      waits.length = 0;
      const seen = await facebookSaidTooFastTwice(page, composer, DRAFT, pause);
      eq(seen, null, 'THE 05/11 PAGE: a group whose own content matches still says nothing');
      eq(waits, [], 'and nothing is waited for — the second read is only ever a confirmation of a first');
    }
    await page.close();
  } finally {
    await browser.close();
  }
}

/* ─── §3 — the worker: who may freeze, and what lifts it ────────────────── */

const worker = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
const code = worker.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

{
  /*
   * ONLY A CONFIRMED SIGHTING WRITES THE FREEZE. The whole of §2 is worth
   * nothing if the worker writes `rateLimitedUntil` either way.
   */
  const branch = code.slice(code.indexOf("err.kind === 'rate_limited'"), code.indexOf("err.kind === 'cannot_post'"));
  is(branch.length > 400, 'the rate-limit branch is where this is decided, and this slice is it');
  is(/const confirmed = err\.rateLimit\?\.confirmed \?\? false;/.test(branch), 'it reads what the two reads saw off the error');
  const freeze = branch.slice(branch.indexOf('if (confirmed)'));
  is(freeze.includes('rateLimitedUntil'), 'and the freeze is written INSIDE the `if (confirmed)` — a single sighting writes nothing');
  is(
    (branch.match(/rateLimitedUntil: until\.toISOString\(\)/g) ?? []).length === 1,
    'exactly once, so there is no second path that freezes without confirmation',
  );
  /* AND THE SCREENSHOT REACHES THE FEED. The worker has saved one at the
     failing step all along; nothing carried it to the line he reads. */
  is(/screenshot: screenshot \?\? null/.test(branch), 'the picture of the error is attached to the activity line');
  /* AND THE SENTENCE FOLLOWS THE ROW. It used to end "הפוסט לא עלה לקבוצה"
     as a fixed string in a branch that may have just parked the row as
     "may already be live" — found live on 06/11, row acbe7be1. */
  is(/maybeLive \?/.test(branch), 'and what it says about the post follows the row’s own verdict, not a fixed string');
}

{
  /*
   * THE GATE, AND ITS ORDER. A deliberate pause is still read first — he
   * pressed that himself — and the freeze is read before the manual hold,
   * because while it stands it is the true answer to "למה לא מפרסם" and the
   * only one with an hour attached.
   */
  const paused = code.indexOf("if (control.paused) return idle(");
  const frozen = code.indexOf('if (control.rateLimitedUntil) {');
  const manual = code.indexOf('if (state.attention) return idle(');
  is(paused > 0 && frozen > 0 && manual > 0, 'all three gates exist');
  is(paused < frozen, 'a pause the owner pressed is read first');
  is(frozen < manual, 'and the freeze before the manual hold, so the sentence carries the hour');

  /*
   * AND THE THAW. Cleared on the first tick past the instant — by whoever is
   * running then, because the process that set it may have been closed hours
   * ago — and the tick carries on to publish rather than waiting a cycle.
   */
  const gate = code.slice(frozen, manual);
  is(/left > 0/.test(gate), 'while the instant is ahead, the tick holds');
  is(/saveWorkerSetting\('control', \{ \.\.\.control, rateLimitedUntil: null \}\)/.test(gate), 'and past it, the freeze is cleared from the database');
  is(!/return idle/.test(gate.slice(gate.indexOf('saveWorkerSetting'))), 'and the tick does NOT return — it goes on and publishes on the same pass');
  is(/state\.freezeHold/.test(gate), 'the banner the freeze raised is taken down with it');
  is(/rate_limit_cleared/.test(gate), 'and the thaw is written down, so an owner can see why it came back');
  /*
   * AND IT DOES NOT TOUCH THE "once per episode" LATCH, which is cleared in
   * exactly one place — the tick that reaches real work — and
   * worker/test/hold-reason.test.ts refuses a second. This tick falls through
   * to that place, so the latch is cleared anyway; the thaw's own event is
   * what carries the news, and no latch can swallow it.
   */
  is(!/state\.idleNoticeShown/.test(gate), 'and it leaves the "once per episode" latch alone — there is exactly one place that clears it');
}

{
  /*
   * THE HOLD IS NOT IN MEMORY ANY MORE, and that is the fix. A field on the
   * running process is cleared by closing the program — which is exactly what
   * somebody does when they see that nothing is publishing.
   */
  is(
    !/state\.attention = 'פייסבוק הגביל את קצב הפרסום של החשבון ולא קיבל את הפוסט/.test(code),
    'THE OLD BEHAVIOUR IS GONE: an indefinite in-memory hold that only a button could clear',
  );
  is(/freezeHold: false/.test(code), 'and the worker starts with no freeze banner of its own');
}

/* ─── §4 — the countdown on the campaign card, in a real browser ────────── */

async function cardPass(): Promise<void> {
  const { build } = await import('esbuild');
  const { copyFileSync, mkdtempSync, readdirSync, statSync, writeFileSync } = await import('node:fs');
  const { tmpdir } = await import('node:os');
  const path = (await import('node:path')).default;

  const CHUNKS = path.resolve('.next/static/chunks');
  let best: { file: string; size: number } | null = null;
  try {
    for (const name of readdirSync(CHUNKS)) {
      if (!name.endsWith('.css')) continue;
      const file = path.join(CHUNKS, name);
      const size = statSync(file).size;
      if (!best || size > best.size) best = { file, size };
    }
  } catch {
    best = null;
  }
  if (!best) {
    console.log('  (the card countdown was SKIPPED — run `npm run build` first so the real stylesheet exists)');
    return;
  }
  const dir = mkdtempSync(path.join(tmpdir(), 'frozen-'));
  copyFileSync(best.file, path.join(dir, 'app.css'));
  await build({
    entryPoints: [path.resolve('worker/test/mount-frozen.tsx')],
    outfile: path.join(dir, 'frozen.js'),
    bundle: true,
    format: 'iife',
    jsx: 'automatic',
    define: { 'process.env.NODE_ENV': '"production"' },
    banner: { js: 'globalThis.process = globalThis.process || { env: { NODE_ENV: "production" } };' },
    alias: { '@': path.resolve('src') },
    logLevel: 'silent',
  });
  writeFileSync(
    path.join(dir, 'index.html'),
    `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div class="social-theme"><div id="root"></div></div><script src="frozen.js"></script></body></html>`,
  );

  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage({ viewport: { width: 390, height: 844 } });
    const crashes: string[] = [];
    page.on('pageerror', (e) => crashes.push(String(e)));
    await page.goto(`file://${path.join(dir, 'index.html')}`);
    await page.waitForSelector('[data-next-wait]');
    const line = () => page.textContent('[data-next-wait]').then((t) => (t ?? '').replace(/\s+/g, ' ').trim());

    /* ── NOT FROZEN: the slot is due, and the card says so. This is the
           sentence his screen showed over a queue Facebook had stopped. */
    is((await line()).includes('אמור לצאת עכשיו'), `before the freeze the card reads the slot — "${await line()}"`);
    eq(await page.locator('[data-frozen]').count(), 0, 'and there is no countdown, because nothing is frozen');

    /* ── FROZEN: three hours out. */
    await page.evaluate((ms) => window.__freeze(new Date(Date.now() + ms).toISOString()), RATE_LIMIT_FREEZE_MS);
    await page.waitForTimeout(150);
    const frozen = await line();
    is(frozen.includes('מוקפא'), `the card says it is frozen — "${frozen}"`);
    is(
      !frozen.includes('אמור לצאת עכשיו'),
      'AND THE PROMISE IS GONE: a card cannot say a publication is going out now over an account that cannot publish',
    );
    /* PARSED, not pattern-matched: the claim is "three hours", and a regex
       that accepts 3:00:00 also accepts 3:00:00 printed for ever. */
    const clock = /(\d+):(\d\d):(\d\d)/.exec(frozen);
    is(clock !== null, `and it prints a clock — "${frozen}"`);
    const secondsLeft = Number(clock![1]) * 3600 + Number(clock![2]) * 60 + Number(clock![3]);
    is(
      secondsLeft > RATE_LIMIT_FREEZE_MS / 1000 - 60 && secondsLeft <= RATE_LIMIT_FREEZE_MS / 1000,
      `and it is counting the three hours themselves — ${secondsLeft}s left of ${RATE_LIMIT_FREEZE_MS / 1000}`,
    );
    is(
      ((await page.textContent('[data-frozen-why]')) ?? '').includes('פייסבוק הגבילה'),
      'with the reason under it — a timer with no cause beside it is a machine that stopped for no stated reason',
    );

    /* ── AND IT REALLY MOVES. A countdown rendered once and left is the bug
           this card has had before; one second apart, the two readings must
           differ. */
    const first = await line();
    await page.waitForTimeout(1300);
    const second = await line();
    is(first !== second, `the counter is live — "${first}" → "${second}"`);

    /* ── AND IT ENDS BY ITSELF, which is the whole promise: an instant that
           has passed is not a freeze, and the card goes back to the slot
           without anybody pressing anything. */
    await page.evaluate(() => window.__freeze(new Date(Date.now() - 1000).toISOString()));
    await page.waitForTimeout(150);
    const after = await line();
    is(!after.includes('מוקפא'), `once the instant passes the countdown is gone — "${after}"`);
    is(after.includes('אמור לצאת עכשיו'), 'and the slot speaks again, with nothing pressed');
    eq(await page.locator('[data-frozen-why]').count(), 0, 'and the reason goes with it');

    eq(crashes, [], 'the card threw');
    await page.close();
  } finally {
    await browser.close();
  }
}

/*
 * ─── AND A WAY OUT OF IT, WHERE THE OWNER IS LOOKING ──────────────────────
 *
 * "תן לי אופציה לעצור את ההשהיה בתוכנה איפה שהחלון הכתום, התחברתי דרך משתמש
 *  אחר" — 08.11.2026.
 *
 * The freeze is a fact about ONE Facebook account. Sign in as somebody else
 * and it describes a restriction nobody is under, while the queue stays shut.
 * The only exit was a link on the settings screen, two taps from the orange
 * card that announces it.
 *
 * THREE THINGS ARE PINNED, and the third is the one that matters most:
 *   1. the orange card carries the action;
 *   2. both screens clear the hold through ONE writer, so they cannot drift
 *      into two meanings of "cleared";
 *   3. that writer MERGES onto a fresh read. Writing a whole `control` object
 *      would carry a stale `paused` with it — the same defect setPaused() and
 *      the settings save are both shaped to avoid, on the one row that can
 *      stop this product dead.
 */
function manualExitPass(): void {
  const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
  const dash = src('../../src/app/social/page.tsx');
  const settings = src('../../src/app/social/settings/page.tsx');
  const client = src('../../src/lib/social/client.ts');

  const bar = dash.slice(dash.indexOf('<AlertBar'), dash.indexOf('<SetupChecklist'));
  is(bar.length > 200, 'the Meta alert bar was located');
  is(/title="Meta ביקשה להאט"/.test(bar), 'the orange card still names the hold');
  is(/actionLabel="בטל את ההמתנה"/.test(bar), 'and now carries the way out, on the card itself');
  is(/onAction=\{\(\) => void endMetaHold\(\)\}/.test(bar), 'wired to a handler of its own');
  is(/busy=\{busy === 'meta-hold'\}/.test(bar), 'which reports itself while the write is in flight');

  const fn = dash.slice(dash.indexOf('async function endMetaHold'), dash.indexOf('async function act('));
  is(fn.length > 200, 'endMetaHold was located');
  is(/confirm\.ask\(/.test(fn), 'it ASKS first — clearing a hold by hand is how an owner walks back into it');
  is(/05:06/.test(fn) && /05:08/.test(fn), 'and the question carries the measured evidence, not a vague caution');
  is(/await act\('meta-hold', clearMetaHold/.test(fn), 'and the write goes through the shared writer');

  /* ONE WRITER, TWO SCREENS. */
  is(/export async function clearMetaHold\(\)/.test(client), 'the writer lives in client.ts');
  is(/const control = await getControl\(\);[\s\S]{0,120}\.\.\.control, rateLimitedUntil: null/.test(client),
    'and it re-reads the row and MERGES — a whole-object write would carry a stale `paused` onto the row that stops the product');
  is(/await clearMetaHold\(\)/.test(settings), 'the settings screen clears it through the same writer');
  is(!/saveSetting\('control', \{ \.\.\.current, rateLimitedUntil: null \}\)/.test(settings),
    'and no longer types out its own copy of that read-merge-write');
}

async function main(): Promise<void> {
  await browserPass();
  await cardPass();
  manualExitPass();
  console.log(`rate-limit freeze OK — ${checks} assertions`);
}

void main();
