'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { CrmShell } from '@/components/crm/CrmShell';
import { LeadCard } from '@/components/crm/LeadCard';
import { LogOutIcon, NavigationIcon, PhoneIcon, PlusIcon, SpinnerIcon, WhatsAppIcon } from '@/components/icons';
import { signOut } from '@/lib/adminAuth';
import {
  addDaysISO,
  formatDateHe,
  formatDateLongHe,
  formatPrice,
  isOverdue,
  telUrl,
  todayISO,
  wazeUrl,
  weekRangeISO,
  whatsAppUrl,
  type Lead,
} from '@/lib/crm/leads';
import { fetchAdSpendManaged, formatSpend, type AdSpend } from '@/lib/crm/facebookAds';
import { getFbAdsConfig } from '@/lib/crm/settings';
import { shiftFor } from '@/lib/crm/shifts';
import { useLeads } from '@/lib/crm/useLeads';

const byTime = (a: Lead, b: Lead) => (a.jobTime ?? '99').localeCompare(b.jobTime ?? '99');

function greeting(): string {
  const hour = new Date().getHours();
  if (hour < 5) return 'לילה טוב 🌙';
  if (hour < 12) return 'בוקר טוב ☀️';
  if (hour < 17) return 'צהריים טובים 🌤️';
  if (hour < 21) return 'ערב טוב 🌆';
  return 'לילה טוב 🌙';
}

/** "בעוד 20 דקות" / "בעוד כשעתיים" / "מחר ב-09:00" / a date — when the job starts. */
function untilLabel(lead: Lead, today: string): string {
  if (!lead.jobDate) return 'טרם נקבע מועד';
  if (lead.jobDate === today) {
    if (!lead.jobTime) return 'היום';
    const [h, m] = lead.jobTime.split(':').map(Number);
    const at = new Date();
    at.setHours(h, m, 0, 0);
    const minutes = Math.round((at.getTime() - Date.now()) / 60_000);
    if (minutes <= 0) return `היום ב-${lead.jobTime}`;
    if (minutes < 60) return `בעוד ${minutes} דקות`;
    const hours = Math.round(minutes / 60);
    return `בעוד כ-${hours === 1 ? 'שעה' : hours === 2 ? 'שעתיים' : `${hours} שעות`}`;
  }
  if (lead.jobDate === addDaysISO(today, 1)) return `מחר${lead.jobTime ? ` ב-${lead.jobTime}` : ''}`;
  return `${formatDateHe(lead.jobDate)}${lead.jobTime ? ` · ${lead.jobTime}` : ''}`;
}

function StatTile({
  label,
  value,
  href,
  emoji,
  accentClass = '',
}: {
  label: string;
  value: string | number;
  href: string;
  emoji: string;
  accentClass?: string;
}) {
  return (
    <Link
      href={href}
      className="flex items-center justify-between gap-2 rounded-card border border-ink-700 surface p-4 transition-colors hover:border-ink-600"
    >
      <div className="min-w-0">
        <p className={`text-2xl font-extrabold tabular-nums ${accentClass}`}>{value}</p>
        <p className="mt-1 text-sm font-semibold text-mist-500">{label}</p>
      </div>
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-950 text-xl">
        {emoji}
      </span>
    </Link>
  );
}

/**
 * The ad tiles run bigger than the rest of the grid, with a compact line
 * underneath: conversations started (פניות) and cost per conversation.
 */
function AdSpendTile({
  label,
  spend,
  conversations,
  currency,
  emoji,
}: {
  label: string;
  spend: number;
  conversations: number;
  currency: string;
  emoji: string;
}) {
  return (
    <Link
      href="/crm/stats"
      className="flex items-start justify-between gap-2 rounded-card border border-brand-500/30 bg-brand-500/5 p-4 py-5 transition-colors hover:border-brand-500/50"
    >
      <div className="min-w-0">
        <p className="text-3xl font-extrabold tabular-nums text-blue-700">
          {formatSpend(spend, currency)}
        </p>
        <p className="mt-1 text-sm font-semibold text-mist-500">{label}</p>
        <p className="mt-1.5 text-xs font-semibold text-mist-500">
          {conversations.toLocaleString('he-IL')} פניות
          {conversations > 0 ? (
            <>
              {' · '}
              <span className="font-extrabold text-mist-300">
                {formatSpend(spend / conversations, currency)}
              </span>{' '}
              לפנייה
            </>
          ) : null}
        </p>
      </div>
      <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-950 text-xl">
        {emoji}
      </span>
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

/** The one thing a working day actually revolves around: the next job. */
function NextJobCard({ lead, today, first = true }: { lead: Lead; today: string; first?: boolean }) {
  return (
    <div className="relative h-full overflow-hidden rounded-card border border-brand-500/30 surface shadow-sm">
      <span aria-hidden className="absolute inset-y-0 start-0 w-1 bg-brand-500" />
      <Link href={`/crm/leads/${lead.id}`} className="block p-4 pb-3">
        <p className="text-xs font-bold text-brand-400">
          {first ? 'העבודה הבאה' : 'בהמשך'} · {untilLabel(lead, today)}
        </p>
        <div className="mt-1.5 flex items-start justify-between gap-3">
          <div className="min-w-0">
            <p className="truncate text-lg font-extrabold">{lead.name}</p>
            <p className="mt-0.5 truncate text-sm text-mist-300">
              {[lead.city || null, lead.services.join(' · ') || null].filter(Boolean).join(' · ')}
            </p>
          </div>
          <span className="shrink-0 text-lg font-extrabold tabular-nums">{formatPrice(lead.price)}</span>
        </div>
      </Link>
      <div className="flex gap-2 border-t border-ink-700/60 px-4 py-2.5">
        {lead.phone ? (
          <>
            <a
              href={whatsAppUrl(lead.phone)}
              target="_blank"
              rel="noopener noreferrer"
              aria-label="WhatsApp ללקוח"
              className="grid h-9 w-9 place-items-center rounded-full bg-emerald-600 text-white"
            >
              <WhatsAppIcon className="h-4.5 w-4.5" />
            </a>
            <a
              href={telUrl(lead.phone)}
              aria-label="התקשר ללקוח"
              className="grid h-9 w-9 place-items-center rounded-full bg-sky-600 text-white"
            >
              <PhoneIcon className="h-4.5 w-4.5" />
            </a>
          </>
        ) : null}
        {lead.address || lead.city ? (
          <a
            href={wazeUrl(lead.address, lead.city)}
            target="_blank"
            rel="noopener noreferrer"
            aria-label="ניווט ב-Waze"
            className="grid h-9 w-9 place-items-center rounded-full bg-indigo-600 text-white"
          >
            <NavigationIcon className="h-4.5 w-4.5" />
          </a>
        ) : null}
        <span className="ms-auto self-center text-xs font-semibold text-mist-500">
          {[lead.address, lead.city].filter(Boolean).join(', ')}
        </span>
      </div>
    </div>
  );
}

/**
 * The upcoming jobs as a swipeable rail — the nearest job front and center,
 * the ones after it a slide away, with a dots indicator underneath.
 */
function NextJobsCarousel({ jobs, today }: { jobs: Lead[]; today: string }) {
  const [active, setActive] = useState(0);
  if (jobs.length === 1) {
    return (
      <div className="mt-4">
        <NextJobCard lead={jobs[0]} today={today} />
      </div>
    );
  }
  return (
    <div className="mt-4">
      <div
        className="crm-snap -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1"
        onScroll={(e) => {
          const el = e.currentTarget;
          const per = el.scrollWidth / jobs.length;
          setActive(Math.min(jobs.length - 1, Math.round(Math.abs(el.scrollLeft) / per)));
        }}
      >
        {jobs.map((lead, i) => (
          <div key={lead.id} className="w-[88%] shrink-0 snap-center">
            <NextJobCard lead={lead} today={today} first={i === 0} />
          </div>
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-1.5" aria-hidden>
        {jobs.map((_, i) => (
          <span
            key={i}
            className={`h-1.5 rounded-full transition-all duration-300 ${
              i === active ? 'w-4 bg-brand-500' : 'w-1.5 bg-ink-600'
            }`}
          />
        ))}
      </div>
    </div>
  );
}

export default function CrmDashboardPage() {
  const router = useRouter();
  const { leads, loading, error } = useLeads();

  // Ad spend rides along quietly: shown when Facebook is connected and the
  // fetch succeeds, invisible otherwise — the dashboard never nags about it.
  const [adSpend, setAdSpend] = useState<AdSpend | null>(null);
  useEffect(() => {
    getFbAdsConfig()
      .then((config) => (config ? fetchAdSpendManaged(config) : null))
      .then(setAdSpend)
      .catch(() => setAdSpend(null));
  }, []);

  const today = todayISO();
  const tomorrow = addDaysISO(today, 1);
  const week = weekRangeISO(today);
  const month = today.slice(0, 7);
  const shift = shiftFor(today);

  const view = useMemo(() => {
    const active = (l: Lead) => l.status !== 'canceled';
    const open = (l: Lead) => l.status !== 'canceled' && l.status !== 'completed';
    const todayJobs = leads.filter((l) => l.jobDate === today && active(l)).sort(byTime);
    const tomorrowJobs = leads.filter((l) => l.jobDate === tomorrow && active(l)).sort(byTime);
    const weekJobs = leads.filter(
      (l) => l.jobDate && l.jobDate >= week.start && l.jobDate <= week.end && active(l),
    );
    const completed = (l: Lead) => l.status === 'completed';

    // The next job: today's open jobs first (by time), else the nearest
    // future open job.
    const upcoming = leads
      .filter((l) => open(l) && l.jobDate && l.jobDate >= today)
      .sort((a, b) => (a.jobDate! < b.jobDate! ? -1 : a.jobDate! > b.jobDate! ? 1 : byTime(a, b)));

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
      nextJobs: upcoming.slice(0, 8),
      overdueCount: leads.filter((l) => isOverdue(l, today)).length,
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
          className="flex items-center gap-1.5 text-sm font-semibold text-white/85 transition-colors hover:text-white"
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
        <p role="alert" className="rounded-card bg-red-600/10 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      ) : (
        <>
          <div className="crm-hero relative overflow-hidden rounded-card p-4 shadow-md shadow-sky-900/15">
            {/* Rising soap bubbles — the ambient layer behind the greeting. */}
            {Array.from({ length: 6 }, (_, i) => (
              <span key={i} aria-hidden className="bubble" />
            ))}
            <div className="relative flex flex-wrap items-center justify-between gap-2">
              <div>
                <p className="text-xl font-extrabold text-white">{greeting()}</p>
                <p className="mt-0.5 text-sm font-semibold text-white/85">{formatDateLongHe(today)}</p>
              </div>
              <span className={`rounded-full bg-white px-3 py-1.5 text-sm font-bold shadow-sm ${shift.textClass}`}>
                משמרת: {shift.label}
              </span>
            </div>
          </div>

          {/* Ad spend sits right at the top — the first thing checked. */}
          {adSpend ? (
            <div className="mt-4 grid grid-cols-2 gap-3">
              <AdSpendTile
                label="פרסום היום"
                spend={adSpend.today}
                conversations={adSpend.todayConversations}
                currency={adSpend.currency}
                emoji="📣"
              />
              <AdSpendTile
                label="פרסום החודש"
                spend={adSpend.month}
                conversations={adSpend.monthConversations}
                currency={adSpend.currency}
                emoji="💸"
              />
              {/* Full-width weekly summary bar under the two squares. */}
              <Link
                href="/crm/stats"
                className="col-span-2 flex items-center justify-between gap-3 rounded-card border border-brand-500/30 bg-brand-500/5 px-4 py-3.5 transition-colors hover:border-brand-500/50"
              >
                <div className="flex items-center gap-3">
                  <span aria-hidden className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-950 text-xl">
                    📊
                  </span>
                  <div>
                    <p className="text-sm font-semibold text-mist-500">פרסום השבוע</p>
                    <p className="text-xs font-semibold text-mist-500">
                      {adSpend.weekConversations.toLocaleString('he-IL')} פניות
                      {adSpend.weekConversations > 0 ? (
                        <>
                          {' · '}
                          <span className="font-extrabold text-mist-300">
                            {formatSpend(adSpend.week / adSpend.weekConversations, adSpend.currency)}
                          </span>{' '}
                          לפנייה
                        </>
                      ) : null}
                    </p>
                  </div>
                </div>
                <p className="shrink-0 text-2xl font-extrabold tabular-nums text-blue-700">
                  {formatSpend(adSpend.week, adSpend.currency)}
                </p>
              </Link>
            </div>
          ) : null}

          {view.overdueCount > 0 ? (
            <Link
              href="/crm/leads?filter=overdue"
              className="mt-4 flex items-center justify-between gap-3 rounded-card border border-amber-500/40 bg-amber-500/10 px-4 py-3"
            >
              <span className="text-sm font-bold text-amber-800">
                ⚠️ {view.overdueCount === 1 ? 'עבודה אחת עברה' : `${view.overdueCount} עבודות עברו`} ולא
                נסגרו — לחץ לטיפול
              </span>
              <span aria-hidden className="text-amber-800">←</span>
            </Link>
          ) : null}

          {view.nextJobs.length > 0 ? <NextJobsCarousel jobs={view.nextJobs} today={today} /> : null}

          <div className="mt-4 grid grid-cols-2 gap-3">
            <StatTile label="הכנסות היום" value={formatPrice(view.revenueToday)} href="/crm/stats" emoji="💰" accentClass="text-emerald-600" />
            <StatTile label="הכנסות החודש" value={formatPrice(view.revenueMonth)} href="/crm/stats" emoji="📈" accentClass="text-emerald-600" />
            <StatTile label="עבודות היום" value={view.todayJobs.length} href="/crm/calendar" emoji="🧽" />
            <StatTile label="עבודות מחר" value={view.tomorrowJobs.length} href="/crm/calendar" emoji="⏰" />
            <StatTile label="עבודות השבוע" value={view.weekCount} href="/crm/calendar" emoji="📅" />
            <StatTile label="לידים חדשים" value={view.newCount} href="/crm/leads?status=new" emoji="✨" accentClass="text-teal-700" />
            <StatTile label="הושלמו החודש" value={view.completedMonth} href="/crm/leads?status=completed" emoji="✅" />
            <StatTile label="בוטלו החודש" value={view.canceledMonth} href="/crm/leads?status=canceled" emoji="❌" />
          </div>

          <Section title="העבודות של היום">
            {view.todayJobs.length === 0 ? (
              <div className="rounded-card border border-ink-700 surface p-6 text-center">
                <p aria-hidden className="text-3xl">🧼</p>
                <p className="mt-2 text-sm font-bold">אין עבודות מתוכננות להיום</p>
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
