/**
 * A REAL POSTGRES, FOR THE THINGS A FAKE CANNOT PROVE.
 *
 * "שני Workers שמנסים לקחת אותה משימה" — the owner asked for that as a test,
 * and it is not a test you can write against an in-memory stand-in. Whether
 * two concurrent claims can both win is a question about Postgres: about
 * READ COMMITTED, about what a conditional UPDATE sees when another
 * transaction has it locked, and about which of this schema's unique indexes
 * are partial. A hand-written fake answers whatever its author believed.
 *
 * So these tests run the repository's own .sql files into a real server and
 * then race real sessions at it.
 *
 * WHERE THE SERVER COMES FROM, in order:
 *   1. ANX_TEST_DATABASE_URL — a server somebody else started (CI's service
 *      container, or a developer's own).
 *   2. nothing — the suite SKIPS, loudly, and exits 0.
 *
 * It never, ever points at the production database: a DSN is used only when
 * it is explicitly handed in through that one variable, and every test here
 * creates its own schema-qualified rows and drops them again.
 */
import { execFile, execFileSync } from 'node:child_process';
import { readdirSync } from 'node:fs';
import path from 'node:path';
import { promisify } from 'node:util';

const run = promisify(execFile);

export const DSN = process.env.ANX_TEST_DATABASE_URL ?? '';

/** Whether these tests can run at all. */
export function available(): boolean {
  if (!DSN) return false;
  try {
    execFileSync('psql', ['-V'], { stdio: 'ignore' });
    return true;
  } catch {
    return false;
  }
}

export function skip(name: string): void {
  console.log(
    `${name} SKIPPED — no database. Set ANX_TEST_DATABASE_URL to a throwaway Postgres ` +
      '(CI does this with a service container) and these run.',
  );
}

/** One statement or script, through psql, failing loudly on any error. */
export function exec(sql: string): string {
  return execFileSync('psql', [DSN, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], { encoding: 'utf8' });
}

/**
 * A statement that is EXPECTED to be refused — returns true when Postgres
 * rejected it.
 *
 * Its own helper rather than a try/catch at each site, because psql writes
 * the rejection to stderr and a suite that prints six scary ERROR lines on a
 * successful run teaches whoever reads it to ignore scary lines.
 */
export function refused(sql: string): boolean {
  try {
    execFileSync('psql', [DSN, '-v', 'ON_ERROR_STOP=1', '-q', '-c', sql], { stdio: ['ignore', 'ignore', 'ignore'] });
    return false;
  } catch {
    return true;
  }
}

/** A query, as rows of plain strings. Unaligned, tuples-only, unit-separated. */
export function rows(sql: string): string[][] {
  const out = execFileSync('psql', [DSN, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-F', '\u001f', '-c', sql], { encoding: 'utf8' });
  return out
    .split('\n')
    .filter((l) => l.length > 0)
    .map((l) => l.split('\u001f'));
}

/**
 * A SCRIPT WHOSE LAST LINE IS THE ANSWER.
 *
 * `set local role authenticated` has to run in the same transaction as the
 * query it is scoping, so the two travel together in one -c — and psql prints
 * a "SET" command tag for each of them, ahead of the result. Reading the
 * FIRST line there (which is what one() does, correctly, for a plain query)
 * returns the string "SET" and every isolation assertion passes for the
 * wrong reason. This returns the last line instead, and is used only by the
 * impersonation helpers.
 */
export function lastValue(sql: string): string {
  const out = execFileSync('psql', [DSN, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql], { encoding: 'utf8' });
  const lines = out.split('\n').map((l) => l.trim()).filter((l) => l.length > 0);
  return lines[lines.length - 1] ?? '';
}

/** Like lastValue, but silent and boolean: true when Postgres refused it. */
export function refusedQuiet(sql: string): boolean {
  try {
    execFileSync('psql', [DSN, '-v', 'ON_ERROR_STOP=1', '-t', '-A', '-c', sql], { stdio: ['ignore', 'ignore', 'ignore'] });
    return false;
  } catch {
    return true;
  }
}

/** One value. */
export function one(sql: string): string {
  const r = rows(sql);
  return r[0]?.[0] ?? '';
}

/**
 * The same statement in N SEPARATE SESSIONS, started together.
 *
 * Separate processes rather than separate statements, because the whole
 * question is what two CONNECTIONS do to one row — which is invisible inside
 * a single session, where the second statement simply sees the first's work.
 */
export async function race(sql: string, lanes: number): Promise<string[]> {
  const started = Array.from({ length: lanes }, () =>
    run('psql', [DSN, '-v', 'ON_ERROR_STOP=0', '-t', '-A', '-c', sql], { encoding: 'utf8' })
      .then((r) => r.stdout.trim())
      .catch((e: { stdout?: string; stderr?: string }) => `ERROR:${(e.stderr ?? '').trim().split('\n')[0] ?? ''}`),
  );
  return Promise.all(started);
}

/**
 * THE SCHEMA, BUILT FROM THE REPOSITORY'S OWN FILES AND IN THE RIGHT ORDER.
 *
 * And that order is a finding in its own right: `social-latest.sql` is not a
 * from-scratch schema. Run into an empty database it produces three tables
 * and 180 errors, because it assumes social_queue, social_campaigns and
 * social_workers already exist. The real order is the base schema, then the
 * numbered migrations in NUMERIC order (v2 … v27 — lexical order puts v10
 * before v2 and fails), then latest.
 *
 * The only parts that do not apply are the storage-bucket policies, which
 * need Supabase's own `storage` schema; nothing here tests file uploads.
 */
export function applySchema(repoRoot: string): void {
  const dir = path.join(repoRoot, 'supabase');
  const migrations = readdirSync(dir)
    .filter((f) => /^social-schema-v\d+\.sql$/.test(f))
    .sort((a, b) => Number(/v(\d+)/.exec(a)![1]) - Number(/v(\d+)/.exec(b)![1]));
  const files = ['social-schema.sql', ...migrations, 'social-latest.sql'];

  /* Supabase's own objects, stood in for so the real policies and grants
     apply unchanged rather than being edited out of the files under test. */
  /* `-q` and a swallowed stream: every one of these is "if not exists", so a
     second run prints four NOTICEs that mean nothing and read like trouble. */
  execFileSync('psql', [DSN, '-v', 'ON_ERROR_STOP=1', '-q', '-c', `
    create schema if not exists auth;
    create schema if not exists storage;
    do $$ begin
      if not exists (select 1 from pg_roles where rolname='authenticated') then create role authenticated; end if;
      if not exists (select 1 from pg_roles where rolname='anon') then create role anon; end if;
      if not exists (select 1 from pg_roles where rolname='service_role') then create role service_role; end if;
    end $$;
    create table if not exists auth.users (id uuid primary key default gen_random_uuid(), email text);
    create or replace function auth.uid() returns uuid language sql stable as $fn$
      select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $fn$;
    create extension if not exists pgcrypto;
    grant usage on schema auth to anon, authenticated, service_role;
    grant execute on all functions in schema auth to anon, authenticated, service_role;
    grant select on auth.users to authenticated, service_role;
  `], { stdio: ['ignore', 'ignore', 'ignore'] });

  /*
   * SUPABASE'S OWN GRANTS, which the repository's files do not contain
   * because Supabase issues them itself: every table in `public` is granted
   * to anon / authenticated / service_role, and RLS is what narrows it again.
   * Without them an impersonated `authenticated` session is refused by
   * ordinary table permissions and every isolation test passes for the wrong
   * reason. Run AFTER the schema, so it covers the tables it just made.
   */
  void 0;

  for (const f of files) {
    /* ON_ERROR_STOP is OFF for the apply, and only for it: the storage
       policies in three of these files cannot apply here, and refusing to
       build the schema over them would mean testing a copy rather than the
       real thing. The tables the suite needs are checked by name afterwards. */
    execFileSync('psql', [DSN, '-q', '-f', path.join(dir, f)], { stdio: ['ignore', 'ignore', 'ignore'] });
  }

  grantLikeSupabase();
}

/**
 * A CLEAN SLATE — AND THE GUARD THAT MAKES IT SAFE TO HAVE ONE.
 *
 * These tests need an empty database to be repeatable, and emptying one is
 * the most destructive thing in this repository. So it is refused unless the
 * DSN is unmistakably a throwaway: the database NAME must contain "test",
 * "tmp" or "ci", and the host may not be a Supabase one. A finger slip that
 * puts the production URL in ANX_TEST_DATABASE_URL stops here rather than
 * three statements later.
 */
export function resetSchema(): void {
  const dbName = (/\/([^/?]+)(\?|$)/.exec(DSN)?.[1] ?? '').toLowerCase();
  if (!/test|tmp|ci/.test(dbName)) {
    throw new Error(
      `ANX_TEST_DATABASE_URL points at a database called "${dbName}". These tests DROP every table, ` +
        'so they only run against a database whose name contains test, tmp or ci.',
    );
  }
  if (/supabase\.(co|in)/i.test(DSN)) throw new Error('ANX_TEST_DATABASE_URL points at Supabase. These tests drop tables and will not run there.');
  execFileSync(
    'psql',
    [DSN, '-v', 'ON_ERROR_STOP=1', '-q', '-c', 'drop schema if exists public cascade; create schema public; drop schema if exists auth cascade; drop schema if exists storage cascade;'],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  );
}

/** See the note in applySchema: Supabase issues these, the repo's files do not. */
export function grantLikeSupabase(): void {
  execFileSync(
    'psql',
    [DSN, '-v', 'ON_ERROR_STOP=1', '-q', '-c',
      `grant usage on schema public to anon, authenticated, service_role;
       grant all on all tables in schema public to anon, authenticated, service_role;
       grant all on all sequences in schema public to anon, authenticated, service_role;
       grant execute on all functions in schema public to anon, authenticated, service_role;`],
    { stdio: ['ignore', 'ignore', 'ignore'] },
  );
}

/** Re-run one of the repository's SQL files — used after a backfill, to let a guarded block fire. */
export function applyFile(repoRoot: string, name: string): void {
  execFileSync('psql', [DSN, '-q', '-f', path.join(repoRoot, 'supabase', name)], { stdio: ['ignore', 'ignore', 'ignore'] });
}

/** Table names the schema is expected to have produced — the apply's own check. */
export const CORE_TABLES = [
  'social_campaigns',
  'social_posts',
  'social_queue',
  'social_schedules',
  'social_targets',
  'social_settings',
  'social_activity_log',
  'social_workers',
];
