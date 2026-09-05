import { supabaseAdmin } from './supabaseAdmin';
import { updateConversation, type Conversation, type ConversationStatus } from './store';

/**
 * Keeps the CRM (public.leads) in sync with what the bot learns. The CRM's
 * own data layer (src/lib/crm/leads.ts) runs in the browser on the anon key;
 * this one runs on the server with the service-role client, but writes the
 * exact same rows the /crm screens read.
 */

/** 9725XXXXXXXX → 05XXXXXXXX, the format the CRM stores and dials. */
export function toLocalPhone(waId: string): string {
  const digits = waId.replace(/\D/g, '');
  return digits.startsWith('972') ? `0${digits.slice(3)}` : digits;
}

/** Bot pipeline status → the CRM's coarser lead status. */
const CRM_STATUS: Record<ConversationStatus, string> = {
  new: 'new',
  awaiting_photo: 'new',
  quote_sent: 'pending',
  awaiting_reply: 'pending',
  interested: 'pending',
  booked: 'scheduled',
  not_relevant: 'canceled',
  needs_human: 'new',
};

export interface LeadPatch {
  name?: string;
  city?: string;
  address?: string;
  service?: string;
  price?: number | null;
  notes?: string;
  jobDate?: string;
  jobTime?: string;
  jobTimeEnd?: string;
}

/**
 * Creates the conversation's CRM lead on first contact with real substance,
 * updates it afterwards. Returns the lead id (also stored on the
 * conversation so later turns reuse it).
 */
export async function upsertLead(
  conversation: Conversation,
  status: ConversationStatus,
  patch: LeadPatch,
): Promise<string> {
  const client = supabaseAdmin();

  const row: Record<string, unknown> = { status: CRM_STATUS[status] };
  if (patch.name) row.name = patch.name;
  if (patch.city !== undefined) row.city = patch.city;
  if (patch.address !== undefined) row.address = patch.address;
  if (patch.service) row.services = [patch.service];
  if (patch.price !== undefined) row.price = patch.price;
  if (patch.notes !== undefined) row.notes = patch.notes;
  if (patch.jobDate !== undefined) row.job_date = patch.jobDate;
  if (patch.jobTime !== undefined) row.job_time = patch.jobTime;
  if (patch.jobTimeEnd !== undefined) row.job_time_end = patch.jobTimeEnd;

  if (conversation.leadId) {
    const { error } = await client.from('leads').update(row).eq('id', conversation.leadId);
    if (error) throw new Error(error.message);
    return conversation.leadId;
  }

  const { data, error } = await client
    .from('leads')
    .insert({
      name: patch.name || conversation.profileName || 'לקוח וואטסאפ',
      phone: toLocalPhone(conversation.waId),
      source: 'whatsapp',
      ...row,
    })
    .select('id')
    .single();
  if (error || !data) throw new Error(error?.message ?? 'lead insert failed');

  conversation.leadId = data.id as string;
  await updateConversation(conversation.id, { leadId: conversation.leadId });
  return conversation.leadId;
}
