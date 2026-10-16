import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import {
  accountFloorMs,
  projectOne,
  roundAnchor,
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
const ref: CampaignSchedule = { enabled: true, days: [0, 1, 2, 3, 4], start: '08:00', gapSeconds: 60 };
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
  const morning: CampaignSchedule = { enabled: true, days: [0, 1, 2, 3, 4], start: '08:00', gapSeconds: 60 };
  const evening: CampaignSchedule = { enabled: true, days: [0, 1, 2, 3, 4], start: '18:00', gapSeconds: 600 };
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
  const now = at('2026-10-06T23:50');
  /*
   * THE EDGE IS MIDNIGHT NOW, not an hour the owner set: the closing time was
   * removed from the product ("יש להסיר לחלוטין את אפשרות שעת הסיום"), so a
   * chosen day runs to its own end. Four rows a minute apart across it: three
   * fit, the fourth rolls to Wednesday's opening hour.
   */
  const rows = [row('x1', iso('2026-10-06T23:58')), row('x2', iso('2026-10-06T23:59')), row('x3', iso('2026-10-07T00:00')), row('x4', iso('2026-10-07T00:01'))];
  const projected = projectQueue(rows, { now, gates: { c1: { schedule: ref } }, spacing: NO_FLOOR });
  eq(projected.get('x1'), iso('2026-10-06T23:58'), 'a row inside the day keeps its minute');
  eq(projected.get('x2'), iso('2026-10-06T23:59'), 'and so does the last minute of it');
  eq(projected.get('x3'), iso('2026-10-07T08:00'), 'MIDNIGHT BELONGS TO THE NEXT DAY, and waits for its opening hour');
  /* One minute LATER than x3, not the same minute: the projection is strictly
     increasing by the campaign's gap, or a roll would pile every held row onto
     the opening minute — which the unique index would then reject all but one
     of. */
  eq(projected.get('x4'), iso('2026-10-07T08:01'), 'and so does the minute after it, one gap behind the row in front rather than going out at 00:01');

  /* And the evening that used to roll now does not — this is the behaviour
     the owner bought by removing the closing hour. */
  const evening = projectQueue([row('e1', iso('2026-10-06T22:01'))], { now: at('2026-10-06T21:50'), gates: { c1: { schedule: ref } }, spacing: NO_FLOOR });
  eq(evening.get('e1'), iso('2026-10-06T22:01'), 'a minute past ten at night keeps its own minute');

  /* THURSDAY NIGHT ROLLS TO SUNDAY, because Friday and Saturday are not his
     days. A queue that pretends otherwise is a weekend of "באיחור". */
  const thu = at('2026-10-08T23:59');
  const weekend = projectQueue([row('w1', iso('2026-10-09T01:00'))], { now: thu, gates: { c1: { schedule: ref } }, spacing: NO_FLOOR });
  eq(weekend.get('w1'), iso('2026-10-11T08:00'), 'past Thursday the next instant is Sunday morning');
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
  eq(readSchedule({ schedule_enabled: true, schedule_days: [6], schedule_start: '19:00', schedule_gap_seconds: 30 }).days, [6], 'Saturday alone is a legal week');
  /* HIS SATURDAY. "הפעלתי שיעבוד גם ביום שבת היום ב-7 בערב" — a row stamped
     Saturday 19:00 under a Saturday-only window is left exactly where it is. */
  const sat: CampaignSchedule = { enabled: true, days: [6], start: '19:00', gapSeconds: 30 };
  eq(
    projectOne({ scheduledAt: iso('2026-10-10T19:00'), gate: { schedule: sat }, now: at('2026-10-10T18:00') })?.toISOString(),
    iso('2026-10-10T19:00'),
    'a Saturday evening row on a Saturday schedule goes out on Saturday evening',
  );
}

/* ───────── 13. EVERY SURFACE THAT NAMES A TIME ASKS THE ONE MODULE ────── */
{
  /*
   * "כל המסכים חייבים לקבל את זמן הפרסום הבא מאותו מקור נתונים מוסמך. אין
   *  לבצע חישובים עצמאיים וסותרים בכל קומפוננטה."
   *
   * The projection was wired into the dashboard's timeline and the campaign
   * card first, and the owner still reported 06:25 — because the surface he
   * actually opens is the campaign screen's DEFAULT tab, which renders every
   * row through PublicationItem and printed the stored column. These pins are
   * per surface, because "one source of truth" is a claim about all of them.
   */
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const read = (f: string) => strip(readFileSync(f, 'utf8'));

  const item = read('src/components/social/PublicationItem.tsx');
  is(/projectedAt\?: string \| null;/.test(item), 'the row renderer takes the projected instant');
  is(/const at = projectedAt \?\? row\.scheduled_at;/.test(item), 'and its status line is built from it');
  is(/const at = row\.published_at \?\? projectedAt \?\? row\.scheduled_at;/.test(item), 'and so is the collapsed row\u2019s own clock');
  is(!/formatTimeHe\(row\.scheduled_at\)/.test(item), 'the raw column is no longer formatted as a publication time');
  is(/new Date\(projectedAt \?\? row\.scheduled_at\)\.getTime\(\) > Date\.now\(\) \+ 60_000/.test(item), '"הרץ עכשיו" is offered on the instant the row will really go out');

  const sections = read('src/components/social/QueueSections.tsx');
  is(/projected\?: Map<string, string \| null>;/.test(sections), 'the queue list threads it to every row');
  is(/const when = \(r: QueueRow\) => projected\?\.get\(r\.id\) \?\? r\.scheduled_at;/.test(sections), 'and ORDERS by it — a list sorted on one instant and printed with another is in the wrong order');

  const runPage = read('src/app/social/campaigns/[id]/page.tsx');
  is(/projectQueue\(rows \?\? \[\]/.test(runPage), 'the campaign screen projects its WHOLE feed, not only the timeline tab');
  is(/<QueueSections rows=\{rows\} actions=\{queueActions\} projected=\{projected\} \/>/.test(runPage), 'and hands it to the default tab');
  is(/const finishAtShown =/.test(runPage), 'and "סיום משוער" is the LAST projected instant, not the last stored one');
  is(!/state\?\.estimatedCompletionAt \? when\(state\.estimatedCompletionAt\)/.test(runPage), 'the raw estimate is no longer printed under "לפי התזמון שהוגדר"');

  const tuner = read('src/components/social/QueueTunerSheet.tsx');
  /* SECONDS on both sides now. The sheet held whole minutes and multiplied by
     60 here; respaceQueue takes seconds, so the preview and the write only
     agreed while every gap happened to be a whole minute. */
  is(/windowedCascade\(bases, gap, snap\?\.window \?\? null\)/.test(tuner), 'the respace preview runs the same cascade respaceQueue writes, in the same unit');
  is(/const MIN_GAP = MIN_GAP_SECONDS;/.test(tuner), 'and the sheet floors at the engine\u2019s own minimum rather than at one minute');
  is(/const currentProjected =/.test(tuner), 'and the "before" half is projected too, so both halves are in the same units');
  is(!/<Clock iso=\{rows\[0\]\.scheduled_at\} \/>/.test(tuner), 'the sheet opened to FIX the times no longer opens on the raw column');

  const dash = read('src/app/social/page.tsx');
  is(/const at = projectedAll\?\.get\(r\.id\);/.test(dash), 'the 24-hour card decides membership on the instant each row prints');

  /* AND THE TWO TIMEZONE RULES time.ts EXISTS TO ENFORCE. */
  const quick = read('src/components/social/QuickCommentsCard.tsx');
  is(!/d\.getHours\(\)|d\.getDate\(\)|d\.getMonth\(\)/.test(quick), 'no stamp is formatted from the host timezone');
  is(/formatDayMonthHe\(d\)/.test(quick) && /formatTimeHe\(d\)/.test(quick), 'they go through time.ts like every other stamp');
  const activity = read('src/app/social/activity/page.tsx');
  is(!/from\.setDate\(/.test(activity), 'a date range is not stepped with setDate on a zoned instant');
  is(/zonedToUtc\(addDaysISO\(zonedDateISO\(new Date\(\)\), -\(days - 1\)\), '00:00'\)/.test(activity), 'it steps calendar days in the zone, which is what survives both clock changes');
}

/* ───── 13b. ONE "LAST PUBLICATION" PER ROUND, ON EVERY SCREEN ───────── */
{
  /*
   * The campaign's own gap is measured from its most recent publication, so
   * two screens that disagree about THAT instant promise two different next
   * publications for the same row.
   *
   * Both screens ran the same expression — `state.done.find(r => r.published_at)`
   * — over two differently-scoped arrays: the dashboard's `done` is the 500
   * newest finished rows ACCOUNT-WIDE, then filtered to today for a repeating
   * round; the round page's is that campaign's own feed. One expression, two
   * answers.
   */
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const camp = strip(readFileSync('src/lib/social/campaign.ts', 'utf8'));
  is(/opts\.counts\?\.lastPublishedAt !== undefined/.test(camp), 'the round\u2019s last publication is exact when the caller has it');
  const dash = strip(readFileSync('src/app/social/page.tsx', 'utf8'));
  const run = strip(readFileSync('src/app/social/campaigns/[id]/page.tsx', 'utf8'));
  is(/lastPublishedAt: data\.states\[c\.id\]\?\.lastPublishedAt \?\? null/.test(dash), 'the dashboard reads it off the state');
  is(/lastPublishedAt: state\?\.lastPublishedAt \?\? null/.test(run), 'and so does the round page — the same number, from the same place');
  for (const [what, src] of [['the dashboard', dash], ['the round page', run]] as const) {
    is(!/done\.find\(\(r\) => r\.published_at\)/.test(src), `${what} no longer digs the instant out of a preview array`);
  }
  /* The view is where it comes from: max() over every row, not the first of
     whatever the preview happened to carry. */
  const v27 = strip(readFileSync('supabase/social-schema-v27.sql', 'utf8'));
  is(/max\(q\.published_at\) filter \(where q\.status = 'published'\) as last_published_at/.test(v27), 'and the database computes it over every row');
  is(/min\(q\.published_at\) filter \(where q\.status = 'published'\) as first_published_at/.test(v27), 'with the round\u2019s FIRST publication beside it, for "התחיל"');
}

/* ───────── 14. THE RUN STRIP KEEPS EACH CARD'S IDENTITY ───────────────── */
{
  /*
   * "שכל כרטיס מציג רק את הנתונים שלו … שהמעבר בין קמפיינים אינו משנה את
   *  התזמון או מצב הפרסום."
   *
   * The slides were keyed by POSITION while the dashboard re-sorts the strip
   * on every poll, and the sort's tiebreak moves whenever a row finishes. The
   * strip's own position is a scroll offset, so slide 2 stayed slide 2 and
   * became a different campaign under the owner's thumb — with the dots and
   * the "2 / 2" never moving to say so.
   */
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const swiper = strip(readFileSync('src/components/social/CardSwiper.tsx', 'utf8'));
  is(/keys\?: string\[\];/.test(swiper), 'the strip takes a stable identity per slide');
  is(/key=\{keys\?\.\[i\] \?\? i\}/.test(swiper), 'and React keys the slides by it rather than by position');
  is(/const to = keys\.indexOf\(held\.current\);/.test(swiper), 'and the scroll follows the CARD when the order changes, not the slot');
  const dash = strip(readFileSync('src/app/social/page.tsx', 'utf8'));
  is(/keys=\{runs\.map\(\(r\) => r\.campaign\.id\)\}/.test(dash), 'the dashboard supplies the campaign ids');

  /* AND A WAY THROUGH THAT IS NOT A GESTURE — "שקיימים חצים או מנגנון מעבר
     חלופי". */
  is(/aria-label="הסבב הקודם"|label="הסבב הקודם"/.test(swiper), 'there is a previous arrow');
  is(/label="הסבב הבא"/.test(swiper), 'and a next arrow');
  is(/disabled=\{index === 0\}/.test(swiper) && /disabled=\{index === count - 1\}/.test(swiper), 'disabled at the ends rather than hidden, so the row beside them does not jump');
  is(!/focus-visible:outline-none/.test(swiper), 'and nothing cancels the focus ring — the dots were invisible to a keyboard');
}

/* ───── 15. THE HOURS CHANGE, AND THE QUEUE MOVES WITH THEM ──────────── */
{
  /*
   * "שיניתי את תחילת הפרסום ל-10:00, אבל התור ממשיך להציג שעות ישנות."
   *
   * HIS EXACT SCREEN, as arithmetic. Ten rows stamped 12.10 at 08:00–08:09
   * under a window that was 08:00–23:30, and one at 12.10 00:01 (a row a
   * daily ceiling deferred to the next local midnight). He moves the window
   * to 10:00–23:30 at 18:53 on 11.10.
   *
   * rescheduleCampaignQueue() uses each row's OWN stamp as the base, so the
   * round stays on the day it was planned for and only its hours move — a
   * fresh sequence from `now` would drag tomorrow's round into tonight, which
   * is not what moving an hour means.
   */
  const from = [iso('2026-10-12T00:01'), ...Array.from({ length: 10 }, (_, i) => iso(`2026-10-12T08:0${i}`))];
  const window10: CampaignSchedule = { enabled: true, days: [0, 1, 2, 3, 4, 6], start: '10:00', gapSeconds: 60 };
  const floor = new Date(at('2026-10-11T18:53').getTime() + 60_000);
  /* Exactly what rescheduleCampaignQueue computes: the window's opening on the
     day the round is set for, then that instant plus the gap, then the roll. */
  const restamp = (rows: string[], sched: CampaignSchedule): string[] => {
    const anchor = roundAnchor(sched, new Date(rows[0]), floor);
    const gapMs = sched.gapSeconds * 1000;
    return windowedCascade(rows.map((_, i) => new Date(anchor.getTime() + i * gapMs)), sched.gapSeconds, sched).map((d) => d.toISOString());
  };
  const rolled = restamp(from, window10);

  eq(rolled[0], iso('2026-10-12T10:00'), 'the 00:01 row — the earliest — becomes the first publication of the new window');
  eq(rolled[1], iso('2026-10-12T10:01'), 'and 08:00 follows it a gap later');
  eq(rolled[10], iso('2026-10-12T10:10'), 'and 08:09, the last of them, lands at 10:10');
  is(rolled.every((x) => x >= iso('2026-10-12T10:00')), 'NOT ONE of them is left before the hour he chose');
  is(rolled.every((x) => x <= iso('2026-10-12T23:30')), 'and none past the hour he chose to stop');
  is(rolled.every((x, i) => i === 0 || x > rolled[i - 1]), 'the round keeps its order — group N still follows group N-1');
  is(new Set(rolled).size === rolled.length, 'and no two rows land on one instant, which the unique index would reject');
  /* THE DAY IS NOT TOUCHED. A round planned for tomorrow is still tomorrow. */
  is(rolled.every((x) => x.slice(0, 10) === iso('2026-10-12T10:00').slice(0, 10)), 'every row keeps the day it was planned for');

  /* ── his test 2: 10:00 → 12:00, over the queue the first change produced ── */
  const again = restamp(rolled, { ...window10, start: '12:00' });
  eq(again[0], iso('2026-10-12T12:00'), 'moving the window again moves the queue again');
  eq(again[10], iso('2026-10-12T12:10'), 'all of it, in order');

  /*
   * ── AND BACK AGAIN, which is the half that did not work ──
   *
   * nextAllowedAt() only ever moves an instant FORWARD, so re-stamping each
   * row from its own current stamp corrected 08:00 to 10:00 and did NOTHING
   * for 12:00 back to 08:00 — every row was already inside the wider window.
   * The owner's tests are bidirectional; half of them would have passed for
   * the wrong reason. The anchor is the window's opening, so it is symmetric.
   */
  const back = restamp(again, { ...window10, start: '08:00' });
  eq(back[0], iso('2026-10-12T08:00'), 'widening the window EARLIER pulls the round back to the new opening');
  eq(back[10], iso('2026-10-12T08:10'), 'all of it, not just the first row');

  /* ── his test 3: the gap goes from a minute to five, and back ── */
  const slower = restamp(rolled, { ...window10, gapSeconds: 300 });
  eq(slower[0], iso('2026-10-12T10:00'), 'a wider gap starts in the same place');
  eq(slower[1], iso('2026-10-12T10:05'), 'and spaces by the number he chose');
  eq(slower[10], iso('2026-10-12T10:50'), 'all the way down');
  const tighter = restamp(slower, window10);
  eq(tighter[1], iso('2026-10-12T10:01'), 'and narrowing it again TIGHTENS the queue, which rolling forward could never do');
  eq(tighter[10], iso('2026-10-12T10:10'), 'closing the whole round back up');

  /* ── his test 4: the days change, and Monday is no longer a publishing day ── */
  const moved = restamp(rolled, { ...window10, days: [0, 2, 3, 4] });
  /* 12.10.2026 is a Monday; the next chosen day is Tuesday the 13th. */
  eq(moved[0], iso('2026-10-13T10:00'), 'a round on a day he just un-chose moves to the next day he did choose');
  is(moved.every((x) => x.slice(0, 10) === '2026-10-13'), 'and all of it moves together, not half of it');

  /* ── A STAMP IN THE PAST IS NOT RE-STAMPED INTO THE PAST ── */
  const stale = restamp([iso('2026-10-11T06:00')], window10);
  is(stale[0] >= floor.toISOString(), 'a row whose stamp has gone is floored to a minute from now, never re-stamped backwards');
  /* Today is Sunday 11.10 and the window is open until 23:30, so "as soon as
     allowed" is a minute from now rather than tomorrow morning. */
  eq(stale[0], new Date(floor).toISOString(), 'and goes out as soon as the window allows, which today is right now');
}

/* ───── 16. THE WRITE PATH, AND WHAT IT REFUSES TO TOUCH ─────────────── */
{
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const client = strip(readFileSync('src/lib/social/client.ts', 'utf8'));

  is(/export async function rescheduleCampaignQueue\(/.test(client), 'changing the hours re-stamps the queue — the function the write path was missing');
  /*
   * SCOPED TO THE CAMPAIGN — and to every row the ENGINE gates by it, which is
   * not the same set. rules.ts resolves `item.campaign_id ?? post.campaign_id`,
   * so a row stamped before its post joined this campaign carries a null id and
   * is still held by this window. Matching the column alone would move its
   * siblings and leave it behind on the old hours.
   */
  is(/campaign_id\.eq\.\$\{campaignId\},post_id\.in\./.test(client), 'scoped to every row this campaign governs, including one whose post joined it later');
  is(/rowQuery\.eq\('campaign_id', campaignId\)/.test(client), 'and to the id alone when the post list cannot be read');
  is(/item\.campaign_id \?\? post\.campaign_id/.test(readFileSync('src/lib/social/rules.ts', 'utf8')), 'which is exactly how the engine resolves it');
  is(/\.in\('status', PENDING\)/.test(client), 'and to the rows that move on their own');
  /*
   * PENDING is AUTOMATIC_WAITING_STATUSES — 'scheduled' and 'paused'. The four
   * statuses it excludes are excluded for four different reasons: 'publishing'
   * is a publication in flight and must never be re-timed underneath itself;
   * the three human-waiting ones move when he moves them; and the terminal
   * ones are history.
   */
  is(/const PENDING: QueueItem\['status'\]\[\] = AUTOMATIC_WAITING_STATUSES;/.test(client), 'and PENDING is still the automatic-waiting set, which excludes a row in flight');
  is(/windowedCascade\(bases, schedule\.gapSeconds, schedule\)/.test(client), 'the new instants come from the same roll the screens and the planner use');
  is(/const anchor = roundAnchor\(schedule, head, floor\);/.test(client), 'anchored on the WINDOW, so the re-stamp works in both directions');
  /* The cushion is sized off the BATCH now, not fixed at a minute: a minute
     was one slot when a minute was the fastest this product went, and is two
     slots of dead air at the head of a thirty-second round. */
  is(/const floor = new Date\(Date\.now\(\) \+ writeSettleMs\(pending\.length\)\);/.test(client), 'with enough cushion that the worker cannot claim a row before the write lands');
  is(/export const writeSettleMs = \(rows: number\): number => Math\.min\(60_000, Math\.max\(10_000, rows \* 40\)\);/.test(client), 'and the cushion is at least two worker polls, however small the batch');
  is(/if \(!schedule\.enabled\) return \{ moved: 0/.test(client), 'and switching the window OFF moves nothing — that is not a re-space he asked for');
  is(/\.filter\(\(w\) => w\.next !== w\.was\)/.test(client), 'a row already on its new instant is not written, so the count reported is the count that moved');
  /* ONE COPY of the collision-safe write, not two. */
  is(/async function writeNewInstants\(/.test(client), 'the unique-index dance is one function');
  is((client.match(/const movingLater = /g) ?? []).length === 1, 'and there is exactly one copy of it');
  is(!/\.delete\(\)/.test(client.slice(client.indexOf('rescheduleCampaignQueue'), client.indexOf('rescheduleCampaignQueue') + 3000)), 'nothing is deleted to re-time a queue');
  is(!/\.insert\(/.test(client.slice(client.indexOf('rescheduleCampaignQueue'), client.indexOf('rescheduleCampaignQueue') + 3000)), 'and nothing is inserted, so a re-time cannot duplicate a publication');

  /* AND BOTH SCREENS THAT SAVE A SCHEDULE CALL IT. */
  for (const [what, file] of [['the dashboard', 'src/app/social/page.tsx'], ['the campaigns list', 'src/app/social/campaigns/page.tsx']] as const) {
    const src = strip(readFileSync(file, 'utf8'));
    is(/await rescheduleCampaignQueue\(campaign\.id, next\);/.test(src), `${what} re-stamps the queue when the hours change`);
    /* AFTER the campaign write: a queue re-timed to a schedule that was never
       saved is worse than one that is merely stale. */
    is(src.indexOf('saveCampaign(') < src.indexOf('rescheduleCampaignQueue('), `${what} does it only after the campaign itself was saved`);
  }
}

/* ───── 17. AND EVERY LIST OF WAITING ROWS NOW PROJECTS ─────────────── */
{
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  /*
   * The screen he photographed was /social/history. Every caller of
   * PublicationItem and QueueSections is pinned here, because "one source of
   * truth" is a claim about all of them and this is the second time a screen
   * was found still reading the column after the others were fixed.
   */
  for (const [what, file, needle] of [
    ['the history list', 'src/app/social/history/page.tsx', 'projectedAt={projected.get(r.id)}'],
    ['a group\u2019s own page', 'src/app/social/groups/[id]/page.tsx', 'projectedAt={projected.get(r.id)}'],
    ['the post editor\u2019s board', 'src/components/social/LiveBoard.tsx', 'projected={projected}'],
    ['the campaign screen', 'src/app/social/campaigns/[id]/page.tsx', 'projected={projected}'],
  ] as const) {
    const src = strip(readFileSync(file, 'utf8'));
    is(src.includes(needle), `${what} draws the instant the engine will use`);
    is(/projectQueue\(/.test(src), `${what} builds it from the one module`);
  }
  /* The gates are loaded once, from one place, rather than assembled by hand
     on each screen — which is how two screens come to project differently. */
  const client = strip(readFileSync('src/lib/social/client.ts', 'utf8'));
  is(/export async function queueGates\(/.test(client), 'and the gates come from one loader');
  const board = strip(readFileSync('src/components/social/LiveBoard.tsx', 'utf8'));
  is(/useEffect\(\(\) => \{[\s\S]{0,200}queueGates\(\)/.test(board), 'which the 4-second board reads ONCE, not on its beat');
}

/* ───── 18. ONE RECORD OWNS THE CAMPAIGN'S GAP ──────────────────────── */
{
  /*
   * "האם קיימים שני מנגנוני תזמון שונים?" — for the gap, there were two, and
   * each silently undid the other.
   *
   * The panel writes `schedule_gap_seconds` on the campaign row and lowers the
   * account floor to match. The queue tuner wrote ONLY the account floor
   * (applyGapSettings) and never touched the campaign column — while seeding
   * its own control from the ACCOUNT value, with no campaign input at all.
   *
   * So: set five minutes in the tuner, and the panel still reads "דקה" over an
   * engine spacing five. Then touch one day chip on that panel and
   * matchAccountGapTo fires with the panel's stale sixty seconds, dropping the
   * floor back to one — the tuner's setting undone by a control nobody would
   * connect to it.
   */
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const tuner = strip(readFileSync('src/components/social/QueueTunerSheet.tsx', 'utf8'));
  const client = strip(readFileSync('src/lib/social/client.ts', 'utf8'));

  /* And it opens on the round's gap EXACTLY, not rounded into whole minutes:
     a thirty-second round used to load as "1 דק׳" and one save doubled it. */
  is(/setGap\(own\?\.enabled \? own\.gapSeconds : plan\.effectiveGapSeconds\)/.test(tuner),
    'the tuner opens on the ROUND\u2019s own gap when it is about a round, not on the account floor, and does not round it');
  is(/await saveCampaign\(\{[\s\S]{0,200}scheduleColumns\(\{ \.\.\.snap\.window, gapSeconds: kept \}\)/.test(tuner),
    'and writes that round\u2019s own column, so the panel beside it cannot disagree');
  is(/await matchAccountGapTo\(kept\);/.test(tuner), 'with the account floor following the same number the panel would follow');
  /*
   * AND THE RATCHET IS GONE BECAUSE ITS CAUSE IS.
   *
   * The control used to be whole minutes, so a round on thirty seconds loaded
   * as "1" and one save wrote sixty — doubling the floor without the owner
   * touching the number. The guard that defended against it needed a
   * round trip to defend against; a seconds control has none, so the written
   * value IS the value on screen.
   */
  is(/const kept = gap;/.test(tuner), 'the sheet writes the gap it is showing, with no minutes round trip to lose it in');
  is(!/Math\.round\(snap\.window\.gapSeconds \/ 60\)/.test(tuner), 'and nothing on this sheet rounds a stored gap into whole minutes any more');
  /* The account-wide path is untouched: with no campaign in scope the sheet
     still writes the account settings and nothing else. */
  is(/if \(campaignId && snap\?\.campaign && snap\.window\) \{/.test(tuner), 'the account-wide tuner is unchanged — this only applies when a round is in scope');
  /* And the campaign columns still have exactly one writer. */
  is(!/schedule_gap_seconds:/.test(client), 'client.ts never writes the gap columns directly — scheduleColumns() is still their one writer');
}

console.log(`projection OK — ${checks} assertions over the four gates, the cascade, the writers’ roll and both clock changes`);
