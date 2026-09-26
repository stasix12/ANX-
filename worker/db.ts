import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { friendlyMessage } from '@/lib/social/errors';
import { env } from './env';
import { fileSessionStorage, forgetSession } from './session-store';
import { signInInteractively } from './sign-in';

/**
 * The worker talks to Supabase through the anon key as a real signed-in
 * person, so it is governed by the same policies as the dashboard — no
 * service-role key ever sits on the laptop.
 *
 * TWO WAYS TO BE THAT PERSON, and the order matters.
 *
 * 1. An email and password in .env.local. This is how the owner's own machine
 *    has always worked and it still wins, so nothing about that machine
 *    changes. It is also the one thing that can never be in a copy handed to
 *    somebody else: those two lines are the owner's login to the dashboard,
 *    the CRM and every lead in it.
 *
 * 2. A session this machine obtained for itself, stored in the hidden folder
 *    beside the Facebook profile and refreshed automatically from then on.
 *    When there is none, the worker asks for the customer's email, Supabase
 *    sends a six-digit code, and the customer types the code — once, on this
 *    machine. No password is typed here and none is written anywhere.
 *
 * Which means a package built from this repository carries no identity at
 * all: it is the same program, and the first thing it does is ask whose it is.
 */
let client: SupabaseClient | null = null;

export async function workerDb(): Promise<SupabaseClient> {
  if (client) return client;
  const c = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: true,
      /* Node has no localStorage; this is a 0600 file. See session-store.ts. */
      storage: fileSessionStorage(),
      /* A URL never reaches this process, so there is nothing to detect. */
      detectSessionInUrl: false,
    },
  });

  const email = env.workerEmailOptional;
  const password = env.workerPasswordOptional;
  if (email && password) {
    const { error } = await c.auth.signInWithPassword({ email, password });
    if (error) throw new Error(`התחברות ל-Supabase נכשלה: ${error.message}`);
    client = c;
    return c;
  }

  /*
   * getSession() reads the file; getUser() asks the server whether what is in
   * it is still good. Both, because a refresh token that was revoked — the
   * customer signed out everywhere, the account was disabled — still parses
   * perfectly and would otherwise send the worker into a loop of requests
   * that every one of them fails with no explanation on screen.
   */
  const { data: existing } = await c.auth.getSession();
  if (existing.session) {
    const { error } = await c.auth.getUser();
    if (!error) {
      client = c;
      return c;
    }
    console.error(`[worker] החיבור לחשבון פג (${error.message}). מבקש התחברות מחדש.`);
    forgetSession();
  }

  await signInInteractively(c);
  client = c;
  return c;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
export function unwrap<T>(res: { data: any; error: any }): T {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
}

/** Activity log writer with the same token scrubbing as the server. */
const TOKEN_RE = /(EAA[0-9A-Za-z]{20,}|access_token=[^&\s"']+|c_user=\d+|xs=[^;\s]+|datr=[^;\s]+)/g;

export function scrub(value: unknown): unknown {
  if (typeof value === 'string') return value.replace(TOKEN_RE, '[redacted]');
  if (Array.isArray(value)) return value.map(scrub);
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
      out[k] = /token|secret|cookie|session|password/i.test(k) ? '[redacted]' : scrub(v);
    }
    return out;
  }
  return value;
}

/**
 * The one shape in which a caught exception may be stored or shown.
 *
 * Two problems it solves at once. First, scrub(): TOKEN_RE only ever ran inside
 * logActivity, so the columns most likely to carry a cookie or an access token
 * — social_queue.error and social_targets.last_error, which are written
 * straight from `err.message` — were the ones it never covered. Second,
 * friendlyMessage(): those same columns are rendered verbatim by
 * src/components/social/ErrorDetail.tsx, so a Playwright `TimeoutError:
 * page.waitForSelector: Timeout 30000ms exceeded` landed in English, LTR, in
 * the middle of a Hebrew sentence. The server worker has always passed its
 * failures through friendlyMessage (src/lib/social/server/worker.ts); this is
 * the local worker doing the same.
 *
 * Our own errors (PublishError, SessionError) are written in Hebrew and
 * friendlyMessage passes those through untouched, so this only rewrites text
 * that came from somewhere else.
 */
export function safeError(err: unknown, fallback?: string): string {
  const raw = err instanceof Error ? err.message : String(err);
  return friendlyMessage(scrub(raw) as string, fallback ?? 'הפרסום נכשל. פתחו את פרטי התקלה ונסו שוב.');
}

export async function logActivity(level: 'info' | 'warn' | 'error', event: string, message: string, meta: Record<string, unknown> = {}): Promise<void> {
  try {
    const db = await workerDb();
    await db.from('social_activity_log').insert({ level, event, message: scrub(message) as string, meta: scrub(meta) as Record<string, unknown> });
  } catch (err) {
    console.error('[worker] log write failed:', err instanceof Error ? err.message : err);
  }
}
