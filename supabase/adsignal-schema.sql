-- AdSignal — ad & trend monitoring schema.
-- Run once in the Supabase SQL editor (idempotent; safe to re-run).
--
-- Every metric row carries a `provenance` value:
--   REAL        came directly from an official API
--   DERIVED     computed by AdSignal from REAL rows
--   AI_ESTIMATE model inference
-- RLS is enabled with no policies on purpose: the anon key can touch nothing,
-- and all reads/writes go through the server with the service-role key.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------- reference
create table if not exists adsignal_niches (
  key         text primary key,
  name_he     text not null,
  name_en     text not null,
  keywords_he text[] not null default '{}',
  keywords_en text[] not null default '{}',
  sort        int not null default 100
);

-- ------------------------------------------------------------------ ingest
create table if not exists adsignal_raw_ingest (
  id          bigint generated always as identity primary key,
  source      text not null,
  external_id text,
  payload     jsonb not null,
  fetched_at  timestamptz not null default now(),
  processed_at timestamptz
);
create index if not exists adsignal_raw_ingest_source_idx
  on adsignal_raw_ingest (source, fetched_at desc);

create table if not exists adsignal_connector_state (
  source      text primary key,
  cursor      text,
  last_run_at timestamptz,
  last_ok_at  timestamptz,
  last_error  text,
  stats       jsonb not null default '{}'::jsonb
);

-- -------------------------------------------------------------------- core
create table if not exists adsignal_advertisers (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null,
  external_id   text not null,
  name          text not null,
  page_url      text,
  country       text,
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (platform, external_id)
);

create table if not exists adsignal_ads (
  id            uuid primary key default gen_random_uuid(),
  platform      text not null,
  external_id   text not null,
  advertiser_id uuid not null references adsignal_advertisers (id),
  niche_key     text references adsignal_niches (key),
  country       text,
  language      text,
  ad_type       text,
  title         text,
  body          text,
  body_hash     text,
  started_at    timestamptz,
  ended_at      timestamptz,
  is_active     boolean not null default true,
  landing_url   text,
  snapshot_url  text,
  source_kind   text not null default 'api',   -- api | user_imported | licensed
  first_seen_at timestamptz not null default now(),
  last_seen_at  timestamptz not null default now(),
  unique (platform, external_id)
);
create index if not exists adsignal_ads_advertiser_idx on adsignal_ads (advertiser_id, is_active);
create index if not exists adsignal_ads_niche_idx on adsignal_ads (niche_key, country, is_active);
create index if not exists adsignal_ads_body_hash_idx on adsignal_ads (advertiser_id, body_hash);

-- Daily point-in-time capture. Append-only: this is the historical record
-- that makes "yesterday 20 ads, today 31" answerable later.
create table if not exists adsignal_ad_snapshots (
  id                bigint generated always as identity primary key,
  ad_id             uuid not null references adsignal_ads (id),
  captured_at       date not null,
  is_active         boolean not null,
  reach_lower       bigint,
  reach_upper       bigint,
  spend_lower       numeric,
  spend_upper       numeric,
  impressions_lower bigint,
  impressions_upper bigint,
  engagement        jsonb,
  provenance        text not null default 'REAL',
  unique (ad_id, captured_at)
);

create table if not exists adsignal_trend_series (
  id         bigint generated always as identity primary key,
  niche_key  text not null references adsignal_niches (key),
  country    text not null,
  keyword    text not null,
  source     text not null,                    -- google_trends | youtube
  date       date not null,
  value      numeric not null,
  meta       jsonb not null default '{}'::jsonb,
  provenance text not null default 'REAL',
  unique (niche_key, country, keyword, source, date)
);
create index if not exists adsignal_trend_series_idx
  on adsignal_trend_series (niche_key, country, source, date desc);

-- --------------------------------------------------------------- derived
create table if not exists adsignal_ad_scores (
  id         bigint generated always as identity primary key,
  ad_id      uuid not null references adsignal_ads (id),
  date       date not null,
  hot_score  numeric not null,
  confidence numeric not null,
  components jsonb not null default '{}'::jsonb,
  provenance text not null default 'DERIVED',
  unique (ad_id, date)
);
create index if not exists adsignal_ad_scores_date_idx on adsignal_ad_scores (date desc, hot_score desc);

create table if not exists adsignal_niche_metrics (
  id                 bigint generated always as identity primary key,
  niche_key          text not null references adsignal_niches (key),
  country            text not null,
  date               date not null,
  active_ads         int,
  new_ads_7d         int,
  active_advertisers int,
  new_advertisers_7d int,
  demand_trend       numeric,                  -- % change of search interest
  ad_activity        numeric,                  -- % change of active ads
  competition        numeric,                  -- 0-100 saturation percentile
  growth             numeric,
  opportunity        numeric,                  -- 0-100
  signal_status      text,                     -- emerging | growing | hot | saturated | quiet
  components         jsonb not null default '{}'::jsonb,
  confidence         numeric,
  provenance         text not null default 'DERIVED',
  unique (niche_key, country, date)
);
create index if not exists adsignal_niche_metrics_idx
  on adsignal_niche_metrics (country, date desc, opportunity desc);

-- ---------------------------------------------------------------- offers
create table if not exists adsignal_offers (
  id              uuid primary key default gen_random_uuid(),
  normalized_text text not null unique,
  kind            text not null,               -- discount | price_point | free | urgency | bundle | guarantee | other
  first_seen_at   timestamptz not null default now()
);

create table if not exists adsignal_ad_offers (
  ad_id       uuid not null references adsignal_ads (id),
  offer_id    uuid not null references adsignal_offers (id),
  detected_by text not null default 'rule',    -- rule | ai
  detected_at timestamptz not null default now(),
  primary key (ad_id, offer_id)
);

-- --------------------------------------------------------------- clusters
-- Concept clusters. P1 groups by shared offer; P3 adds embedding clusters.
create table if not exists adsignal_clusters (
  id              uuid primary key default gen_random_uuid(),
  label           text not null,
  description     text,
  method          text not null default 'offer', -- offer | embedding
  niche_key       text references adsignal_niches (key),
  country         text,
  created_at      timestamptz not null default now(),
  last_updated_at timestamptz not null default now()
);
create table if not exists adsignal_cluster_members (
  cluster_id uuid not null references adsignal_clusters (id),
  ad_id      uuid not null references adsignal_ads (id),
  similarity numeric,
  joined_at  timestamptz not null default now(),
  primary key (cluster_id, ad_id)
);

-- --------------------------------------------------------------------- ai
create table if not exists adsignal_ai_analyses (
  id                      uuid primary key default gen_random_uuid(),
  ad_id                   uuid not null unique references adsignal_ads (id),
  model                   text not null,
  analyzed_at             timestamptz not null default now(),
  content_hash            text not null,
  hook                    text,
  offer_text              text,
  cta                     text,
  creative_notes          text,
  target_audience         text,
  pain_point              text,
  why_it_works            text,
  adaptation              text,
  performance_probability numeric,
  confidence              numeric,
  provenance              text not null default 'AI_ESTIMATE'
);

-- ------------------------------------------------------- alerts & watches
create table if not exists adsignal_alerts (
  id                uuid primary key default gen_random_uuid(),
  name              text not null,
  rule              jsonb not null,            -- {type:'niche_opportunity'|'offer_adoption'|'hot_ad', ...}
  is_active         boolean not null default true,
  created_at        timestamptz not null default now(),
  last_triggered_at timestamptz
);
create table if not exists adsignal_alert_events (
  id           bigint generated always as identity primary key,
  alert_id     uuid not null references adsignal_alerts (id),
  triggered_at timestamptz not null default now(),
  dedupe_key   text not null,
  payload      jsonb not null default '{}'::jsonb,
  seen         boolean not null default false,
  unique (alert_id, dedupe_key)
);

create table if not exists adsignal_competitor_watches (
  id            uuid primary key default gen_random_uuid(),
  advertiser_id uuid not null references adsignal_advertisers (id),
  label         text,
  notes         text,
  created_at    timestamptz not null default now(),
  unique (advertiser_id)
);
create table if not exists adsignal_competitor_events (
  id          bigint generated always as identity primary key,
  watch_id    uuid not null references adsignal_competitor_watches (id),
  kind        text not null,                   -- new_ad | ad_stopped | new_offer
  detected_at timestamptz not null default now(),
  dedupe_key  text not null,
  payload     jsonb not null default '{}'::jsonb,
  unique (watch_id, dedupe_key)
);

-- ---------------------------------------------------------------- security
do $$
declare t text;
begin
  foreach t in array array[
    'adsignal_niches','adsignal_raw_ingest','adsignal_connector_state',
    'adsignal_advertisers','adsignal_ads','adsignal_ad_snapshots',
    'adsignal_trend_series','adsignal_ad_scores','adsignal_niche_metrics',
    'adsignal_offers','adsignal_ad_offers','adsignal_clusters',
    'adsignal_cluster_members','adsignal_ai_analyses','adsignal_alerts',
    'adsignal_alert_events','adsignal_competitor_watches','adsignal_competitor_events'
  ] loop
    execute format('alter table %I enable row level security', t);
  end loop;
end $$;

-- ------------------------------------------------------------------- seed
-- Reference taxonomy only (names + search keywords). This is configuration,
-- not fabricated metrics: every number in the app comes from ingested data.
insert into adsignal_niches (key, name_he, name_en, keywords_he, keywords_en, sort) values
  ('sofa_cleaning',  'ניקוי ספות',     'Sofa Cleaning',   array['ניקוי ספות','ניקוי ריפודים','ניקוי שטיחים'], array['sofa cleaning','upholstery cleaning'], 10),
  ('hvac',           'מזגנים',         'Air Conditioning',array['מיזוג אוויר','תיקון מזגנים','התקנת מזגן','ניקוי מזגנים'], array['air conditioning repair','hvac'], 20),
  ('plumbing',       'אינסטלציה',      'Plumbing',        array['אינסטלטור','פתיחת סתימות','נזילת מים'], array['plumber','drain cleaning'], 30),
  ('pest_control',   'הדברה',          'Pest Control',    array['הדברה','מדביר','הדברת ג׳וקים'], array['pest control','exterminator'], 40),
  ('renovation',     'שיפוצים',        'Renovation',      array['שיפוצים','שיפוץ דירה','קבלן שיפוצים'], array['home renovation','contractor'], 50),
  ('auto',           'רכב',            'Auto Services',   array['דיטיילינג','פוליש לרכב','מוסך נייד'], array['car detailing','auto repair'], 60),
  ('beauty',         'קוסמטיקה',       'Beauty',          array['קוסמטיקאית','הסרת שיער בלייזר','טיפולי פנים'], array['beauty salon','laser hair removal'], 70),
  ('dental',         'רפואת שיניים',   'Dental',          array['רופא שיניים','השתלות שיניים','יישור שיניים'], array['dentist','dental implants'], 80),
  ('real_estate',    'נדל״ן',          'Real Estate',     array['דירות למכירה','תיווך דירות','דירה חדשה'], array['real estate','homes for sale'], 90),
  ('solar',          'סולארי',         'Solar',           array['פאנלים סולאריים','מערכת סולארית','אנרגיה סולארית'], array['solar panels','solar energy'], 100),
  ('insurance',      'ביטוח',          'Insurance',       array['ביטוח רכב','ביטוח דירה','ביטוח בריאות'], array['car insurance','home insurance'], 110),
  ('ecommerce',      'מסחר אלקטרוני',  'E-commerce',      array['משלוח חינם קנייה','חנות אונליין'], array['online store','free shipping deal'], 120)
on conflict (key) do nothing;
