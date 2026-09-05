'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { Btn, Card, Field, inputClass } from '@/components/market/ui';
import { shekel } from '@/lib/market/config';
import { useCollection } from '@/lib/market/hooks';
import { updateSession } from '@/lib/market/session';
import { getStore, nowIso, uid } from '@/lib/market/store';
import type { GalleryImage, Language, Professional } from '@/lib/market/types';

/**
 * Professional onboarding — the 8-step flow with a progress bar. The account
 * is created as `pending` and goes live only after an admin approves it in
 * /market/admin/pros.
 */

const STEPS = ['פרטים אישיים', 'פרטי העסק', 'שירותים', 'אזורי עבודה', 'מחירים', 'גלריה', 'מסמכים', 'סיום'];

const LANG_OPTIONS: { id: Language; label: string }[] = [
  { id: 'he', label: 'עברית' },
  { id: 'ru', label: 'רוסית' },
  { id: 'ar', label: 'ערבית' },
  { id: 'en', label: 'אנגלית' },
];

export function JoinWizard() {
  const router = useRouter();
  const { rows: services } = useCollection('services');
  const { rows: areas } = useCollection('areas');

  const [step, setStep] = useState(0);
  const [fullName, setFullName] = useState('');
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [photoUrl, setPhotoUrl] = useState<string | undefined>();
  const [businessName, setBusinessName] = useState('');
  const [city, setCity] = useState('');
  const [bio, setBio] = useState('');
  const [years, setYears] = useState(1);
  const [languages, setLanguages] = useState<Language[]>(['he']);
  const [selectedServices, setSelectedServices] = useState<string[]>([]);
  const [selectedAreas, setSelectedAreas] = useState<string[]>([]);
  const [radius, setRadius] = useState(20);
  const [prices, setPrices] = useState<Record<string, number>>({});
  const [gallery, setGallery] = useState<GalleryImage[]>([]);
  const [docs, setDocs] = useState<string[]>([]);
  const [submitting, setSubmitting] = useState(false);

  const readFile = (file: File, cb: (url: string) => void) => {
    const reader = new FileReader();
    reader.onload = () => cb(String(reader.result));
    reader.readAsDataURL(file);
  };

  const canContinue = [
    fullName.trim().length > 1 && phone.trim().length >= 8,
    city.trim().length > 1,
    selectedServices.length > 0,
    selectedAreas.length > 0,
    true,
    true,
    true,
    true,
  ][step];

  const submit = async () => {
    setSubmitting(true);
    const store = getStore();
    const id = uid();
    const slug =
      (businessName || fullName)
        .trim()
        .toLowerCase()
        .replace(/[^a-z0-9א-ת]+/g, '-')
        .replace(/^-|-$/g, '') +
      '-' +
      id.slice(0, 4);
    const pro: Professional = {
      id,
      slug,
      fullName: fullName.trim(),
      businessName: businessName.trim(),
      phone: phone.trim(),
      email: email.trim(),
      photoUrl,
      city: city.trim(),
      bio: bio.trim(),
      languages,
      yearsExperience: years,
      workRadiusKm: radius,
      base: areas.find((a) => a.id === selectedAreas[0])?.center ?? { lat: 31.2518, lng: 34.7913 },
      areaIds: selectedAreas,
      services: selectedServices.map((serviceId) => ({
        serviceId,
        priceAgorot: prices[serviceId] ? prices[serviceId] * 100 : undefined,
      })),
      gallery,
      status: 'pending',
      badges: [],
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
    // Documents are held for the admin's verification; in production they go
    // to a private storage bucket, never to the public profile.
    await store.put('professionals', { ...pro, gallery: pro.gallery });
    await store.put('availability', { professionalId: id, online: false, heartbeatAt: nowIso(), location: pro.base });
    if (docs.length > 0) {
      // demo: docs ride along in localStorage only
      window.localStorage.setItem(`cleango:docs:${id}`, JSON.stringify(docs));
    }
    updateSession({ activeProId: id });
    router.push('/pro/app');
  };

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  return (
    <div className="relative z-10 min-h-dvh bg-slate-50 font-sans text-slate-900" dir="rtl">
      <div className="mx-auto max-w-lg px-4 py-6">
        <Link href="/pro" className="text-sm font-bold text-slate-400 hover:text-slate-600">→ חזרה</Link>
        <h1 className="mt-2 text-xl font-black">הצטרפות כבעל מקצוע</h1>

        {/* Progress bar */}
        <div className="mt-4">
          <div className="h-2 overflow-hidden rounded-full bg-slate-200">
            <div className="h-full rounded-full bg-emerald-500 transition-all" style={{ width: `${((step + 1) / STEPS.length) * 100}%` }} />
          </div>
          <p className="mt-1.5 text-xs font-bold text-slate-500">
            שלב {step + 1}/{STEPS.length} — {STEPS[step]}
          </p>
        </div>

        <Card className="mt-4 space-y-4 p-4">
          {step === 0 && (
            <>
              <Field label="שם מלא *"><input value={fullName} onChange={(e) => setFullName(e.target.value)} className={inputClass} /></Field>
              <Field label="טלפון *"><input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className={inputClass} /></Field>
              <Field label="אימייל"><input value={email} onChange={(e) => setEmail(e.target.value)} type="email" className={inputClass} /></Field>
              <Field label="תמונת פרופיל">
                <label className="flex cursor-pointer items-center gap-3">
                  {photoUrl ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={photoUrl} alt="" className="h-14 w-14 rounded-full object-cover" />
                  ) : (
                    <span className="flex h-14 w-14 items-center justify-center rounded-full border-2 border-dashed border-slate-300 text-xl text-slate-400">📷</span>
                  )}
                  <span className="text-sm font-bold text-sky-700">{photoUrl ? 'החלפת תמונה' : 'העלאת תמונה'}</span>
                  <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0], setPhotoUrl)} />
                </label>
              </Field>
              <Field label="שפות">
                <div className="flex flex-wrap gap-2">
                  {LANG_OPTIONS.map((l) => (
                    <button key={l.id} onClick={() => setLanguages((prev) => (prev.includes(l.id) ? prev.filter((x) => x !== l.id) : [...prev, l.id]))} className={`rounded-xl border-2 px-3 py-1.5 text-sm font-bold ${languages.includes(l.id) ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-500'}`}>
                      {l.label}
                    </button>
                  ))}
                </div>
              </Field>
            </>
          )}

          {step === 1 && (
            <>
              <Field label="שם העסק"><input value={businessName} onChange={(e) => setBusinessName(e.target.value)} className={inputClass} placeholder="למשל: דוד קלין" /></Field>
              <Field label="עיר *">
                <input value={city} onChange={(e) => setCity(e.target.value)} className={inputClass} list="join-cities" />
                <datalist id="join-cities">{areas.map((a) => <option key={a.id} value={a.name} />)}</datalist>
              </Field>
              <Field label="שנות ניסיון">
                <input type="number" min={0} max={40} value={years} onChange={(e) => setYears(Number(e.target.value))} className={inputClass} />
              </Field>
              <Field label="על העסק (יופיע בפרופיל הציבורי)">
                <textarea value={bio} onChange={(e) => setBio(e.target.value)} rows={3} className={inputClass} placeholder="במה אתם מתמחים? עם איזה ציוד אתם עובדים?" />
              </Field>
            </>
          )}

          {step === 2 && (
            <Field label="אילו שירותים אתם נותנים? *">
              <div className="grid grid-cols-2 gap-2">
                {services.filter((s) => s.active).map((s) => (
                  <button key={s.id} onClick={() => toggle(selectedServices, setSelectedServices, s.id)} className={`rounded-xl border-2 p-3 text-sm font-bold ${selectedServices.includes(s.id) ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>
                    {s.icon} {s.name}
                  </button>
                ))}
              </div>
            </Field>
          )}

          {step === 3 && (
            <>
              <Field label="באילו אזורים אתם עובדים? *">
                <div className="grid grid-cols-2 gap-2">
                  {areas.filter((a) => a.active).map((a) => (
                    <button key={a.id} onClick={() => toggle(selectedAreas, setSelectedAreas, a.id)} className={`rounded-xl border-2 p-3 text-sm font-bold ${selectedAreas.includes(a.id) ? 'border-emerald-500 bg-emerald-50 text-emerald-700' : 'border-slate-200 text-slate-600'}`}>
                      {a.name}
                      {a.waitlistOnly && <span className="block text-[10px] font-normal text-amber-600">ביקוש נאסף — תהיו ראשונים</span>}
                    </button>
                  ))}
                </div>
              </Field>
              <Field label={`רדיוס נסיעה: ${radius} ק"מ`}>
                <input type="range" min={5} max={60} value={radius} onChange={(e) => setRadius(Number(e.target.value))} className="w-full accent-emerald-600" />
              </Field>
            </>
          )}

          {step === 4 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">מחיר בסיס לכל שירות (בש"ח). אפשר להשאיר ריק — יחול מחיר הפלטפורמה.</p>
              {selectedServices.map((sid) => {
                const s = services.find((x) => x.id === sid)!;
                return (
                  <Field key={sid} label={`${s.icon} ${s.name} (מומלץ: ${shekel(s.basePriceAgorot)})`}>
                    <input type="number" min={0} value={prices[sid] ?? ''} onChange={(e) => setPrices((p) => ({ ...p, [sid]: Number(e.target.value) }))} className={inputClass} placeholder={`${s.basePriceAgorot / 100}`} />
                  </Field>
                );
              })}
            </div>
          )}

          {step === 5 && (
            <Field label="תמונות עבודות (לפני/אחרי מוכר הכי טוב)">
              <div className="flex flex-wrap gap-2">
                {gallery.map((g, i) => (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img key={i} src={g.url} alt="" className="h-20 w-20 rounded-xl object-cover" />
                ))}
                <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-2xl text-slate-400 hover:border-emerald-400">
                  +
                  <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0], (url) => setGallery((g) => [...g, { url, kind: 'plain' }]))} />
                </label>
              </div>
            </Field>
          )}

          {step === 6 && (
            <div className="space-y-3">
              <p className="text-sm text-slate-500">
                לאימות "זהות מאומתת" ו"עסק מאומת": תעודה מזהה, ותעודת עוסק אם יש. המסמכים נשמרים לצוות בלבד ולא מוצגים בפרופיל.
              </p>
              <label className="flex cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 p-6 text-sm font-bold text-slate-500 hover:border-emerald-400">
                📎 העלאת מסמך ({docs.length} הועלו)
                <input type="file" accept="image/*,.pdf" hidden onChange={(e) => e.target.files?.[0] && readFile(e.target.files[0], (url) => setDocs((d) => [...d, url]))} />
              </label>
            </div>
          )}

          {step === 7 && (
            <div className="space-y-2 text-center">
              <span className="text-5xl">🎉</span>
              <p className="font-black">הכול מוכן, {fullName.split(' ')[0]}!</p>
              <p className="text-sm text-slate-500">
                שליחת הבקשה תעביר את הפרופיל לאישור הצוות. עד האישור אפשר להסתובב באפליקציה, אבל עבודות יתחילו להגיע רק אחרי הפעלה.
              </p>
              <ul className="mx-auto max-w-xs space-y-1 pt-2 text-start text-xs text-slate-500">
                <li>✓ {selectedServices.length} שירותים</li>
                <li>✓ {selectedAreas.length} אזורי עבודה · רדיוס {radius} ק"מ</li>
                <li>✓ {gallery.length} תמונות בגלריה · {docs.length} מסמכים</li>
              </ul>
            </div>
          )}

          <div className="flex gap-2 pt-1">
            {step > 0 && <Btn variant="secondary" onClick={() => setStep(step - 1)}>חזרה</Btn>}
            {step < STEPS.length - 1 ? (
              <Btn className="flex-1" disabled={!canContinue} onClick={() => setStep(step + 1)}>המשך</Btn>
            ) : (
              <Btn variant="success" className="flex-1 py-3" disabled={submitting} onClick={() => void submit()}>
                {submitting ? 'שולח…' : 'שליחה לאישור ✓'}
              </Btn>
            )}
          </div>
        </Card>
      </div>
    </div>
  );
}
