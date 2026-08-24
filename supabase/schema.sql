-- ANX3D admin panel schema.
--
-- Run this once in the Supabase project's SQL Editor (Dashboard → SQL Editor →
-- New query → paste → Run). It creates the products table, locks it down with
-- Row Level Security so only signed-in admins can write, and sets up a public
-- storage bucket for product photos.
--
-- Public site visitors never get an API key that can write — they only ever
-- use the anon key, which these policies restrict to reading published rows.

create extension if not exists "pgcrypto";

create table if not exists public.products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  tagline text not null default '',
  description text not null default '',
  category text not null check (category in ('handles', 'hoses', 'adapters', 'courses')),
  price numeric,
  sale_price numeric,
  badge text,
  fits_models text[] not null default '{}',
  compatibility text[] not null default '{}',
  variants jsonb not null default '[]',
  highlights text[] not null default '{}',
  specs jsonb not null default '[]',
  images text[] not null default '{}',
  video jsonb,
  in_stock boolean not null default true,
  featured boolean not null default false,
  published boolean not null default true,
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists products_category_idx on public.products (category);
create index if not exists products_published_idx on public.products (published);

-- Keep updated_at current on every edit, so "last changed" is trustworthy
-- without the admin UI having to remember to set it.
create or replace function public.set_updated_at()
returns trigger as $$
begin
  new.updated_at = now();
  return new;
end;
$$ language plpgsql;

drop trigger if exists products_set_updated_at on public.products;
create trigger products_set_updated_at
  before update on public.products
  for each row execute function public.set_updated_at();

alter table public.products enable row level security;

-- Anyone (the public storefront, using the anon key) may read published
-- products only. Hidden/unpublished rows never reach the client-side bundle.
drop policy if exists "public read published" on public.products;
create policy "public read published"
  on public.products for select
  to anon
  using (published = true);

-- Any authenticated user may read every row, including hidden ones — the
-- admin panel needs to see and edit unpublished products.
drop policy if exists "admin read all" on public.products;
create policy "admin read all"
  on public.products for select
  to authenticated
  using (true);

-- Writes are restricted to authenticated users. There is no public sign-up
-- flow in this project — admin accounts are created by hand in the Supabase
-- dashboard (Authentication → Users → Add user) — so "authenticated" here
-- always means "an admin ANX3D created," never a storefront visitor.
drop policy if exists "admin insert" on public.products;
create policy "admin insert"
  on public.products for insert
  to authenticated
  with check (true);

drop policy if exists "admin update" on public.products;
create policy "admin update"
  on public.products for update
  to authenticated
  using (true)
  with check (true);

drop policy if exists "admin delete" on public.products;
create policy "admin delete"
  on public.products for delete
  to authenticated
  using (true);

-- Product photo storage. Public read (the storefront shows these images to
-- anyone), write restricted to signed-in admins.
insert into storage.buckets (id, name, public)
values ('product-images', 'product-images', true)
on conflict (id) do nothing;

drop policy if exists "product images public read" on storage.objects;
create policy "product images public read"
  on storage.objects for select
  to anon, authenticated
  using (bucket_id = 'product-images');

drop policy if exists "product images admin write" on storage.objects;
create policy "product images admin write"
  on storage.objects for insert
  to authenticated
  with check (bucket_id = 'product-images');

drop policy if exists "product images admin update" on storage.objects;
create policy "product images admin update"
  on storage.objects for update
  to authenticated
  using (bucket_id = 'product-images');

drop policy if exists "product images admin delete" on storage.objects;
create policy "product images admin delete"
  on storage.objects for delete
  to authenticated
  using (bucket_id = 'product-images');
