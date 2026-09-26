-- ============================================================================
-- UNDO v17 — narrow the four uniqueness rules back to "unique in the whole
-- database".
--
-- IT WILL REFUSE IF THERE IS MORE THAN ONE BUSINESS, and that refusal is the
-- point: with two businesses the narrow rules are not merely wrong, they are
-- unsatisfiable — two customers legitimately share a group, a settings key, a
-- PC name. Going back would mean deleting one of them, and nothing here
-- deletes anything. Narrow down to one business first, or stay where you are.
-- ============================================================================
do $$
declare tenants bigint;
begin
  select count(*) into tenants from public.social_tenants;
  if tenants > 1 then
    raise notice 'יש % עסקים — אי אפשר לצמצם את כללי הייחודיות בחזרה בלי למחוק נתונים. לא בוצע כלום.', tenants;
    return;
  end if;

  create unique index if not exists social_targets_channel_external_idx
    on public.social_targets (channel, external_id) where external_id <> '';
  drop index if exists public.social_targets_tenant_channel_external_idx;

  alter table public.social_workers drop constraint if exists social_workers_name_key;
  alter table public.social_workers add constraint social_workers_name_key unique (name);
  drop index if exists public.social_workers_tenant_name_idx;

  alter table public.social_accounts drop constraint if exists social_accounts_provider_provider_user_id_key;
  alter table public.social_accounts add constraint social_accounts_provider_provider_user_id_key unique (provider, provider_user_id);
  drop index if exists public.social_accounts_tenant_provider_user_idx;

  alter table public.social_settings drop constraint if exists social_settings_pkey;
  alter table public.social_settings add primary key (key);

  raise notice 'כללי הייחודיות צומצמו בחזרה לכל המערכת.';
end $$;
