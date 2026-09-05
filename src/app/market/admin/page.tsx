'use client';

import { useMemo } from 'react';
import { Card } from '@/components/market/ui';
import { shekel } from '@/lib/market/config';
import { useCollection } from '@/lib/market/hooks';

/** Admin dashboard: platform KPIs + lightweight CSS charts. */
export default function AdminDashboard() {
  const { rows: bookings } = useCollection('bookings');
  const { rows: pros } = useCollection('professionals');
  const { rows: customers } = useCollection('customers');
  const { rows: availability } = useCollection('availability');
  const { rows: services } = useCollection('services');
  const { rows: areas } = useCollection('areas');

  const stats = useMemo(() => {
    const now = new Date();
    const todayStr = now.toDateString();
    const month = now.getMonth();
    const paid = bookings.filter((b) => ['paid', 'reviewed'].includes(b.status) && b.finalPriceAgorot);
    const sum = (rows: typeof paid) => rows.reduce((s, b) => s + (b.finalPriceAgorot ?? 0), 0);
    const paidToday = paid.filter((b) => new Date(b.updatedAt).toDateString() === todayStr);
    const paidMonth = paid.filter((b) => new Date(b.updatedAt).getMonth() === month);
    return {
      ordersToday: bookings.filter((b) => new Date(b.createdAt).toDateString() === todayStr).length,
      revenueToday: sum(paidToday),
      revenueMonth: sum(paidMonth),
      prosTotal: pros.length,
      prosOnline: availability.filter((a) => a.online).length,
      prosPending: pros.filter((p) => p.status === 'pending').length,
      customers: customers.length,
      activeJobs: bookings.filter((b) => ['accepted', 'en_route', 'arrived', 'in_progress'].includes(b.status)).length,
      canceled: bookings.filter((b) => b.status === 'canceled').length,
      commissions: bookings.reduce((s, b) => s + (['paid', 'reviewed'].includes(b.status) ? (b.commissionAgorot ?? 0) : 0), 0),
      aov: paid.length > 0 ? Math.round(sum(paid) / paid.length) : 0,
    };
  }, [bookings, pros, customers, availability]);

  /** Last-14-days series for the two time charts. */
  const daily = useMemo(() => {
    const days = Array.from({ length: 14 }, (_, i) => {
      const d = new Date();
      d.setDate(d.getDate() - (13 - i));
      return d;
    });
    return days.map((d) => {
      const key = d.toDateString();
      const dayBookings = bookings.filter((b) => new Date(b.createdAt).toDateString() === key);
      const revenue = bookings
        .filter((b) => ['paid', 'reviewed'].includes(b.status) && new Date(b.updatedAt).toDateString() === key)
        .reduce((s, b) => s + (b.finalPriceAgorot ?? 0), 0);
      return { label: d.toLocaleDateString('he-IL', { day: 'numeric', month: 'numeric' }), orders: dayBookings.length, revenue };
    });
  }, [bookings]);

  const byService = useMemo(
    () =>
      services
        .map((s) => ({ label: s.name, count: bookings.filter((b) => b.serviceId === s.id).length }))
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count - a.count),
    [services, bookings],
  );

  const byArea = useMemo(
    () =>
      areas
        .map((a) => ({ label: a.name, count: bookings.filter((b) => b.areaId === a.id).length }))
        .filter((x) => x.count > 0)
        .sort((a, b) => b.count - a.count),
    [areas, bookings],
  );

  const kpis = [
    { label: 'הזמנות היום', value: String(stats.ordersToday) },
    { label: 'מחזור היום', value: shekel(stats.revenueToday) },
    { label: 'מחזור החודש', value: shekel(stats.revenueMonth) },
    { label: 'עמלות הפלטפורמה', value: shekel(stats.commissions) },
    { label: 'בעלי מקצוע', value: `${stats.prosTotal} (${stats.prosPending} ממתינים)` },
    { label: 'Online עכשיו', value: String(stats.prosOnline) },
    { label: 'לקוחות', value: String(stats.customers) },
    { label: 'עבודות פעילות', value: String(stats.activeJobs) },
    { label: 'בוטלו', value: String(stats.canceled) },
    { label: 'שווי הזמנה ממוצע', value: shekel(stats.aov) },
  ];

  return (
    <div className="space-y-5">
      <h1 className="text-xl font-black">דשבורד</h1>
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        {kpis.map((kpi) => (
          <Card key={kpi.label} className="p-4">
            <p className="text-lg font-black leading-tight text-slate-900">{kpi.value}</p>
            <p className="mt-0.5 text-xs font-bold text-slate-400">{kpi.label}</p>
          </Card>
        ))}
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <BarChart title="הכנסות · 14 ימים" data={daily.map((d) => ({ label: d.label, value: d.revenue }))} format={(v) => shekel(v)} color="bg-emerald-500" />
        <BarChart title="הזמנות · 14 ימים" data={daily.map((d) => ({ label: d.label, value: d.orders }))} format={(v) => String(v)} color="bg-sky-500" />
        <HBarChart title="שירותים פופולריים" data={byService} color="bg-violet-500" />
        <HBarChart title="עבודות לפי עיר" data={byArea} color="bg-amber-500" />
      </div>
    </div>
  );
}

function BarChart({ title, data, format, color }: { title: string; data: { label: string; value: number }[]; format: (v: number) => string; color: string }) {
  const max = Math.max(1, ...data.map((d) => d.value));
  return (
    <Card className="p-4">
      <p className="mb-3 font-black">{title}</p>
      <div className="flex h-36 items-end gap-1">
        {data.map((d, i) => (
          <div key={i} className="group relative flex flex-1 flex-col items-center justify-end">
            <span className="pointer-events-none absolute -top-6 hidden whitespace-nowrap rounded bg-slate-900 px-1.5 py-0.5 text-[10px] font-bold text-white group-hover:block">
              {format(d.value)}
            </span>
            <div className={`w-full rounded-t ${color} transition-all`} style={{ height: `${(d.value / max) * 100}%`, minHeight: d.value > 0 ? 3 : 0 }} />
            <span className="mt-1 origin-top-left text-[8px] text-slate-400">{d.label}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}

function HBarChart({ title, data, color }: { title: string; data: { label: string; count: number }[]; color: string }) {
  const max = Math.max(1, ...data.map((d) => d.count));
  return (
    <Card className="p-4">
      <p className="mb-3 font-black">{title}</p>
      {data.length === 0 && <p className="py-6 text-center text-sm text-slate-400">אין נתונים עדיין</p>}
      <div className="space-y-2">
        {data.slice(0, 6).map((d) => (
          <div key={d.label} className="flex items-center gap-2 text-sm">
            <span className="w-28 shrink-0 truncate font-bold text-slate-600">{d.label}</span>
            <div className="h-4 flex-1 overflow-hidden rounded-full bg-slate-100">
              <div className={`h-full rounded-full ${color}`} style={{ width: `${(d.count / max) * 100}%` }} />
            </div>
            <span className="w-6 text-end font-black text-slate-700">{d.count}</span>
          </div>
        ))}
      </div>
    </Card>
  );
}
