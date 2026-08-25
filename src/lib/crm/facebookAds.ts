import { saveFbAdsConfig, type FbAdsConfig } from '@/lib/crm/settings';

/**
 * Reads ad spend straight from the Facebook Marketing API (Graph API), which
 * serves CORS, so the browser can call it directly with the admin's token —
 * no server in the middle. Requires a token with the ads_read permission.
 */

// Overridable so the local mock can stand in for Graph during development.
const GRAPH_BASE = process.env.NEXT_PUBLIC_FB_GRAPH_BASE ?? 'https://graph.facebook.com';
const GRAPH_VERSION = 'v21.0';

export interface AdSpend {
  today: number;
  /** Sunday-based current week — the Israeli work week. */
  week: number;
  month: number;
  year: number;
  currency: string;
  /** Messaging conversations started (the "פניות") per period. */
  todayConversations: number;
  weekConversations: number;
  monthConversations: number;
  yearConversations: number;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function graphError(body: any): Error {
  const code = body?.error?.code;
  const raw = body?.error?.message ? ` (Facebook: ${body.error.message})` : '';
  if (code === 190) return new Error(`הטוקן פג תוקף או שגוי — צור טוקן חדש ועדכן בהגדרות.${raw}`);
  if (code === 100 || code === 803)
    return new Error(`מזהה חשבון המודעות לא נמצא — בדוק את המספר.${raw}`);
  if (code === 10 || code === 200 || code === 294)
    return new Error(
      `לטוקן אין הרשאה מתאימה לחשבון המודעות: לצפייה נדרשת ads_read, ולעריכת קמפיינים נדרשת גם ads_management.${raw}`,
    );
  return new Error(body?.error?.message ?? 'שליפת נתוני הפרסום נכשלה.');
}

export interface AdAccountOption {
  accountId: string;
  name: string;
}

/** The ad accounts the pasted token can actually read — for the picker. */
export async function listAdAccounts(accessToken: string): Promise<AdAccountOption[]> {
  const url =
    `${GRAPH_BASE}/${GRAPH_VERSION}/me/adaccounts` +
    `?fields=account_id,name&limit=50&access_token=${encodeURIComponent(accessToken.trim())}`;
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw graphError(body);
  return (body?.data ?? []).map((row: any) => ({
    accountId: String(row.account_id ?? '').trim(),
    name: row.name ?? '',
  }));
}

/** Sums messaging-conversation actions out of the insights actions list. */
function countConversations(actions: { action_type?: string; value?: string }[] | undefined): number {
  if (!actions) return 0;
  return actions
    .filter((a) => a.action_type?.includes('messaging_conversation_started'))
    .reduce((sum, a) => sum + Number(a.value ?? 0), 0);
}

async function fetchPreset(
  config: FbAdsConfig,
  /** A ready query — `date_preset=...` or an explicit `time_range=...`. */
  rangeQuery: string,
): Promise<{ spend: number; currency: string | null; conversations: number }> {
  const account = config.accountId.replace(/^act_/, '').trim();
  const url =
    `${GRAPH_BASE}/${GRAPH_VERSION}/act_${account}/insights` +
    `?${rangeQuery}&fields=spend,account_currency,actions` +
    `&access_token=${encodeURIComponent(config.accessToken)}`;

  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw graphError(body);

  const row = body?.data?.[0];
  return {
    spend: row?.spend ? Number(row.spend) : 0,
    currency: row?.account_currency ?? null,
    conversations: countConversations(row?.actions),
  };
}

export async function fetchAdSpend(config: FbAdsConfig): Promise<AdSpend> {
  // today+month are the section's backbone — their failure is a real error.
  // week/year vary more across accounts; a failure there degrades to zero
  // instead of blanking the whole panel. The week is an explicit Sunday-based
  // time_range — the this_week_sun_sat preset fails on some accounts.
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const now = new Date();
  const sunday = new Date(now);
  sunday.setDate(now.getDate() - now.getDay());
  const weekQuery = `time_range=${encodeURIComponent(JSON.stringify({ since: iso(sunday), until: iso(now) }))}`;

  const empty = { spend: 0, currency: null, conversations: 0 };
  const [today, month, weekResult, yearResult] = await Promise.all([
    fetchPreset(config, 'date_preset=today'),
    fetchPreset(config, 'date_preset=this_month'),
    fetchPreset(config, weekQuery).catch(() => empty),
    fetchPreset(config, 'date_preset=this_year').catch(() => empty),
  ]);
  const week = weekResult;
  const year = yearResult;
  return {
    today: today.spend,
    week: week.spend,
    month: month.spend,
    year: year.spend,
    currency: year.currency ?? month.currency ?? today.currency ?? 'ILS',
    todayConversations: today.conversations,
    weekConversations: week.conversations,
    monthConversations: month.conversations,
    yearConversations: year.conversations,
  };
}

export interface SpendPoint {
  /** ISO date the bucket starts on (YYYY-MM-DD). */
  start: string;
  spend: number;
  conversations: number;
}

/**
 * A spend time-series from insights — one point per month over the account's
 * whole lifetime, or one per day — following Graph's paging links.
 */
export async function fetchSpendSeries(
  config: FbAdsConfig,
  options: {
    timeIncrement: 'monthly' | 1;
    datePreset?: string;
    /** Explicit since/until range instead of a preset — the custom picker. */
    timeRange?: { since: string; until: string };
  },
): Promise<SpendPoint[]> {
  const account = config.accountId.replace(/^act_/, '').trim();
  const range = options.timeRange
    ? `time_range=${encodeURIComponent(JSON.stringify(options.timeRange))}`
    : `date_preset=${options.datePreset}`;
  let url: string | null =
    `${GRAPH_BASE}/${GRAPH_VERSION}/act_${account}/insights` +
    `?${range}&time_increment=${options.timeIncrement}` +
    `&fields=spend,actions&limit=100` +
    `&access_token=${encodeURIComponent(config.accessToken)}`;

  const points: SpendPoint[] = [];
  // A few pages cover years of monthly rows; the cap is a runaway guard.
  for (let page = 0; page < 8 && url; page++) {
    const response: Response = await fetch(url);
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: any = await response.json().catch(() => null);
    if (!response.ok) throw graphError(body);
    for (const row of body?.data ?? []) {
      points.push({
        start: row.date_start,
        spend: row.spend ? Number(row.spend) : 0,
        conversations: countConversations(row.actions),
      });
    }
    url = body?.paging?.next ?? null;
  }
  points.sort((a, b) => (a.start < b.start ? -1 : 1));
  return points;
}

export interface CampaignWindow {
  spend: number;
  conversations: number;
  impressions: number;
  clicks: number;
  /** Clicks-to-impressions percentage, straight from Graph (0 when unknown). */
  ctr: number;
  /** Average times each person saw the ads in the window. */
  frequency: number;
}

export interface CampaignPerf {
  campaignId: string;
  name: string;
  /** Graph effective_status — ACTIVE, PAUSED, ... */
  status: string;
  /** Daily budget in whole currency units; null when budget lives on ad sets (CBO off). */
  dailyBudget: number | null;
  /** Last 30 days, including today. */
  d30: CampaignWindow;
  /** Last 7 days, including today. */
  d7: CampaignWindow;
  /** The 7 days before those — the momentum baseline. */
  prev7: CampaignWindow;
}

const emptyWindow = (): CampaignWindow => ({
  spend: 0,
  conversations: 0,
  impressions: 0,
  clicks: 0,
  ctr: 0,
  frequency: 0,
});

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function windowOfRow(row: any): CampaignWindow {
  return {
    spend: row?.spend ? Number(row.spend) : 0,
    conversations: countConversations(row?.actions),
    impressions: row?.impressions ? Number(row.impressions) : 0,
    clicks: row?.clicks ? Number(row.clicks) : 0,
    ctr: row?.ctr ? Number(row.ctr) : 0,
    frequency: row?.frequency ? Number(row.frequency) : 0,
  };
}

/** One insights call at campaign level for an explicit since/until range. */
async function fetchCampaignWindow(
  config: FbAdsConfig,
  range: { since: string; until: string },
): Promise<Map<string, CampaignWindow>> {
  const account = config.accountId.replace(/^act_/, '').trim();
  const url =
    `${GRAPH_BASE}/${GRAPH_VERSION}/act_${account}/insights` +
    `?level=campaign&time_range=${encodeURIComponent(JSON.stringify(range))}` +
    `&fields=campaign_id,campaign_name,spend,actions,impressions,clicks,ctr,frequency` +
    `&limit=100&access_token=${encodeURIComponent(config.accessToken)}`;
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw graphError(body);
  const map = new Map<string, CampaignWindow>();
  for (const row of body?.data ?? []) {
    if (row?.campaign_id) map.set(String(row.campaign_id), windowOfRow(row));
  }
  return map;
}

/**
 * Per-campaign performance for the optimizer: the last 30 days, the last 7
 * and the 7 before them, merged with each campaign's name, status and daily
 * budget. Campaigns with no spend in the last 30 days are left out.
 */
export async function fetchCampaignPerf(config: FbAdsConfig): Promise<CampaignPerf[]> {
  const account = config.accountId.replace(/^act_/, '').trim();
  const iso = (d: Date) =>
    `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return iso(d);
  };
  const today = daysAgo(0);

  const metaUrl =
    `${GRAPH_BASE}/${GRAPH_VERSION}/act_${account}/campaigns` +
    `?fields=id,name,effective_status,daily_budget,created_time&limit=100` +
    `&access_token=${encodeURIComponent(config.accessToken)}`;

  const [metaResponse, d30, d7, prev7] = await Promise.all([
    fetch(metaUrl),
    fetchCampaignWindow(config, { since: daysAgo(29), until: today }),
    // The short windows are momentum detail — degrade to empty on failure.
    fetchCampaignWindow(config, { since: daysAgo(6), until: today }).catch(
      () => new Map<string, CampaignWindow>(),
    ),
    fetchCampaignWindow(config, { since: daysAgo(13), until: daysAgo(7) }).catch(
      () => new Map<string, CampaignWindow>(),
    ),
  ]);
  const metaBody = await metaResponse.json().catch(() => null);
  if (!metaResponse.ok) throw graphError(metaBody);

  const campaigns: CampaignPerf[] = [];
  for (const row of metaBody?.data ?? []) {
    const id = String(row?.id ?? '');
    if (!id) continue;
    const window = d30.get(id) ?? emptyWindow();
    const status = row?.effective_status ?? 'UNKNOWN';
    const createdDaysAgo = row?.created_time
      ? (Date.now() - Date.parse(row.created_time)) / 86_400_000
      : Number.POSITIVE_INFINITY;
    // Spenders always show. Beyond them, only active campaigns and fresh
    // drafts (e.g. a paused duplicate just created here) — not years of
    // old paused/archived campaigns.
    const relevant = window.spend > 0 || status === 'ACTIVE' || (status === 'PAUSED' && createdDaysAgo <= 30);
    if (!relevant) continue;
    // daily_budget arrives in minor units (agorot/cents).
    const budget = row?.daily_budget ? Number(row.daily_budget) / 100 : null;
    campaigns.push({
      campaignId: id,
      name: row?.name ?? `קמפיין ${id}`,
      status,
      dailyBudget: budget && budget > 0 ? budget : null,
      d30: window,
      d7: d7.get(id) ?? emptyWindow(),
      prev7: prev7.get(id) ?? emptyWindow(),
    });
  }
  campaigns.sort((a, b) => b.d30.spend - a.d30.spend);
  return campaigns;
}

/* ---------- Campaign management (needs a token with ads_management) ---------- */

/**
 * Form-encoded Graph POST. Kept header-free so the browser sends it as a
 * CORS "simple request" — no preflight, same as the read calls.
 */
async function graphPost(
  config: FbAdsConfig,
  path: string,
  params: Record<string, string>,
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
): Promise<any> {
  const body = new URLSearchParams({ ...params, access_token: config.accessToken });
  const response = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${path}`, { method: 'POST', body });
  const json = await response.json().catch(() => null);
  if (!response.ok) throw graphError(json);
  return json;
}

/** Works on any ad object — campaign, ad set, or ad. */
export async function setObjectStatus(
  config: FbAdsConfig,
  objectId: string,
  status: 'ACTIVE' | 'PAUSED',
): Promise<void> {
  await graphPost(config, objectId, { status });
}

/** budget in whole currency units (₪); Graph wants minor units. */
export async function setCampaignBudget(
  config: FbAdsConfig,
  campaignId: string,
  dailyBudget: number,
): Promise<void> {
  await graphPost(config, campaignId, { daily_budget: String(Math.round(dailyBudget * 100)) });
}

export async function setAdSetBudget(
  config: FbAdsConfig,
  adSetId: string,
  dailyBudget: number,
): Promise<void> {
  await graphPost(config, adSetId, { daily_budget: String(Math.round(dailyBudget * 100)) });
}

/**
 * Copies a whole campaign (ad sets + ads) as a PAUSED draft — the practical
 * way to "add a campaign" here: duplicate a working one, adjust budget and
 * cities, then activate. Returns the new campaign's id.
 */
export async function duplicateCampaign(
  config: FbAdsConfig,
  campaignId: string,
  newName?: string,
): Promise<string> {
  const result = await graphPost(config, `${campaignId}/copies`, {
    deep_copy: 'true',
    status_option: 'PAUSED',
  });
  const newId = String(result?.copied_campaign_id ?? result?.ad_object_ids?.[0]?.copied_id ?? '');
  if (!newId) throw new Error('השכפול הצליח אך המזהה החדש לא התקבל — רענן את העמוד.');
  if (newName) await graphPost(config, newId, { name: newName });
  return newId;
}

export interface TargetedCity {
  /** Graph adgeolocation key. */
  key: string;
  name: string;
  region?: string;
  /** Kilometers around the city. */
  radius?: number;
}

export interface AdSetTargeting {
  adSetId: string;
  name: string;
  status: string;
  dailyBudget: number | null;
  cities: TargetedCity[];
  /** Country codes targeted when no cities are set (e.g. ["IL"]). */
  countries: string[];
  /** The full targeting object as read — written back on save. */
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  raw: any;
}

/** The campaign's ad sets with their current geo targeting. */
export async function fetchAdSets(
  config: FbAdsConfig,
  campaignId: string,
): Promise<AdSetTargeting[]> {
  const url =
    `${GRAPH_BASE}/${GRAPH_VERSION}/${campaignId}/adsets` +
    `?fields=id,name,effective_status,daily_budget,targeting&limit=50` +
    `&access_token=${encodeURIComponent(config.accessToken)}`;
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw graphError(body);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return (body?.data ?? []).map((row: any) => {
    const geo = row?.targeting?.geo_locations ?? {};
    return {
      adSetId: String(row.id),
      name: row.name ?? '',
      status: row.effective_status ?? 'UNKNOWN',
      dailyBudget: row.daily_budget ? Number(row.daily_budget) / 100 : null,
      /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
      cities: (geo.cities ?? []).map((c: any) => ({
        key: String(c.key),
        name: c.name ?? String(c.key),
        region: c.region,
        radius: c.radius ? Number(c.radius) : undefined,
      })),
      countries: geo.countries ?? [],
      raw: row.targeting ?? {},
    };
  });
}

export interface AdInfo {
  adId: string;
  name: string;
  status: string;
  /** Small creative preview image, when Graph provides one. */
  thumbnailUrl: string | null;
}

/** The ads inside one ad set, with creative thumbnails for recognition. */
export async function fetchAds(config: FbAdsConfig, adSetId: string): Promise<AdInfo[]> {
  const url =
    `${GRAPH_BASE}/${GRAPH_VERSION}/${adSetId}/ads` +
    `?fields=id,name,effective_status,creative{thumbnail_url}&limit=50` +
    `&access_token=${encodeURIComponent(config.accessToken)}`;
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw graphError(body);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return (body?.data ?? []).map((row: any) => ({
    adId: String(row.id),
    name: row.name ?? '',
    status: row.effective_status ?? 'UNKNOWN',
    thumbnailUrl: row.creative?.thumbnail_url ?? null,
  }));
}

/** Israeli cities matching the query — for the targeting picker. */
export async function searchCities(
  config: FbAdsConfig,
  query: string,
): Promise<TargetedCity[]> {
  const url =
    `${GRAPH_BASE}/${GRAPH_VERSION}/search` +
    `?type=adgeolocation&location_types=${encodeURIComponent('["city"]')}` +
    `&country_code=IL&locale=he_IL&limit=10&q=${encodeURIComponent(query)}` +
    `&access_token=${encodeURIComponent(config.accessToken)}`;
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  if (!response.ok) throw graphError(body);
  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  return (body?.data ?? []).map((row: any) => ({
    key: String(row.key),
    name: row.name ?? '',
    region: row.region,
  }));
}

/** Kilometers around each targeted city; Facebook's minimum is 17km ≈ 10mi. */
export const CITY_RADIUS_KM = 17;

/**
 * Replaces the ad set's geo targeting: the given cities (each with a
 * CITY_RADIUS_KM ring), or the whole country when the list is empty. The
 * rest of the targeting object is written back unchanged.
 */
export async function setAdSetCities(
  config: FbAdsConfig,
  adSet: AdSetTargeting,
  cities: TargetedCity[],
): Promise<void> {
  const geo = cities.length
    ? {
        cities: cities.map((c) => ({
          key: c.key,
          radius: c.radius ?? CITY_RADIUS_KM,
          distance_unit: 'kilometer',
        })),
      }
    : { countries: adSet.countries.length ? adSet.countries : ['IL'] };
  const targeting = { ...adSet.raw, geo_locations: geo };
  await graphPost(config, adSet.adSetId, { targeting: JSON.stringify(targeting) });
}

/**
 * Trades the current token for a fresh long-lived one (~60 days). Requires
 * the app id + secret; returns null when they're missing or Graph refuses.
 */
export async function exchangeForLongLived(config: FbAdsConfig): Promise<string | null> {
  if (!config.appId || !config.appSecret) return null;
  const url =
    `${GRAPH_BASE}/${GRAPH_VERSION}/oauth/access_token` +
    `?grant_type=fb_exchange_token&client_id=${encodeURIComponent(config.appId)}` +
    `&client_secret=${encodeURIComponent(config.appSecret)}` +
    `&fb_exchange_token=${encodeURIComponent(config.accessToken)}`;
  const response = await fetch(url);
  const body = await response.json().catch(() => null);
  if (!response.ok || !body?.access_token) return null;
  return body.access_token as string;
}

/** Renew well before the ~60-day expiry; each renewal restarts the clock. */
const RENEW_AFTER_DAYS = 20;

/**
 * fetchAdSpend with self-renewal: when app credentials are stored and the
 * token is older than RENEW_AFTER_DAYS, it is exchanged for a fresh
 * long-lived one and persisted before fetching. As long as the app gets
 * opened once in ~60 days, the token never expires.
 */
export async function fetchAdSpendManaged(config: FbAdsConfig): Promise<AdSpend> {
  const ageDays = config.tokenSavedAt
    ? (Date.now() - Date.parse(config.tokenSavedAt)) / 86_400_000
    : Number.POSITIVE_INFINITY;
  if (config.appId && config.appSecret && ageDays > RENEW_AFTER_DAYS) {
    const fresh = await exchangeForLongLived(config);
    if (fresh) {
      config = { ...config, accessToken: fresh, tokenSavedAt: new Date().toISOString() };
      await saveFbAdsConfig(config).catch(() => {});
    }
  }
  return fetchAdSpend(config);
}

/** The compact "X פניות · ₪Y לפנייה" line under a spend figure. */
export function conversationsLine(
  conversations: number,
  spend: number,
  currency: string,
): string {
  const base = `${conversations.toLocaleString('he-IL')} פניות`;
  if (conversations <= 0) return base;
  return `${base} · ${formatSpend(spend / conversations, currency)} לפנייה`;
}

export function formatSpend(amount: number, currency: string): string {
  const rounded = Math.round(amount);
  if (currency === 'ILS') return `₪${rounded.toLocaleString('he-IL')}`;
  if (currency === 'USD') return `$${rounded.toLocaleString('he-IL')}`;
  if (currency === 'EUR') return `€${rounded.toLocaleString('he-IL')}`;
  return `${rounded.toLocaleString('he-IL')} ${currency}`;
}
