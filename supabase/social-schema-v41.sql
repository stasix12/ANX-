-- ──────────── v41 · מחזור פרסום: הפסקה אוטומטית אחרי 100 פרסומים ───────────
--
-- "כל 100 פרסומים מוצלחים בקבוצות פייסבוק תתחיל הפסקה של 8 שעות."
-- "ביממה של 24 שעות אפשר עד שתי סבבים (200) קבוצות ככה אנחנו בסדר."
--
-- A TABLE OF ITS OWN, AND NOT A FIELD ON social_settings.control.
--
-- The `control` row is read-modify-written whole by at least four writers —
-- worker/social-worker.ts:1045 (the thaw), src/lib/social/server/worker.ts:246
-- (the mid-loop re-read), src/lib/social/server/graph.ts:137 (setCooldown) and
-- the dashboard's own clear. Each reads the jsonb, spreads it and writes it
-- back. A counter living there would lose increments to whichever writer read
-- first, which is the lost-update bug commit b70bd67 exists about — and this
-- counter decides whether the owner's account gets limited by Facebook, so it
-- is the last number in this product that may be approximately right.
--
-- NOT A WINDOW QUERY EITHER. "count the rows published since the cycle began"
-- looks obvious and is wrong here: the confirmation sweep at
-- worker/social-worker.ts:4610 writes `published_at: row.published_at ||
-- row.claimed_at || ...`, BACKDATING a late confirmation into a window that
-- has already closed. The same window read twice returns different numbers.
-- So the count is a cursor that only ever moves forward, incremented once by
-- the publication that earned it.
--
-- TO UNDO: supabase/social-schema-v41-rollback.sql. It drops the function and
-- the table; nothing else in the product reads them, and with the table gone
-- the engine falls back to exactly the behaviour it has today.
-- ---------------------------------------------------------------------------
create table if not exists public.social_publish_cycle (
  tenant_id uuid primary key references public.social_tenants(id) on delete cascade,
  -- OFF BY DEFAULT. This is the feature flag: until the owner turns the card's
  -- switch on, social_publish_cycle_tick() counts nothing and holds nothing,
  -- so deploying this file changes no behaviour at all.
  enabled boolean not null default false,
  -- Publications inside the round that is running now. 0..limit-1.
  cycle_count integer not null default 0,
  -- Rounds completed inside the 24-hour window that began at window_started_at.
  rounds_in_window integer not null default 0,
  window_started_at timestamptz not null default now(),
  -- The hold itself. NULL, or an instant publishing may not resume before.
  rest_until timestamptz,
  -- When the current round began, for the card's own reading.
  cycle_started_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.social_publish_cycle enable row level security;

do $$
begin
  if to_regclass('public.social_tenant_members') is null then
    raise notice 'v41: אין עדיין חלוקה לעסקים — כללי ההרשאות של מחזור הפרסום לא נוצרו. הריצו קודם את החלק של v16.';
    return;
  end if;
  -- The same four names and the same shape as every other table here; see the
  -- long note above the v16 loop for why the names are reused rather than new.
  drop policy if exists "admin select" on public.social_publish_cycle;
  create policy "admin select" on public.social_publish_cycle for select to authenticated
    using (tenant_id in (select unnest(public.social_tenant_ids())));
  drop policy if exists "admin insert" on public.social_publish_cycle;
  create policy "admin insert" on public.social_publish_cycle for insert to authenticated
    with check (tenant_id in (select unnest(public.social_tenant_ids())));
  drop policy if exists "admin update" on public.social_publish_cycle;
  create policy "admin update" on public.social_publish_cycle for update to authenticated
    using (tenant_id in (select unnest(public.social_tenant_ids())))
    with check (tenant_id in (select unnest(public.social_tenant_ids())));
  drop policy if exists "admin delete" on public.social_publish_cycle;
  create policy "admin delete" on public.social_publish_cycle for delete to authenticated
    using (tenant_id in (select unnest(public.social_tenant_ids())));
end $$;

-- ─── AND THE TENANT STAMP, WHICHOUT WHICH THE SWITCH CANNOT BE PRESSED ────
--
-- Every tenant-scoped table in this product gets `social_stamp_tenant` as a
-- BEFORE INSERT trigger, created by the v16 loop over its own list of tables.
-- This table was added after that list and is therefore not in it — so an
-- insert that does not carry tenant_id fails on the primary key, which is
-- exactly what the dashboard's switch does: it must not send a business id
-- from the browser ("אסור לסמוך על ID שנשלח מה-Frontend בלבד"), so it sends
-- none and the database decides whose row it is.
--
-- FOUND BY READING THE DIFF, not by a test: every path in the suite reached
-- the row through social_publish_cycle_tick(), which inserts it itself, so
-- nothing ever exercised a plain insert. The first press of the switch on a
-- fresh business would have thrown.
do $$
begin
  if to_regproc('public.social_stamp_tenant') is null then
    raise notice 'v41: אין עדיין פונקציית שיוך לעסק — הריצו קודם את החלק של v16.';
    return;
  end if;
  drop trigger if exists social_publish_cycle_stamp_tenant on public.social_publish_cycle;
  create trigger social_publish_cycle_stamp_tenant
    before insert on public.social_publish_cycle
    for each row execute function public.social_stamp_tenant();
end $$;

drop trigger if exists social_publish_cycle_set_updated_at on public.social_publish_cycle;
create trigger social_publish_cycle_set_updated_at
  before update on public.social_publish_cycle
  for each row execute function public.set_updated_at();

-- ─────────── the one write, and the only place the ceiling is decided ──────
--
-- `select … for update` IS THE LOCK, and it is why this is a database function
-- rather than four lines in the worker. The brief asks for "נעילה אטומית או
-- מנגנון שקול כדי למנוע מעבר של מכסת 100 הפרסומים עקב עבודה מקבילה", and the
-- only primitive the app layer has is a compare-and-set on a row it read a
-- moment ago — which two lanes can both lose, or both win, depending on
-- timing. Here the second caller BLOCKS on the first caller's row lock until
-- its transaction commits, then reads the number the first one wrote. There
-- is no interleaving to get wrong.
--
-- IT IS CALLED ONCE PER PUBLICATION AND RETURNS THE WHOLE STATE, so the worker
-- never has to read the row separately and never computes the ceiling itself —
-- one decision, one place, whichever machine is publishing.
--
-- `security invoker` ON PURPOSE: the caller's own RLS decides which row this
-- can touch, exactly as it does for every other write in the product. A
-- definer function here would be a hole through tenancy for the sake of a
-- counter.
create or replace function public.social_publish_cycle_tick(
  p_limit integer default 100,
  p_rest_hours integer default 8,
  p_rounds_per_window integer default 2,
  p_count boolean default true
)
  returns jsonb
  language plpgsql
  security invoker
  set search_path = public
as $$
declare
  me uuid := public.social_default_tenant();
  row public.social_publish_cycle;
  now_ timestamptz := now();
  rest_candidate timestamptz;
  /*
   * WHICH CALL CLOSED THE ROUND, and it has to be said out loud rather than
   * inferred from `restUntil`. Every caller that arrives during a hold also
   * carries a restUntil — it is reporting the hold, not causing it — so
   * "did this publication start the pause" is unanswerable from the outside.
   * The worker needs it to write ONE log line per pause instead of one per
   * publication, and the concurrency test needs it to tell one winner from
   * seven lanes that merely saw the winner's work.
   */
  crossed boolean := false;
begin
  if me is null then
    -- No single business to act for. Say so rather than guessing one: the
    -- worker treats a null tenant as "the mechanism is not configured" and
    -- publishes exactly as it did before this file ran.
    return jsonb_build_object('ok', false, 'crossed', false, 'reason', 'no-tenant');
  end if;

  insert into public.social_publish_cycle (tenant_id) values (me) on conflict (tenant_id) do nothing;
  select * into row from public.social_publish_cycle where tenant_id = me for update;

  if not row.enabled then
    -- THE FEATURE FLAG, read inside the lock. Off: nothing is counted and
    -- nothing is held, and the row is left exactly as it was so turning the
    -- switch on later starts from a clean round rather than a stale one.
    return jsonb_build_object(
      'ok', true, 'enabled', false, 'crossed', false, 'count', row.cycle_count, 'limit', p_limit,
      'restUntil', null, 'resting', false, 'roundsInWindow', row.rounds_in_window
    );
  end if;

  -- THE 24-HOUR WINDOW ROLLS FIRST, so a round that completes just after the
  -- window turns over is the first of the new window and not the third of the
  -- old one.
  if now_ - row.window_started_at >= interval '24 hours' then
    row.window_started_at := now_;
    row.rounds_in_window := 0;
  end if;

  -- A hold that has expired is cleared HERE, on the first call past the
  -- instant, so the worker never has to write this row to resume.
  if row.rest_until is not null and row.rest_until <= now_ then
    row.rest_until := null;
  end if;

  if p_count and row.rest_until is null then
    row.cycle_count := row.cycle_count + 1;
    if row.cycle_count >= p_limit then
      row.cycle_count := 0;
      row.rounds_in_window := row.rounds_in_window + 1;
      row.cycle_started_at := now_;
      rest_candidate := now_ + make_interval(hours => p_rest_hours);
      -- AND THE SECOND CEILING, which is the owner's own number: "ביממה של 24
      -- שעות אפשר עד שתי סבבים (200)". Eight hours alone is not enough to
      -- guarantee it — at the fast end of his measured pace (31/hour) a round
      -- takes 3.2 hours, so a cycle is 11.2 hours and a third round starts
      -- inside the day. When the window's rounds are spent, the hold runs to
      -- the end of the window instead, whichever is later.
      if row.rounds_in_window >= p_rounds_per_window then
        rest_candidate := greatest(rest_candidate, row.window_started_at + interval '24 hours');
      end if;
      row.rest_until := rest_candidate;
      crossed := true;
    end if;
  end if;

  update public.social_publish_cycle set
    cycle_count = row.cycle_count,
    rounds_in_window = row.rounds_in_window,
    window_started_at = row.window_started_at,
    cycle_started_at = row.cycle_started_at,
    rest_until = row.rest_until
  where tenant_id = me;

  return jsonb_build_object(
    'ok', true,
    'enabled', true,
    'crossed', crossed,
    'count', row.cycle_count,
    'limit', p_limit,
    'restUntil', row.rest_until,
    -- THE SERVER'S OWN VERDICT ON WHETHER IT IS HOLDING, and the reason it is
    -- here rather than worked out by the caller: "שינוי שעה במערכת (Clock
    -- change) לא משבש את ההפסקה". The expiry above was just applied against
    -- THIS server's now(), so a non-null instant at this point means the hold
    -- is in force — a fact, not a comparison the agent's PC clock could get
    -- wrong by hours. The engine gate trusts this; the card's countdown is
    -- still drawn from restUntil, because digits have to move once a second.
    'resting', row.rest_until is not null,
    'roundsInWindow', row.rounds_in_window,
    'roundsPerWindow', p_rounds_per_window,
    'windowStartedAt', row.window_started_at,
    'cycleStartedAt', row.cycle_started_at
  );
end
$$;

grant execute on function public.social_publish_cycle_tick(integer, integer, integer, boolean) to authenticated, service_role;

do $$
begin
  raise notice 'v41: מחזור הפרסום קיים והמנגנון כבוי (enabled=false). הוא לא סופר ולא עוצר דבר עד שהמתג בלוח הבקרה נדלק.';
end $$;
