/*
 * "תבדוק אם ה supbase למה הכל דולג עכשיו, לא צריך לנחש נפתור הכל פעם אחת"
 *
 * His own database answered it, in two rows:
 *
 *   הקמפיין של השורה        הקמפיין של הפוסט        כמה
 *   טסט חדש · archived      טסט חדש · archived      679
 *   סבב פרסום · archived    סבב פרסום · archived    406
 *
 * 1,085 publications skipped with "הסבב נעצר", and the queue row and the POST
 * both pointing at a campaign that is finished. Three minutes earlier his bell
 * showed "חזרה יומית הופעלה", several times over.
 *
 * THE LOOP, AND ALL THREE STEPS ARE OURS:
 *
 *   1. stopCampaign() archives the run and switches its posts' schedules off.
 *      It deliberately leaves post.campaign_id pointing at the archived run —
 *      that row IS the run's history and rewriting it would lose which round
 *      published what. Correct, and it stays.
 *   2. setCampaignRepeat() then looked those same posts up BY that
 *      campaign_id and wrote `active: true` back onto their weekly schedules,
 *      without once asking whether the campaign was still alive. A finished
 *      round, publishing again.
 *   3. planQueue stamps every new row with the POST's campaign_id — still the
 *      archived one — and rules.ts refuses each one as it is looked at:
 *      "הסבב נעצר". The card reads פעיל the whole time, because it is drawing
 *      a DIFFERENT campaign row that happens to share the name.
 *
 * So the engine was right all night and the DATA was wrong, and step 2 is the
 * line that made it wrong. Arming a finished round cannot produce a
 * publication — only rows that are skipped the moment they are read.
 *
 * WHY THE GUARD IS WRITTEN IN THE SOURCE AND NOT DRIVEN: client.ts holds its
 * own Supabase client behind db() with no injection point, so the fake-PostgREST
 * harness the engine tests use (campaign-gap.test.ts) cannot reach it. What IS
 * driven here is repeatRefusedText(), which is pure, and which is the half the
 * owner actually reads.
 */
import assert from 'node:assert';
import { readFileSync } from 'node:fs';
import { repeatRefusedText } from '../../src/lib/social/client';

const read = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const strip = (src: string) =>
  src
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, ''))
    .join('\n');

const client = strip(read('../../src/lib/social/client.ts'));

let checks = 0;
const ok = (cond: unknown, msg: string) => {
  assert.ok(cond, msg);
  checks++;
};
const eq = (a: unknown, b: unknown, msg: string) => {
  assert.equal(a, b, msg);
  checks++;
};

function between(src: string, from: string, to: string, what: string): string {
  const a = src.indexOf(from);
  assert.ok(a > -1, `${what}: the opening anchor is gone — re-point this rather than deleting it`);
  const b = src.indexOf(to, a + from.length);
  assert.ok(b > a, `${what}: the closing anchor is gone — re-point this rather than deleting it`);
  return src.slice(a, b);
}

/* ─────────── one: the switch asks whether the round is alive ───────────── */

const fn = between(client, 'export async function setCampaignRepeat', 'const existing = unwrap', 'setCampaignRepeat');

ok(/from\('social_campaigns'\)\s*\.select\('status'\)/.test(fn), "setCampaignRepeat reads the campaign's status");
ok(/refused: 'archived'/.test(fn), 'and refuses outright when the round is finished');
ok(/refused: 'unknown'/.test(fn), 'and refuses when it could not tell — a read that failed is not permission');

/*
 * BEFORE THE FIRST WRITE, which is the whole of it.
 *
 * The guard is worth nothing after `update(repeatColumns(...))`: the switch
 * would already be on in the database, the card would draw a daily repeat,
 * and only the arming would have been skipped.
 */
const guardAt = fn.indexOf("select('status')");
const writeAt = fn.indexOf('update(repeatColumns(');
ok(writeAt > -1, 'the repeat columns are still written here — re-point this rather than deleting it');
ok(guardAt > -1 && guardAt < writeAt, 'and the status is read BEFORE them: a refusal that writes the switch anyway is not a refusal');

ok(/'campaign_repeat_refused'/.test(fn), 'the refusal reaches the activity log, so it is visible without a toast anybody saw');

/* ─────────── two: and it is classified where an event must be ──────────── */

const kinds = read('../../src/lib/social/activity.ts');
const words = read('../../src/lib/social/activity-text.ts');
ok(/campaign_repeat_refused: 'failure'/.test(kinds), "the refusal is a failure, not quiet round news — he asked for something and it did not happen");
ok(/campaign_repeat_refused: '/.test(words), 'and it has a Hebrew headline, or the feed prints a bare event name');

/* ─────────── three: the three facts, told apart ────────────────────────── */

eq(repeatRefusedText('סבב פרסום', undefined), null, 'a round that was simply never launched keeps its own sentence — this one stays out of the way');
ok(
  (repeatRefusedText('סבב פרסום', 'archived') ?? '').includes('הסתיים'),
  'a finished round says it is finished, instead of "עוד לא יצא אף פעם" — which would send him to launch what is already launched',
);
ok(
  (repeatRefusedText('סבב פרסום', 'archived') ?? '').includes('השיקו את הפוסט מחדש'),
  'and names the one action that does work',
);
ok(
  (repeatRefusedText('סבב פרסום', 'unknown') ?? '').includes('נסו שוב'),
  'a read that failed asks him to try again, rather than claiming anything about the round',
);
for (const r of ['archived', 'unknown'] as const) {
  ok((repeatRefusedText('סבב פרסום', r) ?? '').includes('סבב פרסום'), `the ${r} sentence names the round, so a screen with several is not ambiguous`);
}

/* ─────────── four: both screens use it ─────────────────────────────────── */

for (const page of ['../../src/app/social/page.tsx', '../../src/app/social/campaigns/page.tsx']) {
  const src = strip(read(page));
  const uses = (src.match(/repeatRefusedText\(/g) ?? []).length;
  eq(uses, 2, `${page}: both places that report an un-armed repeat ask for the right sentence (found ${uses})`);
  ok(/repeatRefusedText,/.test(read(page)), `${page}: and imports it rather than copying the wording`);
}

/* ─────────── five: the history rule the fix must not "solve" ───────────── */

/*
 * The cheap way to stop this loop is to have stopCampaign() blank
 * post.campaign_id. That would end the skips and lose which round published
 * what, for ever, on a product whose whole screen is "סבבי פרסום". The fix
 * belongs in the switch, and this is the assertion that keeps it there.
 */
const stop = between(client, 'export async function stopCampaign', 'return rows.length', 'stopCampaign');
ok(/status: 'archived'/.test(stop), 'stop still archives the round');
ok(/social_schedules'\)[\s\S]{0,80}active: false/.test(stop), 'and still switches its schedules off');
/* The READ by campaign_id is how it finds the run's posts at all; what is
   forbidden is a WRITE to that column. Pinned as "no update that carries
   campaign_id", so the earlier `.select('id').eq('campaign_id', id)` does not
   trip it — it did, on the first version of this assertion. */
ok(
  !/update\(\s*\{[^}]*campaign_id/.test(stop),
  'and still does NOT rewrite post.campaign_id — that row is the run’s history, and blanking it would hide this bug rather than fix it',
);
ok(
  /social_posts'\)\s*\.select\('id'\)\.eq\('campaign_id'/.test(stop),
  'it still FINDS the run’s posts by that column, which is the read the rule above must not forbid',
);

console.log(`✓ dead-run-repeat: ${checks} בדיקות עברו`);
