/*
 * ─────────────────────────────────────────────────────────────────────────────
 * "מאגר קבוצות פייסבוק ארצי" — THE NATIONAL CATALOG
 *
 *   "מאגר מרכזי של קבוצות פייסבוק בישראל... כאשר משתמש פותח את מסך הקבוצות,
 *    המערכת חייבת להציג מיד את הקבוצות שכבר קיימות במסד הנתונים. אין לבצע
 *    חיפוש חיצוני בכל כניסה למסך... יעד הביצועים: הצגת תוצאות ראשוניות בתוך
 *    שנייה." · "תוצאות בתוך שניה, כמו שרשום לך, מאגר פנימי של כל הקבוצות" ·
 *    "לא צריך ענן, הכל דרך המחשב."   — 18.11.2026
 *
 * EVERY SECTION BELOW IS ONE OF HIS CLAUSES, AND NONE OF THEM IS CHECKED BY
 * READING A COMMENT. The schema is built by running this repository's own
 * .sql into a real Postgres; "within a second" is measured on a catalog of
 * twenty thousand groups; "no external search" is a property of the code,
 * proved by what the component is allowed to import and call.
 *
 *   §1  the table exists as the repo's SQL builds it — columns, defaults,
 *       the two CHECKs, the six indexes;
 *   §2  it is shared, and it is append-and-correct only: no DELETE policy at
 *       all, and UPDATE is granted on the facts, never on the identity;
 *   §3  the language of a group is decided by ONE rule, written twice (SQL
 *       for the one-time seeding, TypeScript for every write after it) — and
 *       the two are run over the same names here and must agree;
 *   §4  "תוך שנייה", measured: first page, filtered page, name search with a
 *       true count, and the hundredth page;
 *   §5  the search, the filters, the order, the paging AND the count all
 *       happen in Postgres — the screen never filters an array, because a
 *       truncated array is where authoritative-looking wrong numbers come
 *       from;
 *   §6  the screen: one tab strip, the count it shows is the database's, and
 *       opening it queues nothing and opens no browser;
 *   §7  adding from the catalog writes the same row addGroup writes —
 *       nothing about publishing permission is invented;
 *   §8  the weekly sync runs on the PC, once every seven days, stamps before
 *       it works, opens no Facebook page, and says what it left behind.
 *
 *   npx tsx worker/test/catalog.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyFile, applySchema, available, one, refusedQuiet, resetSchema, rows, skip } from './db/harness';
import { catalogLanguage } from '../../src/lib/social/language';

const NAME = 'catalog';
const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8');
/* CODE, NOT PROSE — every file in this repository explains at length what it
   does not do, and a pin that matches a comment proves nothing. */
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

const v48 = src('supabase/social-schema-v48.sql');
const rollback = src('supabase/social-schema-v48-rollback.sql');
const latest = src('supabase/social-latest.sql');
const client = code('src/lib/social/client.ts');
const screen = code('src/components/social/GroupCatalog.tsx');
const groups = code('src/app/social/groups/page.tsx');
const worker = code('worker/social-worker.ts');

/* The three functions this file is about, sliced out so a pin cannot wander
   into the next function and pass on its code. */
const slice = (text: string, from: string, to: string) => {
  const a = text.indexOf(from);
  const b = text.indexOf(to, a + 1);
  assert.ok(a >= 0, `${from} is still in the file`);
  assert.ok(b > a, `${to} still follows ${from}`);
  return text.slice(a, b);
};
const searchFn = slice(client, 'export async function searchCatalog', 'export async function catalogStats');
const statsFn = slice(client, 'export async function catalogStats', 'export async function catalogFacets');
const adoptFn = slice(client, 'export async function adoptCatalogGroups', 'export async function requestGroupRefresh');
const addFn = slice(client, 'export async function addGroup', 'export const addManualGroup');
const syncFn = slice(worker, 'async function catalogSync(', 'async function withdrawRefusedMemberships');
const factsFn = slice(worker, 'async function catalogFacts(', 'async function catalogSync(');

/* ══════════════════ §3 ONE LANGUAGE RULE, WRITTEN TWICE ══════════════════ */
/*
 * The seeding SQL classifies the rows that already existed; catalogLanguage()
 * classifies every row written after that. They are two implementations of
 * one rule, and a disagreement means the same group is filed differently
 * depending on which of them saw it first — so they are run over the same
 * names, in Postgres and in TypeScript, and compared.
 */
const LANGUAGE_CASES: [string, string][] = [
  ['Беэр-Шева объявления и реклама', 'ru'],
  ['АРАД НАШ И РЕШАЕМ МЫ', 'ru'],
  ['Арад — наші', 'ru'],
  ['באר שבע ביחד', 'he'],
  ['לוח מודעות באר שבע', 'he'],
  ['مجموعة رهط للبيع والشراء', 'ar'],
  ['Arad Community Board', ''],
  ['Беэр-Шева — באר שבע', 'ru'],
  /* A single Cyrillic look-alike in a Hebrew name is a keyboard in the wrong
     layout, and this is the case the two-letter rule exists for. */
  ['בАד', ''],
  ['Аrad', ''],
  ['', ''],
];

for (const [name, want] of LANGUAGE_CASES) {
  eq(catalogLanguage(name), want, `catalogLanguage(${JSON.stringify(name)}) is ${want || 'unknown'}`);
}

/* ══════════ §5 THE DATABASE DOES THE WORK, NOT AN ARRAY IN THE BROWSER ═══ */

is(/\.ilike\(/.test(searchFn), 'the name search is an ilike in the query');
is(/count: 'exact'/.test(searchFn), 'the count comes back from the same query as the page');
is(/\.range\(/.test(searchFn), 'the page is a range, so a page is a page and not a slice of everything');
is(/\.order\(/.test(searchFn), 'and it is ordered in the database, so page 2 cannot repeat page 1');
for (const col of ['city', 'language', 'category']) {
  is(new RegExp(`\\.eq\\('${col}'`).test(searchFn), `${col} is filtered in the query`);
}
/*
 * AND THE SCREEN DOES NOT SECOND-GUESS IT. `.filter(` on the rows would be a
 * filter over one page, drawn beside a count of the whole match — the shape
 * of the bug this whole design exists to avoid.
 */
is(!/rows\.filter\(/.test(screen), 'the catalog screen never filters the page it was given');
is(!/rows\.length\.toLocaleString/.test(screen), 'and never prints the length of a page as a count of results');
is(/total\.toLocaleString/.test(screen), 'the number of results shown is the one the database returned');
/*
 * ONE REQUEST WINS AND IT IS THE LAST ONE TYPED: without a ticket, "באר"
 * landing after "באר שבע" replaces a narrow list with a wide one under the
 * owner's hands.
 */
is(/ticket\.current/.test(screen), 'a stale search answer cannot overwrite a newer one');

/* ══════════ §6 THE SCREEN OPENS NOTHING AND SCANS NOTHING ════════════════ */
/*
 * "אין לבצע חיפוש חיצוני בכל כניסה למסך" — a property of what the component
 * is able to do, not a promise in a comment. Nothing here may queue a worker
 * command or start a discovery run.
 */
for (const forbidden of ['startDiscovery', 'requestGroupRefresh', 'social_commands', 'queueCommand', 'fetch(']) {
  is(!screen.includes(forbidden), `the catalog screen does not call ${forbidden}`);
}
is(/searchCatalog|catalogStats|catalogFacets/.test(screen), 'it reads the catalog, and that is all it does');

/* The tab strip the brief names, with his three words in his order. */
const strip = slice(groups, "variant=\"tabs\"", '/>');
for (const label of ['מאגר ארצי', 'הקבוצות שלי', 'דורשות טיפול']) {
  is(strip.includes(label), `the tab strip has "${label}"`);
}
is(strip.indexOf('מאגר ארצי') < strip.indexOf('הקבוצות שלי'), 'and they are in the order he wrote them');
is(strip.indexOf('הקבוצות שלי') < strip.indexOf('דורשות טיפול'), 'all three of them');
/*
 * "דורשות טיפול" IS THE EXISTING FILTER, NOT A FOURTH LIST. The lit tab is
 * read off the status filter rather than stored beside it, which is what
 * makes it impossible for the highlighted tab and the list under it to
 * disagree — pressing "הצג אותן" in the card lights the tab too.
 */
is(/tabShown\s*=\s*tab === 'catalog' \? 'catalog' : status === 'blocked' \? 'care' : 'mine'/.test(groups),
  'the lit tab is derived from the filter, so it cannot contradict the list');
/* The header line he asked for: how many, and when it was last updated. */
is(screen.includes('מאגר ארצי') && screen.includes('עודכן לאחרונה'), 'the header line says the size of the catalog and when it changed');
is(/updatedAt/.test(statsFn) && /last_seen_at/.test(statsFn), 'and "עודכן לאחרונה" is read from the rows, not from a clock');

/* ══════════ §7 ADDING FROM THE CATALOG WRITES THE SAME ROW ═══════════════ */
/*
 * THE FIELD SETS MUST MATCH. adoptCatalogGroups exists for speed — sixty
 * groups in one statement instead of sixty round trips — and the moment its
 * row drifts from addGroup's, a group added from the catalog is a different
 * kind of row from one added by link: a missing permission_status or
 * can_api_publish is a group the worker treats as API-publishable, which it
 * is not.
 */
const fieldsOf = (fn: string) =>
  [...fn.matchAll(/^\s{4,}(channel|external_id|name|url|city|notes|permission_status|can_api_publish|enabled):/gm)]
    .map((m) => m[1])
    .sort();
eq(fieldsOf(adoptFn), fieldsOf(addFn), 'a catalog adoption writes exactly the fields addGroup writes');
is(/permission_status: 'browser'/.test(adoptFn), 'and publishing is still the browser on his PC');
is(/can_api_publish: false/.test(adoptFn), 'no API publishing is claimed for a catalog group');
/* "בחירת קבוצה אינה מקנה הרשאה לפרסום" — nothing here writes `enabled` on a
   campaign, a membership, or a permission; it adds a target row and stops. */
is(!/membership|permission:|approved/.test(adoptFn), 'selecting a group grants nothing');
/* A duplicate is a sentence, not an error — and a refusal is NOT a duplicate. */
is(/23505/.test(adoptFn), 'only Postgres’ duplicate code is counted as "already in the list"');
is(/failed/.test(adoptFn), 'anything else is reported as a failure, not hidden in a reassuring number');

/* ══════════ §8 THE WEEKLY SYNC, ON HIS PC, WITH NO BROWSER ═══════════════ */

is(/7 \* 24 \* 60 \* 60_000/.test(worker), 'the sync interval is seven days');
is(/CATALOG_SYNC_EVERY_MS/.test(syncFn), 'and the sync is the thing that reads it');
/* STAMPED BEFORE THE WORK: a failing write must cost a week, not a retry
   every five seconds for ever. */
is(syncFn.indexOf('catalogSyncAt:') < syncFn.indexOf('catalogFacts(db)'),
  'the stamp is written before the work, so a failure waits a week instead of retrying for ever');
/* A FUTURE STAMP IS "NEVER", not "done" — the same rule nightlyDue() applies
   to a machine whose clock is wrong. */
is(/last <= nowMs \? last : 0/.test(syncFn), 'a stamp in the future is treated as never, not as done');
/* IT OPENS NO FACEBOOK PAGE. This is the whole reason it may run outside the
   chore window, so it is a property, not a note. */
for (const forbidden of ['openPage', 'newPage', 'browser', 'goto', 'logPageOpen', 'sessionReady']) {
  is(!syncFn.includes(forbidden) && !factsFn.includes(forbidden), `the weekly sync never touches ${forbidden}`);
}
/* …and it is NOT one of the chores, which are all paced against the
   publishing gap precisely because they do open windows. */
const choreTable = slice(worker, 'const chores: {', '];');
is(!choreTable.includes('catalogSync'), 'the sync is not in the chore table — it costs the account nothing');
is(/await nightlyGroupCheck\(\);\s*await catalogSync\(\);/.test(worker), 'it runs beside the nightly check, which is the other database-only pass');
/* It reads what the PC already knows and nothing else. */
is(/social_discovery_groups/.test(factsFn), 'it carries over what discovery already found');
is(/social_targets/.test(factsFn), 'and what his own groups already know');
is(!/search|discover\(/.test(syncFn), 'it starts no search of its own');
/* NO SILENT CAP: a bounded pass says what it left for next week. */
is(/CATALOG_SYNC_MAX_UPDATES/.test(syncFn) && /left/.test(syncFn), 'a bounded pass reports what it did not reach');
is(/last_seen_at/.test(syncFn), 'and only a real change moves "עודכן לאחרונה"');

/* ══════════════════════ THE DATABASE ITSELF ══════════════════════════════ */

if (!available()) {
  skip(NAME);
  console.log(`${NAME} OK — ${checks} assertions (source only; no database reachable)`);
  process.exit(0);
}

resetSchema();
applySchema(repoRoot);
/*
 * v48 AGAIN, ON PURPOSE. applySchema() ends with grantLikeSupabase(), which
 * grants everything on every table to `authenticated` — that is what Supabase
 * itself does, and it would hide the narrow grants this table is built with.
 * Re-running the migration restores them, and is also a second proof that the
 * file is idempotent.
 */
applyFile(repoRoot, 'social-schema-v48.sql');

/* ── §1 the table, as the repo's SQL builds it ───────────────────────────── */
eq(one(`select to_regclass('public.social_group_catalog') is not null`), 't', 'the catalog table exists');

const columns = Object.fromEntries(
  rows(`select column_name, data_type || '|' || is_nullable || '|' || coalesce(column_default, '-')
          from information_schema.columns
         where table_name = 'social_group_catalog'`).map((r) => [r[0], r[1]]),
);
for (const [col, want] of [
  ['external_id', 'text|NO|-'],
  ['name', "text|NO|''::text"],
  ['url', "text|NO|''::text"],
  ['members', 'integer|YES|-'],
  ['privacy', "text|NO|'unknown'::text"],
  ['city', "text|NO|''::text"],
  ['region', "text|NO|''::text"],
  ['language', "text|NO|''::text"],
  ['category', "text|NO|''::text"],
  ['status', "text|NO|'active'::text"],
] as const) {
  eq(columns[col], want, `${col} is ${want}`);
}
is(columns.first_seen_at?.startsWith('timestamp with time zone|NO|now()'), 'first_seen_at defaults to now()');
is(columns.last_seen_at?.startsWith('timestamp with time zone|NO|now()'), 'last_seen_at defaults to now()');

/* The identity is the primary key: one row per group for the whole country,
   which is what "מאגר אחד משותף" means in a table. */
eq(
  one(`select a.attname from pg_index i join pg_class c on c.oid = i.indrelid
        join pg_attribute a on a.attrelid = c.oid and a.attnum = any(i.indkey)
       where c.relname = 'social_group_catalog' and i.indisprimary`),
  'external_id',
  'the group id is the primary key — one row per group, shared',
);

/* Both CHECKs, by what they refuse rather than by their text. refusedQuiet
   rather than a try/catch of our own: Postgres prints the violation on
   stderr, and a suite whose PASSING output contains two ERROR lines is a
   suite nobody reads. */
is(
  refusedQuiet(`insert into public.social_group_catalog (external_id, status) values ('chk1', 'whatever')`),
  'an invented status is refused',
);
is(
  refusedQuiet(`insert into public.social_group_catalog (external_id, privacy) values ('chk2', 'whatever')`),
  'an invented privacy is refused',
);
eq(one(`insert into public.social_group_catalog (external_id, status) values ('chk3', 'unavailable') returning status`), 'unavailable', 'and "unavailable" is accepted');

/* The six indexes the "within a second" promise rests on. */
const indexes = rows(`select indexname from pg_indexes where tablename = 'social_group_catalog' order by 1`).map((r) => r[0]);
is(indexes.length >= 6, `six indexes or more carry the search (found ${indexes.length})`);
is(indexes.some((i) => i.includes('name')), 'a trigram index on the name, for the search box');
eq(
  one(`select indexdef like '%gin%' from pg_indexes where tablename='social_group_catalog' and indexname like '%name%'`),
  't',
  'and it really is a GIN trigram index, not a btree that cannot answer a contains-search',
);
for (const col of ['city', 'language', 'category']) {
  is(indexes.some((i) => i.includes(col)), `an index for the ${col} filter`);
}
is(indexes.some((i) => i.includes('rank')), 'and one for the order the list is drawn in');

/* ── §2 shared, append-and-correct, never deletable ─────────────────────── */
const policies = rows(`select policyname, cmd, qual from pg_policies where tablename = 'social_group_catalog' order by 1`);
eq(policies.length, 3, 'three policies: read, add, correct');
eq(
  policies.map((p) => p[1]).sort(),
  ['INSERT', 'SELECT', 'UPDATE'],
  'and NO delete policy at all — "אסור למחוק מידע" is the table’s shape, not a rule somebody has to remember',
);
/*
 * NOT `true`. supabase/social-tenant-lock-strays.sql automatically locks any
 * social_* table whose policy qual is literally true — it is the guard that
 * stops a new table leaking across businesses — and this table is shared ON
 * PURPOSE, so it says what it means: a signed-in user, any signed-in user.
 */
for (const p of policies) {
  if (p[2]) is(p[2].includes('auth.uid()'), `policy "${p[0]}" is written as a signed-in check, not as true`);
}
eq(one(`select relrowsecurity from pg_class where relname = 'social_group_catalog'`), 't', 'row level security is on');

/* The grants: the facts may be corrected, the identity may not be rewritten. */
const updatable = rows(
  `select column_name from information_schema.column_privileges
    where table_name = 'social_group_catalog' and grantee = 'authenticated' and privilege_type = 'UPDATE' order by 1`,
).map((r) => r[0]);
is(updatable.includes('name') && updatable.includes('members') && updatable.includes('status'), 'the facts about a group can be corrected');
is(!updatable.includes('external_id'), 'but its id can never be rewritten — that would be a different group');
is(!updatable.includes('url'), 'and neither can its link');
is(!updatable.includes('first_seen_at'), 'nor when it was first seen');
eq(
  one(`select count(*) from information_schema.table_privileges
        where table_name = 'social_group_catalog' and grantee = 'authenticated' and privilege_type = 'DELETE'`),
  '0',
  'and nobody is granted DELETE',
);

/* ── §3 the SQL half of the language rule ───────────────────────────────── */
for (const [name, want] of LANGUAGE_CASES) {
  const got = one(`select case
      when $x$${name}$x$ ~ '[Ѐ-ԯ]{2}' then 'ru'
      when $x$${name}$x$ ~ '[؀-ۿ]{2}' then 'ar'
      when $x$${name}$x$ ~ '[֐-׿]{2}' then 'he'
      else '' end`);
  eq(got, want, `Postgres agrees with catalogLanguage on ${JSON.stringify(name)}`);
}
/* And the rule in the file is the rule that was just tested. */
is(v48.includes("'[Ѐ-ԯ]{2}'") && v48.includes("'[؀-ۿ]{2}'") && v48.includes("'[֐-׿]{2}'"),
  'the ranges in the migration are the ones proved above');
is(v48.indexOf("'[؀-ۿ]{2}'") < v48.indexOf("'[֐-׿]{2}'"),
  'and Arabic is decided before Hebrew, as catalogLanguage does — a mixed name must not change answer by writer');

/* ── the seeding really collapses two tenants' sightings into one row ───── */
rows(`
  insert into public.social_targets (channel, external_id, name, url, city, permission_status, can_api_publish, enabled)
  values ('facebook_group', 'seed-1', 'Беэр-Шева объявления', 'https://facebook.com/groups/seed-1', 'באר שבע', 'browser', false, true)
  on conflict do nothing;
  insert into public.social_discovery_groups (external_id, name, url, members, privacy, last_seen_at)
  values ('seed-1', 'Беэр-Шева объявления и реклама', 'https://facebook.com/groups/seed-1', 5600, 'public', now())
  on conflict do nothing;
`);
applyFile(repoRoot, 'social-schema-v48.sql');
eq(one(`select count(*) from public.social_group_catalog where external_id = 'seed-1'`), '1', 'one group, one row, however many tenants have seen it');
eq(one(`select language from public.social_group_catalog where external_id = 'seed-1'`), 'ru', 'and the seeding filed it under the language of its name');
eq(one(`select city from public.social_group_catalog where external_id = 'seed-1'`), 'באר שבע', 'with the city somebody verified, pulled across from the target row');

/* ── §4 "תוך שנייה", MEASURED ───────────────────────────────────────────── */
/*
 * Twenty thousand groups — more than the real catalog will hold for a long
 * while — and the four questions the screen actually asks. The budget is his
 * own: one second. The numbers printed below are the whole point of the
 * trigram index and the rank index, and if an index is ever dropped this is
 * the test that notices.
 */
rows(`
  insert into public.social_group_catalog (external_id, name, url, members, privacy, city, language, category, status)
  select 'perf-' || g,
         case g % 4 when 0 then 'קבוצת מודעות ' || g when 1 then 'Объявления ' || g when 2 then 'יד שנייה ' || g else 'דרושים ' || g end,
         'https://facebook.com/groups/perf-' || g,
         (g * 7) % 50000,
         case when g % 3 = 0 then 'public' else 'private' end,
         case g % 5 when 0 then 'באר שבע' when 1 then 'תל אביב' when 2 then 'ירושלים' when 3 then 'אשדוד' else 'ערד' end,
         case g % 3 when 0 then 'he' when 1 then 'ru' else '' end,
         case g % 4 when 0 then 'יד שנייה' when 1 then 'דרושים' else '' end,
         'active'
    from generate_series(1, 20000) g
  on conflict (external_id) do nothing;
  analyze public.social_group_catalog;
`);
eq(one(`select count(*) >= 20000 from public.social_group_catalog`), 't', 'twenty thousand groups are in the table');

const ms = (sql: string): number => {
  const out = rows(`explain (analyze, timing off, summary on) ${sql}`)
    .map((r) => r[0])
    .find((l) => l.includes('Execution Time'));
  return Number(/([\d.]+) ms/.exec(out ?? '')?.[1] ?? NaN);
};
const BUDGET = 1000;
const first = ms(`select * from public.social_group_catalog order by status, members desc nulls last limit 60`);
const filtered = ms(`select * from public.social_group_catalog where city = 'באר שבע' and language = 'ru' order by status, members desc nulls last limit 60`);
const search = ms(`select count(*) from public.social_group_catalog where name ilike '%מודעות%'`);
const deep = ms(`select * from public.social_group_catalog order by status, members desc nulls last limit 60 offset 6000`);
for (const [what, took] of [['first page', first], ['city + language', filtered], ['name search with a true count', search], ['page 100', deep]] as const) {
  is(Number.isFinite(took), `${what} was measured`);
  is(took < BUDGET, `${what} answers inside a second (${took}ms of ${BUDGET})`);
}
/* The load rows go again: this is a schema test, not a seeded database. */
rows(`delete from public.social_group_catalog where external_id like 'perf-%'`);

/* ── the rollback really is a rollback ──────────────────────────────────── */
is(/drop table if exists public\.social_group_catalog/.test(rollback), 'the rollback drops the table it created');
is(/pg_trgm/.test(v48), 'and the extension the search needs is created by the migration, not assumed');
is(latest.includes('social_group_catalog'), 'and social-latest.sql carries the whole thing, so one file still builds everything');
applyFile(repoRoot, 'social-schema-v48-rollback.sql');
eq(one(`select to_regclass('public.social_group_catalog') is null`), 't', 'after the rollback the table is gone and nothing else broke');
eq(one(`select to_regclass('public.social_targets') is not null`), 't', 'the groups he publishes to are untouched by the rollback');

console.log(`${NAME} OK — ${checks} assertions · first page ${first}ms, city+language ${filtered}ms, name search ${search}ms, page 100 ${deep}ms over 20,000 groups`);
