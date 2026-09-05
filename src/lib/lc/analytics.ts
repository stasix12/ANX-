import type { AutomationRun, Conversation, Job, Lead, LeadSourceKey, LostReason, Quote, Service, Snapshot, Worker } from './types';
import { LEAD_SOURCE_KEYS } from './types';
import { addDays, endOfDay, groupBy, isWithin, pct, startOfDay, startOfMonth, sum, toDateKey } from './util';

/** Revenue counts completed + booked/confirmed/in-progress jobs (money committed), excluding cancelled. */
const countsAsRevenue = (j: Job) => j.status !== 'cancelled';

export interface PeriodStats {
  leads: number;
  aiConversations: number;
  booked: number;
  lost: number;
  revenue: number;
  avgJob: number;
  conversion: number;
}

export function periodStats(s: Snapshot, from: Date, to: Date): PeriodStats {
  const leads = s.leads.filter((l) => isWithin(l.createdAt, from, to));
  const convs = s.conversations.filter((c) => isWithin(c.createdAt, from, to) && !c.aiPaused);
  const jobs = s.jobs.filter((j) => isWithin(j.createdAt, from, to) && countsAsRevenue(j));
  const revenue = sum(jobs.map((j) => j.price));
  const booked = leads.filter((l) => l.status === 'booked').length;
  return {
    leads: leads.length,
    aiConversations: convs.length,
    booked,
    lost: leads.filter((l) => l.status === 'lost').length,
    revenue,
    avgJob: jobs.length ? Math.round(revenue / jobs.length) : 0,
    conversion: pct(booked, leads.length),
  };
}

export function todayStats(s: Snapshot, now = new Date()) {
  return periodStats(s, startOfDay(now), endOfDay(now));
}
export function monthStats(s: Snapshot, now = new Date()) {
  return periodStats(s, startOfMonth(now), endOfDay(now));
}
export function lastMonthStats(s: Snapshot, now = new Date()) {
  const start = new Date(now.getFullYear(), now.getMonth() - 1, 1);
  const end = new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
  return periodStats(s, start, end);
}

/** Revenue the AI generated: jobs whose lead was booked without human takeover. */
export function aiGeneratedRevenue(s: Snapshot, from: Date, to: Date): { total: number; jobs: number; share: number } {
  const jobs = s.jobs.filter((j) => isWithin(j.createdAt, from, to) && countsAsRevenue(j));
  const ai = jobs.filter((j) => s.leads.find((l) => l.id === j.leadId)?.aiHandled);
  return { total: sum(ai.map((j) => j.price)), jobs: ai.length, share: pct(ai.length, jobs.length) };
}

export interface Funnel {
  leads: number;
  qualified: number;
  quotes: number;
  bookings: number;
}
export function funnel(s: Snapshot, from: Date, to: Date): Funnel {
  const leads = s.leads.filter((l) => isWithin(l.createdAt, from, to));
  const ids = new Set(leads.map((l) => l.id));
  const qualified = leads.filter((l) => l.qualification.items.length > 0 || l.status !== 'new').length;
  const quotes = s.quotes.filter((q) => ids.has(q.leadId)).length;
  const bookings = leads.filter((l) => l.status === 'booked').length;
  return { leads: leads.length, qualified: Math.max(qualified, quotes), quotes, bookings };
}

export interface SourceStats {
  source: LeadSourceKey;
  leads: number;
  bookings: number;
  conversion: number;
  revenue: number;
  adSpend: number;
  roas: number | null;
}
export function sourceStats(s: Snapshot, from: Date, to: Date): SourceStats[] {
  const leads = s.leads.filter((l) => isWithin(l.createdAt, from, to));
  const byLead = new Map(s.jobs.filter(countsAsRevenue).map((j) => [j.leadId, j.price]));
  return LEAD_SOURCE_KEYS.map((source) => {
    const ls = leads.filter((l) => l.source === source);
    const bookings = ls.filter((l) => l.status === 'booked');
    const revenue = sum(bookings.map((l) => byLead.get(l.id) ?? l.value));
    const adSpend = s.leadSources.find((x) => x.key === source)?.adSpendMonth ?? 0;
    return { source, leads: ls.length, bookings: bookings.length, conversion: pct(bookings.length, ls.length), revenue, adSpend, roas: adSpend > 0 ? Math.round((revenue / adSpend) * 10) / 10 : null };
  })
    .filter((x) => x.leads > 0)
    .sort((a, b) => b.leads - a.leads);
}

export function revenueSeries(s: Snapshot, days: number, now = new Date()): { date: string; revenue: number; jobs: number }[] {
  const out: { date: string; revenue: number; jobs: number }[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const d = addDays(startOfDay(now), -i);
    const key = toDateKey(d);
    const jobs = s.jobs.filter((j) => countsAsRevenue(j) && toDateKey(j.scheduledAt) === key);
    out.push({ date: key, revenue: sum(jobs.map((j) => j.price)), jobs: jobs.length });
  }
  return out;
}

export function recoveredStats(s: Snapshot, from: Date, to: Date): { leads: number; bookings: number; revenue: number } {
  const runs = s.automationRuns.filter((r) => r.automationKey.startsWith('quote_followup') && r.status === 'sent' && isWithin(r.sentAt ?? r.scheduledAt, from, to));
  const recovered = runs.filter((r) => r.recoveredValue > 0);
  const convIds = new Set(recovered.map((r) => r.conversationId));
  return { leads: convIds.size, bookings: convIds.size, revenue: sum(recovered.map((r) => r.recoveredValue)) };
}

export function aiVsHuman(s: Snapshot, from: Date, to: Date): { ai: { leads: number; booked: number; rate: number }; human: { leads: number; booked: number; rate: number } } {
  const leads = s.leads.filter((l) => isWithin(l.createdAt, from, to));
  const convByLead = new Map(s.conversations.map((c) => [c.leadId, c]));
  const human = leads.filter((l) => convByLead.get(l.id)?.aiPaused || (!l.aiHandled && l.status === 'booked'));
  const ai = leads.filter((l) => !human.includes(l));
  const mk = (xs: Lead[]) => ({ leads: xs.length, booked: xs.filter((l) => l.status === 'booked').length, rate: pct(xs.filter((l) => l.status === 'booked').length, xs.length) });
  return { ai: mk(ai), human: mk(human) };
}

export function lostReasons(s: Snapshot, from: Date, to: Date): { reason: LostReason; count: number }[] {
  const lost = s.leads.filter((l) => l.status === 'lost' && isWithin(l.createdAt, from, to));
  const g = groupBy(lost, (l) => l.lostReason ?? 'other');
  return (Object.entries(g) as [LostReason, Lead[]][]).map(([reason, xs]) => ({ reason, count: xs.length })).sort((a, b) => b.count - a.count);
}

export function workerPerformance(s: Snapshot, from: Date, to: Date): { worker: Worker; jobs: number; revenue: number; completed: number }[] {
  return s.workers
    .map((worker) => {
      const jobs = s.jobs.filter((j) => j.workerId === worker.id && isWithin(j.scheduledAt, from, to) && countsAsRevenue(j));
      return { worker, jobs: jobs.length, revenue: sum(jobs.map((j) => j.price)), completed: jobs.filter((j) => j.status === 'completed').length };
    })
    .sort((a, b) => b.revenue - a.revenue);
}

export function servicePopularity(s: Snapshot, from: Date, to: Date): { service: Service; count: number; revenue: number }[] {
  const jobs = s.jobs.filter((j) => isWithin(j.scheduledAt, from, to) && countsAsRevenue(j));
  return s.services
    .map((service) => {
      const js = jobs.filter((j) => j.serviceIds.includes(service.id));
      return { service, count: js.length, revenue: sum(js.map((j) => Math.round(j.price / Math.max(1, j.serviceIds.length)))) };
    })
    .filter((x) => x.count > 0)
    .sort((a, b) => b.count - a.count);
}

export function cityStats(s: Snapshot, from: Date, to: Date): { city: string; leads: number; jobs: number; revenue: number }[] {
  const leads = s.leads.filter((l) => isWithin(l.createdAt, from, to));
  const customers = new Map(s.customers.map((c) => [c.id, c]));
  const jobs = s.jobs.filter((j) => isWithin(j.scheduledAt, from, to) && countsAsRevenue(j));
  const cities = new Set([...leads.map((l) => l.qualification.city || customers.get(l.customerId)?.city || ''), ...jobs.map((j) => j.city)].filter(Boolean));
  return [...cities]
    .map((city) => ({
      city,
      leads: leads.filter((l) => (l.qualification.city || customers.get(l.customerId)?.city) === city).length,
      jobs: jobs.filter((j) => j.city === city).length,
      revenue: sum(jobs.filter((j) => j.city === city).map((j) => j.price)),
    }))
    .sort((a, b) => b.revenue - a.revenue)
    .slice(0, 8);
}

/** Conversion by weekday (0-6) and by 2-hour bucket of the lead's arrival. */
export function bestTimes(s: Snapshot, from: Date, to: Date): { byDay: { day: number; leads: number; rate: number }[]; byHour: { hour: number; leads: number; rate: number }[] } {
  const leads = s.leads.filter((l) => isWithin(l.createdAt, from, to));
  const byDay = Array.from({ length: 7 }, (_, day) => {
    const xs = leads.filter((l) => new Date(l.createdAt).getDay() === day);
    return { day, leads: xs.length, rate: pct(xs.filter((l) => l.status === 'booked').length, xs.length) };
  });
  const byHour = Array.from({ length: 12 }, (_, i) => {
    const hour = i * 2;
    const xs = leads.filter((l) => Math.floor(new Date(l.createdAt).getHours() / 2) * 2 === hour);
    return { hour, leads: xs.length, rate: pct(xs.filter((l) => l.status === 'booked').length, xs.length) };
  });
  return { byDay, byHour };
}

export function conversationsNeedingAttention(s: Snapshot): Conversation[] {
  return s.conversations.filter((c) => c.status === 'human' || c.status === 'new' || c.unreadCount > 0).sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt));
}

export function quoteFor(s: Snapshot, leadId: string): Quote | undefined {
  return [...s.quotes].reverse().find((q) => q.leadId === leadId);
}

export function runsForConversation(s: Snapshot, conversationId: string): AutomationRun[] {
  return s.automationRuns.filter((r) => r.conversationId === conversationId);
}
