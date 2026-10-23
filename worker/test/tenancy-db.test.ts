/**
 * TWO BUSINESSES, ONE DATABASE — PROVEN, NOT ASSERTED.
 *
 * "קיימת הפרדה תקינה בין משתמשים" is a condition the owner put on calling
 * this system finished, and until now the only thing standing behind it was
 * worker/test/tenancy.test.ts, which reads the .sql file as TEXT and checks
 * that the words "tenant_id in (select unnest(..." appear in it. That proves
 * the policy was WRITTEN. It cannot prove Postgres enforces it, that the
 * policy actually replaced the permissive one it is named after, that the
 * INSERT path is covered, or that a logged-in session cannot simply write
 * somebody else's tenant_id into a row.
 *
 * So this file runs the real files into a real server, signs in as two
 * different people, and tries to cross the line.
 *
 * AND IT FOUND SOMETHING ON THE WAY IN. social-latest.sql replaces the
 * permissive `using (true)` policies only when three conditions hold: at
 * least one business exists, at least one person belongs to one, and no row
 * in any of the eleven tables is left without a business. Until then every
 * table is WIDE OPEN to any signed-in user, deliberately and with a notice
 * explaining why. That is a reasonable migration stance and a dangerous
 * resting state, so the first thing below asserts the before-and-after.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applyFile, applySchema, available, exec, lastValue, one, refusedQuiet, resetSchema, rows, skip } from './db/harness';

const NAME = 'tenancy (real postgres)';

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

/** One statement as a signed-in user, the way PostgREST runs it. */
function asUser(userId: string, sql: string): string {
  return lastValue(`
    set local role authenticated;
    set local "request.jwt.claim.sub" = '${userId}';
    ${sql}
  `);
}

/** True when the statement was refused for that user. */
function refusedAs(userId: string, sql: string): boolean {
  return refusedQuiet(`
    set local role authenticated;
    set local "request.jwt.claim.sub" = '${userId}';
    ${sql}
  `);
}

async function main(): Promise<void> {
  resetSchema();
  applySchema(repoRoot);

  const A = { user: 'aaaaaaaa-0000-4000-8000-000000000001', tenant: 'aaaaaaaa-1111-4000-8000-000000000001' };
  const B = { user: 'bbbbbbbb-0000-4000-8000-000000000002', tenant: 'bbbbbbbb-1111-4000-8000-000000000002' };

  /* ---- 1. THE OPEN STATE, which is where a fresh database rests ---- */
  {
    const permissive = one(`select count(*) from pg_policies where schemaname='public' and tablename='social_queue' and qual='true'`);
    is(
      Number(permissive) > 0,
      'a database with no business already has tenant-scoped policies — the guard in social-latest.sql changed, and this test is now measuring the wrong thing',
    );
  }

  /* ---- 2. two businesses, two people, and the lockdown re-run ---- */
  exec(`
    insert into auth.users (id, email) values ('${A.user}', 'a@example.com'), ('${B.user}', 'b@example.com');
    insert into social_tenants (id, name) values ('${A.tenant}', 'עסק א'), ('${B.tenant}', 'עסק ב');
    insert into social_tenant_members (tenant_id, user_id)
      values ('${A.tenant}', '${A.user}'), ('${B.tenant}', '${B.user}');
  `);

  /* One campaign, one post, one target and one queue row for each business. */
  for (const t of [A, B]) {
    exec(`
      insert into social_campaigns (id, name, tenant_id) values (gen_random_uuid(), 'סבב ${t.tenant.slice(0, 4)}', '${t.tenant}');
      insert into social_targets (id, channel, external_id, name, tenant_id)
        values (gen_random_uuid(), 'facebook_group', 'g-${t.tenant.slice(0, 4)}', 'קבוצה', '${t.tenant}');
    `);
    exec(`
      insert into social_posts (id, title, base_text, tenant_id, campaign_id)
        select gen_random_uuid(), 'פוסט', 'טקסט', '${t.tenant}', c.id from social_campaigns c where c.tenant_id='${t.tenant}' limit 1;
    `);
    exec(`
      insert into social_queue (id, post_id, target_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text, tenant_id)
        select gen_random_uuid(), p.id, g.id, p.campaign_id, now() + interval '1 hour', 'scheduled', gen_random_uuid()::text, 'טקסט', '${t.tenant}'
          from social_posts p, social_targets g
         where p.tenant_id='${t.tenant}' and g.tenant_id='${t.tenant}' limit 1;
    `);
  }

  /*
   * ─── AND HERE IS THE STEP NOBODY CAN TAKE ──────────────────────────────
   *
   * Re-running the file is what the notice tells an operator to do. It is not
   * enough, and this is the finding:
   *
   *   • social-latest.sql replaces the permissive policies only when NO row
   *     in any of the eleven tables is missing a tenant_id.
   *   • social-schema.sql seeds four rows into social_settings — limits,
   *     control, business, browser — with no tenant_id.
   *   • social-tenant-backfill.sql, the file the notice names, REFUSES to run
   *     once more than one business exists: "יש כבר יותר מעסק אחד — המילוי לא
   *     רץ, בכוונה."
   *
   * So the moment there are two businesses, the shipped path to locking the
   * database down is closed, and every table stays readable and writable by
   * any signed-in user. The assertion below states that, so the day somebody
   * fixes it this test fails and gets rewritten rather than quietly passing.
   */
  applyFile(repoRoot, 'social-tenant-backfill.sql');
  applyFile(repoRoot, 'social-latest.sql');
  {
    const orphans = one(`select count(*) from social_settings where tenant_id is null`);
    is(orphans === '4', `the shipped settings rows are no longer orphans (${orphans}) — the trap below may be fixed`);
    const stillOpen = one(`select count(*) from pg_policies where schemaname='public' and tablename='social_queue' and qual='true'`);
    is(
      Number(stillOpen) > 0,
      'the lockdown now fires with orphan settings rows present — good, and this test must be rewritten to match',
    );
  }

  /*
   * What an operator has to do BY HAND to get there, and what this test does
   * next so the rest of it can measure the locked-down state at all.
   */
  exec(`update social_settings set tenant_id = '${A.tenant}' where tenant_id is null`);
  applyFile(repoRoot, 'social-latest.sql');

  const scoped = rows(`
    select tablename from pg_policies
     where schemaname='public' and policyname='admin select' and qual like '%social_tenant_ids%'
     order by tablename`).map((r) => r[0]);
  for (const t of ['social_campaigns', 'social_posts', 'social_queue', 'social_targets', 'social_settings', 'social_activity_log']) {
    is(scoped.includes(t), `${t} is still open to every signed-in user after the backfill`);
  }

  /* ---- 3. WHAT EACH PERSON CAN SEE ---- */
  for (const [me, other] of [[A, B], [B, A]] as const) {
    for (const table of ['social_campaigns', 'social_posts', 'social_queue', 'social_targets']) {
      const mine = asUser(me.user, `select count(*) from ${table} where tenant_id='${me.tenant}'`);
      const theirs = asUser(me.user, `select count(*) from ${table} where tenant_id='${other.tenant}'`);
      is(Number(mine) >= 1, `a user cannot see their OWN ${table} rows — the policy is too tight`);
      is(theirs === '0', `CROSS-TENANT READ: a user can see ${Number(theirs)} of another business's ${table} rows`);
    }
    /* And the unfiltered read, which is what a screen actually issues. */
    const all = asUser(me.user, `select count(*) from social_queue`);
    is(all === '1', `an unfiltered queue read returned ${all} rows — it must return only this business's one`);
  }

  /* ---- 4. WHAT EACH PERSON CAN WRITE ---- */
  {
    /* The update that matters: moving somebody else's publication. */
    const moved = asUser(A.user, `
      with x as (update social_queue set scheduled_at = now() where tenant_id='${B.tenant}' returning 1)
      select count(*) from x`);
    is(moved === '0', 'CROSS-TENANT WRITE: one business rescheduled another business’s publications');

    const deleted = asUser(A.user, `
      with x as (delete from social_queue where tenant_id='${B.tenant}' returning 1)
      select count(*) from x`);
    is(deleted === '0', 'CROSS-TENANT DELETE: one business deleted another business’s publications');

    /* And the insert, which the read policies do not cover: writing a row
       stamped with somebody else's business. "אסור לסמוך על ID שנשלח
       מה-Frontend בלבד" — this is that rule, at the database. */
    const planted = refusedAs(A.user, `
      insert into social_campaigns (id, name, tenant_id) values (gen_random_uuid(), 'שתול', '${B.tenant}');
      select 1`);
    is(planted, 'CROSS-TENANT INSERT: one business wrote a campaign into another business’s account');
  }

  /* ---- 5. THE STAMP, which is what makes an honest insert land right ---- */
  {
    const landed = asUser(A.user, `
      with x as (
        insert into social_campaigns (id, name) values (gen_random_uuid(), 'בלי עסק') returning tenant_id
      ) select tenant_id::text from x`);
    is(landed === A.tenant, `an insert with no tenant_id landed on ${landed || 'nothing'} instead of the signer's own business`);
  }

  /* ---- 6. A SESSION WITH NO USER sees nothing ---- */
  {
    const anon = lastValue(`
      set local role authenticated;
      set local "request.jwt.claim.sub" = '';
      select count(*) from social_queue`);
    is(anon === '0', `a session with no user id read ${anon} queue rows`);
  }

  console.log(`${NAME} OK — ${checks} assertions against a real Postgres`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
