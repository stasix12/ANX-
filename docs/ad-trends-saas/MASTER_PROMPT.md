# Master Development Prompt — AdSignal

> העתק את כל מה שמתחת לקו ותן אותו כפרומפט פתיחה ל-Claude Code (מומלץ בריפו חדש וריק).
> הפרומפט כתוב באנגלית כי כך מודלים מבצעים הכי טוב משימות קוד; המוצר עצמו תומך עברית/RTL.

---

You are building **AdSignal** — a production-grade SaaS platform that monitors digital
advertising (ads, creatives, offers) and search demand to detect **early momentum**: which
ads, marketing offers, and niches are starting to heat up, before the market saturates.
This is a commercial product, not a demo.

## 0. Non-negotiable integrity rules

These override everything else. Violating them is a failed implementation.

1. **Never fabricate data.** No random numbers presented as metrics, no seeded "example ads"
   pretending to be live data. If a table is empty, show an honest empty state explaining
   which connector must run and what it can/cannot provide.
2. **Every displayed metric carries a provenance tag**, stored in the DB and rendered as a
   badge in the UI:
   - `REAL` — came directly from an official API (e.g., ad start date from Meta Ad Library).
   - `DERIVED` — computed by us from REAL data (e.g., Hot Score, days running, growth rate).
   - `AI_ESTIMATE` — model inference (e.g., inferred target audience, "High Performance
     Probability"). Never label AI output as REAL.
3. **Never claim to know a third-party advertiser's leads, sales, ROAS, or spend** unless an
   official source provides it (Meta provides spend/impression *ranges* only for political
   ads and reach ranges for EU ads — display them as ranges with attribution). Otherwise show
   "High Performance Probability" as an `AI_ESTIMATE` with a confidence value.
4. **Official APIs and lawful sources only.** No scraping that violates a platform's ToS
   (specifically: do NOT scrape Meta Ad Library web, Google Ads Transparency Center, or
   TikTok Creative Center). Where an API doesn't cover a need, build the honest fallback
   described below instead.
5. A metric that is unavailable for a given ad/market is shown as "Not available from
   {source}" with a short reason — never as 0 and never invented.

## 1. Data-source reality (design to this, verify current docs before coding each connector)

| Source | Available via official API | NOT available | Auth/notes |
|---|---|---|---|
| **Meta Ad Library API** (`ads_archive` Graph endpoint) | All ads delivered to **EU** countries (DSA): creative bodies/titles/links, page (advertiser), platforms, start/stop dates, languages, `eu_total_reach` + demographic breakdown, payer/beneficiary. **Political/social-issue ads worldwide (incl. Israel)**: same plus spend & impression *ranges*. | Commercial ads outside the EU (incl. Israel); likes/comments/shares for any ad. | Requires developer identity verification + app review. Respect rate limits; paginate with cursors. |
| **TikTok Commercial Content API** (DSA) | All ads shown in the EU: advertiser, first/last shown dates, targeting parameters, reached-users ranges. | Engagement metrics; non-EU ads. | Requires application approval. |
| **TikTok Creative Center "Top Ads"** | — (public web tool only, engagement shown in-browser) | No official API; do not scrape. | Support a manual "import Top Ad by URL" flow instead; treat availability per-country as unknown until verified. |
| **Google Ads Transparency Center** | — (web only; political-ads BigQuery public dataset exists for political only) | No public API for commercial ads. | Provide advertiser deep-links from Competitor Watch. |
| **Google Ads API — Keyword Planner** | Historical search volumes, YoY growth, competition index, top-of-page bid ranges, **per geo incl. Israel**. | Other advertisers' campaign data. | Needs a Google Ads account with Standard API access. Excellent niche demand+competition signal. |
| **Google Trends** | Interest-over-time & related queries per geo (official API in alpha as of 2025; else a swappable provider e.g. SerpApi, or pytrends behind an interface flagged "unofficial"). | Absolute volumes (index 0–100 only). | Build `TrendsProvider` interface so the backend can swap implementations. |
| **YouTube Data API v3** | Public video stats (views/likes/comments), search, most-popular per region incl. Israel. | Ad data. | 10,000 units/day quota — budget it. Organic momentum signal for niches. |

**Israel strategy (be explicit in the UI):** commercial Meta/TikTok ads in Israel are not
available via API. For Israel the automatic signals are Google Trends + Keyword Planner +
YouTube (niche level), plus political/issue ads. Ad-level coverage comes from: (a) a
Competitor Watchlist that stores advertiser page IDs and generates Ad Library deep-links,
(b) a user-assisted import flow (paste an Ad Library URL / upload creative + metadata,
stored with provenance `USER_IMPORTED` shown distinctly), (c) a pluggable
`LicensedDataProvider` interface for a future commercial data vendor. The dashboard must
say which coverage mode each market is in.

## 2. Stack

- **Frontend/app**: Next.js (App Router, RSC, Server Actions) + TypeScript + Tailwind CSS.
  Modern SaaS design: dark-mode-first, clean data-dense cards, skeleton loaders, full RTL
  support (the UI ships in English + Hebrew via i18n; Hebrew renders RTL).
- **DB/Auth**: Supabase — Postgres with `pgvector`, `pg_cron`, Row Level Security on all
  tenant data; Supabase Auth (email + Google OAuth). Multi-tenant via `org_id`.
- **Workers**: a separate Node/TypeScript worker service (deployable to Railway/Fly) consuming
  a queue (BullMQ + Redis, or pgmq if you prefer fewer moving parts — pick one and be
  consistent). Jobs: connector syncs, daily rollups, scoring, AI analysis, embeddings,
  clustering, alert evaluation. Every job idempotent + cursor-based.
- **AI**: Anthropic Claude API (latest model) for structured ad analysis; a text-embedding
  provider for clustering vectors stored in pgvector. All AI outputs validated against zod
  schemas; cache by content hash.
- **Repo layout**: monorepo (`apps/web`, `apps/worker`, `packages/db`, `packages/connectors`,
  `packages/scoring`, `packages/shared`). Migrations via Supabase CLI, checked in.

## 3. Database schema

Create migrations for (all timestamps `timestamptz`, all tenant tables RLS-scoped by `org_id`):

```sql
-- Tenancy
orgs(id, name, plan, created_at)
org_members(org_id, user_id, role)            -- role: owner|admin|member

-- Reference
platforms(id, key, name)                       -- meta, tiktok, google, youtube
niches(id, key, name_en, name_he, parent_id)   -- seeded taxonomy: cleaning, hvac, plumbing,
                                               -- solar, car_detailing, beauty, dental,
                                               -- real_estate, home_services, ecommerce,
                                               -- fitness, insurance, ... (extensible)
countries(code, name)                          -- ISO-3166

-- Ingest (append-only, reprocessable)
raw_ingest(id, source, external_id, payload jsonb, fetched_at, cursor, processed_at)

-- Core entities
advertisers(id, platform_id, external_id, name, page_url, country, verified, first_seen_at, last_seen_at)
ads(id, platform_id, advertiser_id, external_id UNIQUE(platform_id, external_id),
    niche_id, country, language, ad_type,      -- image|video|carousel|text
    started_at, ended_at, is_active,
    landing_url, snapshot_url,                 -- deep-link to the platform's own ad view
    source_kind,                               -- api|user_imported|licensed
    first_seen_at, last_seen_at)
creatives(id, ad_id, kind, text_body, title, link_caption, media_url, content_hash, embedding vector(1536))
ad_snapshots(id, ad_id, captured_at, is_active, variant_count, eu_reach_lower, eu_reach_upper,
    spend_lower, spend_upper, impressions_lower, impressions_upper,
    engagement jsonb,                          -- only when a source truly provides it
    provenance)                                -- REAL for everything in this table
    -- PARTITION BY RANGE (captured_at), monthly

-- Trends & niche metrics
trend_series(id, niche_id, country, keyword, source,   -- google_trends|keyword_planner|youtube
    date, value numeric, meta jsonb, provenance)
niche_metrics_daily(id, niche_id, country, date,
    active_ads, new_ads, new_advertisers, active_advertisers,
    trend_score, competition_score, growth_score, opportunity_score,
    components jsonb, confidence numeric, provenance)  -- DERIVED

-- AI
ai_analyses(id, ad_id, model, analyzed_at, content_hash,
    hook, offer_text, cta, creative_notes, target_audience, pain_point, why_it_works,
    performance_probability numeric, confidence numeric, provenance)  -- AI_ESTIMATE
creative_clusters(id, label, description, centroid vector(1536), niche_id, country,
    created_at, last_updated_at)
cluster_members(cluster_id, ad_id, similarity, joined_at)

-- Offers
offers(id, normalized_text, kind,              -- discount|free_estimate|same_day|bundle|price_point|other
    first_seen_at)
ad_offers(ad_id, offer_id, detected_by,        -- ai|rule
    provenance)

-- Scoring (ad level)
ad_scores(id, ad_id, date, hot_score, confidence, components jsonb, provenance)  -- DERIVED

-- User features
alerts(id, org_id, name, rule jsonb, channels jsonb, is_active, created_by, last_triggered_at)
alert_events(id, alert_id, triggered_at, payload jsonb, delivered)
competitor_watches(id, org_id, advertiser_id, notes, created_at)
competitor_events(id, watch_id, kind,          -- new_ad|removed_ad|new_offer|creative_change
    detected_at, payload jsonb)
```

Indexes: `(niche_id, country, date)` on metric tables, GIN on `raw_ingest.payload`,
ivfflat/HNSW on embeddings, `(advertiser_id, is_active)` on ads.

## 4. Scoring algorithms (implement in `packages/scoring`, pure + unit-tested)

**Hot Score (0–100, per ad, computed daily):** weighted mean over the components that are
*actually available* for that ad; renormalize weights over available components; emit
`confidence = sqrt(available_weight / total_weight)` and a full `components` breakdown.

| Component | Weight | How |
|---|---|---|
| longevity | 25 | `min(1, log1p(days_running)/log1p(60))` |
| variants | 20 | `min(1, variant_count/8)` |
| advertiser_persistence | 15 | advertiser renewed/expanded this ad's group in last 14d |
| cluster_momentum | 20 | new unique advertisers in the ad's cluster over trailing 7d, vs cluster baseline |
| engagement_velocity | 10 | only when a source truly provides engagement/reach deltas |
| niche_trend_delta | 10 | 30d slope of the ad's niche trend_series in its country |

**Opportunity Score (0–100, per niche×country, daily):**
`0.35*demand_growth + 0.25*ad_activity_growth + 0.15*offer_innovation + 0.25*(100 - saturation)`
- demand_growth: normalized 30d slope of trends vs 12m baseline.
- ad_activity_growth: Δ active ads + Δ new advertisers vs trailing 90d.
- offer_innovation: share of recently-first-seen offers spreading across ≥3 advertisers.
- saturation: active advertisers vs median across niches (percentile).
Store the component vector; the UI must render the breakdown ("Why this niche is trending")
from real components, with an optional Claude-written one-sentence explanation labeled AI.

**Creative clustering job:** for each analyzed ad, embed `hook + offer + angle`; greedy
assignment — cosine similarity ≥ 0.83 to nearest centroid joins that cluster (update
centroid incrementally), else create a new cluster; weekly re-center pass. Cluster metrics
(unique advertisers, join velocity, age) feed `cluster_momentum`.

## 5. AI pipeline

`Analyze with AI` (on-demand) and a batch job (auto-analyze ads passing a cheap interest
filter: active ≥ 7 days OR ≥ 3 variants OR in a moving cluster). One Claude call per ad
returns strict JSON (zod-validated): `{hook, offer, cta, creative, target_audience,
pain_point, why_it_works, performance_probability (0-1), confidence (0-1)}` — prompt
instructs the model to reason only from the provided creative + metadata and to say
"unknown" rather than guess. Extract offers into normalized `offers` (dedupe: "20% off",
"Free Estimate", "Same Day Service", "Buy 2 Get 1", price points like "₪299"). Cache by
`content_hash`; never re-bill unchanged creatives.

**AI Opportunity Finder**: a screen + weekly job that ranks niche×country combos by
Opportunity Score, then has Claude write a short structured brief per top combo (what's
growing, which offers/angles are spreading, competition level, suggested entry angle) —
grounded ONLY in retrieved rows passed into the prompt; the brief cites which metrics it
used and is labeled AI_ESTIMATE.

## 6. UI (screens, all with provenance badges and honest empty states)

1. **Dashboard** — top row: 🔥 Trending Now · 🚀 Fastest Growing · 💰 Opportunity Score ·
   📈 Emerging Niches · 🎯 Winning Offers. Below: ads feed. Each ad card: creative preview,
   platform icon, advertiser, category, country, start date, days running, engagement/reach
   (only if REAL), Hot Score gauge + confidence, trend arrow, detected offer chip, CTA,
   and an **Analyze with AI** button.
2. **🔥 Hot Niches** — table/cards per niche×country: Trend Score, Competition Score,
   Ad Activity, Growth, Opportunity Score, "Why this niche is trending" (component-based).
3. **Trending Offers** — offers spreading across advertisers, with adoption sparkline.
4. **Creative Clusters** — cluster cards: label, sample creatives, advertiser count,
   momentum chart.
5. **Ad Detail** — full AI analysis, snapshot history chart, similar ads (same cluster).
6. **Alerts** — rule builder supporting at least: (a) new ads matching niche+country with
   Hot Score > X (e.g., "sofa cleaning in Israel, Hot Score > 80"); (b) niche breakout
   (Opportunity/Growth crosses threshold in a country); (c) offer adoption (an offer appears
   across ≥ N advertisers within M days). Delivery: in-app + email. Evaluated by cron.
7. **Competitor Watch** — add advertisers to a watchlist; show New Ads, Removed Ads,
   Longest Running Ads, New Offers, Creative Changes (diff of creative content_hash).
   Landing-page change tracking only via lawful HTTP fetch of the advertiser's own public
   landing URL (respect robots.txt) — content hash diff, no crawling beyond the stored URL.
8. **Global filters** (persisted in URL): Country (Israel must be a first-class option),
   City/Region only where the source provides it, Language, Industry/Niche, Platform, Date
   range, Ad Type, Hot Score range, Trend Score, Advertiser search.
9. **Settings** — org, members, connector status page (last sync, cursor, errors, what each
   connector can/cannot fetch per market — this is where the honesty lives).

## 7. Build order — work phase by phase; each phase ends green

Before writing code: if the repo's `AGENTS.md`/`CLAUDE.md` points at framework docs (e.g.
`node_modules/next/dist/docs/`), read the relevant guides first — the installed framework
version may differ from your training data. Then, for each phase: plan → implement →
`lint`, `typecheck`, unit tests for scoring/connectors (mock API payloads with realistic
fixtures marked as fixtures) → commit.

- **Phase 0 — Foundation**: monorepo scaffold, Supabase project + all migrations + RLS,
  auth, i18n (en/he + RTL), design system (cards, badges incl. provenance badges, score
  gauge, empty states), connector-status page. *Done when a user signs up and sees an
  honest empty shell.*
- **Phase 1 — Ingest**: `Connector` interface (`fetchSince(cursor)` → raw_ingest →
  normalizer). Implement: Meta Ad Library (EU + political), Google Trends provider,
  YouTube. Cron scheduling + retries + rate-limit budgets. *Done when real ads and trend
  series persist with daily snapshots.*
- **Phase 2 — Scoring & Feed**: daily rollups, Hot Score job, dashboard + feed + full
  filters. *Done when real ads show scores with breakdown + confidence.*
- **Phase 3 — AI layer**: analysis endpoint + batch, offers extraction, embeddings,
  clustering job, Clusters screen, Trending Offers screen. *Done when Analyze-with-AI works
  end-to-end on real ads and clusters form.*
- **Phase 4 — Niches & Opportunities**: Keyword Planner connector, niche_metrics_daily,
  Hot Niches screen, Opportunity Finder screen + weekly briefs. *Done for at least EU + IL
  (IL powered by trends/keyword/YouTube per the Israel strategy).*
- **Phase 5 — Alerts & Competitor Watch**: rule builder, cron evaluator, email delivery,
  watchlist + competitor events, user-assisted import flow for IL ads, TikTok Commercial
  Content connector. *Done when the three example alert types fire on real conditions.*
- **Phase 6 — Commercial hardening**: snapshot partitioning, query performance for millions
  of ads, Stripe billing + plans, seats, audit log, `LicensedDataProvider` interface stub,
  observability (structured logs, job dashboards).

Secrets via env only (`.env.example` documenting every key: META_ACCESS_TOKEN,
TIKTOK_CCL_TOKEN, GOOGLE_ADS_*, YOUTUBE_API_KEY, ANTHROPIC_API_KEY, STRIPE_*, …). If a
credential is missing, the connector reports "not configured" on the status page — the app
still runs honestly without it.

Start with Phase 0 now. At the end of each phase, summarize what is real, what is derived,
what is AI-estimated, and what is not yet covered per market.
