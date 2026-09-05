/**
 * WhatsApp inbound pipeline test with fakes for Supabase and Meta:
 *   webhook payload → parse → route to the org by phone_number_id → agent reply → "sent".
 * Run: npx tsx scripts/lc-whatsapp-smoke.ts
 */
import { buildDemoSnapshot } from '../src/lib/lc/demo/seed';
import { handleInbound, findOpenConversation } from '../src/lib/lc/server/inbound';
import { parseWebhook, toWaId, fromWaId } from '../src/lib/lc/server/whatsapp';
import type { Snapshot } from '../src/lib/lc/types';
import type { Write } from '../src/lib/lc/ops';

const assert = (c: unknown, m: string) => {
  if (!c) {
    console.error('✗', m);
    process.exit(1);
  }
  console.log('✓', m);
};

async function main() {
let snap: Snapshot = buildDemoSnapshot();
snap.integrations = [{ id: 'int1', organizationId: snap.organization.id, provider: 'whatsapp_cloud', status: 'connected', config: { phoneNumberId: '111222333', accessToken: 'test' }, lastError: null, connectedAt: new Date().toISOString(), updatedAt: new Date().toISOString() }];
const sent: { to: string; text: string }[] = [];

const deps = {
  loadByPhoneNumberId: async (id: string) => (id === '111222333' ? snap : null),
  persist: async (_org: string, writes: Write[]) => {
    for (const w of writes) {
      if (w.kind === 'put') {
        const rows = snap[w.collection] as unknown as { id: string }[];
        const i = rows.findIndex((r) => r.id === (w.row as { id: string }).id);
        if (i >= 0) rows[i] = w.row as { id: string };
        else rows.push(w.row as { id: string });
      }
    }
  },
  storeMedia: async () => [{ type: 'image' as const, url: '/lc/photos/item-1.svg' }],
  send: async (_s: Snapshot, to: string, text: string) => {
    sent.push({ to, text });
  },
};

const payload = (from: string, text: string, image?: boolean) => ({
  object: 'whatsapp_business_account',
  entry: [{ id: 'waba', changes: [{ field: 'messages', value: { messaging_product: 'whatsapp', metadata: { display_phone_number: '972501234567', phone_number_id: '111222333' }, contacts: [{ profile: { name: 'Наталья' }, wa_id: from }], messages: [image ? { from, id: `wamid.${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'image', image: { id: 'media1', mime_type: 'image/jpeg' } } : { from, id: `wamid.${Date.now()}`, timestamp: String(Math.floor(Date.now() / 1000)), type: 'text', text: { body: text } }] } }] }],
});

assert(toWaId('050-777-8899') === '972507778899' && fromWaId('972507778899') === '0507778899', 'phone conversion both ways');
assert(parseWebhook({ object: 'other' }).length === 0, 'ignores non-WhatsApp objects');
assert(parseWebhook({ object: 'whatsapp_business_account', entry: [{ changes: [{ value: { metadata: { phone_number_id: 'x' }, statuses: [{}] } }] }] }).length === 0, 'ignores status-only events');

const before = snap.leads.length;
const m1 = parseWebhook(payload('972507778899', 'Здравствуйте! Сколько стоит почистить угловой диван?'))[0];
assert(m1.text.includes('угловой') && m1.name === 'Наталья', 'parses text message + contact name');
const r1 = await handleInbound(m1, deps);
assert(r1 && r1.isNewLead && snap.leads.length === before + 1, 'unknown number → new lead');
assert(sent.length === 1 && sent[0].to === '0507778899' && sent[0].text.includes('350'), `agent reply sent to the customer with the engine price (${sent[0]?.text.slice(0, 60)}…)`);

const r2 = await handleInbound(parseWebhook(payload('972507778899', '', true))[0], deps);
assert(r2 && !r2.isNewLead && r2.conversationId === r1!.conversationId, 'photo from the same number continues the same conversation');
const r3 = await handleInbound(parseWebhook(payload('972507778899', 'Бат-Ям'))[0], deps);
assert(sent.at(-1)!.text.includes('Итого: ₪350') || sent.at(-1)!.text.includes('350'), 'quote sent after city');
assert(snap.conversations.find((c) => c.id === r3!.conversationId)!.status === 'quote_sent', 'conversation status quote_sent');

const unknown = await handleInbound(parseWebhook({ ...payload('972501111111', 'hi'), entry: [{ changes: [{ value: { metadata: { phone_number_id: 'nope' }, messages: [{ from: '972501111111', id: 'x', timestamp: '1', type: 'text', text: { body: 'hi' } }] } }] }] })[0], deps);
assert(unknown === null, 'unknown phone_number_id is ignored');

// A booked conversation older than a day → new lead next time.
const conv = snap.conversations.find((c) => c.id === r1!.conversationId)!;
conv.status = 'booked';
conv.lastMessageAt = new Date(Date.now() - 3 * 86400000).toISOString();
assert(findOpenConversation(snap, '0507778899', new Date()) === null, 'old booked conversation is not reopened');
console.log('\nALL GOOD');
}
void main();
