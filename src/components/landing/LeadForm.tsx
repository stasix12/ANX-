'use client';

import { useState } from 'react';
import { WhatsAppFallback } from '@/components/WhatsAppFallback';
import { WhatsAppIcon } from '@/components/icons';
import { openWhatsApp } from '@/lib/openExternal';
import { whatsappLink } from '@/lib/site';

const SERVICES = [
  'ניקוי ספה',
  'ניקוי פינת אוכל / כיסאות',
  'ניקוי מזרן',
  'ניקוי שטיח',
  'ריפודי רכב',
  'משהו אחר',
] as const;

/* Sofa size drives the price, so asking it up front saves the first
   back-and-forth in the chat — the quote arrives one message sooner. */
const SOFA_SIZES = [
  'דו-מושבית',
  'תלת-מושבית',
  '4 מושבים ומעלה',
  'ספה פינתית',
  'לא בטוח/ה — אשלח תמונה',
] as const;

/** Accepts 05X-XXXXXXX and landlines, with or without separators. */
function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return /^0\d{8,9}$/.test(digits);
}

/**
 * The landing page's lead form. There is no backend on purpose: the submit
 * composes a WhatsApp message with everything already filled in, so the lead
 * lands in the same inbox every other button on the site feeds, and the
 * business answers from the phone. The visitor gets an instant, human channel
 * instead of a "we got your details" dead end — which is also what converts
 * best with an Israeli audience.
 */
export function LeadForm({ compact = false }: { compact?: boolean }) {
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [service, setService] = useState<string>(SERVICES[0]);
  const [sofaSize, setSofaSize] = useState<string>(SOFA_SIZES[1]);
  const [error, setError] = useState('');
  const [blockedHref, setBlockedHref] = useState('');

  function submit(event: React.FormEvent) {
    event.preventDefault();

    if (!name.trim()) {
      setError('איך קוראים לכם?');
      return;
    }
    if (!isValidPhone(phone)) {
      setError('מספר הטלפון לא נראה תקין — בדקו אותו שוב');
      return;
    }
    setError('');

    const isSofa = service === 'ניקוי ספה';
    const href = whatsappLink(
      [
        'היי, הגעתי מדף המבצע ואשמח להצעת מחיר 🙂',
        `שם: ${name.trim()}`,
        `טלפון: ${phone.trim()}`,
        `שירות: ${service}`,
        ...(isSofa ? [`גודל הספה: ${sofaSize}`] : []),
      ].join('\n'),
    );
    openWhatsApp(href, () => setBlockedHref(href));
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-3">
      <div className={compact ? 'grid gap-3 sm:grid-cols-2' : 'space-y-3'}>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-mist-300">שם מלא</span>
          <input
            type="text"
            name="name"
            autoComplete="name"
            value={name}
            onChange={(e) => setName(e.target.value)}
            placeholder="לדוגמה: דנה לוי"
            className="w-full rounded-xl border border-ink-600 bg-ink-850 px-4 py-3 text-base text-mist-100 placeholder:text-mist-500 focus:border-brand-500"
          />
        </label>

        <label className="block">
          <span className="mb-1 block text-sm font-bold text-mist-300">טלפון</span>
          <input
            type="tel"
            name="phone"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="050-0000000"
            className="w-full rounded-xl border border-ink-600 bg-ink-850 px-4 py-3 text-end text-base text-mist-100 placeholder:text-mist-500 focus:border-brand-500"
          />
        </label>
      </div>

      <div className={service === 'ניקוי ספה' ? 'grid gap-3 sm:grid-cols-2' : ''}>
        <label className="block">
          <span className="mb-1 block text-sm font-bold text-mist-300">מה מנקים?</span>
          <select
            name="service"
            value={service}
            onChange={(e) => setService(e.target.value)}
            className="w-full appearance-none rounded-xl border border-ink-600 bg-ink-850 px-4 py-3 text-base text-mist-100 focus:border-brand-500"
          >
            {SERVICES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>

        {service === 'ניקוי ספה' ? (
          <label className="block">
            <span className="mb-1 block text-sm font-bold text-mist-300">גודל הספה</span>
            <select
              name="sofaSize"
              value={sofaSize}
              onChange={(e) => setSofaSize(e.target.value)}
              className="w-full appearance-none rounded-xl border border-ink-600 bg-ink-850 px-4 py-3 text-base text-mist-100 focus:border-brand-500"
            >
              {SOFA_SIZES.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </div>

      {error ? (
        <p role="alert" className="text-sm font-bold text-red-600">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        className="flex w-full items-center justify-center gap-2 rounded-xl bg-emerald-500 px-6 py-4 text-lg font-extrabold text-white shadow-lg shadow-emerald-500/25 transition hover:bg-emerald-600 active:scale-[0.98]"
      >
        <WhatsAppIcon className="h-6 w-6" />
        קבלו הצעת מחיר בוואטסאפ
      </button>

      <p className="text-center text-xs text-mist-500">
        ללא התחייבות · מענה תוך דקות בשעות הפעילות
      </p>

      {blockedHref ? (
        <WhatsAppFallback
          message={new URL(blockedHref).searchParams.get('text') ?? ''}
          href={blockedHref}
          onClose={() => setBlockedHref('')}
        />
      ) : null}
    </form>
  );
}
