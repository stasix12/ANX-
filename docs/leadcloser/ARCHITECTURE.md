# LeadCloser AI — Architecture Plan

> "Turn incoming leads into booked jobs automatically."
> An AI sales & lead-closing platform for local service businesses. First vertical:
> upholstery & mattress cleaning. Industry templates make further verticals a data change.

The product lives inside this repository under the `/lc` route prefix so the existing
ANX3D storefront (`/`), its admin panel (`/admin`) and the single-business CRM (`/crm`)
keep working untouched. Everything LeadCloser-specific sits in three folders:

| Folder | Contents |
| --- | --- |
| `src/lib/lc/` | Domain core: types, i18n, pricing engine, scheduling engine, AI agent, automations, analytics, demo seed, store abstraction, provider adapters, React context |
| `src/components/lc/` | UI kit (`ui/`), charts (`charts/`), app shell and feature components |
| `src/app/lc/` | Routes (pages). `src/app/api/lc/` holds the server-side route handlers |

## 1. Architecture

```
                 ┌───────────────────────────────────────────────────────────┐
  WhatsApp /     │  Next.js (App Router, strict TS, Tailwind v4)             │
  Website form ─►│  /api/lc/intake  ──► LeadIntake ─► AgentEngine ─► Store   │
                 │  /api/lc/agent/reply (server-side AI turn)                │
                 │                                                           │
  Owner (PWA) ──►│  /lc/*  pages ──► useLc() context ──► LcClient            │
                 │                                   │  (optimistic state)   │
                 │        Pure-TS engines ◄──────────┤                       │
                 │        pricing · scheduling ·     ▼                       │
                 │        agent · automations     LcStore (interface)        │
                 │                                 ├─ LocalStore  (demo, browser, seeded)
                 │                                 └─ SupabaseStore (multi-tenant, RLS)
                 └───────────────────────────────────────────────────────────┘
                                                Adapters (mock ⇄ real):
                                                messaging · ai · payments · reviews · ads
```

Principles

- **Engines are pure TypeScript.** Pricing, availability, the AI conversation state machine,
  automations and analytics take plain data in and return plain data out. They run in the
  browser (demo mode) and on the server (API routes) unchanged.
- **One data interface, two stores.** `LcStore` is a small collection-based contract
  (`loadSnapshot`, `put`, `putMany`, `remove`). `LocalStore` keeps a seeded, realistic
  workspace in `localStorage` so the product is alive on first open with zero setup.
  `SupabaseStore` maps the same collections onto real tables with `organization_id` on
  every row and Row Level Security. Switching stores changes no UI code.
- **Adapters, not integrations.** WhatsApp, the AI provider, payments, Google reviews and
  ad platforms are interfaces with mock implementations. Real ones drop in later.
- **Multi-tenant from day one.** Every table carries `organization_id`; RLS policies use a
  `is_org_member(org_id)` helper so a business can never read another business's rows.
- **Mobile first.** Desktop gets a sidebar; phones get a bottom tab bar
  (Home · Inbox · Jobs · Calendar · More). Incoming leads pulse in the tab bar badge.
- **Localised and directional.** UI languages: Hebrew (RTL), Russian, English. The layout
  flips direction from the locale; the agent answers each customer in the customer's language.

## 2. Database schema (see `supabase/leadcloser-schema.sql`)

| Table | Purpose / notable columns |
| --- | --- |
| `lc_organizations` | id, name, slug, industry, locale, currency, timezone, onboarding_step, active |
| `lc_users` | profile mirror of `auth.users` (id, email, full_name) |
| `lc_organization_members` | organization_id, user_id, role (`owner`/`admin`/`worker`), worker_id |
| `lc_customers` | name, phone, language, addresses[] (jsonb), city, notes, tags, source, lifetime_value, last_contact_at |
| `lc_leads` | customer_id, source, status, language, channel, qualification (jsonb), lost_reason, ai_handled, assigned_to |
| `lc_conversations` | lead_id, customer_id, channel, language, status (`new`/`ai`/`waiting`/`quote_sent`/`booked`/`lost`/`human`), ai_paused, unread_count, last_message_at |
| `lc_messages` | conversation_id, sender (`customer`/`ai`/`owner`/`system`), text, attachments (jsonb), meta (jsonb: extracted fields, quote id...) |
| `lc_services` | name (jsonb i18n), base_price, unit, duration_min, category, active, sort_order |
| `lc_pricing_rules` | type (`min_order`/`quantity_discount`/`package_discount`/`location_surcharge`/`urgent_surcharge`/`extra`/`custom`), config (jsonb), active |
| `lc_quotes` | lead_id, conversation_id, items (jsonb), subtotal, adjustments (jsonb), total, status, sent_at, expires_at |
| `lc_bookings` | lead_id, quote_id, customer_id, start_at, end_at, worker_id, status |
| `lc_jobs` | booking_id, customer_id, worker_id, service_summary, address, city, scheduled_at, duration_min, price, payment_status, status, internal_notes, customer_notes, photos (jsonb), lead_source |
| `lc_workers` | name, phone, role, color, working_hours (jsonb), service_areas[], can_see_prices (bool), active |
| `lc_automations` | key, name, trigger, delay_minutes, enabled, message (jsonb per language), language |
| `lc_automation_runs` | automation_id, entity_type, entity_id, scheduled_at, sent_at, status, channel, rendered_message |
| `lc_lead_sources` | key, name, ad_cost_month (for future ROAS), enabled |
| `lc_ai_agent_settings` | one row per org: agent_name, tone, languages[], greeting (jsonb), description, service_areas[], working_hours (jsonb), faqs (jsonb), never_say[], handoff_rules (jsonb), booking rules |
| `lc_subscriptions` | plan (`starter`/`pro`/`business`), status, period_end, limits (jsonb), provider (`mock`/`stripe`), external_id |
| `lc_activity_logs` | actor, entity_type, entity_id, action, payload (jsonb) |

RLS: every table has `organization_id` (except users/members) and four policies
(select/insert/update/delete) that require `public.lc_is_member(organization_id)`.
Financial columns (`price`, `total`, `lifetime_value`) are additionally hidden from members
with role `worker` when the worker record has `can_see_prices = false` through the
`lc_jobs_for_worker` view.

## 3. Route structure

| Route | Screen |
| --- | --- |
| `/lc/login` | Sign in / sign up (Supabase Auth) or open the demo workspace |
| `/lc/onboarding` | 7-step wizard with progress indicator |
| `/lc` | Dashboard — money generated, today / this month, funnel, sources, recovered revenue |
| `/lc/inbox` · `/lc/inbox?c=<id>` | Unified inbox: conversation list + premium chat view, Take Over / Return to AI |
| `/lc/agent` | AI sales agent settings + live test chat |
| `/lc/pricing` | Services & smart pricing rules + quote simulator |
| `/lc/calendar` | Day / week / month, working hours, blocked times |
| `/lc/jobs` · `/lc/jobs?j=<id>` | Jobs board and job detail (status flow, worker assignment, photos, payment) |
| `/lc/customers` · `/lc/customers?id=<id>` | Customer database with timeline |
| `/lc/workers` | Workers, hours, service areas, hide-price permission |
| `/lc/automations` | Automation center + follow-up sequences & recovered stats |
| `/lc/analytics` | Sources, conversion, revenue, AI vs human, lost reasons, cities, services, best hours |
| `/lc/billing` | Plans (Starter ₪199 · Pro ₪399 · Business ₪699), limits, usage |
| `/lc/settings` | Business profile, languages, team, integrations (adapters), data & demo reset |
| `POST /api/lc/intake` | Public lead intake (website form / WhatsApp webhook mock) → lead + conversation + first AI reply |
| `POST /api/lc/agent/reply` | Server-side AI turn (mock provider by default, Anthropic when configured) |
| `POST /api/lc/quote` | Server-side price calculation with the org's pricing rules |

Detail views use query params (`?c=`, `?j=`, `?id=`) rather than dynamic segments so the
repository's static export (`npm run export`) keeps building; API route files use the
`.api.ts` extension which `next.config.mjs` only registers outside export builds.

## 4. Component structure

```
components/lc/
  Shell.tsx              sidebar (≥lg) + top bar + bottom tab bar (<lg), locale switch, lead badge
  ui/                    Button, Card, Badge, Stat, Input, Select, Textarea, Toggle, Tabs,
                         Modal, Sheet, Toast (provider + hook), Skeleton, EmptyState,
                         Avatar, Segmented, Progress, Kbd, PageHeader
  charts/                AreaChart (revenue), BarChart (sources), Funnel, Donut, Sparkline —
                         hand-rolled SVG, one hue per job, hover tooltips
  dashboard/             MoneyCard, KpiGrid, FunnelCard, SourcesCard, RecoveredCard, LiveFeed
  inbox/                 ConversationList, ConversationView, MessageBubble, Composer,
                         LeadSidePanel, StatusPill
  agent/                 AgentForm sections, TonePicker, LanguagePicker, TestChat
  pricing/               ServiceTable, RuleEditor, QuoteSimulator
  calendar/              DayView, WeekView, MonthView, SlotPicker, BookingCard
  jobs/                  JobCard, JobDetail, StatusStepper, WorkerAssign, PhotoGrid
  customers/             CustomerCard, CustomerProfile, Timeline
  automations/           AutomationRow, FollowUpSequence
  onboarding/            Stepper, Step1..7
```

## 5. MVP implementation order

1. Domain types, i18n, formatting helpers
2. Pricing engine + tests-in-code (quote simulator)
3. Scheduling engine (availability, slots, double-booking guard)
4. AI agent conversation engine (language detection, entity extraction, qualification flow,
   quoting via pricing engine, slot offer, booking creation, human hand-off, honesty rule)
5. Demo seed (customers, RU/HE conversations, quotes, bookings, jobs, revenue, workers)
6. Store abstraction: LocalStore (seeded) + SupabaseStore; React context + client
7. UI kit, theme (light, RTL/LTR), shell with sidebar/bottom nav
8. Dashboard → Inbox → Agent settings → Calendar (the four screenshot screens)
9. Pricing, Jobs, Customers, Workers, Automations & follow-ups, Analytics, Billing, Settings
10. Onboarding wizard and login
11. API routes, SQL schema + RLS, README
12. Typecheck, build, end-to-end flow test (lead → AI → quote → slot → booking → job → dashboard)
