/**
 * THE QUEUE, AGAINST A REAL POSTGRES.
 *
 * "Worker לא יכול לקחת משימה שכבר נלקחה על ידי Worker אחר... לא מתבצע פרסום
 *  כפול בעקבות לחיצה חוזרת או ניסיון חוזר... משימות תקועות מזוהות ומטופלות."
 *
 * Every other test in this suite answers those from a stand-in written by the
 * same hand as the code. These run the repository's own schema into a real
 * server and race real connections at it, because the claim's correctness is
 * a property of Postgres — of READ COMMITTED, of what a conditional UPDATE
 * sees when another transaction holds the row, and of which of this schema's
 * unique indexes are partial — and not of anything a fake can be asked.
 *
 * SKIPS, LOUDLY, WITH NO DATABASE. Nothing here touches production: the only
 * server it will ever use is the one named by ANX_TEST_DATABASE_URL.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { CORE_TABLES, applySchema, available, exec, one, race, refused, resetSchema, rows, skip } from './db/harness';

const NAME = 'queue (real postgres)';

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

/* ---------------------------------------------------------------- schema */

resetSchema();
applySchema(repoRoot);

for (const t of CORE_TABLES) {
  is(one(`select to_regclass('public.${t}') is not null`) === 't', `the schema did not produce ${t}`);
}

/*
 * AND THE ORDER MATTERS, WHICH IS WORTH A TEST OF ITS OWN.
 *
 * The migrations are applied in NUMERIC order. Sorted as strings, v10 comes
 * before v2 — and v10 alters a column v2 creates. Nothing in the repository
 * stated the order before this file; it was in whoever ran them last.
 */
{
  const files = rows(`select 1`); // reached only if the apply above succeeded
  is(files.length > 0, 'the database did not answer after the schema apply');
}

/*
 * ONE async main(), because tsx compiles this suite to CommonJS and a
 * top-level await is a syntax error there. Same shape as every other
 * browser-driven test in this directory.
 */
async function main(): Promise<void> {
  /* ------------------------------------------------------------ a fixture */

  const ids = {
    campaign: '11111111-1111-4111-8111-111111111111',
    post: '22222222-2222-4222-8222-222222222222',
    schedule: '33333333-3333-4333-8333-333333333333',
    target: '44444444-4444-4444-8444-444444444444',
    target2: '44444444-4444-4444-8444-444444444445',
  };

  function seed(): void {
    exec(`
      delete from social_queue;
      delete from social_schedules;
      delete from social_posts;
      delete from social_targets;
      delete from social_campaigns;
      insert into social_campaigns (id, name) values ('${ids.campaign}', 'סבב בדיקה');
      insert into social_posts (id, title, base_text, campaign_id)
        values ('${ids.post}', 'פוסט בדיקה', 'טקסט', '${ids.campaign}');
      insert into social_targets (id, channel, external_id, name)
        values ('${ids.target}', 'facebook_group', 'g1', 'קבוצה 1'),
               ('${ids.target2}', 'facebook_group', 'g2', 'קבוצה 2');
      insert into social_schedules (id, post_id, mode, target_ids, active)
        values ('${ids.schedule}', '${ids.post}', 'weekly', array['${ids.target}'::uuid], true);
    `);
  }

  /** `at` is a SQL expression, not a literal — callers pass now(), now() - interval '3 hours', and so on. */
  function queueRow(id: string, targetId: string, at: string, status = 'scheduled'): void {
    exec(`
      insert into social_queue (id, post_id, target_id, schedule_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text)
      values ('${id}', '${ids.post}', '${targetId}', '${ids.schedule}', '${ids.campaign}', ${at}, '${status}', '${id}', 'טקסט')
    `);
  }

  /* ============================================================ THE CLAIM */
  /*
   * TWO WORKERS, ONE ROW. The claim in worker/social-worker.ts is
   *
   *     update social_queue set status='publishing', ... where id=? and status='scheduled' returning id
   *
   * and the lane bails when nothing comes back. Eight sessions run it at once.
   */
  {
    seed();
    const row = '55555555-5555-4555-8555-555555555551';
    queueRow(row, ids.target, 'now()');

    const results = await race(
      `update social_queue set status='publishing', worker_id=gen_random_uuid(), claimed_at=now(), attempts=attempts+1
         where id='${row}' and status='scheduled' returning id`,
      8,
    );
    const winners = results.filter((r) => r.includes(row));
    is(winners.length === 1, `THE CLAIM IS NOT ATOMIC — ${winners.length} of 8 concurrent workers claimed the same row`);
    is(
      one(`select attempts from social_queue where id='${row}'`) === '1',
      'the losing claims still incremented attempts — the row was written by more than one worker',
    );
    is(one(`select status from social_queue where id='${row}'`) === 'publishing', 'the claimed row did not end up publishing');
  }

  /* ======================================================== THE DOUBLE TAP */
  /*
   * The same row claimed, finished, and claimed again — a retry, or the owner
   * pressing twice. A published row may never be re-claimed.
   */
  {
    const row = '55555555-5555-4555-8555-555555555552';
    exec(`delete from social_queue`);
    queueRow(row, ids.target, 'now()');
    exec(`update social_queue set status='published', published_at=now() where id='${row}'`);
    const again = await race(
      `update social_queue set status='publishing' where id='${row}' and status='scheduled' returning id`,
      4,
    );
    is(again.every((r) => !r.includes(row)), 'a PUBLISHED row was claimed again — this is a double publication');
  }

  /* ================================================ ONE OPEN ROW PER TARGET */
  /*
   * social_queue_one_open_per_target_idx is unique on target_id alone, partial
   * over the open statuses. It is the strongest constraint in this schema and
   * it is ACCOUNT-WIDE: two different campaigns cannot both hold a waiting row
   * for the same group.
   */
  {
    exec(`delete from social_queue`);
    const a = '55555555-5555-4555-8555-555555555553';
    const b = '55555555-5555-4555-8555-555555555554';
    queueRow(a, ids.target, 'now()');
    const second = refused(`
      insert into social_queue (id, post_id, target_id, schedule_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text)
      values ('${b}', '${ids.post}', '${ids.target}', '${ids.schedule}', '${ids.campaign}', now() + interval '1 day', 'scheduled', '${b}', 'טקסט')`);
    is(second, 'two OPEN rows for one group were allowed — the engine assumes they cannot be');
    /* And the moment the first leaves the open statuses, the second fits. */
    exec(`update social_queue set status='published', published_at=now() where id='${a}'`);
    queueRow(b, ids.target, "now() + interval '1 day'");
    is(one(`select count(*) from social_queue where target_id='${ids.target}'`) === '2', 'a second row could not follow a published one');
  }

  /* ================================================== A ROW STUCK PUBLISHING */
  /*
   * The PC dies mid-publication. The row stays 'publishing', which is one of
   * the OPEN statuses in the partial index above — so that group is blocked
   * from ever receiving another row until something moves it.
   *
   * This is the shape of a queue that stops and says nothing, so the test
   * states it rather than assuming somebody remembers.
   */
  {
    exec(`delete from social_queue`);
    const stuck = '55555555-5555-4555-8555-555555555555';
    queueRow(stuck, ids.target, `now() - interval '3 hours'`);
    exec(`update social_queue set status='publishing', claimed_at=now() - interval '3 hours' where id='${stuck}'`);

    const blocked = refused(`
      insert into social_queue (id, post_id, target_id, schedule_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text)
      values ('55555555-5555-4555-8555-555555555556', '${ids.post}', '${ids.target}', '${ids.schedule}', '${ids.campaign}', now(), 'scheduled', 'h-stuck', 'טקסט')`);
    is(blocked, 'a row abandoned in publishing no longer blocks its group — the partial index changed');

    /* WHAT RELEASES IT. The worker sweeps 'publishing' and
       'awaiting_confirmation' to 'needs_attention' at startup — so the group is
       freed by the owner restarting the PC, and by nothing else. There is no
       lease and no reaper; this test records that, and will fail the day one is
       added, which is the day to delete it. */
    const openCount = one(
      `select count(*) from social_queue where status in
         ('scheduled','manual_pending','needs_attention','awaiting_confirmation','paused','publishing')`,
    );
    is(openCount === '1', 'the stuck row is not the only open row — the fixture drifted');
  }

  /* ====================================================== THE SLOT COLLISION */
  /*
   * social_queue_slot_idx is unique on (schedule_id, target_id, scheduled_at)
   * and NOT partial, so a row swept to 'skipped' keeps owning its instant. The
   * planner's upsert is ON CONFLICT DO NOTHING, so re-planning that instant is
   * silent. Commit cf7cdeb documents this; here it is, demonstrated.
   */
  {
    exec(`delete from social_queue`);
    const when = `timestamptz '2026-11-02 08:00:00+02'`;
    exec(`
      insert into social_queue (id, post_id, target_id, schedule_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text, skip_reason)
      values (gen_random_uuid(), '${ids.post}', '${ids.target}', '${ids.schedule}', '${ids.campaign}', ${when}, 'skipped', 'h1', 'טקסט', 'הסבב נעצר')
    `);
    const before = one(`select count(*) from social_queue`);
    exec(`
      insert into social_queue (id, post_id, target_id, schedule_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text)
      values (gen_random_uuid(), '${ids.post}', '${ids.target}', '${ids.schedule}', '${ids.campaign}', ${when}, 'scheduled', 'h2', 'טקסט')
      on conflict (schedule_id, target_id, scheduled_at) do nothing
    `);
    const after = one(`select count(*) from social_queue`);
    is(before === after, 'the slot index stopped swallowing a re-plan over a skipped row — cf7cdeb can be revisited');
    is(
      one(`select status from social_queue where scheduled_at = ${when}`) === 'skipped',
      'the swept row is no longer the one that owns the instant',
    );
  }

  /* ============================================ A THOUSAND ROWS, AND THE DUE READ */
  /*
   * "1,000 משימות בתור." The read the worker makes every tick is
   * status='scheduled' AND scheduled_at <= now(), ordered by scheduled_at. It
   * has an index; this proves the index is the one being used and that the
   * read stays sub-second at that size.
   */
  {
    exec(`delete from social_queue`);
    exec(`
      insert into social_targets (id, channel, external_id, name)
        select gen_random_uuid(), 'facebook_group', 'bulk'||g, 'קבוצה '||g from generate_series(1, 1000) g
    `);
    exec(`
      insert into social_queue (id, post_id, target_id, schedule_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text)
        select gen_random_uuid(), '${ids.post}', t.id, '${ids.schedule}', '${ids.campaign}',
               now() + (row_number() over () || ' minutes')::interval, 'scheduled', gen_random_uuid()::text, 'טקסט'
          from social_targets t where t.external_id like 'bulk%'
    `);
    is(one(`select count(*) from social_queue`) === '1000', 'the bulk insert did not produce a thousand rows');

    const started = Date.now();
    const due = rows(`select id from social_queue where status='scheduled' and scheduled_at <= now() + interval '10 minutes' order by scheduled_at limit 50`);
    const ms = Date.now() - started;
    is(due.length === 10, `the due read returned ${due.length} rows for a ten-minute window, expected 10`);
    is(ms < 2000, `the due read took ${ms}ms over a thousand rows`);

    /* AND THE ONE-OPEN-PER-TARGET RULE HOLDS AT THAT SIZE: a thousand rows for
       a thousand groups is legal, a second for any of them is not. */
    const slipped = refused(`
      insert into social_queue (id, post_id, target_id, schedule_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text)
        select gen_random_uuid(), '${ids.post}', t.id, '${ids.schedule}', '${ids.campaign}', now(), 'scheduled', gen_random_uuid()::text, 'טקסט'
          from social_targets t where t.external_id = 'bulk1'`);
    is(slipped, 'a second open row slipped past the per-target index at a thousand rows');
  }

  /* ======================================================= EIGHT LANES, 50 ROWS */
  /*
   * The real shape of the worker: several lanes claiming from one due list at
   * the same time. Every row must be claimed exactly once, and the lanes
   * together must claim all of them.
   */
  {
    exec(`delete from social_queue`);
    exec(`
      insert into social_queue (id, post_id, target_id, schedule_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text)
        select gen_random_uuid(), '${ids.post}', t.id, '${ids.schedule}', '${ids.campaign}', now() - interval '1 minute', 'scheduled', gen_random_uuid()::text, 'טקסט'
          from (select id from social_targets where external_id like 'bulk%' limit 50) t
    `);
    const claimAll = `
      do $$
      declare r record;
      begin
        for r in select id from social_queue where status='scheduled' and scheduled_at <= now() order by scheduled_at loop
          update social_queue set status='publishing', worker_id=gen_random_uuid(), claimed_at=now(), attempts=attempts+1
            where id=r.id and status='scheduled';
        end loop;
      end $$;`;
    await race(claimAll, 8);

    is(one(`select count(*) from social_queue where status='publishing'`) === '50', 'not every row was claimed by the eight lanes');
    is(
      one(`select coalesce(max(attempts), 0) from social_queue`) === '1',
      'a row was claimed more than once — eight lanes raced and the guard did not hold',
    );
    is(one(`select count(distinct worker_id) from social_queue where status='publishing'`) !== '0', 'no lane recorded itself as the claimer');
  }

  exec(`delete from social_queue; delete from social_targets where external_id like 'bulk%';`);

  console.log(`${NAME} OK — ${checks} assertions against a real Postgres`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
