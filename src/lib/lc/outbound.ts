import type { Conversation, Message, Snapshot } from './types';
import type { Write } from './ops';

/**
 * Client-side outbound delivery for live mode. Watches the writes of every
 * operation for new agent/owner messages in WhatsApp conversations and posts
 * them to the server send route. Inbound webhook replies are sent by the
 * server itself, so they never pass through here.
 */
export interface OutboundItem {
  organizationId: string;
  to: string;
  text: string;
  language: string;
  lastCustomerMessageAt: string | null;
  template?: string;
  messageId: string;
}

export function outboundFromWrites(before: Snapshot, after: Snapshot, writes: Write[]): OutboundItem[] {
  const known = new Set(before.messages.map((m) => m.id));
  const items: OutboundItem[] = [];
  for (const w of writes) {
    if (w.kind !== 'put' || w.collection !== 'messages') continue;
    const m = w.row as Message;
    if (known.has(m.id) || (m.sender !== 'ai' && m.sender !== 'owner')) continue;
    const conv: Conversation | undefined = after.conversations.find((c) => c.id === m.conversationId);
    if (!conv || conv.channel !== 'whatsapp') continue;
    const customer = after.customers.find((c) => c.id === conv.customerId);
    if (!customer?.phone) continue;
    const lastCustomer = after.messages.filter((x) => x.conversationId === conv.id && x.sender === 'customer').map((x) => x.createdAt).sort().pop() ?? null;
    const template = m.meta.automationKey ? after.automations.find((a) => a.key === m.meta.automationKey)?.whatsappTemplate : undefined;
    items.push({ organizationId: after.organization.id, to: customer.phone, text: m.text, language: conv.language, lastCustomerMessageAt: lastCustomer, template, messageId: m.id });
    known.add(m.id);
  }
  return items;
}
