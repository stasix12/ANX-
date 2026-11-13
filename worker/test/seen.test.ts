import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readSeenUntil, writeSeenUntil } from '../../src/lib/social/seen';

/**
 * "אחרי שפעם אחת אני לוחץ על זה וזה נעלם" — DISMISSING THE ORANGE BAR.
 *
 * WHAT IS AT STAKE, and it is not symmetric.
 *
 * The rows this bar counts are the ones NOTHING will move on its own: Facebook
 * asked for a confirmation, the publish window did not close and nobody knows
 * whether the post went up, or the publication is waiting for the owner's own
 * approval. No worker claims them, no clock releases them.
 *
 * ─── WHY THIS FILE WAS REWRITTEN ON 13.11.2026 ────────────────────────────
 *
 * The first version of the dismissal was a SET OF IDS with a 200-row cap, and
 * a rule that the bar could not be dismissed at all while the cap was reached
 * — so that one tap could never hide a row nobody had seen. Measured on his
 * account that day: 347 rows in `needs_attention`, four more arriving a day.
 * Over the cap. So the safety rule had been holding the bar open at 347,
 * un-dismissable, every thirty seconds, for weeks — which is precisely the
 * un-answerable warning the feature was built to end, reached by the route
 * built to prevent a different harm.
 *
 * He chose, in the same message as the card: "מה שלא הצליח לפרסם לא להתעסב."
 *
 * So what is stored is now a WATERMARK — one instant, "I have been told about
 * everything waiting as of here" — and the trade is explicit: ONE TAP ANSWERS
 * EVERY ROW THAT IS WAITING NOW, however many there are and however few of
 * them fitted on the screen it opened. What the tests below still hold, and
 * what matters now that the dismissal is total:
 *
 *   • a row that arrives AFTERWARDS is unseen, and raises the bar again;
 *   • the watermark is the DATABASE's instant and never this browser's clock,
 *     so a fast PC clock cannot dismiss rows that have not arrived yet;
 *   • it never moves backwards, so a second tab cannot un-dismiss;
 *   • anything unreadable in storage — including the ARRAY the old version
 *     wrote — reads as "nothing dismissed", never as "everything dismissed";
 *   • nothing is deleted and no row changes status: the queue, the history
 *     screen and the queue tile's own "N דורשים אתכם" all still hold them.
 *
 *   npx tsx worker/test/seen.test.ts
 */

let checks = 0;
const is = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};

/* The comparison the screen and the database both make. The whole mechanism is
   one `>`, so it is written out once here and asserted against. */
const unseenAfter = (watermark: string | null, rowUpdatedAt: string) => !watermark || rowUpdatedAt > watermark;

/* ------------------------------------------------------------------ *
 * Storage, and every way it can hand back something that is not an instant.
 * ------------------------------------------------------------------ */
{
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };

  eq(readSeenUntil(), null, 'an untouched browser has dismissed nothing');
  writeSeenUntil('2026-11-13T09:00:00.000Z');
  eq(readSeenUntil(), '2026-11-13T09:00:00.000Z', 'and what was written comes back');

  /* A ROW THAT ARRIVED AFTERWARDS IS STILL UNSEEN. This is the whole
     difference from a "dismissed" flag, and it is the half of the old ID
     mechanism that was load-bearing. */
  is(unseenAfter(readSeenUntil(), '2026-11-13T09:00:01.000Z'), 'a row stamped after the watermark is unseen — the bar comes back');
  is(!unseenAfter(readSeenUntil(), '2026-11-13T08:59:59.000Z'), 'and one stamped before it is answered');
  is(!unseenAfter(readSeenUntil(), '2026-11-13T09:00:00.000Z'), 'including one stamped exactly at it — the read is gt, so the watermark itself is covered');

  /* NEVER BACKWARDS. Two tabs poll independently and the older one's "newest
     waiting row" can be a minute behind the other's. */
  writeSeenUntil('2026-11-13T08:00:00.000Z');
  eq(readSeenUntil(), '2026-11-13T09:00:00.000Z', 'AN OLDER INSTANT CANNOT UN-DISMISS — a second tab mid-poll may not reopen what was answered');
  writeSeenUntil('2026-11-13T10:00:00.000Z');
  eq(readSeenUntil(), '2026-11-13T10:00:00.000Z', 'but a newer one moves it on');

  /* Nothing that is not a usable instant may become one. */
  for (const junk of ['not json', '42', 'null', 'true', '{"dismissed":true}', '["a","b"]', '"nonsense"', '""']) {
    store.set('social:waiting:seen-until', junk);
    eq(readSeenUntil(), null, `a stored value of ${junk} reads as nothing dismissed`);
    is(unseenAfter(readSeenUntil(), '2020-01-01T00:00:00.000Z'), `and hides nothing at all — ${junk}`);
  }

  /*
   * THE OLD SHAPE, EXPLICITLY. Until 13.11.2026 this feature wrote an ARRAY of
   * ids, under its own key. A device upgrading mid-session has that array
   * sitting there, and the one thing it may never do is read as a dismissal of
   * everything.
   */
  store.set('social:waiting:seen', '["abc","def"]');
  store.delete('social:waiting:seen-until');
  eq(readSeenUntil(), null, "the old ID key is not read at all, so an upgraded device starts from 'nothing dismissed'");

  /* A write of nonsense is refused rather than stored, so a bad value cannot
     survive in the key and be read back by a later version. */
  store.set('social:waiting:seen-until', JSON.stringify('2026-11-13T10:00:00.000Z'));
  writeSeenUntil('not a date');
  eq(readSeenUntil(), '2026-11-13T10:00:00.000Z', 'and a nonsense write changes nothing');
}

{
  /* Private mode, a full quota, storage switched off by policy. */
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: () => {
      throw new Error('denied');
    },
    setItem: () => {
      throw new Error('denied');
    },
  };
  eq(readSeenUntil(), null, 'storage that throws reads as nothing dismissed');
  writeSeenUntil('2026-11-13T09:00:00.000Z');
  eq(readSeenUntil(), null, 'and a write that throws is not pretended to have worked');
  is(unseenAfter(readSeenUntil(), '2020-01-01T00:00:00.000Z'), 'SO THE BAR KEEPS SHOWING — the safe direction for a warning nobody has answered');
}

/* ------------------------------------------------------------------ *
 * The wiring. Every one of these is a way the code above could be correct
 * and the screen still wrong.
 * ------------------------------------------------------------------ */
{
  const page = readFileSync(new URL('../../src/app/social/page.tsx', import.meta.url), 'utf8');

  /* The count is read against the STORED watermark, not against a constant and
     not against the browser's clock — so what the database counts and what the
     screen dismissed can never be two different questions. */
  is(/waitingForYouSince\(readSeenUntil\(\)\)/.test(page), 'the read is filtered by the watermark this device stored');
  is(
    /const waitingForYou = data && !\(seenUntil && data\.waitingNewest && data\.waitingNewest <= seenUntil\) \? data\.waitingUnseen : 0;/.test(page),
    'and the bar prints the UNSEEN count, with the tap biting before the next poll agrees with it',
  );
  /*
   * THE TAP STORES THE DATABASE'S INSTANT. `Date.now()` or an instant stamped
   * by this browser would dismiss rows that arrived in the skew between the
   * two clocks — rows nobody has ever been shown.
   */
  const mark = page.slice(page.indexOf('const markWaitingSeen'), page.indexOf('const markWaitingSeen') + 400);
  is(/const at = data\?\.waitingNewest;/.test(mark), "pressing הצג stores the newest counted row's own updated_at");
  is(/if \(!at\) return;/.test(mark), 'and does nothing at all when there is nothing waiting');
  is(!/Date\.now\(\)|new Date\(\)/.test(mark), 'NEVER THIS BROWSER’S CLOCK — a fast PC clock would hide rows that have not arrived yet');
  is(/useEffect\(\(\) => \{\s*setSeenUntil\(readSeenUntil\(\)\);\s*\}, \[\]\);/.test(page), 'storage is read on mount, not during render — the server has no localStorage');

  is(/waitingForYou > 0 \|\|/.test(page), 'the system state is raised by the UNSEEN ones');
  is(
    !/summary\.needsHuman > 0 \|\|/.test(page),
    'and not by every row that exists — that left the header amber and the panel headline reading "נדרשת פעולה שלכם" with nothing under it',
  );
  /* NOTHING IS DELETED AND NO ROW IS MOVED. A dismissal is about one person's
     attention; a status write would release the only brake holding that post
     out of the next round (see schedule-readout.ts). */
  const dismissal = page.slice(page.indexOf('const [seenUntil'), page.indexOf('const markWaitingSeen') + 400);
  is(!/updateQueueItem|status: '/.test(dismissal), 'dismissing writes nothing to the queue — not a status, not a skip, nothing');

  /* The four warnings that a person cannot answer by reading anything. */
  const bar = page.slice(page.indexOf('const intervention ='), page.indexOf('return (\n    <SocialShell'));
  eq((bar.match(/onAction:/g) ?? []).length, 1, 'ONLY the "ממתינים לכם" bar is dismissible — a sleeping PC has to keep saying so until the PC wakes up');
  is(/onAction: markWaitingSeen,/.test(bar), 'and it is always answerable now, whatever the number — which is the whole point of the rewrite');
  for (const permanent of ['הפרסום עומד — המחשב לא מחובר', 'התוכנה במחשב לא פועלת', 'פייסבוק מבקשת אימות במחשב']) {
    const at = bar.indexOf(permanent);
    is(at > 0, `the bar for "${permanent}" is still built`);
    is(!bar.slice(at, at + 400).includes('onAction'), `and "${permanent}" cannot be dismissed`);
  }

  const hero = readFileSync(new URL('../../src/components/social/LiveCampaignHero.tsx', import.meta.url), 'utf8');
  is(/onClick=\{intervention\.onAction\}/.test(hero), 'the link fires it');
  is(/onAction\?: \(\) => void/.test(hero), 'and it is optional, so the four permanent warnings render unchanged');
}

{
  const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
  const fn = client.slice(client.indexOf('export async function waitingForYouSince'));
  const body = fn.slice(0, 900);
  is(/\.in\('status', NEEDS_HUMAN_STATUSES\)/.test(body), 'the read counts exactly the statuses the bar counts, from the one list in status.ts');
  is(/count: 'exact'/.test(body), 'the number is a counted total and not the length of a capped list');
  is(/\.limit\(1\)/.test(body), 'while only one row is carried back — the watermark, on a poll that runs every 30 seconds');
  is(/\.order\('updated_at', \{ ascending: false \}\)/.test(body), 'and that row is the NEWEST, which is what makes it a watermark over all of them');
  is(/if \(since\) q = q\.gt\('updated_at', since\)/.test(body), 'a stored watermark narrows the count to what arrived after it');
  is(!/WAITING_FOR_YOU_LIMIT/.test(client), 'AND THE CAP IS GONE — it is what made the bar un-dismissable at 347 rows');

  /* The link has to open the rows being marked. It can no longer list all of
     them in one screen — that is the explicit trade above — but it must open
     the same SET, or the tap answers one question and the screen shows
     another. */
  const history = readFileSync(new URL('../../src/app/social/history/page.tsx', import.meta.url), 'utf8');
  const groups = history.slice(history.indexOf('const STATUS_GROUPS'), history.indexOf('const RANGES'));
  const manual = groups.slice(groups.indexOf("value: 'manual'"));
  is(/statuses: NEEDS_HUMAN_STATUSES/.test(manual), "?status=needs_attention opens the 'ידניים' group, which is all three statuses — the same rows being marked as shown");
  is(
    groups.indexOf("value: 'manual'") > groups.indexOf("value: 'pending'"),
    'and no earlier group claims needs_attention first — mapIncomingStatus takes the first match',
  );
}

console.log(`seen tests OK — ${checks} assertions`);
