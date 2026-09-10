import { todayIso } from './catalog';
import { jobProfit } from './pricing';
import { ACTIVE_STATUSES, DONE_STATUSES, OPEN_STATUSES } from './stateMachine';
import type { Customer, Job, MarketingSource, Snapshot } from './types';

/**
 * Derived business metrics — the owner dashboard, unit economics and the
 * demand/supply map are all pure reads over the snapshot.
 */

/** Platform revenue recognized on a job (fee paid by pro / payout margin). */
export function jobRevenue(job: Job): number {
  if (job.status === 'CANCELLED' || job.status === 'REFUNDED') return 0;
  if (job.feeModel === 'payout') {
    return DONE_STATUSES.includes(job.status) ? job.customerPrice - (job.payoutAmount ?? 0) : 0;
  }
  return job.purchaseFee ?? 0;
}

const isToday = (iso: string | null): boolean => Boolean(iso && iso.slice(0, 10) === todayIso());

export interface TodayStats {
  leads: number;
  closed: number;
  jobsSold: number;
  revenue: number;
  adSpend: number;
  grossProfit: number;
  avgProfitPerJob: number;
  waitingJobs: number;
  activeJobs: number;
  todayJobs: number;
  onlinePros: number;
  openComplaints: number;
  cancellationsToday: number;
}

export function todayStats(s: Snapshot): TodayStats {
  const leads = s.leads.filter((l) => isToday(l.createdAt)).length;
  const closedJobs = s.jobs.filter((j) => isToday(j.createdAt));
  const soldToday = s.jobs.filter((j) => isToday(j.assignedAt));
  const revenue = soldToday.reduce((sum, j) => sum + jobRevenue(j), 0);
  const adSpend = s.adSpend.filter((e) => e.date === todayIso()).reduce((sum, e) => sum + e.amount, 0);
  const grossProfit = revenue - adSpend;
  return {
    leads,
    closed: closedJobs.length,
    jobsSold: soldToday.length,
    revenue,
    adSpend,
    grossProfit,
    avgProfitPerJob: soldToday.length > 0 ? Math.round(grossProfit / soldToday.length) : 0,
    waitingJobs: s.jobs.filter((j) => OPEN_STATUSES.includes(j.status)).length,
    activeJobs: s.jobs.filter((j) => ACTIVE_STATUSES.includes(j.status)).length,
    todayJobs: s.jobs.filter((j) => j.date === todayIso() && j.status !== 'CANCELLED' && j.status !== 'REFUNDED').length,
    onlinePros: s.professionals.filter((p) => p.approved && p.online).length,
    openComplaints: s.complaints.filter((c) => c.status !== 'resolved').length,
    cancellationsToday: s.jobs.filter((j) => j.cancellation && isToday(j.cancellation.at)).length,
  };
}

export interface SourceEconomics {
  source: MarketingSource;
  spend: number;
  leads: number;
  closedJobs: number;
  conversion: number;
  cpl: number;
  cpa: number;
  revenue: number;
  grossProfit: number;
}

/** Unit economics per marketing source over the trailing N days. */
export function sourceEconomics(s: Snapshot, days: number): SourceEconomics[] {
  const since = new Date(Date.now() - days * 24 * 3600 * 1000).toISOString();
  const sinceDate = since.slice(0, 10);
  const sources = [...new Set<MarketingSource>([
    ...s.adSpend.map((e) => e.source),
    ...s.leads.map((l) => l.source),
    ...s.jobs.map((j) => j.source),
  ])];
  return sources
    .map((source) => {
      const spend = s.adSpend
        .filter((e) => e.source === source && e.date >= sinceDate)
        .reduce((sum, e) => sum + e.amount, 0);
      const leads = s.leads.filter((l) => l.source === source && l.createdAt >= since).length;
      const jobs = s.jobs.filter((j) => j.source === source && j.createdAt >= since);
      const revenue = jobs.reduce((sum, j) => sum + jobRevenue(j), 0);
      const otherCosts = jobs.reduce((sum, j) => sum + j.paymentFee + j.refunds + j.discounts, 0);
      return {
        source,
        spend,
        leads,
        closedJobs: jobs.length,
        conversion: leads > 0 ? jobs.length / leads : 0,
        cpl: leads > 0 ? Math.round(spend / leads) : 0,
        cpa: jobs.length > 0 ? Math.round(spend / jobs.length) : 0,
        revenue,
        grossProfit: revenue - spend - otherCosts,
      };
    })
    .sort((a, b) => b.grossProfit - a.grossProfit);
}

export interface Totals {
  spend: number;
  leads: number;
  closedJobs: number;
  revenue: number;
  grossProfit: number;
  cpl: number;
  cpa: number;
  conversion: number;
  profitPerJob: number;
}

export function totals(rows: SourceEconomics[]): Totals {
  const spend = rows.reduce((n, r) => n + r.spend, 0);
  const leads = rows.reduce((n, r) => n + r.leads, 0);
  const closedJobs = rows.reduce((n, r) => n + r.closedJobs, 0);
  const revenue = rows.reduce((n, r) => n + r.revenue, 0);
  const grossProfit = rows.reduce((n, r) => n + r.grossProfit, 0);
  return {
    spend,
    leads,
    closedJobs,
    revenue,
    grossProfit,
    cpl: leads > 0 ? Math.round(spend / leads) : 0,
    cpa: closedJobs > 0 ? Math.round(spend / closedJobs) : 0,
    conversion: leads > 0 ? closedJobs / leads : 0,
    profitPerJob: closedJobs > 0 ? Math.round(grossProfit / closedJobs) : 0,
  };
}

export interface CityStat {
  cityId: string;
  openJobs: number;
  todayJobs: number;
  openLeads: number;
  onlinePros: number;
  /** demand with no/low supply — where to recruit. */
  gap: boolean;
}

/** Demand vs. supply per city — the national "map" screen. */
export function cityStats(s: Snapshot): CityStat[] {
  const cityIds = [...new Set([
    ...s.jobs.map((j) => j.city),
    ...s.leads.map((l) => l.city),
    ...s.professionals.map((p) => p.city),
  ])];
  return cityIds
    .map((cityId) => {
      const openJobs = s.jobs.filter((j) => j.city === cityId && OPEN_STATUSES.includes(j.status)).length;
      const todayJobs = s.jobs.filter((j) => j.city === cityId && j.date === todayIso() && j.status !== 'CANCELLED' && j.status !== 'REFUNDED').length;
      const openLeads = s.leads.filter((l) => l.city === cityId && !['converted', 'not_relevant', 'lost'].includes(l.status)).length;
      const onlinePros = s.professionals.filter(
        (p) => p.approved && p.online && (p.city === cityId || p.areas.includes(cityId)),
      ).length;
      const demand = openJobs + openLeads;
      return { cityId, openJobs, todayJobs, openLeads, onlinePros, gap: demand >= 2 && onlinePros <= Math.floor(demand / 3) };
    })
    .sort((a, b) => b.openJobs + b.openLeads - (a.openJobs + a.openLeads));
}

/** Customers silent for config.reactivationMonths+ — the re-activation list. */
export function reactivationList(s: Snapshot): Customer[] {
  const cutoff = new Date();
  cutoff.setMonth(cutoff.getMonth() - s.config.reactivationMonths);
  const cutoffIso = cutoff.toISOString();
  return s.customers
    .filter((c) => c.lastOrderAt && c.lastOrderAt < cutoffIso)
    .sort((a, b) => b.totalSpent - a.totalSpent);
}

/** Per-agent sales KPIs for the call-center dashboard. */
export function agentStats(s: Snapshot, agentId: string) {
  const myLeads = s.leads.filter((l) => l.agentId === agentId);
  const myJobs = s.jobs.filter((j) => j.agentId === agentId);
  const closed = myLeads.filter((l) => l.status === 'converted' || l.status === 'closed');
  const revenue = myJobs.reduce((sum, j) => sum + jobRevenue(j), 0);
  const followupsDue = myLeads.filter(
    (l) => l.followupAt && new Date(l.followupAt).getTime() <= Date.now() && !['converted', 'not_relevant', 'lost'].includes(l.status),
  ).length;
  return {
    leads: myLeads.length,
    newLeads: myLeads.filter((l) => l.status === 'new').length,
    callsToday: myLeads.filter((l) => l.activities.some((a) => a.kind === 'call' && isToday(a.at))).length,
    followupsDue,
    closed: closed.length,
    revenue,
    conversion: myLeads.length > 0 ? closed.length / myLeads.length : 0,
    avgTicket: myJobs.length > 0 ? Math.round(myJobs.reduce((n, j) => n + j.customerPrice, 0) / myJobs.length) : 0,
  };
}

export { jobProfit };
