'use client';

import { useMemo, useState } from 'react';
import { CrmShell } from '@/components/crm/CrmShell';
import { MONTH_LONG, YearRevenueChart, type MonthRevenue } from '@/components/crm/YearRevenueChart';
import { SpinnerIcon } from '@/components/icons';
import { formatPrice, sourceLabel, todayISO, type Lead, type LeadSource } from '@/lib/crm/leads';
import { useLeads } from '@/lib/crm/useLeads';

function monthTitle(month: string): string {
  return new Date(`${month}-15T12:00:00`).toLocaleDateString('he-IL', {
    month: 'long',
    year: 'numeric',
  });
}

function shiftMonth(month: string, direction: 1 | -1): string {
  const date = new Date(`${month}-15T12:00:00`);
  date.setMonth(date.getMonth() + direction);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
}

function StatTile({ label, value, accentClass = '' }: { label: string; value: string | number; accentClass?: string }) {
  return (
    <div className="rounded-card border border-ink-700 surface p-4">
      <p className={`text-2xl font-extrabold tabular-nums ${accentClass}`}>{value}</p>
      <p className="mt-1 text-sm font-semibold text-mist-500">{label}</p>
    </div>
  );
}

function RankedBars({ title, entries }: { title: string; entries: [string, number][] }) {
  const max = entries[0]?.[1] ?? 0;
  return (
    <section className="mt-6">
      <h3 className="mb-3 text-base font-extrabold">{title}</h3>
      {entries.length === 0 ? (
        <p className="rounded-card border border-ink-700 surface p-5 text-center text-sm font-semibold text-mist-500">
          אין עדיין נתונים החודש.
        </p>
      ) : (
        <div className="space-y-2.5 rounded-card border border-ink-700 surface p-4">
          {entries.map(([label, count]) => (
            <div key={label}>
              <div className="mb-1 flex items-center justify-between text-sm">
                <span className="font-bold">{label}</span>
                <span className="font-extrabold tabular-nums text-mist-300">{count}</span>
              </div>
              <div className="h-2 overflow-hidden rounded-full bg-ink-800">
                <div
                  className="h-full rounded-full bg-brand-500"
                  style={{ width: `${max ? Math.round((count / max) * 100) : 0}%` }}
                />
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  );
}

/** Signed percentage against a base, e.g. +18% / ‎-7%; null when base is 0. */
function deviation(value: number, base: number): number | null {
  if (base <= 0) return null;
  return Math.round(((value - base) / base) * 100);
}

function DeltaText({ pct, label }: { pct: number | null; label: string }) {
  if (pct === null) return null;
  return (
    <span className="text-sm font-semibold text-mist-500">
      {label}{' '}
      <span className={`font-extrabold ${pct >= 0 ? 'text-emerald-600' : 'text-red-600'}`} dir="ltr">
        {pct >= 0 ? '+' : ''}
        {pct}%
      </span>
    </span>
  );
}

function YearView({ leads }: { leads: Lead[] }) {
  const today = todayISO();
  const currentYear = Number(today.slice(0, 4));
  const currentMonth = Number(today.slice(5, 7)) - 1;

  const [year, setYear] = useState(currentYear);
  const [selMonth, setSelMonth] = useState(currentMonth);

  const changeYear = (direction: 1 | -1) => {
    const next = year + direction;
    setYear(next);
    setSelMonth(next === currentYear ? currentMonth : 11);
  };

  const view = useMemo(() => {
    const months: MonthRevenue[] = Array.from({ length: 12 }, (_, month) => ({ month, revenue: 0, jobs: 0 }));
    for (const lead of leads) {
      if (lead.status !== 'completed' || !lead.jobDate) continue;
      if (Number(lead.jobDate.slice(0, 4)) !== year) continue;
      const m = Number(lead.jobDate.slice(5, 7)) - 1;
      months[m].revenue += lead.price ?? 0;
      months[m].jobs += 1;
    }
    const total = months.reduce((sum, m) => sum + m.revenue, 0);
    // The pace baseline: past years average over all 12 months, the current
    // year only over the months that have already started.
    const elapsed = year < currentYear ? 12 : year > currentYear ? 1 : currentMonth + 1;
    const avg = total / elapsed;
    const best = months.reduce((a, b) => (b.revenue > a.revenue ? b : a), months[0]);
    return { months, total, avg, best };
  }, [leads, year, currentYear, currentMonth]);

  const sel = view.months[selMonth];
  const prev = selMonth > 0 ? view.months[selMonth - 1] : null;

  return (
    <>
      <div className="flex items-center justify-between">
        <button
          type="button"
          onClick={() => changeYear(-1)}
          className="rounded-full border border-ink-600 bg-ink-850 px-4 py-2 text-sm font-bold transition-colors hover:border-ink-500"
        >
          → הקודמת
        </button>
        <p className="text-base font-extrabold tabular-nums">{year}</p>
        <button
          type="button"
          onClick={() => changeYear(1)}
          className="rounded-full border border-ink-600 bg-ink-850 px-4 py-2 text-sm font-bold transition-colors hover:border-ink-500"
        >
          הבאה ←
        </button>
      </div>

      <div className="mt-4 rounded-card border border-ink-700 surface p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
          <p className="text-base font-extrabold">
            {MONTH_LONG[selMonth]} · <span className="tabular-nums">{formatPrice(sel.revenue)}</span>
            <span className="text-sm font-semibold text-mist-500"> · {sel.jobs} עבודות</span>
          </p>
          <span className="flex flex-wrap gap-x-3">
            <DeltaText pct={deviation(sel.revenue, view.avg)} label="מול הממוצע:" />
            {prev ? <DeltaText pct={deviation(sel.revenue, prev.revenue)} label="מול חודש קודם:" /> : null}
          </span>
        </div>

        {view.total === 0 ? (
          <p className="py-10 text-center text-sm font-semibold text-mist-500">אין עדיין הכנסות בשנה זו.</p>
        ) : (
          <div className="mt-2">
            <YearRevenueChart
              months={view.months}
              avg={view.avg}
              currentMonth={year === currentYear ? currentMonth : null}
              selected={selMonth}
              onSelect={setSelMonth}
            />
          </div>
        )}
      </div>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <StatTile label="סך הכנסות השנה" value={formatPrice(view.total)} accentClass="text-emerald-600" />
        <StatTile label="ממוצע חודשי" value={formatPrice(Math.round(view.avg))} />
        <StatTile
          label={`החודש החזק ביותר${view.best.revenue > 0 ? ` — ${MONTH_LONG[view.best.month]}` : ''}`}
          value={formatPrice(view.best.revenue)}
        />
        <StatTile label="עבודות שהושלמו" value={view.months.reduce((s, m) => s + m.jobs, 0)} />
      </div>

      <details className="mt-4 rounded-card border border-ink-700 surface px-4 py-3">
        <summary className="cursor-pointer text-sm font-bold text-mist-300">טבלת הנתונים המלאה</summary>
        <table className="mt-3 w-full text-sm">
          <thead>
            <tr className="text-start text-mist-500">
              <th className="pb-2 text-start font-semibold">חודש</th>
              <th className="pb-2 text-end font-semibold">עבודות</th>
              <th className="pb-2 text-end font-semibold">הכנסה</th>
            </tr>
          </thead>
          <tbody>
            {view.months.map((m) => (
              <tr key={m.month} className="border-t border-ink-700/60">
                <td className="py-1.5 font-semibold">{MONTH_LONG[m.month]}</td>
                <td className="py-1.5 text-end tabular-nums">{m.jobs}</td>
                <td className="py-1.5 text-end font-bold tabular-nums">{formatPrice(m.revenue)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </details>
    </>
  );
}

export default function CrmStatsPage() {
  const { leads, loading, error } = useLeads();
  const [month, setMonth] = useState(todayISO().slice(0, 7));
  const [tab, setTab] = useState<'month' | 'year'>('month');

  const stats = useMemo(() => {
    // Job-side numbers go by the job's date; lead-side numbers (how many
    // leads came in, from where) go by when the lead was created.
    const monthJobs = leads.filter((l) => l.jobDate?.startsWith(month));
    const completed = monthJobs.filter((l) => l.status === 'completed');
    const monthLeads = leads.filter((l) => l.createdAt.slice(0, 7) === month);
    const converted = monthLeads.filter((l) =>
      ['scheduled', 'on_way', 'completed'].includes(l.status),
    );

    const revenue = completed.reduce((sum, l) => sum + (l.price ?? 0), 0);

    const serviceCounts = new Map<string, number>();
    for (const lead of monthJobs) {
      if (lead.status === 'canceled') continue;
      for (const service of lead.services) {
        serviceCounts.set(service, (serviceCounts.get(service) ?? 0) + 1);
      }
    }

    const sourceCounts = new Map<LeadSource, number>();
    for (const lead of completed) {
      sourceCounts.set(lead.source, (sourceCounts.get(lead.source) ?? 0) + 1);
    }

    const descending = (a: [string, number], b: [string, number]) => b[1] - a[1];
    return {
      revenue,
      jobCount: completed.length,
      avgJob: completed.length ? revenue / completed.length : 0,
      leadCount: monthLeads.length,
      conversion: monthLeads.length ? Math.round((converted.length / monthLeads.length) * 100) : 0,
      topServices: [...serviceCounts.entries()].sort(descending).slice(0, 6),
      topSources: [...sourceCounts.entries()]
        .map(([source, count]): [string, number] => [sourceLabel(source), count])
        .sort(descending),
    };
  }, [leads, month]);

  return (
    <CrmShell title="סטטיסטיקות">
      <div className="mb-4 flex rounded-full border border-ink-700 bg-ink-850 p-1" role="group" aria-label="טווח נתונים">
        {(
          [
            { value: 'month', label: 'חודש' },
            { value: 'year', label: 'שנה — גרף' },
          ] as const
        ).map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={tab === option.value}
            onClick={() => setTab(option.value)}
            className={`flex-1 rounded-full py-2 text-sm font-bold transition-colors ${
              tab === option.value ? 'bg-brand-500 text-on-brand' : 'text-mist-300'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      {loading ? (
        <div className="grid place-items-center py-20">
          <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      ) : error ? (
        <p role="alert" className="mt-4 rounded-card bg-red-600/10 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      ) : tab === 'year' ? (
        <YearView leads={leads} />
      ) : (
        <>
          <div className="flex items-center justify-between">
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, -1))}
              className="rounded-full border border-ink-600 bg-ink-850 px-4 py-2 text-sm font-bold transition-colors hover:border-ink-500"
            >
              → הקודם
            </button>
            <p className="text-base font-extrabold">{monthTitle(month)}</p>
            <button
              type="button"
              onClick={() => setMonth(shiftMonth(month, 1))}
              className="rounded-full border border-ink-600 bg-ink-850 px-4 py-2 text-sm font-bold transition-colors hover:border-ink-500"
            >
              הבא ←
            </button>
          </div>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatTile label="הכנסה חודשית" value={formatPrice(stats.revenue)} accentClass="text-emerald-600" />
            <StatTile label="עבודות שהושלמו" value={stats.jobCount} />
            <StatTile label="עבודה ממוצעת" value={formatPrice(Math.round(stats.avgJob))} />
            <StatTile label="לידים שנכנסו" value={stats.leadCount} accentClass="text-teal-700" />
          </div>

          <div className="mt-3 rounded-card border border-ink-700 surface p-4">
            <div className="flex items-center justify-between">
              <p className="text-sm font-semibold text-mist-500">אחוז לידים שהפכו לעבודות</p>
              <p className="text-2xl font-extrabold tabular-nums text-brand-400">{stats.conversion}%</p>
            </div>
            <div className="mt-2 h-2 overflow-hidden rounded-full bg-ink-800">
              <div className="h-full rounded-full bg-brand-500" style={{ width: `${stats.conversion}%` }} />
            </div>
          </div>

          <RankedBars title="השירותים הכי נמכרים" entries={stats.topServices} />
          <RankedBars title="מקורות שמביאים עבודות" entries={stats.topSources} />
        </>
      )}
    </CrmShell>
  );
}
