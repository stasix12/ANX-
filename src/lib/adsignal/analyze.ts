import 'server-only';
import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import { zodOutputFormat } from '@anthropic-ai/sdk/helpers/zod';
import { getAdsignalDb } from './db';
import { contentHash, normalizeBody } from './offers';

/**
 * On-demand AI breakdown of a single ad. Output is provenance AI_ESTIMATE,
 * cached by content hash so an unchanged creative is never re-billed. The
 * prompt confines the model to the provided creative + metadata and tells it
 * to answer "unknown" rather than guess — an estimate must not cosplay as data.
 */

const AnalysisSchema = z.object({
  hook: z.string().describe('What makes people stop scrolling; "unknown" if not inferable'),
  offer: z.string().describe('The commercial offer, or "unknown"'),
  cta: z.string().describe('The action the ad pushes for, or "unknown"'),
  creative_notes: z.string().describe('Creative strategy observations'),
  target_audience: z.string().describe('Likely audience, phrased as an estimate'),
  pain_point: z.string().describe('Problem the ad addresses, or "unknown"'),
  why_it_works: z.string().describe('Why this creative/offer may be working'),
  adaptation: z.string().describe('How a reader could adapt the idea for their own business'),
  performance_probability: z.number().min(0).max(1)
    .describe('Estimated probability this ad performs well, given ONLY the provided signals'),
  confidence: z.number().min(0).max(1).describe('How much signal was actually available'),
});

export type AnalyzeResult =
  | { ok: true; cached: boolean }
  | { ok: false; error: string };

export async function analyzeAd(adId: string): Promise<AnalyzeResult> {
  const db = getAdsignalDb();
  if (!db) return { ok: false, error: 'Supabase אינו מוגדר' };
  if (!process.env.ANTHROPIC_API_KEY) {
    return { ok: false, error: 'חסר ANTHROPIC_API_KEY — הוסף את המפתח כדי להפעיל ניתוח AI' };
  }

  const { data: ad } = await db
    .from('adsignal_ads')
    .select('*, advertiser:adsignal_advertisers(name)')
    .eq('id', adId)
    .maybeSingle();
  if (!ad) return { ok: false, error: 'המודעה לא נמצאה' };

  const material = [ad.title, ad.body].filter(Boolean).join('\n');
  if (!material.trim()) return { ok: false, error: 'למודעה זו אין טקסט קריאייטיב לניתוח' };
  const hash = contentHash(normalizeBody(material));

  const { data: existing } = await db
    .from('adsignal_ai_analyses')
    .select('content_hash')
    .eq('ad_id', adId)
    .maybeSingle();
  if (existing?.content_hash === hash) return { ok: true, cached: true };

  const daysRunning = ad.started_at
    ? Math.round((Date.now() - new Date(ad.started_at).getTime()) / 86400_000)
    : null;

  const client = new Anthropic();
  const model = 'claude-opus-5';
  const response = await client.messages.parse({
    model,
    max_tokens: 16000,
    system:
      'You analyze a single paid social/search ad for a marketing-intelligence tool. ' +
      'Base every field ONLY on the creative text and metadata provided. Where the material ' +
      'does not support an inference, write "unknown" — never invent. performance_probability ' +
      'is an estimate from available signals (longevity, copy quality), not a measurement. ' +
      'Answer field values in Hebrew (the product UI is Hebrew), except "unknown".',
    messages: [
      {
        role: 'user',
        content: [
          `Platform: ${ad.platform}`,
          `Advertiser: ${(ad.advertiser as { name?: string } | null)?.name ?? 'unknown'}`,
          `Country: ${ad.country ?? 'unknown'} · Language: ${ad.language ?? 'unknown'}`,
          `Days running: ${daysRunning ?? 'unknown'} · Still active: ${ad.is_active}`,
          `Niche: ${ad.niche_key ?? 'unknown'}`,
          '--- Creative ---',
          material,
        ].join('\n'),
      },
    ],
    output_config: { format: zodOutputFormat(AnalysisSchema) },
  });

  if (response.stop_reason === 'refusal' || !response.parsed_output) {
    return { ok: false, error: 'המודל לא החזיר ניתוח תקין למודעה זו' };
  }
  const parsed = response.parsed_output;

  await db.from('adsignal_ai_analyses').upsert(
    {
      ad_id: adId,
      model,
      analyzed_at: new Date().toISOString(),
      content_hash: hash,
      hook: parsed.hook,
      offer_text: parsed.offer,
      cta: parsed.cta,
      creative_notes: parsed.creative_notes,
      target_audience: parsed.target_audience,
      pain_point: parsed.pain_point,
      why_it_works: parsed.why_it_works,
      adaptation: parsed.adaptation,
      performance_probability: parsed.performance_probability,
      confidence: parsed.confidence,
      provenance: 'AI_ESTIMATE',
    },
    { onConflict: 'ad_id' },
  );
  return { ok: true, cached: false };
}
