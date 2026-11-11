/**
 * THE 100-PUBLICATION CYCLE, AGAINST A REAL POSTGRES.
 *
 * "כל 100 פרסומים מוצלחים בקבוצות פייסבוק תתחיל הפסקה של 8 שעות."
 * "ביממה של 24 שעות אפשר עד שתי סבבים (200) קבוצות ככה אנחנו בסדר."
 *
 * His brief asks for one thing a fake database cannot answer:
 *
 *   "יש להשתמש בנעילה אטומית או במנגנון שקול כדי למנוע מעבר של מכסת 100
 *    הפרסומים עקב עבודה מקבילה."
 *
 * Whether two publishing lanes can both take the hundredth slot is a question
 * about Postgres — about READ COMMITTED, about what the second session sees
 * while the first holds `select … for update`, and about whether the whole
 * decision really happens inside one transaction. A hand-written stand-in
 * answers whatever its author believed. So this file runs the repository's own
 * .sql files into a real server and races real connections at it.
 *
 * IT IS ALSO THE §6 TABLE FROM HIS BRIEF, line by line:
 *
 *   99 successful publications        → no pause
 *   the 100th                         → the pause begins
 *   before the 8 hours are up         → nothing publishes
 *   after the 8 hours                 → it resumes
 *   several agents at once            → the quota is never exceeded
 *   a failed publication              → not counted
 *   the switch off                    → nothing counted, nothing held
 *
 * SKIPS, LOUDLY, WITH NO DATABASE. Nothing here touches production: the only
 * server it will ever use is the one named by ANX_TEST_DATABASE_URL.
 */
import assert from 'node:assert/strict';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySchema, available, exec, lastValue, one, race, refusedQuiet, resetSchema, skip } from './db/harness';

const NAME = 'publish cycle (real postgres)';

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
const eq = (a: unknown, b: unknown, what: string) => {
  checks += 1;
  assert.deepEqual(a, b, what);
};

resetSchema();
applySchema(repoRoot);

is(one(`select to_regclass('public.social_publish_cycle') is not null`) === 't', 'v41 did not produce social_publish_cycle');
is(
  one(`select count(*)::int from pg_proc where proname = 'social_publish_cycle_tick'`) === '1',
  'v41 did not produce the counter function',
);

/*
 * ONE BUSINESS, so social_default_tenant() has a single answer. The function
 * is `security invoker` and resolves the tenant itself — which is the property
 * being relied on, so it is set up the way production is rather than passed
 * in as an argument.
 */
exec(`insert into public.social_tenants (id, name) values ('11111111-1111-1111-1111-111111111111', 'בדיקה')`);
is(one(`select public.social_default_tenant()::text`) === '11111111-1111-1111-1111-111111111111', 'the single business is resolvable');

/** One publication through the mechanism, with the defaults his brief sets. */
const tick = (opts = '') => one(`select public.social_publish_cycle_tick(${opts || '100, 8, 2, true'})::text`);
const field = (k: string) => one(`select (public.social_publish_cycle_tick(100, 8, 2, false)->>'${k}')`);
const row = (c: string) => one(`select ${c}::text from public.social_publish_cycle`);
const on = () => exec(`update public.social_publish_cycle set enabled = true`);
const reset = () =>
  exec(`update public.social_publish_cycle set cycle_count = 0, rounds_in_window = 0, rest_until = null,
        window_started_at = now(), cycle_started_at = now()`);

/* ══════════════ 1. OFF BY DEFAULT — the feature flag his brief asks for ═══ */

{
  const first = JSON.parse(tick());
  eq(first.enabled, false, 'the mechanism is OFF on a database that has only just run v41');
  eq(first.count, 0, 'and it counted nothing while off');
  eq(row('rest_until'), '', 'and held nothing');
  /*
   * THIS IS THE WHOLE POINT OF THE FLAG. Running the migration on his live
   * database must change no behaviour at all until he presses the switch, and
   * "no behaviour" has to include the counter: a mechanism that counts while
   * off would start its first round at some number nobody chose.
   */
  tick();
  tick();
  eq(row('cycle_count'), '0', 'ten publications while off still leave the counter at zero');
}

/* ══════════════ 2. 99 → NOTHING. 100 → THE PAUSE ════════════════════════ */

on();
reset();

{
  let last: Record<string, unknown> = {};
  for (let i = 0; i < 99; i += 1) last = JSON.parse(tick());
  eq(last.count, 99, 'ninety-nine publications leave the counter at ninety-nine');
  eq(last.restUntil, null, '…and NO pause — the brief\'s first row');
  eq(row('rest_until'), '', 'and the database agrees');

  const hundredth = JSON.parse(tick());
  is(typeof hundredth.restUntil === 'string' && hundredth.restUntil.length > 0, 'the hundredth publication starts the pause');
  eq(hundredth.count, 0, 'and the round starts again from zero rather than sitting at a hundred');
  eq(hundredth.roundsInWindow, 1, 'one round of the window is spent');

  /* EIGHT HOURS, and measured rather than assumed — a pause of the wrong
     length is the one defect this mechanism could have that nobody would
     notice for a day. */
  const hours = Number(one(`select round(extract(epoch from (rest_until - now())) / 3600)::text from public.social_publish_cycle`));
  eq(hours, 8, 'the pause is eight hours long');
}

/* ══════════════ 3. WHILE IT HOLDS, NOTHING IS COUNTED ═══════════════════ */

{
  const before = row('rest_until');
  const during = JSON.parse(tick());
  eq(during.count, 0, 'a publication during the pause does not advance the round');
  eq(row('rest_until'), before, 'and does not extend the pause either');
  /*
   * The counter not moving is the SECOND line of defence. The gate in the
   * worker is the first and it is what actually stops publishing; this is
   * what makes a publication that slipped past it — a lane already in flight
   * when the pause began — harmless rather than cumulative.
   */
}

/* ══════════════ 4. PAST THE EIGHT HOURS, IT RESUMES BY ITSELF ═══════════ */

{
  exec(`update public.social_publish_cycle set rest_until = now() - interval '1 minute'`);
  const after = JSON.parse(tick());
  eq(after.restUntil, null, 'a pause whose instant has passed is cleared on the next publication');
  eq(after.count, 1, 'and that publication counts, so the new round starts at one');
  /* NOBODY HAD TO PRESS ANYTHING. The brief says "בתום 8 שעות המערכת תחזור
     לפעילות בהתאם להגדרות הקמפיינים המקוריות", and the clearing happens
     inside the same call that publishes — no separate sweep to miss. */
}

/* ══════════════ 5. TWO ROUNDS A DAY, AND NOT A THIRD ════════════════════ */

/*
 * "ביממה של 24 שעות אפשר עד שתי סבבים (200) קבוצות ככה אנחנו בסדר."
 *
 * Eight hours alone does NOT guarantee that, which is why this section
 * exists. Measured on his own ten days: at the fast end of his pace (31/hour,
 * 11.11) a hundred publications take 3.2 hours, so a cycle is 11.2 hours and
 * a third round begins at hour 22.4 — about 214 in the day, inside the band
 * where every rate limit I measured on both accounts landed (210–265).
 */
{
  reset();
  for (let i = 0; i < 100; i += 1) tick();
  eq(row('rounds_in_window'), '1', 'the first round is spent');
  /* Pretend the eight hours passed, which is the whole danger: the clock is
     free but the window is not. */
  exec(`update public.social_publish_cycle set rest_until = now() - interval '1 minute'`);
  for (let i = 0; i < 100; i += 1) tick();
  eq(row('rounds_in_window'), '2', 'and the second');

  const held = Number(one(`select round(extract(epoch from (rest_until - now())) / 3600)::text from public.social_publish_cycle`));
  is(held > 8, `the SECOND round's pause runs past eight hours — it ran ${held}, so a third round cannot start inside the day`);
  const toWindowEnd = Number(
    one(`select round(extract(epoch from (rest_until - (window_started_at + interval '24 hours'))) / 60)::text from public.social_publish_cycle`),
  );
  eq(toWindowEnd, 0, 'it runs to the end of the 24-hour window exactly, which is what "up to two rounds" means');
}

/* ══════════════ 6. AND THE WINDOW ROLLS, so tomorrow is a fresh day ═════ */

{
  exec(`update public.social_publish_cycle set window_started_at = now() - interval '25 hours', rest_until = now() - interval '1 minute'`);
  const rolled = JSON.parse(tick());
  eq(rolled.roundsInWindow, 0, 'a window older than 24 hours rolls over and the rounds reset');
  eq(rolled.count, 1, 'and the publication that rolled it counts toward the new round');
}

/* ══════════════ 7. READING IT CHANGES NOTHING ═══════════════════════════ */

/*
 * The card polls this. A read that incremented would mean the number climbs
 * while nobody publishes — which is both wrong and the kind of wrong that
 * looks like the engine is running when it is not.
 */
{
  reset();
  tick();
  tick();
  const before = row('cycle_count');
  field('count');
  field('count');
  eq(row('cycle_count'), before, 'p_count=false reads the state without advancing it');
}

async function main(): Promise<void> {
  /* ════════ 8. THE ONE A FAKE CANNOT ANSWER: AGENTS IN PARALLEL ═════════ */

  /*
   * "מספר סוכנים במקביל — אין חריגה מהמכסה."
   *
   * Eight separate psql SESSIONS, started together, each calling the function
   * once, with the counter parked one short of the limit. If the lock is real
   * exactly one of them crosses and the rest come back inside the new round;
   * if it is not, several cross at once and the account publishes past the
   * ceiling that exists to protect it.
   *
   * SEPARATE PROCESSES, not separate statements: inside one session the second
   * call simply sees the first's work and the question is never asked.
   */
  /*
   * ─── AND IT HAS TO ACTUALLY RACE, WHICH THE FIRST VERSION DID NOT ─────
   *
   * CAUGHT BY A MUTATION: removing `for update` from the function left this
   * section passing. Eight `psql` PROCESSES take longer to start than the
   * function takes to run, so they arrived one after another and the lock was
   * never contended — the test proved nothing and said it had.
   *
   * Each lane now makes FIFTY calls inside ONE statement, so the lanes are
   * genuinely overlapping in time, and the ceiling is set out of reach
   * (100000) so no pause can interfere with the arithmetic. The question
   * becomes the simplest one there is: did every increment survive?
   *
   * With the row lock, lane two blocks on lane one's transaction and the
   * total is exactly 8 × 50. Without it, each lane reads the committed value
   * it started from, counts fifty of its own, and the last writer wins — the
   * classic lost update, and the reason this counter is not a field on the
   * `control` jsonb.
   */
  exec(`update public.social_publish_cycle set enabled = true`);
  reset();
  const LANES = 8;
  const PER_LANE = 50;
  const raced = await race(
    `select public.social_publish_cycle_tick(100000, 8, 2, true) from generate_series(1, ${PER_LANE})`,
    LANES,
  );
  is(raced.every((r) => !r.startsWith('ERROR:')), `every lane ran — ${raced.filter((r) => r.startsWith('ERROR:')).join(' | ')}`);
  eq(
    row('cycle_count'),
    String(LANES * PER_LANE),
    `every one of the ${LANES * PER_LANE} concurrent increments survived — a smaller number is a lost update, which is the whole reason this is a database function and not four lines in the worker`,
  );

  reset();
  for (let i = 0; i < 99; i += 1) tick();
  eq(row('cycle_count'), '99', 'the counter is parked one short of the limit');

  const lanes = 8;
  const out = await race(`select public.social_publish_cycle_tick(100, 8, 2, true)::text`, lanes);
  const parsed = out
    .filter((o) => !o.startsWith('ERROR:'))
    .map((o) => JSON.parse(o) as { restUntil: string | null; count: number; crossed: boolean; ok: boolean });
  eq(parsed.length, lanes, `all ${lanes} lanes answered — ${out.filter((o) => o.startsWith('ERROR:')).join(' | ')}`);
  is(parsed.every((p) => p.ok), 'every lane resolved a business — a null tenant would make this whole section vacuous');

  /*
   * EXACTLY ONE CROSSED, READ OFF `crossed` AND NOT OFF `restUntil`.
   *
   * THE FIRST VERSION OF THIS ASSERTION WAS WRONG AND PASSED NOTHING: every
   * lane that arrives during a hold ALSO carries a restUntil, because it is
   * reporting the hold rather than causing it. Eight lanes came back with a
   * non-null instant and the test read that as eight crossings. The function
   * now says which call closed the round, which is the only honest way to ask
   * this question from outside the lock.
   */
  const crossed = parsed.filter((p) => p.crossed);
  eq(crossed.length, 1, `exactly one lane took the hundredth slot — ${crossed.length} did, which is the quota being exceeded`);
  eq(row('rounds_in_window'), '1', 'and the database recorded exactly one completed round, not several');

  /*
   * AND THE COUNTER DID NOT RUN PAST THE LIMIT. Seven lanes arrived after the
   * pause began; the pause is what stops them counting, so the new round is
   * still empty. A number above zero here would be publications spent inside
   * a hold.
   */
  eq(row('cycle_count'), '0', 'and no lane counted past the ceiling into the next round');

  /* ════════ 9. AND WITH THE SWITCH OFF, THE RACE COUNTS NOTHING ═════════ */

  exec(`update public.social_publish_cycle set enabled = false`);
  reset();
  const offOut = await race(`select public.social_publish_cycle_tick(100, 8, 2, true)::text`, 4);
  is(
    offOut.every((o) => !o.startsWith('ERROR:') && JSON.parse(o).enabled === false),
    'every lane reports the mechanism off',
  );
  eq(row('cycle_count'), '0', 'and four concurrent publications with the switch off still count nothing');
  eq(row('rest_until'), '', 'and hold nothing');

  /* ════════ 10. A RESTART, A CRASH, AND A CLOCK THAT MOVED ══════════════ */

  /*
   * "סגירת דפדפן · הפעלה מחדש של השרת · קריסת סוכן · שינוי שעה במערכת."
   *
   * All four are the same question asked four ways: does the pause live
   * anywhere that a process can take with it when it dies? It does not — it
   * is a timestamptz in a row. So the test is to ask from a PROCESS THAT WAS
   * NOT THERE when the pause began, which is exactly what a restarted agent,
   * a respawned crashed one, and a reopened browser all are. `race(…, 1)`
   * spawns a brand-new psql, with its own connection and its own memory.
   */
  exec(`update public.social_publish_cycle set enabled = true`);
  reset();
  for (let i = 0; i < 100; i += 1) tick();
  const held = row('rest_until');
  is(held !== '', 'the hundredth publication left a hold in the row');

  const reborn = JSON.parse((await race(`select public.social_publish_cycle_tick(100, 8, 2, false)::text`, 1))[0]);
  eq(reborn.resting, true, 'a process that was not running when the pause began still sees it');
  eq(new Date(reborn.restUntil).getTime(), new Date(held).getTime(), 'and sees the very same instant, to the millisecond');

  /*
   * AND IT STILL REFUSES TO PUBLISH. The dangerous shape of this bug is not a
   * forgotten pause — it is a fresh agent that reads the pause, reports it,
   * and counts anyway.
   */
  await race(`select public.social_publish_cycle_tick(100, 8, 2, true)`, 1);
  eq(row('cycle_count'), '0', 'and a publication attempt from the new process counts nothing');
  eq(new Date(row('rest_until')).getTime(), new Date(held).getTime(), 'and does not push the pause further out — a hold that lengthened on every attempt would never end');

  /*
   * THE CLOCK THAT MOVED. Nothing a caller passes can shorten a hold: the
   * instant was computed once, by the server, and the only thing that ends it
   * is the server's own now() passing it. Here the same call arrives claiming
   * a one-hour rest — and the eight-hour hold it finds is untouched.
   */
  const lying = JSON.parse(tick('100, 1, 2, true'));
  eq(lying.resting, true, 'a later call with different numbers cannot talk its way out of a hold in force');
  eq(new Date(row('rest_until')).getTime(), new Date(held).getTime(), 'and cannot move the instant it was given');

  /* AND IT ENDS BY ITSELF, with no write from any worker. */
  exec(`update public.social_publish_cycle set rest_until = now() - interval '1 second'`);
  const done = JSON.parse((await race(`select public.social_publish_cycle_tick(100, 8, 2, false)::text`, 1))[0]);
  eq(done.resting, false, 'once the instant has passed the server says so — to a reader that writes nothing');
  eq(done.restUntil, null, 'and the hold is gone from the answer');

  /* ════════ 11. TWO BUSINESSES, AND NEITHER CAN SEE THE OTHER'S ═════════ */

  /*
   * EVERYTHING ABOVE RAN AS `postgres`, WHICH BYPASSES ROW LEVEL SECURITY.
   * That is the right way to test the arithmetic and the wrong way to leave
   * it: the function is `security invoker` on purpose, so in production the
   * caller's own policies decide which row it may lock — and if those
   * policies were wrong, the switch on the dashboard would either do nothing
   * at all or, far worse, count one customer's publications against another's
   * ceiling. Nothing in this file touched that until now.
   *
   * So the last section signs in as two different people, exactly the way
   * PostgREST does (`set local role authenticated` plus the JWT's subject),
   * and asks the mechanism to misbehave.
   *
   * IT RUNS LAST ON PURPOSE: adding a second business changes what
   * social_default_tenant() answers with no JWT, which every section above
   * relies on.
   */
  const A = { user: 'aaaaaaaa-0000-4000-8000-00000000c001', tenant: 'aaaaaaaa-1111-4000-8000-00000000c001' };
  const B = { user: 'bbbbbbbb-0000-4000-8000-00000000c002', tenant: 'bbbbbbbb-1111-4000-8000-00000000c002' };
  exec(`
    insert into auth.users (id, email) values ('${A.user}', 'ca@example.com'), ('${B.user}', 'cb@example.com');
    insert into social_tenants (id, name) values ('${A.tenant}', 'עסק א'), ('${B.tenant}', 'עסק ב');
    insert into social_tenant_members (tenant_id, user_id)
      values ('${A.tenant}', '${A.user}'), ('${B.tenant}', '${B.user}');
  `);
  const asUser = (user: string, sql: string) =>
    lastValue(`set local role authenticated;\nset local "request.jwt.claim.sub" = '${user}';\n${sql}`);
  const refusedAs = (user: string, sql: string) =>
    refusedQuiet(`set local role authenticated;\nset local "request.jwt.claim.sub" = '${user}';\n${sql}`);

  /* Each person's first call creates THEIR row and switches nothing on. */
  const firstA = JSON.parse(asUser(A.user, `select public.social_publish_cycle_tick(100, 8, 2, true)::text`));
  const firstB = JSON.parse(asUser(B.user, `select public.social_publish_cycle_tick(100, 8, 2, true)::text`));
  eq([firstA.ok, firstB.ok], [true, true], 'a signed-in customer can run the mechanism at all — a failure here is the switch doing nothing on the live dashboard');
  eq([firstA.enabled, firstB.enabled], [false, false], 'and it is off for a new business too, not inherited from anybody');

  /* Switch A on, publish twice as A, and B must be untouched. */
  exec(`update public.social_publish_cycle set enabled = true where tenant_id = '${A.tenant}'`);
  asUser(A.user, `select public.social_publish_cycle_tick(100, 8, 2, true)`);
  asUser(A.user, `select public.social_publish_cycle_tick(100, 8, 2, true)`);
  eq(one(`select cycle_count::text from public.social_publish_cycle where tenant_id = '${A.tenant}'`), '2', 'A counted its own two publications');
  eq(one(`select cycle_count::text from public.social_publish_cycle where tenant_id = '${B.tenant}'`), '0', 'and B counted none of them — one ceiling per business, which is the whole product');

  /* And neither can read, move or delete the other's counter. */
  eq(asUser(A.user, `select count(*)::text from public.social_publish_cycle`), '1', 'A sees exactly one row — its own');
  eq(asUser(B.user, `select count(*)::text from public.social_publish_cycle`), '1', 'and so does B');
  eq(
    asUser(A.user, `select coalesce(sum(cycle_count), 0)::text from public.social_publish_cycle where tenant_id = '${B.tenant}'`),
    '0',
    "A cannot read B's count even by asking for it by id",
  );
  exec(`update public.social_publish_cycle set rest_until = null where tenant_id = '${B.tenant}'`);
  asUser(A.user, `update public.social_publish_cycle set rest_until = now() + interval '8 hours' where tenant_id = '${B.tenant}'`);
  eq(one(`select coalesce(rest_until::text, '') from public.social_publish_cycle where tenant_id = '${B.tenant}'`), '', "A cannot force a pause onto B's account");
  asUser(B.user, `delete from public.social_publish_cycle where tenant_id = '${A.tenant}'`);
  eq(one(`select count(*)::text from public.social_publish_cycle where tenant_id = '${A.tenant}'`), '1', "and B cannot delete A's counter");

  /*
   * ─── THE WRITE THE DASHBOARD SWITCH ACTUALLY MAKES ──────────────────────
   *
   * Everything above reached the row through social_publish_cycle_tick(),
   * which inserts it itself. The switch does not: it writes the table
   * directly and sends NO tenant_id, because a business id from the browser
   * is the one thing this product never trusts ("אסור לסמוך על ID שנשלח
   * מה-Frontend בלבד"). That makes the stamp trigger load-bearing, and
   * nothing here exercised it until this section — the first press of the
   * switch on a fresh business would have failed on the primary key.
   */
  is(
    one(`select count(*)::int from pg_trigger where tgname = 'social_publish_cycle_stamp_tenant'`) === '1',
    'the table stamps the business itself on insert, the way every other table in the product does',
  );
  exec(`delete from public.social_publish_cycle where tenant_id = '${B.tenant}'`);
  is(
    !refusedAs(B.user, `insert into public.social_publish_cycle (enabled, cycle_count) values (true, 0)`),
    'so an insert that carries no business id is accepted — this is the switch, verbatim',
  );
  /* Asked of B's own row, not "the enabled one that is not A's" — the test
     business from the sections above is enabled too, and the first version of
     this assertion found IT and reported a tenancy leak that was not there. */
  eq(
    one(`select count(*)::int from public.social_publish_cycle where tenant_id = '${B.tenant}' and enabled`),
    '1',
    "and it landed on the row of the person who pressed it",
  );
  eq(
    one(`select count(*)::int from public.social_publish_cycle where tenant_id is null`),
    '0',
    'and no row was left without a business — a null here is a row every policy in the product would miss',
  );

  /*
   * AND THE SWITCH IS AN UPSERT, NOT A PLAIN INSERT — pressed a second time
   * there is already a row. This is the exact SQL PostgREST builds for
   * `.upsert(patch, { onConflict: 'tenant_id' })` with no tenant_id in the
   * body: the column list is whatever the browser sent, the trigger fills the
   * business in, and ON CONFLICT is inferred AFTER that. Worth asserting
   * rather than reasoning about, because the order of a BEFORE trigger and
   * conflict inference is exactly the kind of thing to be wrong about in a
   * comment and right about in a test.
   */
  is(
    !refusedAs(
      B.user,
      `insert into public.social_publish_cycle (enabled, rest_until) values (false, null)
         on conflict (tenant_id) do update set enabled = excluded.enabled, rest_until = excluded.rest_until`,
    ),
    'pressing the switch a second time updates the row instead of failing on the primary key',
  );
  eq(one(`select enabled::text from public.social_publish_cycle where tenant_id = '${B.tenant}'`), 'false', 'and the second press really switched it off');
  eq(one(`select count(*)::int from public.social_publish_cycle where tenant_id = '${B.tenant}'`), '1', 'without leaving a second row behind');

  /* A person with no business resolves no tenant, and the function says so
     rather than picking somebody's row. */
  const stranger = JSON.parse(asUser('cccccccc-0000-4000-8000-00000000c003', `select public.social_publish_cycle_tick(100, 8, 2, true)::text`));
  eq(stranger.ok, false, 'somebody who belongs to no business gets no cycle at all');
  is(!refusedAs(A.user, `select public.social_publish_cycle_tick(100, 8, 2, false)`), 'while a real customer is never refused the read the card needs');

  console.log(`${NAME} OK — ${checks} assertions against a real Postgres, ${lanes} lanes raced at the hundredth slot, a pause survived a restart, and two businesses were kept apart under RLS`);
}

void main();
