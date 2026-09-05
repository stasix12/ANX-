'use client';

import { useMemo, useState } from 'react';
import { Avatar, BADGE_LABELS, Btn, Card, Field, Sheet, Stars, inputClass } from '@/components/market/ui';
import { shekel } from '@/lib/market/config';
import { useCollection } from '@/lib/market/hooks';
import { getStore, nowIso, uid } from '@/lib/market/store';
import type { Badge, Language, Professional } from '@/lib/market/types';

/**
 * Admin: professionals — approval queue, search, block, commission, badges,
 * and manual onboarding: a company that signs up over the phone (rather than
 * through /pro/join) gets created right here, already active.
 */
export default function AdminProsPage() {
  const { rows: pros } = useCollection('professionals');
  const { rows: bookings } = useCollection('bookings');
  const { rows: reviews } = useCollection('reviews');
  const { rows: wallet } = useCollection('wallet');
  const [query, setQuery] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'active' | 'blocked'>('all');
  const [editing, setEditing] = useState<Professional | null>(null);
  const [adding, setAdding] = useState(false);

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
      <div className="flex items-center justify-between">
        <h1 className="text-xl font-black">בעלי מקצוע</h1>
        <Btn onClick={() => setAdding(true)}>+ בעל מקצוע חדש</Btn>
      </div>
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
      {adding && <AddProSheet onClose={() => setAdding(false)} />}
    </div>
  );
}

/**
 * Manual onboarding by the admin. Minimal required set (name, phone, city,
 * one service, one area); everything else has sensible defaults and the pro
 * can complete their own profile later from /pro/app/profile.
 */
function AddProSheet({ onClose }: { onClose: () => void }) {
  const { rows: services } = useCollection('services');
  const { rows: areas } = useCollection('areas');
  const [businessName, setBusinessName] = useState('');
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [city, setCity] = useState('');
  const [years, setYears] = useState(1);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [prices, setPrices] = useState<Record<string, string>>({});
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [languages, setLanguages] = useState<Language[]>(['he']);
  const [activeNow, setActiveNow] = useState(true);
  const [error, setError] = useState('');

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const save = async () => {
    const name = businessName.trim() || fullName.trim();
    if (!name) return setError('חסר שם עסק או שם מלא');
    if (phone.trim().length < 8) return setError('חסר מספר טלפון תקין');
    if (selectedServices.length === 0) return setError('בחרו לפחות שירות אחד');
    if (selectedAreas.length === 0) return setError('בחרו לפחות אזור עבודה אחד');

    const store = getStore();
    const id = uid();
    const slug =
      name
        .toLowerCase()
        .replace(/[^a-z0-9א-ת]+/g, '-')
        .replace(/^-|-$/g, '') + `-${id.slice(0, 4)}`;
    const base = areas.find((a) => a.id === selectedAreas[0])?.center ?? { lat: 31.2518, lng: 34.7913 };
    const pro: Professional = {
      id,
      slug,
      fullName: fullName.trim() || name,
      businessName: businessName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      city: city.trim() || (areas.find((a) => a.id === selectedAreas[0])?.name ?? ''),
      bio: '',
      languages,
      yearsExperience: years,
      workRadiusKm: 20,
      base,
      areaIds: selectedAreas,
      services: selectedServices.map((serviceId) => ({
        serviceId,
        priceAgorot: prices[serviceId] ? Number(prices[serviceId]) * 100 : undefined,
      })),
      gallery: [],
      status: activeNow ? 'active' : 'pending',
      // Added by the platform's own team — that check is the badge's meaning.
      badges: activeNow ? ['platform_checked'] : [],
      commissionPct: null,
      boost: 0,
      rating: 0,
      reviewCount: 0,
      jobCount: 0,
      acceptancePct: 100,
      cancelPct: 0,
      lastJobAt: null,
      createdAt: nowIso(),
    };
    await store.put('professionals', pro);
    await store.put('availability', { professionalId: id, online: false, heartbeatAt: nowIso(), location: base });
    onClose();
  };

  const LANGS: { id: Language; label: string }[] = [
    { id: 'he', label: 'עברית' },
    { id: 'ru', label: 'רוסית' },
    { id: 'ar', label: 'ערבית' },
    { id: 'en', label: 'אנגלית' },
  ];

  return (
    <Sheet title="בעל מקצוע חדש" onClose={onClose}>
      <div className="space-y-4">
        <div className="grid grid-cols-2 gap-2">
          <Field label="שם העסק *">
            <input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputClass} placeholder='למשל: זיו בניקיון' />
          </Field>
          <Field label="איש קשר">
            <input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="טלפון *">
            <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className={inputClass} />
          </Field>
          <Field label="אימייל">
            <input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputClass} />
          </Field>
        </div>
        <div className="grid grid-cols-2 gap-2">
          <Field label="עיר">
            <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} list="admin-add-cities" />
            <datalist id="admin-add-cities">
              {areas.map((a) => <option key={a.id} value={a.name} />)}
            </datalist>
          </Field>
          <Field label="שנות ניסיון">
            <input type="number" min={0} max={40} value={years} onChange={(e) => setYears(Number(e.target.value))} className={inputClass} />
          </Field>
        </div>

        <Field label="שירותים ומחיר (₪, ריק = מחיר הפלטפורמה) *">
          <div className="space-y-2">
            {services.filter((s) => s.active).map((s) => {
              const on = selectedServices.includes(s.id);
              return (
                <div key={s.id} className="flex items-center gap-2">
                  <button
                    onClick={() => toggle(selectedServices, setSelectedServices, s.id)}
                    className={`flex-1 rounded-xl border-2 p-2.5 text-start text-sm font-bold ${on ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500'}`}
                  >
                    {s.icon} {s.name}
                    <span className="ms-1 text-xs font-normal text-slate-400">({shekel(s.basePriceAgorot)})</span>
                  </button>
                  {on && (
                    <input
                      type="number"
                      value={prices[s.id] ?? ''}
                      onChange={(e) => setPrices((p) => ({ ...p, [s.id]: e.target.value }))}
                      placeholder={String(s.basePriceAgorot / 100)}
                      className={`${inputClass} w-24`}
                    />
                  )}
                </div>
              );
            })}
          </div>
        </Field>

        <Field label="אזורי עבודה *">
          <div className="grid grid-cols-2 gap-2">
            {areas.filter((a) => a.active).map((a) => (
              <button
                key={a.id}
                onClick={() => toggle(selectedAreas, setSelectedAreas, a.id)}
                className={`rounded-xl border-2 p-2.5 text-sm font-bold ${selectedAreas.includes(a.id) ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500'}`}
              >
                {a.name}
              </button>
            ))}
          </div>
        </Field>

        <Field label="שפות">
          <div className="flex flex-wrap gap-2">
            {LANGS.map((l) => (
              <button
                key={l.id}
                onClick={() => setLanguages((prev) => (prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id]))}
                className={`rounded-xl border-2 px-3 py-1.5 text-sm font-bold ${languages.includes(l.id) ? 'border-sky-500 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-500'}`}
              >
                {l.label}
              </button>
            ))}
          </div>
        </Field>

        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <input type="checkbox" checked={activeNow} onChange={(e) => setActiveNow(e.target.checked)} className="h-4 w-4 accent-emerald-600" />
          הפעלה מיידית (אחרת ימתין בתור האישורים)
        </label>

        {error && <p className="text-sm font-bold text-red-600">{error}</p>}
        <Btn variant="success" className="w-full py-3" onClick={() => void save()}>
          הוספת בעל המקצוע
        </Btn>
      </div>
    </Sheet>
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
