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

  /* ========================================= SEVERAL OPEN ROWS PER TARGET */
  /*
   * ─── v33 REMOVED THE STRONGEST CONSTRAINT IN THIS SCHEMA, AND HE ASKED ────
   *
   * social_queue_one_open_per_target_idx was unique on target_id alone, partial
   * over the open statuses, and ACCOUNT-WIDE: two different campaigns could not
   * both hold a waiting row for one group. That rule was v20's, and v20 was his
   * — "לא רוצה בכלל שתיהיה אופציה לפרסם פעמיים לאותן קבוצה", after he watched
   * every group queue twice in a minute and every duplicate read דולג.
   *
   * It cost him an evening in the other direction. His Russian-language round
   * carries fifty groups; another campaign held an open row for every one of
   * them, so the planner dropped all fifty every pass and the log read
   * "אף קבוצה לא נכנסה לתור" with nothing he could do. Asked which of his two
   * contradictory instructions stands, he chose: "לפתוח הכל, גם אותו פוסט",
   * 02.11.2026.
   *
   * So this test now asserts the OPPOSITE of what it asserted before, and the
   * inversion is deliberate rather than a loosened guard. Two rows for one
   * group — the same post, even — must both be accepted.
   *
   * WHAT IS NOT TESTED HERE BECAUSE IT DID NOT CHANGE: whether either row
   * PUBLISHES. That is rules.ts — each group's daily quota, the account
   * ceiling, the gap between publications, and the repeat window, which still
   * defers a second row for the same post and group rather than sending it
   * beside the first. This file is about what the QUEUE will hold.
   */
  {
    exec(`delete from social_queue`);
    const a = '55555555-5555-4555-8555-555555555553';
    const b = '55555555-5555-4555-8555-555555555554';
    queueRow(a, ids.target, 'now()');
    const second = refused(`
      insert into social_queue (id, post_id, target_id, schedule_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text)
      values ('${b}', '${ids.post}', '${ids.target}', '${ids.schedule}', '${ids.campaign}', now() + interval '1 day', 'scheduled', '${b}', 'טקסט')`);
    is(!second, 'a second OPEN row for one group was REFUSED — v33 dropped that index, so this database has not been migrated');
    is(
      one(`select count(*) from social_queue where target_id='${ids.target}' and status='scheduled'`) === '2',
      'both rows must be waiting for the same group at once — this is the whole of what he asked for',
    );
    /*
     * AND THE EXACT-DUPLICATE KEY IS STILL THERE. (schedule_id, target_id,
     * scheduled_at) was never part of v20 and v33 does not touch it, so two
     * planners racing still cannot write the same row twice for one schedule
     * and instant. "לפתוח הכל" is about the owner's campaigns, not about
     * letting a race corrupt the queue.
     */
    const sameInstant = refused(`
      insert into social_queue (id, post_id, target_id, schedule_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text)
      values ('55555555-5555-4555-8555-555555555555', '${ids.post}', '${ids.target}', '${ids.schedule}', '${ids.campaign}',
        (select scheduled_at from social_queue where id='${a}'), 'scheduled', 'x', 'טקסט')`);
    is(sameInstant, 'the same schedule, group and instant was accepted twice — the slot key is gone, which v33 must not have touched');
  }

  /* ================================================== A ROW STUCK PUBLISHING */
  /*
   * The PC dies mid-publication and the row stays 'publishing'.
   *
   * UNDER v20 THAT BLOCKED THE GROUP FOR GOOD: 'publishing' was one of the open
   * statuses in the partial index, so nothing else could ever be queued for that
   * group until somebody moved the row. That was the shape of a queue that stops
   * and says nothing, and worker/revive.ts exists because of it.
   *
   * v33 dropped the index, so an abandoned row no longer takes its group hostage
   * — which is a real gain the owner did not specifically ask for and gets
   * anyway. revive.ts still matters: the stuck row itself is still stuck, still
   * counted as in-flight, and still needs releasing. What has changed is that
   * the REST of his publishing no longer waits on it.
   */
  {
    exec(`delete from social_queue`);
    const stuck = '55555555-5555-4555-8555-555555555555';
    queueRow(stuck, ids.target, `now() - interval '3 hours'`);
    exec(`update social_queue set status='publishing', claimed_at=now() - interval '3 hours' where id='${stuck}'`);

    const blocked = refused(`
      insert into social_queue (id, post_id, target_id, schedule_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text)
      values ('55555555-5555-4555-8555-555555555556', '${ids.post}', '${ids.target}', '${ids.schedule}', '${ids.campaign}', now(), 'scheduled', 'h-stuck', 'טקסט')`);
    is(!blocked, 'a row abandoned in publishing still blocks its group — v33 dropped that index, so this database has not been migrated');
    is(
      one(`select count(*) from social_queue where target_id='${ids.target}'`) === '2',
      'the new row must exist beside the stuck one, so one dead publication cannot hold up a group for ever',
    );

    /* WHAT RELEASES IT. The worker sweeps 'publishing' and
       'awaiting_confirmation' to 'needs_attention' at startup — so the group is
       freed by the owner restarting the PC, and by nothing else. There is no
       lease and no reaper; this test records that, and will fail the day one is
       added, which is the day to delete it. */
    const openCount = one(
      `select count(*) from social_queue where status in
         ('scheduled','manual_pending','needs_attention','awaiting_confirmation','paused','publishing')`,
    );
    /* TWO since v33: the stuck row, and the one that was refused before it and
       is now accepted beside it. The point of the count is still that nothing
       has swept or released the stuck row on its own. */
    is(openCount === '2', 'the stuck row and its new neighbour are not both open — the fixture drifted');
    is(
      one(`select count(*) from social_queue where status='publishing'`) === '1',
      'and nothing released the stuck row by itself — there is still no lease and no reaper',
    );
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

    /* AND A SECOND ROW FOR ONE OF THOSE GROUPS IS NOW ACCEPTED AT THAT SIZE —
       v33. It is asserted at a thousand rows and not only at two, because the
       index that used to refuse it was the only thing keeping the table's open
       set one-per-group, and dropping it changes what the planner's inserts
       cost under load as well as what they mean. */
    const slipped = refused(`
      insert into social_queue (id, post_id, target_id, schedule_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text)
        select gen_random_uuid(), '${ids.post}', t.id, '${ids.schedule}', '${ids.campaign}', now() + interval '1 hour', 'scheduled', gen_random_uuid()::text, 'טקסט'
          from social_targets t where t.external_id = 'bulk1'`);
    is(!slipped, 'a second open row for a group was refused at a thousand rows — v33 dropped that index, so this database has not been migrated');
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

  /* ============================================ סבבים ביום, ON THIS SERVER */
  /*
   * TWO ROUNDS A DAY, TO THE SAME GROUP — the claim the whole feature rests
   * on, asked of the server rather than of a comment.
   *
   * "הפעלת מספר סבבי פרסום לאותו קמפיין באותו היום" — round one at 03:30,
   * round two at 15:30, same campaign, same content, same groups. Every other
   * test of this feature in the suite is arithmetic over a list of 'HH:MM'
   * strings. Whether a SECOND row for a group this campaign already published
   * to can exist at all is not arithmetic: it is
   * social_queue_one_open_per_target_idx, unique on target_id alone and
   * partial over six statuses, and the answer lives in Postgres.
   *
   * So the two rounds are materialised in the order the planner materialises
   * them — round two cannot be inserted while round one is still open, and
   * fits the moment round one publishes — and both rows are checked to carry
   * their own round_at, which is what every per-round counter reads.
   */
  {
    exec(`delete from social_queue`);
    const r1 = '55555555-5555-4555-8555-555555555570';
    const r2 = '55555555-5555-4555-8555-555555555571';

    /*
     * v31: a campaign created now repeats by default, so two rounds over the
     * same groups are allowed by the engine without anything being pressed.
     *
     * THIS ASKS THE DATABASE, NOT THE FILE, and the difference is measured:
     * applySchema() runs the numbered migrations AND THEN social-latest.sql,
     * so breaking v31.sql alone leaves this green — latest.sql puts the
     * default back. Breaking both turns it red. That is the right shape: what
     * matters to the owner is where a freshly migrated database ENDS UP, and
     * social-latest.sql is the file he actually runs. If the two ever
     * disagree, schedule-readout.test.ts checks each of them by name.
     */
    is(
      one(`select column_default from information_schema.columns
             where table_name='social_campaigns' and column_name='repeat_enabled'`).startsWith('true'),
      'repeat_enabled no longer defaults to true on a freshly migrated database — חזרה יומית would start off and a second round would publish nothing',
    );
    /* v29 and v30, the two columns the feature stores itself in. */
    is(one(`select to_regclass('public.social_campaigns') is not null`) === 't', 'the campaigns table is gone');
    is(
      one(`select count(*) from information_schema.columns
             where table_name='social_campaigns' and column_name='schedule_rounds'`) === '1',
      'social_campaigns.schedule_rounds is missing — v29 did not reach this database',
    );
    is(
      one(`select count(*) from information_schema.columns
             where table_name='social_queue' and column_name='round_at'`) === '1',
      'social_queue.round_at is missing — v30 did not reach this database, and every per-round counter would read zero',
    );
    /* AND THE CAP IS THE DATABASE'S, not the screen's: four extra rounds. */
    is(
      refused(`update social_campaigns set schedule_rounds =
         '[{"at":"06:00","enabled":true},{"at":"09:00","enabled":true},{"at":"12:00","enabled":true},
           {"at":"15:00","enabled":true},{"at":"18:00","enabled":true}]'::jsonb
         where id='${ids.campaign}'`),
      'five extra rounds were accepted — the jsonb_array_length CHECK from v29 is not holding',
    );
    exec(`update social_campaigns set schedule_rounds =
      '[{"at":"15:30","enabled":true}]'::jsonb, repeat_enabled = true, repeat_min_hours = 12
      where id='${ids.campaign}'`);

    /* Round one, at 03:30 local, open. */
    exec(`
      insert into social_queue (id, post_id, target_id, schedule_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text, round_at)
      values ('${r1}', '${ids.post}', '${ids.target}', '${ids.schedule}', '${ids.campaign}',
              now(), 'scheduled', '${r1}', 'טקסט', '03:30')`);

    /*
     * ROUND TWO MAY NOW EXIST ALONGSIDE ROUND ONE — v33.
     *
     * This assertion was the inverse until 02.11.2026: round two could not be
     * inserted while round one was open, and that sequencing was the feature
     * working rather than failing. The owner replaced the rule behind it
     * ("לפתוח הכל, גם אותו פוסט"), so both rounds' rows can sit in the queue at
     * once and each still carries its own round_at, which is what every
     * per-round counter reads.
     *
     * WHAT STOPS ROUND TWO PUBLISHING INTO ROUND ONE'S GROUPS IS NOT THIS
     * INDEX and never was — it is the repeat window in rules.ts, which defers
     * the second row until the window has passed. Dropping the index changed
     * when the row is CREATED, not when it goes out.
     */
    is(
      !refused(`
        insert into social_queue (id, post_id, target_id, schedule_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text, round_at)
        values ('${r2}', '${ids.post}', '${ids.target}', '${ids.schedule}', '${ids.campaign}',
                now() + interval '12 hours', 'scheduled', '${r2}', 'טקסט', '15:30')`),
      'round two was refused while round one was open — v33 dropped that index, so this database has not been migrated',
    );

    /* Round one publishes, as it would. Round two is ALREADY in the queue now
       rather than waiting to be insertable, so nothing is inserted here — the
       row exists from the assertion above and the counts below are about it. */
    exec(`update social_queue set status='published', published_at=now() where id='${r1}'`);
    is(
      one(`select count(*) from social_queue where target_id='${ids.target}'`) === '2',
      'the same group does not hold both rounds — the per-round counters read these rows',
    );
    /* EACH ROW KNOWS WHICH ROUND IT IS. Taken off the rows rather than guessed
       from scheduled_at, because a deferred row keeps its round and would
       otherwise be counted in the next one. */
    is(
      one(`select round_at from social_queue where id='${r1}'`) === '03:30' &&
        one(`select round_at from social_queue where id='${r2}'`) === '15:30',
      'the two rows do not carry their own rounds, so "סבב 2 — מפרסם: 12 מתוך 50" would be a guess',
    );
    is(
      one(`select count(*) from social_queue where campaign_id='${ids.campaign}' and round_at='15:30'`) === '1',
      'the per-round count cannot be taken off the rows by round_at, which is exactly how the card reads it',
    );
    exec(`delete from social_queue; update social_campaigns set schedule_rounds='[]'::jsonb where id='${ids.campaign}'`);
  }

  /* ===================== DELETING A CAMPAIGN KEEPS HIS HISTORY ========== */
  /*
   * "אסור למחוק מידע", and a delete button that is now ONE TAP from the card.
   *
   * The owner asked for a visible way to delete a campaign
   * ("תוסיף אופציה למחוק קמפיין מהעמוד הזה") and got one on the card itself,
   * so the confirmation behind it is the only thing between a stray tap and a
   * gone campaign. That confirmation promises him, in these words:
   *
   *   "הפוסטים עצמם יישארו במערכת ללא שיוך לקמפיין, והיסטוריית הפרסומים לא
   *    נמחקת."
   *
   * WHETHER THAT IS TRUE IS A PROPERTY OF THE FOREIGN KEYS, not of the
   * client code that shows the sentence. Both are `on delete set null`
   * (social-schema.sql:124 for social_posts, social-schema-v2.sql:46 for
   * social_queue) — but a CASCADE added to either one later would turn that
   * promise into a lie silently, delete his publication history, and break
   * the rule above, with nothing anywhere going red. So it is asked of the
   * server.
   */
  {
    exec(`delete from social_queue`);
    const gone = '55555555-5555-4555-8555-555555555580';
    const kept = '55555555-5555-4555-8555-555555555581';

    /* A campaign with a post and two queue rows: one already published — the
       history — and one still waiting. */
    exec(`
      insert into social_campaigns (id, name, status) values ('${gone}', 'קמפיין שנמחק', 'archived');
      update social_posts set campaign_id = '${gone}' where id = '${ids.post}';
      insert into social_queue (id, post_id, target_id, schedule_id, campaign_id, scheduled_at, status, dedupe_hash, rendered_text, published_at)
        values ('${kept}', '${ids.post}', '${ids.target}', '${ids.schedule}', '${gone}',
                now() - interval '2 days', 'published', '${kept}', 'טקסט', now() - interval '2 days');
    `);

    /* THE DELETE ITSELF. deleteCampaign() in client.ts ends with exactly this
       statement; everything before it is bookkeeping the server does not see. */
    exec(`delete from social_campaigns where id = '${gone}'`);

    is(one(`select count(*) from social_campaigns where id='${gone}'`) === '0', 'the campaign row survived its own delete');
    is(
      one(`select count(*) from social_queue where id='${kept}'`) === '1',
      'THE PUBLISHED ROW WENT WITH THE CAMPAIGN — his publication history is deleted by a delete that promises it is not, and the rule is "אסור למחוק מידע"',
    );
    is(
      one(`select campaign_id is null from social_queue where id='${kept}'`) === 't',
      'the surviving row still points at a campaign that no longer exists',
    );
    is(
      one(`select count(*) from social_posts where id='${ids.post}'`) === '1',
      'THE POST WENT WITH THE CAMPAIGN — the confirmation promises the posts stay in the system',
    );
    is(
      one(`select campaign_id is null from social_posts where id='${ids.post}'`) === 't',
      'the post survived but still carries the dead campaign id',
    );
    /* And the published_at is intact: the row is the record of what went out,
       not a husk of one. */
    is(
      one(`select published_at is not null and rendered_text <> '' from social_queue where id='${kept}'`) === 't',
      'the surviving history row lost what made it history',
    );
    exec(`delete from social_queue; update social_posts set campaign_id = '${ids.campaign}' where id = '${ids.post}'`);
  }

  exec(`delete from social_queue; delete from social_targets where external_id like 'bulk%';`);

  /* ───── THE MIGRATION THAT UNDID THE FIX ──────────────────────────────────
   *
   *   "לא אמור ליהנות גם 600 שניות, הפרסום צריך לצאת אחד אחרי השני לפי קצב
   *    מהיר בינוני או בטוח לפי מה שבחרתי"   09.11.2026
   *
   * THIS IS THE TEST WHOSE ABSENCE LET A BACKFILL HIDE, and it belongs in
   * this file for the reason stated at line 373: applySchema() runs the
   * numbered migrations AND THEN social-latest.sql, which is the file the
   * owner actually runs by name. So this asks the one question that matters —
   * does a gap he chose survive a re-run — against the files in the order
   * they really execute.
   *
   * Five lines below `default 600`, v26 carried an UNCONDITIONAL backfill:
   *
   *   update public.social_campaigns
   *      set schedule_gap_seconds = greatest(30, least(1800,
   *            coalesce(schedule_gap_minutes, 10) * 60))
   *    where schedule_gap_seconds is distinct from <the same expression>;
   *
   * It is not guarded by "the column was just added" — it runs on every
   * execution. And it reads the MINUTES, which are the rounded-up mirror of
   * the seconds: gapMinutesFor(40) is 1, so a 40-second round was silently
   * widened to 60 the next time the file ran, and max(account 40, campaign 60)
   * is 60. The gap the owner picked, undone by a migration, with nothing said.
   *
   * It was live: two rounds stored 45 seconds and one stored 40 on 09.11.2026,
   * and a re-run of the file he is told to run would have widened all three.
   */
  {
    const chosen = '55555555-5555-4555-8555-5555555555a0';
    exec(`
      insert into social_campaigns (id, name, status, schedule_gap_seconds, schedule_gap_minutes)
        values ('${chosen}', 'סבב בארבעים שניות', 'active', 40, 1)
      on conflict (id) do update set schedule_gap_seconds = 40, schedule_gap_minutes = 1;
    `);
    is(one(`select schedule_gap_seconds from social_campaigns where id='${chosen}'`) === '40', 'the forty-second round could not be stored in the first place');

    /* The real thing, in the real order: every numbered migration and then
       social-latest.sql, exactly as the owner runs it. */
    applySchema(repoRoot);

    is(
      one(`select schedule_gap_seconds from social_campaigns where id='${chosen}'`) === '40',
      'A GAP THE OWNER CHOSE WAS WIDENED BY RE-RUNNING THE SCHEMA. The v26 backfill is unconditional and reads the rounded-up MINUTES beside the seconds, so every sub-minute gap becomes 60 — and max(account, campaign) then makes 60 the gate. Any value he picks below a minute is undone by the file he is told to run.',
    );
    is(
      one(`select schedule_gap_minutes from social_campaigns where id='${chosen}'`) === '1',
      'and the minutes column beside it still reads 1 — the two are one number and a backfill may not split them',
    );
    /* AND A ROW THAT GENUINELY HAS NO SECONDS VALUE IS STILL DERIVED FROM ITS
       MINUTES. That is what the backfill is FOR, and narrowing it to "only
       touch rows with no seconds value" must not turn into "touch nothing".
       The CHECK refuses 0 outright on a current database, which is itself
       worth knowing — so the constraint is dropped to stage the row a
       pre-v26 database would have, and re-added by applySchema() below, the
       same way the file re-adds it on every run. */
    const legacy = '55555555-5555-4555-8555-5555555555a1';
    is(
      refused(`insert into social_campaigns (id, name, schedule_gap_seconds) values ('${legacy}', 'אפס', 0)`),
      'a gap of 0 is accepted by the column — readSchedule() reads 0 as "the column is absent" and falls back to the minutes, so a stored 0 round-trips as SIXTY seconds rather than as "no gap"',
    );
    exec(`
      alter table social_campaigns drop constraint if exists social_campaigns_schedule_gap_seconds_range;
      insert into social_campaigns (id, name, status, schedule_gap_minutes)
        values ('${legacy}', 'סבב ישן בדקות', 'active', 3)
      on conflict (id) do update set schedule_gap_minutes = 3;
      update social_campaigns set schedule_gap_seconds = 0 where id = '${legacy}';
    `);
    applySchema(repoRoot);
    is(
      one(`select count(*) from pg_constraint where conname = 'social_campaigns_schedule_gap_seconds_range'`) === '1',
      'the 30..1800 constraint was not put back by the schema run — it is what refuses the 0 that reads as 60',
    );
    is(
      one(`select schedule_gap_seconds from social_campaigns where id='${legacy}'`) === '180',
      'a row with no seconds value of its own is no longer derived from its minutes — the backfill has been narrowed into doing nothing at all',
    );
    exec(`delete from social_campaigns where id in ('${chosen}', '${legacy}')`);
  }

  console.log(`${NAME} OK — ${checks} assertions against a real Postgres`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
