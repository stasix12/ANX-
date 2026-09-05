import type { Attachment, Snapshot } from '../types';
import { createLead, customerMessage, type Patch, type Write } from '../ops';
import { normalizePhone } from '../util';
import type { InboundWa } from './whatsapp';

/**
 * Routing of an inbound WhatsApp message into the domain, independent of
 * Supabase and of Meta so it can be unit-tested with fakes:
 *   1. find the organisation that owns the phone_number_id,
 *   2. continue the customer's open conversation or open a new lead,
 *   3. persist, then hand the agent's replies back for sending.
 */

export interface InboundDeps {
  /** Loads the snapshot of the org whose WhatsApp integration has this phone_number_id. */
  loadByPhoneNumberId(phoneNumberId: string): Promise<Snapshot | null>;
  persist(organizationId: string, writes: Write[]): Promise<void>;
  /** Turns Meta media ids into stored attachments (may return fewer than asked). */
  storeMedia(snapshot: Snapshot, media: InboundWa['media']): Promise<Attachment[]>;
  send(snapshot: Snapshot, to: string, text: string): Promise<void>;
  now?: () => Date;
}

export interface InboundResult {
  organizationId: string;
  conversationId: string;
  replies: string[];
  isNewLead: boolean;
}

const OPEN_WINDOW_DAYS = 30;

/** The customer's most recent conversation that can still continue. */
export function findOpenConversation(s: Snapshot, phone: string, now: Date) {
  const normalized = normalizePhone(phone);
  const customer = s.customers.find((c) => normalizePhone(c.phone) === normalized);
  if (!customer) return null;
  const convs = s.conversations.filter((c) => c.customerId === customer.id).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
  const latest = convs[0];
  if (!latest) return null;
  const ageDays = (now.getTime() - new Date(latest.lastMessageAt).getTime()) / 86400000;
  if (ageDays > OPEN_WINDOW_DAYS) return null;
  // A finished conversation (booked/lost) older than a day → a fresh lead; a fresh one continues (e.g. "what's the address?").
  if ((latest.status === 'lost' || latest.status === 'booked') && ageDays > 1) return null;
  return latest;
}

export async function handleInbound(msg: InboundWa, deps: InboundDeps): Promise<InboundResult | null> {
  const now = deps.now?.() ?? new Date();
  const snapshot = await deps.loadByPhoneNumberId(msg.phoneNumberId);
  if (!snapshot) return null;
  if (!snapshot.organization.active) return null;
  const orgId = snapshot.organization.id;
  const phone = normalizePhone(msg.from.startsWith('972') ? `0${msg.from.slice(3)}` : msg.from);
  const attachments = msg.media.length ? await deps.storeMedia(snapshot, msg.media) : [];
  const text = msg.text || (attachments.length ? '' : `[${msg.type}]`);

  const before = new Set(snapshot.messages.map((m) => m.id));
  const open = findOpenConversation(snapshot, phone, now);
  let patch: Patch;
  let conversationId: string;
  if (open) {
    patch = customerMessage(snapshot, open.id, text, attachments, now);
    conversationId = open.id;
  } else {
    const r = createLead(snapshot, { name: msg.name, phone, source: 'whatsapp', channel: 'whatsapp', text, attachments }, now);
    patch = r;
    conversationId = r.conversationId;
  }
  await deps.persist(orgId, patch.writes);

  const replies = patch.snapshot.messages.filter((m) => m.conversationId === conversationId && m.sender === 'ai' && !before.has(m.id)).map((m) => m.text);
  for (const text of replies) await deps.send(patch.snapshot, phone, text);
  return { organizationId: orgId, conversationId, replies, isNewLead: !open };
}
