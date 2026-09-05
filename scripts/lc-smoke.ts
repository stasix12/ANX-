/**
 * End-to-end smoke test for the LeadCloser core flow, no browser needed:
 *   create lead → AI conversation → photo → city → quote → slot → booking → job → dashboard revenue.
 * Run: npx tsx scripts/lc-smoke.ts
 */
import { buildDemoSnapshot } from '../src/lib/lc/demo/seed';
import { createLead, customerMessage, setTakeover } from '../src/lib/lc/ops';
import { funnel, monthStats, periodStats, recoveredStats, sourceStats, todayStats, aiGeneratedRevenue } from '../src/lib/lc/analytics';
import { addDays } from '../src/lib/lc/util';

const assert = (cond: unknown, msg: string) => {
  if (!cond) {
    console.error('✗', msg);
    process.exit(1);
  }
  console.log('✓', msg);
};

const now = new Date();
const t0 = Date.now();
let s = buildDemoSnapshot(now);
console.log(`seed built in ${Date.now() - t0}ms: ${s.leads.length} leads, ${s.conversations.length} conversations, ${s.messages.length} messages, ${s.quotes.length} quotes, ${s.bookings.length} bookings, ${s.jobs.length} jobs, ${s.automationRuns.length} runs, ~${Math.round(JSON.stringify(s).length / 1024)}KB`);
const from30 = addDays(now, -30);
console.log('30d:', periodStats(s, from30, now), 'funnel:', funnel(s, from30, now));
console.log('today:', todayStats(s, now));
console.log('month:', monthStats(s, now));
console.log('ai revenue 30d:', aiGeneratedRevenue(s, from30, now));
console.log('recovered 30d:', recoveredStats(s, from30, now));
console.log('sources:', sourceStats(s, from30, now).map((x) => `${x.source}:${x.leads}/${x.bookings}/₪${x.revenue}`).join(' '));
const statuses = s.conversations.reduce<Record<string, number>>((acc, c) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc), {});
console.log('conversation statuses:', statuses);
const jobStatuses = s.jobs.reduce<Record<string, number>>((acc, c) => ((acc[c.status] = (acc[c.status] ?? 0) + 1), acc), {});
console.log('job statuses:', jobStatuses);
assert(s.leads.length > 150, 'seed has plenty of leads');
assert(s.jobs.filter((j) => j.status === 'completed').length > 40, 'seed has completed jobs');
assert(Object.keys(statuses).length >= 5, 'seed covers most conversation statuses');
assert(recoveredStats(s, from30, now).revenue > 0, 'follow-up recovered revenue exists');

// Live flow in Russian.
const revenueBefore = periodStats(s, from30, now).revenue;
const r1 = createLead(s, { name: 'Тест Клиент', phone: '0501112233', source: 'google', channel: 'whatsapp', text: 'Сколько стоит почистить угловой диван?' }, now);
s = r1.snapshot;
const conv = () => s.conversations.find((c) => c.id === r1.conversationId)!;
const msgs = () => s.messages.filter((m) => m.conversationId === r1.conversationId);
console.log('\n--- RU flow ---');
for (const m of msgs()) console.log(`[${m.sender}] ${m.text}`);
assert(conv().language === 'ru', 'agent replied in Russian');
assert(msgs().some((m) => m.sender === 'ai' && m.text.includes('350')), 'agent quoted the base price from the pricing engine');
s = customerMessage(s, r1.conversationId, '', [{ type: 'image', url: '/lc/photos/item-1.svg' }], now).snapshot;
console.log(`[ai] ${msgs().at(-1)!.text}`);
s = customerMessage(s, r1.conversationId, 'Холон, и ещё матрас', [], now).snapshot;
console.log(`[ai] ${msgs().at(-1)!.text}`);
assert(conv().status === 'quote_sent', 'quote sent with slots');
const quote = s.quotes.find((q) => q.leadId === r1.leadId)!;
assert(quote && quote.total === 599, `package price corner sofa + mattress − 30 = 599 (got ${quote?.total})`);
assert(conv().agentState.offeredSlots.length >= 1, 'slots offered come from the scheduling engine');
const slot = conv().agentState.offeredSlots[0];
const hh = String(new Date(slot).getHours()).padStart(2, '0');
const mm = String(new Date(slot).getMinutes()).padStart(2, '0');
s = customerMessage(s, r1.conversationId, `Давайте в ${hh}:${mm}`, [], now).snapshot;
console.log(`[customer] Давайте в ${hh}:${mm}`);
console.log(`[ai] ${msgs().at(-1)!.text}`);
assert(conv().status === 'booked', 'conversation booked');
const lead = s.leads.find((l) => l.id === r1.leadId)!;
assert(lead.status === 'booked' && lead.bookingId, 'lead booked');
const job = s.jobs.find((j) => j.leadId === lead.id)!;
assert(job && job.price === 599 && job.status === 'booked', 'job created with the quoted price');
assert(periodStats(s, from30, now).revenue === revenueBefore + 599, 'dashboard revenue increased by the job price');
// Double booking guard: fill the same slot with more customers than workers.
for (let i = 0; i < 4; i++) {
  const r = createLead(s, { name: `Клиент ${i}`, phone: `05022233${i}0`, source: 'facebook', channel: 'whatsapp', text: 'угловой диван и матрас, Холон, без фото' }, now);
  s = r.snapshot;
  const c = s.conversations.find((x) => x.id === r.conversationId)!;
  if (c.agentState.offeredSlots.includes(slot)) s = customerMessage(s, r.conversationId, `в ${hh}:${mm}`, [], now).snapshot;
}
const overlapping = s.bookings.filter((b) => b.status === 'active' && b.startAt === slot).length;
assert(overlapping <= s.workers.filter((w) => w.active).length, `never more concurrent bookings than workers (${overlapping} ≤ ${s.workers.length})`);

// Hebrew hand-off + takeover
const r2 = createLead(s, { name: 'בדיקה', phone: '0523334455', source: 'instagram', channel: 'instagram', text: 'אני רוצה לדבר עם מנהל' }, now);
s = r2.snapshot;
assert(s.conversations.find((c) => c.id === r2.conversationId)!.status === 'human', 'hand-off to human on request');
s = setTakeover(s, r2.conversationId, false, now).snapshot;
assert(!s.conversations.find((c) => c.id === r2.conversationId)!.aiPaused, 'return to AI works');

// Honesty rule
const r3 = createLead(s, { name: 'Bot Check', phone: '0529998877', source: 'website', channel: 'website', text: 'Are you a bot?' }, now);
s = r3.snapshot;
const honest = s.messages.filter((m) => m.conversationId === r3.conversationId && m.sender === 'ai').at(-1)!.text;
console.log(`\n[ai] ${honest}`);
assert(/automated assistant/i.test(honest), 'agent discloses it is automated when asked');
console.log('\nALL GOOD');
