'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { CrmShell } from '@/components/crm/CrmShell';
import { LeadCard } from '@/components/crm/LeadCard';
import { LogOutIcon, PlusIcon, SpinnerIcon } from '@/components/icons';
import { signOut } from '@/lib/adminAuth';
import {
  addDaysISO,
  formatDateLongHe,
  formatPrice,
  todayISO,
  weekRangeISO,
  type Lead,
} from '@/lib/crm/leads';
import { useLeads } from '@/lib/crm/useLeads';

const byTime = (a: Lead, b: Lead) => (a.jobTime ?? '99').localeCompare(b.jobTime ?? '99');

function StatTile({
  label,
  value,
  href,
  accentClass = '',
}: {
  label: string;
  value: string | number;
  href: string;
  accentClass?: string;
}) {
  return (
    <Link href={href} className="rounded-card border border-ink-700 surface p-4 transition-colors hover:border-ink-600">
      <p className={`text-2xl font-extrabold tabular-nums ${accentClass}`}>{value}</p>
      <p className="mt-1 text-sm font-semibold text-mist-500">{label}</p>
    </Link>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mt-6">
      <h2 className="mb-3 text-base font-extrabold">{title}</h2>
      {children}
    </section>
  );
}

export default function CrmDashboardPage() {
  const router = useRouter();
  const { leads, loading, error } = useLeads();

  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  const week = weekRangeISO(today);
  const month = today.slice(0, 7);

  const view = useMemo(() => {
    const active = (l: Lead) => l.status !== 'canceled';
    const todayJobs = leads.filter((l) => l.jobDate === today && active(l)).sort(byTime);
    const tomorrowJobs = leads.filter((l) => l.jobDate === tomorrow && active(l)).sort(byTime);
    const weekJobs = leads.filter(
      (l) => l.jobDate && l.jobDate >= week.start && l.jobDate <= week.end && active(l),
    );
    const completed = (l: Lead) => l.status === 'completed';
    return {
      todayJobs,
      tomorrowJobs,
      weekCount: weekJobs.length,
      newCount: leads.filter((l) => l.status === 'new').length,
      completedMonth: leads.filter((l) => completed(l) && l.jobDate?.startsWith(month)).length,
      canceledMonth: leads.filter((l) => l.status === 'canceled' && l.jobDate?.startsWith(month)).length,
      revenueToday: leads
        .filter((l) => completed(l) && l.jobDate === today)
        .reduce((sum, l) => sum + (l.price ?? 0), 0),
      revenueMonth: leads
        .filter((l) => completed(l) && l.jobDate?.startsWith(month))
        .reduce((sum, l) => sum + (l.price ?? 0), 0),
    };
  }, [leads, today, tomorrow, week.start, week.end, month]);

  return (
    <CrmShell
      title="ניהול עבודות"
      headerAction={
        <button
          type="button"
          onClick={async () => {
            await signOut();
            router.replace('/crm/login');
          }}
          className="flex items-center gap-1.5 text-sm font-semibold text-mist-500 transition-colors hover:text-mist-300"
        >
          <LogOutIcon className="h-5 w-5" />
          יציאה
        </button>
      }
    >
      {loading ? (
        <div className="grid place-items-center py-20">
          <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      ) : error ? (
        <p role="alert" className="rounded-card bg-red-600/10 px-4 py-3 text-sm font-semibold text-red-400">
          {error}
        </p>
      ) : (
        <>
          <p className="text-sm font-semibold text-mist-500">{formatDateLongHe(today)}</p>

          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatTile label="הכנסות היום" value={formatPrice(view.revenueToday)} href="/crm/stats" accentClass="text-emerald-400" />
            <StatTile label="הכנסות החודש" value={formatPrice(view.revenueMonth)} href="/crm/stats" accentClass="text-emerald-400" />
            <StatTile label="עבודות היום" value={view.todayJobs.length} href="/crm/calendar" />
            <StatTile label="עבודות מחר" value={view.tomorrowJobs.length} href="/crm/calendar" />
            <StatTile label="עבודות השבוע" value={view.weekCount} href="/crm/calendar" />
            <StatTile label="לידים חדשים" value={view.newCount} href="/crm/leads?status=new" accentClass="text-teal-300" />
            <StatTile label="הושלמו החודש" value={view.completedMonth} href="/crm/leads?status=completed" />
            <StatTile label="בוטלו החודש" value={view.canceledMonth} href="/crm/leads?status=canceled" />
          </div>

          <Section title="העבודות של היום">
            {view.todayJobs.length === 0 ? (
              <div className="rounded-card border border-ink-700 surface p-6 text-center">
                <p className="text-sm font-bold">אין עבודות מתוכננות להיום</p>
                <Link
                  href="/crm/leads/new"
                  className="mt-3 inline-flex items-center gap-1.5 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-400"
                >
                  <PlusIcon className="h-4 w-4" />
                  ליד חדש
                </Link>
              </div>
            ) : (
              <div className="space-y-3">
                {view.todayJobs.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
              </div>
            )}
          </Section>

          {view.tomorrowJobs.length > 0 ? (
            <Section title="מחר">
              <div className="space-y-3">
                {view.tomorrowJobs.map((lead) => (
                  <LeadCard key={lead.id} lead={lead} />
                ))}
              </div>
            </Section>
          ) : null}
        </>
      )}
    </CrmShell>
  );
}
