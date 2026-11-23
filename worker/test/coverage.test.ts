/*
 * ─────────────────────────────────────────────────────────────────────────────
 * "כיסוי ארצי" — THE CATALOG FILLING ITSELF, AND THE LEASH ON IT
 *
 *   "מאגר קבוצות פייסבוק מרכזי, ארצי... שמכסה את כל הערים בישראל."
 *   "אז תעשה את הקוד."   — 18.11.2026
 *
 * THIS IS THE ONE PART OF THE CATALOG THAT TOUCHES HIS FACEBOOK ACCOUNT, and
 * that is what this file is about. Everything else in the national catalog is
 * database work that cannot cost him anything; this types searches into
 * Facebook as the account his business publishes from. So the things worth
 * pinning are not the plan's cleverness — they are its limits:
 *
 *   §1  the plan is an order and a cursor, and the order starts where he
 *       already publishes;
 *   §2  a phrase is a phrase: nothing here joins, requests, writes or clicks,
 *       and the only verb it reaches for is the `discover` command a typed
 *       search already uses;
 *   §3  OFF unless he turned it on, and the switch cannot be flipped by an
 *       update;
 *   §4  one search per interval, six a day out of the box, SEVENTY-TWO at the
 *       ceiling — one every twenty minutes — and no setting above it; and the
 *       screen says the interval it will really use rather than a word that
 *       went stale when the ceiling tripled;
 *   §5  the step is spent BEFORE the search is queued, so a phrase that fails
 *       cannot become a loop of page loads against his account;
 *   §6  a group is filed under a category only when its own NAME says so —
 *       never because a search with that word found it;
 *   §7  and the screen says, in his language, exactly what it will and will
 *       not do.
 *
 *   npx tsx worker/test/coverage.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  BIG_CITIES,
  COVERAGE_PER_DAY_DEFAULT,
  COVERAGE_PER_DAY_MAX,
  COVERAGE_PER_DAY_MIN,
  COVERAGE_TOPICS,
  clampCoveragePerDay,
  coverageCities,
  RUSSIAN_TOPIC,
  coverageGapLabel,
  coverageGapMs,
  coverageKey,
  coverageLastRun,
  coveragePhrase,
  coverageProgress,
  coverageTotal,
  detectTopic,
  nextCoverageStep,
  russianCityName,
  russianCoverageCities,
} from '../../src/lib/social/coverage';
import { regionOf } from '../../src/lib/social/cities';

const NAME = 'coverage';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8');
const code = (rel: string) =>
  src(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

let checks = 0;
const is = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = (a: unknown, b: unknown, what: string) => {
  checks += 1;
  assert.deepStrictEqual(a, b, what);
};

const worker = code('worker/social-worker.ts');
const settings = code('src/app/social/settings/page.tsx');
const client = code('src/lib/social/client.ts');
const slice = (text: string, from: string, to: string) => {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + 1);
  assert.ok(a >= 0 && b > a, `${from} … ${to} are still in the file`);
  return text.slice(a, b);
};
const pass = slice(worker, 'async function coveragePass(', 'async function catalogCityPass(');

/* ═══════════════ §1 THE PLAN IS AN ORDER, AND IT STARTS AT HOME ═════════ */

eq(COVERAGE_TOPICS.length, 11, 'the ten kinds of group the brief asks for, plus the city on its own');
is(new Set(COVERAGE_TOPICS.map((t) => t.id)).size === 11, 'each with an id of its own');
/*
 * THE BARE CITY IS FIRST, and it is the only one with an empty word: the
 * highest-yielding search for a city is its name. A plan stopped halfway has
 * then read the broadest page for every city it reached.
 */
eq(COVERAGE_TOPICS[0].word, '', 'the first phrase for a city is the city alone');
for (const t of COVERAGE_TOPICS.slice(1)) is(t.word.trim().length > 1, `"${t.id}" has a phrase to search`);
eq(coveragePhrase('חיפה', COVERAGE_TOPICS[0]), 'חיפה', 'and it really searches just the name');
/* AND NOTHING IS EVER FILED UNDER IT: an empty word is in every string. */
eq(detectTopic('סתם קבוצה בלי שום מילה'), '', 'an empty word files nothing');
eq(detectTopic('יד שנייה חיפה'), 'יד שנייה', 'while the real words still file');

const mine = ['ערד', 'באר שבע'];
const cities = coverageCities(mine);
eq(cities.slice(0, 2), mine, 'the cities he already publishes in come first — that is where the next real group is');
is(cities[2] === BIG_CITIES.find((c) => !mine.includes(c)), 'then the big ones');
is(cities.length > 350, `and then the rest of the country (${cities.length} localities in the plan)`);
is(new Set(cities).size === cities.length, 'no locality is searched twice');
for (const c of cities) is(regionOf(c) !== '', `${c} is a real locality with a region`);

/* A city he typed by hand that is not a locality is not searched. */
is(!coverageCities(['אחר', 'סתם משהו']).includes('אחר'), '"אחר" is not a city and is never searched');

/*
 * ─── THE WHOLE COUNTRY FIRST, THEN THE DEPTH ─────────────────────────────
 *
 * "אני רוצה שבשבוע הקרוב תסרוק את כל הקבוצות של הערים בפייסבוק בישראל."
 *
 * Round 1 is the bare name of EVERY city — 413 searches, under a week at the
 * ceiling, and when it ends every city in the country has been read. Round 2
 * is the ten narrow phrases. The old order was city-major from the start,
 * which spends a week on thirty cities and leaves three hundred and eighty
 * untouched; the order that would cover everything in a week is one search
 * every two minutes, which is the rate that gets the account restricted.
 */
const first = nextCoverageStep([], mine);
eq(first?.city, 'ערד', 'the first search is in the first city');
eq(first?.phrase, 'ערד', 'and it is the city on its own — the broadest page it has');
/* ONE city's broad page done → the NEXT CITY's broad page, not this city's
   narrow ones. That is the whole change. */
eq(nextCoverageStep([coverageKey('ערד', COVERAGE_TOPICS[0].id)], mine)?.phrase, 'באר שבע',
  'the second search is the next city, not the same city again');
/* Walk the whole of round 1 and prove it is every city, once, broad. */
{
  const done: string[] = [];
  const phrases: string[] = [];
  for (let i = 0; i < cities.length; i += 1) {
    const step = nextCoverageStep(done, mine);
    if (!step) break;
    done.push(step.key);
    phrases.push(step.phrase);
  }
  eq(phrases.length, cities.length, 'round 1 is exactly one search per city');
  eq([...new Set(phrases)].length, cities.length, 'each city once, none twice');
  eq(phrases.filter((p) => p.includes(' ')).length, phrases.filter((p) => cities.includes(p)).length - phrases.filter((p) => cities.includes(p) && !p.includes(' ')).length,
    'and every one of them is a bare city name');
  const progress = coverageProgress(done, mine);
  eq(progress.citiesTouched, cities.length, 'so every city in the country has been read once');
  eq(progress.citiesDone, 0, 'and none of them is finished yet, which the screen says separately');
  /*
   * ─── AND THEN THE SAME COUNTRY AGAIN, IN RUSSIAN ───────────────────────
   *
   * "שיחפש לי גם קבוצות ברוסית לפי ערים" — 23.11.2026.
   *
   * Round 1b comes BEFORE the Hebrew depth, and that is the decision this
   * block exists to pin. A Russian search reaches groups no Hebrew phrase can
   * return — the largest Russian-language Haifa group is named "Хайфа" and
   * nothing else — while the ten narrow Hebrew topics mostly re-find what the
   * broad round already brought back. 161 steps against the 4,130 it delays.
   */
  const ru = nextCoverageStep(done, mine);
  eq(ru?.city, 'ערד', 'round 1b starts back at the first city');
  eq(ru?.topic.id, RUSSIAN_TOPIC.id, 'and it is the Russian round, not the Hebrew depth');
  eq(ru?.phrase, 'Арад', 'whose phrase is the city name in Cyrillic, and nothing else');
  is(RUSSIAN_TOPIC.word === '', 'the Russian topic carries no word, so nothing is filed under it');
  is(!COVERAGE_TOPICS.some((t) => t.id === RUSSIAN_TOPIC.id),
    'and it is NOT in COVERAGE_TOPICS — `[broad, ...narrow]` would bury it inside round 2');

  /* Walk the whole of round 1b, then check the depth begins. */
  const ruCities = russianCoverageCities(mine);
  const ruPhrases: string[] = [];
  for (let i = 0; i < ruCities.length; i += 1) {
    const step = nextCoverageStep(done, mine);
    if (!step || step.topic.id !== RUSSIAN_TOPIC.id) break;
    done.push(step.key);
    ruPhrases.push(step.phrase);
  }
  eq(ruPhrases.length, ruCities.length, 'round 1b is exactly one search per city that HAS a Russian name');
  is(ruCities.length < cities.length, `and that is fewer cities than the country — ${ruCities.length} of ${cities.length}`);
  is(ruPhrases.every((p) => /^[\u0400-\u04FF]/.test(p)), 'every phrase in it is Cyrillic');
  is(ruPhrases.every((p) => !/[\u0590-\u05FF]/.test(p)), 'and none of them carries a Hebrew letter — a mixed phrase matches nothing');
  eq([...new Set(ruPhrases)].length, ruPhrases.length, 'each city once here too');
  /* NO MARKER FOR A CITY WITH NO RUSSIAN NAME: a spelling added later simply
     joins the round, instead of finding its step already spent. */
  for (const city of cities) {
    if (russianCityName(city)) continue;
    is(!done.includes(coverageKey(city, RUSSIAN_TOPIC.id)),
      `${city} has no Russian name, so no step was written off for it`);
    break;
  }
  const afterRu = coverageProgress(done, mine);
  eq(afterRu.citiesRussian, ruCities.length, 'the screen can say how many were searched in Russian');
  eq(afterRu.russianCities, ruCities.length, 'out of how many have a Russian name at all');
  eq(afterRu.citiesDone, 0, 'and still none is FINISHED — the depth has not started');

  /* AND ONLY THEN the depth begins, at the first city. */
  const next = nextCoverageStep(done, mine);
  eq(next?.city, 'ערד', 'round 2 starts back at the first city');
  eq(next?.phrase, `${COVERAGE_TOPICS[1].word} ערד`, 'with its first narrow phrase');
}
const aradDone = COVERAGE_TOPICS.map((t) => coverageKey('ערד', t.id));

/*
 * A SUM OVER THE ROUNDS, NOT A PRODUCT. It was `cities × topics`, which was
 * right while every city had the same number of phrases. Round 1b runs only
 * for the 161 cities that HAVE a Cyrillic name, so a product either
 * over-counts by 252 — and then `done >= total` never holds and the
 * "כל התוכנית הושלמה" line on the settings screen never fires — or leaves the
 * Russian round out of the owner's progress line altogether.
 */
eq(coverageTotal(mine), cities.length * COVERAGE_TOPICS.length + russianCoverageCities(mine).length,
  'the plan is every city times every Hebrew phrase, PLUS one Russian search per city that has a Russian name');
is(coverageTotal(mine) > cities.length * COVERAGE_TOPICS.length, 'which is more than it was before the Russian round');
/* AND THE COMPLETION LINE CAN ACTUALLY FIRE. Walk the whole plan and check
   the cursor reaches the total exactly — not one short, not one over. */
{
  const all: string[] = [];
  for (let i = 0; i < 6000; i += 1) {
    const step = nextCoverageStep(all, mine);
    if (!step) break;
    all.push(step.key);
  }
  eq(all.length, coverageTotal(mine), 'the walk ends exactly on the total, so the plan can be finished');
  const end = coverageProgress(all, mine);
  eq(end.done, end.total, 'and the progress line agrees, which is what the completion sentence reads');
  eq(end.citiesDone, cities.length, 'every city counts as finished, including the 252 with no Russian name');
  eq(end.citiesRussian, end.russianCities, 'and the Russian round is complete');
  is(nextCoverageStep(all, mine) === null, 'and nothing more is offered');
}
/*
 * ─── AND "FINISHED" MEANS EVERY PHRASE THAT CITY ACTUALLY HAS ────────────
 *
 * Arad has a Russian name, so eleven Hebrew phrases are no longer all of its
 * plan. Counting it done at eleven would tell the owner a city was covered
 * while its Russian search was still outstanding — and counting a city that
 * has NO Russian name as unfinished for ever would stop the completion line
 * from ever firing. Both halves are pinned here.
 */
const aradProgress = coverageProgress(aradDone, mine);
eq(aradProgress.citiesDone, 0, 'eleven Hebrew phrases do NOT finish a city that also has a Russian name');
is(russianCityName('ערד') === 'Арад', 'and Arad is such a city');
const aradAll = [...aradDone, coverageKey('ערד', RUSSIAN_TOPIC.id)];
eq(coverageProgress(aradAll, mine).citiesDone, 1, 'with the Russian search too, it is covered');
/* A city with no Russian name is finished by its eleven alone. */
{
  const noRu = coverageCities(mine).find((c) => !russianCityName(c));
  is(Boolean(noRu), 'the country really does hold cities with no Russian name');
  const keys = COVERAGE_TOPICS.map((t) => coverageKey(noRu as string, t.id));
  eq(coverageProgress(keys, mine).citiesDone, 1,
    `${noRu} has no Russian name, so its eleven Hebrew phrases finish it`);
}
eq(aradProgress.citiesTouched, 1, 'and as touched once its broad page has been read');
eq(aradProgress.done, COVERAGE_TOPICS.length, 'and the step count is the cursor itself');
/* THE PLAN ENDS. A cursor that can never finish is a machine that searches
   for ever. */
const everything = [
  ...cities.flatMap((c) => COVERAGE_TOPICS.map((t) => coverageKey(c, t.id))),
  /* …including the Russian round, for the cities that have one. Without this
     the walk still has 161 steps left, which is the point: the plan grew. */
  ...russianCoverageCities(mine).map((c) => coverageKey(c, RUSSIAN_TOPIC.id)),
];
eq(nextCoverageStep(everything, mine), null, 'when every phrase has run, there is no next step');
/* AND THE HEBREW PHRASES ALONE ARE NOT EVERY PHRASE ANY MORE. */
const hebrewOnly = cities.flatMap((c) => COVERAGE_TOPICS.map((t) => coverageKey(c, t.id)));
eq(nextCoverageStep(hebrewOnly, mine)?.topic.id, RUSSIAN_TOPIC.id,
  'with only the Hebrew plan spent, what is left is the Russian round');

/* ═══════════════ §2 A PHRASE IS A PHRASE ════════════════════════════════ */
/*
 * The whole safety story is that this invented no new way to touch Facebook.
 * It queues the SAME `discover` command the dashboard queues when he types a
 * search, so it inherits every protection that path has — the burst guard,
 * the idle window, the login check, the activity line.
 */
is(/command: 'discover'/.test(pass), 'it queues the same command a typed search queues');
/*
 * A PHRASE AND HOW DEEPLY TO READ IT — and nothing else. `deep` is not a new
 * power: it is the number of times the same already-loaded page is scrolled,
 * which is why the automatic pass may have it and a search he is watching may
 * not (DEEP_PASSES).
 */
is(/payload: \{ query: step\.phrase, deep: '1', auto: 'coverage' \}/.test(pass),
  'with a phrase, how deeply to read it, and the mark that holds it back on a busy machine — and nothing else');
const payloadKeys = [...(/payload: \{([^}]*)\}/.exec(pass)?.[1] ?? '').matchAll(/(\w+):/g)].map((m) => m[1]);
eq(payloadKeys.sort(), ['auto', 'deep', 'query'], 'the payload carries no url, no list and no account');
/*
 * ─── AND THE WIRE BETWEEN THE TWO ENDS IS PINNED, NOT JUST THE ENDS ──────
 *
 * This file used to pin the producer here and the consumer in §8
 * (`opts.deep ? DEEP_PASSES : PASSES`) and nothing in between. The link is
 * one expression in runCommands, and a one-character change to it —
 * `=== '1'` to `=== '2'` — made every coverage search fall back to the
 * shallow twelve passes while all three assertions still passed. A suite that
 * reports a deep national scan which is not happening is worse than no suite.
 *
 * So the two literals are read out of the file and compared to each other.
 * Neither end can be changed without the other.
 */
const sent = /payload: \{ query: step\.phrase, deep: '([^']*)', auto: '([^']*)' \}/.exec(pass);
const readDeep = /deep: cmd\.payload\?\.deep === '([^']*)'/.exec(worker);
const readAuto = /cmd\.payload\?\.auto === '([^']*)'/.exec(worker);
is(!!sent && !!readDeep && !!readAuto, 'both ends of the payload are still written where they can be read');
eq(readDeep?.[1], sent?.[1], 'the depth the pass sends is the depth the command loop reads');
eq(readAuto?.[1], sent?.[2], 'and the mark it sends is the mark the hold looks for');
/*
 * The verbs as they would really be written — a command name, a call — and
 * not as substrings: `error.message` is not a message sent to anybody, and a
 * test that cannot tell the two apart is a test that will be deleted the
 * first time it cries wolf.
 */
for (const forbidden of ["'join'", "'leave'", 'startJoin', '.click(', 'sendMessage', 'joinGroup', 'requestToJoin']) {
  is(!pass.includes(forbidden), `the coverage pass never reaches for ${forbidden}`);
}
/* And the only command name it can possibly write is the one it declares. */
const commands = [...pass.matchAll(/command: '([a-z]+)'/g)].map((m) => m[1]);
eq(commands, ['discover'], 'the only command it queues is a search');
/* It opens no page itself: the command loop does, in its own window. */
for (const forbidden of ['openPage', 'newPage', 'goto', 'session.', 'browser']) {
  is(!pass.includes(forbidden), `and it never touches ${forbidden} directly`);
}

/* ═══════════════ §3 OFF UNLESS HE TURNED IT ON ══════════════════════════ */

is(/if \(!cfg\.on\) \{/.test(pass), 'off is the default, and it is checked before anything else is read');
is(pass.indexOf('if (!cfg.on) {') < pass.indexOf('workerDb()'),
  'and before the database is even asked — an update must not start searching by itself');
/*
 * AND THE WRITE CANNOT PUT THE SWITCH BACK ON.
 *
 * The step is chosen from a copy of the row read before a target query and a
 * plan walk, and the write used to spread that whole copy back — `{ ...cfg }`
 * — including `on`. An owner who turned the switch off in that window had it
 * turned back on by a background write, with the screen still showing OFF.
 * The write now spreads a FRESH read and bails if that read says off.
 */
is(/const fresh = await getSetting<CoverageSettings>\(COVERAGE_SETTING/.test(pass),
  'the write is built from a fresh read, not from the copy the step was chosen from');
is(/if \(!fresh\.on\) \{/.test(pass), 'and a switch turned off while the step was being chosen stops it');
is(!/\.\.\.cfg,/.test(pass), 'nothing spreads the stale copy back over the row');
is(pass.indexOf('const fresh = await getSetting') < pass.indexOf("command: 'discover'"),
  'and that happens before the search is queued, not after');
is(/on: false/.test(client), 'the stored default is off');
/* THE SCREEN WRITES THE SWITCH, THE WORKER WRITES THE CURSOR — and the screen
   must not hand the plan back its old position. */
const save = slice(client, 'export async function saveCoverage', 'export async function catalogCoverage');
is(/await getCoverage\(\)/.test(save), 'the switch is written onto the row as it is NOW');
is(!/done:/.test(save), 'and the screen never writes the cursor, which the worker owns');
/*
 * AND A FRESH READ IS NOT A LOCK.
 *
 * The read closes the minute between opening the screen and tapping the
 * switch; it does not close the round trip between the read and the upsert,
 * and the whole row is written. The worker queueing a step in that window
 * lost the key — one repeated search, harmless — and lost `at`, which is the
 * only pace interlock there is, so the next search was allowed up to a full
 * interval early. The write is verified and re-applied over the newer cursor
 * once, so each side ends up holding its own half.
 */
is(/const after = await getCoverage\(\)/.test(save), 'the write is read back');
is(/after\.done\.length !== merged\.done\.length \|\| after\.at !== merged\.at/.test(save),
  'and compared against the cursor and the stamp the worker owns');
eq((save.match(/await saveSetting\('coverage'/g) ?? []).length, 2,
  'and re-applied exactly once if the worker moved under it — not in a loop');

/* ═══════════════ §4 ONE AT A TIME, AND A CEILING ════════════════════════ */

eq(COVERAGE_PER_DAY_DEFAULT, 6, 'six searches a day out of the box');
eq(COVERAGE_PER_DAY_MAX, 72, 'seventy-two at the ceiling — one every twenty minutes, and no setting above it');
/* WHICH IS WHAT THE WEEK HE ASKED FOR REALLY COSTS: 413 cities at 72 a day. */
is(cities.length / COVERAGE_PER_DAY_MAX < 7, `round 1 finishes in ${(cities.length / COVERAGE_PER_DAY_MAX).toFixed(1)} days at the ceiling`);
eq(clampCoveragePerDay(500), COVERAGE_PER_DAY_MAX, 'a number from anywhere is clamped to it');
eq(clampCoveragePerDay(0), COVERAGE_PER_DAY_MIN, 'and to the floor');
eq(clampCoveragePerDay(undefined), COVERAGE_PER_DAY_DEFAULT, 'and an absent setting is the default, not zero');
eq(coverageGapMs(6), 4 * 60 * 60_000, 'six a day is one every four hours');
eq(coverageGapMs(72), 20 * 60_000, 'and the ceiling is one every twenty minutes');
/*
 * AND THE SCREEN SAYS THE INTERVAL IT WILL REALLY USE.
 *
 * The hint under the input read "עם שעות ביניהם" and went on reading it when
 * the ceiling went 24 → 72, where the gap is twenty minutes: the screen
 * understated what it does by three times, at the very value its own `max`
 * offers. A label derived from the number cannot drift from it again.
 */
eq(coverageGapLabel(72), 'אחד כל 20 דקות', 'the ceiling says minutes, because minutes is what it is');
eq(coverageGapLabel(24), 'אחד כל שעה', 'one an hour says hour, singular');
eq(coverageGapLabel(6), 'אחד כל 4 שעות', 'and the default says four hours');
is(!/שעות ביניהם/.test(settings), 'and the stale words are gone from the screen');
is(!/שעות ביניהם/.test(code('src/lib/social/i18n.ts')), 'and out of the Russian dictionary too');
is(/coverageGapLabel\(plan\.perDay\)/.test(settings), 'which now prints the interval for the number he chose');
is(/COVERAGE_PER_DAY_MIN\}–\$\{COVERAGE_PER_DAY_MAX/.test(settings),
  'and the allowed range, because 100 typed into the box silently became 72');
is(/coverageGapMs\(clampCoveragePerDay\(cfg\.perDay\)\)/.test(pass), 'the worker paces itself by that same gap, clamped');
is(/insert\(\{/.test(pass) && (pass.match(/insert\(/g) ?? []).length === 1, 'and queues exactly one search per interval');

/*
 * ─── AND A STAMP IT CANNOT TRUST DOES NOT OPEN THE GATE ──────────────────
 *
 * CALLED, not grepped. The worker used to decide this inline with
 * `Number.isFinite(last) && last <= nowMs ? last : 0`, and every one of these
 * four cases went through the `: 0` branch — which the gap check reads as
 * "never ran" and lets straight through. Two workers with a skewed clock then
 * queue a deep search on every five-second tick while the screen says one
 * every twenty minutes. Each case below is a real call with a real answer.
 */
{
  const now = Date.parse('2026-11-20T12:00:00.000Z');
  eq(coverageLastRun(undefined, now), 0, 'no stamp at all means never ran — the first search goes out at once');
  eq(coverageLastRun('', now), 0, 'and so does an empty one');
  eq(coverageLastRun('2026-11-20T11:40:00.000Z', now), now - 20 * 60_000, 'a stamp in the past is itself');
  /* THE TWO THAT WERE WRONG. Both must read as "just ran", so the next search
     waits a full interval instead of going out immediately. */
  eq(coverageLastRun('2026-11-20T13:00:00.000Z', now), now,
    'a stamp an hour in the FUTURE means wait, not "never ran" — this is the two-worker clock skew');
  eq(coverageLastRun('not a date at all', now), now, 'and a stamp that will not parse means wait too');
  /* Which is the property that matters, stated as the gate itself states it. */
  for (const bad of ['2026-11-20T13:00:00.000Z', 'not a date at all']) {
    const lastMs = coverageLastRun(bad, now);
    is(lastMs > 0 && now - lastMs < coverageGapMs(72),
      `and so the gap is CLOSED for ${bad.slice(0, 18)} — nothing is queued this tick`);
  }
}

/*
 * ─── THE SETTING IS NOT READ SEVENTEEN THOUSAND TIMES A DAY ──────────────
 *
 * `done` is 4,543 keys when the plan is finished — about 130 KB of JSON in
 * one jsonb value, measured off cities-data.ts — and getSetting reads `value`
 * whole. On a five-second tick that was 2.3 GB a day pulled out of Supabase
 * to answer "is it time yet", on an account already over its quota, and the
 * read came BEFORE the `on` check so switching the feature off changed
 * nothing. The gate is an instant held in memory; the setting itself is still
 * always read fresh when it is read at all.
 */
is(/let coverageReadAfter = 0;/.test(worker), 'the next read is an instant this process remembers');
is(/if \(nowMs < coverageReadAfter\) return;/.test(pass),
  'and it is asked from memory before anything crosses the wire');
is(pass.indexOf('if (nowMs < coverageReadAfter) return;') < pass.indexOf('getSetting<CoverageSettings>'),
  'before the settings read, not after it — that was the whole bug');
is(/coverageReadAfter = lastMs \+ gapMs;/.test(pass),
  'while the plan is running the next read is the gap boundary exactly');
is(/coverageReadAfter = nowMs \+ COVERAGE_RECHECK_MS;/.test(pass),
  'and when it is off or finished, a short re-check — so a switch he turns on is still noticed');
/*
 * AND THE FINISHED PLAN STOPS ASKING FOR REAL. The old branch re-stamped the
 * row only when the stamp was a week old, with the gap check as the only
 * thing in front of it — so one interval after the last search the check
 * opened and never closed, and every tick from then on read up to a thousand
 * social_targets rows and rebuilt a 4,543-key Set to re-learn one fact that
 * cannot change. The comment said "said once, and then it stops asking"; that
 * was true of the log line only.
 */
is(/let coverageDoneSaid = false;/.test(worker), 'the terminal state is held in memory');
is(!/7 \* 24 \* 3600_000/.test(pass), 'the weekly re-stamp is gone, and with it the NaN that made it permanent');
is(/if \(!coverageDoneSaid\) \{/.test(pass), 'and the finished line is said once per process, not once a gap');

/* ═══════════════ §5 A FAILED PHRASE IS NOT A LOOP ═══════════════════════ */
/*
 * The step is marked done and the clock stamped BEFORE the command is queued.
 * If the search fails — a login wall, a page that will not load — the step is
 * spent and the next one runs in four hours. The alternative is a phrase that
 * cannot succeed being retried every tick, which is a loop of page loads
 * against his account.
 */
is(pass.indexOf('saveWorkerSetting(COVERAGE_SETTING') < pass.indexOf("command: 'discover'"),
  'the step is spent before the search is queued, so a failure costs the interval and not a loop');
is(/done: \[\.\.\.new Set\(\[\.\.\.\(fresh\.done \?\? \[\]\), step\.key\]\)\]/.test(pass),
  'and the cursor moves with it — as a union, so a concurrent write loses nothing and a replay appends nothing twice');

/*
 * ─── A WALL THAT GOES UP MID-SCROLL IS REPORTED, NOT SWALLOWED ───────────
 *
 * The second classifyPage in discoverGroups — the one whose own comment says
 * Facebook "can answer a search with a security check … by replacing the
 * page" — was guarded by `if (!found.groups.length)`, which is the one case
 * it was not needed for. A check interposed after the sixth of thirty scroll
 * passes leaves 40 cards in hand, so the length is non-zero, so the check was
 * skipped; the loop then exits quietly (a checkpoint page reports itself at
 * the bottom and grows no further) and the only trace was `truncated` and the
 * words "נסו מילה מדויקת יותר". For the automatic pass that is the worst
 * outcome available: the city is stamped done BEFORE the command is queued,
 * so it is recorded as scanned off a read Facebook cut short, nothing reaches
 * the attention flag, and twenty minutes later the next search runs against
 * an account sitting on an unanswered check. DEEP_PASSES widened the window
 * from about 17 seconds to about 42.
 */
{
  const session = code('worker/facebook/session.ts');
  const discover = session.slice(session.indexOf('  async discoverGroups('));
  /* `m` anchors, never a literal newline: the installer is built on Windows,
     where these files are read with CRLF. See package.test.ts. */
  const closes = /^  \}/m.exec(discover.slice(24));
  const body = discover.slice(0, 24 + (closes?.index ?? discover.length));
  is(!!closes, 'discoverGroups still closes where it can be sliced');
  is(!/if \(!found\.groups\.length\)\s+const after = await classifyPage/.test(body)
    && !/if \(!found\.groups\.length\) \{\s+const after = await classifyPage/.test(body),
    'the re-check is no longer skipped when cards were found');
  is(/const after = await classifyPage\(page\);/.test(body), 'it always runs');
  is(body.indexOf('const after = await classifyPage(page);') < body.indexOf('found.groups.length'),
    'before anything is decided from how many groups came back');
  /* The cards already read are real and are kept — this is not a data loss. */
  is(/return wall \? \{ \.\.\.found, security: wall, truncated: true \} : found;/.test(body),
    'and with cards in hand the groups are KEPT and the wall is reported beside them');
  is(/if \(wall && !found\.groups\.length\)/.test(body),
    'while an empty result behind a wall is still an outright refusal');
  /* And the worker does the three things silence did not. */
  const said = worker.slice(worker.indexOf('if (found.security) {'));
  const branch = said.slice(0, said.indexOf('result = found.security'));
  is(/state\.attention = found\.security;/.test(branch),
    'the worker raises attention, which is one of the states autoCommandHold refuses to start in');
  is(/logActivity\('warn', 'discover_interrupted'/.test(branch), 'writes it where the owner reads his history');
  is(/ok = false;/.test(branch), 'and does not report the search as a success');
  is(/discover_interrupted:/.test(code('src/lib/social/activity.ts')), 'and the event has a kind');
  is(/discover_interrupted:/.test(code('src/lib/social/activity-text.ts')), 'and a Hebrew headline');
}

/* ═══════════════ §6 A CATEGORY IS WHAT THE NAME SAYS ════════════════════ */
/*
 * Facebook's search is fuzzy: "יד שנייה חיפה" returns groups with neither
 * word in them. Filing those under "יד שנייה" would be a category nobody can
 * trust, so a group is filed only when it says so itself.
 */
eq(detectTopic('יד שנייה באר שבע'), 'יד שנייה', 'a group that says what it is, is filed as it');
eq(detectTopic('דירות להשכרה בחיפה'), 'נדל״ן', 'and the other spellings of the same thing count');
eq(detectTopic('קבוצה סתם'), '', 'a group that says nothing is filed as nothing');
eq(detectTopic(''), '', 'and an empty name does not crash it');
is(/category: f\.category \|\| detectTopic\(f\.name\)/.test(worker), 'the catalog reads the category off the name');
is(!/step\.topic\.id.*category|category.*step\.topic/.test(pass), 'never off the phrase that found the group');

/* ═══════════════ §7 AND THE SCREEN SAYS WHAT IT DOES ════════════════════ */

const card = slice(settings, 'כיסוי ארצי', '</Card>');
is(card.includes('לא מצטרפת לשום קבוצה'), 'the card says it joins nothing');
is(card.includes('לא שולחת בקשות הצטרפות'), 'and sends no join requests');
is(/COVERAGE_PER_DAY_MIN/.test(settings) && /COVERAGE_PER_DAY_MAX/.test(settings), 'the pace field is bounded on the screen too');
is(/getCoverage\(\)/.test(settings), 'and the screen reads the real stored value rather than guessing');
is(/coverageProgress/.test(settings), 'and shows how far the plan has got');
/*
 * ─── AND THE SCREEN KNOWS THE RUSSIAN ROUND EXISTS ───────────────────────
 *
 * The "כרגע" line is a claim about what the machine is doing at this moment.
 * While it works through Хайфа and Ашдод, saying "the ten narrow searches"
 * is the same class of wrong answer as the branches that were added when the
 * line claimed a switched-off plan was running.
 */
is(/p\.citiesRussian < p\.russianCities/.test(settings), 'the "כרגע" line has a branch for the Russian round');
is(/כל הערים נסרקו בעברית\. כרגע: שם העיר ברוסית/.test(settings), 'which says, in his words, what it is doing');
is(/מהן גם ברוסית/.test(settings), 'and the counter says how many cities were searched in Russian');
/* Every one of those sentences has a Russian of its own — the screen the
   feature is about must itself be readable in the language it searches in. */
for (const line of ['מהן גם ברוסית', 'כל הערים נסרקו בעברית. כרגע: שם העיר ברוסית, לערים שיש להן שם רוסי.']) {
  is(code('src/lib/social/i18n.ts').includes(`'${line}':`), `"${line.slice(0, 24)}" is translated`);
}

/* ═══════════════ §8 WHAT ONE SEARCH IS WORTH ════════════════════════════ */
/*
 * "כמה קבוצות הוא יכול למצוא בחיפוש" — and then "תחפש את כל הקבוצות שיש
 * בישראל". The expensive thing in a search is the PAGE, not the groups on
 * it: one search is one page load against his account whether it reads
 * twenty results or three hundred. So the ceiling is high and the scroll is
 * deep, and the early stop is what keeps a narrow phrase cheap.
 */
{
  const scan = code('worker/facebook/discover.ts');
  const cap = /const MAX_GROUPS = (\d+);/.exec(scan);
  const passes = /const DEEP_PASSES = (\d+);/.exec(scan);
  const typed = /const PASSES = (\d+);/.exec(scan);
  const pictures = /const PICTURE_LIMIT = (\d+);/.exec(scan);
  is(Number(cap?.[1]) >= 300, `one search reads up to ${cap?.[1]} groups off the page it already loaded`);
  is(Number(passes?.[1]) >= 30, `and the automatic pass scrolls it ${passes?.[1]} times`);
  /*
   * AND A SEARCH HE TYPED IS NOT MADE SLOWER BY ANY OF THIS. On a result list
   * inside its own scroll container the page never reports itself at the
   * bottom, so the loop runs every pass — thirty of them is twenty-five extra
   * seconds of spinner on a screen somebody is watching.
   * worker/test/discovery-complete.test.ts times exactly that page.
   */
  is(Number(typed?.[1]) <= 12, `while a search he types still scrolls ${typed?.[1]} times`);
  is(/opts\.deep \? DEEP_PASSES : PASSES/.test(scan), 'and the depth is the caller\u2019s choice, not a global');
  /* THE PICTURES DID NOT FOLLOW IT. That number is about his Supabase
     storage quota, which has not changed. */
  is(Number(pictures?.[1]) === 120, 'while the picture limit stays where storage put it');
  is(/barren = unique === lastCount \? barren \+ 1 : 0;/.test(scan) && /if \(barren >= 2 && atBottom\) break;/.test(scan),
    'and a list that stops growing ends the scroll, so a narrow phrase costs what it always did');
}

console.log(`${NAME} OK — ${checks} assertions over a ${coverageTotal(mine).toLocaleString('he-IL')}-step plan`);
