-- ANX3D video courses — access by code.
--
-- Run once in the Supabase SQL Editor (Dashboard → SQL Editor → New query →
-- paste → Run). Safe to run again.
--
-- How it works
--   * Course videos live in the storage bucket `course-videos`, each under a
--     random folder name. Nobody can list the bucket, so a video can only be
--     opened by someone who was given its address.
--   * Customers never see those addresses on the site. They type the access
--     code the owner sent them; `redeem_course_code` checks it and only then
--     returns the course's lessons.
--   * Codes, courses and lessons are readable and writable only by course
--     admins. Every account that exists when this script runs (the accounts
--     created by hand in Authentication → Users) becomes a course admin, so a
--     stranger who signs up later through the public API gets nothing.
--
-- Limits to know: a public storage address works for whoever has it, so a
-- buyer who copies a video's address out of the browser can pass it on —
-- the code stops casual sharing of the course page, not a determined copier.
-- Supabase's free plan caps uploads at 50 MB per file and 5 GB of download
-- traffic per month; longer or heavily watched courses need the Pro plan.

create extension if not exists "pgcrypto";

create table if not exists public.course_admins (
  user_id uuid primary key references auth.users(id) on delete cascade
);
insert into public.course_admins (user_id)
  select id from auth.users
  on conflict do nothing;

create or replace function public.is_course_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.course_admins where user_id = auth.uid());
$$;

create table if not exists public.courses (
  slug text primary key,
  title text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.course_lessons (
  id uuid primary key default gen_random_uuid(),
  course_slug text not null references public.courses(slug) on update cascade on delete cascade,
  position integer not null default 0,
  title text not null,
  video_path text not null,
  created_at timestamptz not null default now()
);
create index if not exists course_lessons_course_idx on public.course_lessons (course_slug, position);

create table if not exists public.course_codes (
  code text primary key,
  course_slug text not null references public.courses(slug) on update cascade on delete cascade,
  note text not null default '',
  active boolean not null default true,
  uses integer not null default 0,
  first_used_at timestamptz,
  last_used_at timestamptz,
  created_at timestamptz not null default now()
);

alter table public.course_admins enable row level security;
alter table public.courses enable row level security;
alter table public.course_lessons enable row level security;
alter table public.course_codes enable row level security;

drop policy if exists "course admins read" on public.course_admins;
create policy "course admins read" on public.course_admins for select using (public.is_course_admin());

drop policy if exists "courses admin" on public.courses;
create policy "courses admin" on public.courses for all using (public.is_course_admin()) with check (public.is_course_admin());

drop policy if exists "course lessons admin" on public.course_lessons;
create policy "course lessons admin" on public.course_lessons for all using (public.is_course_admin()) with check (public.is_course_admin());

drop policy if exists "course codes admin" on public.course_codes;
create policy "course codes admin" on public.course_codes for all using (public.is_course_admin()) with check (public.is_course_admin());

-- The one door customers have: a valid, active code returns its course's
-- lessons (and counts the visit); anything else returns nothing.
create or replace function public.redeem_course_code(p_code text)
returns table (course_slug text, course_title text, lesson_id uuid, lesson_title text, video_path text, lesson_position integer)
language plpgsql security definer set search_path = public as $$
declare
  v_slug text;
begin
  update public.course_codes c
     set uses = c.uses + 1,
         first_used_at = coalesce(c.first_used_at, now()),
         last_used_at = now()
   where c.code = upper(regexp_replace(coalesce(p_code, ''), '[^A-Za-z0-9]', '', 'g')) and c.active
  returning c.course_slug into v_slug;

  if v_slug is null then
    return;
  end if;

  return query
    select co.slug, co.title, l.id, l.title, l.video_path, l.position
      from public.courses co
      join public.course_lessons l on l.course_slug = co.slug
     where co.slug = v_slug
     order by l.position, l.created_at;
end;
$$;

revoke all on function public.redeem_course_code(text) from public;
grant execute on function public.redeem_course_code(text) to anon, authenticated;

-- The first course.
insert into public.courses (slug, title)
  values ('mattress-cleaning-course', 'קורס ניקוי מזרנים')
  on conflict (slug) do nothing;

-- Video storage: public addresses, but no listing (no select policy for
-- visitors), and only course admins may upload, replace or delete.
insert into storage.buckets (id, name, public)
  values ('course-videos', 'course-videos', true)
  on conflict (id) do update set public = true;

drop policy if exists "course videos admin read" on storage.objects;
create policy "course videos admin read" on storage.objects for select
  using (bucket_id = 'course-videos' and public.is_course_admin());

drop policy if exists "course videos admin insert" on storage.objects;
create policy "course videos admin insert" on storage.objects for insert
  with check (bucket_id = 'course-videos' and public.is_course_admin());

drop policy if exists "course videos admin update" on storage.objects;
create policy "course videos admin update" on storage.objects for update
  using (bucket_id = 'course-videos' and public.is_course_admin());

drop policy if exists "course videos admin delete" on storage.objects;
create policy "course videos admin delete" on storage.objects for delete
  using (bucket_id = 'course-videos' and public.is_course_admin());
