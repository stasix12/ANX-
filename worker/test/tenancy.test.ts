/*
 * WHO CAN SEE WHAT, PINNED.
 *
 * Until v16 every table in this database carried the same rule — `to
 * authenticated using (true)`, "anyone who can sign in may read and write
 * every row" — forty-four times over. v16 replaced all of them with a rule
 * that filters by business, v17 widened four uniqueness rules that assumed one
 * business, and v18 shut the leads, the CRM and the shop to everyone but the
 * owner of this installation.
 *
 * That is the kind of change that is correct the day it is written and quietly
 * wrong three commits later: a new table without a policy, a `using (true)`
 * copied from an older file, a fifth uniqueness rule nobody widened, a table
 * added to v15 and forgotten in v16. None of those fail a build and none of
 * them show up on a screen. They show up as one customer reading another
 * customer's data.
 *
 * So this file reads the SQL and holds it to what it claims.
 *
 * IT IS NOT THE PROOF THAT THE RULES WORK. That was done by applying every one
 * of these files to a real Postgres with two businesses in it and checking, as
 * each of them in turn, what could be read, written, updated and deleted. This
 * file is the thing that notices when the files stop saying what they said on
 * the day that was done.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { isConflictTargetMismatch, upsertScoped } from '../../src/lib/social/tenant';

let checks = 0;
const is = (cond: unknown, msg: string) => { checks += 1; assert.ok(cond, msg); };

const read = (name: string) => readFileSync(new URL(`../../supabase/${name}`, import.meta.url), 'utf8');
const v15 = read('social-schema-v15.sql');
const v16 = read('social-schema-v16.sql');
const v17 = read('social-schema-v17.sql');
const v18 = read('social-schema-v18.sql');
const v19 = read('social-schema-v19.sql');
/* Not a tenancy change — but social-latest.sql is the one file the owner runs,
   so anything they must run has to be in it, and has to be checked as in it. */
const v20 = read('social-schema-v20.sql');
const backfill = read('social-tenant-backfill.sql');
const latest = read('social-latest.sql');
const runThis = read('RUN-THIS-IN-SUPABASE.sql');

/* ----------------------------------------------------------------------- */
/* 1. The same tables, everywhere.                                          */
/*                                                                          */
/* v15 adds the column, the backfill fills it, v16 locks it down. A table in */
/* any one of those three lists and missing from another is either a table   */
/* nobody can see or a table everybody can — and both are silent.            */
/* ----------------------------------------------------------------------- */
const columnTables = [...v15.matchAll(/alter table public\.(social_\w+) add column if not exists tenant_id/g)]
  .map((m) => m[1]).sort();
const backfilled = [...backfill.matchAll(/update public\.(social_\w+)\s+set tenant_id = t\b/g)]
  .map((m) => m[1])
  .concat([...backfill.matchAll(/update public\.(social_\w+) set tenant_id = %L/g)].map((m) => m[1]))
  .sort();
const lockedList = v16.slice(v16.indexOf('tables text[] := array['), v16.indexOf('];', v16.indexOf('tables text[] := array[')));
const locked = [...lockedList.matchAll(/'(social_\w+)'/g)].map((m) => m[1])
  .concat([...v16.matchAll(/tables := tables \|\| array\['(social_\w+)'\]/g)].map((m) => m[1]))
  .sort();

is(columnTables.length >= 12, `v15 must give the column to every table that holds a business's data (found ${columnTables.length})`);
assert.deepEqual(backfilled, columnTables, 'every table that GETS tenant_id in v15 must be filled by the backfill');
checks += 1;
assert.deepEqual(locked, columnTables, 'and every one of them must be in v16’s list, or it is a table with no rule at all');
checks += 1;

/* ----------------------------------------------------------------------- */
/* 2. Nothing in the new files says `using (true)`.                          */
/* ----------------------------------------------------------------------- */
for (const [name, sql] of [['v16', v16], ['v17', v17], ['v18', v18], ['v19', v19]] as const) {
  const open = sql
    .split('\n')
    .filter((l) => !l.trim().startsWith('--') && !l.trim().startsWith('*') && !l.trim().startsWith('/*'))
    .filter((l) => /using \(true\)|with check \(true\)/.test(l));
  assert.deepEqual(open, [], `${name} must not create a policy that shows every row to everyone`);
  checks += 1;
}

/* Each of the four verbs, on every table, reads the business. */
for (const verb of ['select', 'insert', 'update', 'delete']) {
  is(
    new RegExp(`create policy "admin ${verb}" on public\\.%1\\$I for ${verb} to authenticated`).test(v16),
    `v16 must replace the "admin ${verb}" policy rather than leave the old one in place`,
  );
}
is(
  (v16.match(/tenant_id in \(select unnest\(public\.social_tenant_ids\(\)\)\)/g) ?? []).length === 5,
  'all five halves of the four policies must filter by business — select, insert\u2019s check, update\u2019s two, delete',
);
/* The same NAMES as the old permissive policies, on purpose: Postgres OR-s
   permissive policies together, so a rule added under a new name would sit
   beside `using (true)` rather than replace it. */
is(!/create policy "tenant /.test(v16), 'the new policies must reuse the old names so there is one rule per table per verb');

/* ----------------------------------------------------------------------- */
/* 3. It refuses to run when running would lock the owner out.               */
/* ----------------------------------------------------------------------- */
is(/if tenants = 0 then[\s\S]{0,400}?return;/.test(v16), 'v16 must skip itself when there is no business to belong to');
is(
  /if not exists \(select 1 from public\.social_tenant_members\) then[\s\S]{0,400}?return;/.test(v16),
  'v16 must skip itself when nobody is a member of anything — a locked door with no key cut',
);
is(/if orphans > 0 then[\s\S]{0,400}?return;/.test(v16), 'v16 must skip itself while any row still has no business');
is(/raise notice/.test(v16) && /backfill/.test(v16), 'and each refusal must name the file that fixes it');
is(/if not coalesce\(required, false\) then[\s\S]{0,300}?return;/.test(v17), 'v17 must skip itself until tenant_id is required');
is(/if not owner_exists then[\s\S]{0,300}?return;/.test(v18), 'v18 must skip itself until a business is marked as the owner’s');

/* ----------------------------------------------------------------------- */
/* 4. Every step can be undone, and the undo is honest about what it costs.  */
/* ----------------------------------------------------------------------- */
for (const v of [16, 17, 18]) {
  const back = read(`social-schema-v${v}-rollback.sql`);
  is(/using \(true\)|drop index|add primary key/.test(back), `v${v} must have a rollback that actually puts something back`);
  is(!/\bdelete from\b|\bdrop table\b|\btruncate\b/i.test(back), `and the v${v} rollback must not delete a single row`);
  is(new RegExp(`social-schema-v${v}-rollback\\.sql`).test(v === 16 ? v16 : v === 17 ? v17 : v18), `v${v} must say where its undo lives`);
}
const back17 = read('social-schema-v17-rollback.sql');
is(
  /if tenants > 1 then[\s\S]{0,300}?return;/.test(back17),
  'narrowing the uniqueness rules back with two businesses in the database is unsatisfiable, so the rollback must refuse rather than fail halfway',
);

/* ----------------------------------------------------------------------- */
/* 5. The old setup files can no longer re-open the database.                */
/*                                                                          */
/* social-schema.sql and v2 create the permissive policies; crm-schema.sql   */
/* and schema.sql create theirs. Each is "run once" — and each has in fact   */
/* been re-run, which is how the guards came to exist.                       */
/* ----------------------------------------------------------------------- */
for (const [file, sentinel] of [
  ['social-schema.sql', 'social_tenant_members'],
  ['social-schema-v2.sql', 'social_tenant_members'],
  ['crm-schema.sql', 'social_is_app_owner'],
  ['schema.sql', 'social_is_app_owner'],
] as const) {
  const sql = read(file);
  is(
    sql.includes(`to_regclass('public.${sentinel}') is not null`) ||
      sql.includes(`to_regprocedure('public.${sentinel}()') is not null`),
    `${file} must refuse to re-create its open policies on a database that has already been locked down`,
  );
  is(
    (sql.match(/raise notice '[^']*בכוונה/g) ?? []).length > 0,
    `and ${file} must say out loud that it skipped them on purpose`,
  );
}
/* The narrow unique index on groups is the other thing a re-run would break:
   after v17 two businesses legitimately share a group, so re-creating it fails
   — and in Supabase's editor one run is one transaction. */
is(
  /social_targets_tenant_channel_external_idx'\) is null/.test(read('social-schema.sql')),
  'social-schema.sql must not try to re-create the whole-database group index once the per-business one exists',
);

/* ----------------------------------------------------------------------- */
/* 6. The settings seeds name a conflict target that exists.                 */
/*                                                                          */
/* v17 widens social_settings' key from (key) to (tenant_id, key). An insert  */
/* that still says `on conflict (key)` fails with 42P10 and takes the whole   */
/* run with it.                                                              */
/* ----------------------------------------------------------------------- */
for (const file of ['social-schema.sql', 'social-schema-v2.sql']) {
  const sql = read(file);
  is(!/on conflict \(key\) do nothing;/.test(sql), `${file} must not hard-code the old settings key`);
  is(/target := '\(tenant_id, key\)'/.test(sql), `${file} must choose the conflict target from what the database actually has`);
  is(/cross join \(values/.test(sql), `${file} must seed the defaults for every business, not only the first`);
}

/* ----------------------------------------------------------------------- */
/* 7. The app survives a database that has not run the SQL yet.              */
/*                                                                          */
/* The owner pastes the SQL by hand, the site deploys on a commit, the worker */
/* updates when the PC restarts. Any order is possible, and "site first" is   */
/* the one that used to break things.                                        */
/* ----------------------------------------------------------------------- */
const tenant = readFileSync(new URL('../../src/lib/social/tenant.ts', import.meta.url), 'utf8');
is(/42P10/.test(tenant), 'the fallback must trigger on "no unique index covers those columns" — v15 run, v17 not');
is(/42703/.test(tenant), 'and on "that column does not exist" — a database that has not run v15 either');
is(
  /error\.code === '42703'\) return MISSING_TENANT_COLUMN\.test\(message\);/.test(tenant),
  'but only when the missing column is tenant_id — 42703 is Postgres\u2019s code for any unknown column, and retrying a real one replaces its error with a misleading 42P10',
);
is(/ON CONFLICT specification/i.test(tenant), 'and on the messages too, because PostgREST has not always passed the code through');
is(
  /if \(!isConflictTargetMismatch\(first\.error\)\) return first;/.test(tenant),
  'every other error must come back untouched — an upsert that quietly retries a real failure is worse than one that fails',
);

const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
const worker = readFileSync(new URL('../../worker/social-worker.ts', import.meta.url), 'utf8');
for (const [src, scoped, legacy, what] of [
  [client, 'tenant_id,key', 'key', 'a setting'],
  [worker, 'tenant_id,name', 'name', 'the worker’s own row'],
  [worker, 'tenant_id,provider,provider_user_id', 'provider,provider_user_id', 'the connected Facebook account'],
] as const) {
  is(
    new RegExp(`'${scoped}',\\s*\\n\\s*'${legacy}',`).test(src),
    `saving ${what} must try the per-business key first and fall back to the old one`,
  );
}
is(!/onConflict: 'key'/.test(client), 'no upsert may name the old settings key on its own');
/*
 * And the SERVER's settings writer, which is the one that was missed on the
 * first pass. It is not spare parts: runWorker() writes the run lock through
 * it before any work starts, and runWorker() is the whole body of
 * /api/social/run — what "\u05e4\u05e8\u05e1\u05dd \u05e2\u05db\u05e9\u05d9\u05d5" hits. Naming the old key there meant
 * every publish answering 500 the moment the migration ran.
 */
const serverDb = readFileSync(new URL('../../src/lib/social/server/db.ts', import.meta.url), 'utf8');
is(!/onConflict: 'key'/.test(serverDb), 'the server\u2019s settings writer must not name the old key either');
is(/'tenant_id,key',\s*\n\s*'key',/.test(serverDb), 'it must try the per-business key first, exactly like the dashboard\u2019s');
is(!/NOTHING CALLS IT/.test(serverDb), 'and it must not claim to be dead code — runWorker calls it nine times');

/*
 * The server route bypasses row-level security by design, so until it learns
 * whose request it is serving it must refuse rather than act on a business
 * picked by accident.
 */
const serverWorker = readFileSync(new URL('../../src/lib/social/server/worker.ts', import.meta.url), 'utf8');
is(/moreThanOneBusiness/.test(serverWorker), 'the service-role route must notice when there is more than one business');
is(
  /if \(await moreThanOneBusiness\(db\)\) \{[\s\S]{0,500}?return report;/.test(serverWorker),
  'and stop before doing anything, rather than sweeping another business\u2019s queue rows',
);
is(/if \(error\) return false;/.test(serverWorker), 'a database with no businesses table at all is the old world and passes through');

/* And the worker must say what actually went wrong when it cannot register. */
is(
  /registration\.error\?\.message/.test(worker),
  'a worker that fails to register stops every publication, so the database\u2019s own reason must reach the screen, not only a guess about v2',
);
is(!/onConflict: 'name'/.test(worker) && !/onConflict: 'provider,provider_user_id'/.test(worker),
   'and neither may the worker');

/* ----------------------------------------------------------------------- */
/* 8. One file to run, and it contains all of it.                            */
/* ----------------------------------------------------------------------- */
const strip = (sql: string) => sql.split('\n').filter((l) => !l.trim().startsWith('--') && l.trim()).join('\n');
for (const [name, sql] of [['v16', v16], ['v17', v17], ['v18', v18], ['v19', v19], ['v20', v20]] as const) {
  for (const statement of strip(sql).split(';').map((x) => x.trim()).filter((x) => x.length > 20)) {
    is(strip(latest).includes(statement), `social-latest.sql is missing a statement from ${name}: ${statement.slice(0, 60)}…`);
  }
}
/* RUN-THIS is the paste the owner actually makes, and the order is the whole
   safety argument: the column, then the filling-in, then the rules. */
const order = ['## 1 ##', '## 2 ##', '## 3 ##', '## 4 ##', '## 5 ##', '## 6 ##'].map((m) => runThis.indexOf(m));
is(order.every((i) => i > 0), 'the one-paste file must carry all six parts');
is(order.every((i, n) => n === 0 || i > order[n - 1]), 'and in an order where nothing is locked down before it is filled in');
/* And it must carry what those parts actually say. RUN-THIS is generated from
   the five files; editing one of them and forgetting to regenerate would hand
   the owner a paste that is quietly a version behind, which is the exact
   failure the "one file to run" rule exists to prevent. */
for (const [name, sql] of [['v15', v15], ['the backfill', backfill], ['v16', v16], ['v17', v17], ['v18', v18], ['v19', v19]] as const) {
  for (const statement of strip(sql).split(';').map((x) => x.trim()).filter((x) => x.length > 20)) {
    is(strip(runThis).includes(statement), `RUN-THIS-IN-SUPABASE.sql is behind ${name}: ${statement.slice(0, 60)}\u2026`);
  }
}

/* ----------------------------------------------------------------------- */
/* 9. The fallback, actually run — not only read.                            */
/*                                                                           */
/* The error codes below are the ones a real Postgres produced: 42P10 from a  */
/* database that has tenant_id but no index over it, 42703 from one that has  */
/* never had the column. Both were reproduced before this test was written.   */
/* ----------------------------------------------------------------------- */
async function fallbackTests() {
  const calls: string[] = [];
  const failing = (code: string, message: string) => async (onConflict: string) => {
    calls.push(onConflict);
    return onConflict.startsWith('tenant_id')
      ? { data: null, error: { code, message } }
      : { data: { id: 'x' }, error: null };
  };

  for (const [code, message] of [
    ['42P10', 'there is no unique or exclusion constraint matching the ON CONFLICT specification'],
    ['42703', 'column "tenant_id" does not exist'],
  ] as const) {
    calls.length = 0;
    const out = await upsertScoped(failing(code, message), 'tenant_id,key', 'key');
    assert.deepEqual(calls, ['tenant_id,key', 'key'], `${code} must send it back to the old key`);
    assert.equal(out.error, null, 'and the second attempt is the one that counts');
    assert.deepEqual(out.data, { id: 'x' }, 'with its data, not the failed attempt\u2019s');
    checks += 3;
  }

  /* A database that HAS run v17: one call, no second round trip. */
  calls.length = 0;
  const ok = await upsertScoped(async (onConflict) => { calls.push(onConflict); return { data: { id: 'y' }, error: null }; }, 'tenant_id,key', 'key');
  assert.deepEqual(calls, ['tenant_id,key'], 'once the database is migrated there must be no wasted second call');
  assert.equal(ok.error, null);
  checks += 2;

  /* Every other failure comes straight back. A row that violates row-level
     security, or a duplicate key, must NOT be retried against the old target —
     that would turn one clear error into two confusing ones. */
  for (const err of [
    { code: '42501', message: 'new row violates row-level security policy' },
    { code: '23505', message: 'duplicate key value violates unique constraint' },
    { code: '23502', message: 'null value in column "tenant_id" violates not-null constraint' },
    { code: 'PGRST301', message: 'JWT expired' },
    /* 42703 about some OTHER column: a database behind on v9, not on v15. */
    { code: '42703', message: 'column social_workers.fb_user_id does not exist' },
  ]) {
    calls.length = 0;
    const out = await upsertScoped(async (onConflict) => { calls.push(onConflict); return { data: null, error: err }; }, 'tenant_id,key', 'key');
    assert.deepEqual(calls, ['tenant_id,key'], `${err.code} must not be retried`);
    assert.equal(out.error, err, 'and must come back exactly as it arrived');
    checks += 2;
  }

  assert.equal(isConflictTargetMismatch(null), false, 'a success is never a mismatch');
  assert.equal(isConflictTargetMismatch({ message: 'there is no unique or exclusion constraint matching the ON CONFLICT specification' }), true,
    'and the message alone is enough, for a PostgREST that did not pass the code through');
  checks += 2;
}

fallbackTests().then(() => {
    /* ----------------------------------------------------------------------- */
/* N. THE REPAIR, and the line in the backfill it exists to not run.         */
/*                                                                           */
/* social-tenant-backfill.sql makes EVERY auth.users row a member of the one */
/* business. On the day it was written that was the faithful migration: the  */
/* rule in force was `using (true)`, so everyone already saw everything and  */
/* nobody gained anything. It stops being faithful the moment a person who   */
/* is not the owner has an account — and on this installation one already    */
/* does, opened through the signup page, which is how the leak was found.    */
/*                                                                           */
/* social-tenant-repair.sql does the same job with the owner NAMED. These    */
/* assertions are what keeps it from drifting back into guessing.            */
/* ----------------------------------------------------------------------- */
{
  const repair = read('social-tenant-repair.sql');

  is(
    /owner_email text := /.test(repair),
    'the repair takes the owner by email — the one fact no heuristic can get right, and the one the person running it certainly knows',
  );
  is(
    /if me is null then[\s\S]{0,400}raise exception/.test(repair),
    'an email with no account STOPS it: a typo must not become a decision about who owns the database',
  );
  /* It DOES read auth.users — once, by email, to answer "who is the owner".
     What it must never do is write the result of a scan of that table into the
     membership table, which is the backfill's `select t, u.id from auth.users`
     and the single line that would have made the test account a co-owner. So
     the assertion is about the INSERT, not about the table. */
  is(
    [...repair.matchAll(/insert into public\.social_tenant_members[^;]*/g)]
      .every((m) => /\bvalues\b/.test(m[0]) && !/\bselect\b/.test(m[0])),
    'every membership it writes is a named pair, never the result of a scan of auth.users — that scan is the backfill line that would have written the test account into the owner’s business',
  );
  is(
    /select t, u\.id from auth\.users u/.test(backfill),
    'and the backfill still has that line, so this assertion is guarding something real rather than a line that quietly moved',
  );
  is(
    !/\bdelete from\b/.test(repair.replace(/--[^\n]*/g, '')),
    'and it deletes nothing — including the people it finds already attached, which it reports instead, because removing somebody’s access is a person’s decision',
  );
  is(
    /social_tenant_members/.test(repair) &&
      /not in \('social_tenants', 'social_tenant_members'\)/.test(repair),
    'social_tenant_members carries a tenant_id that means "which business this PERSON belongs to", not "which business owns this row" — stamping it would rewrite the membership table',
  );
  is(
    /raise exception[\s\S]{0,200}social-schema-v15/.test(repair),
    'it refuses to run before v15 rather than half-running: no tenant table means nothing to fill in',
  );

  /* The failure this whole file is recovering from was silent. v16 prints a
     NOTICE and returns, and a NOTICE on a phone is invisible — so the repair
     ends in a SELECT, which the SQL editor cannot help but render. */
  is(
    /select[\s\S]{0,600}as "מצב"/.test(repair) && repair.trimEnd().endsWith(';'),
    'it ends in a table, not a notice — the whole incident began with a NOTICE that said "the rules were not replaced, on purpose" and was never read',
  );
  is(
    /query_to_xml/.test(repair),
    'and the report counts whatever tables the database actually has, rather than a list written months before the table that was missed',
  );

  /* Discovery, not a list: the live database had thirteen tables carrying the
     open rule where every file in this repo accounts for twelve. */
  is(
    /qual = 'true' or p?\.?with_check = 'true'/.test(repair),
    'it finds the tables to fix by asking which ones are still open, so a table nobody remembered is repaired rather than skipped',
  );
  is(
    /add column tenant_id uuid/.test(repair),
    'and an open table with no tenant_id gets one — otherwise it is a table that stays readable by everybody after the repair "succeeded"',
  );

  is(
    /social-tenant-repair\.sql/.test(backfill),
    'the backfill points at the repair, so the next person to find it does not run the version that was correct a month ago',
  );
}

/* ----------------------------------------------------------------------- */
/* N+1. THE TABLE NO FILE KNEW ABOUT.                                        */
/*                                                                           */
/* v16 locks the tables named in a list inside v16. The list is right about   */
/* every table somebody wrote down, and it cannot be right about one that     */
/* exists only in the database. The live database had exactly that:           */
/* social_discovered_groups, mentioned in no migration, no query and no       */
/* component — grep the whole repository and the name appears only in the     */
/* file that closes it and the assertions here. After social-latest.sql ran,  */
/* 48 of 52 open rules were gone and 4 remained, all of them on that table.   */
/* ----------------------------------------------------------------------- */
{
  const strays = read('social-tenant-lock-strays.sql');

  is(
    /from pg_policies p[\s\S]{0,400}qual = 'true' or p\.with_check = 'true'/.test(strays),
    'it finds its work by asking the database which tables are still open, which is the only way to reach a table no file lists',
  );
  is(
    /"admin select"[\s\S]{0,200}social_tenant_ids/.test(strays) &&
      (strays.match(/drop policy if exists "admin (select|insert|update|delete)"/g) ?? []).length === 4,
    'it reuses v16’s four policy NAMES — Postgres OR-s permissive policies, so a rule added under a new name sits beside the open one and the open one wins',
  );
  is(
    /alter column tenant_id set not null/.test(strays) && /social_stamp_tenant/.test(strays),
    'and it stamps and requires the column, so the next row written to a stray table cannot arrive without an owner',
  );

  /* The two refusals. Both would otherwise turn a lockdown into data loss that
     looks exactly like data loss: rows nobody, including their owner, can see. */
  is(
    /where tenant_id is null'[\s\S]{0,300}דילוג/.test(strays),
    'a table with unassigned rows is SKIPPED, not locked — a null tenant_id under a tenant-scoped rule is a row its own owner cannot read',
  );
  is(
    /column_name = 'tenant_id'\)\s*\n\s*then\s*\n\s*raise notice 'דילוג/.test(strays),
    'and a table with no tenant_id at all is reported rather than improvised on — adding the column belongs to the repair file',
  );
  is(
    /to_regprocedure\('public\.social_tenant_ids\(\)'\) is null/.test(strays),
    'it refuses to run before v16 — policies referencing a function that does not exist are policies that fail open at the worst moment',
  );
  is(
    !/\bdrop table\b|\bdelete from\b/.test(strays.replace(/--[^\n]*/g, '')),
    'and it drops nothing: an unused table keeps its rows, and whether it should exist at all is a decision for a person on a calmer day',
  );
  is(
    !/social_tenants', 'social_tenant_members/.test(strays) ||
      /not in \('social_tenants', 'social_tenant_members'\)/.test(strays),
    'the membership tables are left alone — their rules are about who you are, not about who owns the row',
  );
  is(
    /select[\s\S]{0,800}as "טבלאות פתוחות"/.test(strays),
    'it ends by naming whatever is still open, so "I ran it" and "it took" cannot be confused again',
  );
}

/* ----------------------------------------------------------------------- */
/* N+2. THE FILES. v16 scoped tables, and storage is not a table.            */
/*                                                                           */
/* Both buckets kept the rules they were born with. social-debug's read was  */
/* `bucket_id = 'social-debug'` — any signed-in person may read every object */
/* in a bucket that holds SCREENSHOTS OF A LOGGED-IN FACEBOOK SESSION, with  */
/* no path to guess because the API will list them. 428 of them on the live  */
/* database. It was the most sensitive store in the system and the least     */
/* protected.                                                                */
/* ----------------------------------------------------------------------- */
{
  const storage = read('social-storage-tenancy.sql');

  /* A storage object has no tenant_id — it has the session that uploaded it.
     So the question the policies ask is one step out from the tables'. */
  is(
    /create or replace function public\.social_tenant_user_ids\(\)[\s\S]{0,400}security definer/.test(storage),
    'the storage rules are built on a SECURITY DEFINER helper, for the same reason social_tenant_ids() is one: a policy on storage.objects must read the membership table without that table’s own rule getting in the way',
  );
  is(
    /revoke execute on function public\.social_tenant_user_ids\(\) from public/.test(storage),
    'and it is revoked from public — Postgres grants EXECUTE to PUBLIC by default, which on Supabase means PostgREST exposes it',
  );

  /* Every verb that can READ or REACH another business's object is scoped.
     Insert is not, and that is argued rather than overlooked: Storage sets
     `owner` to the uploading session, so an insert can only make an object the
     uploader already owns. */
  for (const policy of ['social debug admin read', 'social debug admin delete', 'social debug admin update']) {
    const block = storage.slice(storage.indexOf(`create policy "${policy}"`));
    is(
      /social_tenant_user_ids/.test(block.slice(0, 400)),
      `"${policy}" filters by who shares a business with the caller — screenshots of a live Facebook session are the last thing that should be bucket-wide`,
    );
  }
  is(
    /create policy "social debug admin update"/.test(storage),
    'and the update rule v2 never wrote is added rather than left as the next silent failure — Storage’s upsert becomes an UPDATE the moment the path exists',
  );
  for (const policy of ['social media admin update', 'social media admin delete']) {
    const block = storage.slice(storage.indexOf(`create policy "${policy}"`));
    is(
      /social_tenant_user_ids/.test(block.slice(0, 400)),
      `"${policy}" is scoped too — one business overwriting another’s post images is not a leak, it is worse`,
    );
  }

  /* The one thing this file deliberately leaves open, stated where somebody
     will read it rather than discovered later by whoever inherits this. */
  is(
    !/create policy "social media public read"/.test(storage) &&
      /READ STAYS PUBLIC/.test(storage) &&
      /READABLE BY ANYONE/.test(storage),
    'it does NOT touch the public read on social-media, and says in capitals why: the stored URLs are public ones, the worker fetches images by them, and closing it means signed URLs everywhere an image renders',
  );
  is(
    /same policy NAMES|same policy names/i.test(storage) ||
      (storage.match(/drop policy if exists "social (debug|media)/g) ?? []).length >= 5,
    'and it drops each rule by its existing name before recreating it — a new name would sit BESIDE the open rule, and Postgres OR-s permissive policies together',
  );
}

console.log(`tenancy tests OK — ${checks} assertions, ${columnTables.length} tables walked`);
}).catch((e) => {
  /* An assertion inside a promise must still fail the run, loudly. */
  console.error(e);
  process.exit(1);
});
