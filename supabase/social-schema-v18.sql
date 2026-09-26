-- ============================================================================
-- v18 — THE OTHER TWO MODULES. Leads, products and CRM settings stop being
-- visible to everyone who can sign in.
--
-- v16 fixed the publishing tables. It did not touch the three that belong to
-- the other halves of this app, and they carry the same `using (true)`:
--
--   public.leads         — every enquiry: name, phone, what they asked for.
--   public.crm_settings  — the CRM's key/value store, Facebook Ads credentials
--                          among them.
--   public.products      — the storefront, hidden rows included.
--
-- supabase/schema.sql says so in its own words: "There is no public sign-up
-- flow in this project — admin accounts are created by hand, so 'authenticated'
-- here always means an admin." That sentence is true today and stops being
-- true the day a customer can sign up. On that day, without this file, the
-- first customer to sign in can read every lead this business has ever taken.
--
-- These three tables are NOT multi-tenant and are not being made multi-tenant:
-- they are one business's CRM and one business's shop, and a customer of the
-- publishing product has no business in either. So the rule is simpler than
-- v16's — not "your business's rows" but "the owner of this app, or nobody".
--
-- WHAT DOES NOT CHANGE: the storefront's public read of published products
-- stays exactly as it was (`to anon using (published = true)`), because that
-- is the shop working, and the owner is a member of the owning business, so
-- every CRM and admin screen keeps behaving identically.
--
-- IT SKIPS ITSELF if there is no owning business to point at. Same discipline
-- as v16: it would rather leave a door open than lock the owner out of their
-- own leads.
--
-- Safe to run again. TO UNDO: supabase/social-schema-v18-rollback.sql
-- ============================================================================

-- WHICH BUSINESS IS THE OWNER'S. Marked rather than inferred: "the oldest row"
-- is true today and would quietly become false the first time these rows are
-- restored from a backup in a different order.
alter table public.social_tenants
  add column if not exists is_app_owner boolean not null default false;

comment on column public.social_tenants.is_app_owner is
  'True for the business that owns this installation — the one whose CRM, leads and storefront live here. Exactly one row should have it.';

-- The first business created is the owner's; every later one is a customer.
update public.social_tenants set is_app_owner = true
where id = (select id from public.social_tenants order by created_at, id limit 1)
  and not exists (select 1 from public.social_tenants where is_app_owner);

-- Is the person asking a member of the owning business?
--
-- SECURITY DEFINER for the same reason as social_tenant_ids(): it is called
-- from inside a policy on some other table and has to read the membership
-- table without that table's own rule getting in the way. It takes no
-- arguments, so it can only ever answer about the caller.
create or replace function public.social_is_app_owner()
  returns boolean
  language sql
  stable
  security definer
  set search_path = public
as $$
  select exists (
    select 1
    from public.social_tenant_members m
    join public.social_tenants t on t.id = m.tenant_id
    where m.user_id = auth.uid() and t.is_app_owner
  )
$$;

grant execute on function public.social_is_app_owner() to authenticated, service_role;

do $$
declare
  t text;
  owner_exists boolean;
begin
  select exists (select 1 from public.social_tenants where is_app_owner) into owner_exists;
  if not owner_exists then
    raise notice 'אין עסק מסומן כבעל המערכת — ההרשאות של הלידים, המוצרים וה-CRM לא הוחלפו, בכוונה.';
    return;
  end if;
  if not exists (select 1 from public.social_tenant_members m
                 join public.social_tenants t on t.id = m.tenant_id where t.is_app_owner) then
    raise notice 'אף משתמש לא משויך לעסק של בעל המערכת — ההרשאות לא הוחלפו, בכוונה.';
    return;
  end if;

  -- leads
  if to_regclass('public.leads') is not null then
    execute $f$
      drop policy if exists "admin read leads" on public.leads;
      create policy "admin read leads" on public.leads for select to authenticated
        using (public.social_is_app_owner());
      drop policy if exists "admin insert leads" on public.leads;
      create policy "admin insert leads" on public.leads for insert to authenticated
        with check (public.social_is_app_owner());
      drop policy if exists "admin update leads" on public.leads;
      create policy "admin update leads" on public.leads for update to authenticated
        using (public.social_is_app_owner()) with check (public.social_is_app_owner());
      drop policy if exists "admin delete leads" on public.leads;
      create policy "admin delete leads" on public.leads for delete to authenticated
        using (public.social_is_app_owner());
    $f$;
  end if;

  -- crm_settings
  if to_regclass('public.crm_settings') is not null then
    execute $f$
      drop policy if exists "admin read settings" on public.crm_settings;
      create policy "admin read settings" on public.crm_settings for select to authenticated
        using (public.social_is_app_owner());
      drop policy if exists "admin write settings" on public.crm_settings;
      create policy "admin write settings" on public.crm_settings for insert to authenticated
        with check (public.social_is_app_owner());
      drop policy if exists "admin update settings" on public.crm_settings;
      create policy "admin update settings" on public.crm_settings for update to authenticated
        using (public.social_is_app_owner()) with check (public.social_is_app_owner());
      drop policy if exists "admin delete settings" on public.crm_settings;
      create policy "admin delete settings" on public.crm_settings for delete to authenticated
        using (public.social_is_app_owner());
    $f$;
  end if;

  -- products. The anon read of published rows is deliberately left alone — it
  -- is the shop, and it was never the leak.
  if to_regclass('public.products') is not null then
    execute $f$
      drop policy if exists "admin read all" on public.products;
      create policy "admin read all" on public.products for select to authenticated
        using (public.social_is_app_owner());
      drop policy if exists "admin insert" on public.products;
      create policy "admin insert" on public.products for insert to authenticated
        with check (public.social_is_app_owner());
      drop policy if exists "admin update" on public.products;
      create policy "admin update" on public.products for update to authenticated
        using (public.social_is_app_owner()) with check (public.social_is_app_owner());
      drop policy if exists "admin delete" on public.products;
      create policy "admin delete" on public.products for delete to authenticated
        using (public.social_is_app_owner());
    $f$;
  end if;

  -- The storefront's photo bucket: public read stays, writing becomes the
  -- owner's. A customer of the publishing product has no reason to upload a
  -- product photo, and every reason not to be able to replace one.
  execute $f$
    drop policy if exists "product images admin write" on storage.objects;
    create policy "product images admin write" on storage.objects for insert to authenticated
      with check (bucket_id = 'product-images' and public.social_is_app_owner());
    drop policy if exists "product images admin update" on storage.objects;
    create policy "product images admin update" on storage.objects for update to authenticated
      using (bucket_id = 'product-images' and public.social_is_app_owner())
      with check (bucket_id = 'product-images' and public.social_is_app_owner());
    drop policy if exists "product images admin delete" on storage.objects;
    create policy "product images admin delete" on storage.objects for delete to authenticated
      using (bucket_id = 'product-images' and public.social_is_app_owner());
  $f$;

  raise notice 'הלידים, ה-CRM והחנות שייכים מעכשיו רק לעסק של בעל המערכת.';
end $$;

select
  case when (select count(*) from pg_policies
               where schemaname = 'public' and tablename in ('leads', 'crm_settings', 'products')
                 and roles::text like '%authenticated%' and (qual = 'true' or with_check = 'true')) > 0
       then 'פתוח — כל מי שמחובר רואה את הלידים' else 'רק בעל המערכת' end as "לידים, CRM וחנות",
  (select count(*) from public.social_tenants where is_app_owner) as "עסקים מסומנים כבעלים";
