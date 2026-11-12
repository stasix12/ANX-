-- ─── v42 ROLLBACK · להחזיר את ההפסקה לזמן שננעל ברגע סגירת הסבב ───────────
--
-- מחזיר את הפונקציה למצב של v41: זמן סיום ההפסקה מחושב פעם אחת כשהסבב נסגר
-- ולא משתנה אחר כך. שינוי אורך ההפסקה יחול שוב רק על ההפסקה הבאה.
--
-- הטבלה, ההרשאות והנתונים לא נוגעים. הפסקה שכבר רצה נשארת כפי שהיא כרגע.
-- ---------------------------------------------------------------------------

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
  -- instant, so the worker never has to write this row to resume. A hold the
  -- block above just brought into the past is cleared by this same line.
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
  raise notice 'v42 rollback: זמן ההפסקה שוב ננעל ברגע סגירת הסבב.';
end $$;
