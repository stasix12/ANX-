-- social-profiles — מעביר פרופיל פייסבוק מהמחשב אל worker בענן, פעם אחת.
--
-- WHAT THIS IS. A cloud container's volume starts empty, and a managed host
-- (Railway, Render) has no SSH to copy the browser profile into it. So the
-- dashboard uploads a zip of the profile here, and the worker downloads it on
-- its next start and DELETES it (worker/profile-import.ts). The bucket is a
-- courier, not a safe: in steady state it is empty.
--
-- WHY PRIVATE AND ROW-SCOPED. The zip IS the Facebook session — cookies,
-- device id, everything. Public read (like social-media has) would hand any
-- URL-holder a signed-in Facebook account. So: no public read, and every verb
-- is fenced to the caller's own folder (<uid>/...), the same wall the v16
-- tenancy work put around the tables.
--
-- Safe to run more than once.

insert into storage.buckets (id, name, public)
values ('social-profiles', 'social-profiles', false)
on conflict (id) do update set public = false;

drop policy if exists "social profiles own insert" on storage.objects;
create policy "social profiles own insert"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'social-profiles' and (storage.foldername(name))[1] = auth.uid()::text);

-- upsert = update of an existing object; without this a second upload fails
-- with a 409 the card cannot explain.
drop policy if exists "social profiles own update" on storage.objects;
create policy "social profiles own update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'social-profiles' and (storage.foldername(name))[1] = auth.uid()::text)
  with check (bucket_id = 'social-profiles' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "social profiles own read" on storage.objects;
create policy "social profiles own read"
  on storage.objects for select
  to authenticated
  using (bucket_id = 'social-profiles' and (storage.foldername(name))[1] = auth.uid()::text);

drop policy if exists "social profiles own delete" on storage.objects;
create policy "social profiles own delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'social-profiles' and (storage.foldername(name))[1] = auth.uid()::text);
