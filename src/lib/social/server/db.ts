import 'server-only';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { upsertScoped } from '../tenant';
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

/*
 * THE SERVER'S OWN SETTINGS READER AND WRITER, AND THEY ARE NOT TENANT-AWARE.
 *
 * These are live, not spare parts: runWorker() calls them nine times, and
 * runWorker() is the whole body of /api/social/run — which is what "פרסם
 * עכשיו" and the launch of a round both hit. An earlier version of this
 * comment said nothing called them. It was wrong, and that wrongness is the
 * reason setSetting kept naming the old settings key for a while; the mistake
 * is recorded here rather than quietly deleted.
 *
 * The service role bypasses row-level security, so with more than one business
 * getSetting's `.maybeSingle()` would see two 'limits' rows and throw, and
 * setSetting would write into a business chosen by accident. That is not fixed
 * here — it is fixed by teaching /api/social/run whose request it is serving,
 * which is a step of its own. Until then runWorker() refuses to run at all
 * once a second business exists (see server/worker.ts), so these two are only
 * ever reached while "the one business" is unambiguous.
 */
export async function getSetting<T>(key: string, fallback: T): Promise<T> {
  const { data, error } = await serviceDb().from('social_settings').select('value').eq('key', key).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? ({ ...fallback, ...(data.value as object) } as T) : fallback;
}

export async function setSetting(key: string, value: unknown): Promise<void> {
  /*
   * Same two conflict targets as the dashboard's saveSetting, and for the same
   * reason: after the migration that gives each business its own settings row
   * there is no unique index on (key) alone, and an upsert that still names it
   * fails with 42P10 — which here would mean every "פרסם עכשיו" answering 500,
   * because the run lock is written through this function before the work
   * starts. src/lib/social/tenant.ts has the whole argument.
   */
  const { error } = await upsertScoped(
    (onConflict) => serviceDb().from('social_settings').upsert({ key, value }, { onConflict }),
    'tenant_id,key',
    'key',
  );
  if (error) throw new Error(error.message);
}
