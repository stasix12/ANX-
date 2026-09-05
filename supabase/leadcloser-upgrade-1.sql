-- LeadCloser AI — upgrade 1 (run after leadcloser-schema.sql; safe to re-run).
--
-- 1. Workspace creation as one atomic, SECURITY DEFINER call. The signed-in
--    user becomes the owner; nothing is inserted if any step fails, and RLS
--    subtleties of client-side upserts no longer apply.
-- 2. Optional WhatsApp template name per automation.

alter table public.lc_automations add column if not exists whatsapp_template text;

create or replace function public.lc_create_workspace(
  p_org jsonb,
  p_member jsonb,
  p_settings jsonb,
  p_subscription jsonb,
  p_services jsonb default '[]'::jsonb,
  p_rules jsonb default '[]'::jsonb,
  p_automations jsonb default '[]'::jsonb,
  p_sources jsonb default '[]'::jsonb
) returns text
language plpgsql security definer set search_path = public as $$
declare
  v_uid text := auth.uid()::text;
  v_org_id text := p_org->>'id';
begin
  if v_uid is null then
    raise exception 'not signed in';
  end if;
  if v_org_id is null or v_org_id = '' then
    raise exception 'organization id is required';
  end if;

  insert into public.lc_organizations
    select * from jsonb_populate_record(null::public.lc_organizations, p_org);

  insert into public.lc_organization_members (id, organization_id, user_id, email, full_name, role, worker_id)
  values (
    coalesce(p_member->>'id', 'mem_' || substr(md5(random()::text), 1, 12)),
    v_org_id,
    v_uid,
    coalesce(p_member->>'email', auth.jwt()->>'email', ''),
    coalesce(p_member->>'full_name', ''),
    'owner',
    null
  );

  insert into public.lc_ai_agent_settings
    select * from jsonb_populate_record(null::public.lc_ai_agent_settings, p_settings);
  insert into public.lc_subscriptions
    select * from jsonb_populate_record(null::public.lc_subscriptions, p_subscription);
  insert into public.lc_services
    select * from jsonb_populate_recordset(null::public.lc_services, p_services);
  insert into public.lc_pricing_rules
    select * from jsonb_populate_recordset(null::public.lc_pricing_rules, p_rules);
  insert into public.lc_automations
    select * from jsonb_populate_recordset(null::public.lc_automations, p_automations);
  insert into public.lc_lead_sources
    select * from jsonb_populate_recordset(null::public.lc_lead_sources, p_sources);

  return v_org_id;
end $$;

revoke all on function public.lc_create_workspace(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) from public;
grant execute on function public.lc_create_workspace(jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb, jsonb) to authenticated;
