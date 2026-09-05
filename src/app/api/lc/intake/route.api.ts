import { createLead } from '@/lib/lc/ops';
import { bad, json, serverStore } from '@/lib/lc/server';
import type { Channel, LeadSourceKey, Locale } from '@/lib/lc/types';
import { LEAD_SOURCE_KEYS } from '@/lib/lc/types';

/**
 * POST /api/lc/intake — public lead intake.
 *
 * Website forms and the (mock) WhatsApp webhook post here. The body carries
 * the organisation id and its intake token (org slug for now; swap for a
 * per-org secret column when the WhatsApp adapter goes live). The lead,
 * conversation and the agent's first reply are created server-side with the
 * same `createLead` operation the browser uses in demo mode.
 *
 * {
 *   organizationId, token, name, phone, text?, source?, channel?, language?, city?
 * }
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  if (!body) return bad('invalid JSON');
  const organizationId = String(body.organizationId ?? '');
  const token = String(body.token ?? '');
  const name = String(body.name ?? '').trim();
  const phone = String(body.phone ?? '').trim();
  if (!organizationId || !token) return bad('organizationId and token are required', 401);
  if (!phone) return bad('phone is required');

  const store = serverStore();
  if (!store) return bad('Supabase is not configured on the server', 503);
  const snap = await store.loadSnapshot(organizationId);
  if (!snap) return bad('organization not found', 404);
  if (snap.organization.slug !== token) return bad('invalid token', 401);
  if (!snap.organization.active) return bad('agent is not active', 409);

  const source = LEAD_SOURCE_KEYS.includes(body.source as LeadSourceKey) ? (body.source as LeadSourceKey) : 'website';
  const channel = (['whatsapp', 'website', 'facebook', 'instagram', 'phone', 'manual'] as Channel[]).includes(body.channel as Channel) ? (body.channel as Channel) : 'website';
  const language = (['he', 'ru', 'en'] as Locale[]).includes(body.language as Locale) ? (body.language as Locale) : undefined;

  const patch = createLead(snap, { name, phone, source, channel, language, city: body.city ? String(body.city) : undefined, text: body.text ? String(body.text) : undefined });
  for (const w of patch.writes) {
    if (w.kind === 'put') await store.put(organizationId, w.collection, w.row);
    else if (w.kind === 'remove') await store.remove(organizationId, w.collection, w.id);
  }
  const replies = patch.snapshot.messages.filter((m) => m.conversationId === patch.conversationId && m.sender === 'ai').map((m) => m.text);
  return json({ ok: true, leadId: patch.leadId, conversationId: patch.conversationId, replies });
}
