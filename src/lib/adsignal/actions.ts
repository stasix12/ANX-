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

export async function importAdAction(
  prev: { ok: boolean; error?: string; adId?: string } | null,
  formData: FormData,
): Promise<{ ok: boolean; error?: string; adId?: string }> {
  const db = getAdsignalDb();
  if (!db) return { ok: false, error: 'Supabase אינו מוגדר' };

  const advertiserName = String(formData.get('advertiser') ?? '').trim();
  const body = String(formData.get('body') ?? '').trim();
  if (!advertiserName || !body) return { ok: false, error: 'שם מפרסם וטקסט מודעה הם שדות חובה' };

  const platform = String(formData.get('platform') ?? 'meta');
  const nicheKey = String(formData.get('niche_key') ?? '') || null;
  const country = String(formData.get('country') ?? 'IL');
  const title = String(formData.get('title') ?? '').trim() || null;
  const landingUrl = String(formData.get('landing_url') ?? '').trim() || null;
  const sourceUrl = String(formData.get('source_url') ?? '').trim() || null;
  const startedAtRaw = String(formData.get('started_at') ?? '').trim();
  const startedAt = startedAtRaw ? new Date(startedAtRaw).toISOString() : null;
  const watch = formData.get('watch') === 'on';

  const { contentHash, extractOffers, normalizeBody } = await import('./offers');
  const now = new Date().toISOString();

  // Advertiser identity for manual imports: normalized name.
  const externalId = `import:${advertiserName.toLowerCase().replace(/\s+/g, '-')}`;
  const { data: advertiser, error: advErr } = await db
    .from('adsignal_advertisers')
    .upsert(
      { platform, external_id: externalId, name: advertiserName, country, last_seen_at: now },
      { onConflict: 'platform,external_id' },
    )
    .select('id')
    .single();
  if (advErr || !advertiser) return { ok: false, error: advErr?.message ?? 'שמירת המפרסם נכשלה' };

  const { data: ad, error: adErr } = await db
    .from('adsignal_ads')
    .upsert(
      {
        platform,
        external_id: `import:${contentHash(normalizeBody(advertiserName + body))}`,
        advertiser_id: advertiser.id,
        niche_key: nicheKey,
        country,
        language: /[א-ת]/.test(body) ? 'he' : null,
        title,
        body,
        body_hash: contentHash(normalizeBody(body)),
        started_at: startedAt,
        is_active: true,
        landing_url: landingUrl,
        snapshot_url: sourceUrl,
        source_kind: 'user_imported',
        last_seen_at: now,
      },
      { onConflict: 'platform,external_id' },
    )
    .select('id')
    .single();
  if (adErr || !ad) return { ok: false, error: adErr?.message ?? 'שמירת המודעה נכשלה' };

  await db.from('adsignal_ad_snapshots').upsert(
    { ad_id: ad.id, captured_at: now.slice(0, 10), is_active: true, provenance: 'REAL' },
    { onConflict: 'ad_id,captured_at' },
  );

  for (const offer of extractOffers([title, body].filter(Boolean).join(' '))) {
    const { data: offerRow } = await db
      .from('adsignal_offers')
      .upsert({ normalized_text: offer.normalized, kind: offer.kind }, { onConflict: 'normalized_text' })
      .select('id')
      .single();
    if (offerRow) {
      await db
        .from('adsignal_ad_offers')
        .upsert({ ad_id: ad.id, offer_id: offerRow.id, detected_by: 'rule' }, { onConflict: 'ad_id,offer_id' });
    }
  }

  if (watch) {
    await db
      .from('adsignal_competitor_watches')
      .upsert({ advertiser_id: advertiser.id, label: advertiserName }, { onConflict: 'advertiser_id' });
  }

  // Score immediately so the ad shows a Hot Score without waiting for cron.
  const { data: nicheRows } = await db.from('adsignal_niches').select('*').order('sort');
  const { runRollup } = await import('./rollup');
  await runRollup(db, (nicheRows ?? []) as import('./types').Niche[]);

  revalidatePath('/adsignal', 'layout');
  return { ok: true, adId: ad.id };
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
