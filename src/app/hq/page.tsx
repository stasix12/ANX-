'use client';

import Link from 'next/link';
import { HqShell } from '@/components/platform/HqShell';
import { Badge, Stat } from '@/components/platform/ui';
import { agentStats, todayStats } from '@/lib/platform/analytics';
import { cityName, formatPrice, itemsLabel, relativeTimeHe } from '@/lib/platform/catalog';
import { OPEN_STATUSES } from '@/lib/platform/stateMachine';
import { usePlatform, useSession } from '@/lib/platform/store';

/** Owner dashboard: open the phone, see the business. Agents see their KPIs. */

function Dashboard() {
  const snap = usePlatform();
  const session = useSession();
  if (!snap || !session) return null;

  const stats = todayStats(snap);
  const isAgent = session.role === 'sales_agent';
  const mine = isAgent && session.userId ? agentStats(snap, session.userId) : null;

  const waiting = snap.jobs.filter((j) => OPEN_STATUSES.includes(j.status));
  const followupsDue = snap.leads.filter(
    (l) =>
      l.followupAt &&
      new Date(l.followupAt).getTime() <= Date.now() &&
      !['converted', 'not_relevant', 'lost'].includes(l.status) &&
      (!isAgent || l.agentId === session.userId),
  );

  return (
    <div className="crm-page">
      <h1 className="text-2xl font-black text-mist-100">
        {isAgent ? `הדשבורד של ${session.name.split(' ')[0]}` : 'מצב החברה — היום'}
      </h1>

      {mine ? (
        <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
          <Stat label="לידים שלי" value={mine.leads} />
          <Stat label="חדשים לטיפול" value={mine.newLeads} />
          <Stat label="Follow-ups לעכשיו" value={mine.followupsDue} tone={mine.followupsDue > 0 ? 'bad' : undefined} />
          <Stat label="נסגרו" value={mine.closed} />
          <Stat label="מחזור שסגרתי" value={formatPrice(mine.revenue)} tone="good" />
          <Stat label="Conversion" value={`${Math.round(mine.conversion * 100)}%`} />
          <Stat label="Average Ticket" value={formatPrice(mine.avgTicket)} />
          <Stat label="שיחות היום" value={mine.callsToday} />
        </div>
      ) : (
        <>
          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="לידים היום" value={stats.leads} />
            <Stat label="עבודות שנסגרו" value={stats.closed} />
            <Stat label="עבודות שנמכרו" value={stats.jobsSold} />
            <Stat label="Revenue" value={formatPrice(stats.revenue)} tone="good" />
            <Stat label="Ad Spend היום" value={formatPrice(stats.adSpend)} />
            <Stat label="Gross Profit" value={formatPrice(stats.grossProfit)} tone={stats.grossProfit >= 0 ? 'good' : 'bad'} />
            <Stat label="רווח ממוצע לעבודה" value={formatPrice(stats.avgProfitPerJob)} />
            <Stat label="מנקים Online" value={stats.onlinePros} />
          </div>

          <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
            <Stat label="ממתינות למנקה" value={stats.waitingJobs} tone={stats.waitingJobs > 0 ? 'bad' : undefined} />
            <Stat label="עבודות היום" value={stats.todayJobs} />
            <Stat label="תלונות פתוחות" value={stats.openComplaints} tone={stats.openComplaints > 0 ? 'bad' : undefined} />
            <Stat label="ביטולים היום" value={stats.cancellationsToday} tone={stats.cancellationsToday > 0 ? 'bad' : undefined} />
          </div>
        </>
      )}

      {/* Action queues */}
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-black text-mist-100">⏰ Follow-ups לעכשיו</h2>
            <Link href="/hq/leads" className="text-xs font-bold text-brand-400">
              לכל הלידים ←
            </Link>
          </div>
          <div className="mt-2 space-y-2">
            {followupsDue.length === 0 ? (
              <p className="surface rounded-card p-4 text-sm text-mist-500">אין Follow-ups שממתינים 🎯</p>
            ) : (
              followupsDue.map((l) => (
                <Link key={l.id} href={`/hq/leads/${l.id}`} className="surface flex items-center justify-between rounded-card p-3">
                  <span>
                    <span className="font-bold text-mist-100">{l.name}</span>
                    <span className="block text-xs text-mist-500">
                      {cityName(l.city)} · {l.followupNote || 'לחזור ללקוח'}
                    </span>
                  </span>
                  <Badge className="bg-amber-500/15 text-amber-700">{relativeTimeHe(l.followupAt!)}</Badge>
                </Link>
              ))
            )}
          </div>
        </section>

        <section>
          <div className="flex items-center justify-between">
            <h2 className="font-black text-mist-100">🚨 עבודות שמחכות למנקה</h2>
            <Link href="/hq/jobs" className="text-xs font-bold text-brand-400">
              ללוח העבודות ←
            </Link>
          </div>
          <div className="mt-2 space-y-2">
            {waiting.length === 0 ? (
              <p className="surface rounded-card p-4 text-sm text-mist-500">כל העבודות משובצות ✅</p>
            ) : (
              waiting.map((j) => (
                <Link key={j.id} href="/hq/jobs" className="surface flex items-center justify-between rounded-card p-3">
                  <span>
                    <span className="font-bold text-mist-100">{itemsLabel(j.items)}</span>
                    <span className="block text-xs text-mist-500">
                      {cityName(j.city)} · {formatPrice(j.customerPrice)} · {j.windowStart}
                    </span>
                  </span>
                  {j.urgent ? (
                    <Badge className="bg-red-500/15 text-red-600">🚨 דחוף</Badge>
                  ) : (
                    <Badge className="bg-brand-500/10 text-brand-400">בהפצה</Badge>
                  )}
                </Link>
              ))
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

export default function HqHome() {
  return (
    <HqShell>
      <Dashboard />
    </HqShell>
  );
}
