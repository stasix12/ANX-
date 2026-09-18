'use client';

import Link from 'next/link';
import { useState } from 'react';
import { btnPrimary, inputClass } from '@/components/platform/ui';
import { CATEGORIES, CITIES } from '@/lib/platform/catalog';
import { actions } from '@/lib/platform/store';
import type { Professional } from '@/lib/platform/types';
import { friendlyMessage } from '@/lib/social/errors';

/** Recruitment landing + onboarding. New accounts await admin approval. */

const BENEFITS = [
  ['🎯', 'עבודות סגורות בלבד', 'לא לידים. לקוח, מחיר, כתובת ומועד — סגורים מראש.'],
  ['📣', 'אפס פרסום', 'אנחנו מביאים את הלקוחות. אתה רק מבצע.'],
  ['👀', 'שקיפות מלאה', 'רואים את כל פרטי העבודה לפני שמחליטים לקחת.'],
  ['🕐', 'חופש מלא', 'זמין כשנוח לך — כפתור אחד ואתה מקבל עבודות.'],
  ['💰', 'בלי תשלום על מתעניינים', 'משלמים רק על עבודה שלקחת בפועל.'],
] as const;

export default function JoinPage() {
  const [showForm, setShowForm] = useState(false);
  const [done, setDone] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [form, setForm] = useState({
    name: '',
    phone: '',
    businessName: '',
    businessType: 'exempt' as Professional['businessType'],
    city: '',
    areas: [] as string[],
    radiusKm: 25,
    hasCar: true,
    services: [] as string[],
    languages: ['עברית'],
    yearsExperience: 1,
  });

  const canSubmit =
    form.name.trim().length >= 2 &&
    form.phone.replace(/\D/g, '').length >= 9 &&
    form.city !== '' &&
    form.services.length > 0;

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await actions.registerPro(form);
      setDone(true);
    } catch (e) {
      setError(friendlyMessage(e, 'ההרשמה נכשלה'));
    } finally {
      setBusy(false);
    }
  }

  if (done) {
    return (
      <div className="crm-page mx-auto max-w-md px-4 py-16 text-center">
        <div className="text-5xl">🎉</div>
        <h1 className="mt-4 text-2xl font-black text-mist-100">הבקשה נשלחה!</h1>
        <p className="mt-2 text-mist-300">
          הצוות שלנו יבדוק את הפרטים ויאשר את החשבון — נחזור אליך תוך יום עסקים.
        </p>
        <Link href="/pro" className={`${btnPrimary} mt-8`}>
          לאפליקציית בעלי המקצוע
        </Link>
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-md px-4 pb-16">
      <header className="flex items-center justify-between py-5">
        <div className="text-lg font-black text-brand-400">✨ קלין ישראל Pro</div>
        <Link href="/pro" className="text-sm font-bold text-mist-500">
          כבר רשום? כניסה
        </Link>
      </header>

      {!showForm ? (
        <>
          <section className="animate-rise pt-4 text-center">
            <h1 className="text-3xl font-black leading-tight text-mist-100">
              הצטרפו לרשת בעלי המקצוע
              <span className="text-brand-500"> וקבלו עבודות סגורות</span> באזור שלכם
            </h1>
            <p className="mt-3 text-mist-300">
              אנחנו סוגרים את הלקוח, המחיר והמועד — אתם מבצעים ומרוויחים.
            </p>
          </section>

          <section className="mt-8 space-y-3">
            {BENEFITS.map(([emoji, title, body]) => (
              <div key={title} className="surface flex items-start gap-3 rounded-card p-4">
                <span className="text-2xl">{emoji}</span>
                <div>
                  <div className="font-bold text-mist-100">{title}</div>
                  <div className="text-sm text-mist-300">{body}</div>
                </div>
              </div>
            ))}
          </section>

          <div className="surface mt-6 rounded-card p-4 text-center text-sm text-mist-300">
            💬 “קיבלתי החודש 23 עבודות בלי שקל על פרסום” — <b>אבי, באר שבע</b>
          </div>

          <button type="button" onClick={() => setShowForm(true)} className={`${btnPrimary} mt-8 w-full py-4 text-lg`}>
            הצטרף כבעל מקצוע ←
          </button>
        </>
      ) : (
        <div className="crm-page">
          <h1 className="text-2xl font-black text-mist-100">פרטי הצטרפות</h1>
          <div className="mt-4 space-y-3">
            <input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} placeholder="שם מלא" className={inputClass} />
            <input value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} placeholder="טלפון נייד" type="tel" dir="ltr" className={`${inputClass} text-right`} />
            <input value={form.businessName} onChange={(e) => setForm({ ...form, businessName: e.target.value })} placeholder="שם העסק" className={inputClass} />
            <select
              value={form.businessType}
              onChange={(e) => setForm({ ...form, businessType: e.target.value as Professional['businessType'] })}
              className={inputClass}
            >
              <option value="exempt">עוסק פטור</option>
              <option value="licensed">עוסק מורשה</option>
              <option value="company">חברה בע״מ</option>
            </select>
            <select value={form.city} onChange={(e) => setForm({ ...form, city: e.target.value })} className={inputClass}>
              <option value="">עיר מגורים…</option>
              {CITIES.map((c) => (
                <option key={c.id} value={c.id}>
                  {c.name}
                </option>
              ))}
            </select>

            <div>
              <div className="mb-1.5 text-sm font-bold text-mist-300">אזורי פעילות נוספים</div>
              <div className="flex flex-wrap gap-1.5">
                {CITIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={form.areas.includes(c.id)}
                    onClick={() =>
                      setForm({
                        ...form,
                        areas: form.areas.includes(c.id) ? form.areas.filter((x) => x !== c.id) : [...form.areas, c.id],
                      })
                    }
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      form.areas.includes(c.id) ? 'bg-brand-500 text-on-brand' : 'bg-ink-800 text-mist-100'
                    }`}
                  >
                    {c.name}
                  </button>
                ))}
              </div>
            </div>

            <label className="block">
              <span className="text-sm font-bold text-mist-300">רדיוס נסיעה: {form.radiusKm} ק״מ</span>
              <input
                type="range"
                min={5}
                max={60}
                step={5}
                value={form.radiusKm}
                onChange={(e) => setForm({ ...form, radiusKm: Number(e.target.value) })}
                className="mt-1 w-full accent-brand-500"
              />
            </label>

            <div>
              <div className="mb-1.5 text-sm font-bold text-mist-300">שירותים שאתה מבצע</div>
              <div className="flex flex-wrap gap-1.5">
                {CATEGORIES.map((c) => (
                  <button
                    key={c.id}
                    type="button"
                    aria-pressed={form.services.includes(c.id)}
                    onClick={() =>
                      setForm({
                        ...form,
                        services: form.services.includes(c.id)
                          ? form.services.filter((x) => x !== c.id)
                          : [...form.services, c.id],
                      })
                    }
                    className={`rounded-full px-3 py-1.5 text-xs font-bold ${
                      form.services.includes(c.id) ? 'bg-brand-500 text-on-brand' : 'bg-ink-800 text-mist-100'
                    }`}
                  >
                    {c.emoji} {c.name}
                  </button>
                ))}
              </div>
            </div>

            <label className="flex items-center gap-3 rounded-xl bg-ink-800 px-4 py-3">
              <input
                type="checkbox"
                checked={form.hasCar}
                onChange={(e) => setForm({ ...form, hasCar: e.target.checked })}
                className="h-5 w-5 accent-brand-500"
              />
              <span className="text-sm font-bold text-mist-100">יש לי רכב 🚗</span>
            </label>

            <label className="block">
              <span className="text-sm font-bold text-mist-300">שנות ניסיון: {form.yearsExperience}</span>
              <input
                type="range"
                min={0}
                max={20}
                value={form.yearsExperience}
                onChange={(e) => setForm({ ...form, yearsExperience: Number(e.target.value) })}
                className="mt-1 w-full accent-brand-500"
              />
            </label>
          </div>

          {error && <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-700">{error}</p>}

          <button type="button" disabled={!canSubmit || busy} onClick={submit} className={`${btnPrimary} mt-6 w-full py-4`}>
            {busy ? 'שולח…' : 'שליחת בקשת הצטרפות'}
          </button>
          <p className="mt-2 text-center text-xs text-mist-500">החשבון ייפתח לאחר אישור צוות קלין ישראל</p>
        </div>
      )}
    </div>
  );
}
