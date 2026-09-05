'use client';

import { useMemo, useState } from 'react';
import { Avatar, BADGE_LABELS, Btn, Card, Field, Sheet, Stars, inputClass } from '@/components/market/ui';
import { shekel } from '@/lib/market/config';
import { useCollection } from '@/lib/market/hooks';
import { getStore } from '@/lib/market/store';
import type { Badge, Professional } from '@/lib/market/types';

/** Admin: professionals — approval queue, search, block, commission, badges. */
export default function AdminProsPage() {
  const { rows: pros } = useCollection('professionals');
  const { rows: bookings } = useCollection('bookings');
  const { rows: reviews } = useCollection('reviews');
  const { rows: wallet } = useCollection('wallet');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'blocked'>('all');
  const [editing, setEditing] = useState<Professional | null>(null);

  const list = useMemo(
    () =>
      pros
        .filter((p) => (filter === 'all' ? true : p.status === filter))
        .filter((p) => `${p.fullName} ${p.businessName} ${p.city}`.includes(query))
        .sort((a, b) => (a.status === 'pending' ? -1 : 1) - (b.status === 'pending' ? -1 : 1)),
    [pros, query, filter],
  );

  const setStatus = async (pro: Professional, status: Professional['status']) => {
    await getStore().put('professionals', { ...pro, status });
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black">בעלי מקצוע</h1>
      <div className="flex flex-col gap-2 sm:flex-row">
        <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש לפי שם/עיר…" className={inputClass} />
        <select value={filter} onChange={(e) => setFilter(e.target.value as typeof filter)} className={`${inputClass} sm:w-44`}>
          <option value="all">כל הסטטוסים</option>
          <option value="pending">ממתינים לאישור</option>
          <option value="active">פעילים</option>
          <option value="blocked">חסומים</option>
        </select>
      </div>

      <div className="space-y-3">
        {list.map((p) => {
          const jobs = bookings.filter((b) => b.professionalId === p.id);
          const earned = wallet.filter((w) => w.professionalId === p.id).reduce((s, w) => s + w.amountAgorot, 0);
          return (
            <Card key={p.id} className={`p-4 ${p.status === 'pending' ? 'border-amber-300 bg-amber-50/50' : ''}`}>
              <div className="flex flex-wrap items-center gap-3">
                <Avatar name={p.businessName || p.fullName} photoUrl={p.photoUrl} size={44} />
                <div className="min-w-0 flex-1">
                  <p className="font-black">
                    {p.businessName || p.fullName}
                    <span className={`ms-2 rounded-full px-2 py-0.5 text-[10px] font-black ${p.status === 'active' ? 'bg-emerald-50 text-emerald-700' : p.status === 'pending' ? 'bg-amber-100 text-amber-700' : 'bg-red-50 text-red-600'}`}>
                      {p.status === 'active' ? 'פעיל' : p.status === 'pending' ? 'ממתין לאישור' : 'חסום'}
                    </span>
                  </p>
                  <p className="text-xs text-slate-500">
                    {p.city} · {p.phone} · <Stars rating={p.rating} size="text-xs" /> ({p.reviewCount}) ·{' '}
                    {jobs.length} עבודות במערכת · יתרה {shekel(Math.max(0, earned))}
                    {p.commissionPct !== null && ` · עמלה ${p.commissionPct}%`}
                    {p.boost > 0 && ` · 🚀 קידום ${p.boost}`}
                  </p>
                </div>
                <div className="flex gap-2">
                  {p.status === 'pending' && (
                    <Btn variant="success" onClick={() => void setStatus(p, 'active')}>✓ אישור</Btn>
                  )}
                  {p.status === 'active' && (
                    <Btn variant="danger" onClick={() => void setStatus(p, 'blocked')}>חסימה</Btn>
                  )}
                  {p.status === 'blocked' && (
                    <Btn variant="secondary" onClick={() => void setStatus(p, 'active')}>שחרור</Btn>
                  )}
                  <Btn variant="secondary" onClick={() => setEditing(p)}>עריכה</Btn>
                </div>
              </div>
              {reviews.filter((r) => r.professionalId === p.id).length > 0 && (
                <p className="mt-2 text-xs text-slate-400">
                  ביקורת אחרונה: “{reviews.filter((r) => r.professionalId === p.id).sort((a, b) => b.createdAt.localeCompare(a.createdAt))[0].text}”
                </p>
              )}
            </Card>
          );
        })}
      </div>

      {editing && <EditSheet pro={editing} onClose={() => setEditing(null)} />}
    </div>
  );
}

function EditSheet({ pro, onClose }: { pro: Professional; onClose: () => void }) {
  const [commission, setCommission] = useState(pro.commissionPct === null ? '' : String(pro.commissionPct));
  const [boost, setBoost] = useState(pro.boost);
  const [badges, setBadges] = useState<Badge[]>(pro.badges);

  const save = async () => {
    await getStore().put('professionals', {
      ...pro,
      commissionPct: commission === '' ? null : Number(commission),
      boost,
      badges,
    });
    onClose();
  };

  return (
    <Sheet title={`עריכה — ${pro.businessName || pro.fullName}`} onClose={onClose}>
      <div className="space-y-4">
        <Field label="עמלה פרטנית % (ריק = ברירת המחדל של הפלטפורמה)">
          <input type="number" value={commission} onChange={(e) => setCommission(e.target.value)} className={inputClass} placeholder="15" />
        </Field>
        <Field label={`קידום בתוצאות (boost): ${boost}`}>
          <input type="range" min={0} max={100} value={boost} onChange={(e) => setBoost(Number(e.target.value))} className="w-full accent-sky-600" />
        </Field>
        <Field label="Badges">
          <div className="flex flex-wrap gap-2">
            {(Object.keys(BADGE_LABELS) as Badge[]).map((b) => (
              <button key={b} onClick={() => setBadges((prev) => (prev.includes(b) ? prev.filter((x) => x !== b) : [...prev, b]))} className={`rounded-xl border-2 px-3 py-1.5 text-xs font-bold ${badges.includes(b) ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500'}`}>
                {BADGE_LABELS[b]}
              </button>
            ))}
          </div>
        </Field>
        <Btn className="w-full" onClick={() => void save()}>שמירה</Btn>
      </div>
    </Sheet>
  );
}
