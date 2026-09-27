/*
 * THE BUG THE OWNER REPORTED, AS A TEST.
 *
 *   "יש תקלה, שאני בא לפרסם סבב פוסטים, במקום זה הוא מפרסם תגובה
 *    על הפוסט שכבר פירסמתי"
 *
 * Their screen at the time: posts queued at 14:15, 14:16, 14:17, 14:18 — one a
 * minute, 214 more behind them — and 54 group comments waiting. One browser
 * serves both.
 *
 * The guard that decided whether a chore could start asked "is a row due at
 * this instant". At 14:15:40, ten seconds after a post went out, the 14:16 row
 * is not due at this instant. So a comment started, and a comment on a post
 * whose address is not stored hunts three pages of a group for the post's own
 * words: minutes, holding the browser. 14:16 came and went, and 14:17.
 *
 * Every case below is that arithmetic. The first group is the bug itself: the
 * exact clock readings from that screenshot.
 */
import assert from 'node:assert/strict';
import { CHORE_NEEDS_MS, choreFits, roomBeforeNextPublish } from '../chore-window';

let checks = 0;
const is = (cond: unknown, msg: string) => { checks += 1; assert.ok(cond, msg); };
const eq = (a: unknown, b: unknown, msg: string) => { checks += 1; assert.equal(a, b, msg); };

const T = (hhmmss: string) => Date.parse(`2026-09-27T${hhmmss}.000Z`);
const open = { open: true, nextAt: null };
const sec = (ms: number) => Math.round(ms / 1000);

/* ---------------------------------------------- the reported bug, exactly */
{
  /* 14:15:40. The 14:15 post has gone out. The next is at 14:16. */
  const now = T('14:15:40');
  const room = roomBeforeNextPublish({ nextScheduledAt: '2026-09-27T14:16:00.000Z', gate: open, now });
  eq(sec(room), 20, 'twenty seconds of browser time before the next post — which is the whole truth the old guard could not see');
  is(!choreFits(room, CHORE_NEEDS_MS.commentKnown), 'so even the CHEAP comment must not start');
  is(!choreFits(room, CHORE_NEEDS_MS.commentHunt), 'and the one that hunts for the post — minutes long — certainly must not');
  is(!choreFits(room, CHORE_NEEDS_MS.addresses), 'nor the address lookup that used to take this window every time');
  is(!choreFits(room, CHORE_NEEDS_MS.metrics), 'nor the metrics read that scrolls a feed twenty times');
}
{
  /* The instant the old guard was wrong about, stated on its own: the row is
     not due, so "is anything due" said no, and the chore took the slot. */
  const now = T('14:15:50');
  const room = roomBeforeNextPublish({ nextScheduledAt: '2026-09-27T14:16:00.000Z', gate: open, now });
  is(room > 0, 'the post is not due yet — this is exactly the answer the old guard gave');
  is(!choreFits(room, CHORE_NEEDS_MS.commentKnown), 'and it is still not a window anything may be started in');
}
{
  /* A whole minute of queue, walked second by second. Not one instant in it
     may admit a chore, because a chore is longer than the gap. */
  let admitted = 0;
  for (let t = 0; t < 60; t += 1) {
    const room = roomBeforeNextPublish({
      nextScheduledAt: '2026-09-27T14:16:00.000Z',
      gate: open,
      now: T('14:15:00') + t * 1000,
    });
    if (choreFits(room, CHORE_NEEDS_MS.commentKnown)) admitted += 1;
  }
  /* t=0..15 inclusive: room 60s down to 45s. From :16 on, nothing fits — and
     the first sixteen seconds of a minute are the seconds right after the
     PREVIOUS post went out, when the browser is still finishing with it. */
  eq(admitted, 16, 'on a one-minute queue only the opening sixteen seconds can hold a 45s comment, and those are the seconds the previous publication is still using');
}

/* ----------------------------------- the other half: windows that ARE free */
{
  /* The round has finished. Nothing is queued. This is what the feature was
     built for and it must not be collateral damage of the fix. */
  const room = roomBeforeNextPublish({ nextScheduledAt: null, gate: open, now: T('14:15:40') });
  eq(room, Number.POSITIVE_INFINITY, 'an empty publishing queue is unlimited browser time');
  for (const [name, needs] of Object.entries(CHORE_NEEDS_MS)) {
    is(choreFits(room, needs), `${name} runs freely when there is nothing to publish`);
  }
}
{
  /*
   * A LONG GAP, AND THIS IS A SECOND BUG FIXED IN THE SAME PLACE.
   *
   * A row is due but the spacing gap holds it until 14:20. The worker used to
   * return here and do nothing at all for four minutes — with 54 comments
   * waiting — because the gap was treated as "busy" rather than as the empty
   * window it is.
   */
  const now = T('14:16:00');
  const room = roomBeforeNextPublish({
    nextScheduledAt: '2026-09-27T14:15:00.000Z',
    gate: { open: false, nextAt: '2026-09-27T14:20:00.000Z' },
    now,
  });
  eq(sec(room), 240, 'a four-minute gap is four minutes of free browser, not four minutes of waiting');
  is(choreFits(room, CHORE_NEEDS_MS.commentKnown), 'the comments may use it');
  is(choreFits(room, CHORE_NEEDS_MS.commentHunt), 'including one that has to hunt for the post');
  /* Four minutes is also enough to stop and restart the program — the engine
     waits thirty seconds before coming back up. In the twenty-second window of
     a one-minute queue it is not, which is the case that matters. */
  is(choreFits(room, CHORE_NEEDS_MS.restart), 'and a four-minute gap is even long enough to pick up a new version');
  is(!choreFits(roomBeforeNextPublish({ nextScheduledAt: '2026-09-27T14:16:00.000Z', gate: open, now: T('14:15:40') }), CHORE_NEEDS_MS.restart),
    'while twenty seconds between posts is not — a restart must never land on a publication');
}
{
  /* The later clock wins. A row scheduled after the gap reopens is bound by
     its own time, not by the gap. */
  const room = roomBeforeNextPublish({
    nextScheduledAt: '2026-09-27T14:30:00.000Z',
    gate: { open: false, nextAt: '2026-09-27T14:20:00.000Z' },
    now: T('14:16:00'),
  });
  eq(sec(room), 840, 'fourteen minutes, from the row — not four, from the gap');
}
{
  /* And the other way round. */
  const room = roomBeforeNextPublish({
    nextScheduledAt: '2026-09-27T14:17:00.000Z',
    gate: { open: false, nextAt: '2026-09-27T14:25:00.000Z' },
    now: T('14:16:00'),
  });
  eq(sec(room), 540, 'nine minutes, from the gap — a row cannot publish before the gap lets it');
}

/* ------------------------------------------- not knowing means take nothing */
{
  eq(roomBeforeNextPublish({ nextScheduledAt: null, gate: open, unknown: true, now: T('14:16:00') }), 0,
    'a queue read that failed is not permission — it is a reason to leave the browser alone');
  eq(roomBeforeNextPublish({ nextScheduledAt: '2026-09-27T15:00:00.000Z', gate: { open: false, nextAt: null }, now: T('14:16:00') }), 0,
    'a gate that closed because ITS read failed cannot say when it reopens, so nothing may start');
  eq(roomBeforeNextPublish({ nextScheduledAt: 'not a date', gate: open, now: T('14:16:00') }), 0,
    'a corrupt timestamp reads as imminent, never as free time');
}
{
  /* A row already overdue: negative room, and the loop treats <= 0 as "stop
     looking at chores entirely". */
  const room = roomBeforeNextPublish({ nextScheduledAt: '2026-09-27T14:10:00.000Z', gate: open, now: T('14:16:00') });
  is(room < 0, 'an overdue row leaves no room at all');
  is(!choreFits(room, 0), 'and nothing is allowed to start, not even something that claims to cost nothing');
}

/* ------------------------------------------------------ the budgets agree */
{
  is(CHORE_NEEDS_MS.commentHunt > CHORE_NEEDS_MS.commentKnown * 4,
    'hunting for a post must be budgeted far above a comment on a known address, or the split does nothing');
  for (const [name, ms] of Object.entries(CHORE_NEEDS_MS)) {
    is(ms > 0 && ms <= 10 * 60_000, `${name} has a budget that is a real number of seconds`);
  }
  is(CHORE_NEEDS_MS.restart >= CHORE_NEEDS_MS.metrics,
    'restarting the program is at least as disruptive as the longest chore');
}

/* choreFits is the same rule everywhere, Infinity included. */
{
  is(choreFits(Number.POSITIVE_INFINITY, CHORE_NEEDS_MS.commentHunt), 'unlimited room fits anything');
  is(choreFits(45_000, 45_000), 'exactly enough is enough');
  is(!choreFits(44_999, 45_000), 'a millisecond short is short');
}

console.log(`chore window tests OK — ${checks} assertions`);
