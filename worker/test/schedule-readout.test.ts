import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scheduleReadout } from '../../src/lib/social/schedule-readout';
import { DEFAULT_CAMPAIGN_REPEAT, readRepeat, repeatColumns, MIN_REPEAT_HOURS, MAX_REPEAT_HOURS, type CampaignRepeat, type CampaignSchedule } from '../../src/lib/social/campaign-schedule';
import type { CampaignState } from '../../src/lib/social/campaign';

/**
 * WHAT A CARD MAY SAY ABOUT TIME — every state, decided without a browser.
 *
 * "הקמפיין פעיל, אמור לצאת כל יום מ-8 בבוקר עד 22 בלילה כל דקה. למה זה מראה לי
 *  שסבב פרסום מתחיל ב-22:00? מה זה כל הבאגים האלה של התזמונים! תעבור על הכל...
 *  ותסדר את הבעית שורש הזאת פעם אחת ולתמיד ובכל הקמפיינים שיש וגם בקמפיינים
 *  העתידים."
 *
 * THE ROOT CAUSE, AND WHY IT KEPT COMING BACK. Everything this product knows
 * about scheduling answers one question — "when would a row be allowed out" —
 * and two cards asked it independently about campaigns that had no rows. The
 * schedule cannot know the queue is empty, so it answered anyway: the dashboard
 * printed the window's closing time as the card's only number, over a round
 * with 219 of 219 handled, and the campaigns list printed "אין פרסום ממתין"
 * over publications that were waiting for a person.
 *
 * Neither was an arithmetic mistake, which is why three rounds of fixes to the
 * arithmetic did not stop it. The missing thing was a place where the question
 * BEFORE the arithmetic gets asked: is there anything to publish at all. That
 * place is schedule-readout.ts, and this file is the whole of its behaviour.
 *
 * NO BROWSER, ON PURPOSE. dashboard-hero.test.ts measures the drawing and it
 * costs a build and three viewports; the decision is a pure function over a
 * date, so every state and both clock changes are a millisecond each here. The
 * browser then checks that the card DRAWS what this file proves it is told.
 *
 *   npx tsx worker/test/schedule-readout.test.ts
 */

let checks = 0;
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};
const is = (c: unknown, msg: string) => {
  checks += 1;
  assert.ok(c, msg);
};

/* Israel ran on +03:00 from 02:00 on 27.03.2026 until 02:00 on 25.10.2026. The
   offset is written out rather than computed, so a helper cannot agree with a
   bug in the module it is testing. */
const at = (s: string): Date => new Date(`${s}${s >= '2026-03-27T02:00' && s < '2026-10-25T02:00' ? '+03:00' : '+02:00'}`);

/** HIS OWN SETTING, off the screenshot: Sunday–Thursday, 08:00–22:00. */
const ref: CampaignSchedule = { enabled: true, days: [0, 1, 2, 3, 4], start: '08:00', end: '22:00', gapSeconds: 60 };
const off: CampaignSchedule = { ...ref, enabled: false };
const noDays: CampaignSchedule = { ...ref, days: [] };

const prog = (o: Record<string, number> = {}) =>
  ({ total: 0, published: 0, failed: 0, skipped: 0, scheduled: 0, running: 0, manual: 0, finished: 0, ...o }) as never;

/** The slice of CampaignState the readout is allowed to see. */
const st = (
  state: CampaignState['state'],
  nextAt: string | null,
  extra: { manual?: number; lastPublished?: string; truncated?: boolean; channel?: string } = {},
) =>
  ({
    state,
    nextAt,
    nextChannel: extra.channel ?? 'facebook_group',
    truncated: extra.truncated ?? false,
    progress: prog({ manual: extra.manual ?? 0 }),
    done: extra.lastPublished ? [{ published_at: extra.lastPublished }] : [],
  }) as never;

/* ──────────── 1. HIS SCREEN. The one this whole file exists for. ───────── */
{
  /*
   * Tuesday 06.10.2026 at 10:12, inside 08:00–22:00, schedule ON, 219 of 219
   * handled. The card printed "חלון הפרסום פתוח עד: 22:00" and he read it as a
   * round starting at 22:00 — which is the only way to read a time on a card
   * about a campaign.
   *
   * THE WINDOW IS NOT WRONG. It is not an answer: nothing will publish at
   * 22:00, or at any other instant, because a finished round does not restart
   * itself. The readout must therefore name NO instant at all.
   */
  const now = at('2026-10-06T10:12');
  const r = scheduleReadout(ref, st('completed', null), now);
  eq(r, { kind: 'ended', stopped: false, repeats: false }, 'a finished round inside an open window must name no instant');

  /*
   * AND THE PROOF THAT IT IS THE ROUND, NOT THE CLOCK, THAT DECIDES. Same
   * schedule, same minute, same empty queue — only the run differs, and only
   * one of the two may print 22:00.
   */
  const live = scheduleReadout(ref, st('not_started', null), now);
  eq(live, { kind: 'window-open', until: at('2026-10-06T22:00').toISOString() }, 'a campaign that has not run yet may still be told when the window shuts');
  is(JSON.stringify(r) !== JSON.stringify(live), 'the run state is what separates them, and it does');
}

/* ──────────── 2. A queued publication is the only real instant ─────────── */
{
  const now = at('2026-10-06T10:12');
  /* Inside the window: the stored instant stands. */
  eq(
    scheduleReadout(ref, st('running', at('2026-10-06T10:20').toISOString()), now),
    { kind: 'due', at: at('2026-10-06T10:20').toISOString() },
    'a row due inside the window goes out when it says',
  );
  /*
   * OUTSIDE IT, THE CARD PRINTS WHAT THE ENGINE WILL DO, NOT WHAT THE ROW
   * SAYS. A row stamped 23:40 on a campaign that stops at 22:00 does not go out
   * at 23:40 — rules.ts defers it to 08:00 on the next chosen day, and a card
   * printing 23:40 is the screen contradicting the machine.
   */
  eq(
    scheduleReadout(ref, st('running', at('2026-10-06T23:40').toISOString()), now),
    { kind: 'due', at: at('2026-10-07T08:00').toISOString() },
    'a row stamped past the window is reported at the next legal moment',
  );
  /* A row whose instant has already passed publishes from NOW, not from the
     moment it missed. */
  eq(
    scheduleReadout(ref, st('running', at('2026-10-06T09:00').toISOString()), now),
    { kind: 'due', at: now.toISOString() },
    'a row that is overdue is reported as due now',
  );
  /* WITH THE SWITCH OFF THIS IS THE STORED INSTANT, UNCHANGED — off means the
     window is not enforced at all, so the queue really will do that. */
  eq(
    scheduleReadout(off, st('running', at('2026-10-06T23:40').toISOString()), now),
    { kind: 'due', at: at('2026-10-06T23:40').toISOString() },
    'with the schedule off, the stored instant is the truth',
  );
  /* And with no schedule at all. */
  eq(
    scheduleReadout(null, st('running', at('2026-10-06T23:40').toISOString()), now),
    { kind: 'due', at: at('2026-10-06T23:40').toISOString() },
    'a campaign with no schedule prints its queue as it stands',
  );
}

/* ──────────── 3. The gap between publications is the engine's ──────────── */
{
  /*
   * ONE MINUTE MEANS THE NEXT MINUTE. His setting is "כל דקה", and a row due
   * now, 20 seconds after the last publication, goes out when the gap closes —
   * the same arithmetic rules.ts applies before it releases the row.
   */
  const now = at('2026-10-06T10:12');
  const r = scheduleReadout(ref, st('running', now.toISOString(), { lastPublished: at('2026-10-06T10:11:40').toISOString() }), now);
  is(r.kind === 'due' && r.at === at('2026-10-06T10:12:40').toISOString(), 'the card waits out the gap the campaign is set to');
}

/* ──────────── 4. Held, ended, waiting — the states with no instant ─────── */
{
  const now = at('2026-10-06T10:12');
  /*
   * NO DAY CHOSEN. A row is queued and the schedule permits no day at all, so
   * it is held indefinitely — by design, since rules.ts defers and never
   * drops. The stored instant may NOT be printed over it.
   */
  eq(scheduleReadout(noDays, st('running', at('2026-10-06T10:20').toISOString()), now), { kind: 'no-day' }, 'a schedule with no day names no instant');
  /* Stopped by hand reads differently from finished, because it is. */
  eq(scheduleReadout(ref, st('stopped', null), now), { kind: 'ended', stopped: true, repeats: false }, 'a round he stopped says it was stopped');
  /*
   * WAITING ON A PERSON. Every window sentence called this "אין פרסום ממתין".
   * Seven publications were waiting; they were waiting for him.
   */
  eq(scheduleReadout(ref, st('needs_attention', null, { manual: 7 }), now), { kind: 'manual', waiting: 7 }, 'rows waiting for a person are named, and counted');
  /* Nothing queued, no schedule to describe: nothing is all there is to say. */
  eq(scheduleReadout(off, st('not_started', null), now), { kind: 'none' }, 'no queue and no schedule is "nothing"');
  eq(scheduleReadout(null, st('not_started', null), now), { kind: 'none' }, 'and so is no schedule at all');
}

/* ──────────── 5. The window's two edges, and which one is ahead ────────── */
{
  /* Friday is not one of his days, so the next window is Sunday's start. */
  eq(
    scheduleReadout(ref, st('not_started', null), at('2026-10-02T12:00')),
    { kind: 'window-next', opens: at('2026-10-04T08:00').toISOString() },
    'outside the window, the edge that matters is when it opens',
  );
  /*
   * AND INSIDE IT, THE EDGE AHEAD IS THE CLOSE. nextAllowedAt() answers "the
   * first permitted instant at or after now", and when now is permitted that
   * answer is NOW — which this card printed as "חלון הפרסום הבא: 17:12" at
   * 17:13, a minute that had gone.
   */
  const r = scheduleReadout(ref, st('not_started', null), at('2026-10-06T17:13'));
  eq(r, { kind: 'window-open', until: at('2026-10-06T22:00').toISOString() }, 'inside the window, the edge that matters is when it shuts');
  is(r.kind === 'window-open' && new Date(r.until) > at('2026-10-06T17:13'), 'and it is ahead of now, never the present minute');

  /* Both edges of the day: the minute it opens and the minute it closes are
     inside, so neither blanks the card for a minute. */
  is(scheduleReadout(ref, st('not_started', null), at('2026-10-06T08:00')).kind === 'window-open', 'the opening minute is inside the window');
  is(scheduleReadout(ref, st('not_started', null), at('2026-10-06T22:00')).kind === 'window-open', 'and so is the closing minute');
  is(scheduleReadout(ref, st('not_started', null), at('2026-10-06T22:01')).kind === 'window-next', 'a minute later it is the next window');
}

/* ──────────── 6. The two days a year the clock moves ───────────────────── */
{
  /* 25.10.2026 is the Sunday Israel goes back to +02:00 at 02:00, so that
     calendar day is 25 hours long. The window's edges are WALL CLOCK times
     resolved against the date in the zone, so they are 08:00 and 22:00 local
     on both sides of the change — which an offset in milliseconds gets wrong by
     an hour, once a year, on a day as likely as any other. */
  const r = scheduleReadout(ref, st('not_started', null), at('2026-10-25T10:00'));
  eq(r, { kind: 'window-open', until: at('2026-10-25T22:00').toISOString() }, 'the window closes at 22:00 local on the day the clock goes back');
  const spring = scheduleReadout(ref, st('not_started', null), at('2026-03-29T10:00'));
  eq(spring, { kind: 'window-open', until: at('2026-03-29T22:00').toISOString() }, 'and on a summer-time Sunday too');
}

/* ──────────── 7. THE RULE ITSELF, over every state at once ─────────────── */
{
  /*
   * NAME AN INSTANT ONLY WHEN SOMETHING WILL HAPPEN AT IT.
   *
   * Written as a sweep rather than as seven separate assertions, so a state
   * added to the union later is covered by it without anyone remembering to.
   * The three kinds that carry a time are the three in which something is
   * genuinely ahead; every other kind must carry none, and the type is what
   * makes "carry none" checkable — a shape with no instant field cannot print
   * one by accident.
   */
  const states: CampaignState['state'][] = ['not_started', 'running', 'paused', 'completed', 'stopped', 'needs_attention'];
  const schedules = [ref, off, noDays, null];
  const queues = [null, at('2026-10-06T10:20').toISOString(), at('2026-10-06T23:40').toISOString()];
  const clocks = ['2026-10-06T10:12', '2026-10-02T12:00', '2026-10-06T23:30', '2026-10-25T10:00'];
  /* Truncation is a dimension of the sweep and not a case beside it: the rule
     "no instant unless something happens at it" has to hold over a capped read
     as well, and that is exactly where the counts stop being trustworthy. */
  const caps = [false, true];
  let seen = 0;
  const kinds = new Set<string>();
  for (const s of states)
    for (const sc of schedules)
      for (const q of queues)
        for (const c of clocks)
        for (const cap of caps) {
          const r = scheduleReadout(sc, st(s, q, { manual: s === 'needs_attention' ? 3 : 0, truncated: cap }), at(c));
          seen += 1;
          kinds.add(r.kind);
          const carries = 'at' in r ? r.at : 'until' in r ? r.until : 'opens' in r ? r.opens : null;
          if (carries === null) continue;
          /* Every instant that IS printed must be a real one, and — for the two
             window kinds, which describe something still ahead — in the future.
             A 'due' row may be due now, which is the engine saying "go". */
          is(!Number.isNaN(new Date(carries).getTime()), `${s}/${c}: a printed instant must be a real date`);
          if (r.kind !== 'due') is(new Date(carries) > at(c), `${s}/${c}: ${r.kind} named ${carries}, which is not ahead of now`);
          /*
           * AND A ROUND THAT IS OVER MAY NEVER REACH THIS LINE — unless the
           * read was capped, in which case "over" is precisely the claim that
           * cannot be trusted and a row we can SEE outranks it. That exception
           * is the whole design of the truncation branch, so it is written
           * here rather than worked around.
           */
          if (!cap) is(s !== 'completed' && s !== 'stopped', `${s}: a round that has ended printed ${r.kind} = ${carries}`);
          is(s !== 'paused', `${s}: a paused round printed ${r.kind} = ${carries}`);
          /* A capped read may name an instant only when it is a row it can
             actually see — never one derived from a count it does not have. */
          if (cap) is(r.kind === 'due', `truncated/${s}: a capped read printed ${r.kind} = ${carries}`);
        }
  is(seen === states.length * schedules.length * queues.length * clocks.length * caps.length, 'the sweep covered every combination');
  is(kinds.size >= 6, `the sweep reached ${kinds.size} of the readout's shapes`);
}

/* ──────────── 8. CHZARA — a round that comes back on its own ───────────── */
{
  /*
   * "אותו פוסט לאותן קבוצות כל יום."
   *
   * With the repeat armed, "אין פרסום מתוזמן" becomes the wrong answer in the
   * other direction: another round IS coming, tomorrow morning, and a card
   * that said nothing was scheduled would be understating what his account is
   * about to do. The readout carries it so the card can say so in amber.
   */
  const now = at('2026-10-06T10:12');
  const on: CampaignRepeat = { enabled: true, minHours: 20 };
  eq(
    scheduleReadout(ref, st('completed', null), now, on),
    { kind: 'ended', stopped: false, repeats: true },
    'a finished round that repeats says another one is coming',
  );
  eq(
    scheduleReadout(ref, st('completed', null), now, DEFAULT_CAMPAIGN_REPEAT),
    { kind: 'ended', stopped: false, repeats: false },
    'and one that does not, does not — the default is off',
  );
  /*
   * A ROUND HE STOPPED DOES NOT COME BACK, whatever the switch says. Stopping
   * is him saying "not this"; a card answering "it runs again tomorrow" would
   * be the screen overruling the owner, which is worse than any wrong time.
   */
  eq(
    scheduleReadout(ref, st('stopped', null), now, on),
    { kind: 'ended', stopped: true, repeats: false },
    'a round he STOPPED does not repeat, even with the switch on',
  );
  /* And the switch changes nothing about any other state's answer. */
  for (const s of ['not_started', 'running'] as const) {
    eq(
      scheduleReadout(ref, st(s, null), now, on),
      scheduleReadout(ref, st(s, null), now, DEFAULT_CAMPAIGN_REPEAT),
      `the repeat switch does not change what a ${s} round says`,
    );
  }
}

/* ──────────── 9. reading and writing the two columns ───────────────────── */
{
  /* A DATABASE THAT HAS NOT RUN v25 READS "OFF", exactly like a campaign whose
     owner never pressed the switch. That equivalence is the whole backward-
     compatibility story: nothing an existing round does changes. */
  eq(readRepeat(null), DEFAULT_CAMPAIGN_REPEAT, 'no row at all reads as off');
  eq(readRepeat({}), DEFAULT_CAMPAIGN_REPEAT, 'a row without the columns reads as off');
  is(DEFAULT_CAMPAIGN_REPEAT.enabled === false, 'and the default is off, for every campaign that already exists');
  /* ONLY `true` IS ON. A string, a 1, a null — anything a loose read could
     turn into "yes" — must not switch on a feature that republishes. */
  for (const v of [1, 'true', 'yes', {}, [], null, undefined]) {
    is(readRepeat({ repeat_enabled: v } as never).enabled === false, `repeat_enabled = ${JSON.stringify(v)} is not "on"`);
  }
  is(readRepeat({ repeat_enabled: true } as never).enabled === true, 'and true is');

  /*
   * THE FLOOR IS ENFORCED ON THE WAY IN AND ON THE WAY OUT.
   *
   * Under twelve hours is not "daily": it is the same advertisement reaching
   * the same group twice in one publishing morning, which is the shape that
   * gets an account restricted fastest. The database has the same check — this
   * is the half that keeps a bad value from ever being sent.
   */
  eq(readRepeat({ repeat_min_hours: 1 } as never).minHours, MIN_REPEAT_HOURS, 'an hour is raised to the floor');
  eq(readRepeat({ repeat_min_hours: 0 } as never).minHours, MIN_REPEAT_HOURS, 'and so is zero');
  eq(readRepeat({ repeat_min_hours: -5 } as never).minHours, MIN_REPEAT_HOURS, 'and a negative');
  eq(readRepeat({ repeat_min_hours: 9999 } as never).minHours, MAX_REPEAT_HOURS, 'and a week is the ceiling');
  eq(readRepeat({ repeat_min_hours: 'x' } as never).minHours, DEFAULT_CAMPAIGN_REPEAT.minHours, 'and nonsense falls back to the default');
  eq(repeatColumns({ enabled: true, minHours: 2 }).repeat_min_hours, MIN_REPEAT_HOURS, 'and a write is clamped too, not only a read');
  eq(repeatColumns({ enabled: true, minHours: 20 }), { repeat_enabled: true, repeat_min_hours: 20 }, 'a legal value survives the round trip');
  /*
   * 20 AND NOT 24, and this is the arithmetic behind that choice: a round that
   * opens at 08:00 and takes four hours ends at 12:00, so a 24-hour rule holds
   * tomorrow's 08:00 row until noon, and the day after until 16:00 — walking
   * the round later every day until it falls out of the window and stops.
   */
  is(DEFAULT_CAMPAIGN_REPEAT.minHours < 24, 'the default interval is under a day, so a daily round keeps its hour');
  is(DEFAULT_CAMPAIGN_REPEAT.minHours >= MIN_REPEAT_HOURS, 'and is not under the floor');
}

/* ──────────── 10. a capped read, and the owner's own pause ─────────────── */
{
  const now = at('2026-10-06T10:12');
  /*
   * A CAPPED READ MAKES A ROUND LOOK MORE FINISHED THAN IT IS, in client.ts's
   * own words: campaignStates() reads ordered by scheduled_at ascending and
   * cuts at the ceiling, so what it drops is the rows that have not happened.
   * Every answer below 'due' is derived from that count, and all of them lean
   * the same way — so on a big enough round the card would announce "הסבב
   * הסתיים · אין פרסום מתוזמן" over a round still publishing.
   */
  eq(scheduleReadout(ref, st('completed', null, { truncated: true }), now), { kind: 'partial' }, 'a capped read may NOT claim the round ended');
  eq(scheduleReadout(ref, st('not_started', null, { truncated: true }), now), { kind: 'partial' }, 'nor may it answer from a count it does not have');
  eq(
    scheduleReadout(ref, st('needs_attention', null, { truncated: true, manual: 7 }), now),
    { kind: 'partial' },
    'nor count what is waiting',
  );
  /*
   * BUT A ROW IT CAN SEE IS A FACT, and nothing a cap drops makes it false.
   * Disabling the whole function on a capped read would throw away the one
   * answer that survives it.
   */
  const due = scheduleReadout(ref, st('running', at('2026-10-06T10:20').toISOString(), { truncated: true }), now);
  eq(due, { kind: 'due', at: at('2026-10-06T10:20').toISOString() }, 'a queued row survives a capped read');

  /*
   * AND THE OWNER'S OWN PAUSE. rules.ts hands every row of a paused round
   * straight back and pushes it forward again on each poll, so the stored
   * instant is not when it publishes — nothing publishes until he resumes. The
   * card printing it was a countdown to a moment that arrives and passes with
   * the queue untouched: the same fault as the 22:00, and harder to see,
   * because the time it shows is real and merely never happens.
   */
  eq(scheduleReadout(ref, st('paused', at('2026-10-06T10:20').toISOString()), now), { kind: 'paused' }, 'a paused round names no instant');
  eq(scheduleReadout(off, st('paused', at('2026-10-06T10:20').toISOString()), now), { kind: 'paused' }, 'with the schedule off too — the pause is what holds it');
  eq(scheduleReadout(ref, st('paused', null, { truncated: true }), now), { kind: 'paused' }, 'and a capped read does not hide it');
}

/* ──────────── 11. THE OTHER GAP — the account-wide one ─────────────────── */
{
  /*
   * "הפרש בין פוסטים: כל דקה · הבא בתור: היום, 10:13" — over an engine that
   * would not publish before 11:17.
   *
   * The campaign's gap is not the only floor. rules.ts:410-412 measures a
   * SECOND interval against the most recent publication of the WHOLE ACCOUNT —
   * limits.minGapMinutes, plus browser.groupMinGapMinutes for a group, 45 + 20
   * by default — and holds the row for whichever of the two is later. Nothing
   * in campaign-schedule.ts has ever heard of it, so the card printed the
   * smaller one.
   *
   * AND IT DOES NOT CORRECT ITSELF. worker/social-worker.ts:738-745: when that
   * gate is shut and the wait is longer than PREP_LEAD_MS the tick claims
   * nothing at all — rules.ts never runs, no deferral is written, and the
   * stored instant stays put. So the wrong minute is not on screen for one
   * poll; it is there for the whole gap.
   */
  const now = at('2026-10-07T10:12');
  const minute: CampaignSchedule = { ...ref, gapSeconds: 60 };
  const defaults = { minGapMinutes: 45, groupMinGapMinutes: 20, lastPublishedAt: at('2026-10-07T10:12').toISOString() };

  /* What the card said before: the campaign's minute, and nothing else. */
  eq(
    scheduleReadout(minute, st('running', at('2026-10-07T10:13').toISOString()), now, DEFAULT_CAMPAIGN_REPEAT),
    { kind: 'due', at: at('2026-10-07T10:13').toISOString() },
    'without the account rule the card prints the campaign gap alone — the old answer',
  );
  /* What the engine will actually do: 10:12 + 65 minutes. */
  eq(
    scheduleReadout(minute, st('running', at('2026-10-07T10:13').toISOString()), now, DEFAULT_CAMPAIGN_REPEAT, defaults),
    { kind: 'due', at: at('2026-10-07T11:17').toISOString() },
    'THE OWNER\'S "כל דקה": the account-wide floor is 65 minutes and the card must say so',
  );

  /* A PAGE IS NOT A GROUP. The surcharge is applied exactly where rules.ts
     applies it, so a page waits 45 minutes and not 65. */
  eq(
    scheduleReadout(minute, st('running', at('2026-10-07T10:13').toISOString(), { channel: 'facebook_page' }), now, DEFAULT_CAMPAIGN_REPEAT, defaults),
    { kind: 'due', at: at('2026-10-07T10:57').toISOString() },
    'a page target carries limits.minGapMinutes without the group surcharge',
  );
  /* An unknown channel takes the plain floor rather than the larger one:
     guessing upwards would hold a publication behind a rule that may not
     govern it. */
  eq(
    scheduleReadout(minute, st('running', at('2026-10-07T10:13').toISOString(), { channel: '' }), now, DEFAULT_CAMPAIGN_REPEAT, defaults),
    { kind: 'due', at: at('2026-10-07T10:57').toISOString() },
    'an unknown channel is not assumed to be a group',
  );

  /* THE LATER OF THE TWO, NOT THE ACCOUNT ONE. A campaign gap of three hours
     outranks a 65-minute account floor — the engine takes the max and so must
     the card. */
  const slow: CampaignSchedule = { ...ref, gapSeconds: 1800 };
  const r = scheduleReadout(slow, st('running', at('2026-10-07T13:00').toISOString()), now, DEFAULT_CAMPAIGN_REPEAT, defaults);
  eq(r, { kind: 'due', at: at('2026-10-07T13:00').toISOString() }, 'a stored instant beyond both floors is left alone');

  /*
   * AND THE WINDOW STILL APPLIES TO IT. An instant pushed past 22:00 by the
   * account gap has to roll to the next chosen day, exactly as it would for
   * any other reason — which is why the floor is folded into `from` rather
   * than maxed in afterwards.
   */
  const late = {
    minGapMinutes: 45,
    groupMinGapMinutes: 20,
    lastPublishedAt: at('2026-10-07T21:30').toISOString(),
  };
  eq(
    scheduleReadout(minute, st('running', at('2026-10-07T21:35').toISOString()), at('2026-10-07T21:35'), DEFAULT_CAMPAIGN_REPEAT, late),
    { kind: 'due', at: at('2026-10-08T08:00').toISOString() },
    'an account floor past the window rolls to the next chosen day, it does not land at 22:35',
  );

  /* NOTHING PUBLISHED YET — no floor at all, and certainly not one invented
     out of an epoch. A database that has never published must not have every
     card's instant pushed forward by an hour. */
  eq(
    scheduleReadout(minute, st('running', at('2026-10-07T10:13').toISOString()), now, DEFAULT_CAMPAIGN_REPEAT, { ...defaults, lastPublishedAt: null }),
    { kind: 'due', at: at('2026-10-07T10:13').toISOString() },
    'an account that has never published imposes no floor');
  eq(
    scheduleReadout(minute, st('running', at('2026-10-07T10:13').toISOString()), now, DEFAULT_CAMPAIGN_REPEAT, { ...defaults, minGapMinutes: 0, groupMinGapMinutes: 0 }),
    { kind: 'due', at: at('2026-10-07T10:13').toISOString() },
    'and neither does a gap of zero');

  /*
   * AND A LAST-PUBLISHED THAT CANNOT BE PARSED MUST NOT POISON THE ANSWER.
   * `Math.max(anything, NaN)` is NaN, and a NaN milliseconds reaches the card
   * as "Invalid Date" — a strip that has spent three versions learning not to
   * print a wrong time would print no time at all, which is worse. The column
   * is a timestamp and should never be garbage; "should never" is exactly the
   * assumption this file exists to stop relying on.
   */
  eq(
    scheduleReadout(minute, st('running', at('2026-10-07T10:13').toISOString()), now, DEFAULT_CAMPAIGN_REPEAT, { ...defaults, lastPublishedAt: 'not-a-date' }),
    { kind: 'due', at: at('2026-10-07T10:13').toISOString() },
    'an unparseable last-publication imposes no floor rather than an invalid one',
  );

  /* WITH THE CAMPAIGN SCHEDULE OFF IT STILL APPLIES. The window is what the
     switch turns off; the account rule is a different rule and the engine
     enforces it either way. */
  eq(
    scheduleReadout(off, st('running', at('2026-10-07T10:13').toISOString()), now, DEFAULT_CAMPAIGN_REPEAT, defaults),
    { kind: 'due', at: at('2026-10-07T11:17').toISOString() },
    'the account floor is not the campaign window and does not switch off with it',
  );
  /* And with no schedule at all. */
  eq(
    scheduleReadout(null, st('running', at('2026-10-07T10:13').toISOString()), now, DEFAULT_CAMPAIGN_REPEAT, defaults),
    { kind: 'due', at: at('2026-10-07T11:17').toISOString() },
    'nor with a campaign that has no schedule',
  );
}

/* ──────────── 12. CHZARA stays in step with the hours on the card ──────── */
{
  /*
   * THE WEEKLY ROW IS BUILT FROM THE DAYS AND THE START HOUR, at the moment
   * the switch is flipped — so changing the window afterwards has to re-arm it.
   *
   * Without that, the card reads "08:00 – 22:00" while the round it opens by
   * itself still fires at 13:30: the engine doing one thing and the screen
   * saying another, which is this file's whole subject wearing a different hat.
   * It is a wiring claim rather than an arithmetic one, so it is pinned on the
   * two screens that own the wiring — on comment-stripped source, so the
   * paragraph above cannot satisfy it.
   */
  const code = (f: string) =>
    readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
  for (const f of ['src/app/social/page.tsx', 'src/app/social/campaigns/page.tsx']) {
    const src = code(f);
    is(/if \(repeat\.enabled\) await setCampaignRepeat\(campaign, repeat, next\);/.test(src), `${f} re-arms the daily repeat when the hours change`);
    /* ONLY when it is on. Arming a weekly row from a change of hours would
       turn an edit into a recurrence he never asked for. */
    is(/const repeat = readRepeat\(campaign/.test(src), `${f} reads the repeat before deciding to, rather than assuming`);
  }
  /*
   * AND "סיים את הסבב ואפס את המונה" SAYS THAT IT ALSO SWITCHES OFF THE REPEAT.
   *
   * stopCampaign() deactivates every schedule row of the round's posts, and
   * CHZARA's recurrence is one of those rows — rightly, because a round that
   * reopened itself tomorrow would mean "stop" did not stop. But the button is
   * labelled as a counter reset, so an owner reaching for a tidier number would
   * have switched off the feature he had just turned on and found out the next
   * morning, when nothing published. The behaviour is right; the words were
   * missing.
   */
  const dash = code('src/app/social/page.tsx');
  is(/גם החזרה היומית תכבה/.test(dash), 'ending a round warns that the daily repeat goes with it');
  is(/repeats \? ' שימו לב/.test(dash), 'and only when there is a repeat to lose — a warning about a feature he is not using is noise');
  is(/readRepeat\(run\.campaign\)\.enabled/.test(dash), 'and the warning is driven by the campaign row, not by a guess');
  const client2 = code('src/lib/social/client.ts');
  is(/from\('social_schedules'\)\.update\(\{ active: false \}\)\.in\('post_id', postIds\)/.test(client2), 'because stopping a round really does deactivate its schedules');

  /* And the one place that builds the weekly plan still builds it from both. */
  const client = code('src/lib/social/client.ts');
  is(/for \(const day of schedule\.days\) weekly\[String\(day\)\] = \[schedule\.start\];/.test(client), 'the weekly plan is one occasion per chosen day, at the window’s opening hour');
}

/* ──────────── 13. and no component may do this arithmetic itself ───────── */
{
  /*
   * THE INVARIANT THAT KEEPS IT FIXED. Two cards each held a copy of the
   * derivation and drifted apart; the module is only a cure if it is the ONLY
   * caller. Checked on comment-stripped source, so the prose above cannot
   * satisfy it.
   */
  const code = (f: string) =>
    readFileSync(new URL(`../../${f}`, import.meta.url), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/(^|[^:])\/\/.*$/gm, '$1 ');
  for (const f of [
    'src/components/social/LiveCampaignHero.tsx',
    'src/components/social/CampaignScheduleBoard.tsx',
    'src/components/social/CampaignCard.tsx',
  ]) {
    is(!/nextPublishAt\(|nextAllowedAt\(|windowClosesAt\(/.test(code(f)), `${f} computes no publishing instant of its own`);
    /* The board takes the decision as a prop rather than making the call, so
       the shared claim is the IMPORT: every one of the three speaks this
       module's language and none of them invents its own. */
    is(/from '@\/lib\/social\/schedule-readout'/.test(code(f)), `${f} speaks the one module that does`);
  }
}

console.log(`schedule readout OK — ${checks} assertions over every state, both clock changes, and the no-second-mechanism rule`);
