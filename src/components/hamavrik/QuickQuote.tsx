'use client';

import { useRef, useState } from 'react';
import { WhatsAppFallback } from '@/components/WhatsAppFallback';
import { WaLink } from '@/components/hamavrik/CtaLinks';
import { Scene } from '@/components/hamavrik/Illustrations';
import { CameraIcon } from '@/components/hamavrik/icons';
import { CheckIcon, WhatsAppIcon } from '@/components/icons';
import { track } from '@/lib/hamavrik/analytics';
import { business, leads, serviceAreas, services, type ServiceId } from '@/lib/hamavrik/config';
import { waLink, waLinkFor } from '@/lib/hamavrik/links';
import { openWhatsApp } from '@/lib/openExternal';

const SEATS = ['2 מושבים', '3 מושבים', '4 מושבים', 'ספה פינתית', 'אחר'] as const;

/**
 * Three quick taps and the visitor lands in WhatsApp with a message that
 * already says what to clean, how big it is, whether there are stains and
 * where — so the first reply from the business can be the price. No name or
 * phone field: WhatsApp carries both. When a webhook is configured the same
 * choices are posted there first (fire-and-forget).
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
  const [seats, setSeats] = useState<string>('');
  const [stains, setStains] = useState<'yes' | 'no' | ''>('');
  const [city, setCity] = useState(defaultCity);
  const [error, setError] = useState('');
  const [blockedHref, setBlockedHref] = useState('');
  const started = useRef(false);

  function start() {
    if (started.current) return;
    started.current = true;
    track('quote_started', { location: 'quick-quote' });
  }

  function choose(id: ServiceId) {
    start();
    setService(id);
    if (id !== 'sofa') setSeats('');
    setError('');
    track('service_selected', { service: id, location: 'quick-quote' });
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (!service) return setError('בחרו מה לנקות');
    if (service === 'sofa' && !seats) return setError('כמה מושבים יש בספה?');
    if (!stains) return setError('יש כתמים מיוחדים?');
    setError('');

    const serviceName = services.find((s) => s.id === service)?.name ?? service;
    const kind = service === 'sofa' && seats ? seats : services.find((s) => s.id === service)?.label ?? service;
    const payload = {
      service: serviceName,
      seats: service === 'sofa' ? seats : null,
      stains: stains === 'yes',
      city: city.trim(),
      page: typeof window !== 'undefined' ? window.location.href : '',
    };

    track('quote_completed', { service, seats: payload.seats ?? undefined, stains: payload.stains, city: payload.city });

    if (leads.webhookUrl) {
      fetch(leads.webhookUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
        keepalive: true,
      }).catch(() => {
        /* WhatsApp is the primary channel; the webhook is a bonus */
      });
    }

    const href = waLink(
      [
        `היי, אשמח להצעת מחיר ל${serviceName}.`,
        `סוג: ${kind}`,
        `כתמים: ${stains === 'yes' ? 'כן' : 'לא'}`,
        ...(payload.city ? [`עיר: ${payload.city}`] : []),
      ].join('\n'),
    );
    openWhatsApp(href, () => setBlockedHref(href));
  }

  const chip = (on: boolean) =>
    `rounded-full border-2 px-4 py-2 text-sm font-extrabold transition-colors ${
      on ? 'border-brand-500 bg-brand-300/40 text-brand-400' : 'border-ink-800 bg-ink-900 text-mist-300 hover:border-brand-500/40'
    }`;

  return (
    <div className="relative">
      <span aria-hidden className="shine-glow" />
      <form onSubmit={submit} noValidate className="surface rounded-[1.5rem] p-4 sm:p-7" aria-labelledby="quote-title">
        <fieldset>
          <legend className="mb-2.5 text-sm font-extrabold text-mist-300">1. מה מנקים?</legend>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {options.map((s) => {
              const active = service === s.id;
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => choose(s.id)}
                    className={`flex w-full flex-col items-center gap-1 rounded-2xl border-2 p-2 text-[13px] font-extrabold transition-colors ${
                      active
                        ? 'border-brand-500 bg-brand-300/40 text-brand-400'
                        : 'border-ink-800 bg-ink-900 text-mist-300 hover:border-brand-500/40 hover:bg-white'
                    }`}
                  >
                    <span className="relative h-10 w-full overflow-hidden rounded-xl">
                      <Scene kind={s.scene} variant="after" className="h-full w-full" />
                      {active ? (
                        <span className="absolute end-1 top-1 grid h-4.5 w-4.5 place-items-center rounded-full bg-brand-500 text-white">
                          <CheckIcon className="h-2.5 w-2.5" />
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

        {service === 'sofa' ? (
          <fieldset className="mt-5">
            <legend className="mb-2.5 text-sm font-extrabold text-mist-300">2. כמה מושבים?</legend>
            <div role="group" className="flex flex-wrap gap-2">
              {SEATS.map((s) => (
                <button key={s} type="button" aria-pressed={seats === s} onClick={() => setSeats(s)} className={chip(seats === s)}>
                  {s}
                </button>
              ))}
            </div>
          </fieldset>
        ) : null}

        <fieldset className="mt-5">
          <legend className="mb-2.5 text-sm font-extrabold text-mist-300">
            {service === 'sofa' ? '3' : '2'}. האם יש כתמים מיוחדים?
          </legend>
          <div role="group" className="flex gap-2">
            <button type="button" aria-pressed={stains === 'yes'} onClick={() => { start(); setStains('yes'); }} className={chip(stains === 'yes')}>
              כן
            </button>
            <button type="button" aria-pressed={stains === 'no'} onClick={() => { start(); setStains('no'); }} className={chip(stains === 'no')}>
              לא
            </button>
          </div>
        </fieldset>

        <label className="mt-5 block">
          <span className="mb-2.5 block text-sm font-extrabold text-mist-300">
            {service === 'sofa' ? '4' : '3'}. באיזו עיר? <span className="font-medium text-mist-500">(לא חובה)</span>
          </span>
          <input
            id="quote-city"
            type="text"
            name="city"
            autoComplete="address-level2"
            list="quote-cities"
            value={city}
            onFocus={start}
            onChange={(e) => setCity(e.target.value)}
            placeholder="למשל: באר שבע"
            className="w-full rounded-xl border border-ink-600 bg-white px-4 py-3 text-base text-mist-100 placeholder:text-mist-500 focus:border-brand-500 focus:outline-none focus:ring-4 focus:ring-brand-500/15 sm:max-w-xs"
          />
          <datalist id="quote-cities">
            {[...serviceAreas.primary, ...serviceAreas.nearby].map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
        </label>

        {error ? (
          <p role="alert" className="mt-3 text-sm font-bold text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid gap-2.5 sm:grid-cols-[1.2fr_1fr]">
          <button
            type="submit"
            className="shine-shimmer inline-flex items-center justify-center gap-2.5 rounded-full bg-wa-500 px-6 py-3.5 text-lg font-extrabold text-white shadow-lg shadow-wa-500/30 transition-colors hover:bg-wa-600"
          >
            <WhatsAppIcon className="h-6 w-6" />
            קבלו הצעת מחיר ב-WhatsApp
          </button>
          <WaLink
            href={waLinkFor('מצרפ/ת תמונה 📷')}
            location="quick-quote-photo"
            className="inline-flex items-center justify-center gap-2 rounded-full bg-white px-6 py-3.5 text-base font-extrabold text-brand-400 ring-2 ring-brand-500/25 transition hover:ring-brand-500/50"
          >
            <CameraIcon className="h-5 w-5" />
            או פשוט שלחו תמונה
          </WaLink>
        </div>
        <p className="mt-3 text-center text-xs text-mist-500">ללא התחייבות · {business.responseNote}</p>

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
