import { createClient, type SupabaseClient } from '@supabase/supabase-js';

/**
 * Server-only Supabase client, authenticated with the service-role key.
 *
 * The weekly cycle runs with no signed-in user — a cron request has no session
 * — so it cannot use the browser client's anon key, which RLS gives no write
 * access to. This client bypasses RLS and therefore must NEVER be imported
 * into a Client Component: the key would ship to the browser and hand every
 * visitor full write access to the articles table.
 *
 * The guard below is what makes that a loud failure rather than a silent leak.
 * `import 'server-only'` would be the neater form, but this project has no such
 * dependency and the explicit check reads clearly at the call site.
 */
if (typeof window !== 'undefined') {
  throw new Error('supabaseAdmin is server-only and must not be imported in client code');
}

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

/**
 * `null` when the service-role key is absent, so the rest of the site keeps
 * building and the dashboard can report "not configured" instead of crashing.
 */
export const supabaseAdmin: SupabaseClient | null =
  url && serviceKey
    ? createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } })
    : null;

/** Names the env vars a caller still has to set, for the dashboard's status panel. */
export function missingSupabaseAdminEnv(): string[] {
  const missing: string[] = [];
  if (!url) missing.push('NEXT_PUBLIC_SUPABASE_URL');
  if (!serviceKey) missing.push('SUPABASE_SERVICE_ROLE_KEY');
  return missing;
}
