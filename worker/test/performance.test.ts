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
    /*
     * THE CAMPAIGNS LIST NOW POLLS, so its mount effect is the poller's first
     * tick rather than a bare load(). It read ONCE before, on mount: after a
     * publication, a failure, a skip or a pause it kept the numbers it was
     * born with while the dashboard one tap away refreshed every thirty
     * seconds — the same round, two different counts, reconcilable only by
     * leaving the screen. The claim this guard makes is unchanged: the read
     * still runs, and the snapshot is what is drawn WHILE it runs.
     */
    ['the campaigns list', 'src/app/social/campaigns/page.tsx', 'SNAPSHOT.campaigns', /tick\(\);\s*const id = setInterval\(tick, 60_000\);/],
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

/* ------------------------------------------------------------------ *
 * 8. THE FIVE THE FULL AUDIT FOUND — each one pinned where it lives.
 *
 * These are not performance findings; they are in this file because it is
 * where the audit's fixes landed and because every one of them is a thing
 * that was true, is no longer, and must not quietly become true again.
 * ------------------------------------------------------------------ */
{
  const worker = code('worker/social-worker.ts');
  const client = code('src/lib/social/client.ts');

  /*
   * A. THE DOUBLE-POST PATH. "המשך סבב" re-armed every needs_attention row,
   * including the ones the worker parked at or past the final click — rows
   * whose post may already be on Facebook. rules.ts cannot catch that: both
   * its duplicate guards count rows with status = 'published', and a parked
   * row is needs_attention.
   */
  is(/const mayAlreadyBePosted = lastStep === 'publishing' \|\| lastStep === 'verifying';/.test(worker), 'the worker knows whether the final click had happened — lastStep is the composer’s own progress');
  is(/if \(afterSubmit\) \{[\s\S]{0,400}step: 'submitted'/.test(worker), 'a PublishError that says the button was pressed parks the row as submitted');
  is(/\.in\('status', \['publishing', 'awaiting_confirmation'\]\)/.test(worker) && /step: 'submitted', error: 'ה-worker הופסק/.test(worker), 'and so does the startup sweep of a job the worker died inside');
  /*
   * THROUGH THE CONSTANT NOW, AND THAT IS THE POINT OF THE CHANGE.
   *
   * This pinned the LITERAL `.neq('step', 'submitted')`, and the literal was
   * itself the defect: the exclusion existed in resumeNeedsAttention alone
   * while SEVEN bulk cancels wrote `step: ''` over the same rows, erasing the
   * only record that the post might be live. One rule, written down in one
   * function and ignored in seven — which is what a literal does.
   *
   * MAYBE_LIVE_STEP (src/lib/social/status.ts) is the single place that says
   * which step means "may already be live", beside the status classification
   * that creates the hazard in the first place. So the check asks for the
   * CONSTANT, and worker/test/maybe-live.test.ts refuses a literal anywhere in
   * these filters — it is what caught this very line still carrying one.
   */
  is(/\.neq\('step', MAYBE_LIVE_STEP\)/.test(client), 'AND THE BULK RE-ARM SKIPS EXACTLY THOSE — this is the line between a retry and a second post to the same group');
  /* And the seven bulk cancels skip them too, which this guard never asked:
     re-arming was only one of eight doors to the same second post. */
  is(
    (client.match(/\.neq\('step', MAYBE_LIVE_STEP\)/g) ?? []).length >= 7,
    'and so does every bulk cancel — the re-arm was one door of eight, and maybe-live.test.ts scans for the rest',
  );
  /* The owner is not left without a way back: per-row retry still covers them. */
  is(/const RETRYABLE: QueueItem\['status'\]\[\] = \[[^\]]*'needs_attention'/.test(client), 'the per-row "נסה שוב" still reaches them, which is the decision only the owner can make');

  /*
   * B. THE NIGHTLY SWEEP THAT COULD RETIRE THE LIST. "cannot post here" means
   * "you left" only for a personal profile; for a Page it usually means the
   * group does not allow Pages. runJob already guards this; the sweep did not,
   * and it walks every enabled group between 02:00 and 04:00.
   */
  is(/if \(profile\.canPost === false && !state\.asPage\) \{/.test(worker), 'the nightly profile sweep does not switch groups off while signed in as a Page');

  /*
   * C. A TIMEOUT IS NOT A CANCELLATION. All three verdicts used to collapse
   * into one and be written as terminal 'skipped', so closing the worker for
   * the evening, or fifteen minutes away from the dashboard, destroyed the
   * publication for good.
   */
  is(/Promise<'confirmed' \| 'declined' \| 'timeout' \| 'stopped'>/.test(worker), 'the three ways a confirmation can end are three different answers');
  is(/if \(stopping\) return 'stopped';/.test(worker), 'a worker being shut down says so');
  is(
    /if \(result\.cancelReason === 'timeout' \|\| result\.cancelReason === 'stopped'\) \{[\s\S]{0,400}status: 'scheduled'/.test(worker),
    'AND NEITHER OF THEM SKIPS THE ROW — it is handed back, like every other "not yet" in this worker',
  );
  is(/confirmed_at: null,/.test(worker), 'with the confirmation stamp cleared, so the next round still asks');
  is(/status: 'skipped', step: '', skip_reason: 'לא אושר לפני הפרסום הסופי\.'/.test(worker), 'while the owner actually saying no still ends it, exactly as before');

  /*
   * D. THE WEDGE. Between the atomic claim and the browser opening there are
   * ~10 Supabase round trips and nothing caught a failure in any of them — one
   * transient error left the row on 'publishing' for ever, which no screen can
   * retry or cancel, and which blocks that group from every future plan.
   */
  is(/let decision: Awaited<ReturnType<typeof evaluateQueueItem>>;[\s\S]{0,200}try \{/.test(worker), 'the rules check cannot throw the row away any more');
  is(
    /\} catch \(err\) \{[\s\S]{0,400}status: 'scheduled', step: 'pending'[\s\S]{0,200}attempts: item\.attempts \}\);[\s\S]{0,200}לא הצלחתי לבדוק את הכללים/.test(worker),
    'it hands the row back instead — safe, because the browser has not been opened, so there is no post to double',
  );
  is(/לא הצלחתי לבדוק את הכללים|heartbeat נכשל אחרי התפיסה/.test(worker), 'and the heartbeat right after the claim is covered the same way');

  /*
   * E. THE TRUNCATION FLAG THAT COULD NEVER BE TRUE. Both rollups asked for
   * 5000 rows from a server that caps at 1000, so `rows.length >= LIMIT` was
   * never reached and the "these numbers are of a slice" flag was dead — which
   * is the flag CampaignCard's green "finished successfully" depends on.
   */
  const rollup = Number(/const CAMPAIGN_ROLLUP_LIMIT = (\d+);/.exec(client)?.[1] ?? 0);
  const usage = Number(/export const LIBRARY_USAGE_LIMIT = (\d+);/.exec(code('src/lib/social/library.ts'))?.[1] ?? 0);
  const ceiling = 1000; // PostgREST db-max-rows, as countByStatus's own comment states
  is(rollup > 0 && rollup <= ceiling, `the campaign rollup asks for ${rollup} rows from a server that returns at most ${ceiling} — above it, truncated can never be true`);
  is(usage > 0 && usage <= ceiling, `and so does the library's usage rollup (${usage})`);
  /*
   * AND THE FLAG IS STILL SET BY COMPARING AGAINST THE LIMITS — both of them
   * now, because the rollup is two reads.
   *
   * It was one account-wide ascending read that had to be a complete account
   * of what is waiting AND a bounded sample of what is over; it could not be
   * both, and "28 / 28 · 100% · הסתיים" over a 269-group round is what came
   * out. The open read is now status-filtered and bounded by v20's
   * one-open-row-per-group index; the finished one is a newest-first preview.
   * The rows may only be counted when NEITHER was cut — and with v27's view
   * they are not counted at all, which is why `exact` clears the flag.
   */
  const doneLimit = Number(/const ROLLUP_DONE_LIMIT = (\d+);/.exec(client)?.[1] ?? 0);
  is(doneLimit > 0 && doneLimit <= ceiling, `the finished-row preview asks for ${doneLimit} rows, at or under the server's ${ceiling}`);
  is(/const openTruncated = openRows\.length >= CAMPAIGN_ROLLUP_LIMIT;/.test(client), 'the open read compares against its own limit');
  is(/const doneTruncated = doneRows\.length >= ROLLUP_DONE_LIMIT;/.test(client), 'and the finished preview against its own');
  is(/const rowsAreWhole = !openTruncated && !doneTruncated;/.test(client), 'and the rows may only be counted when neither was cut');
  /* The counts read has an explicit ceiling too, under the server's, so it
     can tell that it hit one instead of silently returning a short answer. */
  const countsLimit = Number(/const COUNTS_LIMIT = (\d+);/.exec(client)?.[1] ?? 0);
  is(countsLimit > 0 && countsLimit < ceiling, `the counts read asks for ${countsLimit}, strictly under the server's ${ceiling} so a short answer is detectable`);
  is(/if \(\(countRes\.data \?\? \[\]\)\.length >= COUNTS_LIMIT\) return \{ kind: 'too-many-rounds' \};/.test(client), 'and it refuses to present a capped count as exact, naming which ceiling it hit');
}

/* ------------------------------------------------------------------ *
 * 9. THE ROUND SCREEN STOPS DOWNLOADING THE POST BODY A THOUSAND TIMES
 *    — and the CLASS of that bug is closed, not just this instance.
 * ------------------------------------------------------------------ */
{
  const client = src('src/lib/social/client.ts');
  const clientCode = code('src/lib/social/client.ts');

  /*
   * THE HEAVIEST READ IN THE PRODUCT, and it was the last one still asking
   * for `*`.
   *
   * campaignQueueWithStats feeds the screen he leaves OPEN to watch a round
   * run: up to CAMPAIGN_QUEUE_LIMIT rows, every five seconds. `*` on
   * social_queue carries rendered_text — the entire published post, per row —
   * which client.ts already records as "the single biggest source of Supabase
   * egress in this app, and the thing that put a free project over its 5GB cap
   * with two users". The live board and the day rail were both narrowed for
   * exactly that; this one, a thousand rows at five seconds instead of two
   * hundred at thirty, was not.
   */
  const feedAt = clientCode.indexOf('const CAMPAIGN_FEED_SELECT');
  is(feedAt > 0, 'the round screen has no select of its own — it is back on `*`, which carries the whole post body per row');
  const feed = clientCode.slice(feedAt, clientCode.indexOf(';', feedAt));

  const body = clientCode.slice(
    clientCode.indexOf('export async function campaignQueueWithStats'),
    clientCode.indexOf('\n}\n', clientCode.indexOf('export async function campaignQueueWithStats')),
  );
  is(body.length > 200, 'campaignQueueWithStats is found');
  is(/\.select\(CAMPAIGN_FEED_SELECT\)/.test(body), 'the round feed no longer uses its narrowed select');
  is(!/\.select\(QUEUE_SELECT\)/.test(body), 'and it must not be back on QUEUE_SELECT, which is `*`');

  /*
   * AND THE BODY IS NOT IN IT. Read off the STRIPPED source: the comment above
   * the select names rendered_text repeatedly, so the same check against the
   * raw file passes on its own prose — the mistake this file's own header
   * records three of.
   */
  is(!/rendered_text/.test(feed), 'the post body is downloaded to draw a list again — PublicationItem fetches one row on demand when it is opened');

  /*
   * THE SIX THAT MUST STAY, each named with the thing that goes blank without
   * it. These rows arrive through a CAST (unwrap<QueueRow[]>), so a dropped
   * column is `undefined` at runtime and TypeScript cannot see it: the section
   * simply draws nothing. That is why each one is asserted by name rather than
   * trusting a count.
   */
  const needed: [string, string][] = [
    ['comment_status', 'commentProgress() and the "which groups commented" list are both behind `known > 0`'],
    ['comment_note', 'the only explanation of a comment that failed'],
    ['comment_shot', 'the picture of a comment that failed'],
    ['metrics_comments', 'CampaignReach sums it'],
    ['metrics_shares', 'CampaignReach sums it'],
    ['metrics_at', 'CampaignReach stamps its numbers with it'],
    ['step', 'PublicationItem draws which step a live row is on'],
    ['step_at', 'and when that step was written'],
    ['target_id', 'campaignState() groups by it'],
    ['campaign_id', 'projectQueue keys the cascade by it'],
    ['scheduled_at', 'the whole feed is ordered by it'],
    ['status', 'every section on the screen is a status'],
  ];
  for (const [col, why] of needed) {
    is(new RegExp(`\\b${col}\\b`).test(feed), `${col} is not selected — ${why}`);
  }

  /*
   * ─── AND NOW THE CLASS, WHICH IS THE PART WORTH KEEPING ────────────────
   *
   * PostgREST has no "all but one", so every narrowed read here is a
   * hand-typed list of columns. schema-columns.test.ts proves the row
   * INTERFACES match the real table, and nothing proves the SELECTS do — so a
   * future migration that adds a column to social_queue and to QueueItem
   * passes the whole suite while two screens quietly stop receiving it. The
   * cast means no typecheck, and `*` is the only reason that has never bitten.
   *
   * So the broad selects — the ones that mean "the row, minus the body" — must
   * cover every field QueueItem declares, and anything they leave out must be
   * named here with its reason. A new field fails this until somebody decides.
   */
  const types = src('src/lib/social/types.ts');
  const itemBody = types.slice(types.indexOf('export interface QueueItem {'), types.indexOf('\n}', types.indexOf('export interface QueueItem {')));
  const fields = [...itemBody.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '').matchAll(/^\s{2}(\w+)\??:/gm)].map((m) => m[1]);
  is(fields.length > 25, `QueueItem's fields are not being read (found ${fields.length}) — the coverage check below would pass on an empty list`);
  is(fields.includes('rendered_text') && fields.includes('comment_status'), 'and the field walk found the two that matter to this section');

  const columnsOf = (name: string) => {
    const at = clientCode.indexOf(`const ${name} =`);
    const raw = clientCode.slice(at, clientCode.indexOf(';', at));
    const quoted = [...raw.matchAll(/'([^']*)'/g)].map((m) => m[1]).join('');
    /* The joins are relations, not columns of this table. */
    return quoted.replace(/\w+:\w+\([^)]*\)/g, '').split(',').map((c) => c.trim()).filter(Boolean);
  };

  /* Each exclusion carries its reason, so dropping a column is a decision
     somebody wrote down rather than a gap nobody noticed. */
  const broad: Record<string, Record<string, string>> = {
    QUEUE_SELECT_LITE: {
      rendered_text: 'the entire post body; PublicationItem fetches one row on demand',
      comment_at: 'only CommentTimeline reads it, and it has its own reads',
      comment_status: 'the live board draws no comment state',
      comment_note: 'ditto',
      comment_shot: 'ditto',
      metrics_comments: 'the live board draws no metrics',
      metrics_shares: 'ditto',
      metrics_at: 'ditto',
      /*
       * FOUND BY THIS GUARD ON ITS FIRST RUN, and pre-existing: QUEUE_SELECT_LITE
       * has never selected created_at, and nothing had ever asked whether that
       * mattered. It does not. A queue row's created_at is read by no screen and
       * by no component — the four `.order('created_at')` calls in the worker are
       * on social_targets and social_worker_commands, and every created_at read in
       * src/ is a Campaign's, a group's or a Post's. It is also not an ordering
       * key for any queue read: the feeds order by scheduled_at, published_at or
       * comment_at. Recorded rather than quietly tolerated, which is the whole
       * point of this list.
       */
      /*
       * ROUND_AT IS DELIBERATELY NOT SELECTED HERE, and this entry is a scar.
       *
       * It WAS selected — this guard demanded it the moment the column
       * appeared on QueueItem, and adding it was the wrong answer. PostgREST
       * refuses the WHOLE read when one named column does not exist, so the
       * dashboard of a database that had not yet run social-latest.sql
       * stopped rendering entirely: a full-page "מבנה הנתונים לא מעודכן" and
       * nothing else. The owner saw it on his phone at 05:45.
       *
       * The product's own rule, which this broke: a feature ships OFF for
       * every row that already exists, and a database that has not run the
       * SQL behaves exactly as before. A column that may not be there must
       * never be in a read a screen depends on — see createSchedule's
       * OPTIONAL_SCHEDULE_COLUMNS retry, which is the same lesson paid for
       * once already.
       *
       * Per-round figures therefore come from a read that is allowed to fail,
       * and progressByRound() answers {} — "nobody counted" — when no row
       * carries a round, which is also the honest answer while the PC is
       * still on the previous version.
       */
      round_at: 'a database that has not run social-latest.sql has no such column, and PostgREST refuses the whole read — it blanked the dashboard once',
      created_at: 'read by no screen, no component and no queue ordering — verified across src/ and worker/',
    },
    CAMPAIGN_FEED_SELECT: {
      rendered_text: 'the entire post body; PublicationItem fetches one row on demand',
      comment_at: 'only CommentTimeline reads it, and it is on the dashboard',
      /*
       * FOUND BY THIS GUARD ON ITS FIRST RUN, and pre-existing: QUEUE_SELECT_LITE
       * has never selected created_at, and nothing had ever asked whether that
       * mattered. It does not. A queue row's created_at is read by no screen and
       * by no component — the four `.order('created_at')` calls in the worker are
       * on social_targets and social_worker_commands, and every created_at read in
       * src/ is a Campaign's, a group's or a Post's. It is also not an ordering
       * key for any queue read: the feeds order by scheduled_at, published_at or
       * comment_at. Recorded rather than quietly tolerated, which is the whole
       * point of this list.
       */
      /*
       * ROUND_AT IS DELIBERATELY NOT SELECTED HERE, and this entry is a scar.
       *
       * It WAS selected — this guard demanded it the moment the column
       * appeared on QueueItem, and adding it was the wrong answer. PostgREST
       * refuses the WHOLE read when one named column does not exist, so the
       * dashboard of a database that had not yet run social-latest.sql
       * stopped rendering entirely: a full-page "מבנה הנתונים לא מעודכן" and
       * nothing else. The owner saw it on his phone at 05:45.
       *
       * The product's own rule, which this broke: a feature ships OFF for
       * every row that already exists, and a database that has not run the
       * SQL behaves exactly as before. A column that may not be there must
       * never be in a read a screen depends on — see createSchedule's
       * OPTIONAL_SCHEDULE_COLUMNS retry, which is the same lesson paid for
       * once already.
       *
       * Per-round figures therefore come from a read that is allowed to fail,
       * and progressByRound() answers {} — "nobody counted" — when no row
       * carries a round, which is also the honest answer while the PC is
       * still on the previous version.
       */
      round_at: 'a database that has not run social-latest.sql has no such column, and PostgREST refuses the whole read — it blanked the dashboard once',
      created_at: 'read by no screen, no component and no queue ordering — verified across src/ and worker/',
    },
  };

  for (const [name, excused] of Object.entries(broad)) {
    const have = new Set(columnsOf(name));
    is(have.size > 20, `${name} parsed to ${have.size} columns — the coverage check would be vacuous`);
    const missing = fields.filter((f) => !have.has(f) && !(f in excused));
    eq(
      missing,
      [],
      `${name} does not select ${missing.join(', ')}, and there is no reason recorded for leaving ${missing.length > 1 ? 'them' : 'it'} out. ` +
        'These rows arrive through a cast, so the column is undefined at runtime and nothing goes red — the screen just stops drawing it. ' +
        'Either add the column to the select, or add it to this exclusion list with the reason.',
    );
    /* And an exclusion that no longer corresponds to a field is stale: it
       would silently excuse a future column that happens to reuse the name. */
    const stale = Object.keys(excused).filter((c) => !fields.includes(c));
    eq(stale, [], `${name}'s exclusion list still excuses ${stale.join(', ')}, which QueueItem no longer declares`);
  }

  /*
   * ─── AND THE ONE COLUMN THAT MAY NOT BE IN ANY OF THEM ─────────────────
   *
   * round_at arrives with supabase/social-latest.sql. PostgREST refuses the
   * WHOLE read when a named column is absent, so the moment it went into
   * these selects every screen of a database that had not run the file
   * stopped rendering — a full-page "מבנה הנתונים לא מעודכן" and nothing
   * else, on the owner's phone, at 05:45.
   *
   * The exclusion list above records WHY it is missing; this makes putting it
   * back fail. Those are different jobs: an exclusion entry is satisfied by
   * adding the column, which is exactly the mistake.
   */
  is(
    !/round_at/.test(clientCode),
    'a read in client.ts names round_at again — PostgREST refuses the whole read on a database that has not run social-latest.sql, and the dashboard renders nothing at all. Per-round figures must come from a read that is allowed to fail.',
  );

  /*
   * ─── EVERY SELECT IN THE FILE IS IN EXACTLY ONE OF THREE CLASSES ───────
   *
   * This check found three selects nobody had classified — COMMENT_WAIT_SELECT,
   * ROLLUP_SELECT and LIVE_QUEUE_SELECT — on its first run, which is the whole
   * argument for it. The classes:
   *
   *   broad    hand-typed, and MEANT to be the whole row minus the body. These
   *            are the ones a forgotten column silently breaks, so they are
   *            covered against QueueItem above.
   *   minimal  hand-typed, purpose-built short lists for one small view. A new
   *            column is not expected in them; what they need is pinned by the
   *            tests that own their consumers.
   *   star     asks for `*`. IMMUNE to this entire failure mode, because `*`
   *            cannot forget a column — which is also why nothing here has ever
   *            caught one.
   *
   * The classes are asserted, not just declared: a `star` entry must really
   * contain `*`, so the day somebody replaces one with a hand-typed list it
   * lands in this check unaccounted rather than keeping a pass it no longer
   * earns. Stale names fail too.
   */
  const minimal = ['COMMENT_ATTENTION_SELECT', 'COMMENT_WAIT_SELECT', 'ROLLUP_SELECT', 'TIMELINE_SELECT'];
  /*
   * AND LIVE_QUEUE_SELECT IS A FINDING, not an exemption.
   *
   * It is '*, target:social_targets(*)' — the whole queue row AND every column
   * of the joined group, for up to LIVE_QUEUE_LIMIT rows. It feeds
   * liveQueuePlan(), which is the "ניהול התור הפעיל" sheet: the one the owner
   * photographed with "לא קיבלנו אישור בזמן" on it. The write side of that
   * sheet has been widened and measured (respace-speed.test.ts); the READ side
   * still carries a post body per row before the sheet can draw anything.
   * Narrowing it needs the same consumer walk the campaign feed above got —
   * liveQueuePlan itself touches only campaign_id, post_id, scheduled_at,
   * target and target_id, but it returns `rows: QueueRow[]` to the sheet, and
   * what the SHEET reads has not been established yet. Listed here as `star`
   * because `*` genuinely cannot lose a column; recorded in words because that
   * is not the same as saying it is fine.
   */
  const star = ['QUEUE_SELECT', 'LIVE_QUEUE_SELECT'];

  const declared = [...clientCode.matchAll(/const (\w*SELECT\w*) =/g)].map((m) => m[1]);
  is(declared.length >= 5, `only ${declared.length} selects found in client.ts — the walk is not finding them`);
  const unaccounted = declared.filter((n) => !(n in broad) && !minimal.includes(n) && !star.includes(n));
  eq(
    unaccounted,
    [],
    `client.ts declares ${unaccounted.join(', ')}, which is in none of the three classes. ` +
      'A hand-typed select that nothing checks is how a column goes missing without a single test failing — ' +
      'put it in `broad` (and give it an exclusion list), in `minimal`, or in `star` if it really asks for `*`.',
  );

  /* A name in any class that client.ts no longer declares is a pass nobody is
     earning — and it would silently absolve a future select that reuses it. */
  const ghosts = [...Object.keys(broad), ...minimal, ...star].filter((n) => !declared.includes(n));
  eq(ghosts, [], `this check still classifies ${ghosts.join(', ')}, which client.ts no longer declares`);

  /* And a `star` entry has to actually be one. */
  for (const name of star) {
    const at = clientCode.indexOf(`const ${name} =`);
    const body = clientCode.slice(at, clientCode.indexOf(';', at));
    is(
      /'\s*\*/.test(body),
      `${name} is classified as asking for \`*\` but no longer does — it is a hand-typed list now, so it belongs in \`broad\` with an exclusion list or in \`minimal\``,
    );
  }
}

/* ------------------------------------------------------------------ *
 * 10. AND THE DASHBOARD'S TWO COMMENT LISTS, same column, same cost.
 * ------------------------------------------------------------------ */
{
  const clientCode = code('src/lib/social/client.ts');
  for (const fn of ['listCommentsDone', 'listCommentQueue']) {
    const at = clientCode.indexOf(`export async function ${fn}`);
    is(at > 0, `${fn} is gone, or renamed — this guard is pinned to a name that no longer exists`);
    const body = clientCode.slice(at, clientCode.indexOf('\n}', at));
    is(
      /\.select\(COMMENT_ATTENTION_SELECT\)/.test(body),
      `${fn} is back on QUEUE_SELECT — the dashboard re-downloads up to a hundred whole post bodies every thirty seconds to draw a rail of names and dots`,
    );
    is(!/\.select\(QUEUE_SELECT\)/.test(body), `${fn} must not select \`*\``);
  }

  /*
   * THE TWO ORDER COLUMNS, and they are not cosmetic: CommentTimeline:200
   * sorts on `(a.published_at ?? a.scheduled_at).localeCompare(...)` with no
   * guard at all, so a row missing BOTH would throw rather than draw nothing.
   * The one failure mode in this whole area that is loud, and only because
   * both columns happen to be selected.
   */
  const selAt = clientCode.indexOf('const COMMENT_ATTENTION_SELECT');
  const sel = clientCode.slice(selAt, clientCode.indexOf(';', selAt));
  for (const col of ['comment_at', 'published_at', 'scheduled_at', 'permalink', 'comment_status', 'comment_note']) {
    is(new RegExp(`\\b${col}\\b`).test(sel), `COMMENT_ATTENTION_SELECT no longer carries ${col} — see the trace recorded above it in client.ts`);
  }
}

console.log(`performance-pass guards OK — ${checks} assertions`);
