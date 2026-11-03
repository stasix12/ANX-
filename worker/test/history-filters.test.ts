/*
 * THREE FILTERS REMOVED FROM HISTORY — AND TWO LINKS THAT MUST SURVIVE THEM.
 *
 * "בהיסטוריה למחוק קטגוריות: תקועים, ידניים וגם את כל השיטות, הכל מתפרסם
 *  מאותו המקום אצלי ואצל הלקוחות ככה שזה לא רלוונטי"
 *
 * The method row was three names for one thing: every publication this
 * product makes goes out through a browser on a PC, so "API רשמי" and
 * "בסיוע דפדפן" were a distinction with nothing behind it.
 *
 * "תקועים" and "ידניים" are different, and deleting them outright would have
 * cost something real. The dashboard's own intervention cards link straight
 * into this screen with ?status=paused and ?status=needs_attention, and they
 * are pressed at the one moment something is wrong. With the buckets gone,
 * mapIncomingStatus finds nothing, the link lands unfiltered, and
 * "N פרסומים תקועים" opens five hundred rows — which is the exact fault the
 * comment that used to sit on the 'stuck' bucket was written about.
 *
 * So they are hidden from the bar and kept as destinations. This file pins
 * both halves, because either one alone is a regression.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const is = (c: unknown, m: string) => { checks += 1; assert.ok(c, m); };
const eq = (a: unknown, b: unknown, m: string) => { checks += 1; assert.equal(a, b, m); };

const read = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');
const page = read('src/app/social/history/page.tsx');
const dash = read('src/app/social/page.tsx');
/*
 * Comments are documentation, not screen. The negative checks below must not
 * fire on the paragraph that EXPLAINS the removal — a test that forbids
 * writing down why something was deleted is a test that deletes the reason
 * with it. (This caught itself on the first run.)
 */
const code = page.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
is(code.includes('STATUS_GROUPS'), 'the stripped source is still the screen');

// ──────────────── 1. The method filter is gone, root and branch ───────────
for (const gone of ['כל השיטות', 'API רשמי', 'בסיוע דפדפן', 'label="שיטה"']) {
  is(!code.includes(gone), `"${gone}" is no longer on the screen`);
}
is(!/const \[method, setMethod\]/.test(code), 'and its state went with it');
is(!/\(r\.method \?\? ''\) !== method/.test(code), 'and the row filter it drove');
is(!/setMethod\(/.test(code), 'and nothing still tries to clear it');
/* The COLUMN is untouched — this was a filter, not a feature. */
is(read('src/lib/social/types.ts').includes('PublishMethod'), 'the method a row was published by is still recorded');

// ──────────────── 2. The two buckets leave the bar ────────────────────────
is(/{ value: 'stuck',[^}]*hidden: true }/.test(page), '"תקועים" is hidden from the bar');
is(/{ value: 'manual',[^}]*hidden: true }/.test(page), 'and so is "ידניים"');
is(
  /options=\{STATUS_GROUPS\.filter\(\(g\) => !g\.hidden/.test(page),
  'and the bar is built from the ones that are not hidden',
);

// ──────────────── 3. …but they are still reachable destinations ───────────
/*
 * This is the half that is easy to lose. The buckets must still be in
 * STATUS_GROUPS, because mapIncomingStatus searches exactly that list.
 */
is(page.includes("{ value: 'stuck', label: 'תקועים', statuses: ['paused']"), "'paused' still maps to a bucket of its own");
is(page.includes("{ value: 'manual', label: 'ידניים', statuses: NEEDS_HUMAN_STATUSES"), 'and the needs-a-person statuses to theirs');
is(
  /const hit = STATUS_GROUPS\.find\(\(g\) => g\.statuses\.includes/.test(page),
  'and an incoming ?status= is still mapped through that same list',
);
/* The links themselves, on the screen that owns them. */
is(dash.includes("'/social/history?status=paused'"), 'the dashboard still links at the stuck rows');
is(dash.includes("'/social/history?status=needs_attention'"), 'and at the ones waiting for a person');

// ──────────────── 4. A filter with no visible cause is worse than either ──
is(
  /\|\| g\.value === group/.test(page),
  'a hidden bucket that IS the current filter comes back into the bar, so the list never filters for a reason the screen does not show',
);

// ──────────────── 5. The rest of the bar is untouched ─────────────────────
for (const kept of ['הכל', 'פורסמו', 'ממתינים', 'נכשלו', 'דולגו']) {
  is(page.includes(`label: '${kept}'`), `"${kept}" is still offered`);
}
eq((page.match(/hidden: true/g) ?? []).length, 2, 'exactly two buckets were hidden, and nothing else was touched');

console.log(`history filters OK — ${checks} checks`);
