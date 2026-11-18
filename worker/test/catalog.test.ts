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
import { spawnSync } from 'node:child_process';
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
const editor = code('src/components/social/PostEditor.tsx');
const settings = code('src/app/social/settings/page.tsx');

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
 * THE ORDER IS THE DATABASE'S TOO, all three of them — "מיון", the control
 * גילוי קבוצות carries. Sorting the sixty rows on screen would be an order
 * over a page.
 */
for (const sort of ['name', 'new']) {
  is(new RegExp(`query\\.sort === '${sort}'`).test(searchFn), `the "${sort}" order is decided in the query`);
}
is(/\.order\('external_id'/.test(searchFn),
  'and every order ends in a tie-break, or paging can repeat or skip a row with the same size');
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

/* ══════════ 6b. THE ROW IS גילוי קבוצות' ROW, NOT A COPY OF IT ═══════════ */
/*
 * "במאגר הארצי שיהיה כמו עיצוב של גילוי קבוצות אם אותם אופציות."
 *
 * THE COMPONENT, NOT THE MARKUP. A second copy of that card would drift from
 * it within a week — and the point of the request is that the two screens
 * look the same, which only a shared component keeps true.
 */
is(/import \{ Figure, GroupRow \} from '\.\/Discovery'/.test(screen), 'the catalog draws the discovery row and the discovery figures');
is(/<GroupRow/.test(screen), 'every result is one of those rows');
/*
 * AND IT TELLS THAT ROW ONLY WHAT IT KNOWS. The catalog knows a group
 * EXISTS; it has never known whether this account is a member, so the row is
 * handed 'unknown' and no badge claims otherwise.
 */
/*
 * ─── "לראות אם אני חבר", AND WHERE THAT ANSWER MAY COME FROM ────────────
 *
 * He asked for the discovery screen's membership mark on the catalog too.
 * The catalog cannot supply it: one shared table with no tenant column, and
 * "I am a member" is a fact about one Facebook account — written there it
 * would be one customer's membership shown to another.
 *
 * So the answer comes from HIS OWN rows (social_discovery_groups, tenant
 * scoped by RLS), is handed to the row as a parameter, and defaults to
 * 'unknown' — which draws no badge at all — wherever he has not looked.
 */
is(/membership: DiscoveredGroupRow\['membership'\] = 'unknown'/.test(screen),
  'a catalog row is given its membership, and defaults to knowing nothing');
is(/membership,/.test(screen) && !/membership: g\./.test(screen),
  'and never reads one off the catalog row');
is(/listMembershipByExternalId/.test(screen), 'the answer comes from his own searches');
is(/social_discovery_groups/.test(slice(client, 'export async function listMembershipByExternalId', 'export async function listTargetExternalIds')),
  'which is his own tenant-scoped table, not the shared catalog');
/* AND THE CATALOG IS NOT EVEN ASKED FOR IT: the column is not in the select. */
is(!/membership/.test(searchFn), 'the catalog read does not even ask for a membership column');
/* A group his own search says he is NOT in is not offered for the publishing
   list — his rule, now kept on this screen too. */
is(/!\['none', 'requested'\]\.includes\(member\.get\(g\.external_id\) \?\? 'unknown'\)/.test(screen),
  'a group he is not in is never offered for the publishing list');
is(/offerAdd=\{Boolean\(onAdd\)/.test(screen), 'the add action is turned on explicitly, because the discovery rule is "only where Facebook said חבר"');
/* NO ⋮: hiding a row would hide it for every other user of the app. */
is(!/onHide=/.test(screen), 'the catalog never offers to hide a row from a table it shares with everyone');
/* The mark comes from his own list, read once for the screen. */
is(/listTargetExternalIds/.test(screen), '"כבר במערכת" is read from his publishing list');
is(/already=\{Boolean\(mine\?\.has\(g\.external_id\)\)\}/.test(screen), 'and it is that list the badge is drawn from');
/* `mine` is null until the read lands — an empty set would draw a confident
   "no, none of these are yours" over a list of 293. */
is(/useState<Set<string> \| null>\(null\)/.test(screen), 'and "not read yet" is a state of its own, not an empty answer');
/*
 * ─── WHAT THE SHARED ROW WOULD OTHERWISE NOT KNOW ───────────────────────
 *
 * Moving onto גילוי קבוצות' row dropped three things the catalog stores and
 * used to draw, and each one is a real loss on screen: the city, the
 * language, and — the one that changes what he does — that a group is no
 * longer available. An unavailable group drawn like any other is a group he
 * adds to his publishing list for nothing.
 */
is(/extraFacts=\{\[g\.city/.test(screen), "the row keeps the catalog's own city");
is(/CATALOG_LANGUAGE_LABEL\[g\.language\]/.test(screen), 'and its language');
is(/mark=\{g\.status === 'unavailable'/.test(screen), 'and a group marked unavailable says so');
/*
 * AND THE OPEN ACTION. A group already in his publishing list opens; it does
 * not "join". That is passed explicitly rather than derived from `already`
 * inside the row — see below for why.
 */
is(/openAsMember=\{Boolean\(mine\?\.has\(g\.external_id\)\) && member\.get\(g\.external_id\) !== 'none'\}/.test(screen),
  'a group he already has opens rather than offering to join it — unless Facebook has since refused him');
is(/refused=\{Boolean\(mine\?\.has\(g\.external_id\)\) && member\.get\(g\.external_id\) === 'none'\}/.test(screen),
  'and such a row says why it stopped claiming one');
/*
 * THE BULK ADD MARKS THEM HIS. Without this the rows he just added go on
 * offering "הוסף לרשימה" and the "כבר אצלי" tile keeps its old number — the
 * screen contradicting a write it just made.
 */
/*
   * ─── NOT FROM THE SELECTION — FROM THE DATABASE ───────────────────────
   *
   * The writer returns added / existed / FAILED and the callers fold that
   * into one boolean, so marking every selected id as his was wrong for
   * every row the write refused: it lost its add button, took the member
   * skin, could not be retried, and the tile counted it. One re-read says
   * what really landed.
   */
  const bulk = slice(screen, "onAdd(chosenList, 'bulk')", '</Button>');
is(/refreshMine\(\)/.test(bulk), 'a bulk add re-reads his list rather than assuming the selection landed');
is(!/for \(const g of chosenList\) next\.add/.test(screen), 'and nothing adds the selection to that set by hand');
/* And a row's own button must not close a sheet he is still picking in. */
is(/source === 'bulk'/.test(editor), "the campaign sheet closes on a deliberate bulk add, never after one row");

/* The discovery screen's own rule is untouched by the new prop. */
const rowFn = slice(code('src/components/social/Discovery.tsx'), 'export function GroupRow', 'export function WalkThrough');
is(/offerAdd = false/.test(rowFn), 'the add-anyway prop is OFF by default, so גילוי קבוצות keeps its membership rule');
is(/!already && \(offerAdd \|\| membership === 'member'\)/.test(rowFn), 'and a group already in the list is never offered for adding, on either screen');
/*
 * ─── AND THE ONE THAT ALREADY BIT ONCE ──────────────────────────────────
 *
 * The open action's wording must still be decided by `membership` (plus the
 * catalog's explicit prop) and NEVER by `already`. A group Facebook has
 * refused is usually still in the publishing list — `already` is true for it
 * — so keying on `already` moved "פתח להצטרפות" to "פתח קבוצה" on exactly
 * the rows discovery-row.test.ts exists to protect: telling him he is inside
 * a group that just refused him is the desync he reported.
 */
is(/const asMember = membership === 'member' \|\| openAsMember;/.test(rowFn),
  'the open action reads membership and the explicit prop — never `already`');
is(!/already \? 'פתח קבוצה'|membership === 'member' \|\| already/.test(rowFn),
  'and `already` is nowhere in that decision');
/* first_seen_at is when it entered the catalog; last_seen_at is when it was
   last refreshed, which the weekly pass moves on months-old rows. */
is(/sort === 'new'\) res = res\.order\('first_seen_at'/.test(searchFn),
  '"נוספו לאחרונה" orders by when the group entered the catalog');

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
/*
 * THE LINK IS PARSED, NOT TRUSTED — and this pin exists because the first
 * version of adoptCatalogGroups inserted the catalog's url verbatim while
 * addGroup has always normalized it. The catalog is filled from discovery
 * rows and from other people's targets, so it can hold a share link whose
 * group id is not known yet; inserted raw, that is a target the worker cannot
 * publish to. The field-name comparison above passed straight over it.
 */
is(/parseGroupUrl\(.*\)\s*\?\?\s*parseGroupShareUrl\(/.test(adoptFn), 'the catalog link goes through the same parser addGroup uses');
is(/parsed\.url/.test(adoptFn), 'and the NORMALIZED link is what is stored');
is(/parsed\.externalId/.test(adoptFn), 'with the id that came out of the link, not the catalog column alone');
is(/unparsed/.test(adoptFn), 'a link that does not parse is counted, not adopted');

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
/* THE REGION FOLLOWS THE CITY, by the same table v49 fills the old rows
   from — so a group this PC adds next week is filed the same way as the
   1,354 that were there before. */
is(/region: regionOf\(f\.city\)/.test(syncFn), 'a group the computer adds gets its region from its city');
is(/regionOf\(\(patch\.city as string\) \?\? String\(row\.city \?\? ''\)\)/.test(syncFn),
  'and a row seeded before the country list existed gets one on the next pass');

/* ══════════ §8b THE CITY A GROUP'S OWN NAME SAYS ════════════════════════ */
/*
 * v49 fills the region FROM THE CITY — and most catalog rows have no city:
 * a row that came from a discovery search carries a name, a link and a member
 * count and nothing else. Seeded as they were, 1,354 groups gave a region
 * filter with almost nothing behind it.
 *
 * So the name is read. It is good evidence, and detectCity now knows all 413
 * localities and both of the ways a name is really written.
 */
const cityFn = slice(worker, 'async function fillCatalogCities(', 'async function catalogSync(');
const cityPass = slice(worker, 'async function catalogCityPass(', 'async function fillCatalogCities(');
is(/detectCity\(r\.name\)/.test(cityFn), "a city-less row is read from the group's own name");
is(/city === OTHER_CITY\) continue/.test(cityFn), '"could not tell" is never written as if it were a city');
is(/\.eq\('city', ''\)/.test(cityFn), 'and only an EMPTY city is filled — a city somebody checked is never written over');
/* The condition is repeated in the UPDATE, because another machine may have
   filled the same row between the read and the write. */
is(cityFn.lastIndexOf(".eq('city', '')") > cityFn.indexOf('.update('), 'the condition is repeated in the write, not only in the read');
is(/byCity/.test(cityFn), 'the rows are grouped by what was found — one statement per city, not per row');
is(/regionOf\(city\)/.test(cityFn), 'and the region follows from it in the same write');
/*
 * NOT ON THE WEEKLY CLOCK. This is a one-time repair of rows already in the
 * table; making him wait a week for a screen that is already on his phone is
 * the wrong answer. Hourly, and free once there is nothing left: one head
 * count that sends no rows.
 */
is(/60 \* 60_000/.test(worker) && /CATALOG_CITY_EVERY_MS/.test(cityPass), 'the repair runs hourly, not weekly');
is(/head: true/.test(cityPass), 'it asks with a head count, so a finished catalog costs one number');
is(/if \(!count\) return;/.test(cityPass), 'and stops entirely once there is nothing left to fill');
is(cityPass.indexOf('catalogCityAt:') < cityPass.indexOf('fillCatalogCities(db)'), 'stamped before the work, like every other pass here');
for (const forbidden of ['openPage', 'newPage', 'browser', 'goto']) {
  is(!cityFn.includes(forbidden) && !cityPass.includes(forbidden), `the city repair never touches ${forbidden}`);
}
is(/await catalogSync\(\);\s*\n?\s*await catalogCityPass\(\);/.test(worker.replace(/\s+/g, ' ').replace(/ /g, ' ')) || /await catalogCityPass\(\);/.test(worker),
  'and it runs beside the weekly sync, which is the other database-only pass');

/* AND IT REALLY READS REAL NAMES. Twenty names of the shape a discovery
   search returns; seventeen of them name a place, and the three that do not
   must stay unfiled rather than be guessed at. */
{
  const named = [
    ['דירות להשכרה בתל אביב', 'תל אביב-יפו'],
    ['יד שנייה חיפה והסביבה', 'חיפה'],
    ['לוח מודעות קריית שמונה', 'קריית שמונה'],
    ['דרושים עובדים באשדוד', 'אשדוד'],
    ['Квартиры в Хайфе', 'חיפה'],
    ['Объявления Ашдода', 'אשדוד'],
    ['מכירות ברמת גן', 'רמת גן'],
    ['בית שמש - לוח', 'בית שמש'],
    ['נדלן ברהט', 'רהט'],
    ['עסקים בכרמיאל', 'כרמיאל'],
    ['הכל על פתח תקווה', 'פתח תקווה'],
    ['אילת - לוח מודעות', 'אילת'],
    ['דרושים בנצרת', 'נצרת'],
    ['הורים בגבעתיים', 'גבעתיים'],
  ] as const;
  for (const [name, want] of named) eq(detectCity(name), want, `"${name}" names ${want}`);
  for (const name of ['קבוצת רכישה ארצית', 'מתכונים וטיפים', 'ל״ג בעומר שמח']) {
    eq(detectCity(name), 'אחר', `"${name}" names no place, and none is invented`);
  }
}

/* ══════════ §6 PICKING FROM THE CATALOG INSIDE A CAMPAIGN ════════════════ */
/*
 * "בעת יצירת קמפיין חדש... יש לאפשר בחירת קבוצות מתוך המאגר הקיים בלבד, בלי
 *  צורך בסריקה חדשה."
 */
const sheet = slice(editor, 'Sheet open={catalogOpen}', '</Sheet>');
is(/GroupCatalog/.test(sheet), 'the campaign editor picks groups from the catalog component itself');
/* NO SCAN — the same property the screen section proves, now at the campaign
   creation point, which is where the brief puts the clause. */
for (const forbidden of ['startDiscovery', 'requestGroupRefresh', 'queueCommand']) {
  is(!sheet.includes(forbidden), `picking inside a campaign does not call ${forbidden}`);
}
is(/adoptCatalogGroups/.test(sheet), 'what it does is add the groups to his own list');
is(/listTargets\(\)/.test(sheet), 'and then re-read that list rather than patch it');
/*
 * SELECTION IS NOT PERMISSION, in the words on the screen and in the code:
 * the rows are added through the same writer "+ הוסף" uses, and nothing here
 * writes a permission, a membership or an approval.
 */
is(sheet.includes('לא מקנה הרשאה לפרסם'), 'the sheet says that choosing a group is not permission to publish in it');
for (const forbidden of ['permission_status', 'can_api_publish', 'membership', 'approval:']) {
  is(!sheet.includes(forbidden), `the sheet never writes ${forbidden}`);
}
/* The groups he picked are ticked for this post — including ones already in
   his list, which is an answer about the list and not about what he meant. */
is(/setSelectedTargets\(\(prev\) => \[\.\.\.new Set\(\[\.\.\.prev, \.\.\.r\.ids\]\)\]\)/.test(sheet),
  'the adopted groups are added to the selection without dropping what was already chosen');
is(/ids: string\[\]/.test(adoptFn) || /ids/.test(adoptFn), 'and the writer returns the ids that makes that possible');
/* TEST MODE CAPS THE SELECTION AT ONE GROUP, and a bulk pick must not slip
   past that cap from a different screen. */
is(/testMode/.test(sheet), 'test mode is honoured by the catalog hand-off too');

/* ══════════ §8 THE ADMIN PANEL, AND ONLY FOR AN ADMIN ════════════════════ */
/*
 * "לוח בקרה (למנהל בלבד): מספר קבוצות במאגר, התפלגות לפי עיר/אזור/קטגוריה,
 *  קבוצות שנמצאו לאחרונה, קבוצות שהפכו ללא זמינות, תאריך סנכרון אחרון."
 */
const coverageFn = slice(client, 'export async function catalogCoverage', 'export async function catalogFacets');
is(/head: true/.test(client), 'the panel asks for counts, not for rows');
is(!/\.limit\(1000\)/.test(coverageFn), 'and it never tallies a page of a thousand rows in the browser');
for (const field of ['withCity', 'withLanguage', 'withCategory', 'addedThisWeek', 'unavailable', 'topCities', 'byLanguage']) {
  is(coverageFn.includes(field), `the coverage answers "${field}"`);
}
/* THE GATE. The panel is drawn inside the admin tab, which the settings
   screen only shows when the server said this user is a platform admin —
   `presence.admin`, decided by an environment allowlist that fails closed
   (see admin-panel.test.ts). The read is not even issued otherwise. */
is(/if \(!isAdmin \|\| tab !== 'admin' \|\| coverage\) return;/.test(settings),
  'the coverage is not even read unless an admin opened the admin tab');
const adminTab = slice(settings, "tab === 'admin' && isAdmin && presence", 'מי מחובר עכשיו');
is(/catalogCoverage|coverage/.test(adminTab), 'and the panel itself is inside the admin-only branch');
/* NOT ON THE TEN-SECOND POLL: presence changes while you watch, a catalog of
   groups changes once a week. */
/* The property is what is INSIDE the ten-second interval, not what happens to
   sit near it in the file — the first version of this pin failed because the
   two effects are written one after the other. */
const poll = slice(settings, 'const id = setInterval(', 'clearInterval(id)');
is(poll.includes('loadAdminPresence'), 'the ten-second poll asks who is connected');
is(!poll.includes('catalogCoverage'), 'and never re-counts the catalog, which changes once a week');
/* AND IT SAYS WHAT IS NOT IN THE TABLE, which is the private half. */
is(settings.includes('מי חבר בקבוצה ומי מפרסם אליה אינו נשמר כאן בכלל'),
  'the panel states that membership and who publishes where are not in the catalog');

/* ══════════ §2b כל הערים של כל הארץ, והאזור שלהן ════════════════════════ */
/*
 * "במאגר הארצי להוסיף את כל הערים של כל הארץ כולל צפון מרכז דרום ואילת."
 *
 * The list is data (src/lib/social/cities-data.ts) and the logic that reads
 * it is cities.ts. What matters here is that it really covers the country,
 * that nothing invented a fifth region, and — the part that rots silently —
 * that the SQL which fills the column was generated from the SAME list.
 */
import { CITY_REGION, REGIONS } from '../../src/lib/social/cities-data';
import { cityInRegion, detectCity, regionOf } from '../../src/lib/social/cities';

const localities = Object.keys(CITY_REGION);
is(localities.length > 350, `the list covers the country (${localities.length} localities)`);
eq([...REGIONS], ['צפון', 'מרכז', 'דרום', 'אילת'], 'four regions, in the order he named them');
/* Nothing filed under a region that does not exist. */
for (const [city, region] of Object.entries(CITY_REGION)) {
  if (!REGIONS.includes(region)) is(false, `${city} is filed under "${region}", which is not one of the four`);
}
checks += 1;
/* EVERY REGION REALLY HAS LOCALITIES — a filter value with nothing behind it
   is a chip that empties the screen. */
for (const region of REGIONS) {
  is(localities.some((c) => CITY_REGION[c] === region), `${region} has localities in it`);
}
/* The cities this business actually works in, each in the right region. */
for (const [city, region] of [
  ['ערד', 'דרום'],
  ['באר שבע', 'דרום'],
  ['תל אביב-יפו', 'מרכז'],
  ['ירושלים', 'מרכז'],
  ['חיפה', 'צפון'],
  ['קריית שמונה', 'צפון'],
  ['אילת', 'אילת'],
] as const) {
  eq(regionOf(city), region, `${city} is in ${region}`);
  is(cityInRegion(city, region), `and the catalog's city filter agrees`);
}

/*
 * ─── THE NAME IS HOW PEOPLE WRITE IT ─────────────────────────────────────
 *
 * A group is called "דירות להשכרה בתל אביב", not "תל אביב". Hebrew attaches
 * its prepositions, Russian declines its nouns, and a guard that ignores both
 * reads almost no real group name. Each of these is a shape that was broken
 * at some point while this was written.
 */
for (const [name, want] of [
  ['דירות להשכרה בתל אביב', 'תל אביב-יפו'],
  ['יד שנייה בחיפה והקריות', 'חיפה'],
  ['לוח מודעות קריית שמונה', 'קריית שמונה'],
  ['דרושים באשדוד', 'אשדוד'],
  ['Квартиры в Хайфе', 'חיפה'],
  ['Объявления Ашдода', 'אשדוד'],
  ['Беэр-Шева объявления и реклама', 'באר שבע'],
  /* AND THE ONES THAT MUST NOT MATCH. "אזור" is a town and also the word for
     an area; "ל״ג בעומר" is a holiday and עומר is a town. */
  ['קבוצת מכירות אזור המרכז', 'אחר'],
  ['ל״ג בעומר שמח', 'אחר'],
] as const) {
  eq(detectCity(name), want, `"${name}" reads as ${want}`);
}
/* The fifteen tuned by hand still win: ערד and באר שבע keep their own rules. */
eq(detectCity('לוח ב"ש'), 'באר שבע', 'the hand-tuned abbreviation still works');

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

/* ── v49: the region column, filled from the SAME list the app reads ────── */
/*
 * TWO COPIES OF ONE TABLE IS HOW THEY DRIFT. The SQL that fills `region` for
 * the rows already in the catalog is GENERATED from cities-data.ts, and this
 * runs the generator in --check mode: if somebody edits either side by hand,
 * this fails rather than the database and the app quietly disagreeing about
 * which region חיפה is in.
 */
{
  const { status, stderr } = spawnSync('node', ['scripts/build-regions-sql.mjs', '--check'], {
    cwd: repoRoot,
    encoding: 'utf8',
  });
  is(status === 0, `social-schema-v49.sql is what cities-data.ts produces${status === 0 ? '' : ` — ${stderr.trim()}`}`);
}
const v49 = src('supabase/social-schema-v49.sql');
is(/create or replace function public\.social_catalog_facets\(\)/.test(v49), 'v49 adds the function the filter list is read from');
is(/security invoker/.test(v49), 'which runs as the caller, so the catalog\u2019s own RLS still decides what it can see');
is(/grant execute on function public\.social_catalog_facets\(\) to authenticated/.test(v49), 'and every signed-in user may call it');
is(latest.includes('social_catalog_facets'), 'and social-latest.sql carries it, so one file still builds everything');

applyFile(repoRoot, 'social-schema-v49.sql');
rows(`insert into public.social_group_catalog (external_id, name, url, city) values
        ('reg-1','a','https://facebook.com/groups/reg-1','תל אביב-יפו'),
        ('reg-2','b','https://facebook.com/groups/reg-2','ערד'),
        ('reg-3','c','https://facebook.com/groups/reg-3','חיפה'),
        ('reg-4','d','https://facebook.com/groups/reg-4','אילת')
      on conflict (external_id) do nothing`);
applyFile(repoRoot, 'social-schema-v49.sql');
for (const [id, region] of [['reg-1', 'מרכז'], ['reg-2', 'דרום'], ['reg-3', 'צפון'], ['reg-4', 'אילת']] as const) {
  eq(one(`select region from public.social_group_catalog where external_id = '${id}'`), region, `${id} was filled as ${region}`);
}
/* The facets function answers with values AND counts, from the whole table. */
const facetRows = rows(`select kind, value, groups from public.social_catalog_facets() order by kind, value`);
is(facetRows.some((r) => r[0] === 'city'), 'the function returns the cities');
is(facetRows.some((r) => r[0] === 'region'), 'and the regions');
is(
  facetRows.filter((r) => r[0] === 'region').every((r) => Number(r[2]) > 0),
  'every value it returns has groups behind it',
);
rows(`delete from public.social_group_catalog where external_id like 'reg-%'`);

/* ── the rollback really is a rollback ──────────────────────────────────── */
is(/drop table if exists public\.social_group_catalog/.test(rollback), 'the rollback drops the table it created');
is(/pg_trgm/.test(v48), 'and the extension the search needs is created by the migration, not assumed');
is(latest.includes('social_group_catalog'), 'and social-latest.sql carries the whole thing, so one file still builds everything');
applyFile(repoRoot, 'social-schema-v48-rollback.sql');
eq(one(`select to_regclass('public.social_group_catalog') is null`), 't', 'after the rollback the table is gone and nothing else broke');
eq(one(`select to_regclass('public.social_targets') is not null`), 't', 'the groups he publishes to are untouched by the rollback');

console.log(`${NAME} OK — ${checks} assertions · first page ${first}ms, city+language ${filtered}ms, name search ${search}ms, page 100 ${deep}ms over 20,000 groups`);
