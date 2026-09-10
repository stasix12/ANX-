'use client';

import { ProShell } from '@/components/platform/ProShell';
import { btnSecondary, Stat } from '@/components/platform/ui';
import { cityName, formatPrice } from '@/lib/platform/catalog';
import { categoryName } from '@/lib/platform/catalog';
import { LEVEL_META, proLevel, proScore } from '@/lib/platform/scoring';
import { logout, usePlatform, useSession, walletBalance } from '@/lib/platform/store';

/** Profile: the internal Professional Score, gamification level and stats. */

function Profile() {
  const snap = usePlatform();
  const session = useSession();
  if (!snap || !session?.userId) return null;
  const me = snap.professionals.find((p) => p.id === session.userId);
  if (!me) return null;

  const score = proScore(me);
  const level = proLevel(me);
  const meta = LEVEL_META[level];
  const completionRate = me.totalTaken > 0 ? Math.round((me.completedJobs / me.totalTaken) * 100) : 100;

  return (
    <div className="crm-page px-4 pt-4">
      <div className="surface rounded-card p-5 text-center">
        <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-brand-500/10 text-3xl">
          🧽
        </div>
        <h1 className="mt-2 text-xl font-black text-mist-100">{me.name}</h1>
        <p className="text-sm text-mist-500">
          {me.businessName} · {cityName(me.city)}
        </p>
        <div className="mt-3 inline-flex items-center gap-2 rounded-full bg-ink-800 px-4 py-1.5 text-sm font-black text-mist-100">
          {meta.emoji} רמת {meta.label}
        </div>
        <p className="mt-1 text-xs text-mist-500">{meta.perk}</p>
      </div>

      {/* Professional Score */}
      <div className="surface mt-4 rounded-card p-5">
        <div className="flex items-center justify-between">
          <span className="font-black text-mist-100">Professional Score</span>
          <span className="text-2xl font-black text-brand-400">{score}/100</span>
        </div>
        <div className="mt-2 h-2.5 overflow-hidden rounded-full bg-ink-800">
          <div
            className={`h-full rounded-full ${score >= 75 ? 'bg-emerald-500' : score >= 50 ? 'bg-amber-500' : 'bg-red-500'}`}
            style={{ width: `${score}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-mist-500">
          הציון משפיע על סדר קבלת העבודות: דירוג לקוחות, השלמות, ביטולים, עמידה בזמנים ומהירות תגובה.
        </p>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3">
        <Stat label="דירוג לקוחות" value={`⭐ ${me.rating || '—'}`} />
        <Stat label="עבודות שהושלמו" value={me.completedJobs} />
        <Stat label="אחוז השלמה" value={`${completionRate}%`} tone={completionRate >= 90 ? 'good' : 'bad'} />
        <Stat label="ביטולים" value={me.cancelledJobs} tone={me.cancelledJobs > 3 ? 'bad' : undefined} />
        <Stat label="לקוחות חוזרים" value={me.repeatCustomers} />
        <Stat label="יתרת ארנק" value={formatPrice(walletBalance(snap, me.id))} tone="good" />
      </div>

      <div className="surface mt-4 rounded-card p-4">
        <div className="text-sm font-black text-mist-500">השירותים שלי</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {me.services.map((s) => (
            <span key={s} className="rounded-full bg-ink-800 px-3 py-1 text-xs font-bold text-mist-100">
              {categoryName(s)}
            </span>
          ))}
        </div>
        <div className="mt-3 text-sm font-black text-mist-500">אזורי פעילות</div>
        <div className="mt-2 flex flex-wrap gap-1.5">
          {me.areas.map((a) => (
            <span key={a} className="rounded-full bg-ink-800 px-3 py-1 text-xs font-bold text-mist-100">
              {cityName(a)}
            </span>
          ))}
          <span className="rounded-full bg-ink-800 px-3 py-1 text-xs text-mist-500">רדיוס {me.radiusKm} ק״מ</span>
        </div>
      </div>

      <button type="button" onClick={logout} className={`${btnSecondary} mt-6 w-full`}>
        התנתקות
      </button>
      <div className="pb-6" />
    </div>
  );
}

export default function ProfilePage() {
  return (
    <ProShell>
      <Profile />
    </ProShell>
  );
}
