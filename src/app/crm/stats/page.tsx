'use client';

import { useMemo, useState } from 'react';
import { CrmShell } from '@/components/crm/CrmShell';
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

export default function CrmStatsPage() {
  const { leads, loading, error } = useLeads();
  const [month, setMonth] = useState(todayISO().slice(0, 7));

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

      {loading ? (
        <div className="grid place-items-center py-20">
          <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      ) : error ? (
        <p role="alert" className="mt-4 rounded-card bg-red-600/10 px-4 py-3 text-sm font-semibold text-red-400">
          {error}
        </p>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatTile label="הכנסה חודשית" value={formatPrice(stats.revenue)} accentClass="text-emerald-400" />
            <StatTile label="עבודות שהושלמו" value={stats.jobCount} />
            <StatTile label="עבודה ממוצעת" value={formatPrice(Math.round(stats.avgJob))} />
            <StatTile label="לידים שנכנסו" value={stats.leadCount} accentClass="text-sky-400" />
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
