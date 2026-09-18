import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { env } from './env';

/**
 * The worker talks to Supabase as the admin user through the anon key +
 * email/password login, so it is governed by the same RLS policies as the
 * dashboard — no service-role key ever sits on the laptop.
 */
let client: SupabaseClient | null = null;

export async function workerDb(): Promise<SupabaseClient> {
  if (client) return client;
  const c = createClient(env.supabaseUrl, env.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: true },
  });
  const { error } = await c.auth.signInWithPassword({ email: env.workerEmail, password: env.workerPassword });
  if (error) throw new Error(`התחברות ל-Supabase נכשלה: ${error.message}`);
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

export async function logActivity(level: 'info' | 'warn' | 'error', event: string, message: string, meta: Record<string, unknown> = {}): Promise<void> {
  try {
    const db = await workerDb();
    await db.from('social_activity_log').insert({ level, event, message: scrub(message) as string, meta: scrub(meta) as Record<string, unknown> });
  } catch (err) {
    console.error('[worker] log write failed:', err instanceof Error ? err.message : err);
  }
}
