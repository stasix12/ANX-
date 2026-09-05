import { customerMessage } from '@/lib/lc/ops';
import { aiProvider, bad, json, serverStore } from '@/lib/lc/server';
import type { Attachment } from '@/lib/lc/types';

/**
 * POST /api/lc/agent/reply — one inbound customer message → agent turn.
 *
 * { organizationId, token, conversationId, text, attachments? }
 *
 * Runs the same operation as the browser, then (when an LLM provider is
 * configured) lets it rephrase the agent's wording without touching any
 * number, slot or decision. Returns the messages that were sent.
 */
export async function POST(req: Request) {
  const body = (await req.json().catch(() => null)) as { organizationId?: string; token?: string; conversationId?: string; text?: string; attachments?: Attachment[] } | null;
  if (!body?.organizationId || !body.token || !body.conversationId) return bad('organizationId, token and conversationId are required', 401);
  const store = serverStore();
  if (!store) return bad('Supabase is not configured on the server', 503);
  const snap = await store.loadSnapshot(body.organizationId);
  if (!snap) return bad('organization not found', 404);
  if (snap.organization.slug !== body.token) return bad('invalid token', 401);
  const conv = snap.conversations.find((c) => c.id === body.conversationId);
  if (!conv) return bad('conversation not found', 404);

  const patch = customerMessage(snap, conv.id, body.text ?? '', body.attachments ?? []);
  const provider = aiProvider();
  const sent = patch.snapshot.messages.filter((m) => m.conversationId === conv.id && m.sender === 'ai' && !snap.messages.some((x) => x.id === m.id));

  // Optional LLM rephrasing of the wording only.
  if (provider.name !== 'mock' && sent.length) {
    const lead = patch.snapshot.leads.find((l) => l.id === conv.leadId)!;
    const customer = patch.snapshot.customers.find((c) => c.id === conv.customerId)!;
    const updated = patch.snapshot.conversations.find((c) => c.id === conv.id)!;
    const turn = await provider.reply({ organization: snap.organization, settings: snap.settings, services: snap.services, rules: snap.pricingRules, bookings: snap.bookings, workers: snap.workers, customer, qualification: lead.qualification, state: conv.agentState, now: new Date() }, { text: body.text ?? '', attachments: body.attachments });
    if (turn.replies.length === 1 && sent.length >= 1) {
      sent[0].text = turn.replies[0];
      updated.lastMessageText = turn.replies[0];
    }
  }

  for (const w of patch.writes) {
    if (w.kind === 'put') await store.put(body.organizationId, w.collection, w.row);
    else if (w.kind === 'remove') await store.remove(body.organizationId, w.collection, w.id);
  }
  return json({ ok: true, replies: sent.map((m) => m.text), status: patch.snapshot.conversations.find((c) => c.id === conv.id)?.status, provider: provider.name });
}
