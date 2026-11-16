import { CITIES, type CitySlug, type Lang } from '@/lib/seo/config';
import type { ConnectionState } from '@/lib/seo/types';

/**
 * Google Search Console, through the official Search Analytics API.
 *
 * Everything the dashboard shows comes from here. There is no estimation, no
 * fallback sample data and no "typical" figure: when the connection is not
 * configured this module returns a `not_configured` state naming the missing
 * variables, and the dashboard renders that instead of a number. A plausible
 * zero is worse than an honest blank, because the operator would act on it.
 *
 * Auth is a long-lived OAuth refresh token exchanged for a short-lived access
 * token per request. A service account is the other option, but Search Console
 * requires it to be added as a property user, which is a step the business
 * owner would have to do in a second console; a refresh token obtained once
 * from their own Google account is less to get wrong.
 */

if (typeof window !== 'undefined') {
  throw new Error('seo/server/gsc is server-only');
}

const TOKEN_URL = 'https://oauth2.googleapis.com/token';
const API_BASE = 'https://searchconsole.googleapis.com/webmasters/v3';

function env() {
  return {
    siteUrl: process.env.GSC_SITE_URL,
    clientId: process.env.GOOGLE_CLIENT_ID,
    clientSecret: process.env.GOOGLE_CLIENT_SECRET,
    refreshToken: process.env.GOOGLE_REFRESH_TOKEN,
  };
}

/** Which variables are still missing. Drives the dashboard's status panel. */
export function gscConnection(): ConnectionState {
  const e = env();
  const missing: string[] = [];
  if (!e.siteUrl) missing.push('GSC_SITE_URL');
  if (!e.clientId) missing.push('GOOGLE_CLIENT_ID');
  if (!e.clientSecret) missing.push('GOOGLE_CLIENT_SECRET');
  if (!e.refreshToken) missing.push('GOOGLE_REFRESH_TOKEN');
  return missing.length ? { state: 'not_configured', missing } : { state: 'connected' };
}

async function accessToken(): Promise<string> {
  const e = env();
  if (!e.clientId || !e.clientSecret || !e.refreshToken) {
    throw new Error('Search Console is not configured');
  }
  const res = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      client_id: e.clientId,
      client_secret: e.clientSecret,
      refresh_token: e.refreshToken,
      grant_type: 'refresh_token',
    }),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status})`);
  }
  const json = (await res.json()) as { access_token?: string };
  if (!json.access_token) throw new Error('Google token response had no access_token');
  return json.access_token;
}

export type GscRow = {
  query: string;
  page: string | null;
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

export type GscTotals = {
  clicks: number;
  impressions: number;
  ctr: number;
  position: number;
};

/** YYYY-MM-DD, the only date format the API accepts. */
function isoDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

/**
 * Search Console reports with a lag of two to three days, so a window ending
 * today is always partly empty. Ending it three days back keeps period-over-
 * period comparisons honest.
 */
export function windowEnding(daysBack: number, lengthDays: number) {
  const end = new Date(Date.now() - daysBack * 86_400_000);
  const start = new Date(end.getTime() - (lengthDays - 1) * 86_400_000);
  return { startDate: isoDate(start), endDate: isoDate(end) };
}

type QueryOpts = {
  startDate: string;
  endDate: string;
  /** 'query' alone, or query+page when the page dimension is wanted. */
  dimensions?: ('query' | 'page')[];
  rowLimit?: number;
};

async function searchAnalytics(opts: QueryOpts): Promise<GscRow[]> {
  const e = env();
  const token = await accessToken();
  const res = await fetch(
    `${API_BASE}/sites/${encodeURIComponent(e.siteUrl as string)}/searchAnalytics/query`,
    {
      method: 'POST',
      headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
      body: JSON.stringify({
        startDate: opts.startDate,
        endDate: opts.endDate,
        dimensions: opts.dimensions ?? ['query'],
        rowLimit: opts.rowLimit ?? 500,
        type: 'web',
      }),
    },
  );
  if (!res.ok) {
    const body = await res.text();
    throw new Error(`Search Console query failed (${res.status}): ${body.slice(0, 200)}`);
  }
  const json = (await res.json()) as {
    rows?: { keys: string[]; clicks: number; impressions: number; ctr: number; position: number }[];
  };
  const dims = opts.dimensions ?? ['query'];
  return (json.rows ?? []).map((r) => ({
    query: r.keys[dims.indexOf('query')] ?? '',
    page: dims.includes('page') ? (r.keys[dims.indexOf('page')] ?? null) : null,
    clicks: r.clicks,
    impressions: r.impressions,
    ctr: r.ctr,
    position: r.position,
  }));
}

export type GscResult =
  | { ok: true; rows: GscRow[]; totals: GscTotals; startDate: string; endDate: string }
  | { ok: false; connection: ConnectionState };

/** Queries one window, returning an honest failure rather than throwing. */
export async function fetchQueries(
  lengthDays = 28,
  daysBack = 3,
  dimensions: ('query' | 'page')[] = ['query'],
): Promise<GscResult> {
  const connection = gscConnection();
  if (connection.state !== 'connected') return { ok: false, connection };

  const { startDate, endDate } = windowEnding(daysBack, lengthDays);
  try {
    const rows = await searchAnalytics({ startDate, endDate, dimensions });
    const clicks = rows.reduce((a, r) => a + r.clicks, 0);
    const impressions = rows.reduce((a, r) => a + r.impressions, 0);
    const totals: GscTotals = {
      clicks,
      impressions,
      ctr: impressions ? clicks / impressions : 0,
      // Impression-weighted, which is how Search Console itself averages position.
      position: impressions
        ? rows.reduce((a, r) => a + r.position * r.impressions, 0) / impressions
        : 0,
    };
    return { ok: true, rows, totals, startDate, endDate };
  } catch (error) {
    return {
      ok: false,
      connection: { state: 'error', message: error instanceof Error ? error.message : String(error) },
    };
  }
}

/**
 * Which language a query is in, by script. Queries in neither script (a bare
 * brand name in Latin, say) return null and are left unclassified rather than
 * guessed into one language.
 */
export function detectLang(query: string): Lang | null {
  if (/[֐-׿]/.test(query)) return 'he';
  if (/[Ѐ-ӿ]/.test(query)) return 'ru';
  return null;
}

/** Which target city a query names, if any. */
export function detectCity(query: string): CitySlug | null {
  const q = query.toLowerCase();
  for (const c of CITIES) {
    if (q.includes(c.he) || q.includes(c.ru.toLowerCase())) return c.slug;
  }
  // "באר שבע" is also written "ב"ש" and "beer sheva" in Latin.
  if (q.includes('beer sheva') || q.includes('beersheva') || q.includes('be\'er sheva')) {
    return 'beer-sheva';
  }
  return null;
}

/**
 * Labels why a row is worth acting on.
 *
 * The thresholds encode the three situations the spec asks for: a page that is
 * seen but not clicked (a title/description problem), a phrase ranking off the
 * first page with real demand (a content gap), and a phrase already close to
 * the top (worth strengthening the page that holds it).
 */
export function classifyOpportunity(
  row: GscRow,
): 'high_impressions_low_ctr' | 'missing_content' | 'improve_existing' | null {
  if (row.impressions >= 50 && row.ctr < 0.02) return 'high_impressions_low_ctr';
  if (row.impressions >= 20 && row.position > 20) return 'missing_content';
  if (row.position > 3 && row.position <= 20 && row.impressions >= 10) return 'improve_existing';
  return null;
}
