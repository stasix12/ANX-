'use client';

import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdsBarChart, type AdsBarPoint } from '@/components/crm/AdsBarChart';
import { CrmShell } from '@/components/crm/CrmShell';
import { LeadCard } from '@/components/crm/LeadCard';
import { MONTH_LONG } from '@/components/crm/YearRevenueChart';
import {
  AlertTriangleIcon,
  CalendarIcon,
  ClockIcon,
  GemIcon,
  LightbulbIcon,
  PlusIcon,
  SpinnerIcon,
  TrendingUpIcon,
} from '@/components/icons';
import {
  addDaysISO,
  formatDateLongHe,
  formatPrice,
  todayISO,
  weekRangeISO,
  type Lead,
} from '@/lib/crm/leads';
import { shiftFor } from '@/lib/crm/shifts';
import { useLeads } from '@/lib/crm/useLeads';

const byTime = (a: Lead, b: Lead) => (a.jobTime ?? '99').localeCompare(b.jobTime ?? '99');
const sumPrices = (jobs: Lead[]) => jobs.reduce((sum, l) => sum + (l.price ?? 0), 0);

function ForecastTile({
  label,
  value,
  icon: Icon,
}: {
  label: string;
  value: string;
  icon: React.ComponentType<{ className?: string }>;
}) {
  return (
    <div className="rounded-card border border-ink-700 surface p-3 text-center">
      <span aria-hidden className="mx-auto grid h-8 w-8 place-items-center rounded-lg bg-emerald-500/10 text-emerald-600">
        <Icon className="h-4.5 w-4.5" />
      </span>
      <p className="mt-1.5 text-lg font-extrabold tabular-nums text-emerald-600">{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-mist-500">{label}</p>
    </div>
  );
}

export default function CrmForecastPage() {
  const { leads, loading, error } = useLeads();
  const [selected, setSelected] = useState(0);

  const today = todayISO();

  const view = useMemo(() => {
    // A job counts toward the forecast while it can still bring money in:
    // anything not completed and not canceled, from today onward.
    const open = (l: Lead) => l.status !== 'canceled' && l.status !== 'completed';
    const future = leads
      .filter((l) => open(l) && l.jobDate && l.jobDate >= today)
      .sort((a, b) => (a.jobDate! < b.jobDate! ? -1 : a.jobDate! > b.jobDate! ? 1 : byTime(a, b)));
    const noDate = leads.filter((l) => open(l) && !l.jobDate);

    const week = weekRangeISO(today);
    const month = today.slice(0, 7);
    const inMonth = future.filter((l) => l.jobDate!.startsWith(month));
    const completedMonth = sumPrices(
      leads.filter((l) => l.status === 'completed' && l.jobDate?.startsWith(month)),
    );

    // Group the future jobs day by day, in order.
    const groups: { date: string; jobs: Lead[] }[] = [];
    for (const lead of future) {
      const last = groups[groups.length - 1];
      if (last && last.date === lead.jobDate) last.jobs.push(lead);
      else groups.push({ date: lead.jobDate!, jobs: [lead] });
    }

    // Expected revenue for each of the next 14 days, empty days included.
    const days = Array.from({ length: 14 }, (_, i) => {
      const date = addDaysISO(today, i);
      const jobs = future.filter((l) => l.jobDate === date);
      return { date, total: sumPrices(jobs), count: jobs.length };
    });

    return {
      todaySum: sumPrices(future.filter((l) => l.jobDate === today)),
      weekSum: sumPrices(future.filter((l) => l.jobDate! >= week.start && l.jobDate! <= week.end)),
      monthSum: sumPrices(inMonth),
      totalSum: sumPrices(future),
      futureCount: future.length,
      completedMonth,
      noDateSum: sumPrices(noDate),
      noDateCount: noDate.length,
      groups,
      days,
    };
  }, [leads, today]);

  // Land on today's bar whenever the data refreshes.
  useEffect(() => {
    setSelected(0);
  }, [view.days.length]);

  const points: AdsBarPoint[] = view.days.map((day) => {
    const [, m, d] = day.date.split('-').map(Number);
    return { label: `${d}.${m}`, value: day.total, conversations: day.count };
  });

  const sel = view.days[selected];
  const monthName = MONTH_LONG[Number(today.slice(5, 7)) - 1];
  const projectedMonth = view.completedMonth + view.monthSum;
  const donePct = projectedMonth > 0 ? Math.round((view.completedMonth / projectedMonth) * 100) : 0;

  return (
    <CrmShell title="צפי הכנסה">
      {loading ? (
        <div className="grid place-items-center py-20">
          <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      ) : error ? (
        <p role="alert" className="rounded-card bg-red-600/10 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      ) : view.futureCount === 0 && view.noDateCount === 0 ? (
        <div className="rounded-card border border-ink-700 surface p-6 text-center">
          <p aria-hidden className="text-3xl">🔮</p>
          <p className="mt-2 text-sm font-bold">אין עדיין עבודות עתידיות ביומן</p>
          <p className="mt-1 text-sm text-mist-500">כל עבודה שתיכנס תופיע כאן עם הצפי שלה.</p>
          <Link
            href="/crm/leads/new"
            className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-400"
          >
            <PlusIcon className="h-4 w-4" />
            ליד חדש
          </Link>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <ForecastTile label="צפי היום" value={formatPrice(view.todaySum)} icon={ClockIcon} />
            <ForecastTile label="צפי השבוע" value={formatPrice(view.weekSum)} icon={CalendarIcon} />
            <ForecastTile label={`צפי עד סוף ${monthName}`} value={formatPrice(view.monthSum)} icon={TrendingUpIcon} />
            <ForecastTile label={`סה״כ עתידי · ${view.futureCount} עבודות`} value={formatPrice(view.totalSum)} icon={GemIcon} />
          </div>

          {/* Where the month is projected to land: done + still scheduled. */}
          <div className="mt-3 rounded-card border border-emerald-600/30 bg-emerald-500/5 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <p className="flex items-center gap-1.5 text-sm font-bold">
                <TrendingUpIcon className="h-4 w-4 text-emerald-600" /> תחזית {monthName}
              </p>
              <p className="text-2xl font-extrabold tabular-nums text-emerald-600">
                {formatPrice(projectedMonth)}
              </p>
            </div>
            <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-ink-950">
              <div className="h-full rounded-full bg-emerald-500" style={{ width: `${donePct}%` }} />
            </div>
            <p className="mt-1.5 text-xs font-semibold text-mist-500">
              בוצע {formatPrice(view.completedMonth)} · מתוכנן עוד {formatPrice(view.monthSum)}
            </p>
          </div>

          <div className="mt-3 rounded-card border border-ink-700 surface p-4">
            {sel ? (
              <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                <p className="text-base font-extrabold">
                  {formatDateLongHe(sel.date)} ·{' '}
                  <span className="tabular-nums">{formatPrice(sel.total)}</span>
                </p>
                <p className="text-sm font-semibold text-mist-500">
                  {sel.count === 0 ? 'אין עבודות' : sel.count === 1 ? 'עבודה אחת' : `${sel.count} עבודות`}
                </p>
              </div>
            ) : null}
            <div className="mt-2">
              <AdsBarChart points={points} selected={selected} onSelect={setSelected} scrollTo="start" />
            </div>
            <p className="mt-1 flex items-center gap-1.5 text-xs font-semibold text-mist-500">
              <LightbulbIcon className="h-4 w-4 shrink-0 text-amber-600" />
              14 הימים הקרובים — לחץ על עמודה לפירוט.
            </p>
          </div>

          {view.noDateCount > 0 ? (
            <Link
              href="/crm/leads"
              className="mt-3 flex items-center justify-between gap-3 rounded-card border border-amber-500/40 bg-amber-500/10 px-4 py-3"
            >
              <span className="flex items-center gap-2 text-sm font-bold text-amber-800">
                <AlertTriangleIcon className="h-4.5 w-4.5 shrink-0" />
                עוד {formatPrice(view.noDateSum)} מ-
                {view.noDateCount === 1 ? 'עבודה אחת' : `${view.noDateCount} עבודות`} בלי תאריך — קבע להן מועד
              </span>
              <span aria-hidden className="text-amber-800">←</span>
            </Link>
          ) : null}

          {view.groups.map((group) => {
            const shift = shiftFor(group.date);
            return (
              <section key={group.date} className="mt-6">
                <div className="mb-3 flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
                  <h2 className="text-base font-extrabold">
                    {group.date === today ? 'היום' : formatDateLongHe(group.date)}
                    <span className={`ms-2 text-xs font-bold ${shift.textClass}`}>{shift.label}</span>
                  </h2>
                  <p className="text-sm font-extrabold tabular-nums text-emerald-600">
                    {formatPrice(sumPrices(group.jobs))}
                  </p>
                </div>
                <div className="space-y-3">
                  {group.jobs.map((lead) => (
                    <LeadCard key={lead.id} lead={lead} />
                  ))}
                </div>
              </section>
            );
          })}
        </>
      )}
    </CrmShell>
  );
}
