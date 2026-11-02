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
    return new Error(`לטוקן אין הרשאת ads_read לחשבון המודעות הזה.${raw}`);
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
    `?fields=id,name,effective_status,daily_budget&limit=100` +
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

  /* eslint-disable-next-line @typescript-eslint/no-explicit-any */
  const meta = new Map<string, any>(
    (metaBody?.data ?? []).map((row: { id?: string }) => [String(row.id ?? ''), row]),
  );

  const campaigns: CampaignPerf[] = [];
  for (const [id, window] of d30) {
    if (window.spend <= 0) continue;
    const row = meta.get(id);
    // daily_budget arrives in minor units (agorot/cents).
    const budget = row?.daily_budget ? Number(row.daily_budget) / 100 : null;
    campaigns.push({
      campaignId: id,
      name: row?.name ?? `קמפיין ${id}`,
      status: row?.effective_status ?? 'UNKNOWN',
      dailyBudget: budget && budget > 0 ? budget : null,
      d30: window,
      d7: d7.get(id) ?? emptyWindow(),
      prev7: prev7.get(id) ?? emptyWindow(),
    });
  }
  campaigns.sort((a, b) => b.d30.spend - a.d30.spend);
  return campaigns;
}

/* ------------------------------------------------ campaign management --- */

/* eslint-disable-next-line @typescript-eslint/no-explicit-any */
function manageError(body: any): Error {
  const code = body?.error?.code;
  if (code === 10 || code === 200 || code === 270 || code === 294) {
    return new Error(
      'לטוקן אין הרשאת ניהול (ads_management). צור טוקן חדש ב-Graph API Explorer עם ההרשאות ads_read + ads_management, ועדכן בהגדרות.',
    );
  }
  return graphError(body);
}

/** Form-encoded POST to a Graph node — Graph serves CORS on writes too. */
async function graphPost(
  config: FbAdsConfig,
  path: string,
  params: Record<string, string>,
): Promise<void> {
  const body = new URLSearchParams({ ...params, access_token: config.accessToken });
  const response = await fetch(`${GRAPH_BASE}/${GRAPH_VERSION}/${path}`, {
    method: 'POST',
    body,
  });
  const json = await response.json().catch(() => null);
  if (!response.ok || json?.error) throw manageError(json);
}

/** Pause or resume a campaign — the Ads Manager toggle, from the app. */
export async function setCampaignStatus(
  config: FbAdsConfig,
  campaignId: string,
  active: boolean,
): Promise<void> {
  await graphPost(config, campaignId, { status: active ? 'ACTIVE' : 'PAUSED' });
}

/** Pause or resume a single ad inside a campaign. */
export async function setAdStatus(
  config: FbAdsConfig,
  adId: string,
  active: boolean,
): Promise<void> {
  await graphPost(config, adId, { status: active ? 'ACTIVE' : 'PAUSED' });
}

/** Change an ad set's daily budget (for campaigns budgeted at set level). */
export async function setAdSetDailyBudget(
  config: FbAdsConfig,
  adsetId: string,
  shekels: number,
): Promise<void> {
  await graphPost(config, adsetId, { daily_budget: String(Math.round(shekels * 100)) });
}

export interface AdInfo {
  adId: string;
  name: string;
  status: string;
  /** Creative preview image, when Graph exposes one. */
  thumbnailUrl: string | null;
  /** Last 30 days. */
  spend: number;
  conversations: number;
}

export interface AdSetInfo {
  adsetId: string;
  name: string;
  status: string;
  /** Whole currency units; null when the budget is lifetime/campaign-level. */
  dailyBudget: number | null;
}

export interface CampaignDetail {
  ads: AdInfo[];
  adsets: AdSetInfo[];
}

/**
 * Inside one campaign: its ads with creative thumbnails and 30-day results,
 * plus its ad sets and their budgets — the drill-down view.
 */
export async function fetchCampaignDetail(
  config: FbAdsConfig,
  campaignId: string,
): Promise<CampaignDetail> {
  const token = `access_token=${encodeURIComponent(config.accessToken)}`;
  const adsUrl =
    `${GRAPH_BASE}/${GRAPH_VERSION}/${campaignId}/ads` +
    `?fields=id,name,effective_status,creative.thumbnail_width(256).thumbnail_height(256){thumbnail_url}` +
    `&limit=50&${token}`;
  const adsetsUrl =
    `${GRAPH_BASE}/${GRAPH_VERSION}/${campaignId}/adsets` +
    `?fields=id,name,effective_status,daily_budget&limit=25&${token}`;
  const insightsUrl =
    `${GRAPH_BASE}/${GRAPH_VERSION}/${campaignId}/insights` +
    `?level=ad&fields=ad_id,spend,actions&date_preset=last_30d&limit=100&${token}`;

  const [adsRes, adsetsRes, insightsRes] = await Promise.all([
    fetch(adsUrl),
    fetch(adsetsUrl),
    fetch(insightsUrl).catch(() => null),
  ]);
  const adsBody = await adsRes.json().catch(() => null);
  if (!adsRes.ok) throw graphError(adsBody);
  const adsetsBody = await adsetsRes.json().catch(() => null);
  const insightsBody = insightsRes ? await insightsRes.json().catch(() => null) : null;

  const perf = new Map<string, { spend: number; conversations: number }>();
  for (const row of insightsBody?.data ?? []) {
    if (row?.ad_id) {
      perf.set(String(row.ad_id), {
        spend: row.spend ? Number(row.spend) : 0,
        conversations: countConversations(row.actions),
      });
    }
  }

  /* eslint-disable @typescript-eslint/no-explicit-any */
  const ads: AdInfo[] = (adsBody?.data ?? []).map((row: any) => ({
    adId: String(row.id),
    name: row.name ?? '',
    status: row.effective_status ?? 'UNKNOWN',
    thumbnailUrl: row.creative?.thumbnail_url ?? null,
    spend: perf.get(String(row.id))?.spend ?? 0,
    conversations: perf.get(String(row.id))?.conversations ?? 0,
  }));
  const adsets: AdSetInfo[] = (adsetsBody?.data ?? []).map((row: any) => ({
    adsetId: String(row.id),
    name: row.name ?? '',
    status: row.effective_status ?? 'UNKNOWN',
    dailyBudget: row.daily_budget ? Number(row.daily_budget) / 100 : null,
  }));
  /* eslint-enable @typescript-eslint/no-explicit-any */
  return { ads, adsets };
}

/** Change a campaign's daily budget, given in whole shekels. */
export async function setCampaignDailyBudget(
  config: FbAdsConfig,
  campaignId: string,
  shekels: number,
): Promise<void> {
  await graphPost(config, campaignId, {
    // Graph takes budgets in minor units (agorot).
    daily_budget: String(Math.round(shekels * 100)),
  });
}

/**
 * Deep-copies a campaign (ad sets, ads and creatives included) — the pro
 * way to scale a winner or A/B a change. The copy lands PAUSED so nothing
 * spends until it's reviewed and switched on.
 */
export async function duplicateCampaign(config: FbAdsConfig, campaignId: string): Promise<void> {
  await graphPost(config, `${campaignId}/copies`, {
    deep_copy: 'true',
    status_option: 'PAUSED',
  });
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
