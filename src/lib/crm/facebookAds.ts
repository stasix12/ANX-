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
  if (code === 190) return new Error('הטוקן פג תוקף או שגוי — צור טוקן חדש ועדכן בהגדרות.');
  if (code === 100 || code === 803) return new Error('מזהה חשבון המודעות לא נמצא — בדוק את המספר.');
  if (code === 10 || code === 200 || code === 294)
    return new Error('לטוקן אין הרשאת ads_read לחשבון המודעות הזה.');
  return new Error(body?.error?.message ?? 'שליפת נתוני הפרסום נכשלה.');
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
  datePreset: string,
): Promise<{ spend: number; currency: string | null; conversations: number }> {
  const account = config.accountId.replace(/^act_/, '').trim();
  const url =
    `${GRAPH_BASE}/${GRAPH_VERSION}/act_${account}/insights` +
    `?date_preset=${datePreset}&fields=spend,account_currency,actions` +
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
  const [today, week, month, year] = await Promise.all([
    fetchPreset(config, 'today'),
    fetchPreset(config, 'this_week_sun_sat'),
    fetchPreset(config, 'this_month'),
    fetchPreset(config, 'this_year'),
  ]);
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
  options: { timeIncrement: 'monthly' | 1; datePreset: string },
): Promise<SpendPoint[]> {
  const account = config.accountId.replace(/^act_/, '').trim();
  let url: string | null =
    `${GRAPH_BASE}/${GRAPH_VERSION}/act_${account}/insights` +
    `?date_preset=${options.datePreset}&time_increment=${options.timeIncrement}` +
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
