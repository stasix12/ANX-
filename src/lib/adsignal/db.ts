import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * AdSignal talks to Supabase exclusively from the server with the service-role
 * key: every adsignal_* table has RLS enabled with no policies, so the public
 * anon key can read nothing. Returns null until the env is configured, and
 * every screen renders an honest "not connected" state instead of failing.
 */
let cached: SupabaseClient | null | undefined;

export function getAdsignalDb(): SupabaseClient | null {
  if (cached !== undefined) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  cached = url && key
    ? createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;
  return cached;
}
