import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

/**
 * THE SPEED PASS, AND THE ONE RULE IT WAS DONE UNDER.
 *
 * "המטרה היא אך ורק לשפר ביצועים ומהירות, מבלי לפגוע, לשנות או להסיר שום
 *  פונקציונליות קיימת... אם אופטימיזציה מסוימת עלולה לשנות אפילו במעט את
 *  ההתנהגות הקיימת — אל תבצע אותה."
 *
 * So this file is not about speed. Speed is measured, separately and by hand,
 * and the numbers are in the commit. This is about the thing a speed pass
 * actually risks: a screen that is faster and subtly wrong.
 *
 * Every assertion below is of the form "this is still true". The snapshot
 * cache is never read instead of the database, it dies with the tab, it is
 * dropped when the account changes and not when a token refreshes; the
 * dashboard's rollup still sees only live campaigns; the narrowed post read
 * still returns the same rows in the same order; the city backfill still
 * writes the same value. Those are the five ways this pass could have been a
 * bug, and each one is pinned where it lives.
 *
 *   npx tsx worker/test/performance.test.ts
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
const src = (rel: string) => readFileSync(new URL(`../../${rel}`, import.meta.url), 'utf8');

/**
 * The same file with its comments taken out.
 *
 * EVERY "THIS IS NOT IN THE SOURCE ANY MORE" CHECK READS THIS AND NOT THE
 * FILE. Three of them, written against the raw text, passed on their own
 * explanations: the note saying "no chip count is recomputed in the JSX"
 * contains the expression it is about, so the guard matched the comment and
 * could never fail. A negative source check that includes prose is not a
 * check.
 */
const code = (rel: string) =>
  src(rel)
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .replace(/^\s*\/\/.*$/gm, '');

/* ------------------------------------------------------------------ *
 * 1. THE SNAPSHOT CACHE — what a screen opens on while its read runs.
 * ------------------------------------------------------------------ */
{
  const snap = src('src/lib/social/snapshot.ts');

  /*
   * IT DIES WITH THE TAB. Anything on disk outlives the sign-in and the
   * account, and a screen that can paint a previous person's campaigns is a
   * worse outcome than any skeleton. A Map in module scope cannot.
   */
  is(/const store = new Map<string, unknown>\(\)/.test(snap), 'the cache is a module Map');
  is(!/localStorage|sessionStorage|indexedDB/i.test(code('src/lib/social/snapshot.ts')), 'AND IT TOUCHES NO PERSISTENT STORAGE — a reload starts from the database, as it did before this existed');

  /*
   * IT IS DROPPED WHEN THE ACCOUNT CHANGES, AND ONLY THEN. Supabase fires
   * TOKEN_REFRESHED about hourly with the same user; reacting to the event
   * rather than to the user id would empty the cache under a screen that is
   * using it, which is a slower product, not a wrong one — but reacting to
   * NEITHER is the wrong one, and that is what is being pinned.
   */
  is(/onAuthStateChange/.test(snap), 'it listens for the account changing');
  is(/const next = session\?\.user\?\.id \?\? null;[\s\S]{0,120}if \(next !== owner\)[\s\S]{0,60}store\.clear\(\)/.test(snap), 'and clears everything when the signed-in USER changes — not on every auth event, so an hourly token refresh does not empty it');

  /* One key per screen, in one place, so two screens cannot share one. */
  const keys = [...snap.matchAll(/^\s{2}(\w+): '([^']+)',$/gm)].map((m) => m[2]);
  eq(keys.length, new Set(keys).size, `two screens share a snapshot key — ${keys.join(', ')}`);
  is(keys.length >= 4, 'the four seeded screens each have a key');
}

/* ------------------------------------------------------------------ *
 * 2. SEEDING IS A FIRST PAINT, NOT A DATA SOURCE.
 *
 * The whole safety of this change rests on one property: every screen still
 * runs its load() on mount, on the same schedule, against the database, and
 * replaces whatever the snapshot put on screen. If a screen ever seeds and
 * then SKIPS the read, it is showing numbers nobody asked the database for —
 * which this product's own house rule forbids.
 * ------------------------------------------------------------------ */
{
  /*
   * The third entry is how THAT screen starts its read on mount, because the
   * four do it differently and the property — "it still reads" — is the same.
   * The dashboard runs its poller's first tick immediately; the others call
   * load()/reload() from an effect.
   */
  const screens: [string, string, string, RegExp][] = [
    ['the dashboard', 'src/app/social/page.tsx', 'SNAPSHOT.dashboard', /tick\(\);\s*\n\s*const id = setInterval\(tick, 30_000\);/],
    ['the campaigns list', 'src/app/social/campaigns/page.tsx', 'SNAPSHOT.campaigns', /useEffect\(\(\) => \{\s*load\(\);\s*\}, \[load\]\);/],
    ['the groups screen', 'src/app/social/groups/page.tsx', 'SNAPSHOT.groups', /useEffect\(\(\) => \{\s*reload\(\);\s*\}, \[reload\]\);/],
    ['the library', 'src/app/social/library/page.tsx', 'SNAPSHOT.library', /useEffect\(\(\) => \{\s*load\(\);\s*\}, \[load\]\);/],
  ];
  for (const [what, file, key, mounts] of screens) {
    const page = src(file);
    is(page.includes(`readSnapshot<`) && page.includes(key), `${what} seeds its first paint from ${key}`);
    is(page.includes(`writeSnapshot<`), `${what} keeps what its read produced`);

    /*
     * READ IN A useState INITIALISER AND NOWHERE ELSE. The snapshot is
     * mutable module state: read during a later render, two renders of the
     * same component could disagree about what is on screen, which is the
     * classic tearing bug and is invisible until it is not.
     */
    is(/useState\(\(\) => readSnapshot</.test(page), `${what} reads the snapshot only in a useState initialiser`);

    /* THE READ STILL RUNS. A seeded screen that stopped fetching would look
       instant and be wrong, and nothing else here would catch it. */
    is(mounts.test(page), `${what} still loads on mount — the snapshot is what is drawn WHILE it runs, never instead of it`);

    /*
     * AND IT IS KEPT ONLY ON SUCCESS. Every one of these load()s writes the
     * snapshot inside the try, after setError(null) or beside the last
     * setState — never in the catch — so a half-failed read cannot become
     * what the next visit opens on.
     */
    const at = page.indexOf('writeSnapshot<');
    const catchAt = page.indexOf('} catch (err) {', page.indexOf('const load'));
    is(catchAt === -1 || at < catchAt, `${what} writes its snapshot only on a read that came back whole`);
  }
}

/* ------------------------------------------------------------------ *
 * 3. THE DASHBOARD'S CRITICAL PATH — one round trip shorter, same reads.
 * ------------------------------------------------------------------ */
{
  const page = src('src/app/social/page.tsx');
  const load = page.slice(page.indexOf('const load = useCallback'), page.indexOf('setUpdatedAt(new Date())'));

  /*
   * `await listCampaigns()` used to block the batch of twenty. Only
   * campaignStates() needs its result; the other nineteen were waiting for
   * nothing, so the cost was RTT(campaigns) + RTT(the rest) rather than the
   * longer of the two.
   */
  is(!/const campaigns = await listCampaigns\(\)/.test(code('src/app/social/page.tsx')), 'the campaigns read no longer blocks the other nineteen');
  is(/const campaignsPromise = listCampaigns\(\);/.test(load), 'it is started');
  is(/const statesPromise = campaignsPromise\.then/.test(load), 'and only the one read that needs it is chained behind it');

  /*
   * AND IT STILL SEES EXACTLY THE SAME IDS. This is the whole correctness
   * question of that change: campaignStates() is handed the LIVE campaigns
   * and not all of them, which is what keeps the rollup proportional to what
   * the hero can show. Dropping the filter while moving the call would have
   * been invisible on screen and would have read every archived run's queue.
   */
  is(
    /campaignStates\(cs\.filter\(\(c\) => c\.status !== 'archived'\)\.map\(\(c\) => c\.id\)\)/.test(load),
    'THE ROLLUP IS STILL SCOPED TO LIVE CAMPAIGNS — same filter, same ids, same result',
  );
  /* Both are still awaited together, so nothing downstream sees a promise. */
  is(/await Promise\.all\(\[\s*campaignsPromise,\s*statesPromise,/.test(load), 'and both are awaited in the same batch as everything else');
}

/* ------------------------------------------------------------------ *
 * 4. THE NARROWED POST READ — fewer bytes, identical rows.
 * ------------------------------------------------------------------ */
{
  const client = src('src/lib/social/client.ts');
  /* THE FUNCTION BODY, ending at its own closing brace. Slicing to the next
     export swept in the doc comments that follow it — which describe
     listRecentPosts and say the words "base_text" — and the last check below
     was then reading somebody else's prose. */
  const fnAt = client.indexOf('export async function listCampaignPosts');
  const fn = client.slice(fnAt, client.indexOf('\n}\n', fnAt) + 3);
  is(fnAt > -1 && fn.length > 100 && fn.length < 800 && fn.trimEnd().endsWith('}'), 'listCampaignPosts exists and the slice is the function alone');

  /*
   * THE ORDER IS THE PART THAT MATTERS. The campaigns screen takes [0] of a
   * campaign's posts as "the one last worked on" — the post "ערוך" opens.
   * listPosts() ordered by updated_at descending; a narrowed read that
   * dropped the order would quietly open a different post.
   */
  is(/\.order\('updated_at', \{ ascending: false \}\)/.test(fn), 'ordered newest-edited first, exactly as listPosts() was — this is what decides which post "ערוך" opens');
  is(/\.neq\('status', 'archived'\)/.test(fn), 'and archived posts are still excluded');
  const selected = fn.slice(fn.indexOf('.select('), fn.indexOf('.neq('));
  is(/updated_at/.test(selected), 'the column the order depends on is actually selected');
  is(!/base_text/.test(fn.replace(/\/\*[\s\S]*?\*\//g, '')), 'and the post bodies are not downloaded to draw a thumbnail');

  const page = src('src/app/social/campaigns/page.tsx');
  is(/listCampaignPosts\(\)/.test(page), 'the campaigns screen uses it');
  is(!/\blistPosts\(\)/.test(code('src/app/social/campaigns/page.tsx')), 'and no longer pulls every post in the account');

  /* The three facts the cards actually need are all still there. */
  for (const field of ['id', 'campaign_id', 'media']) {
    is(new RegExp(`\\b${field}\\b`).test(selected), `${field} is selected — the cards read it`);
  }
}

/* ------------------------------------------------------------------ *
 * 5. THE CITY BACKFILL — same value, written once instead of for ever.
 * ------------------------------------------------------------------ */
{
  const client = src('src/lib/social/client.ts');
  const fn = client.slice(client.indexOf('export async function listTargets'), client.indexOf('export async function updateTarget'));

  /*
   * THE REPAIR ITSELF IS UNTOUCHED: the same detectCity(), into the same
   * column, on the same rows. What changed is that it is ATTEMPTED once per
   * row per session instead of on every call — and this function is called by
   * six screens plus a thirty-second poll, each time firing one unbounded
   * concurrent write per city-less group through the connection the screen
   * was waiting on.
   */
  is(/t\.city = detectCity\(t\.name\);/.test(fn), 'the city is still derived the same way');
  is(/\.update\(\{ city: t\.city \}\)\.eq\('id', t\.id\)/.test(fn), 'and still written to the same column of the same row');
  is(/const cityBackfilled = new Set<string>\(\)/.test(client), 'rows already attempted this session are remembered');
  is(/if \(cityBackfilled\.has\(t\.id\)\) continue;/.test(fn), 'and are not written again');

  /*
   * THE ORDER OF THOSE TWO LINES IS THE WHOLE BUG-OR-NOT. `t.city` must be
   * set BEFORE the skip, or the second caller in a session gets rows with an
   * empty city and every screen that groups by city loses them into "אחר".
   */
  const assign = fn.indexOf('t.city = detectCity(t.name);');
  const skip = fn.indexOf('if (cityBackfilled.has(t.id)) continue;');
  is(assign > -1 && skip > assign, 'THE IN-MEMORY VALUE IS SET BEFORE THE SKIP — every caller gets the same rows it always got, written or not');
}

/* ------------------------------------------------------------------ *
 * 6. THE GROUPS SCREEN'S CHIP COUNTS — same numbers, one pass.
 * ------------------------------------------------------------------ */
{
  const page = src('src/app/social/groups/page.tsx');
  is(!/count: all\.filter\(/.test(code('src/app/social/groups/page.tsx')), 'no chip count is recomputed inside the JSX any more — that was a full pass over every group per city, on every keystroke');
  is(/const cityCounts = useMemo/.test(page) && /const categoryCounts = useMemo/.test(page), 'both are counted once per list');
  is(/count: cityCounts\.get\(c\) \?\? 0/.test(page), 'and the city chips read the map');
  is(/count: categoryCounts\.get\(c\) \?\? 0/.test(page), 'and so do the category chips');

  /*
   * THE SAME PREDICATE, which is what makes the numbers identical. The city
   * chip counted `cityOf(g) === c` and the category chip `g.category === c`;
   * the maps are keyed by exactly those two expressions.
   */
  is(/n\.set\(cityOf\(g\), \(n\.get\(cityOf\(g\)\) \?\? 0\) \+ 1\)/.test(page), 'the city map is keyed by cityOf(), the same function the chip filtered on');
  is(/n\.set\(g\.category \?\? '', \(n\.get\(g\.category \?\? ''\) \?\? 0\) \+ 1\)/.test(page), 'and the category map by the category itself');
}

/* ------------------------------------------------------------------ *
 * 7. AND THE COUNTS REALLY ARE THE SAME — run, not asserted in a comment.
 *
 * The two shapes, on the owner's own numbers (155 groups, 30 cities), with
 * the awkward cases in: a group with no city at all, one with no category,
 * and a city nothing is in.
 * ------------------------------------------------------------------ */
{
  const CITIES = ['באר שבע', 'ערד', 'דימונה', 'אופקים', 'נתיבות', 'אחר'];
  const CATS = ['לוחות מכירה', 'דוברי רוסית', '', 'קהילה'];
  const all = Array.from({ length: 155 }, (_, i) => ({
    id: String(i),
    /* Every fifth group has no city at all — the case cityOf() exists for. */
    city: i % 5 === 0 ? '' : CITIES[i % CITIES.length],
    category: CATS[i % CATS.length],
  }));
  const cityOf = (g: { city: string }) => g.city || 'אחר';
  const cities = [...new Set(all.map(cityOf)), 'עיר שאין בה אף קבוצה'];
  const categories = [...new Set(all.map((g) => g.category).filter(Boolean))];

  const cityCounts = new Map<string, number>();
  for (const g of all) cityCounts.set(cityOf(g), (cityCounts.get(cityOf(g)) ?? 0) + 1);
  const categoryCounts = new Map<string, number>();
  for (const g of all) categoryCounts.set(g.category ?? '', (categoryCounts.get(g.category ?? '') ?? 0) + 1);

  eq(
    cities.map((c) => cityCounts.get(c) ?? 0),
    cities.map((c) => all.filter((g) => cityOf(g) === c).length),
    'every city chip shows the number the old filter produced — including the one no group is in, which must be 0 and not undefined',
  );
  eq(
    categories.map((c) => categoryCounts.get(c) ?? 0),
    categories.map((c) => all.filter((g) => g.category === c).length),
    'and so does every category chip',
  );
  eq(cityCounts.get('אחר'), all.filter((g) => cityOf(g) === 'אחר').length, 'the groups with no city of their own still land in "אחר", counted once each');
}

console.log(`performance-pass guards OK — ${checks} assertions`);
