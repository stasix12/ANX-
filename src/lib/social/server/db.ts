import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { decrypt, encrypt } from './crypto';

/**
 * Service-role Supabase client — server only. It bypasses RLS, which is what
 * lets the worker read social_secrets (a table with no policies at all).
 * Never import this from a component.
 */
let cached: SupabaseClient | null = null;

export function serviceDb(): SupabaseClient {
  if (cached) return cached;
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !serviceKey) {
    throw new Error('חסרים NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY בצד השרת.');
  }
  cached = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
  return cached;
}

export type SecretOwner = 'account' | 'target';

export async function storeSecret(kind: SecretOwner, ownerId: string, plain: string): Promise<void> {
  const { error } = await serviceDb()
    .from('social_secrets')
    .upsert({ owner_kind: kind, owner_id: ownerId, ciphertext: encrypt(plain) }, { onConflict: 'owner_kind,owner_id' });
  if (error) throw new Error(error.message);
}

export async function readSecret(kind: SecretOwner, ownerId: string): Promise<string | null> {
  const { data, error } = await serviceDb()
    .from('social_secrets')
    .select('ciphertext')
    .eq('owner_kind', kind)
    .eq('owner_id', ownerId)
    .maybeSingle();
  if (error) throw new Error(error.message);
  return data ? decrypt(data.ciphertext) : null;
}

export async function deleteSecrets(kind: SecretOwner, ownerIds: string[]): Promise<void> {
  if (!ownerIds.length) return;
  const { error } = await serviceDb().from('social_secrets').delete().eq('owner_kind', kind).in('owner_id', ownerIds);
  if (error) throw new Error(error.message);
}

export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await serviceDb().from('social_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? ({ ...fallback, ...(data.value as object) } as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  const { error } = await serviceDb().from('social_settings').upsert({ key, value }, { onConflict: 'key' });
  if (error) throw new Error(error.message);
}
