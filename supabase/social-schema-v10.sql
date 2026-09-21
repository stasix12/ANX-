-- v10 — let a stored picture be REPLACED, not only created.
--
-- social-schema.sql gave the social-media bucket three policies: public read,
-- authenticated insert, authenticated delete. No update. Supabase Storage's
-- upsert is an insert that turns into an UPDATE the moment the object already
-- exists, so every re-upload to a path that had been written once failed with
-- "new row violates row-level security policy".
--
-- It surfaced on the worker's Facebook avatar, which is written to a stable
-- path (workers/<id>.png) precisely so the dashboard cannot keep showing the
-- previous owner's face — the second write is the whole point, and it was the
-- one the policies forbade. The same wall sits under group pictures
-- (groups/<id>.png): a group that changed its photo could never show the new
-- one, and that failure was swallowed silently.
--
-- Read stays public because Facebook and the dashboard both fetch these by
-- URL. Writing stays limited to a signed-in user, exactly as before; this adds
-- the one verb that was missing, and nothing else.
--
-- Safe to run more than once.

drop policy if exists "social media admin update" on storage.objects;
create policy "social media admin update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'social-media')
  with check (bucket_id = 'social-media');
