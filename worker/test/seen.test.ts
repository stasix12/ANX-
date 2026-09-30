import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { keep, markAll, readSeen, same, unseen, writeSeen } from '../../src/lib/social/seen';

/**
 * "אחרי שפעם אחת אני לוחץ על זה וזה נעלם" — DISMISSING THE ORANGE BAR.
 *
 * WHAT IS AT STAKE, and it is not symmetric.
 *
 * The rows this bar counts are the ones NOTHING will move on its own: Facebook
 * asked for a confirmation, or the publication is waiting for the owner's own
 * approval. No worker claims them, no clock releases them. If the bar stops
 * mentioning one of them and nothing else does, that publication is simply
 * never going out, and the way the owner finds out is a customer not calling.
 *
 * So the cheap version of this feature — one "dismissed" boolean — is the one
 * thing these tests exist to make impossible. Every assertion below is about
 * the same question from a different side: CAN A ROW BE HIDDEN WITHOUT HAVING
 * BEEN SHOWN? Through a capped read, through a stale stored set, through a row
 * that was handled and came back, through storage that throws.
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

/* ------------------------------------------------------------------ *
 * The pure half: what counts as unseen.
 * ------------------------------------------------------------------ */
{
  eq(unseen(['a', 'b'], []), ['a', 'b'], 'nothing stored means nothing has been shown — the bar behaves exactly as it did before this existed');
  eq(unseen(['a', 'b'], ['a', 'b']), [], 'the set he was shown is the set that stops counting');
  eq(unseen(['a', 'b', 'c'], ['a', 'b']), ['c'], 'A ROW THAT ARRIVED AFTERWARDS IS STILL UNSEEN — this is the whole difference from a "hidden" flag');
  eq(unseen([], ['a']), [], 'and a stored id that is no longer waiting cannot invent a row');

  eq(unseen(['a', 'a', 'b'], []), ['a', 'b'], 'a duplicated id is one row, or the bar counts higher than the list it opens');

  /* The one that looks like an edge case and is the common case: he is shown
     two, handles one, and a third appears before the next poll. */
  eq(unseen(['b', 'c'], ['a', 'b']), ['c'], 'one handled and one new: the bar comes back, and it comes back saying 1 rather than 2');
}

/* ------------------------------------------------------------------ *
 * The pruning half, which is what lets the SAME row speak twice.
 * ------------------------------------------------------------------ */
{
  eq(keep(['a', 'b'], ['a']), ['a'], 'an id that is no longer waiting leaves the stored set');
  eq(keep(['a'], []), [], 'and a set with nothing left waiting empties completely');
  eq(keep([], ['a']), [], 'a set that was never written stays empty');

  /*
   * REINSTATEMENT. A row goes needs_attention, is shown, is retried, publishes
   * — and weeks later the same id is stuck again. Without the prune it is
   * still in the stored set and the bar never mentions it.
   */
  const shown = markAll(['a']);
  const afterFixed = keep(shown, []);
  eq(unseen(['a'], afterFixed), ['a'], 'A ROW THAT WAS HANDLED AND CAME BACK IS UNSEEN AGAIN — the prune is what makes this true');
  eq(unseen(['a'], shown), [], 'without the prune it would have stayed silent for ever, which is the bug being prevented');

  /* And the same property is what bounds the key: it can never hold more ids
     than are waiting at that moment. */
  is(keep(['a', 'b', 'c', 'd'], ['b']).length <= 1, 'the stored set cannot outgrow what is actually waiting');
}

{
  eq(markAll(['b', 'a', 'a']), ['b', 'a'], 'pressing הצג marks everything waiting, once each');
  is(same(['a', 'b'], ['b', 'a']), 'order is not a difference — otherwise every 30-second poll would rewrite storage and re-render');
  is(!same(['a'], ['a', 'b']), 'but a different membership is');
  is(!same(['a', 'b'], ['a', 'c']), 'including one swapped id at the same length');
}

/* ------------------------------------------------------------------ *
 * Storage, and every way it can hand back something that is not a set.
 * ------------------------------------------------------------------ */
{
  const store = new Map<string, string>();
  (globalThis as { localStorage?: unknown }).localStorage = {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
  };

  eq(readSeen(), [], 'an untouched browser has been shown nothing');
  writeSeen(['a', 'b']);
  eq(readSeen(), ['a', 'b'], 'and what was written comes back');
  writeSeen([]);
  eq(readSeen(), [], 'an emptied set is emptied, not left behind');

  for (const junk of ['not json', '"a"', '{"dismissed":true}', '42', 'null', '["a",7,null,"b"]']) {
    store.set('social:waiting:seen', junk);
    const got = readSeen();
    is(Array.isArray(got), `a stored value of ${junk} still reads as a list`);
    is(got.every((v) => typeof v === 'string'), `and holds only ids — ${junk}`);
  }
  eq(readSeen(), ['a', 'b'], 'a mixed array keeps its ids and drops the rest rather than throwing the lot away');

  /* An older shape of this key — the boolean this feature deliberately is not
     — must read as "nothing shown", never as "everything shown". */
  store.set('social:waiting:seen', '{"dismissed":true}');
  eq(unseen(['x'], readSeen()), ['x'], 'a dismissal flag left by any earlier version hides nothing');
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
  eq(readSeen(), [], 'storage that throws reads as nothing shown');
  writeSeen(['a']);
  checks += 1;
  eq(unseen(['a'], readSeen()), ['a'], 'SO THE BAR KEEPS SHOWING — the safe direction for a warning nobody has answered');
}

/* ------------------------------------------------------------------ *
 * The wiring. Every one of these is a way the pure code above could be
 * correct and the screen still wrong.
 * ------------------------------------------------------------------ */
{
  const page = readFileSync(new URL('../../src/app/social/page.tsx', import.meta.url), 'utf8');

  is(
    /waitingCovered = !!data && waitingIds\.length === summary\.needsHuman/.test(page),
    'the screen checks that the ID list covers the counted total',
  );
  is(
    /const waitingForYou = waitingCovered \? unseen\(waitingIds, seen\)\.length : summary\.needsHuman/.test(page),
    'A CAPPED READ FALLS BACK TO THE FULL COUNT — otherwise one tap hides rows that were never on screen',
  );
  is(/onAction: waitingCovered \? markWaitingSeen : undefined/.test(page), 'and the bar cannot be dismissed at all while the list is short');

  is(/waitingForYou > 0 \|\|/.test(page), 'the system state is raised by the UNSEEN ones');
  is(
    !/summary\.needsHuman > 0 \|\|/.test(page),
    'and not by every row that exists — that left the header amber and the panel headline reading "נדרשת פעולה שלכם" with nothing under it',
  );

  is(/const next = keepSeen\(seen, data\.waitingForYou\)/.test(page), 'the stored set is pruned against what is really waiting, on every load');
  is(/if \(sameSeen\(next, seen\)\) return;/.test(page), 'and only written when it changed, so a 30-second poll is not a write');
  is(/useEffect\(\(\) => \{\s*setSeen\(readSeen\(\)\);\s*\}, \[\]\);/.test(page), 'storage is read on mount, not during render — the server has no localStorage');

  /* The four warnings that a person cannot answer by reading anything. */
  const bar = page.slice(page.indexOf('const intervention ='), page.indexOf('return (\n    <SocialShell'));
  eq((bar.match(/onAction:/g) ?? []).length, 1, 'ONLY the "ממתינים לכם" bar is dismissible — a sleeping PC has to keep saying so until the PC wakes up');
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
  const fn = client.slice(client.indexOf('export async function listWaitingForYouIds'));
  is(/\.select\('id'\)/.test(fn.slice(0, 500)), 'the read takes one column — no join, no media, no target, on a poll that runs every 30 seconds');
  is(/\.in\('status', NEEDS_HUMAN_STATUSES\)/.test(fn.slice(0, 500)), 'and exactly the statuses the bar counts, from the one list in status.ts');
  is(/\.limit\(WAITING_FOR_YOU_LIMIT\)/.test(fn.slice(0, 500)), 'bounded, like every other read on this screen');

  /* The link has to open the rows being marked, or a tap hides publications
     the screen behind it never listed. */
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
