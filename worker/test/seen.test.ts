import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * "תמחק את ההתראות הכתומות האלה זה סתם מלחיץ."
 *
 * ─── WHAT THIS FILE USED TO HOLD, AND WHY IT HOLDS THE OPPOSITE ──────────
 *
 * It tested a DISMISSAL. The dashboard carried an orange bar — "N פרסומים
 * ממתינים לכם" — over rows that move only when a person moves them, and
 * because nothing released them on its own the bar was permanent: looked at,
 * understood, left alone deliberately, and repeated on every load. So it was
 * given a way to be answered, first by remembering a set of ids and then, when
 * that broke at 347 waiting rows, by remembering an instant (lib/social/seen.ts).
 *
 * Both of those were fixes to the wrong half. The bar's own body said what the
 * ladder in page.tsx said in a comment: these rows stop nothing. "הם לא עוצרים
 * את התזמון — שאר הפרסומים ממשיכים לצאת בזמן", printed under an amber headline
 * reading "נדרשת התערבות", on a screen whose system dot had gone amber for the
 * same reason. An alarm that explains it is not an alarm is one a person learns
 * to ignore — and then the three below it are ignored with it.
 *
 * THE RULE NOW: the orange state means NOTHING WILL MOVE UNTIL HE ACTS. Three
 * causes, all of them that. The two that stop nothing were removed along with
 * the bar, the watermark, the localStorage read and the count that fed them.
 *
 * AND NOT ONE FACT WENT WITH THEM, which is the other half of this file: the
 * rows keep their count on the "ממתינים היום" tile and their list behind the
 * history screen's 'ידניים' filter. A warning was deleted; nothing was hidden.
 */
let checks = 0;
const is = (actual: unknown, what: string): void => {
  checks += 1;
  assert.equal(actual, true, what);
};
const eq = (actual: unknown, expected: unknown, what: string): void => {
  checks += 1;
  assert.deepStrictEqual(actual, expected, what);
};

const page = readFileSync(new URL('../../src/app/social/page.tsx', import.meta.url), 'utf8');

/* ───────────────── the ladder: three causes, and only three ───────────── */
{
  const ladder = page.slice(page.indexOf('const systemState: SystemState'), page.indexOf("? 'needs_intervention'"));

  is(/\(!data\.workerOnline && summary\.queued > 0\)/.test(ladder), 'the PC being off with work queued still raises it — nothing publishes without that machine');
  is(/stalledSince/.test(ladder), 'and a publication already past due with nobody to take it');
  is(/data\.workerNeedsAuth/.test(ladder), "and Chrome sitting on a Facebook login, which stops the same machine a different way");

  /*
   * THE TWO THAT WENT. Both were in this ladder and neither stops the queue:
   * rules.ts releases rows by status and never looks at a row parked for a
   * person, so the rest of the queue publishes straight past them.
   */
  is(!/waitingForYou/.test(ladder), 'rows parked for a person no longer raise the orange state — they stop nothing, and the bar about them said so itself');
  is(!/data\.counts\.paused > 0/.test(ladder), 'nor do rows in a status no worker claims');

  /* Counted rather than listed: a fourth cause added without being thought
     about is exactly how this ladder grew to five. */
  eq(
    (ladder.match(/\|\|/g) ?? []).length,
    2,
    'the orange state has exactly three causes — a fourth was added without the ladder’s own comment being rewritten',
  );
}

/* ───────────────── the bar: three branches, none dismissible ──────────── */
{
  const bar = page.slice(page.indexOf('const intervention ='), page.indexOf('return (\n    <SocialShell'));

  for (const permanent of ['הפרסום עומד — המחשב לא מחובר', 'התוכנה במחשב לא פועלת', 'פייסבוק מבקשת אימות במחשב']) {
    is(bar.includes(permanent), `the bar for "${permanent}" is still built`);
  }
  is(!bar.includes('ממתין לכם'), 'the "N פרסומים ממתינים לכם" bar is gone');
  is(!bar.includes('פרסום אחד תקוע'), 'and so is the "N פרסומים תקועים" one');
  /*
   * NOTHING IS DISMISSIBLE ANY MORE, and that is now a property rather than an
   * omission: all three remaining warnings are about a machine that is not
   * working, and a machine does not stop being off because somebody read a
   * sentence. The one bar that could be dismissed was the one that has gone.
   */
  eq((bar.match(/onAction:/g) ?? []).length, 0, 'no warning offers a dismissal — the three that are left cannot be answered by reading them');
}

/* ───────────────── and the facts, which did not move ───────────────────── */
{
  is(
    page.includes('summary.needsHuman ? `${summary.needsHuman} דורשים אתכם`'),
    'the rows waiting on a person still carry their count on the "ממתינים היום" tile — the warning went, the fact did not',
  );
  /*
   * AND THE COUNT IS STILL A WAY IN. This is the half I got wrong the first
   * time and history-filters.test.ts caught: the orange bar was the ONLY
   * thing linking at ?status=needs_attention and ?status=paused, and both
   * buckets are hidden from the history screen's own filter bar on purpose.
   * Removing the bar left two filters nothing could reach.
   *
   * So each count now opens the rows it is counting — the sub-line and the
   * tap agree, which is more than the bar ever managed.
   */
  is(
    page.includes("summary.needsHuman && !(summary.automaticWaiting > data.waitingToday) ? '/social/history?status=needs_attention'"),
    'and the column opens those rows when its sub-line is about them',
  );
  is(
    page.includes("data.counts.paused ? '/social/history?status=paused'"),
    'and the stuck rows, which no worker ever claims, keep their own way in as well',
  );

  const history = readFileSync(new URL('../../src/app/social/history/page.tsx', import.meta.url), 'utf8');
  const groups = history.slice(history.indexOf('const STATUS_GROUPS'), history.indexOf('const RANGES'));
  const manual = groups.slice(groups.indexOf("value: 'manual'"));
  is(/statuses: NEEDS_HUMAN_STATUSES/.test(manual), "and the 'ידניים' filter still opens exactly those three statuses, from the one list in status.ts");
}

/* ───────────────── and the plumbing really went ────────────────────────── */
{
  const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
  is(!/waitingForYouSince/.test(client), 'the watermark-filtered count is gone from client.ts — it ran on every 30-second poll and fed nothing');
  is(!/readSeenUntil|writeSeenUntil/.test(page), 'and the dashboard no longer reads or writes a watermark');
  /* The module itself is deleted. Asserted by its absence from the one file
     that imported it rather than by a filesystem probe, which would pass on a
     typo in the path. */
  is(!/social\/seen'/.test(page), 'lib/social/seen.ts is not imported anywhere on the dashboard');
}

console.log(`orange-alert tests OK — ${checks} assertions`);
