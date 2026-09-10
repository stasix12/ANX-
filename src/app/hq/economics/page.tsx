'use client';

import { useState } from 'react';
import { HqShell, useIsAdmin } from '@/components/platform/HqShell';
import { btnPrimary, inputClass, Stat } from '@/components/platform/ui';
import { reactivationList, sourceEconomics, totals } from '@/lib/platform/analytics';
import { cityName, formatPrice, relativeTimeHe, SOURCE_OPTIONS, sourceLabel, todayIso } from '@/lib/platform/catalog';
import { whatsappAdapter } from '@/lib/platform/integrations';
import { actions, usePlatform } from '@/lib/platform/store';
import type { MarketingSource } from '@/lib/platform/types';

/** Unit economics per marketing source + ad-spend entry + reactivation. */

function Economics() {
  const snap = usePlatform();
  const isAdmin = useIsAdmin();
  const [days, setDays] = useState(7);
  const [spendForm, setSpendForm] = useState({ date: todayIso(), source: 'google' as MarketingSource, campaign: '', amount: '' });

  if (!snap) return null;
  if (!isAdmin) {
    return <p className="surface rounded-card p-6 text-mist-300">מסך זה זמין למנהלים בלבד.</p>;
  }

  const rows = sourceEconomics(snap, days);
  const sum = totals(rows);
  const stale = reactivationList(snap);

  return (
    <div className="crm-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-mist-100">Unit Economics</h1>
        <div role="group" className="flex gap-1 rounded-full bg-ink-800 p-1">
          {[7, 30, 90].map((d) => (
            <button
              key={d}
              type="button"
              aria-pressed={days === d}
              onClick={() => setDays(d)}
              className={`rounded-full px-3 py-1 text-xs font-bold ${days === d ? 'bg-brand-500 text-on-brand' : 'text-mist-300'}`}
            >
              {d} ימים
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Stat label="Ad Spend" value={formatPrice(sum.spend)} />
        <Stat label="Leads" value={sum.leads} />
        <Stat label="CPL — עלות ליד" value={formatPrice(sum.cpl)} />
        <Stat label="עבודות שנסגרו" value={sum.closedJobs} />
        <Stat label="Conversion" value={`${Math.round(sum.conversion * 100)}%`} />
        <Stat label="CPA — עלות עבודה" value={formatPrice(sum.cpa)} />
        <Stat label="הכנסה ממכירת עבודות" value={formatPrice(sum.revenue)} tone="good" />
        <Stat label="Gross Profit" value={formatPrice(sum.grossProfit)} tone={sum.grossProfit >= 0 ? 'good' : 'bad'} />
      </div>

      <div className="surface mt-5 overflow-x-auto rounded-card p-4">
        <h2 className="font-black text-mist-100">לפי מקור פרסום</h2>
        <table className="mt-3 w-full min-w-[640px] text-sm">
          <thead>
            <tr className="text-start text-xs text-mist-500">
              {['מקור', 'Spend', 'לידים', 'CPL', 'נסגרו', 'Conv.', 'CPA', 'הכנסה', 'רווח'].map((h) => (
                <th key={h} className="pb-2 text-start font-bold">
                  {h}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.source} className="border-t border-ink-700">
                <td className="py-2 font-bold text-mist-100">{sourceLabel(r.source)}</td>
                <td className="tabular-nums text-mist-300">{formatPrice(r.spend)}</td>
                <td className="tabular-nums text-mist-300">{r.leads}</td>
                <td className="tabular-nums text-mist-300">{r.cpl ? formatPrice(r.cpl) : '—'}</td>
                <td className="tabular-nums text-mist-300">{r.closedJobs}</td>
                <td className="tabular-nums text-mist-300">{Math.round(r.conversion * 100)}%</td>
                <td className="tabular-nums text-mist-300">{r.cpa ? formatPrice(r.cpa) : '—'}</td>
                <td className="tabular-nums font-bold text-mist-100">{formatPrice(r.revenue)}</td>
                <td className={`tabular-nums font-black ${r.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {formatPrice(r.grossProfit)}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
        <p className="mt-2 text-xs text-mist-500">
          השאלה החשובה אינה מי הביא הכי הרבה לידים — אלא מי הביא הכי הרבה עבודות סגורות ורווח.
        </p>
      </div>

      {/* Ad spend entry */}
      <div className="surface mt-5 rounded-card p-4">
        <h2 className="font-black text-mist-100">הזנת הוצאת פרסום</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-5">
          <input type="date" value={spendForm.date} onChange={(e) => setSpendForm({ ...spendForm, date: e.target.value })} className={inputClass} />
          <select value={spendForm.source} onChange={(e) => setSpendForm({ ...spendForm, source: e.target.value as MarketingSource })} className={inputClass}>
            {SOURCE_OPTIONS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>
          <input value={spendForm.campaign} onChange={(e) => setSpendForm({ ...spendForm, campaign: e.target.value })} placeholder="קמפיין" className={inputClass} />
          <input type="number" value={spendForm.amount} onChange={(e) => setSpendForm({ ...spendForm, amount: e.target.value })} placeholder="₪ סכום" className={inputClass} />
          <button
            type="button"
            disabled={!spendForm.amount || Number(spendForm.amount) <= 0}
            onClick={async () => {
              await actions.addAdSpend({
                date: spendForm.date,
                source: spendForm.source,
                campaign: spendForm.campaign || '—',
                amount: Number(spendForm.amount),
              });
              setSpendForm({ ...spendForm, amount: '', campaign: '' });
            }}
            className={btnPrimary}
          >
            הוסף
          </button>
        </div>
        <p className="mt-2 text-xs text-mist-500">
          בהמשך: משיכה אוטומטית מ-Google/Facebook Ads דרך ה-Integration Layer.
        </p>
      </div>

      {/* Reactivation */}
      <div className="surface mt-5 rounded-card p-4">
        <h2 className="font-black text-mist-100">
          💤 לקוחות רדומים ({snap.config.reactivationMonths}+ חודשים) — קמפיין Re-activation
        </h2>
        {stale.length === 0 ? (
          <p className="mt-2 text-sm text-mist-500">אין לקוחות רדומים כרגע.</p>
        ) : (
          <div className="mt-2 space-y-2">
            {stale.map((c) => (
              <div key={c.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-900 p-3 text-sm">
                <span>
                  <span className="font-bold text-mist-100">{c.name}</span>
                  <span className="block text-xs text-mist-500">
                    {cityName(c.city)} · {c.orders} הזמנות · {formatPrice(c.totalSpent)} · אחרונה {c.lastOrderAt ? relativeTimeHe(c.lastOrderAt) : '—'}
                  </span>
                </span>
                <button
                  type="button"
                  onClick={() =>
                    whatsappAdapter.send(
                      c.phone,
                      `היי ${c.name.split(' ')[0]}, כאן קלין ישראל ✨ עבר זמן מהניקוי האחרון — הגיע הזמן לרענן את הבית! יש לך ₪${c.loyaltyCredit || 25} קרדיט לקוח חוזר. לתיאום: פשוט השב להודעה.`,
                    )
                  }
                  className="rounded-full bg-emerald-500 px-3 py-1.5 text-xs font-black text-white"
                >
                  💬 שלח תזכורת
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

export default function EconomicsPage() {
  return (
    <HqShell>
      <Economics />
    </HqShell>
  );
}
