-- ============================================================================
-- v19 — A NEW CUSTOMER GETS A BUSINESS OF THEIR OWN.
--
-- v16 made every row belong to a business and hid every row from anyone who is
-- not a member of one. That is correct, and it left a hole nobody could see:
-- NOTHING ANYWHERE CREATES A BUSINESS. Not one file under src/ or worker/
-- writes to social_tenants or social_tenant_members — I checked before writing
-- this. So a new customer signs in perfectly, and lands on a dashboard with
-- nothing on it and no explanation, and every row they try to create fails on
-- a NOT NULL they will never see.
--
-- Until now the answer was hand-written SQL per customer. This is the answer.
--
-- WHY A FUNCTION AND NOT A SERVER ROUTE. A route would need the service-role
-- key, which bypasses every policy in this database — the one key that must
-- never be near a signup path. A `security definer` function can do exactly
-- one thing and nothing else, and what it can do is written here in twenty
-- lines that anybody can read.
--
-- WHY IT CANNOT BE ABUSED. It ignores everything the caller says about WHO
-- they are: the member row it writes is always auth.uid(), never an argument.
-- And it refuses outright if the caller already belongs to a business, so it
-- is not a way to make a thousand workspaces or to join an existing one — the
-- membership table stays writable only from here, and only for yourself, and
-- only once.
--
-- FOR THE OWNER, NOTHING HAPPENS. You already belong to a business, so the
-- first check returns it and the function does nothing at all.
--
-- Safe to run again.
-- TO UNDO: drop function if exists public.social_claim_workspace(text);
-- ============================================================================

create or replace function public.social_claim_workspace(business_name text default '')
  returns uuid
  language plpgsql
  volatile
  security definer
  set search_path = public
as $$
declare
  me uuid := auth.uid();
  mine uuid;
  fresh uuid;
begin
  /*
   * A signed-in person, or nobody. The service role has no auth.uid(), and a
   * workspace created with no owner would be a workspace nobody can ever
   * reach — and one more row for the next person's query to trip over.
   */
  if me is null then
    raise exception 'social_claim_workspace requires a signed-in user';
  end if;

  /* Already has one: hand it back. Idempotent, so the app may call this on
     every start without thinking about it. */
  select tenant_id into mine from public.social_tenant_members where user_id = me limit 1;
  if mine is not null then
    return mine;
  end if;

  /*
   * The empty string, NOT null. social_tenants.name is `not null default ''`,
   * and a nullif() here turned "the app did not ask for a name yet" into a
   * constraint violation on the very path the app uses — found by running the
   * real call rather than a convenient one. The name is filled in later from
   * the business settings screen.
   */
  insert into public.social_tenants (name)
  values (btrim(coalesce(business_name, '')))
  returning id into fresh;

  insert into public.social_tenant_members (tenant_id, user_id) values (fresh, me);

  /*
   * THE DEFAULTS, or the first screen they open is an empty settings page and
   * the planner has no limits to obey. Copied from the same seed
   * social-schema.sql writes for a fresh install, kept here rather than
   * referenced so that a customer created today gets what today's app expects.
   */
  insert into public.social_settings (tenant_id, key, value) values
    (fresh, 'limits',  '{"maxPerDay": 6, "maxPerTargetPerDay": 2, "minGapMinutes": 45, "dedupeDays": 14}'::jsonb),
    (fresh, 'control', '{"paused": false, "rateLimitedUntil": null}'::jsonb),
    (fresh, 'business','{"name": "", "phone": "", "whatsapp": "", "cities": [], "services": []}'::jsonb),
    (fresh, 'browser', '{"debugMode": false, "testMode": false, "requireConfirmation": false, "concurrentJobs": 1, "maxPerCampaignPerDay": 8, "groupMinGapMinutes": 20}'::jsonb)
  on conflict do nothing;

  return fresh;
end
$$;

/*
 * EXECUTE for signed-in people only, and explicitly revoked from everybody
 * else. Postgres grants EXECUTE to PUBLIC by default, which on Supabase means
 * PostgREST would expose this as an RPC an anonymous caller could reach — and
 * while it would refuse them (auth.uid() is null), a function that creates
 * rows should not be reachable by someone with no account at all.
 */
revoke execute on function public.social_claim_workspace(text) from public;
grant execute on function public.social_claim_workspace(text) to authenticated;

comment on function public.social_claim_workspace(text) is
  'Creates the caller''s own business the first time they sign in, with default settings, and returns it. Returns the existing one if they already have it. Never creates a second.';
