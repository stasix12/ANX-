-- ============================================================================
-- social-storage-tenancy.sql — THE FILES, which the table lockdown did not
-- reach.
--
-- Run AFTER supabase/social-latest.sql. Safe to run again.
--
-- WHAT WAS WRONG.
--
-- v16 scoped every TABLE to the business that owns the row. Storage is not a
-- table in `public`, so none of it applied, and both buckets kept the rules
-- they were born with:
--
--   social-debug   — read: bucket_id = 'social-debug'. That is "any signed-in
--                    person may read every object in this bucket", and the
--                    bucket holds SCREENSHOTS OF A LOGGED-IN FACEBOOK SESSION:
--                    what Facebook showed when it asked for a code, what the
--                    page looked like when a comment failed. No path has to be
--                    guessed — the API will list them. This is the most
--                    sensitive thing in the system and it was the least
--                    protected.
--
--   social-media   — update and delete: bucket_id = 'social-media'. Any
--                    signed-in person could overwrite or delete another
--                    business's post images.
--
-- WHAT THIS CHANGES, and what it deliberately does not.
--
--   social-debug   — read, insert and delete become "objects belonging to
--                    somebody in one of MY businesses". Private bucket, read
--                    through signed URLs the owner asks for, so nothing in the
--                    app has to change.
--
--   social-media   — update and delete become the same. READ STAYS PUBLIC, on
--                    purpose and with eyes open: every image's public URL is
--                    stored in social_queue and social_variants, the worker
--                    fetches it by that URL to hand the file to Facebook, and
--                    the dashboard renders it. Making the bucket private today
--                    breaks every post that already exists. What that means is
--                    worth saying plainly rather than burying: THESE IMAGES ARE
--                    READABLE BY ANYONE, and they are the pictures the business
--                    publishes into public Facebook groups. Closing it properly
--                    means signed URLs everywhere an image is rendered, which
--                    is a change to make on a calm day, not next to a
--                    lockdown.
--
-- OWNERSHIP RATHER THAN PATH. Scoping by a tenant-shaped path prefix would be
-- the tidier design and would require moving 600 existing objects and changing
-- every upload path in the app. `owner` is already on every row — 176 of 176
-- and 428 of 428 on the live database, none null — and it is set by Storage
-- itself at upload, which is to say by the session that uploaded. So the rule
-- can be written today and read correctly by every object already there.
--
-- TO UNDO: re-run supabase/social-schema-v2.sql (debug) and the v10 block of
-- social-latest.sql (media update), which recreate the open rules under these
-- same names.
-- ============================================================================

-- ---------------------------------------------------------------------------
-- 1. THE PEOPLE IN MY BUSINESSES.
--
-- social_tenant_ids() answers "which businesses am I in". A storage object
-- does not carry a business — it carries the person who uploaded it — so the
-- question here is one step further out: which PEOPLE are in those businesses.
--
-- SECURITY DEFINER for the same reason as social_tenant_ids(): it is called
-- from inside a policy on storage.objects and must read the membership table
-- without that table's own rule getting in the way. It takes no arguments and
-- can only ever answer about auth.uid(), so the caller cannot ask it about
-- somebody else.
-- ---------------------------------------------------------------------------
create or replace function public.social_tenant_user_ids()
  returns uuid[]
  language sql
  stable
  security definer
  set search_path = public
as $$
  select coalesce(array_agg(distinct m.user_id), '{}'::uuid[])
  from public.social_tenant_members m
  where m.tenant_id in (select unnest(public.social_tenant_ids()))
$$;

revoke execute on function public.social_tenant_user_ids() from public;
grant execute on function public.social_tenant_user_ids() to authenticated, service_role;

comment on function public.social_tenant_user_ids() is
  'Every user who shares a business with the caller. Used by the storage policies, which scope by uploader because a storage object has no tenant_id.';

-- ---------------------------------------------------------------------------
-- 2. social-debug — THE SCREENSHOTS. Fully scoped, all three verbs.
--
-- The same policy NAMES v2 used, because Postgres OR-s permissive policies
-- together: a rule added under a new name would sit beside the open one and
-- the open one would win every time.
-- ---------------------------------------------------------------------------
drop policy if exists "social debug admin read" on storage.objects;
create policy "social debug admin read"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'social-debug'
    and owner in (select unnest(public.social_tenant_user_ids()))
  );

/* Insert stays "any signed-in person", and is not a hole: Storage sets `owner`
   to the uploading session itself, so an insert can only ever create an object
   the uploader owns. The read rule above is what decides who sees it. */
drop policy if exists "social debug admin write" on storage.objects;
create policy "social debug admin write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'social-debug');

drop policy if exists "social debug admin delete" on storage.objects;
create policy "social debug admin delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'social-debug'
    and owner in (select unnest(public.social_tenant_user_ids()))
  );

/* v2 never created an update rule for this bucket, so re-uploading to a path
   that already exists fails — Storage's upsert becomes an UPDATE. Added here
   scoped, rather than left as the next silent failure. */
drop policy if exists "social debug admin update" on storage.objects;
create policy "social debug admin update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'social-debug'
    and owner in (select unnest(public.social_tenant_user_ids()))
  )
  with check (bucket_id = 'social-debug');

-- ---------------------------------------------------------------------------
-- 3. social-media — WRITES SCOPED, READ LEFT PUBLIC ON PURPOSE.
--
-- The read policy is not touched by this file. See the header: the stored URLs
-- are public ones and the app fetches them.
-- ---------------------------------------------------------------------------
drop policy if exists "social media admin update" on storage.objects;
create policy "social media admin update"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'social-media'
    and owner in (select unnest(public.social_tenant_user_ids()))
  )
  with check (bucket_id = 'social-media');

drop policy if exists "social media admin delete" on storage.objects;
create policy "social media admin delete"
  on storage.objects for delete
  to authenticated
  using (
    bucket_id = 'social-media'
    and owner in (select unnest(public.social_tenant_user_ids()))
  );

-- ---------------------------------------------------------------------------
-- 4. WHAT IT LOOKS LIKE NOW. One row, readable on a phone.
--
-- "קבצים שלכם" should equal every object you have — if it does not, an object
-- was uploaded by a session that is not a member of your business, and you
-- would stop seeing it. Nothing is deleted either way; say so and it can be
-- put right.
-- ---------------------------------------------------------------------------
select
  case
    when (select count(*) from pg_policies
          where schemaname = 'storage' and tablename = 'objects'
            and policyname like 'social debug%'
            and coalesce(qual, '') not like '%social_tenant_user_ids%'
            and cmd <> 'INSERT') > 0
      then 'עדיין פתוח — שלחו לי צילום'
    else 'סגור — צילומי המסך נראים רק לעסק שלכם'
  end                                                       as "מצב",
  (select count(*) from storage.objects
     where bucket_id = 'social-debug')                      as "צילומי מסך",
  (select count(*) from storage.objects
     where bucket_id = 'social-media')                      as "תמונות",
  (select count(*) from storage.objects o
     where o.bucket_id in ('social-debug', 'social-media')
       and o.owner in (select m.user_id from public.social_tenant_members m
                       where m.tenant_id in (
                         select t.id from public.social_tenants t
                         order by t.created_at, t.id limit 1)))
                                                            as "קבצים שלכם";
