-- ============================================================================
-- UNDO v18 — leads, CRM settings and products go back to "anyone who can sign
-- in". Only worth doing if a CRM screen went blank and has to work tonight;
-- while it is in effect, anybody with an account can read every lead.
-- ============================================================================
do $$
begin
  if to_regclass('public.leads') is not null then
    execute $f$
      drop policy if exists "admin read leads" on public.leads;
      create policy "admin read leads" on public.leads for select to authenticated using (true);
      drop policy if exists "admin insert leads" on public.leads;
      create policy "admin insert leads" on public.leads for insert to authenticated with check (true);
      drop policy if exists "admin update leads" on public.leads;
      create policy "admin update leads" on public.leads for update to authenticated using (true) with check (true);
      drop policy if exists "admin delete leads" on public.leads;
      create policy "admin delete leads" on public.leads for delete to authenticated using (true);
    $f$;
  end if;
  if to_regclass('public.crm_settings') is not null then
    execute $f$
      drop policy if exists "admin read settings" on public.crm_settings;
      create policy "admin read settings" on public.crm_settings for select to authenticated using (true);
      drop policy if exists "admin write settings" on public.crm_settings;
      create policy "admin write settings" on public.crm_settings for insert to authenticated with check (true);
      drop policy if exists "admin update settings" on public.crm_settings;
      create policy "admin update settings" on public.crm_settings for update to authenticated using (true) with check (true);
      drop policy if exists "admin delete settings" on public.crm_settings;
      create policy "admin delete settings" on public.crm_settings for delete to authenticated using (true);
    $f$;
  end if;
  if to_regclass('public.products') is not null then
    execute $f$
      drop policy if exists "admin read all" on public.products;
      create policy "admin read all" on public.products for select to authenticated using (true);
      drop policy if exists "admin insert" on public.products;
      create policy "admin insert" on public.products for insert to authenticated with check (true);
      drop policy if exists "admin update" on public.products;
      create policy "admin update" on public.products for update to authenticated using (true) with check (true);
      drop policy if exists "admin delete" on public.products;
      create policy "admin delete" on public.products for delete to authenticated using (true);
    $f$;
  end if;
  execute $f$
    drop policy if exists "product images admin write" on storage.objects;
    create policy "product images admin write" on storage.objects for insert to authenticated
      with check (bucket_id = 'product-images');
    drop policy if exists "product images admin update" on storage.objects;
    create policy "product images admin update" on storage.objects for update to authenticated
      using (bucket_id = 'product-images') with check (bucket_id = 'product-images');
    drop policy if exists "product images admin delete" on storage.objects;
    create policy "product images admin delete" on storage.objects for delete to authenticated
      using (bucket_id = 'product-images');
  $f$;
  raise notice 'הלידים, ה-CRM והחנות חזרו להיות פתוחים לכל מי שמחובר.';
end $$;
