import 'server-only';
import { createHmac } from 'node:crypto';
import { logActivity } from './log';
import { getSetting, setSetting } from './db';
import { stampText } from '../time';
import type { ControlSettings } from '../types';

/**
 * Thin Meta Graph API client. Every call:
 *   * runs on the server with the token in the query, never in a URL that
 *     reaches a browser;
 *   * carries appsecret_proof, so a leaked token alone is useless;
 *   * maps Meta's error codes to Hebrew explanations and a `kind` the worker
 *     can act on (retry later, mark permissions missing, treat as duplicate);
 *   * reads the usage headers and records a cooldown when Meta says we are
 *     close to a rate limit — the worker then waits instead of hammering.
 */

export const GRAPH_VERSION = process.env.FACEBOOK_GRAPH_VERSION ?? 'v24.0';
const GRAPH_BASE = process.env.FACEBOOK_GRAPH_BASE ?? 'https://graph.facebook.com';
export const FB_DIALOG_BASE = 'https://www.facebook.com';

export type GraphErrorKind =
  | 'auth' // token expired / invalid → reconnect
  | 'permission' // missing scope or page task
  | 'rate_limit' // back off
  | 'duplicate' // Meta refused the same content
  | 'blocked' // temporary policy block on the account/page
  | 'invalid' // bad parameter (e.g. unsupported CTA)
  | 'unknown';

export class GraphError extends Error {
  constructor(
    message: string,
    public kind: GraphErrorKind,
    public code: number | null,
    public subcode: number | null,
    public retryAfterMinutes: number | null = null,
    /**
     * The Hebrew sentence WITHOUT Meta's English parenthetical.
     *
     * `message` deliberately carries "(Meta: …)" — a developer reading a
     * failed queue row needs Meta's own words. But setCooldown() passes its
     * `reason` straight into the activity log, which the owner reads in the
     * notification bell with no filter at all, so that one path needs the
     * sentence alone. Defaults to `message` for the callers that never had a
     * parenthetical to strip.
     */
    public hebrew: string = message,
  ) {
    super(message);
  }
}

export function appCredentials(): { appId: string; appSecret: string } {
  const appId = process.env.FACEBOOK_APP_ID;
  const appSecret = process.env.FACEBOOK_APP_SECRET;
  if (!appId || !appSecret) throw new Error('FACEBOOK_APP_ID / FACEBOOK_APP_SECRET לא מוגדרים בצד השרת.');
  return { appId, appSecret };
}

export function appSecretProof(token: string): string {
  return createHmac('sha256', appCredentials().appSecret).update(token).digest('hex');
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function classify(body: any): GraphError {
  const err = body?.error ?? {};
  const code: number | null = typeof err.code === 'number' ? err.code : null;
  const subcode: number | null = typeof err.error_subcode === 'number' ? err.error_subcode : null;
  const raw = err.message ? ` (Meta: ${err.message})` : '';

  /*
   * One constructor for all eight branches, so the Hebrew sentence and the
   * "(Meta: …)" parenthetical can never drift apart again.
   *
   * `message` keeps both — a developer reading social_queue.error needs Meta's
   * own words. `hebrew` is the sentence alone, and it is what setCooldown()
   * writes to the activity log, because the notification bell renders that
   * text with no filter and the owner does not read English.
   */
  const he = (sentence: string, kind: GraphErrorKind, retryAfterMinutes: number | null = null) =>
    new GraphError(`${sentence}${raw}`, kind, code, subcode, retryAfterMinutes, sentence);

  if (code === 190 || code === 102) return he('הטוקן פג תוקף או בוטל — יש להתחבר מחדש לפייסבוק.', 'auth');
  if (code === 10 || code === 200 || code === 294 || (code !== null && code >= 200 && code <= 299))
    return he('חסרות הרשאות לפעולה הזו (pages_manage_posts / תפקיד בדף).', 'permission');
  if (code === 4 || code === 17 || code === 32 || code === 613 || code === 80001)
    return he('Meta הגבילה זמנית את קצב הקריאות — המערכת תנסה שוב מאוחר יותר.', 'rate_limit', 60);
  if (code === 506) return he('פייסבוק זיהה פוסט זהה שפורסם לאחרונה ודחה אותו.', 'duplicate');
  if (code === 368 || code === 1349125)
    return he('החשבון/הדף חסום זמנית לפרסום על ידי Meta (מדיניות ספאם). התור הושהה.', 'blocked', 24 * 60);
  if (code === 100 || code === 1500) return he('Meta דחתה את הפרמטרים של הפוסט.', 'invalid');
  /*
   * This one used to return `err.message` alone, so the one case we do NOT
   * recognise — the case most likely to reach the owner — was the case that
   * put raw English in front of her as the whole message.
   */
  return he('קריאה ל-Meta נכשלה.', 'unknown');
}

/** Records a cooldown if Meta's usage headers say we are near the ceiling. */
async function inspectUsage(headers: Headers): Promise<void> {
  const candidates: number[] = [];
  let regainMinutes = 0;
  const appUsage = headers.get('x-app-usage');
  if (appUsage) {
    try {
      const u = JSON.parse(appUsage);
      candidates.push(Number(u.call_count ?? 0), Number(u.total_cputime ?? 0), Number(u.total_time ?? 0));
    } catch {
      /* ignore malformed header */
    }
  }
  const buc = headers.get('x-business-use-case-usage');
  if (buc) {
    try {
      const u = JSON.parse(buc) as Record<string, any[]>;
      for (const list of Object.values(u)) {
        for (const entry of list ?? []) {
          candidates.push(Number(entry.call_count ?? 0), Number(entry.total_cputime ?? 0), Number(entry.total_time ?? 0));
          regainMinutes = Math.max(regainMinutes, Number(entry.estimated_time_to_regain_access ?? 0));
        }
      }
    } catch {
      /* ignore */
    }
  }
  const peak = Math.max(0, ...candidates);
  if (peak >= 85 || regainMinutes > 0) {
    const minutes = regainMinutes > 0 ? regainMinutes : 30;
    await setCooldown(minutes, `שימוש ב-API הגיע ל-${peak}%`);
  }
}

export async function setCooldown(minutes: number, reason: string): Promise<void> {
  const control = await getSetting<ControlSettings>('control', { paused: false, rateLimitedUntil: null });
  const until = new Date(Date.now() + minutes * 60_000).toISOString();
  if (control.rateLimitedUntil && control.rateLimitedUntil > until) return;
  await setSetting('control', { ...control, rateLimitedUntil: until });
  /*
   * An ABSOLUTE instant, not "בעוד יום".
   *
   * This sentence is stored in social_activity_log and read back for days,
   * while the row's own timestamp beside it is rendered live. A relative
   * phrase frozen at write time therefore ends up as "יתחדש בעוד יום" sitting
   * on top of "לפני 3 ימים" — a line that is simply false by the time anyone
   * reads it. stampText() wraps the stamp in LTR isolates so the date and the
   * time do not swap places inside the Hebrew sentence.
   */
  await logActivity('warn', 'rate_limit', `${reason} — הפרסום מושהה ויתחדש ב-${stampText(until)}.`, { minutes, until });
}

interface CallOptions {
  method?: 'GET' | 'POST' | 'DELETE';
  token: string;
  params?: Record<string, string | number | boolean | undefined>;
}

export async function graph<T = any>(path: string, opts: CallOptions): Promise<T> {
  const method = opts.method ?? 'GET';
  const url = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/${path.replace(/^\//, '')}`);
  const params: Record<string, string> = {};
  for (const [k, v] of Object.entries(opts.params ?? {})) {
    if (v !== undefined && v !== '') params[k] = String(v);
  }
  params.access_token = opts.token;
  params.appsecret_proof = appSecretProof(opts.token);

  let response: Response;
  if (method === 'GET' || method === 'DELETE') {
    for (const [k, v] of Object.entries(params)) url.searchParams.set(k, v);
    response = await fetch(url, { method, cache: 'no-store' });
  } else {
    response = await fetch(url, {
      method,
      body: new URLSearchParams(params),
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      cache: 'no-store',
    });
  }

  await inspectUsage(response.headers);
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.error) {
    const err = classify(body);
    if (err.kind === 'rate_limit' || err.kind === 'blocked') {
      await setCooldown(err.retryAfterMinutes ?? 60, err.hebrew);
    }
    throw err;
  }
  return body as T;
}

/** Token exchange helpers (OAuth) — these use the app secret, not a user token. */
export async function exchangeCode(code: string, redirectUri: string): Promise<{ access_token: string; expires_in?: number }> {
  const { appId, appSecret } = appCredentials();
  const url = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('redirect_uri', redirectUri);
  url.searchParams.set('code', code);
  const res = await fetch(url, { cache: 'no-store' });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) throw classify(body);
  return body;
}

export async function exchangeForLongLived(shortToken: string): Promise<{ access_token: string; expires_in?: number }> {
  const { appId, appSecret } = appCredentials();
  const url = new URL(`${GRAPH_BASE}/${GRAPH_VERSION}/oauth/access_token`);
  url.searchParams.set('grant_type', 'fb_exchange_token');
  url.searchParams.set('client_id', appId);
  url.searchParams.set('client_secret', appSecret);
  url.searchParams.set('fb_exchange_token', shortToken);
  const res = await fetch(url, { cache: 'no-store' });
  const body = await res.json().catch(() => null);
  if (!res.ok || body?.error) throw classify(body);
  return body;
}

export interface MePermissions {
  granted: string[];
  declined: string[];
}

export async function fetchPermissions(token: string): Promise<MePermissions> {
  const body = await graph<{ data: { permission: string; status: string }[] }>('me/permissions', { token });
  const granted: string[] = [];
  const declined: string[] = [];
  for (const row of body.data ?? []) (row.status === 'granted' ? granted : declined).push(row.permission);
  return { granted, declined };
}

export interface PageRow {
  id: string;
  name: string;
  access_token: string;
  tasks?: string[];
  category?: string;
  link?: string;
}

/** Pages the user manages, following pagination. */
export async function fetchManagedPages(token: string): Promise<PageRow[]> {
  const rows: PageRow[] = [];
  let after: string | undefined;
  for (let page = 0; page < 10; page += 1) {
    const body = await graph<{ data: PageRow[]; paging?: { cursors?: { after?: string }; next?: string } }>('me/accounts', {
      token,
      params: { fields: 'id,name,access_token,tasks,category,link', limit: 100, after },
    });
    rows.push(...(body.data ?? []));
    after = body.paging?.next ? body.paging?.cursors?.after : undefined;
    if (!after) break;
  }
  return rows;
}

export async function revokeUserToken(token: string): Promise<void> {
  await graph('me/permissions', { token, method: 'DELETE' });
}
