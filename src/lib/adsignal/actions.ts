'use server';

import { revalidatePath } from 'next/cache';
import { analyzeAd } from './analyze';
import { getAdsignalDb } from './db';
import type { AlertRule } from './types';

/**
 * Server actions behind the interactive bits. All writes go through the
 * service-role client — the anon key can't touch adsignal_* tables at all.
 */

export async function runSyncAction(): Promise<{ ok: boolean; summary?: string; error?: string }> {
  const db = getAdsignalDb();
  if (!db) return { ok: false, error: 'Supabase אינו מוגדר (NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY)' };
  const { runSync } = await import('./sync');
  const report = await runSync(db);
  const parts = Object.entries(report.connectors).map(([source, r]) => {
    if (r.skipped) return `${source}: דילוג (${r.skipped})`;
    if (r.ok === false) return `${source}: שגיאה — ${r.error}`;
    const stats = r.stats ? Object.entries(r.stats).map(([k, v]) => `${k}=${v}`).join(' ') : '';
    return `${source}: ✓ ${stats}`;
  });
  if (report.rollup) parts.push(`rollup: ✓ ${Object.entries(report.rollup).map(([k, v]) => `${k}=${v}`).join(' ')}`);
  revalidatePath('/adsignal', 'layout');
  return { ok: true, summary: parts.join(' · ') };
}

export async function analyzeAdAction(adId: string): Promise<{ ok: boolean; error?: string }> {
  const result = await analyzeAd(adId);
  if (result.ok) revalidatePath(`/adsignal/ads/${adId}`);
  return result.ok ? { ok: true } : { ok: false, error: result.error };
}

export async function createAlertAction(formData: FormData): Promise<void> {
  const db = getAdsignalDb();
  if (!db) return;
  const type = String(formData.get('type') ?? '');
  const name = String(formData.get('name') ?? '').trim();
  let rule: AlertRule | null = null;
  if (type === 'niche_opportunity') {
    rule = {
      type,
      niche_key: String(formData.get('niche_key') ?? '') || undefined,
      country: String(formData.get('country') ?? 'IL'),
      min_opportunity: Number(formData.get('threshold') ?? 80),
    };
  } else if (type === 'hot_ad') {
    rule = {
      type,
      niche_key: String(formData.get('niche_key') ?? '') || undefined,
      country: String(formData.get('country') ?? '') || undefined,
      min_score: Number(formData.get('threshold') ?? 80),
    };
  } else if (type === 'offer_adoption') {
    rule = { type, min_advertisers: Number(formData.get('threshold') ?? 5), window_days: 7 };
  }
  if (!rule || !name) return;
  await db.from('adsignal_alerts').insert({ name, rule, is_active: true });
  revalidatePath('/adsignal/alerts');
}

export async function toggleAlertAction(id: string, isActive: boolean): Promise<void> {
  const db = getAdsignalDb();
  if (!db) return;
  await db.from('adsignal_alerts').update({ is_active: isActive }).eq('id', id);
  revalidatePath('/adsignal/alerts');
}

export async function deleteAlertAction(id: string): Promise<void> {
  const db = getAdsignalDb();
  if (!db) return;
  await db.from('adsignal_alert_events').delete().eq('alert_id', id);
  await db.from('adsignal_alerts').delete().eq('id', id);
  revalidatePath('/adsignal/alerts');
}

export async function addCompetitorAction(advertiserId: string, label: string): Promise<void> {
  const db = getAdsignalDb();
  if (!db) return;
  await db
    .from('adsignal_competitor_watches')
    .upsert({ advertiser_id: advertiserId, label: label || null }, { onConflict: 'advertiser_id' });
  revalidatePath('/adsignal/competitors');
}

export async function removeCompetitorAction(watchId: string): Promise<void> {
  const db = getAdsignalDb();
  if (!db) return;
  await db.from('adsignal_competitor_events').delete().eq('watch_id', watchId);
  await db.from('adsignal_competitor_watches').delete().eq('id', watchId);
  revalidatePath('/adsignal/competitors');
}
