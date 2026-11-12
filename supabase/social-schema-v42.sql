-- ─── v42 · ההפסקה שרצה עכשיו מתעדכנת לפי אורך ההפסקה המוגדר ────────────────
--
-- "אני רוצה שההשהיה בין סבב לסבב של 100 קבוצות יהיה 6 שעות ולא 8 כמו עכשיו.
--  ואת הפרסום שרץ עכשיו גם שיהיה לפי המספרים האלה."
--
-- עד כה זמן הסיום של ההפסקה חושב פעם אחת, ברגע שהסבב נסגר, ולא השתנה אחר כך.
-- לכן קיצור ההפסקה השפיע רק על ההפסקה הבאה, והבעלים נשאר תקוע בתוך ההפסקה
-- הארוכה שכבר רצה. v42 מחשב אותו מחדש בכל קריאה, מרגע סגירת הסבב.
--
-- שתי תכונות שומרות על זה:
--   · רק מקצר, אף פעם לא מאריך. שינוי הגדרה יכול להקדים הפסקה, לא לדחות אותה.
--   · תקרת שני הסבבים ביממה נשארת רצפה מוחלטת — קיצור ההפסקה לא יכול לקנות
--     סבב שלישי ביום.
--
-- זה קובץ אחד, בטוח להריץ פעמיים (create or replace). הוא לא נוגע בטבלה,
-- בהרשאות או בנתונים — רק מחליף את הפונקציה.
--
-- לביטול: supabase/social-schema-v42-rollback.sql
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

  -- ─── v42 · A HOLD IN FORCE FOLLOWS A PAUSE THAT WAS SHORTENED ───────────
  --
  -- "אני רוצה שההשהיה בין סבב לסבב של 100 קבוצות יהיה 6 שעות ולא 8 כמו עכשיו.
  --  ואת הפרסום שרץ עכשיו גם שיהיה לפי המספרים האלה."
  --
  -- Before this, the instant was computed once when the round closed and was
  -- then immutable: shortening the pause changed the NEXT hold and left the
  -- running one at its old length. That is defensible — and it is not what
  -- the owner means when he shortens a pause while sitting inside one.
  --
  -- SO IT IS RE-COMPUTED FROM THE MOMENT THE ROUND CLOSED, every call, with
  -- the pause this caller is configured with. Two properties make it safe:
  --
  --   · ONLY EVER SHORTER (`least`). A configuration change can bring a hold
  --     forward, never push it out. That is what makes it monotone: a fleet
  --     running two versions converges on the shorter pause instead of
  --     flipping the instant back and forth on the owner's screen every time
  --     a different caller ticks. Raising the pause takes effect on the next
  --     round, which is the only direction where waiting costs nothing.
  --
  --   · THE DAY'S CEILING IS A FLOOR HERE. When the window's rounds are
  --     spent, the candidate is still pushed out to the end of the 24-hour
  --     window exactly as it was when the hold was created — so shortening
  --     the pause CANNOT buy a third round in a day. That is the property
  --     that actually protects the account, and it is asserted on its own in
  --     worker/test/cycle-db.test.ts.
  if row.rest_until is not null then
    rest_candidate := row.cycle_started_at + make_interval(hours => p_rest_hours);
    if row.rounds_in_window >= p_rounds_per_window then
      rest_candidate := greatest(rest_candidate, row.window_started_at + interval '24 hours');
    end if;
    row.rest_until := least(row.rest_until, rest_candidate);
    -- AND THE CEILING IS RE-IMPOSED, not merely preserved. `least` above can
    -- only keep a hold that is already shorter than the candidate — so a row
    -- whose rest_until sits BELOW the end of a spent window (a hand-edited
    -- row, a row written by an older version, a repair run by somebody at
    -- three in the morning) would have kept that shorter hold and released a
    -- third round inside the day. Caught by the test, not by reading: the
    -- first version of this block passed `least` alone and the ceiling
    -- assertion failed by exactly the ten minutes the fixture was off by.
    if row.rounds_in_window >= p_rounds_per_window then
      row.rest_until := greatest(row.rest_until, row.window_started_at + interval '24 hours');
    end if;
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
  raise notice 'v42: ההפסקה שרצה עכשיו תתעדכן לאורך ההפסקה המוגדר במנוע, בסבב הבא שלו. רק מקצר, ותקרת שני הסבבים ביממה נשמרת.';
end $$;
