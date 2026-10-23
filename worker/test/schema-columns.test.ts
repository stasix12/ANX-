/**
 * WHAT THE CODE WRITES vs WHAT THE DATABASE HAS.
 *
 * On 12.10.2026 a launch gained a column — `social_schedules.drip_gap_seconds`
 * — and no .sql file in this repository ever created it. For eleven days
 * every launch of a post to more than one group answered PGRST204 and queued
 * nothing, while a round that was already running kept publishing because the
 * daily repeat writes no drip_* fields. The dashboard looked alive. The
 * library filled up with posts that said "טרם פורסם".
 *
 * THE SUITE WAS GREEN THROUGHOUT. worker/test/unit.test.ts:1830 asserts the
 * field IS written, by reading library.ts as text — which is exactly the
 * wrong half of the question, and the reason a source-text guard can make a
 * missing migration look like a tested feature.
 *
 * So this file asks the other half, against a real Postgres built from this
 * repository's own .sql files: every field on every row interface in
 * types.ts must exist as a column on the table it describes.
 *
 * It is the general form of that bug, not a pin on that one column.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySchema, available, resetSchema, rows, skip } from './db/harness';

const NAME = 'schema vs code (real postgres)';

if (!available()) {
  skip(NAME);
  process.exit(0);
}

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};

/**
 * Which interface describes which table. Declared rather than guessed: the
 * names do not follow one rule (SocialTarget → social_targets, QueueItem →
 * social_queue, Campaign → social_campaigns), and a guess that silently
 * matched nothing would make this file pass by checking zero columns.
 */
const TABLE_OF: Record<string, string> = {
  SocialAccount: 'social_accounts',
  SocialTarget: 'social_targets',
  Campaign: 'social_campaigns',
  Post: 'social_posts',
  Variant: 'social_variants',
  Schedule: 'social_schedules',
  QueueItem: 'social_queue',
  SocialWorker: 'social_workers',
  WorkerCommand: 'social_worker_commands',
  ActivityEntry: 'social_activity_log',
  DiscoveredGroupRow: 'social_discovery_groups',
  DiscoverySearchRow: 'social_discovery_searches',
};

/**
 * Fields that are NOT columns, with the reason each one is here.
 *
 * Kept short on purpose: every entry is a place where a row interface carries
 * something the database does not, and the next person has to be able to see
 * why without running anything.
 */
const NOT_COLUMNS: Record<string, string[]> = {
  /* Joined in by the select, not stored on the row. */
  QueueItem: ['target', 'post', 'variant', 'campaign'],
  SocialWorker: ['online'],
};

/** The body of `export interface X { … }`, braces balanced. */
function interfaceBody(src: string, name: string): string | null {
  const start = src.indexOf(`export interface ${name} {`);
  if (start === -1) return null;
  let depth = 0;
  for (let i = src.indexOf('{', start); i < src.length; i += 1) {
    if (src[i] === '{') depth += 1;
    else if (src[i] === '}') {
      depth -= 1;
      if (depth === 0) return src.slice(src.indexOf('{', start) + 1, i);
    }
  }
  return null;
}

/** Field names declared at the TOP level of that body, comments removed. */
function fieldsOf(body: string): string[] {
  const clean = body.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const out: string[] = [];
  let depth = 0;
  for (const line of clean.split('\n')) {
    const trimmed = line.trim();
    if (depth === 0) {
      const m = /^([a-z_][a-z0-9_]*)\??\s*:/i.exec(trimmed);
      if (m) out.push(m[1]);
    }
    depth += (line.match(/[{([]/g) ?? []).length - (line.match(/[})\]]/g) ?? []).length;
  }
  return [...new Set(out)];
}

async function main(): Promise<void> {
  resetSchema();
  applySchema(repoRoot);

  const types = readFileSync(path.join(repoRoot, 'src/lib/social/types.ts'), 'utf8');

  const columns = new Map<string, Set<string>>();
  for (const [table, column] of rows(
    `select table_name, column_name from information_schema.columns where table_schema='public' order by 1, 2`,
  )) {
    if (!columns.has(table)) columns.set(table, new Set());
    columns.get(table)!.add(column);
  }

  let compared = 0;
  for (const [iface, table] of Object.entries(TABLE_OF)) {
    const body = interfaceBody(types, iface);
    is(body !== null, `types.ts no longer declares ${iface} — this guard stopped covering ${table}`);
    if (!body) continue;
    const have = columns.get(table);
    is(Boolean(have), `the schema has no table ${table}, which ${iface} describes`);
    if (!have) continue;

    const skipFields = new Set(NOT_COLUMNS[iface] ?? []);
    const declared = fieldsOf(body).filter((f) => !skipFields.has(f));
    is(declared.length > 2, `only ${declared.length} fields were parsed out of ${iface} — the parser broke, and this file now proves nothing`);

    for (const field of declared) {
      compared += 1;
      is(
        have.has(field),
        `${iface}.${field} is written by the code and does not exist on ${table}. ` +
          'Either add it in a migration under supabase/, or take it off the interface.',
      );
    }
  }

  is(compared > 150, `only ${compared} fields were compared across ${Object.keys(TABLE_OF).length} tables`);

  /*
   * AND THE ONE THAT STARTED IT, named so the regression is unmistakable.
   * slots.ts reads it, library.ts writes it on every multi-group launch, and
   * v28 is the file that creates it.
   */
  is(
    Boolean(columns.get('social_schedules')?.has('drip_gap_seconds')),
    'social_schedules.drip_gap_seconds is missing again — every launch to more than one group will answer PGRST204',
  );

  console.log(`${NAME} OK — ${checks} assertions, ${compared} columns compared against a real Postgres`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
