import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  accountFloorMs,
  projectOne,
  projectQueue,
  spacingFrom,
  windowedCascade,
  windowedStagger,
  type AccountSpacing,
  type CampaignGate,
  type ProjectableRow,
} from '../../src/lib/social/projection';
import { scheduleReadout } from '../../src/lib/social/schedule-readout';
import { readSchedule, type CampaignSchedule } from '../../src/lib/social/campaign-schedule';
import type { CampaignState } from '../../src/lib/social/campaign';

/**
 * WHEN EACH WAITING ROW WILL ACTUALLY GO OUT — the one answer, proved once.
 *
 * "למה יש כל פעם את האיחור הזה" · "מקור אמת אחד לזמני הפרסום — הכרטיס והרשימה
 *  חייבים להסכים" · "אני רוצה שהפרסום בפועל יקרה בזמן הנכון."
 *
 * THE FAULT. A queue row carries one instant, `scheduled_at`, and four gates
 * stand between it and a publication: the account-wide floor, the campaign's
 * own gap, its chosen days and its daily window. The campaign card composed
 * all four (scheduleReadout). The dashboard's "הפרסומים הקרובים" list rendered
 * the raw column. So with 217 rows re-spaced at 06:25 under a window that opens
 * at 08:00, the card said 08:00 and the list said "באיחור · לפני שעתיים" about
 * every single row — and neither number came from bad data. There were two
 * answers because there were two places working them out.
 *
 * AND THE STAMPS THEMSELVES WERE WRONG. respaceQueue() laid rows out as
 * `start + i × gap` and planQueue() as `slot + i × gap`, neither of which had
 * ever heard of the window. Nothing was lost — rules.ts defers — but the
 * column said something the machine would not do, and every screen in the
 * product reads the column.
 *
 * WHAT THIS FILE HOLDS. That the composition is one function; that the card and
 * the list call it and therefore agree to the millisecond; that a cascade is
 * what makes a deep queue honest rather than two hundred rows all "now"; that a
 * campaign's gates govern ITS rows and no one else's; and that the writers'
 * roll is deterministic, strictly increasing, and the identity for an owner who
 * has never opened the panel.
 *
 * NO BROWSER AND NO DATABASE, on purpose: it is pure arithmetic over dates, so
 * every scenario is a millisecond here. swiper.test.ts and dashboard-hero.test.ts
 * then check that the cards DRAW what this file proves they are told.
 *
 *   npx tsx worker/test/projection.test.ts
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
const iso = (s: string): string => at(s).toISOString();

/** HIS OWN SETTING, off the screenshot: Sunday–Thursday, 08:00–22:00. */
const ref: CampaignSchedule = { enabled: true, days: [0, 1, 2, 3, 4], start: '08:00', end: '22:00', gapSeconds: 60 };
const off: CampaignSchedule = { ...ref, enabled: false };
const noDays: CampaignSchedule = { ...ref, days: [] };

const NO_FLOOR: AccountSpacing = { minGapMinutes: 0, groupMinGapMinutes: 0, lastPublishedAt: null };

const row = (id: string, scheduledAt: string, extra: Partial<ProjectableRow> = {}): ProjectableRow => ({
  id,
  scheduled_at: scheduledAt,
  status: 'scheduled',
  campaign_id: 'c1',
  target: { channel: 'facebook_group' },
  ...extra,
});

/* ───────────── 1. HIS SCREEN. The 217 rows that were not late. ─────────── */
{
  /*
   * Tuesday 06.10.2026. He re-spaced the queue to one minute at 06:24, so
   * respaceQueue() stamped 217 rows at 06:25, 06:26, 06:27 … under a campaign
   * that publishes 08:00–22:00. At 07:00 the dashboard called every one of them
   * "באיחור" and the card above it said 08:00.
   */
  const now = at('2026-10-06T07:00');
  const rows = Array.from({ length: 217 }, (_, i) => row(`r${i}`, new Date(at('2026-10-06T06:25').getTime() + i * 60_000).toISOString()));
  const projected = projectQueue(rows, { now, gates: { c1: { schedule: ref, lastPublishedAt: null } }, spacing: NO_FLOOR });

  eq(projected.size, 217, 'every waiting row is answered for');
  eq(projected.get('r0'), iso('2026-10-06T08:00'), 'the first row goes out when the window opens, not at the minute it was stamped');
  eq(projected.get('r1'), iso('2026-10-06T08:01'), 'and the second a campaign gap later');
  eq(projected.get('r216'), iso('2026-10-06T11:36'), 'and the last one 216 minutes after the first');

  /*
   * THE WHOLE POINT, STATED AS ONE ASSERTION: not one of the 217 is reported in
   * the past. "באיחור" over a queue that is simply being worked through is the
   * false alarm he reported, and it cannot be drawn from these numbers.
   */
  const instants = [...projected.values()];
  is(instants.every((v) => v !== null && new Date(v).getTime() >= now.getTime()), 'no row is projected into the past');
  /* Nor outside the window on the wrong side. */
  is(instants.every((v) => v !== null && new Date(v).getTime() <= at('2026-10-06T22:00').getTime()), 'and none past the hour the campaign stops');
  /* STRICTLY INCREASING. A list whose rows do not run forwards in time is the
     strip telling the afternoon out of order. */
  is(
    instants.every((v, i) => i === 0 || new Date(v as string).getTime() > new Date(instants[i - 1] as string).getTime()),
    'the queue runs forwards, one gap at a time',
  );
}

/* ───────── 2. THE CARD AND THE LIST, ON THE SAME ROW, TO THE ms ───────── */
{
  /*
   * The requirement in his own words: "הכרטיס והרשימה חייבים להסכים". They are
   * two readers now, so this compares them on the same row, the same schedule,
   * the same account floor and the same minute — and it compares the VALUES,
   * not the two implementations, because there is only one implementation left.
   */
  const now = at('2026-10-06T07:00');
  const spacing: AccountSpacing = { minGapMinutes: 45, groupMinGapMinutes: 20, lastPublishedAt: iso('2026-10-06T06:50') };
  const head = row('head', iso('2026-10-06T06:25'));
  const list = projectQueue([head], { now, gates: { c1: { schedule: ref, lastPublishedAt: iso('2026-10-05T21:00') } }, spacing });

  const state = {
    state: 'running',
    nextAt: head.scheduled_at,
    nextChannel: 'facebook_group',
    truncated: false,
    progress: { total: 10, published: 1, failed: 0, skipped: 0, scheduled: 9, running: 0, manual: 0, finished: 1 },
    done: [{ published_at: iso('2026-10-05T21:00') }],
  } as unknown as Pick<CampaignState, 'state' | 'nextAt' | 'done' | 'progress'> & { truncated?: boolean; nextChannel?: string | null };
  const card = scheduleReadout(ref, state, now, undefined, spacing);

  is(card.kind === 'due', 'the card names an instant for a queued row');
  eq(card.kind === 'due' ? card.at : null, list.get('head'), 'the card and the list name the SAME instant');
  /* And it is the one the engine will use: the account floor (45+20 = 65 min
     after 06:50 is 07:55) rolled into the window, which opens at 08:00. */
  eq(list.get('head'), iso('2026-10-06T08:00'), 'and that instant is the engine’s own: account floor, then window');
}

/* ───────── 3. ATTRIBUTION — a campaign's gates govern ITS rows ───────── */
{
  /*
   * "כל שורה חייבת להיות משויכת לקמפיין הנכון."
   *
   * Two campaigns, two different windows, their rows interleaved in the queue
   * exactly as the dashboard reads them. A single shared clock — which a flat
   * sequence is — would push one campaign's rows out by the other's interval.
   */
  const now = at('2026-10-06T07:00');
  const morning: CampaignSchedule = { enabled: true, days: [0, 1, 2, 3, 4], start: '08:00', end: '12:00', gapSeconds: 60 };
  const evening: CampaignSchedule = { enabled: true, days: [0, 1, 2, 3, 4], start: '18:00', end: '22:00', gapSeconds: 600 };
  const rows = [
    row('a1', iso('2026-10-06T07:10'), { campaign_id: 'A' }),
    row('b1', iso('2026-10-06T07:11'), { campaign_id: 'B' }),
    row('a2', iso('2026-10-06T07:12'), { campaign_id: 'A' }),
    row('b2', iso('2026-10-06T07:13'), { campaign_id: 'B' }),
  ];
  const projected = projectQueue(rows, {
    now,
    gates: { A: { schedule: morning, lastPublishedAt: null }, B: { schedule: evening, lastPublishedAt: null } },
    spacing: NO_FLOOR,
  });

  eq(projected.get('a1'), iso('2026-10-06T08:00'), "A's first row opens at A's window");
  eq(projected.get('b1'), iso('2026-10-06T18:00'), "B's first row opens at B's window, not at A's");
  eq(projected.get('a2'), iso('2026-10-06T08:01'), "A's second row waits out A's own one-minute gap");
  eq(projected.get('b2'), iso('2026-10-06T18:10'), "and B's second waits out B's ten-minute gap, not A's minute");
}

/* ───────── 4. THE ACCOUNT FLOOR, which is not a campaign's ───────── */
{
  const now = at('2026-10-06T10:00');
  const spacing: AccountSpacing = { minGapMinutes: 45, groupMinGapMinutes: 20, lastPublishedAt: iso('2026-10-06T09:30') };
  /* 45 + 20 = 65 minutes after 09:30 is 10:35, which is later than both the
     stored instant and now, and inside the window. */
  eq(
    projectOne({ scheduledAt: iso('2026-10-06T10:05'), channel: 'facebook_group', gate: { schedule: ref }, spacing, now })?.toISOString(),
    iso('2026-10-06T10:35'),
    'a group publication waits out the account floor plus the group surcharge',
  );
  /* A PAGE DOES NOT PAY THE GROUP SURCHARGE — rules.ts applies it per channel,
     so 45 minutes after 09:30 is 10:15. */
  eq(
    projectOne({ scheduledAt: iso('2026-10-06T10:05'), channel: 'facebook_page', gate: { schedule: ref }, spacing, now })?.toISOString(),
    iso('2026-10-06T10:15'),
    'a page waits out the plain floor, without the group surcharge',
  );
  /* THE SECONDS OUT-VOTE THE MINUTES WHEN THEY ARE THERE, which is the whole
     of the sub-minute spacing feature: 30 seconds, not a rounded-up minute. */
  const fast: AccountSpacing = { minGapMinutes: 1, groupMinGapMinutes: 1, minGapSeconds: 30, groupMinGapSeconds: 0, lastPublishedAt: iso('2026-10-06T10:00') };
  eq(accountFloorMs(fast, 'facebook_group'), at('2026-10-06T10:00:30').getTime(), 'thirty seconds means thirty seconds, not a minute');
  /* An account that has never published has no floor at all. */
  eq(accountFloorMs({ ...fast, lastPublishedAt: null }, 'facebook_group'), 0, 'an account that never published imposes no floor');
}

/* ───────── 5. HELD, WITH NO INSTANT — and it pushes nothing ───────── */
{
  const now = at('2026-10-06T10:00');
  const rows = [row('held', iso('2026-10-06T10:05')), row('after', iso('2026-10-06T10:06'), { campaign_id: 'c2' })];
  const projected = projectQueue(rows, {
    now,
    gates: { c1: { schedule: noDays }, c2: { schedule: ref } },
    spacing: NO_FLOOR,
  });
  eq(projected.get('held'), null, 'a schedule with no day names no instant, as rules.ts holds the row for ever');
  /*
   * AND THE ROW BEHIND IT IS NOT PUSHED BY IT. Nothing publishes at an instant
   * that does not exist, so a held row may not consume the account's clock —
   * otherwise one campaign with no day chosen would silently delay every other
   * campaign's queue.
   */
  eq(projected.get('after'), iso('2026-10-06T10:06'), 'a held row does not advance the clock for the row behind it');
}

/* ───────── 6. OFF, ABSENT, AND WAITING ON A PERSON ───────── */
{
  const now = at('2026-10-06T10:00');
  /* Switched off: the stored instant is the truth, because off means the window
     is not enforced at all. */
  eq(
    projectOne({ scheduledAt: iso('2026-10-06T23:40'), gate: { schedule: off }, now })?.toISOString(),
    iso('2026-10-06T23:40'),
    'with the schedule off the stored instant stands',
  );
  /* No gate at all reads the same way. */
  eq(projectOne({ scheduledAt: iso('2026-10-06T23:40'), now })?.toISOString(), iso('2026-10-06T23:40'), 'and so does no schedule at all');
  /* NEVER THE PAST, whatever the gate: "name an instant only when something
     will happen at it", and nothing happens at a minute that has gone. */
  eq(projectOne({ scheduledAt: iso('2026-10-06T06:00'), gate: { schedule: off }, now })?.toISOString(), now.toISOString(), 'a stamp that has gone is reported from now');

  /*
   * A ROW WAITING FOR A PERSON IS NOT FORECAST AT ALL — absent from the map,
   * which is how the list tells "no forecast" from "held". A minute printed
   * over a publication that moves only when he moves it would be an invented
   * promise, which is the fault this module exists to remove.
   */
  const projected = projectQueue(
    [row('manual', iso('2026-10-06T10:05'), { status: 'manual_pending' }), row('wait', iso('2026-10-06T10:06'), { status: 'awaiting_confirmation' }), row('auto', iso('2026-10-06T10:07'))],
    { now, gates: { c1: { schedule: ref } }, spacing: NO_FLOOR },
  );
  is(!projected.has('manual'), 'a row waiting for a person carries no forecast');
  is(!projected.has('wait'), 'and neither does one waiting for a confirmation');
  is(projected.has('auto'), 'while the row the engine will take on its own does');
  /* AND A ROW WAITING ON A PERSON DOES NOT MOVE THE CLOCK EITHER: it may never
     publish, so assuming it will would delay every row behind it. */
  eq(projected.get('auto'), iso('2026-10-06T10:07'), 'a row waiting for a person does not push the automatic row behind it');

  /*
   * A ROW THAT IS PUBLISHING RIGHT NOW IS THE OPPOSITE CASE: no forecast —
   * "מפרסם עכשיו" is what the list says over it — but it IS about to become the
   * account's most recent publication, so the row behind it waits out the
   * account floor from it. Leaving it out of the cascade projected the next row
   * 65 minutes early with the shipped defaults.
   */
  const spacing: AccountSpacing = { minGapMinutes: 45, groupMinGapMinutes: 20, lastPublishedAt: iso('2026-10-06T08:00') };
  const live = projectQueue(
    [row('live', iso('2026-10-06T09:59'), { status: 'publishing' }), row('next', iso('2026-10-06T10:01'))],
    { now, gates: { c1: { schedule: ref } }, spacing },
  );
  is(!live.has('live'), 'the row the worker is holding carries no forecast');
  eq(live.get('next'), iso('2026-10-06T11:05'), 'and the row behind it waits out the account floor from THAT publication, not from the last finished one');
}

/* ───────── 7. ACROSS THE WINDOW'S EDGE, AND ONTO THE NEXT DAY ───────── */
{
  const now = at('2026-10-06T21:50');
  /* Three rows a minute apart at 21:58, under a window that shuts at 22:00:
     two fit, the third rolls to Wednesday 08:00. */
  const rows = [row('x1', iso('2026-10-06T21:58')), row('x2', iso('2026-10-06T21:59')), row('x3', iso('2026-10-06T22:00')), row('x4', iso('2026-10-06T22:01'))];
  const projected = projectQueue(rows, { now, gates: { c1: { schedule: ref } }, spacing: NO_FLOOR });
  eq(projected.get('x1'), iso('2026-10-06T21:58'), 'a row inside the window keeps its minute');
  eq(projected.get('x2'), iso('2026-10-06T21:59'), 'and so does the next');
  eq(projected.get('x3'), iso('2026-10-06T22:00'), 'the closing minute is inside the window');
  eq(projected.get('x4'), iso('2026-10-07T08:00'), 'and the one past it opens tomorrow, not at 22:01');

  /* THURSDAY NIGHT ROLLS TO SUNDAY, because Friday and Saturday are not his
     days. A queue that pretends otherwise is a weekend of "באיחור". */
  const thu = at('2026-10-08T21:59');
  const weekend = projectQueue([row('w1', iso('2026-10-08T23:00'))], { now: thu, gates: { c1: { schedule: ref } }, spacing: NO_FLOOR });
  eq(weekend.get('w1'), iso('2026-10-11T08:00'), 'past Thursday’s window the next instant is Sunday morning');
}

/* ───────── 8. THE WRITERS' ROLL: deterministic, increasing, identity ───── */
{
  /*
   * planQueue() and respaceQueue() stamp the column, and a stamp has three
   * obligations the read side does not have.
   */

  /* (a) NO CLOCK IN IT. Re-planning has to reproduce the same instants or the
         unique (schedule, target, scheduled_at) index stops protecting the
         queue and the round is written twice. */
  const a = windowedStagger(at('2026-10-06T19:00'), 40, 60, ref).map((d) => d.toISOString());
  const b = windowedStagger(at('2026-10-06T19:00'), 40, 60, ref).map((d) => d.toISOString());
  eq(a, b, 'the same occasion stamps the same instants every time it is planned');

  /* (b) STRICTLY INCREASING, which is what stops a rolled block collapsing
         onto the window's opening minute. 100 rows stamped 08:00 would be 99
         unique-index rejections and a round silently a hundredth of its size. */
  const rolled = windowedStagger(at('2026-10-06T06:00'), 100, 60, ref);
  eq(rolled[0].toISOString(), iso('2026-10-06T08:00'), 'a block stamped before the window opens starts when it opens');
  eq(rolled[1].toISOString(), iso('2026-10-06T08:01'), 'and the next is a gap later, not the same minute');
  eq(new Set(rolled.map((d) => d.toISOString())).size, 100, 'every one of the hundred lands on its own instant');
  is(rolled.every((d, i) => i === 0 || d.getTime() > rolled[i - 1].getTime()), 'and they run forwards');
  is(
    rolled.every((d) => {
      const h = Number(new Intl.DateTimeFormat('en-GB', { timeZone: 'Asia/Jerusalem', hour: '2-digit', hour12: false }).format(d));
      return h >= 8 && h <= 22;
    }),
    'not one of the hundred is stamped outside the hours the campaign publishes in',
  );

  /* (c) THE IDENTITY FOR A CAMPAIGN THAT HAS NEVER USED THE PANEL. Every
         existing owner is in this case, and their queues must not move. */
  const flat = windowedStagger(at('2026-10-06T02:00'), 5, 65 * 60, off).map((d) => d.toISOString());
  eq(
    flat,
    [0, 1, 2, 3, 4].map((i) => new Date(at('2026-10-06T02:00').getTime() + i * 65 * 60_000).toISOString()),
    'with the schedule off the planner stamps exactly the flat sequence it always did',
  );
  eq(windowedStagger(at('2026-10-06T02:00'), 5, 65 * 60, null).map((d) => d.toISOString()), flat, 'and a campaign with no schedule row reads the same');

  /* (d) A SCHEDULE WITH NO DAY STILL HAS TO BE WRITTEN SOMEWHERE. Inventing a
         date out of an impossible schedule would be worse than leaving the row
         where the arithmetic put it; the engine holds it and says which setting
         is doing so. */
  eq(
    windowedStagger(at('2026-10-06T02:00'), 2, 60, noDays).map((d) => d.toISOString()),
    [iso('2026-10-06T02:00'), iso('2026-10-06T02:01')],
    'a schedule with no day leaves the arithmetic instants alone',
  );

  /* (e) THE CASCADE IS WHAT respaceQueue() USES, over the bases it computes. */
  const bases = [0, 1, 2].map((i) => new Date(at('2026-10-06T06:25').getTime() + i * 60_000));
  eq(
    windowedCascade(bases, 60, ref).map((d) => d.toISOString()),
    [iso('2026-10-06T08:00'), iso('2026-10-06T08:01'), iso('2026-10-06T08:02')],
    'a respace at 06:25 lands the queue at the window, one gap apart',
  );
}

/* ───────── 9. THE TWO DAYS A YEAR THE CLOCK MOVES ───────── */
{
  /*
   * Calendar dates resolved in the zone, never a 24-hour addition: on
   * 25.10.2026 Israel went back to +02:00, so "tomorrow 08:00" is 25 hours
   * after today's, and a window edge computed by arithmetic lands an hour out.
   */
  const now = at('2026-10-24T23:00');
  const projected = projectQueue([row('d1', iso('2026-10-24T23:30'))], { now, gates: { c1: { schedule: ref } }, spacing: NO_FLOOR });
  /* Saturday night → Sunday 08:00 local, which that day is 06:00Z. */
  eq(projected.get('d1'), iso('2026-10-25T08:00'), 'the window opens at 08:00 local on the morning the clock goes back');
  is(projected.get('d1') === '2026-10-25T06:00:00.000Z', 'and 08:00 local that day is 06:00Z, which is the hour the clock moved');
}

/* ───────── 10. spacingFrom(), as the dashboard hands it over ───────── */
{
  const spacing = spacingFrom(
    { minGapMinutes: 45, minGapSeconds: 30 },
    { groupMinGapMinutes: 20, groupMinGapSeconds: 0 },
    iso('2026-10-06T10:00'),
  );
  eq(spacing.minGapSeconds, 30, 'the seconds travel with the minutes');
  eq(spacing.groupMinGapSeconds, 0, 'and so does a surcharge of zero, which is not the same as absent');
  eq(spacing.lastPublishedAt, iso('2026-10-06T10:00'), 'and the account’s own last publication');
  /* A missing browser row must not invent a surcharge. */
  eq(spacingFrom({ minGapMinutes: 45 }, null, null).groupMinGapMinutes, 0, 'no browser settings means no group surcharge, not a default one');
}

/* ───────── 11. THE SOURCE: no second answer anywhere ───────── */
{
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /*
   * FAULT 1 — the dashboard's run strip featured campaigns by ROW COUNT, so a
   * campaign that had not been launched yet was not on the screen at all and
   * a single survivor left nothing to swipe.
   */
  const dash = strip(readFileSync('src/app/social/page.tsx', 'utf8'));
  is(!/progress\.total\)\)/.test(dash.split('const FEATURED_LIMIT')[1].slice(0, 900)), 'the run strip no longer filters campaigns by how many queue rows they have');
  is(/filter\(\(x\): x is \{ campaign: Campaign; state: CampaignState \} => Boolean\(x\.state\)\)/.test(dash), 'it features every live campaign it has a state for');
  is(/projected=\{projectedSoon\}/.test(dash), 'and the upcoming list is handed the projection rather than left to read the column');

  /*
   * FAULT 2 — the countdown in the list read `row.scheduled_at`. It must read
   * the forecast the card reads, and there must be exactly one module that
   * works that forecast out.
   */
  const timeline = strip(readFileSync('src/components/social/Timeline.tsx', 'utf8'));
  is(!/<Countdown at=\{row\.scheduled_at\}/.test(timeline), 'the countdown no longer reads the raw column');
  is(/<Countdown at=\{at\}/.test(timeline), 'it reads the instant decided for the stop');

  /* scheduleReadout must not keep a second copy of the composition. */
  const readout = strip(readFileSync('src/lib/social/schedule-readout.ts', 'utf8'));
  is(/projectOne\(\{/.test(readout), 'the card asks projectOne for its instant');
  is(!/nextPublishAt\(/.test(readout), 'and no longer composes the gates itself');

  /* And the two writers must go through the roll. */
  const plan = strip(readFileSync('src/lib/social/plan.ts', 'utf8'));
  is(/windowedStagger\(/.test(plan), 'the planner stamps inside the campaign window');
  is(!/staggerAt\(/.test(plan), 'and no longer stamps the bare arithmetic instant');
  const client = strip(readFileSync('src/lib/social/client.ts', 'utf8'));
  is(/windowedCascade\(/.test(client), 'and so does a respace');
}

/* ───────── 12. readSchedule round-trip, as the writers read it ───────── */
{
  /* A campaign row the planner reads: the columns may be absent entirely on a
     database that has not run social-latest.sql, and that must read as "no
     window" rather than as a default one that stops the queue. */
  eq(readSchedule({}).enabled, false, 'a campaign row with no schedule columns is not gated');
  eq(readSchedule(null).enabled, false, 'and neither is no row at all');
  eq(readSchedule({ schedule_enabled: true, schedule_days: [6], schedule_start: '19:00', schedule_end: '23:30', schedule_gap_seconds: 30 }).days, [6], 'Saturday alone is a legal week');
  /* HIS SATURDAY. "הפעלתי שיעבוד גם ביום שבת היום ב-7 בערב" — a row stamped
     Saturday 19:00 under a Saturday-only window is left exactly where it is. */
  const sat: CampaignSchedule = { enabled: true, days: [6], start: '19:00', end: '23:30', gapSeconds: 30 };
  eq(
    projectOne({ scheduledAt: iso('2026-10-10T19:00'), gate: { schedule: sat }, now: at('2026-10-10T18:00') })?.toISOString(),
    iso('2026-10-10T19:00'),
    'a Saturday evening row on a Saturday schedule goes out on Saturday evening',
  );
}

console.log(`projection OK — ${checks} assertions over the four gates, the cascade, the writers’ roll and both clock changes`);
