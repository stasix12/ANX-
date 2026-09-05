'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { Btn, Card, Skeleton, Stars } from '@/components/market/ui';
import { shekel } from '@/lib/market/config';
import { useCollection } from '@/lib/market/hooks';
import { useMarketSession } from '@/lib/market/session';
import { getStore, nowIso } from '@/lib/market/store';

/** Pro dashboard: the big online toggle + today's numbers at a glance. */
export default function ProDashboard() {
  const session = useMarketSession();
  const proId = session.activeProId;
  const { rows: pros, loading } = useCollection('professionals');
  const { rows: bookings } = useCollection('bookings');
  const { rows: wallet } = useCollection('wallet');
  const { rows: availability } = useCollection('availability');

  const pro = pros.find((p) => p.id === proId);
  const myAvailability = availability.find((a) => a.professionalId === proId);
  const online = myAvailability?.online ?? false;

  const stats = useMemo(() => {
    if (!pro) return null;
    const today = new Date().toDateString();
    const month = new Date().getMonth();
    const mine = bookings.filter((b) => b.professionalId === pro.id);
    const active = mine.filter((b) => ['accepted', 'en_route', 'arrived', 'in_progress'].includes(b.status));
    const todayJobs = mine.filter((b) => new Date(b.updatedAt).toDateString() === today);
    const myWallet = wallet.filter((w) => w.professionalId === pro.id);
    const earned = (rows: typeof myWallet) => rows.reduce((sum, w) => sum + w.amountAgorot, 0);
    const doneCustomers = mine.filter((b) => ['paid', 'reviewed', 'completed'].includes(b.status)).map((b) => b.customerId);
    const repeat = doneCustomers.length - new Set(doneCustomers).size;
    return {
      active,
      todayCount: todayJobs.filter((b) => ['completed', 'paid', 'reviewed'].includes(b.status)).length,
      earnedToday: earned(myWallet.filter((w) => new Date(w.createdAt).toDateString() === today)),
      earnedMonth: earned(myWallet.filter((w) => new Date(w.createdAt).getMonth() === month)),
      repeat: Math.max(0, repeat),
    };
  }, [pro, bookings, wallet]);

  if (loading || !pro || !stats) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-6">
        <Skeleton className="h-28" /><Skeleton className="h-40" />
      </div>
    );
  }

  const toggleOnline = async () => {
    await getStore().put('availability', {
      professionalId: pro.id,
      online: !online,
      heartbeatAt: nowIso(),
      location: myAvailability?.location ?? pro.base,
    });
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-xl font-black">שלום, {pro.fullName.split(' ')[0]} 👋</h1>
          <p className="text-sm text-slate-500">{pro.businessName}</p>
        </div>
        <Stars rating={pro.rating} size="text-base" />
      </div>

      {pro.status === 'pending' && (
        <Card className="border-amber-200 bg-amber-50 p-4 text-sm font-bold text-amber-800">
          ⏳ הפרופיל ממתין לאישור הצוות. ברגע שיאושר תתחילו לקבל עבודות.
          <span className="mt-1 block text-xs font-normal">
            (בדמו: היכנסו ל- <Link href="/market/admin/pros" className="underline">פאנל האדמין</Link> ואשרו את עצמכם)
          </span>
        </Card>
      )}
      {pro.status === 'blocked' && (
        <Card className="border-red-200 bg-red-50 p-4 text-sm font-bold text-red-700">החשבון חסום. פנו לתמיכה.</Card>
      )}

      {/* Online toggle */}
      <Card className={`p-5 text-center transition ${online ? 'border-emerald-300 bg-gradient-to-b from-emerald-50 to-white' : ''}`}>
        <p className="text-sm font-bold text-slate-500">{online ? 'אתם זמינים — עבודות באזור יגיעו אליכם' : 'אתם לא זמינים כרגע'}</p>
        <Btn
          variant={online ? 'secondary' : 'success'}
          className="mt-3 w-full py-4 text-lg"
          onClick={() => void toggleOnline()}
          disabled={pro.status !== 'active'}
        >
          {online ? '⏸ מעבר ללא זמין' : '▶ אני זמין לעבוד'}
        </Btn>
      </Card>

      {/* Active jobs shortcut */}
      {stats.active.length > 0 && (
        <Link href="/pro/app/jobs">
          <Card className="flex items-center justify-between border-sky-300 bg-sky-50/60 p-4">
            <p className="font-black text-sky-800">🔥 {stats.active.length} עבודות פעילות עכשיו</p>
            <span className="font-black text-sky-600">←</span>
          </Card>
        </Link>
      )}

      {/* KPIs */}
      <div className="grid grid-cols-2 gap-3">
        {[
          { label: 'עבודות היום', value: String(stats.todayCount) },
          { label: 'הכנסות היום', value: shekel(Math.max(0, stats.earnedToday)) },
          { label: 'הכנסות החודש', value: shekel(Math.max(0, stats.earnedMonth)) },
          { label: 'סה"כ עבודות', value: String(pro.jobCount) },
          { label: 'אחוז קבלת עבודות', value: `${Math.round(pro.acceptancePct)}%` },
          { label: 'אחוז ביטולים', value: `${Math.round(pro.cancelPct)}%` },
          { label: 'לקוחות חוזרים', value: String(stats.repeat) },
          { label: 'ביקורות', value: String(pro.reviewCount) },
        ].map((kpi) => (
          <Card key={kpi.label} className="p-4 text-center">
            <p className="text-2xl font-black text-slate-900">{kpi.value}</p>
            <p className="mt-0.5 text-xs font-bold text-slate-400">{kpi.label}</p>
          </Card>
        ))}
      </div>

      <Link href={`/pro/${pro.slug}`} className="block text-center text-sm font-bold text-sky-700 hover:underline">
        צפייה בפרופיל הציבורי שלי ←
      </Link>
    </div>
  );
}
