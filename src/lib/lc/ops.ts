import { runAgentTurn, agentGreeting, type AgentContext } from './agent/engine';
import { bookingVars, cancelFollowUps, dueRuns, renderMessage, scheduleRuns } from './automations';
import { buildQuote, calculatePrice } from './pricing';
import { pickWorker, slotConflict } from './scheduling';
import type {
  ActivityLog,
  AgentSettings,
  Attachment,
  Automation,
  Booking,
  Channel,
  CollectionName,
  CollectionRow,
  Conversation,
  Customer,
  Job,
  JobStatus,
  Lead,
  LeadSourceKey,
  Locale,
  LostReason,
  Message,
  Organization,
  PlanKey,
  PricingRule,
  Quote,
  Service,
  Snapshot,
  Subscription,
  Worker,
} from './types';
import { emptyAgentState, emptyQualification } from './types';
import { addMinutes, normalizePhone, pick, uid } from './util';
import { detectLanguage } from './util';

/**
 * Business operations. Each op takes the current snapshot and returns a new
 * snapshot plus the list of writes the store must persist. Pure and
 * synchronous, so the same code runs in the browser (demo) and on the server.
 */

export type Write =
  | { kind: 'put'; collection: CollectionName; row: CollectionRow<CollectionName> }
  | { kind: 'remove'; collection: CollectionName; id: string }
  | { kind: 'settings'; settings: AgentSettings }
  | { kind: 'organization'; organization: Organization }
  | { kind: 'subscription'; subscription: Subscription };

export interface Patch {
  snapshot: Snapshot;
  writes: Write[];
  /** Side-effects for the UI (toasts, navigation). */
  events: { type: string; payload?: Record<string, unknown> }[];
}

class Tx {
  s: Snapshot;
  writes: Write[] = [];
  events: Patch['events'] = [];
  private copied = new Set<CollectionName>();
  constructor(snapshot: Snapshot, public now: Date) {
    this.s = { ...snapshot };
  }
  private rows<K extends CollectionName>(c: K): CollectionRow<K>[] {
    if (!this.copied.has(c)) {
      (this.s as unknown as Record<string, unknown>)[c] = [...(this.s[c] as unknown as CollectionRow<K>[])];
      this.copied.add(c);
    }
    return this.s[c] as unknown as CollectionRow<K>[];
  }
  put<K extends CollectionName>(c: K, row: CollectionRow<K>) {
    const rows = this.rows(c);
    const i = rows.findIndex((r) => (r as { id: string }).id === (row as { id: string }).id);
    if (i >= 0) rows[i] = row;
    else rows.push(row);
    this.writes.push({ kind: 'put', collection: c, row: row as CollectionRow<CollectionName> });
    return row;
  }
  remove(c: CollectionName, id: string) {
    const rows = this.rows(c) as { id: string }[];
    const i = rows.findIndex((r) => r.id === id);
    if (i >= 0) rows.splice(i, 1);
    this.writes.push({ kind: 'remove', collection: c, id });
  }
  settings(settings: AgentSettings) {
    this.s.settings = settings;
    this.writes.push({ kind: 'settings', settings });
  }
  organization(o: Organization) {
    this.s.organization = o;
    this.writes.push({ kind: 'organization', organization: o });
  }
  subscription(sub: Subscription) {
    this.s.subscription = sub;
    this.writes.push({ kind: 'subscription', subscription: sub });
  }
  log(actor: ActivityLog['actor'], entityType: string, entityId: string, action: string, payload: Record<string, unknown> = {}) {
    this.put('activityLogs', { id: uid('log'), organizationId: this.s.organization.id, actor, entityType, entityId, action, payload, createdAt: this.now.toISOString() });
  }
  emit(type: string, payload?: Record<string, unknown>) {
    this.events.push({ type, payload });
  }
  done(): Patch {
    return { snapshot: this.s, writes: this.writes, events: this.events };
  }
}

const orgId = (s: Snapshot) => s.organization.id;

function agentCtx(tx: Tx, conv: Conversation, lead: Lead, customer: Customer): AgentContext {
  return { organization: tx.s.organization, settings: tx.s.settings, services: tx.s.services, rules: tx.s.pricingRules, bookings: tx.s.bookings, workers: tx.s.workers, customer, qualification: lead.qualification, state: conv.agentState, now: tx.now };
}

function addMessage(tx: Tx, conv: Conversation, sender: Message['sender'], text: string, attachments: Attachment[] = [], meta: Message['meta'] = {}, at = tx.now): Message {
  const m: Message = { id: uid('m'), organizationId: orgId(tx.s), conversationId: conv.id, sender, text, attachments, meta, createdAt: at.toISOString() };
  tx.put('messages', m);
  conv.lastMessageText = text || (attachments.length ? '📷' : '');
  conv.lastMessageAt = at.toISOString();
  return m;
}

function scheduleQuoteFollowUps(tx: Tx, conv: Conversation, customer: Customer, quote: Quote) {
  const runs = scheduleRuns({ organizationId: orgId(tx.s), automations: tx.s.automations, trigger: 'quote_no_reply', entityType: 'conversation', entityId: conv.id, conversationId: conv.id, locale: conv.language, vars: { name: customer.name.split(' ')[0], total: `₪${quote.total}` }, anchor: tx.now, now: tx.now });
  for (const r of runs) tx.put('automationRuns', r);
}

function createJobFromBooking(tx: Tx, booking: Booking, lead: Lead, customer: Customer, quote: Quote, durationMin: number): Job {
  const summary = quote.lines.map((l) => (l.quantity > 1 ? `${l.label} ×${l.quantity}` : l.label)).join(', ');
  const job: Job = {
    id: uid('job'), organizationId: orgId(tx.s), bookingId: booking.id, leadId: lead.id, customerId: customer.id, workerId: booking.workerId, serviceSummary: summary, serviceIds: quote.lines.map((l) => l.serviceId), address: lead.qualification.address || customer.addresses[0]?.street || '', city: lead.qualification.city || customer.city, scheduledAt: booking.startAt, durationMin, price: quote.total, paymentStatus: 'unpaid', status: 'booked', internalNotes: '', customerNotes: lead.qualification.condition ?? '', photos: tx.s.messages.filter((m) => m.conversationId === lead.conversationId && m.attachments.length).flatMap((m) => m.attachments), leadSource: lead.source, completedAt: null, createdAt: tx.now.toISOString(),
  };
  tx.put('jobs', job);
  return job;
}

function fireBookingAutomations(tx: Tx, booking: Booking, job: Job, customer: Customer, conv: Conversation, quote: Quote | null) {
  const worker = tx.s.workers.find((w) => w.id === booking.workerId) ?? null;
  const vars = bookingVars(customer, booking, job, worker, quote, conv.language);
  const runs = [
    ...scheduleRuns({ organizationId: orgId(tx.s), automations: tx.s.automations, trigger: 'booking_created', entityType: 'booking', entityId: booking.id, conversationId: conv.id, locale: conv.language, vars, anchor: tx.now, now: tx.now }),
    ...scheduleRuns({ organizationId: orgId(tx.s), automations: tx.s.automations, trigger: 'before_appointment', entityType: 'booking', entityId: booking.id, conversationId: conv.id, locale: conv.language, vars, anchor: new Date(booking.startAt), now: tx.now }),
    ...(worker ? scheduleRuns({ organizationId: orgId(tx.s), automations: tx.s.automations, trigger: 'worker_assigned', entityType: 'job', entityId: job.id, conversationId: null, locale: tx.s.organization.locale, vars, anchor: tx.now, now: tx.now }) : []),
  ];
  for (const r of runs) tx.put('automationRuns', r);
}

/** Applies an agent turn result to the conversation, lead, customer and downstream entities. */
function applyAgentTurn(tx: Tx, conv: Conversation, lead: Lead, customer: Customer, turn: ReturnType<typeof runAgentTurn>) {
  lead.qualification = turn.qualification;
  conv.agentState = turn.state;
  conv.language = turn.language;
  lead.language = turn.language;
  if (turn.customerUpdates) Object.assign(customer, turn.customerUpdates);
  customer.language = turn.language;

  let quote: Quote | null = tx.s.quotes.find((q) => q.id === lead.quoteId) ?? null;
  if (turn.quote && !turn.booking) {
    quote = buildQuote(turn.quote, { organizationId: orgId(tx.s), leadId: lead.id, conversationId: conv.id });
    tx.put('quotes', quote);
    lead.quoteId = quote.id;
    lead.status = 'quoted';
    lead.value = quote.total;
    conv.agentState.lastQuoteId = quote.id;
    tx.log('ai', 'quote', quote.id, 'quote_sent', { total: quote.total, leadId: lead.id });
    scheduleQuoteFollowUps(tx, conv, customer, quote);
  }
  for (const reply of turn.replies) addMessage(tx, conv, 'ai', reply, [], turn.quote && !turn.booking ? { kind: 'quote', quoteId: quote?.id } : turn.booking ? { kind: 'booking' } : turn.handoff ? { kind: 'handoff' } : {});
  conv.status = turn.status;
  if (lead.status === 'new' && lead.qualification.items.length) lead.status = 'qualified';

  if (turn.handoff) {
    conv.aiPaused = true;
    conv.status = 'human';
    conv.unreadCount += 1;
    lead.aiHandled = false;
    tx.log('ai', 'conversation', conv.id, 'handoff', { reason: turn.handoff.reason });
    tx.emit('handoff', { conversationId: conv.id, reason: turn.handoff.reason });
  }

  if (turn.booking) {
    if (!quote || turn.quote) {
      quote = buildQuote(turn.quote!, { organizationId: orgId(tx.s), leadId: lead.id, conversationId: conv.id }, 'accepted');
      tx.put('quotes', quote);
    } else {
      quote = { ...quote, status: 'accepted' };
      tx.put('quotes', quote);
    }
    const start = new Date(turn.booking.startAt);
    const worker = pickWorker(start, turn.booking.durationMin, lead.qualification.city || customer.city, tx.s.bookings, tx.s.workers, tx.s.settings.travelBufferMin);
    const booking: Booking = { id: uid('b'), organizationId: orgId(tx.s), leadId: lead.id, quoteId: quote.id, customerId: customer.id, workerId: worker?.id ?? null, startAt: turn.booking.startAt, endAt: turn.booking.endAt, status: 'active', createdBy: 'ai', createdAt: tx.now.toISOString() };
    tx.put('bookings', booking);
    lead.bookingId = booking.id;
    lead.quoteId = quote.id;
    lead.status = 'booked';
    lead.value = quote.total;
    conv.status = 'booked';
    const job = createJobFromBooking(tx, booking, lead, customer, quote, turn.booking.durationMin);
    tx.log('ai', 'booking', booking.id, 'booking_created', { total: quote.total, when: booking.startAt, jobId: job.id, customer: customer.name });
    // Follow-ups no longer needed; credit recovery if a follow-up had been sent.
    const runs = tx.s.automationRuns.filter((r) => r.conversationId === conv.id && r.automationKey.startsWith('quote_followup'));
    const sentFollowUp = runs.find((r) => r.status === 'sent');
    for (const r of cancelFollowUps(runs, conv.id)) if (r.status === 'skipped') tx.put('automationRuns', r);
    if (sentFollowUp) tx.put('automationRuns', { ...sentFollowUp, recoveredValue: quote.total });
    fireBookingAutomations(tx, booking, job, customer, conv, quote);
    tx.emit('booked', { jobId: job.id, total: quote.total, customer: customer.name });
  }

  lead.updatedAt = tx.now.toISOString();
  customer.lastContactAt = tx.now.toISOString();
  tx.put('conversations', { ...conv });
  tx.put('leads', { ...lead });
  tx.put('customers', { ...customer });
}

// ───────────────────────────── Leads & conversations ─────────────────────────────

export interface NewLeadInput {
  name: string;
  phone: string;
  language?: Locale;
  source: LeadSourceKey;
  channel: Channel;
  city?: string;
  text?: string;
  attachments?: Attachment[];
}

export function createLead(s: Snapshot, input: NewLeadInput, now = new Date()): Patch & { leadId: string; conversationId: string } {
  const tx = new Tx(s, now);
  const phone = normalizePhone(input.phone);
  const language = input.language ?? (input.text ? detectLanguage(input.text, s.organization.locale) : s.organization.locale);
  let customer = phone ? tx.s.customers.find((c) => normalizePhone(c.phone) === phone) : undefined;
  if (!customer) {
    customer = { id: uid('c'), organizationId: orgId(s), name: input.name || { he: 'לקוח חדש', ru: 'Новый клиент', en: 'New customer' }[language], phone: input.phone, language, addresses: [], city: input.city ?? '', notes: '', tags: [], source: input.source, lifetimeValue: 0, lastContactAt: now.toISOString(), createdAt: now.toISOString() };
  } else {
    customer = { ...customer, lastContactAt: now.toISOString() };
  }
  const conv: Conversation = { id: uid('conv'), organizationId: orgId(s), leadId: '', customerId: customer.id, channel: input.channel, language, status: 'new', aiPaused: false, unreadCount: 1, lastMessageText: input.text ?? '', lastMessageAt: now.toISOString(), agentState: emptyAgentState(), followUpStage: 0, createdAt: now.toISOString() };
  const lead: Lead = { id: uid('lead'), organizationId: orgId(s), customerId: customer.id, conversationId: conv.id, source: input.source, channel: input.channel, status: 'new', language, qualification: { ...emptyQualification(), city: input.city }, quoteId: null, bookingId: null, lostReason: null, aiHandled: true, value: 0, createdAt: now.toISOString(), updatedAt: now.toISOString() };
  conv.leadId = lead.id;
  tx.put('customers', customer);
  tx.put('leads', lead);
  tx.put('conversations', conv);
  tx.log('system', 'lead', lead.id, 'lead_received', { source: input.source, customer: customer.name });
  const auto = tx.s.automations.find((a) => a.key === 'lead_ai_reply');
  if (auto?.enabled) tx.put('automationRuns', { id: uid('run'), organizationId: orgId(s), automationId: auto.id, automationKey: auto.key, entityType: 'lead', entityId: lead.id, conversationId: conv.id, scheduledAt: now.toISOString(), sentAt: now.toISOString(), status: 'sent', renderedMessage: pick(auto.message, language), recoveredValue: 0 });

  if (input.text) {
    addMessage(tx, conv, 'customer', input.text, input.attachments ?? []);
    if (auto?.enabled !== false) {
      const turn = runAgentTurn(agentCtx(tx, conv, lead, customer), { text: input.text, attachments: input.attachments });
      applyAgentTurn(tx, conv, lead, customer, turn);
    }
  } else if (auto?.enabled !== false) {
    const g = agentGreeting(agentCtx(tx, conv, lead, customer));
    conv.agentState = g.state;
    conv.status = 'ai';
    addMessage(tx, conv, 'ai', g.replies[0]);
    tx.put('conversations', { ...conv });
  }
  tx.emit('lead_created', { leadId: lead.id, conversationId: conv.id, customer: customer.name });
  return { ...tx.done(), leadId: lead.id, conversationId: conv.id };
}

export function customerMessage(s: Snapshot, conversationId: string, text: string, attachments: Attachment[] = [], now = new Date()): Patch {
  const tx = new Tx(s, now);
  const conv = { ...tx.s.conversations.find((c) => c.id === conversationId)! };
  const lead = { ...tx.s.leads.find((l) => l.id === conv.leadId)! };
  const customer = { ...tx.s.customers.find((c) => c.id === conv.customerId)! };
  addMessage(tx, conv, 'customer', text, attachments);
  // A reply cancels the follow-up sequence.
  for (const r of cancelFollowUps(tx.s.automationRuns.filter((x) => x.conversationId === conv.id), conv.id)) if (r.status === 'skipped') tx.put('automationRuns', r);
  if (conv.aiPaused) {
    conv.unreadCount += 1;
    conv.status = 'human';
    customer.lastContactAt = now.toISOString();
    tx.put('conversations', conv);
    tx.put('customers', customer);
    return tx.done();
  }
  const turn = runAgentTurn(agentCtx(tx, conv, lead, customer), { text, attachments });
  if (attachments.length && turn.photoAnalysis) {
    const last = tx.s.messages.filter((m) => m.conversationId === conv.id && m.sender === 'customer').pop();
    if (last) tx.put('messages', { ...last, attachments: last.attachments.map((a, i) => ({ ...a, analysis: turn.photoAnalysis?.[i] })) });
  }
  applyAgentTurn(tx, conv, lead, customer, turn);
  return tx.done();
}

export function ownerMessage(s: Snapshot, conversationId: string, text: string, now = new Date()): Patch {
  const tx = new Tx(s, now);
  const conv = { ...tx.s.conversations.find((c) => c.id === conversationId)! };
  addMessage(tx, conv, 'owner', text);
  conv.unreadCount = 0;
  if (!conv.aiPaused) {
    conv.aiPaused = true;
    conv.status = 'human';
  }
  tx.put('conversations', conv);
  const lead = tx.s.leads.find((l) => l.id === conv.leadId);
  if (lead && lead.aiHandled) tx.put('leads', { ...lead, aiHandled: false, updatedAt: now.toISOString() });
  return tx.done();
}

export function setTakeover(s: Snapshot, conversationId: string, human: boolean, now = new Date()): Patch {
  const tx = new Tx(s, now);
  const conv = { ...tx.s.conversations.find((c) => c.id === conversationId)! };
  conv.aiPaused = human;
  if (human) conv.status = 'human';
  else conv.status = conv.agentState.step === 'done' ? 'booked' : conv.agentState.lastQuoteId ? 'quote_sent' : conv.agentState.turns > 0 ? 'ai' : 'new';
  if (!human && conv.agentState.step === 'handoff') conv.agentState = { ...conv.agentState, step: conv.agentState.lastQuoteId ? 'quote' : 'discover' };
  tx.put('conversations', conv);
  const lead = tx.s.leads.find((l) => l.id === conv.leadId);
  if (lead && human) tx.put('leads', { ...lead, aiHandled: false });
  tx.log('owner', 'conversation', conv.id, human ? 'takeover' : 'return_to_ai');
  return tx.done();
}

export function markRead(s: Snapshot, conversationId: string, now = new Date()): Patch {
  const tx = new Tx(s, now);
  const conv = tx.s.conversations.find((c) => c.id === conversationId);
  if (conv && conv.unreadCount > 0) tx.put('conversations', { ...conv, unreadCount: 0 });
  return tx.done();
}

export function markLost(s: Snapshot, leadId: string, reason: LostReason, now = new Date()): Patch {
  const tx = new Tx(s, now);
  const lead = tx.s.leads.find((l) => l.id === leadId);
  if (!lead) return tx.done();
  tx.put('leads', { ...lead, status: 'lost', lostReason: reason, updatedAt: now.toISOString() });
  const conv = tx.s.conversations.find((c) => c.id === lead.conversationId);
  if (conv) tx.put('conversations', { ...conv, status: 'lost' });
  for (const r of cancelFollowUps(tx.s.automationRuns.filter((x) => x.conversationId === lead.conversationId), lead.conversationId)) if (r.status === 'skipped') tx.put('automationRuns', r);
  tx.log('owner', 'lead', leadId, 'lead_lost', { reason });
  return tx.done();
}

/** Delivers due automation runs (mock messaging → message in the conversation). */
export function tick(s: Snapshot, now = new Date()): Patch {
  const tx = new Tx(s, now);
  const due = dueRuns(tx.s.automationRuns, now);
  for (const run of due) {
    const conv = run.conversationId ? tx.s.conversations.find((c) => c.id === run.conversationId) : undefined;
    const sent = { ...run, status: 'sent' as const, sentAt: now.toISOString() };
    tx.put('automationRuns', sent);
    if (conv && (run.entityType !== 'job' || true)) {
      const c = { ...conv };
      if (run.automationKey.startsWith('quote_followup')) {
        if (c.status === 'booked' || c.status === 'lost' || c.aiPaused) {
          tx.put('automationRuns', { ...sent, status: 'skipped' });
          continue;
        }
        c.followUpStage = Math.min(3, c.followUpStage + 1) as Conversation['followUpStage'];
        c.status = 'waiting';
        if (run.automationKey === 'quote_followup_3') {
          const lead = tx.s.leads.find((l) => l.id === c.leadId);
          if (lead && lead.status !== 'booked') {
            // Final follow-up went out; the lead is considered lost after it.
            tx.put('leads', { ...lead, status: 'quoted' });
          }
        }
      }
      addMessage(tx, c, 'ai', run.renderedMessage, [], { kind: run.automationKey.startsWith('quote_followup') ? 'followup' : 'note', automationKey: run.automationKey }, new Date(run.scheduledAt) < now ? now : new Date(run.scheduledAt));
      tx.put('conversations', c);
    }
  }
  return tx.done();
}

// ───────────────────────────── Jobs & bookings ─────────────────────────────

export function updateJob(s: Snapshot, jobId: string, patch: Partial<Job>, now = new Date()): Patch {
  const tx = new Tx(s, now);
  const prev = tx.s.jobs.find((j) => j.id === jobId);
  if (!prev) return tx.done();
  const job: Job = { ...prev, ...patch };
  const conv = tx.s.conversations.find((c) => c.leadId === job.leadId);
  const customer = tx.s.customers.find((c) => c.id === job.customerId);
  const booking = tx.s.bookings.find((b) => b.id === job.bookingId);
  const locale = conv?.language ?? tx.s.organization.locale;
  const worker = tx.s.workers.find((w) => w.id === job.workerId) ?? null;
  const vars = customer && booking ? bookingVars(customer, booking, job, worker, tx.s.quotes.find((q) => q.id === booking.quoteId) ?? null, locale) : {};
  const fire = (trigger: Automation['trigger'], anchor = now) => {
    for (const r of scheduleRuns({ organizationId: orgId(s), automations: tx.s.automations, trigger, entityType: 'job', entityId: job.id, conversationId: conv?.id ?? null, locale, vars, anchor, now })) tx.put('automationRuns', r);
  };
  if (patch.workerId !== undefined && patch.workerId !== prev.workerId) {
    if (booking) tx.put('bookings', { ...booking, workerId: patch.workerId });
    if (patch.workerId) fire('worker_assigned');
    tx.log('owner', 'job', job.id, 'worker_assigned', { workerId: patch.workerId });
  }
  if (patch.status && patch.status !== prev.status) {
    if (patch.status === 'on_the_way') fire('worker_on_the_way');
    if (patch.status === 'completed') {
      job.completedAt = now.toISOString();
      fire('job_completed');
      fire('after_completion_review');
      fire('after_completion_followup');
      fire('reactivation');
      if (customer) tx.put('customers', { ...customer, lifetimeValue: customer.lifetimeValue + job.price, lastContactAt: now.toISOString() });
      tx.log('worker', 'job', job.id, 'job_completed', { price: job.price, customer: customer?.name });
    }
    if (patch.status === 'cancelled') {
      if (booking) tx.put('bookings', { ...booking, status: 'cancelled' });
      for (const r of tx.s.automationRuns.filter((x) => (x.entityId === job.id || x.entityId === booking?.id) && x.status === 'scheduled')) tx.put('automationRuns', { ...r, status: 'skipped' });
      tx.log('owner', 'job', job.id, 'job_cancelled');
    }
  }
  tx.put('jobs', job);
  return tx.done();
}

export const JOB_FLOW: JobStatus[] = ['booked', 'confirmed', 'on_the_way', 'in_progress', 'completed'];

export interface ManualBookingInput {
  customerId?: string;
  name: string;
  phone: string;
  language?: Locale;
  city: string;
  address: string;
  items: { serviceId: string; quantity: number }[];
  startAt: string;
  workerId: string | null;
  notes?: string;
  source?: LeadSourceKey;
}

export function createManualBooking(s: Snapshot, input: ManualBookingInput, now = new Date()): Patch & { error?: string; jobId?: string } {
  const tx = new Tx(s, now);
  const price = calculatePrice({ items: input.items, city: input.city }, tx.s.services, tx.s.pricingRules, tx.s.organization.locale);
  const durationMin = Math.max(45, price.durationMin || 60);
  const start = new Date(input.startAt);
  if (slotConflict(start, durationMin, tx.s.bookings, tx.s.workers, tx.s.settings.travelBufferMin, input.workerId)) return { ...tx.done(), error: 'slot_taken' };
  let customer = input.customerId ? tx.s.customers.find((c) => c.id === input.customerId) : tx.s.customers.find((c) => normalizePhone(c.phone) === normalizePhone(input.phone));
  if (!customer) {
    customer = { id: uid('c'), organizationId: orgId(s), name: input.name, phone: input.phone, language: input.language ?? tx.s.organization.locale, addresses: [{ street: input.address, city: input.city }], city: input.city, notes: '', tags: [], source: input.source ?? 'other', lifetimeValue: 0, lastContactAt: now.toISOString(), createdAt: now.toISOString() };
  }
  const conv: Conversation = { id: uid('conv'), organizationId: orgId(s), leadId: '', customerId: customer.id, channel: 'manual', language: customer.language, status: 'booked', aiPaused: true, unreadCount: 0, lastMessageText: '', lastMessageAt: now.toISOString(), agentState: { ...emptyAgentState(), step: 'done' }, followUpStage: 0, createdAt: now.toISOString() };
  const lead: Lead = { id: uid('lead'), organizationId: orgId(s), customerId: customer.id, conversationId: conv.id, source: input.source ?? 'other', channel: 'manual', status: 'booked', language: customer.language, qualification: { ...emptyQualification(), items: input.items, serviceIds: input.items.map((i) => i.serviceId), city: input.city, address: input.address }, quoteId: null, bookingId: null, lostReason: null, aiHandled: false, value: price.total, createdAt: now.toISOString(), updatedAt: now.toISOString() };
  conv.leadId = lead.id;
  const quote = buildQuote(price, { organizationId: orgId(s), leadId: lead.id, conversationId: conv.id }, 'accepted');
  const booking: Booking = { id: uid('b'), organizationId: orgId(s), leadId: lead.id, quoteId: quote.id, customerId: customer.id, workerId: input.workerId, startAt: start.toISOString(), endAt: addMinutes(start, durationMin).toISOString(), status: 'active', createdBy: 'owner', createdAt: now.toISOString() };
  lead.quoteId = quote.id;
  lead.bookingId = booking.id;
  tx.put('customers', customer);
  tx.put('leads', lead);
  tx.put('conversations', conv);
  tx.put('quotes', quote);
  tx.put('bookings', booking);
  const job = createJobFromBooking(tx, booking, lead, customer, quote, durationMin);
  if (input.notes) tx.put('jobs', { ...job, internalNotes: input.notes });
  addMessage(tx, conv, 'system', { he: 'הזמנה נוצרה ידנית מהיומן', ru: 'Запись создана вручную из календаря', en: 'Booking created manually from the calendar' }[customer.language]);
  tx.put('conversations', { ...conv });
  fireBookingAutomations(tx, booking, job, customer, conv, quote);
  tx.log('owner', 'booking', booking.id, 'booking_created', { total: quote.total, when: booking.startAt, customer: customer.name });
  return { ...tx.done(), jobId: job.id };
}

// ───────────────────────────── Catalogue, workers, automations, settings ─────────────────────────────

export function upsertService(s: Snapshot, service: Service, now = new Date()): Patch {
  const tx = new Tx(s, now);
  tx.put('services', service);
  return tx.done();
}
export function removeService(s: Snapshot, id: string, now = new Date()): Patch {
  const tx = new Tx(s, now);
  tx.remove('services', id);
  return tx.done();
}
export function upsertRule(s: Snapshot, rule: PricingRule, now = new Date()): Patch {
  const tx = new Tx(s, now);
  tx.put('pricingRules', rule);
  return tx.done();
}
export function removeRule(s: Snapshot, id: string, now = new Date()): Patch {
  const tx = new Tx(s, now);
  tx.remove('pricingRules', id);
  return tx.done();
}
export function upsertWorker(s: Snapshot, worker: Worker, now = new Date()): Patch {
  const tx = new Tx(s, now);
  tx.put('workers', worker);
  return tx.done();
}
export function removeWorker(s: Snapshot, id: string, now = new Date()): Patch {
  const tx = new Tx(s, now);
  tx.remove('workers', id);
  for (const j of tx.s.jobs.filter((x) => x.workerId === id)) tx.put('jobs', { ...j, workerId: null });
  return tx.done();
}
export function upsertAutomation(s: Snapshot, automation: Automation, now = new Date()): Patch {
  const tx = new Tx(s, now);
  tx.put('automations', automation);
  return tx.done();
}
export function saveSettings(s: Snapshot, settings: AgentSettings, now = new Date()): Patch {
  const tx = new Tx(s, now);
  tx.settings(settings);
  return tx.done();
}
export function saveOrganization(s: Snapshot, org: Organization, now = new Date()): Patch {
  const tx = new Tx(s, now);
  tx.organization(org);
  return tx.done();
}
export function changePlan(s: Snapshot, plan: PlanKey, now = new Date()): Patch {
  const tx = new Tx(s, now);
  tx.subscription({ ...tx.s.subscription, plan, status: 'active' });
  tx.log('owner', 'subscription', orgId(s), 'plan_changed', { plan });
  return tx.done();
}
export function updateCustomer(s: Snapshot, customer: Customer, now = new Date()): Patch {
  const tx = new Tx(s, now);
  tx.put('customers', customer);
  return tx.done();
}
export function setAdSpend(s: Snapshot, source: LeadSourceKey, amount: number, now = new Date()): Patch {
  const tx = new Tx(s, now);
  const ls = tx.s.leadSources.find((x) => x.key === source);
  if (ls) tx.put('leadSources', { ...ls, adSpendMonth: amount });
  return tx.done();
}

/** Renders an automation preview for the UI. */
export function previewAutomation(a: Automation, locale: Locale): string {
  return renderMessage(a, locale, { name: { he: 'רונית', ru: 'Наталья', en: 'Sarah' }[locale], date: { he: 'יום ג׳ 12/9', ru: 'вт 12.09', en: 'Tue 12 Sep' }[locale], time: '10:00', address: { he: 'הרצל 12, תל אביב', ru: 'Герцль 12, Тель-Авив', en: '12 Herzl St, Tel Aviv' }[locale], service: { he: 'ספה פינתית', ru: 'Угловой диван', en: 'Corner sofa' }[locale], worker: { he: 'יוסי', ru: 'Йоси', en: 'Yossi' }[locale], total: '₪599', eta: '20', review_link: 'g.page/r/…' });
}
