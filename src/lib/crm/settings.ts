import { supabase } from '@/lib/supabase';

/**
 * Key/value settings stored in crm_settings (see supabase/crm-schema.sql).
 * RLS restricts every read and write to the signed-in admin, which is what
 * makes it acceptable to keep an ads API token here for this single-user
 * business tool.
 */

export interface FbAdsConfig {
  /** Numeric ad account id, without the act_ prefix. */
  accountId: string;
  accessToken: string;
  /** App credentials for automatic token renewal (optional but recommended). */
  appId?: string;
  appSecret?: string;
  /** When the current token was stored — drives the renewal schedule. */
  tokenSavedAt?: string;
}

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase לא מוגדר — חסרים משתני הסביבה NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return supabase;
}

const FB_ADS_KEY = 'facebook_ads';

export async function getFbAdsConfig(): Promise<FbAdsConfig | null> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('crm_settings')
    .select('value')
    .eq('key', FB_ADS_KEY)
    .maybeSingle();
  if (error) throw new Error(error.message);
  const value = data?.value as Partial<FbAdsConfig> | undefined;
  if (!value?.accountId || !value?.accessToken) return null;
  return { accountId: value.accountId, accessToken: value.accessToken };
}

export async function saveFbAdsConfig(config: FbAdsConfig): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('crm_settings')
    .upsert({ key: FB_ADS_KEY, value: config }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}

export async function clearFbAdsConfig(): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('crm_settings').delete().eq('key', FB_ADS_KEY);
  if (error) throw new Error(error.message);
}
