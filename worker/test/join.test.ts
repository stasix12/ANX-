import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { chromium } from 'playwright-core';
import { GAP_MIN_MS, JOIN_RUN_CAP, joinGroups, joinOneGroup } from '../facebook/join';

/**
 * JOINING GROUPS — THE RULES THAT PROTECT THE ACCOUNT, DRIVEN IN A BROWSER.
 *
 * "תוסיף לי אופציה שאני יכול לסמן את הקבוצות האלה שאני לא נמצא בהם, ושהתוכנה
 *  תפתח קבוצה קבוצה ותצרתף אוטומטי."
 *
 * The feature itself is one click on a page. Everything that can go wrong with
 * it is about what happens AROUND that click, and all of it is here:
 *
 *   • a request that waits for an admin is NOT a membership, and must never be
 *     written down as one — a group in the publishing list that this account
 *     cannot post in yet is a round of failures with no cause on screen;
 *   • the first sign that Facebook is limiting US stops the whole run, not the
 *     current group;
 *   • a group that asks membership questions is handed back, never answered —
 *     those are his words about his business, and a machine inventing them is
 *     both a lie to the admin and the fastest way out of the group;
 *   • and the pacing is real. A knob that could disable it in production would
 *     be a worse bug than any this file was written to catch, so the default
 *     is pinned here.
 *
 *   npx tsx worker/test/join.test.ts
 */

const PAGE = (body: string, title = 'קבוצה | Facebook') =>
  `<!doctype html><html lang="he" dir="rtl"><head><meta charset="utf-8"><title>${title}</title></head>
<body><main>${body}</main></body></html>`;

/* A group page whose join control turns into `after` when it is pressed. */
const joinable = (after: string) =>
  PAGE(`<h1>קבוצת באר שבע</h1>
<div role="button" id="j" aria-label="הצטרפות לקבוצה">הצטרפות לקבוצה</div>
<script>
  document.getElementById('j').addEventListener('click', function () {
    this.setAttribute('aria-label', ${JSON.stringify(after)});
    this.textContent = ${JSON.stringify(after)};
  });
</script>`);

const PAGES: Record<string, string> = {
  /* Pressed, and the page says we are in. */
  joined: joinable('הצטרפת'),
  /* Pressed, and it is waiting for an admin. */
  pending: joinable('ממתין לאישור'),
  /* Already a member before we arrived — nothing is pressed. */
  already: PAGE('<h1>קבוצה</h1><div role="button" aria-label="הצטרפת">הצטרפת</div>'),
  /* Facebook refusing US. The run ends here. */
  blocked: PAGE('<h1>קבוצה</h1><p>אתם מוגבלים זמנית מהצטרפות לקבוצות.</p><div role="button" aria-label="הצטרפות לקבוצה">הצטרפות לקבוצה</div>'),
  /* The group wants answers before it lets anybody in. */
  questions: PAGE(`<h1>קבוצה</h1>
<div role="button" id="j" aria-label="הצטרפות לקבוצה">הצטרפות לקבוצה</div>
<script>
  document.getElementById('j').addEventListener('click', function () {
    const d = document.createElement('div');
    d.setAttribute('role', 'dialog');
    d.textContent = 'ענו על שאלות ההצטרפות של הקבוצה';
    document.body.appendChild(d);
  });
  /* Facebook's own dialogs close on Escape, and reproducing that is what makes
     the assertion below mean something: if the code stops pressing Escape the
     dialog stays, exactly as it would in production, where it would then
     swallow the next group's page. */
  document.addEventListener('keydown', function (e) {
    if (e.key === 'Escape') document.querySelectorAll('[role="dialog"]').forEach(function (n) { n.remove(); });
  });
</script>`),
  /* A group page with no join control at all. */
  none: PAGE('<h1>קבוצה סגורה</h1><p>אין כאן מה ללחוץ.</p>'),
  /* Pressed, and the page will not say. Must read as pending, never joined. */
  silent: PAGE('<h1>קבוצה</h1><div role="button" aria-label="הצטרפות לקבוצה">הצטרפות לקבוצה</div>'),
};

let checks = 0;
const eq = (a: unknown, b: unknown, what: string) => {
  checks += 1;
  assert.deepEqual(a, b, what);
};
const is = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};

/* ───────────────────────── the pacing is not negotiable ─────────────────── */
{
  const src = readFileSync(new URL('../facebook/join.ts', import.meta.url), 'utf8');
  /*
   * A MINUTE AT LEAST, AND NOT THE SAME MINUTE TWICE. The length is what keeps
   * the account; the jitter is what keeps it from looking like a machine, and
   * a fixed interval is the easiest signature in the world to match.
   */
  is(GAP_MIN_MS >= 60_000, `the gap between joins is ${GAP_MIN_MS}ms — under a minute is how an account gets limited`);
  is(/Math\.random\(\)/.test(src), 'and it is jittered, because a join every exactly-N-seconds is a signature');
  is(JOIN_RUN_CAP > 0 && JOIN_RUN_CAP <= 25, `one run joins at most ${JOIN_RUN_CAP} groups`);
  /* The test's own override may never become the default. */
  is(/hooks\.gapMs \?\? gap\(\)/.test(src), 'the real gap is the default and the override is the exception, not the other way round');
}

async function main(): Promise<void> {
  const browser = await chromium.launch({ executablePath: process.env.PLAYWRIGHT_CHROMIUM ?? '/opt/pw-browsers/chromium' });
  try {
    const page = await browser.newPage();
    await page.route('https://www.facebook.com/**', (route) => {
      const url = route.request().url();
      const which = Object.keys(PAGES).find((k) => url.includes(`/groups/${k}`));
      return route.fulfill({
        status: 200,
        contentType: 'text/html; charset=utf-8',
        body: which ? PAGES[which] : PAGE('<h1>?</h1>'),
      });
    });
    const at = (k: string) => `https://www.facebook.com/groups/${k}`;

    /* ───────────── one group at a time: every outcome it can have ───────── */
    eq((await joinOneGroup(page, at('joined'))).outcome, 'joined', 'a page that confirms the join reports it');
    eq((await joinOneGroup(page, at('pending'))).outcome, 'pending', 'a request waiting for an admin is PENDING, not joined');
    eq((await joinOneGroup(page, at('already'))).outcome, 'already', 'a group we were already in is not pressed at all');
    eq((await joinOneGroup(page, at('blocked'))).outcome, 'blocked', 'Facebook limiting US is read as a limit on us');
    eq((await joinOneGroup(page, at('none'))).outcome, 'no-button', 'a page with no join control says so rather than guessing');

    const q = await joinOneGroup(page, at('questions'));
    eq(q.outcome, 'questions', 'a group that asks questions is handed back to him');
    is(/ידנית/.test(q.detail), 'and the line says he has to answer them');
    /* THE DIALOG IS CLOSED. Left open it would swallow the next group's page,
       and the run would report nothing for every group after this one. */
    eq(await page.locator('[role="dialog"]').count(), 0, 'and the questions dialog is closed behind us');

    /*
     * THE ONE THAT MATTERS MOST. The button was pressed and the page will not
     * say what happened. Reporting "joined" here is how a group this account
     * is not in ends up in the publishing list.
     */
    eq((await joinOneGroup(page, at('silent'))).outcome, 'pending', 'pressed and unconfirmed is PENDING — never joined');

    /* ───────────── the run: what stops it, and what it leaves behind ───── */
    {
      const seen: string[] = [];
      const run = await joinGroups(page, [at('joined'), at('blocked'), at('pending')], {
        onEach: async (r) => void seen.push(r.outcome),
        gapMs: 0,
      });
      eq(run.stoppedBy, 'blocked', 'a limit stops the RUN, not just the group it happened on');
      eq(seen, ['joined', 'blocked'], 'and the third group is never opened');
      /* Written down as it happened, so a run cut short keeps what it did. */
      eq(run.results.length, 2, 'and what it did before stopping is reported, not lost');
    }

    {
      /* The owner can stop it, and it stops between groups rather than
         mid-click. */
      let stop = false;
      const seen: string[] = [];
      const run = await joinGroups(page, [at('joined'), at('pending'), at('joined')], {
        onEach: async (r) => {
          seen.push(r.outcome);
          stop = true;
        },
        stopped: () => stop,
        gapMs: 0,
      });
      eq(run.stoppedBy, 'stopped', 'the owner stopping it is its own ending');
      eq(seen.length, 1, 'and nothing is opened after he said stop');
    }

    {
      /* More than the cap: the extra are not attempted, and the caller is told
         so rather than being left to think it did all of them. */
      const many = Array.from({ length: JOIN_RUN_CAP + 3 }, () => at('already'));
      const run = await joinGroups(page, many, { onEach: async () => undefined, gapMs: 0 });
      eq(run.results.length, JOIN_RUN_CAP, `a run stops at ${JOIN_RUN_CAP} groups`);
      eq(run.stoppedBy, 'cap', 'and says that is why, so the screen can offer to continue');
    }

    {
      /* A group we were already in costs Facebook nothing, so it costs no gap
         either — otherwise a selection of fifteen already-joined groups would
         sit there for twenty minutes doing nothing. */
      const started = Date.now();
      await joinGroups(page, [at('already'), at('already'), at('already')], {
        onEach: async () => undefined,
        /* The REAL gap, deliberately: if these were paced this would take two
           minutes and the assertion below would catch it. */
      });
      is(Date.now() - started < 30_000, 'groups we were already in are not paced — there was nothing to pace');
    }

    await page.close();
  } finally {
    await browser.close();
  }

  console.log(`join tests OK — ${checks} assertions, driven in a browser`);
}

void main();
