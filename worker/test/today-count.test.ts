import assert from 'node:assert/strict';
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveQueueHero } from '../../src/components/social/LiveCampaignHero';
import { QuickCommentsCard } from '../../src/components/social/QuickCommentsCard';
import { addDaysISO, zonedDateISO, zonedToUtc } from '../../src/lib/social/time';
import { campaignHeadline, campaignState, runProgress } from '../../src/lib/social/campaign';

/**
 * "כל יום רק את הכמות פוסטים המתוזמנים לאותו היום ואז יתאפס."
 *
 * The daily bar measured publications against `maxPerDay` — the ceiling in
 * settings, a number he typed once that says nothing about today. "22 מתוך
 * 300" over a day holding 48 publications reads as 7% done when he is nearly
 * half way, and it never moves relative to anything he recognises.
 *
 * It now measures against WHAT TODAY HOLDS: what has gone out plus what is
 * still waiting before the next local midnight. Two properties fall out of
 * that definition rather than being enforced anywhere, and both are asserted
 * below because both are the request:
 *
 *   IT RESETS WITH NO JOB TO RESET IT. Tomorrow the boundary is tomorrow's and
 *   this morning's publications are no longer counted — there is no midnight
 *   task that could fail to run, and nothing to be stale.
 *
 *   IT CAN NEVER BE SMALLER THAN WHAT HAS ALREADY GONE OUT, because what has
 *   gone out is one of its two halves. The old denominator could be: lowering
 *   the cap in settings after publishing put the bar past its own end.
 *
 *   npx tsx worker/test/today-count.test.ts
 */

let checks = 0;
const is = (c: unknown, msg: string) => {
  checks += 1;
  assert.ok(c, msg);
};
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};

const card = (publishedToday: number, plannedToday: number, dailyTarget = 300): string =>
  renderToStaticMarkup(
    createElement(LiveQueueHero, {
      systemState: 'running',
      publishedToday,
      dailyTarget,
      plannedToday,
      pendingCancellable: 0,
      nextAt: null,
      nextTargetName: null,
      workerOnline: true,
    } as never),
  );

/* ───────── 1. the bar is about TODAY, not about the ceiling ───────────── */
{
  const html = card(22, 48);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  is(/22\s*\/\s*48/.test(text), `the ratio must be out of today's own total — got: ${text.slice(0, 160)}`);
  is(text.includes('מתוך המתוכננים להיום'), 'and must say that is what it is out of');
  /* THE CEILING IS NOT THE DENOMINATOR ANY MORE. Asserted on the ratio rather
     than on the page, because 300 is still legitimately named below — as the
     limit it is, which is all it was ever able to tell him. */
  is(!/22\s*\/\s*300/.test(text), 'the settings ceiling is no longer what the bar is measured against');
  is(text.includes('300'), 'but it is still stated, because it is still a real limit');

  /*
   * THE BAR AGREES WITH THE FIGURE ABOVE IT — one number, two drawings.
   *
   * Checked on the FILL'S WIDTH and not only on its label, and that distinction
   * caught a real hole: a mutation that pointed the bar back at the 300 while
   * leaving the label alone passed every other assertion here. The label is
   * what a screen reader is told; the width is what he sees. They are two
   * expressions and nothing but this line makes them say the same thing.
   */
  is(/aria-label="22 מתוך 48[^"]*"/.test(html), `the bar's own label must say the same thing — got: ${(html.match(/aria-label="[^"]*מתוך[^"]*"/) ?? [])[0]}`);
  const fill = Number((html.match(/width:\s*([\d.]+)%/) ?? [])[1]);
  is(Math.abs(fill - (22 / 48) * 100) < 0.5, `the bar must be filled to 22 of 48 (${(22 / 48 * 100).toFixed(1)}%), not to 22 of the ceiling — got ${fill}%`);
}

/* ───────── 2. nothing today is a sentence, not a bar out of zero ───────── */
{
  const html = card(0, 0);
  const text = html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ');
  is(text.includes('אין פרסומים מתוכננים להיום'), 'a day with nothing in it says so');
  /*
   * AND DRAWS NO BAR. A ratio out of zero is a bar that is either empty or
   * full depending on how the division is written, and neither is a fact —
   * ProgressBar's own Math.max(1, total) would have drawn an empty one, which
   * reads as "0 of something" on a day that has no something.
   */
  is(!/role="progressbar"/.test(html) && !/aria-label="0 מתוך 0/.test(html), 'and draws no progress bar at all');
}

/* ───────── 3. it cannot be smaller than what has gone out ─────────────── */
{
  /*
   * The old denominator could be. `maxPerDay` is editable at any moment, so
   * lowering it after a busy morning put the figure past the end of its own
   * bar — "48 / 20". The new one is published + waiting, so the published half
   * is inside it by construction; this is the regression test for the day
   * somebody "optimises" it into a separate count.
   */
  const html = card(48, 48);
  is(/48\s*\/\s*48/.test(html.replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ')), 'a finished day reads as complete, not as overflowing');
  is(/aria-label="48 מתוך 48/.test(html), 'and the bar is full rather than past its end');
}

/* ───────── 4. "ואז יתאפס" — the boundary that makes it reset ──────────── */
{
  /*
   * THE RESET IS THE BOUNDARY, AND THE BOUNDARY IS A CALENDAR DATE IN THE
   * ZONE — not `now + 24h`.
   *
   * Israel's two clock changes make one day 23 hours long and another 25.
   * A 24-hour window would end an hour early on one of them and an hour late
   * on the other, so for one day a year "today" would silently include an hour
   * of tomorrow's publications, or drop an hour of its own.
   */
  const TZ = 'Asia/Jerusalem';
  const nextMidnight = (iso: string) => zonedToUtc(addDaysISO(zonedDateISO(new Date(iso), TZ), 1), '00:00', TZ);

  /* An ordinary day: midnight is midnight. */
  eq(
    nextMidnight('2026-10-06T14:01:00+03:00').toISOString(),
    new Date('2026-10-07T00:00:00+03:00').toISOString(),
    'the day ends at the next local midnight',
  );
  /* 25.10.2026, the Sunday Israel goes back to +02:00 at 02:00 — a 25-hour
     day. The boundary is still that date's midnight, not 24 hours later. */
  const dstBack = nextMidnight('2026-10-25T14:00:00+02:00');
  eq(dstBack.toISOString(), new Date('2026-10-26T00:00:00+02:00').toISOString(), 'and on the 25-hour day it is still midnight');
  is(
    dstBack.getTime() - new Date('2026-10-25T14:00:00+02:00').getTime() !== 24 * 3_600_000,
    'which is NOT what "now + 24h" would have given on that day',
  );
  /* 27.03.2026, the Friday the clock goes forward — a 23-hour day. */
  eq(
    nextMidnight('2026-03-27T14:00:00+03:00').toISOString(),
    new Date('2026-03-28T00:00:00+03:00').toISOString(),
    'and on the 23-hour day too',
  );

  /* AND IT MOVES. Two consecutive days do not share a boundary, which is the
     whole of "ואז יתאפס": nothing resets the counter, the window moves. */
  is(
    nextMidnight('2026-10-06T23:59:00+03:00').getTime() < nextMidnight('2026-10-07T00:01:00+03:00').getTime(),
    'a minute after midnight is counting a different day',
  );
}

/* ───────── 5. a repeating round is counted for today, and says so ──────── */
{
  /*
   * "מה זה ה-497 הזה?" — 219 groups and 497 rows, because a repeating round
   * plans the same groups again every day into the same campaign. That is
   * deliberate and was readable while a round ran once; with CHZARA on, the
   * total grows by a round a day for ever and the percentage beside it is a
   * percentage of a number that never ends.
   */
  const prog = { total: 219, published: 185, failed: 4, skipped: 0, scheduled: 30, running: 0, manual: 0, finished: 189 } as never;
  const today = runProgress(prog, true);
  const lifetime = runProgress(prog, false);

  /* THE FIGURES ARE THE SAME; WHAT CHANGES IS WHETHER THE SENTENCE SAYS WHAT
     THEY ARE ABOUT. A card printing today's numbers without "היום" over a
     campaign that has published three thousand times is the same fault this
     module keeps being fixed for. */
  is(today.handledLabel.includes('היום'), `a repeating round's progress says it is today's — got "${today.handledLabel}"`);
  is(!lifetime.handledLabel.includes('היום'), `and a round that runs once does not — got "${lifetime.handledLabel}"`);
  eq(today.handled, lifetime.handled, 'the arithmetic is untouched either way');
  eq(today.percent, lifetime.percent, 'and so is the percentage');

  /* The empty case has to say it too, or "אין פרסומים מתוכננים" on a repeating
     round reads as "this campaign is over" when it opens again tomorrow. */
  const none = { ...(prog as object), total: 0, published: 0, finished: 0, scheduled: 0, failed: 0 } as never;
  is(campaignHeadline({ progress: none, todayOnly: true } as never).includes('להיום'), 'an empty day on a repeating round is empty FOR TODAY, not over');
  is(!campaignHeadline({ progress: none, todayOnly: false } as never).includes('להיום'), 'and a one-off round with nothing in it is simply not scheduled');
}

/* ───────── 6. and the rows really are scoped, by the campaign's own flag ── */
{
  const client = readFileSyncStripped('src/lib/social/client.ts');
  is(/const todayOnly = readRepeat\(campaign\)\.enabled;/.test(client), 'the scope is decided by the campaign row, not guessed');
  is(
    /const list = todayOnly \? all\.filter\(\(r\) => zonedDateISO\(new Date\(r\.scheduled_at\)\) === todayISO\) : all;/.test(client),
    "a repeating round's rows are today's, and every other campaign keeps its whole history",
  );
  /* SCHEDULED, NOT PUBLISHED. The card answers "how is today's round going",
     and a row that belongs to today and has not gone out yet is part of that
     answer — scoping on published_at would drop every one of them. */
  is(!/published_at\)\) === todayISO/.test(client), 'scoped on when a row is DUE, not on when it published');
  /*
   * AND THE UNSCOPED ROWS TRAVEL WITH THEM. `lifetime: all` is not decoration:
   * without it everPublished is today's count again, and the quick-comments
   * strip disappears from the dashboard every midnight — see section 6b.
   */
  is(
    /campaignState\(list, campaign, \{ truncated, todayOnly, lifetime: all \}\)/.test(client),
    'the state carries the scope WITH the numbers, and the whole round’s rows alongside them',
  );
}

/* ───────── 6b. "today" and "ever" are two questions, answered apart ────── */
/*
 * "לאן נעלם המשבצת של התגובות מהירות?"
 *
 * The daily-repeat scope above is right for the counter on the card and wrong
 * for everything that asks "has this round published anything at all". The
 * quick-comments strip asked the scoped number, so from midnight until the
 * day's first publication every repeating round read as never having
 * published, and the card rendered nothing. It reappeared by itself at
 * lunchtime, which is why it went a week unreported.
 *
 * Executed against the real campaignState, on the shape that produced it: a
 * round at 11:55 whose rows for today are all still scheduled for 12:00, and
 * whose two hundred publications all happened yesterday.
 */
{
  const row = (id: string, day: string, status: string, publishedAt: string | null) =>
    ({
      id,
      status,
      scheduled_at: `${day}T12:00:00Z`,
      published_at: publishedAt,
      target: { id: `t${id}`, name: 'קבוצה', channel: 'facebook_group', image_url: null },
    }) as never;

  const yesterday = [row('a', '2026-10-06', 'published', '2026-10-06T12:04:00Z'), row('b', '2026-10-06', 'published', '2026-10-06T12:51:00Z')];
  const today = [row('c', '2026-10-07', 'scheduled', null), row('d', '2026-10-07', 'scheduled', null)];
  const all = [...yesterday, ...today];

  const scoped = campaignState(today, { status: 'active' }, { todayOnly: true, lifetime: all });
  eq(scoped.progress.published, 0, "TODAY nothing has gone out yet — which is true, and is what the campaign card must say");
  eq(scoped.done.length, 0, 'and today has no finished rows');
  eq(scoped.everPublished, 2, 'but the ROUND has published twice — the question the comment strip asks, and the one that used to be answered with the zero above');
  eq(scoped.lastPublishedAt, '2026-10-06T12:51:00Z', 'with the latest of them, newest first, whatever day it fell on');
  eq(scoped.lastPublishedChannel, 'facebook_group', 'and its channel, for the badge on the strip');

  /* A round that has genuinely never published still reads zero — the strip
     offers to add a comment, and a comment needs posts to land on. */
  const virgin = campaignState(today, { status: 'active' }, { todayOnly: true, lifetime: today });
  eq(virgin.everPublished, 0, 'a round that has never published is still absent from the strip');
  eq(virgin.lastPublishedAt, null, 'with no timestamp to sort it by');

  /* And a campaign that is not repeating needs no second list: the default is
     the rows themselves, so nothing has to remember to pass it. */
  const plain = campaignState(all, { status: 'active' });
  eq(plain.everPublished, 2, 'an unscoped campaign answers the same without being handed anything extra');
  eq(plain.progress.published, 2, 'and its two numbers agree, because there is only one scope');
}

/* ───────── 6c. the strip is today's, and it never vanishes ────────────── */
/*
 * "עכשיו בכרטיסייה הזאת להציע תגובות מהירות רק לקמפיינים שפורסמו באותו היום."
 *
 * Filtering to today makes EMPTY the ordinary morning state — every day, until
 * the day's first publication. A card that returns null on empty would then
 * stage the disappearance he already reported once, daily and by design. So the
 * two states are rendered here and both are checked: what is in the strip, and
 * that the card is still on the screen when the strip holds nothing.
 */
{
  const NOW = new Date('2026-09-25T12:00:00Z'); /* 15:00 in Israel */
  const camp = (id: string, name: string) => ({ id, name, service: '', city: '', language: 'he', status: 'active', notes: '' }) as never;
  const state = (ever: number, lastAt: string | null) =>
    ({
      progress: { total: 0, published: 0, failed: 0, skipped: 0, scheduled: 0, running: 0, manual: 0, finished: 0 },
      state: 'completed',
      truncated: false,
      todayOnly: true,
      startedAt: lastAt,
      everPublished: ever,
      lastPublishedAt: lastAt,
      lastPublishedChannel: lastAt ? 'facebook_group' : null,
      estimatedCompletionAt: null,
      nextAt: null,
      nextTargetName: null,
      nextChannel: null,
      upcoming: [],
      done: [],
      now: [],
    }) as never;

  const draw = (campaigns: unknown[], states: Record<string, unknown>) =>
    renderToStaticMarkup(
      createElement(QuickCommentsCard, {
        campaigns: campaigns as never,
        states: states as never,
        now: NOW,
        onComment: () => {},
      } as never),
    );

  /* A. published today → the strip has it, and the button is there. */
  {
    const html = draw([camp('a', 'סבב של היום')], { a: state(12, '2026-09-25T09:00:00Z') });
    is(html.includes('סבב של היום'), 'a round that published today is on the strip');
    is(html.includes('הוסף תגובה מהירה'), 'and the button that attaches a comment to it is there');
  }

  /* B. published only YESTERDAY → off the strip, and the card STAYS. */
  {
    const html = draw([camp('b', 'סבב של אתמול')], { b: state(12, '2026-09-24T12:00:00Z') });
    is(!html.includes('סבב של אתמול'), 'a round that published yesterday is not offered — the strip is about today');
    is(html.includes('תגובות מהירות'), 'but the CARD is still on the dashboard — returning null here is the disappearance he reported, restaged every morning');
    is(html.includes('עוד לא יצא פרסום היום'), 'and it says which silence this is');
    is(!html.includes('הוסף תגובה מהירה'), 'with no button, because there is nothing today to attach a comment to');
  }

  /* C. never published at all → a different sentence, not the same one. */
  {
    const html = draw([camp('c', 'סבב חדש')], { c: state(0, null) });
    is(html.includes('תגובות מהירות'), 'a brand-new account still sees the card');
    is(!html.includes('עוד לא יצא פרסום היום'), 'but not a sentence about today — there has never been a publication at all');
    is(html.includes('הפרסום הראשון'), 'it is told what will put something here');
  }

  /* D. and "today" is the LOCAL day, not the last twenty-four hours. A round
     published at 23:50 Israel time yesterday is yesterday's at 15:00 today,
     though it is barely fifteen hours old. */
  {
    const html = draw([camp('d', 'סבב של אמש')], { d: state(5, '2026-09-24T20:50:00Z') });
    is(!html.includes('סבב של אמש'), 'late last night is still last night — a now-24h window would call it today for another nine hours');
  }
  /* And the other side of that boundary: 00:05 this morning IS today. */
  {
    const html = draw([camp('e', 'סבב של חצות')], { e: state(5, '2026-09-24T21:05:00Z') });
    is(html.includes('סבב של חצות'), 'and five minutes past midnight is today, however few hours ago it was');
  }
}

/* ───────── 7. and the page really asks for that boundary ──────────────── */
{
  const page = readFileSyncStripped('src/app/social/page.tsx');
  is(
    /countWaitingWithin\(zonedToUtc\(addDaysISO\(zonedDateISO\(now\), 1\), '00:00'\)/.test(page),
    "the dashboard counts what is waiting before the next LOCAL midnight — a `now + 24h` here is the one-day-a-year bug above",
  );
  is(/plannedToday: today \+ waitingToday/.test(page), 'and today holds what went out plus what is still to go');
}

function readSyncStrip(file: string): string {
  return require('node:fs')
    .readFileSync(new URL(`../../${file}`, import.meta.url), 'utf8')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
}
function readFileSyncStripped(file: string): string {
  return readSyncStrip(file);
}

console.log(`today's count OK — ${checks} assertions, rendered and across both clock changes`);
