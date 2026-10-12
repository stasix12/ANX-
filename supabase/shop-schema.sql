-- ANX3D 3D-print store (/shop) — production schema.
--
-- The storefront currently runs on its demo backend (browser storage, see
-- src/lib/shop/store.ts). These tables are the 1:1 home for the same data
-- once the store is connected to Supabase. Safe to run more than once.
--
-- Card data is NEVER stored here: payments go through a licensed provider's
-- hosted page and only its transaction reference is kept (orders.payment_ref).

create extension if not exists "pgcrypto";

create table if not exists public.shop_categories (
  slug text primary key,
  name text not null,
  short_name text not null default '',
  icon text not null default 'figurine',
  image text not null default '',
  sort_order integer not null default 0
);

create table if not exists public.shop_products (
  id uuid primary key default gen_random_uuid(),
  slug text unique not null,
  name text not null,
  description text not null default '',
  categories text[] not null default '{}',
  price numeric(10,2) not null check (price >= 0),
  compare_at_price numeric(10,2),
  images text[] not null default '{}',
  card_image text,
  colors jsonb not null default '[]',      -- [{id,name,swatch:[...],images:[...]}]
  stock integer check (stock is null or stock >= 0), -- null = made to order / digital
  rating numeric(2,1) not null default 0,   -- aggregated from shop_reviews only
  review_count integer not null default 0,
  featured boolean not null default false,
  published boolean not null default true,
  digital boolean not null default false,
  material text not null default 'PLA',
  tags text[] not null default '{}',
  sort_order integer not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.shop_profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  name text not null default '',
  phone text not null default '',
  role text not null default 'customer' check (role in ('customer', 'admin')),
  marketing_opt_in boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.shop_addresses (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  label text not null default 'בית',
  full_name text not null default '',
  phone text not null default '',
  city text not null,
  street text not null,
  zip text not null default '',
  notes text not null default ''
);

create sequence if not exists public.shop_order_number start 10245;

create table if not exists public.shop_orders (
  id uuid primary key default gen_random_uuid(),
  number bigint unique not null default nextval('public.shop_order_number'),
  user_id uuid references auth.users(id) on delete set null,
  email text not null,
  customer jsonb not null,          -- {fullName, phone}
  address jsonb not null,           -- {fullName, phone, city, street, zip, notes}
  lines jsonb not null,             -- [{productId, name, colorName, image, unitPrice, qty}]
  subtotal numeric(10,2) not null,
  discount numeric(10,2) not null default 0,
  shipping numeric(10,2) not null default 0,
  total numeric(10,2) not null,
  coupon_code text,
  shipping_method text not null,
  payment_method text not null,
  payment_ref text,                 -- provider transaction id, set by the verified webhook
  status text not null default 'pending_payment'
    check (status in ('pending_payment','paid','processing','shipped','delivered','cancelled')),
  history jsonb not null default '[]',
  created_at timestamptz not null default now()
);

create table if not exists public.shop_coupons (
  code text primary key,
  kind text not null check (kind in ('percent','fixed','shipping')),
  value numeric(10,2) not null default 0,
  min_subtotal numeric(10,2) not null default 0,
  active boolean not null default true,
  label text not null default ''
);

create table if not exists public.shop_shipping_methods (
  id text primary key,
  name text not null,
  eta text not null default '',
  price numeric(10,2) not null default 0,
  free_from numeric(10,2)
);

-- ---------------------------------------------------------------- RLS
alter table public.shop_categories enable row level security;
alter table public.shop_products enable row level security;
alter table public.shop_profiles enable row level security;
alter table public.shop_addresses enable row level security;
alter table public.shop_orders enable row level security;
alter table public.shop_coupons enable row level security;
alter table public.shop_shipping_methods enable row level security;

create or replace function public.shop_is_admin() returns boolean
language sql stable security definer set search_path = public as $$
  select exists (select 1 from public.shop_profiles where id = auth.uid() and role = 'admin');
$$;

drop policy if exists "shop read categories" on public.shop_categories;
create policy "shop read categories" on public.shop_categories for select using (true);
drop policy if exists "shop admin categories" on public.shop_categories;
create policy "shop admin categories" on public.shop_categories for all using (public.shop_is_admin()) with check (public.shop_is_admin());

drop policy if exists "shop read products" on public.shop_products;
create policy "shop read products" on public.shop_products for select using (published or public.shop_is_admin());
drop policy if exists "shop admin products" on public.shop_products;
create policy "shop admin products" on public.shop_products for all using (public.shop_is_admin()) with check (public.shop_is_admin());

drop policy if exists "shop own profile" on public.shop_profiles;
create policy "shop own profile" on public.shop_profiles for select using (id = auth.uid() or public.shop_is_admin());
drop policy if exists "shop update own profile" on public.shop_profiles;
-- Customers may edit their own profile but never promote themselves.
create policy "shop update own profile" on public.shop_profiles for update using (id = auth.uid())
  with check (id = auth.uid() and role = (select role from public.shop_profiles where id = auth.uid()));

drop policy if exists "shop own addresses" on public.shop_addresses;
create policy "shop own addresses" on public.shop_addresses for all using (user_id = auth.uid()) with check (user_id = auth.uid());

-- Orders are created and moved to 'paid' only by server code (an Edge
-- Function using the service role, after verifying the payment provider's
-- webhook) — never directly from the browser.
drop policy if exists "shop own orders" on public.shop_orders;
create policy "shop own orders" on public.shop_orders for select using (user_id = auth.uid() or public.shop_is_admin());
drop policy if exists "shop admin orders" on public.shop_orders;
create policy "shop admin orders" on public.shop_orders for update using (public.shop_is_admin()) with check (public.shop_is_admin());

drop policy if exists "shop admin coupons" on public.shop_coupons;
create policy "shop admin coupons" on public.shop_coupons for all using (public.shop_is_admin()) with check (public.shop_is_admin());

drop policy if exists "shop read shipping" on public.shop_shipping_methods;
create policy "shop read shipping" on public.shop_shipping_methods for select using (true);
drop policy if exists "shop admin shipping" on public.shop_shipping_methods;
create policy "shop admin shipping" on public.shop_shipping_methods for all using (public.shop_is_admin()) with check (public.shop_is_admin());
