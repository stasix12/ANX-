'use client';

import { useState } from 'react';
import { WhatsAppFallback } from '@/components/WhatsAppFallback';
import { WaLink } from '@/components/hamavrik/CtaLinks';
import { Scene } from '@/components/hamavrik/Illustrations';
import { CameraIcon } from '@/components/hamavrik/icons';
import { CheckIcon, WhatsAppIcon } from '@/components/icons';
import { track } from '@/lib/hamavrik/analytics';
import { business, leads, serviceAreas, services, type ServiceId } from '@/lib/hamavrik/config';
import { waLink, waLinkFor } from '@/lib/hamavrik/links';
import { openWhatsApp } from '@/lib/openExternal';

/** Accepts 05X-XXXXXXX and landlines, with or without separators. */
function isValidPhone(raw: string): boolean {
  const digits = raw.replace(/\D/g, '');
  return /^0\d{8,9}$/.test(digits);
}

/**
 * The quick-quote block right after the hero. Pick what to clean, leave
 * name / phone / city, and the lead lands in WhatsApp already filled in —
 * the same inbox every other button feeds, answered from the phone. When a
 * webhook is configured it is also posted there first (fire-and-forget).
 */
export function QuickQuote({
  defaultService = null,
  defaultCity = '',
}: {
  defaultService?: ServiceId | null;
  defaultCity?: string;
}) {
  const options = services.filter((s) => s.featured);
  const [service, setService] = useState<ServiceId | null>(defaultService);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [city, setCity] = useState(defaultCity);
  const [error, setError] = useState('');
  const [blockedHref, setBlockedHref] = useState('');
  const [sent, setSent] = useState(false);

  function choose(id: ServiceId) {
    setService(id);
    setError('');
    track('service_click', { service: id, location: 'quick-quote' });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!service) return setError('בחרו מה לנקות');
    if (!name.trim()) return setError('איך קוראים לכם?');
    if (!isValidPhone(phone)) return setError('מספר הטלפון לא נראה תקין — בדקו אותו שוב');
    setError('');

    const serviceName = services.find((s) => s.id === service)?.name ?? service;
    const payload = {
      name: name.trim(),
      phone: phone.trim(),
      city: city.trim(),
      service: serviceName,
      page: typeof window !== 'undefined' ? window.location.href : '',
    };

    track('quote_form_submit', { service, city: payload.city });

    if (leads.webhookUrl) {
      fetch(leads.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        /* the WhatsApp hand-off below is the primary channel */
      });
    }

    const href = waLink(
      [
        business.whatsappGreeting,
        `שירות: ${serviceName}`,
        `שם: ${payload.name}`,
        `טלפון: ${payload.phone}`,
        ...(payload.city ? [`עיר: ${payload.city}`] : []),
      ].join('\n'),
    );
    setSent(true);
    openWhatsApp(href, () => setBlockedHref(href));
  }

  const inputCls =
    'w-full rounded-xl border border-ink-600 bg-white px-4 py-3.5 text-base text-mist-100 placeholder:text-mist-500 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15';

  return (
    <div className="relative">
      <span aria-hidden className="shine-glow" />
      <form
        onSubmit={submit}
        noValidate
        className="surface rounded-[1.75rem] p-5 sm:p-8"
        aria-labelledby="quote-title"
      >
        <fieldset>
          <legend className="mb-3 text-sm font-extrabold text-mist-300">1. מה מנקים?</legend>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {options.map((s) => {
              const active = service === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => choose(s.id)}
                    className={`group flex w-full flex-col items-center gap-1.5 rounded-2xl border-2 p-2.5 text-sm font-extrabold transition-all ${
                      active
                        ? 'border-brand-500 bg-brand-300/40 text-brand-400 shadow-md shadow-brand-500/15'
                        : 'border-ink-800 bg-ink-900 text-mist-300 hover:border-brand-500/40 hover:bg-white'
                    }`}
                  >
                    <span className="relative h-12 w-full overflow-hidden rounded-xl">
                      <Scene kind={s.scene} variant="after" className="h-full w-full" />
                      {active ? (
                        <span className="absolute end-1 top-1 grid h-5 w-5 place-items-center rounded-full bg-brand-500 text-white">
                          <CheckIcon className="h-3 w-3" />
                        </span>
                      ) : null}
                    </span>
                    {s.label}
                  </button>
                </li>
              );
            })}
          </ul>
        </fieldset>

        <fieldset className="mt-6">
          <legend className="mb-3 text-sm font-extrabold text-mist-300">2. איך נחזור אליכם?</legend>
          <div className="grid gap-3 sm:grid-cols-3">
            <label className="block">
              <span className="sr-only">שם</span>
              <input
                type="text"
                name="name"
                autoComplete="name"
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="שם"
                className={inputCls}
              />
            </label>
            <label className="block">
              <span className="sr-only">טלפון</span>
              <input
                type="tel"
                name="phone"
                inputMode="tel"
                autoComplete="tel"
                dir="ltr"
                value={phone}
                onChange={(e) => setPhone(e.target.value)}
                placeholder="טלפון"
                className={`${inputCls} text-end`}
              />
            </label>
            <label className="block">
              <span className="sr-only">עיר</span>
              <input
                type="text"
                name="city"
                autoComplete="address-level2"
                list="quote-cities"
                value={city}
                onChange={(e) => setCity(e.target.value)}
                placeholder="עיר"
                className={inputCls}
              />
              <datalist id="quote-cities">
                {[...serviceAreas.primary, ...serviceAreas.nearby].map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </label>
          </div>
        </fieldset>

        {error ? (
          <p role="alert" className="mt-3 text-sm font-bold text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid gap-3 sm:grid-cols-[1.2fr_1fr]">
          <button
            type="submit"
            className="shine-shimmer inline-flex items-center justify-center gap-2.5 rounded-full bg-wa-500 px-6 py-4 text-lg font-extrabold text-white shadow-lg shadow-wa-500/30 transition-colors hover:bg-wa-600"
          >
            <WhatsAppIcon className="h-6 w-6" />
            {sent ? 'נפתח ב-WhatsApp… לחצו שוב אם לא נפתח' : 'קבלו הצעת מחיר'}
          </button>
          <WaLink
            href={waLinkFor('מצרפ/ת תמונה 📷')}
            location="quick-quote-photo"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-4 text-base font-extrabold text-brand-400 ring-2 ring-brand-500/25 transition hover:ring-brand-500/50"
          >
            <CameraIcon className="h-5 w-5" />
            שלחו תמונה ב-WhatsApp
          </WaLink>
        </div>
        <p className="mt-3 text-center text-xs text-mist-500">
          ללא התחייבות · {business.responseNote} · הפרטים נשלחים ישירות אלינו ב-WhatsApp
        </p>

        {blockedHref ? (
          <WhatsAppFallback
            message={new URL(blockedHref).searchParams.get('text') ?? ''}
            href={blockedHref}
            onClose={() => setBlockedHref('')}
          />
        ) : null}
      </form>
    </div>
  );
}
