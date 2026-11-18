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
 *   §4  one search per interval, six a day out of the box, twenty-four at the
 *       ceiling and no setting above it;
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
  coverageGapMs,
  coverageKey,
  coveragePhrase,
  coverageProgress,
  coverageTotal,
  detectTopic,
  nextCoverageStep,
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

eq(COVERAGE_TOPICS.length, 10, 'ten kinds of group, as the brief asks');
is(new Set(COVERAGE_TOPICS.map((t) => t.id)).size === 10, 'each with an id of its own');
for (const t of COVERAGE_TOPICS) is(t.word.trim().length > 1, `"${t.id}" has a phrase to search`);

const mine = ['ערד', 'באר שבע'];
const cities = coverageCities(mine);
eq(cities.slice(0, 2), mine, 'the cities he already publishes in come first — that is where the next real group is');
is(cities[2] === BIG_CITIES.find((c) => !mine.includes(c)), 'then the big ones');
is(cities.length > 350, `and then the rest of the country (${cities.length} localities in the plan)`);
is(new Set(cities).size === cities.length, 'no locality is searched twice');
for (const c of cities) is(regionOf(c) !== '', `${c} is a real locality with a region`);

/* A city he typed by hand that is not a locality is not searched. */
is(!coverageCities(['אחר', 'סתם משהו']).includes('אחר'), '"אחר" is not a city and is never searched');

/* CITY-MAJOR: a city that has been searched is a city whose groups are in the
   catalog. Ten cities covered ten ways beats a hundred covered once. */
const first = nextCoverageStep([], mine);
eq(first?.city, 'ערד', 'the first search is in the first city');
eq(first?.phrase, `${COVERAGE_TOPICS[0].word} ערד`, 'and it is that city with the first phrase');
const aradDone = COVERAGE_TOPICS.map((t) => coverageKey('ערד', t.id));
eq(nextCoverageStep(aradDone, mine)?.city, 'באר שבע', 'the next city starts only once this one is finished');
eq(nextCoverageStep([...aradDone, coverageKey('באר שבע', COVERAGE_TOPICS[0].id)], mine)?.phrase,
  `${COVERAGE_TOPICS[1].word} באר שבע`, 'and a step already done is never repeated');

eq(coverageTotal(mine), cities.length * 10, 'the plan is every city times every phrase');
const progress = coverageProgress(aradDone, mine);
eq(progress.citiesDone, 1, 'a city counts as covered only when all ten of its phrases have run');
eq(progress.done, 10, 'and the step count is the cursor itself');
/* THE PLAN ENDS. A cursor that can never finish is a machine that searches
   for ever. */
const everything = cities.flatMap((c) => COVERAGE_TOPICS.map((t) => coverageKey(c, t.id)));
eq(nextCoverageStep(everything, mine), null, 'when every phrase has run, there is no next step');

/* ═══════════════ §2 A PHRASE IS A PHRASE ════════════════════════════════ */
/*
 * The whole safety story is that this invented no new way to touch Facebook.
 * It queues the SAME `discover` command the dashboard queues when he types a
 * search, so it inherits every protection that path has — the burst guard,
 * the idle window, the login check, the activity line.
 */
is(/command: 'discover'/.test(pass), 'it queues the same command a typed search queues');
is(/payload: \{ query: step\.phrase \}/.test(pass), 'with a phrase, and nothing else');
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

is(/if \(!cfg\.on\) return;/.test(pass), 'off is the default, and it is checked before anything else is read');
is(pass.indexOf('if (!cfg.on) return;') < pass.indexOf('workerDb()'),
  'and before the database is even asked — an update must not start searching by itself');
is(/on: false/.test(client), 'the stored default is off');
/* THE SCREEN WRITES THE SWITCH, THE WORKER WRITES THE CURSOR — and the screen
   must not hand the plan back its old position. */
const save = slice(client, 'export async function saveCoverage', 'export async function catalogCoverage');
is(/const now = await getCoverage\(\)/.test(save), 'the switch is written onto the row as it is NOW');
is(!/done:/.test(save), 'and the screen never writes the cursor, which the worker owns');

/* ═══════════════ §4 ONE AT A TIME, AND A CEILING ════════════════════════ */

eq(COVERAGE_PER_DAY_DEFAULT, 6, 'six searches a day out of the box');
eq(COVERAGE_PER_DAY_MAX, 24, 'twenty-four at the ceiling — one an hour, and no setting above it');
eq(clampCoveragePerDay(500), COVERAGE_PER_DAY_MAX, 'a number from anywhere is clamped to it');
eq(clampCoveragePerDay(0), COVERAGE_PER_DAY_MIN, 'and to the floor');
eq(clampCoveragePerDay(undefined), COVERAGE_PER_DAY_DEFAULT, 'and an absent setting is the default, not zero');
eq(coverageGapMs(6), 4 * 60 * 60_000, 'six a day is one every four hours');
eq(coverageGapMs(24), 60 * 60_000, 'and the ceiling is one an hour');
is(/coverageGapMs\(clampCoveragePerDay\(cfg\.perDay\)\)/.test(pass), 'the worker paces itself by that same gap, clamped');
is(/insert\(\{/.test(pass) && (pass.match(/insert\(/g) ?? []).length === 1, 'and queues exactly one search per interval');

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
is(/done: \[\.\.\.\(cfg\.done \?\? \[\]\), step\.key\]/.test(pass), 'and the cursor moves with it');

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

console.log(`${NAME} OK — ${checks} assertions over a ${coverageTotal(mine).toLocaleString('he-IL')}-step plan`);
