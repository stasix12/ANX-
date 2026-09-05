-- Cleango marketplace schema — run in the Supabase SQL editor.
-- Safe to run on a fresh project; everything lives in the public schema
-- alongside the store/CRM tables (no name collisions).
--
-- Access model: browsers talk to Supabase directly with the anon key; these
-- RLS policies are the real security boundary. The demo/localStorage mode of
-- the app never touches this schema.

-- ---------------------------------------------------------------------------
-- Roles: profiles extends auth.users with a marketplace role.
-- ---------------------------------------------------------------------------
create table if not exists mk_profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  role text not null default 'customer'
    check (role in ('customer', 'professional', 'admin', 'super_admin')),
  full_name text not null default '',
  phone text not null default '',
  email text not null default '',
  avatar_url text,
  language text not null default 'he',
  credit_agorot integer not null default 0, -- referral / goodwill credit
  referral_code text unique,
  referred_by uuid references mk_profiles (id),
  blocked boolean not null default false,
  created_at timestamptz not null default now()
);

create or replace function mk_role() returns text language sql stable as $$
  select coalesce((select role from mk_profiles where id = auth.uid()), 'anon');
$$;

create or replace function mk_is_admin() returns boolean language sql stable as $$
  select mk_role() in ('admin', 'super_admin');
$$;

-- ---------------------------------------------------------------------------
-- Service catalogue.
-- ---------------------------------------------------------------------------
create table if not exists mk_service_categories (
  id text primary key,             -- e.g. 'upholstery'
  name_he text not null,
  sort integer not null default 0
);

create table if not exists mk_services (
  id text primary key,             -- e.g. 'sofa-cleaning' (also the SEO slug)
  category_id text not null references mk_service_categories (id),
  name_he text not null,
  short_name_he text not null default '',
  description_he text not null default '',
  icon text not null default '',
  base_price_agorot integer not null,
  duration_minutes integer not null default 60,
  -- Pricing questionnaire: [{id,label,type:'count'|'bool'|'choice',options,price_delta…}]
  questions jsonb not null default '[]',
  active boolean not null default true,
  coming_soon boolean not null default false,
  sort integer not null default 0
);

create table if not exists mk_service_areas (
  id text primary key,             -- e.g. 'beer-sheva'
  name_he text not null,
  lat double precision not null,
  lng double precision not null,
  radius_km double precision not null default 10,
  active boolean not null default true,
  waitlist_only boolean not null default false
);

-- ---------------------------------------------------------------------------
-- Professionals.
-- ---------------------------------------------------------------------------
create table if not exists mk_professionals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users (id) on delete set null,
  slug text unique not null,
  full_name text not null,
  business_name text not null default '',
  phone text not null,
  email text not null default '',
  photo_url text,
  city text not null default '',
  bio text not null default '',
  languages text[] not null default '{he}',
  years_experience integer not null default 0,
  work_radius_km double precision not null default 15,
  status text not null default 'pending'
    check (status in ('pending', 'active', 'blocked')),
  badges text[] not null default '{}',          -- 'verified_id','verified_business',…
  commission_pct numeric(5, 2),                 -- null → platform default
  boost integer not null default 0,             -- paid ranking boost 0–100
  exclusive_area_id text references mk_service_areas (id),
  gallery jsonb not null default '[]',          -- [{url, caption, kind:'before'|'after'}]
  documents jsonb not null default '[]',        -- private: id / business certificates
  -- Denormalised counters kept by triggers/edge functions in production:
  rating numeric(3, 2) not null default 0,
  review_count integer not null default 0,
  job_count integer not null default 0,
  acceptance_pct numeric(5, 2) not null default 100,
  cancel_pct numeric(5, 2) not null default 0,
  last_job_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists mk_professional_services (
  professional_id uuid not null references mk_professionals (id) on delete cascade,
  service_id text not null references mk_services (id) on delete cascade,
  price_agorot integer,            -- null → service base price
  primary key (professional_id, service_id)
);

create table if not exists mk_professional_areas (
  professional_id uuid not null references mk_professionals (id) on delete cascade,
  area_id text not null references mk_service_areas (id) on delete cascade,
  primary key (professional_id, area_id)
);

create table if not exists mk_professional_availability (
  professional_id uuid primary key references mk_professionals (id) on delete cascade,
  online boolean not null default false,
  heartbeat_at timestamptz not null default now(),
  lat double precision,
  lng double precision
);

-- ---------------------------------------------------------------------------
-- Bookings + dispatch.
-- ---------------------------------------------------------------------------
create table if not exists mk_bookings (
  id uuid primary key default gen_random_uuid(),
  customer_id uuid not null references mk_profiles (id),
  -- Denormalised so the pro's job popup needs no join (and no read access to
  -- the whole profiles table).
  customer_name text not null default '',
  customer_phone text not null default '',
  professional_id uuid references mk_professionals (id),
  service_id text not null references mk_services (id),
  area_id text references mk_service_areas (id),
  address text not null,
  lat double precision,
  lng double precision,
  answers jsonb not null default '{}',          -- pricing questionnaire answers
  photos jsonb not null default '[]',
  notes text not null default '',
  scheduled_for timestamptz,                    -- null → "now"
  mode text not null default 'auto' check (mode in ('auto', 'chosen', 'bidding')),
  quote_low_agorot integer not null default 0,
  quote_high_agorot integer not null default 0,
  final_price_agorot integer,
  coupon_code text,
  discount_agorot integer not null default 0,
  commission_agorot integer,
  payment_method text,                          -- 'cash','card','prepaid',…
  -- Dispatch memory: pros already offered, in order, so the loop never repeats.
  offered_pro_ids uuid[] not null default '{}',
  status text not null default 'draft' check (status in (
    'draft', 'searching', 'offered', 'no_pros_available', 'accepted',
    'en_route', 'arrived', 'in_progress', 'completed', 'paid',
    'reviewed', 'canceled')),
  cancel_reason text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists mk_booking_offers (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references mk_bookings (id) on delete cascade,
  professional_id uuid not null references mk_professionals (id) on delete cascade,
  kind text not null default 'dispatch' check (kind in ('dispatch', 'bid')),
  status text not null default 'sent'
    check (status in ('sent', 'accepted', 'declined', 'expired', 'withdrawn')),
  expires_at timestamptz,                       -- dispatch countdown deadline
  price_agorot integer,                         -- bid: the pro's quote
  eta_minutes integer,
  message text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists mk_booking_events (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references mk_bookings (id) on delete cascade,
  status text not null,
  actor text not null default 'system',         -- 'customer','professional','admin','system'
  note text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists mk_messages (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references mk_bookings (id) on delete cascade,
  sender text not null check (sender in ('customer', 'professional', 'system')),
  kind text not null default 'text' check (kind in ('text', 'image', 'location', 'system')),
  body text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists mk_reviews (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid unique not null references mk_bookings (id) on delete cascade,
  professional_id uuid not null references mk_professionals (id) on delete cascade,
  customer_id uuid not null references mk_profiles (id),
  customer_name text not null default '',
  service_id text,
  quality smallint not null check (quality between 1 and 5),
  punctuality smallint not null check (punctuality between 1 and 5),
  service smallint not null check (service between 1 and 5),
  price smallint not null check (price between 1 and 5),
  body_text text not null default '',
  photo_url text,
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Money.
-- ---------------------------------------------------------------------------
create table if not exists mk_payments (
  id uuid primary key default gen_random_uuid(),
  booking_id uuid not null references mk_bookings (id),
  provider text not null default 'mock',        -- 'tranzila','meshulam','grow','payplus','stripe'
  method text not null,                         -- 'cash','card','prepaid','deposit'
  amount_agorot integer not null,
  status text not null default 'pending'
    check (status in ('pending', 'authorized', 'captured', 'refunded', 'failed')),
  external_ref text,
  created_at timestamptz not null default now()
);

create table if not exists mk_wallet_transactions (
  id uuid primary key default gen_random_uuid(),
  professional_id uuid not null references mk_professionals (id) on delete cascade,
  booking_id uuid references mk_bookings (id),
  kind text not null check (kind in
    ('job_income', 'commission', 'lead_fee', 'subscription', 'boost',
     'payout', 'credit', 'adjustment')),
  amount_agorot integer not null,               -- positive = credit to the pro
  note text not null default '',
  created_at timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Growth: coupons, referrals, favorites, waitlist, notifications.
-- ---------------------------------------------------------------------------
create table if not exists mk_coupons (
  code text primary key,
  percent_off numeric(5, 2),
  amount_off_agorot integer,
  service_id text references mk_services (id),
  area_id text references mk_service_areas (id),
  new_customers_only boolean not null default false,
  expires_at timestamptz,
  max_redemptions integer,
  redemptions integer not null default 0,
  active boolean not null default true
);

create table if not exists mk_referrals (
  id uuid primary key default gen_random_uuid(),
  referrer_id uuid not null references mk_profiles (id),
  referred_id uuid not null references mk_profiles (id),
  reward_agorot integer not null default 3000,
  rewarded boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists mk_favorites (
  customer_id uuid not null references mk_profiles (id) on delete cascade,
  professional_id uuid not null references mk_professionals (id) on delete cascade,
  primary key (customer_id, professional_id)
);

create table if not exists mk_waitlist (
  id uuid primary key default gen_random_uuid(),
  phone text not null,
  area_name text not null,
  service_id text,
  created_at timestamptz not null default now()
);

create table if not exists mk_notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references mk_profiles (id) on delete cascade,
  channel text not null default 'inapp',        -- 'inapp','push','email','sms','whatsapp'
  title text not null,
  body text not null default '',
  booking_id uuid references mk_bookings (id),
  read boolean not null default false,
  created_at timestamptz not null default now()
);

-- Admin-editable knobs — one jsonb row so business-model changes need no code.
create table if not exists mk_platform_settings (
  id boolean primary key default true check (id), -- singleton
  data jsonb not null default '{}'
  -- { commissionPct, leadFeeAgorot, businessModel:'commission'|'lead_fee'|'subscription',
  --   dispatchTtlSeconds, paymentMethods:[…], dynamicPricing:{…}, subscriptions:{…} }
);

-- ---------------------------------------------------------------------------
-- Row Level Security.
-- ---------------------------------------------------------------------------
alter table mk_profiles enable row level security;
alter table mk_service_categories enable row level security;
alter table mk_services enable row level security;
alter table mk_service_areas enable row level security;
alter table mk_professionals enable row level security;
alter table mk_professional_services enable row level security;
alter table mk_professional_areas enable row level security;
alter table mk_professional_availability enable row level security;
alter table mk_bookings enable row level security;
alter table mk_booking_offers enable row level security;
alter table mk_booking_events enable row level security;
alter table mk_messages enable row level security;
alter table mk_reviews enable row level security;
alter table mk_payments enable row level security;
alter table mk_wallet_transactions enable row level security;
alter table mk_coupons enable row level security;
alter table mk_referrals enable row level security;
alter table mk_favorites enable row level security;
alter table mk_waitlist enable row level security;
alter table mk_notifications enable row level security;
alter table mk_platform_settings enable row level security;

-- Public catalogue + public professional cards (documents stay admin-only via
-- a column-filtered view in production; MVP keeps them out of client selects).
create policy "catalogue readable" on mk_service_categories for select using (true);
create policy "services readable" on mk_services for select using (true);
create policy "areas readable" on mk_service_areas for select using (true);
create policy "active pros readable" on mk_professionals
  for select using (status = 'active' or mk_is_admin()
    or user_id = auth.uid());
create policy "pro services readable" on mk_professional_services for select using (true);
create policy "pro areas readable" on mk_professional_areas for select using (true);
create policy "availability readable" on mk_professional_availability for select using (true);
create policy "reviews readable" on mk_reviews for select using (true);

-- Own profile.
create policy "own profile" on mk_profiles
  for all using (id = auth.uid() or mk_is_admin())
  with check (id = auth.uid() or mk_is_admin());

-- Professionals manage their own record; admins everything.
create policy "pro self insert" on mk_professionals
  for insert with check (user_id = auth.uid() or mk_is_admin());
create policy "pro self update" on mk_professionals
  for update using (user_id = auth.uid() or mk_is_admin());
create policy "pro links self" on mk_professional_services
  for all using (mk_is_admin() or professional_id in
    (select id from mk_professionals where user_id = auth.uid()));
create policy "pro areas self" on mk_professional_areas
  for all using (mk_is_admin() or professional_id in
    (select id from mk_professionals where user_id = auth.uid()));
create policy "pro availability self" on mk_professional_availability
  for all using (mk_is_admin() or professional_id in
    (select id from mk_professionals where user_id = auth.uid()));

-- Bookings: visible to their customer, their (offered/assigned) pro, admins.
create or replace function mk_my_pro_ids() returns setof uuid language sql stable as $$
  select id from mk_professionals where user_id = auth.uid();
$$;

create policy "booking parties read" on mk_bookings for select using (
  customer_id = auth.uid() or mk_is_admin()
  or professional_id in (select mk_my_pro_ids())
  or id in (select booking_id from mk_booking_offers
            where professional_id in (select mk_my_pro_ids())));
create policy "customer creates booking" on mk_bookings
  for insert with check (customer_id = auth.uid() or mk_is_admin());
create policy "booking parties update" on mk_bookings for update using (
  customer_id = auth.uid() or mk_is_admin()
  or professional_id in (select mk_my_pro_ids()));

create policy "offer parties" on mk_booking_offers for all using (
  mk_is_admin()
  or professional_id in (select mk_my_pro_ids())
  or booking_id in (select id from mk_bookings where customer_id = auth.uid()));

create policy "events follow booking" on mk_booking_events for select using (
  booking_id in (select id from mk_bookings));  -- booking RLS already filtered
create policy "events insert by parties" on mk_booking_events for insert
  with check (booking_id in (select id from mk_bookings));

create policy "messages follow booking" on mk_messages for all using (
  booking_id in (select id from mk_bookings));

create policy "review by its customer" on mk_reviews
  for insert with check (customer_id = auth.uid()
    and booking_id in (select id from mk_bookings
      where customer_id = auth.uid() and status in ('completed', 'paid', 'reviewed')));

create policy "payments parties" on mk_payments for select using (
  mk_is_admin() or booking_id in (select id from mk_bookings));
create policy "payments admin write" on mk_payments for insert with check (mk_is_admin());

create policy "wallet own" on mk_wallet_transactions for select using (
  mk_is_admin() or professional_id in (select mk_my_pro_ids()));

create policy "coupons readable" on mk_coupons for select using (true);
create policy "coupons admin" on mk_coupons for all using (mk_is_admin());

create policy "referrals own" on mk_referrals for select using (
  referrer_id = auth.uid() or referred_id = auth.uid() or mk_is_admin());

create policy "favorites own" on mk_favorites for all
  using (customer_id = auth.uid()) with check (customer_id = auth.uid());

create policy "waitlist insert" on mk_waitlist for insert with check (true);
create policy "waitlist admin read" on mk_waitlist for select using (mk_is_admin());

create policy "notifications own" on mk_notifications for all using (
  user_id = auth.uid() or mk_is_admin());

create policy "settings readable" on mk_platform_settings for select using (true);
create policy "settings super admin" on mk_platform_settings for all
  using (mk_role() = 'super_admin');

-- Admin-only mutations of the catalogue.
create policy "catalogue admin write c" on mk_service_categories for all using (mk_is_admin());
create policy "catalogue admin write s" on mk_services for all using (mk_is_admin());
create policy "catalogue admin write a" on mk_service_areas for all using (mk_is_admin());

-- Realtime: the app subscribes to bookings / offers / messages / events.
-- In the dashboard enable: Database → Replication → supabase_realtime for
-- mk_bookings, mk_booking_offers, mk_booking_events, mk_messages,
-- mk_professional_availability.
