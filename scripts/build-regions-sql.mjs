/**
 * ─── THE REGION BACKFILL, GENERATED FROM THE ONE LIST ─────────────────────
 *
 * src/lib/social/cities-data.ts is where every locality in the country and
 * its region live. The database needs the same answer for the 1,354 rows that
 * are already in the catalog, and the only honest way to have it twice is to
 * generate one from the other.
 *
 * Writes the block between the REGIONS:BEGIN / REGIONS:END markers in
 * supabase/social-schema-v49.sql. worker/test/catalog.test.ts runs this and
 * fails if the committed file is not what it produces — so the SQL cannot
 * drift from the list the app reads.
 *
 *   node --experimental-strip-types scripts/build-regions-sql.mjs   (or: npx tsx)
 */
import { readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

/* Read the data file as TEXT and parse the literal out of it, rather than
   importing TypeScript from a plain node script: no build step, no tsx
   dependency, and the test can run this anywhere. */
const src = readFileSync(path.join(root, 'src/lib/social/cities-data.ts'), 'utf8');
const body = src.slice(src.indexOf('CITY_REGION'), src.indexOf('CITY_SPELLINGS'));
const pairs = [...body.matchAll(/^\s*'((?:[^'\\]|\\.)*)':\s*'([^']+)',$/gm)].map(([, he, region]) => [
  he.replace(/\\'/g, "'").replace(/\\\\/g, '\\'),
  region,
]);
if (pairs.length < 300) throw new Error(`only ${pairs.length} localities parsed — the data file's shape changed`);

const quote = (s) => `'${s.replace(/'/g, "''")}'`;
const lines = [
  'update public.social_group_catalog c',
  '   set region = v.region',
  '  from (values',
  ...pairs.map(([he, region], i) => `    (${quote(he)}, ${quote(region)})${i === pairs.length - 1 ? '' : ','}`),
  '  ) as v(city, region)',
  ' where c.city = v.city',
  '   and c.region is distinct from v.region;',
];

const file = path.join(root, 'supabase/social-schema-v49.sql');
const sql = readFileSync(file, 'utf8');
const begin = '-- ─── REGIONS:BEGIN ───';
const end = '-- ─── REGIONS:END ───';
const a = sql.indexOf(begin);
const b = sql.indexOf(end);
if (a < 0 || b < 0) throw new Error('the REGIONS markers are gone from social-schema-v49.sql');
const next = `${sql.slice(0, a + begin.length)}\n-- ${pairs.length} יישובים, מתוך src/lib/social/cities-data.ts\n${lines.join('\n')}\n${sql.slice(b)}`;

if (process.argv.includes('--check')) {
  if (next !== sql) {
    console.error('social-schema-v49.sql is not what cities-data.ts produces — run: node scripts/build-regions-sql.mjs');
    process.exit(1);
  }
  console.log(`regions SQL matches cities-data.ts (${pairs.length} localities)`);
} else {
  writeFileSync(file, next);
  console.log(`regions SQL written from cities-data.ts (${pairs.length} localities)`);
}
