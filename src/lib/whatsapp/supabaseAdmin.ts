import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-side Supabase client for the WhatsApp bot. The leads and wa_*
 * tables are RLS-locked to signed-in admins, so the webhook — which has no
 * user session — authenticates with the service-role key instead. That key
 * bypasses RLS entirely; it must only ever live in server env vars, never
 * in NEXT_PUBLIC_*.
 */

let cached: SupabaseClient | null = null;

export function supabaseAdmin(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error(
      'WhatsApp bot: חסרים NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY בסביבת השרת.',
    );
  }
  cached = createClient(url, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return cached;
}
