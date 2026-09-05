import type Anthropic from '@anthropic-ai/sdk';
import { supabaseAdmin } from './supabaseAdmin';

/**
 * Conversation persistence for the WhatsApp bot (tables in
 * supabase/whatsapp-schema.sql). The transcript is stored as plain text —
 * the model's tool calls and images stay in memory within a single turn,
 * and history is replayed to Claude as alternating text messages.
 */

export type ConversationStatus =
  | 'new'
  | 'awaiting_photo'
  | 'quote_sent'
  | 'awaiting_reply'
  | 'interested'
  | 'booked'
  | 'not_relevant'
  | 'needs_human';

export interface Conversation {
  id: string;
  waId: string;
  profileName: string;
  language: string;
  status: ConversationStatus;
  humanTakeover: boolean;
  leadId: string | null;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromRow(row: any): Conversation {
  return {
    id: row.id,
    waId: row.wa_id,
    profileName: row.profile_name ?? '',
    language: row.language ?? '',
    status: row.status ?? 'new',
    humanTakeover: Boolean(row.human_takeover),
    leadId: row.lead_id ?? null,
  };
}

export async function getOrCreateConversation(
  waId: string,
  profileName: string,
): Promise<Conversation> {
  const client = supabaseAdmin();
  const { data, error } = await client
    .from('wa_conversations')
    .upsert(
      { wa_id: waId, ...(profileName ? { profile_name: profileName } : {}) },
      { onConflict: 'wa_id' },
    )
    .select()
    .single();
  if (error || !data) throw new Error(error?.message ?? 'wa_conversations upsert failed');
  return fromRow(data);
}

export async function updateConversation(
  id: string,
  patch: Partial<Pick<Conversation, 'status' | 'humanTakeover' | 'leadId' | 'language'>>,
): Promise<void> {
  const row: Record<string, unknown> = {};
  if (patch.status !== undefined) row.status = patch.status;
  if (patch.humanTakeover !== undefined) row.human_takeover = patch.humanTakeover;
  if (patch.leadId !== undefined) row.lead_id = patch.leadId;
  if (patch.language !== undefined) row.language = patch.language;
  if (Object.keys(row).length === 0) return;
  const { error } = await supabaseAdmin().from('wa_conversations').update(row).eq('id', id);
  if (error) throw new Error(error.message);
}

/**
 * Records an inbound message. Returns false when this wamid was already
 * stored — Meta redelivers webhooks, and answering the same message twice
 * is the classic bot embarrassment this guards against.
 */
export async function recordInbound(
  conversationId: string,
  wamid: string,
  body: string,
): Promise<boolean> {
  const { error } = await supabaseAdmin()
    .from('wa_messages')
    .insert({ conversation_id: conversationId, wamid, role: 'user', body });
  if (error) {
    if (error.code === '23505') return false; // unique_violation on wamid
    throw new Error(error.message);
  }
  return true;
}

export async function recordOutbound(
  conversationId: string,
  wamid: string | null,
  body: string,
): Promise<void> {
  const { error } = await supabaseAdmin()
    .from('wa_messages')
    .insert({ conversation_id: conversationId, wamid, role: 'assistant', body });
  if (error) throw new Error(error.message);
}

/**
 * Recent transcript as Claude messages, oldest first. Consecutive same-role
 * entries are legal for the API (it merges them into one turn), so rapid-fire
 * customer messages need no special handling. The message currently being
 * answered is already stored (dedup happens on insert), so its wamid is
 * excluded here — the caller appends it, with any image, as the final turn.
 */
export async function loadHistory(
  conversationId: string,
  excludeWamid: string,
  limit = 40,
): Promise<Anthropic.MessageParam[]> {
  const { data, error } = await supabaseAdmin()
    .from('wa_messages')
    .select('role, body, wamid')
    .eq('conversation_id', conversationId)
    .order('created_at', { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  const rows = (data ?? []).filter((row) => !excludeWamid || row.wamid !== excludeWamid).reverse();
  // The API requires the first message to be from the user.
  while (rows.length > 0 && rows[0].role !== 'user') rows.shift();
  return rows.map((row) => ({
    role: row.role as 'user' | 'assistant',
    content: row.body || '…',
  }));
}
