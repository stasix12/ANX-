'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { btnPrimary, btnSecondary, inputClass } from '@/components/platform/ui';
import { AddressAutocompleteInput } from '@/components/AddressAutocompleteInput';
import {
  addDaysIso,
  CATEGORIES,
  CITIES,
  cityById,
  CONDITION_OPTIONS,
  todayIso,
} from '@/lib/platform/catalog';
import { actions } from '@/lib/platform/store';
import type { MarketingSource, UtmParams } from '@/lib/platform/types';
import { friendlyMessage } from '@/lib/social/errors';

/**
 * The quote funnel — seven short steps, exactly the spec's order. Every
 * submission becomes a lead in the CRM immediately, carrying its UTM tags.
 */

const STEPS = ['שירות', 'כמות', 'מצב', 'תמונות', 'כתובת', 'מועד', 'פרטים'] as const;

function sourceFromUtm(utm: UtmParams): MarketingSource {
  const s = (utm.source ?? '').toLowerCase();
  if (s.includes('google')) return 'google';
  if (s.includes('facebook') || s === 'fb') return 'facebook';
  if (s.includes('instagram') || s === 'ig') return 'instagram';
  if (s.includes('tiktok')) return 'tiktok';
  if (s.includes('whatsapp')) return 'whatsapp';
  if (s.includes('referral')) return 'referral';
  if (s) return 'organic';
  return 'direct';
}

/** Downscale a photo to ≤900px JPEG data-URL so demo storage stays small. */
async function readPhoto(file: File): Promise<string> {
  const dataUrl = await new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
  const img = await new Promise<HTMLImageElement>((resolve, reject) => {
    const el = new Image();
    el.onload = () => resolve(el);
    el.onerror = reject;
    el.src = dataUrl;
  });
  const max = 900;
  const scale = Math.min(1, max / Math.max(img.width, img.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(img.width * scale);
  canvas.height = Math.round(img.height * scale);
  canvas.getContext('2d')?.drawImage(img, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/jpeg', 0.75);
}

function QuoteFunnel() {
  const params = useSearchParams();
  const utm = useMemo<UtmParams>(
    () => ({
      source: params.get('utm_source') ?? undefined,
      campaign: params.get('utm_campaign') ?? undefined,
      medium: params.get('utm_medium') ?? undefined,
      content: params.get('utm_content') ?? undefined,
      term: params.get('utm_term') ?? undefined,
    }),
    [params],
  );

  const [step, setStep] = useState(0);
  const [selected, setSelected] = useState<string[]>(() => {
    const pre = params.get('service');
    return pre && CATEGORIES.some((c) => c.id === pre) ? [pre] : [];
  });
  const [qty, setQty] = useState<Record<string, number>>({});
  const [condition, setCondition] = useState<string[]>([]);
  const [photos, setPhotos] = useState<string[]>([]);
  const [city, setCity] = useState('');
  const [address, setAddress] = useState('');
  const [preferred, setPreferred] = useState<'today' | 'tomorrow' | 'date'>('today');
  const [preferredDate, setPreferredDate] = useState(addDaysIso(2));
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [hasWhatsapp, setHasWhatsapp] = useState(true);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  const canNext =
    step === 0 ? selected.length > 0
    : step === 4 ? city !== ''
    : step === 6 ? name.trim().length >= 2 && phone.replace(/\D/g, '').length >= 9
    : true;

  const toggle = (arr: string[], set: (v: string[]) => void, id: string) =>
    set(arr.includes(id) ? arr.filter((x) => x !== id) : [...arr, id]);

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await actions.createLead({
        name: name.trim(),
        phone: phone.trim(),
        hasWhatsapp,
        city,
        address: address.trim(),
        items: selected.map((id) => ({ categoryId: id, qty: qty[id] ?? 1 })),
        condition,
        photos,
        preferred,
        preferredDate: preferred === 'date' ? preferredDate : preferred === 'tomorrow' ? addDaysIso(1) : todayIso(),
        source: sourceFromUtm(utm),
        utm,
      });
      setDone(true);
    } catch (e) {
      setError(friendlyMessage(e, 'משהו השתבש, נסו שוב'));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="crm-page mx-auto max-w-md px-4 py-16 text-center">
        <div className="mx-auto flex h-20 w-20 items-center justify-center rounded-full bg-emerald-500/15 text-4xl">
          ✅
        </div>
        <h1 className="mt-6 text-2xl font-black text-mist-100">הבקשה התקבלה!</h1>
        <p className="mt-3 text-mist-300">
          נציג שלנו יחזור אליך <b>תוך דקות</b> עם מחיר סגור וזמינות
          {preferred === 'today' ? ' להיום' : ''}.
        </p>
        <Link href="/clean" className={`${btnSecondary} mt-8`}>
          חזרה לדף הבית
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-16">
      <header className="flex items-center justify-between py-4">
        <Link href="/clean" className="text-sm font-bold text-mist-500">
          → חזרה
        </Link>
        <div className="text-sm font-black text-brand-400">קבלת מחיר לניקוי</div>
      </header>

      {/* Progress */}
      <div className="mb-6 flex items-center gap-1.5" aria-label={`שלב ${step + 1} מתוך ${STEPS.length}`}>
        {STEPS.map((label, i) => (
          <div key={label} className={`h-1.5 flex-1 rounded-full ${i <= step ? 'bg-brand-500' : 'bg-ink-700'}`} />
        ))}
      </div>

      <div className="crm-page" key={step}>
        {step === 0 && (
          <>
            <h1 className="text-2xl font-black text-mist-100">מה רוצים לנקות?</h1>
            <p className="mt-1 text-sm text-mist-500">אפשר לבחור כמה פריטים</p>
            <div className="mt-4 grid grid-cols-2 gap-3">
              {CATEGORIES.filter((c) => c.active).map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggle(selected, setSelected, c.id)}
                  aria-pressed={selected.includes(c.id)}
                  className={`surface flex flex-col items-center gap-1.5 rounded-card p-4 text-center ${
                    selected.includes(c.id) ? 'ring-2 ring-brand-500' : ''
                  }`}
                >
                  <span className="text-2xl">{c.emoji}</span>
                  <span className="text-sm font-bold text-mist-100">{c.name}</span>
                </button>
              ))}
            </div>
          </>
        )}

        {step === 1 && (
          <>
            <h1 className="text-2xl font-black text-mist-100">כמה פריטים?</h1>
            <div className="mt-4 space-y-3">
              {selected.map((id) => {
                const c = CATEGORIES.find((x) => x.id === id)!;
                const n = qty[id] ?? 1;
                return (
                  <div key={id} className="surface flex items-center justify-between rounded-card p-4">
                    <div className="font-bold text-mist-100">
                      {c.emoji} {c.name}
                      <div className="text-xs font-normal text-mist-500">{c.unitLabel}</div>
                    </div>
                    <div className="flex items-center gap-3">
                      <button
                        type="button"
                        aria-label="פחות"
                        className="h-9 w-9 rounded-full bg-ink-800 font-black text-mist-100"
                        onClick={() => setQty({ ...qty, [id]: Math.max(1, n - 1) })}
                      >
                        −
                      </button>
                      <span className="w-6 text-center text-lg font-black tabular-nums text-mist-100">{n}</span>
                      <button
                        type="button"
                        aria-label="יותר"
                        className="h-9 w-9 rounded-full bg-brand-500 font-black text-on-brand"
                        onClick={() => setQty({ ...qty, [id]: Math.min(c.maxQty, n + 1) })}
                      >
                        +
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          </>
        )}

        {step === 2 && (
          <>
            <h1 className="text-2xl font-black text-mist-100">מה מצב הפריטים?</h1>
            <p className="mt-1 text-sm text-mist-500">זה עוזר לנו לתת מחיר מדויק</p>
            <div className="mt-4 flex flex-wrap gap-2">
              {CONDITION_OPTIONS.map((tag) => (
                <button
                  key={tag}
                  type="button"
                  onClick={() => toggle(condition, setCondition, tag)}
                  aria-pressed={condition.includes(tag)}
                  className={`rounded-full px-4 py-2.5 text-sm font-bold ${
                    condition.includes(tag)
                      ? 'bg-brand-500 text-on-brand'
                      : 'surface text-mist-100'
                  }`}
                >
                  {tag}
                </button>
              ))}
            </div>
          </>
        )}

        {step === 3 && (
          <>
            <h1 className="text-2xl font-black text-mist-100">תמונות (רשות)</h1>
            <p className="mt-1 text-sm text-mist-500">תמונה של הכתם = מחיר מדויק יותר</p>
            <label className="surface mt-4 flex cursor-pointer flex-col items-center gap-2 rounded-card border-2 border-dashed border-ink-600 p-8 text-center">
              <span className="text-3xl">📷</span>
              <span className="font-bold text-brand-400">הוסיפו תמונות</span>
              <input
                type="file"
                accept="image/*"
                multiple
                className="hidden"
                onChange={async (e) => {
                  const files = [...(e.target.files ?? [])].slice(0, 3 - photos.length);
                  const urls = await Promise.all(files.map(readPhoto));
                  setPhotos((p) => [...p, ...urls].slice(0, 3));
                }}
              />
            </label>
            {photos.length > 0 && (
              <div className="mt-3 flex gap-2">
                {photos.map((src, i) => (
                  <div key={i} className="relative">
                    {/* Data-URL preview — next/image has no optimizer for these. */}
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={src} alt={`תמונה ${i + 1}`} className="h-20 w-20 rounded-xl object-cover" />
                    <button
                      type="button"
                      aria-label="הסר תמונה"
                      onClick={() => setPhotos(photos.filter((_, j) => j !== i))}
                      className="absolute -left-1 -top-1 flex h-6 w-6 items-center justify-center rounded-full bg-red-600 text-xs font-black text-white"
                    >
                      ✕
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {step === 4 && (
          <>
            <h1 className="text-2xl font-black text-mist-100">איפה אתם גרים?</h1>
            <div className="mt-4 space-y-3">
              <select value={city} onChange={(e) => setCity(e.target.value)} className={inputClass}>
                <option value="">בחרו עיר…</option>
                {CITIES.map((c) => (
                  <option key={c.id} value={c.id}>
                    {c.name}
                  </option>
                ))}
              </select>
              <AddressAutocompleteInput
                value={address}
                onChangeText={setAddress}
                onSelect={(s) => {
                  const match = CITIES.find((c) => c.name === s.city);
                  if (match) setCity(match.id);
                }}
                placeholder="רחוב ומספר (רשות בשלב זה)"
                inputClassName={inputClass}
                bias={cityById(city) ?? null}
              />
            </div>
          </>
        )}

        {step === 5 && (
          <>
            <h1 className="text-2xl font-black text-mist-100">מתי מתאים לכם?</h1>
            <div className="mt-4 space-y-3">
              {(
                [
                  ['today', '⚡ היום', 'נשתדל לשבץ עוד היום'],
                  ['tomorrow', 'מחר', ''],
                  ['date', 'בחירת תאריך', ''],
                ] as const
              ).map(([value, label, sub]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setPreferred(value)}
                  aria-pressed={preferred === value}
                  className={`surface flex w-full items-center justify-between rounded-card p-4 text-start ${
                    preferred === value ? 'ring-2 ring-brand-500' : ''
                  }`}
                >
                  <span className="font-bold text-mist-100">
                    {label}
                    {sub ? <span className="block text-xs font-normal text-mist-500">{sub}</span> : null}
                  </span>
                  <span className={preferred === value ? 'text-brand-500' : 'text-ink-600'}>●</span>
                </button>
              ))}
              {preferred === 'date' && (
                <input
                  type="date"
                  value={preferredDate}
                  min={todayIso()}
                  onChange={(e) => setPreferredDate(e.target.value)}
                  className={inputClass}
                />
              )}
            </div>
          </>
        )}

        {step === 6 && (
          <>
            <h1 className="text-2xl font-black text-mist-100">כמעט סיימנו!</h1>
            <p className="mt-1 text-sm text-mist-500">לאן נחזור אליכם עם המחיר?</p>
            <div className="mt-4 space-y-3">
              <input value={name} onChange={(e) => setName(e.target.value)} placeholder="שם מלא" className={inputClass} />
              <input
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="טלפון נייד"
                type="tel"
                inputMode="tel"
                dir="ltr"
                className={`${inputClass} text-right`}
              />
              <label className="flex items-center gap-3 rounded-xl bg-ink-800 px-4 py-3">
                <input
                  type="checkbox"
                  checked={hasWhatsapp}
                  onChange={(e) => setHasWhatsapp(e.target.checked)}
                  className="h-5 w-5 accent-brand-500"
                />
                <span className="text-sm font-bold text-mist-100">אפשר לחזור אליי גם ב-WhatsApp 💬</span>
              </label>
            </div>
            {error && <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-700">{error}</p>}
          </>
        )}
      </div>

      {/* Nav */}
      <div className="mt-8 flex gap-3">
        {step > 0 && (
          <button type="button" onClick={() => setStep(step - 1)} className={btnSecondary}>
            חזרה
          </button>
        )}
        {step < STEPS.length - 1 ? (
          <button type="button" disabled={!canNext} onClick={() => setStep(step + 1)} className={`${btnPrimary} flex-1`}>
            המשך ←
          </button>
        ) : (
          <button type="button" disabled={!canNext || busy} onClick={submit} className={`${btnPrimary} flex-1`}>
            {busy ? 'שולח…' : 'קבלו מחיר עכשיו 🎉'}
          </button>
        )}
      </div>
    </div>
  );
}

export default function QuotePage() {
  return (
    <Suspense>
      <QuoteFunnel />
    </Suspense>
  );
}
