import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { scheduleReadout } from '../../src/lib/social/schedule-readout';
import type { CampaignSchedule } from '../../src/lib/social/campaign-schedule';
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
const ref: CampaignSchedule = { enabled: true, days: [0, 1, 2, 3, 4], start: '08:00', end: '22:00', gapMinutes: 1 };
const off: CampaignSchedule = { ...ref, enabled: false };
const noDays: CampaignSchedule = { ...ref, days: [] };

const prog = (o: Record<string, number> = {}) =>
  ({ total: 0, published: 0, failed: 0, skipped: 0, scheduled: 0, running: 0, manual: 0, finished: 0, ...o }) as never;

/** The slice of CampaignState the readout is allowed to see. */
const st = (
  state: CampaignState['state'],
  nextAt: string | null,
  extra: { manual?: number; lastPublished?: string } = {},
) =>
  ({
    state,
    nextAt,
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
  eq(r, { kind: 'ended', stopped: false }, 'a finished round inside an open window must name no instant');

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
  eq(scheduleReadout(ref, st('stopped', null), now), { kind: 'ended', stopped: true }, 'a round he stopped says it was stopped');
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
  let seen = 0;
  const kinds = new Set<string>();
  for (const s of states)
    for (const sc of schedules)
      for (const q of queues)
        for (const c of clocks) {
          const r = scheduleReadout(sc, st(s, q, { manual: s === 'needs_attention' ? 3 : 0 }), at(c));
          seen += 1;
          kinds.add(r.kind);
          const carries = 'at' in r ? r.at : 'until' in r ? r.until : 'opens' in r ? r.opens : null;
          if (carries === null) continue;
          /* Every instant that IS printed must be a real one, and — for the two
             window kinds, which describe something still ahead — in the future.
             A 'due' row may be due now, which is the engine saying "go". */
          is(!Number.isNaN(new Date(carries).getTime()), `${s}/${c}: a printed instant must be a real date`);
          if (r.kind !== 'due') is(new Date(carries) > at(c), `${s}/${c}: ${r.kind} named ${carries}, which is not ahead of now`);
          /* AND A ROUND THAT IS OVER MAY NEVER REACH THIS LINE. */
          is(s !== 'completed' && s !== 'stopped', `${s}: a round that has ended printed ${r.kind} = ${carries}`);
        }
  is(seen === states.length * schedules.length * queues.length * clocks.length, 'the sweep covered every combination');
  is(kinds.size >= 6, `the sweep reached ${kinds.size} of the readout's shapes`);
}

/* ──────────── 8. and no component may do this arithmetic itself ────────── */
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
