import { calculatePrice } from '@/lib/lc/pricing';
import { bad, json, serverStore } from '@/lib/lc/server';
import type { Locale } from '@/lib/lc/types';

/**
 * POST /api/lc/quote
 * { organizationId, items:[{serviceId, quantity}], city?, urgent?, extras?, locale? }
 * Server-side price calculation with the organisation's live catalogue and rules.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { organizationId?: string; items?: { serviceId: string; quantity: number }[]; city?: string; urgent?: boolean; extras?: string[]; locale?: Locale } | null;
  if (!body?.organizationId || !Array.isArray(body.items)) return bad('organizationId and items are required');
  const store = serverStore();
  if (!store) return bad('Supabase is not configured on the server', 503);
  const snap = await store.loadSnapshot(body.organizationId);
  if (!snap) return bad('organization not found', 404);
  const result = calculatePrice({ items: body.items, city: body.city, urgent: body.urgent, extras: body.extras }, snap.services, snap.pricingRules, body.locale ?? snap.organization.locale);
  return json({ ok: true, quote: result });
}
