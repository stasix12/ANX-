'use client';

import { useRef, useState } from 'react';
import { WhatsAppFallback } from '@/components/WhatsAppFallback';
import { WaLink } from '@/components/hamavrik/CtaLinks';
import { Scene } from '@/components/hamavrik/Illustrations';
import { CameraIcon } from '@/components/hamavrik/icons';
import { CheckIcon, WhatsAppIcon } from '@/components/icons';
import { track } from '@/lib/hamavrik/analytics';
import { business, leads, priceText, quotePriceRow, serviceAreas, services, type Service, type ServiceId } from '@/lib/hamavrik/config';
import { waLink } from '@/lib/hamavrik/links';
import { openWhatsApp } from '@/lib/openExternal';

/** One chosen item: how many, and (for services that have sizes) which size. */
interface Pick {
  qty: number;
  variant: string;
}

const MAX_QTY = 20;

/** "🛋️ ספה 3 מושבים", "🪑 6 כיסאות", "🛏️ מזרן זוגי" — one line of the message. */
function itemLine(service: Service, pick: Pick): string {
  const { emoji, one, many } = service.quote;
  const noun = pick.qty === 1 ? one : `${pick.qty} ${many}`;
  return `${emoji} ${noun}${pick.variant ? ` ${pick.variant}` : ''}`;
}

/**
 * The visitor ticks everything they want cleaned — several items in one
 * order, a quantity for each, and a size where it matters (seats on a sofa,
 * single or double mattress) — and lands in WhatsApp with one tidy message
 * listing all of it. No name or phone field: WhatsApp carries both. When a
 * webhook is configured the same choices are posted there first
 * (fire-and-forget).
 */
export function QuickQuote({
  defaultService = null,
  defaultCity = '',
}: {
  defaultService?: ServiceId | null;
  defaultCity?: string;
}) {
  const options = services.filter((s) => s.featured);
  const [picks, setPicks] = useState<Partial<Record<ServiceId, Pick>>>(
    defaultService ? { [defaultService]: { qty: 1, variant: '' } } : {},
  );
  const [city, setCity] = useState(defaultCity);
  const [error, setError] = useState('');
  const [errorField, setErrorField] = useState<ServiceId | 'items' | null>(null);
  const [blockedHref, setBlockedHref] = useState('');
  const started = useRef(false);

  const chosen = services.filter((s) => picks[s.id]);
  const byId = (id: ServiceId) => services.find((s) => s.id === id)!;

  /*
   * The running total, straight from `priceList` via quotePriceRow, so this
   * line and #prices can never quote different numbers. Items the list has no
   * "from" price for are counted separately rather than silently priced at 0.
   */
  let fromTotal = 0;
  let unpriced = 0;
  for (const s of chosen) {
    const pick = picks[s.id]!;
    const row = quotePriceRow(s.id, pick.variant);
    if (row?.from) fromTotal += row.from * pick.qty;
    else unpriced += 1;
  }

  function start() {
    if (started.current) return;
    started.current = true;
    track('quote_started', { location: 'quick-quote' });
  }

  function clearError() {
    setError('');
    setErrorField(null);
  }

  function toggle(id: ServiceId) {
    start();
    clearError();
    setPicks((prev) => {
      if (prev[id]) {
        const next = { ...prev };
        delete next[id];
        return next;
      }
      return { ...prev, [id]: { qty: 1, variant: '' } };
    });
    if (!picks[id]) track('service_selected', { service: id, location: 'quick-quote' });
  }

  function setQty(id: ServiceId, qty: number) {
    clearError();
    if (qty < 1) {
      setPicks((prev) => {
        const next = { ...prev };
        delete next[id];
        return next;
      });
      return;
    }
    setPicks((prev) => ({ ...prev, [id]: { ...prev[id]!, qty: Math.min(qty, MAX_QTY) } }));
  }

  function setVariant(id: ServiceId, variant: string) {
    clearError();
    setPicks((prev) => ({ ...prev, [id]: { ...prev[id]!, variant } }));
  }

  function submit(event: React.FormEvent) {
    event.preventDefault();
    if (chosen.length === 0) {
      setErrorField('items');
      return setError('בחרו מה לנקות');
    }
    const missingSize = chosen.find((s) => s.quote.variants && !picks[s.id]!.variant);
    if (missingSize) {
      setErrorField(missingSize.id);
      return setError(missingSize.id === 'sofa' ? 'כמה מושבים יש בספה?' : `איזה גודל ${missingSize.quote.one}?`);
    }
    clearError();

    const items = chosen.map((s) => {
      const pick = picks[s.id]!;
      return { service: s.id, label: itemLine(s, pick), qty: pick.qty, variant: pick.variant || null };
    });
    const payload = {
      items,
      city: city.trim(),
      page: typeof window !== 'undefined' ? window.location.href : '',
    };

    track('quote_completed', {
      items: items.map((i) => `${i.service}:${i.qty}`).join(','),
      count: items.length,
      city: payload.city,
    });

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
        `היי 👋 הגעתי דרך האתר של ${business.name}.`,
        'אשמח לקבל הצעת מחיר לניקוי 😊',
        '',
        'בחרתי לנקות:',
        ...items.map((i) => i.label),
        '',
        ...(payload.city ? [`📍 עיר: ${payload.city}`, ''] : []),
        'אשמח לדעת מחיר וזמינות 🙏',
      ].join('\n'),
    );
    openWhatsApp(href, () => setBlockedHref(href));
  }

  const chip = (on: boolean) =>
    `inline-flex min-h-11 items-center rounded-full border-2 px-4 text-sm font-extrabold transition-colors ${
      on ? 'border-brand-500 bg-brand-300/40 text-brand-400' : 'border-ink-800 bg-ink-900 text-mist-300 hover:border-brand-500/40'
    }`;
  const stepBtn =
    'grid h-11 w-11 shrink-0 place-items-center rounded-full border-2 border-ink-800 bg-white text-xl font-black text-brand-400 transition-colors hover:border-brand-500/50 disabled:opacity-40';

  return (
    <div className="relative">
      <span aria-hidden className="shine-glow" />
      <form onSubmit={submit} noValidate className="surface rounded-[1.5rem] p-4 sm:p-7" aria-labelledby="quote-title">
        <fieldset className={errorField === 'items' ? 'shine-field-error' : undefined}>
          <legend className="mb-2.5 text-sm font-extrabold text-mist-300">
            1. מה מנקים?
            <span className="mt-0.5 block text-xs font-medium text-mist-500">אפשר לסמן כמה פריטים</span>
          </legend>
          <ul className="grid grid-cols-3 gap-2 sm:grid-cols-6">
            {options.map((s) => {
              const active = Boolean(picks[s.id]);
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    aria-pressed={active}
                    onClick={() => toggle(s.id)}
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

        {chosen.length > 0 ? (
          <fieldset className="mt-5">
            <legend className="mb-2.5 text-sm font-extrabold text-mist-300">2. כמה, ואיזה גודל?</legend>
            <ul className="grid gap-2">
              {chosen.map((s) => {
                const pick = picks[s.id]!;
                const row = quotePriceRow(s.id, pick.variant);
                return (
                  <li
                    key={s.id}
                    data-item={s.id}
                    className={`rounded-2xl border-2 border-ink-800 bg-white p-3 ${errorField === s.id ? 'shine-field-error' : ''}`}
                  >
                    <div className="flex items-center gap-3">
                      <span className="text-2xl" aria-hidden>
                        {s.quote.emoji}
                      </span>
                      <span className="min-w-0 flex-1">
                        <span className="block font-extrabold">{itemLine(s, pick).replace(`${s.quote.emoji} `, '')}</span>
                        <span className="block text-xs font-bold text-mist-500">
                          {row?.from ? (
                            <>
                              החל מ-<bdi dir="rtl">{priceText(row.from)}</bdi>
                              {pick.qty > 1 ? ' ליחידה' : ''}
                            </>
                          ) : (
                            'לפי הצעת מחיר'
                          )}
                        </span>
                      </span>
                      <div role="group" aria-label={`כמות — ${s.quote.many}`} className="flex items-center gap-1.5">
                        <button type="button" aria-label="פחות" onClick={() => setQty(s.id, pick.qty - 1)} className={stepBtn}>
                          −
                        </button>
                        <span aria-live="polite" className="w-7 text-center text-lg font-black tabular-nums">
                          {pick.qty}
                        </span>
                        <button type="button" aria-label="עוד" disabled={pick.qty >= MAX_QTY} onClick={() => setQty(s.id, pick.qty + 1)} className={stepBtn}>
                          +
                        </button>
                      </div>
                    </div>
                    {s.quote.variants ? (
                      <div role="group" aria-label={`גודל — ${s.quote.one}`} className="mt-3 flex flex-wrap gap-2">
                        {s.quote.variants.map((v) => (
                          <button key={v} type="button" aria-pressed={pick.variant === v} onClick={() => setVariant(s.id, v)} className={chip(pick.variant === v)}>
                            {v}
                          </button>
                        ))}
                      </div>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          </fieldset>
        ) : null}

        <label className="mt-5 block">
          <span className="mb-2.5 block text-sm font-extrabold text-mist-300">
            {chosen.length > 0 ? '3' : '2'}. באיזו עיר? <span className="font-medium text-mist-500">(לא חובה)</span>
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

        {chosen.length > 0 ? (
          <p className="mt-5 rounded-xl bg-brand-300/40 px-4 py-3 text-[15px] font-extrabold text-brand-400">
            {fromTotal > 0 ? (
              <>
                סה״כ החל מ-<bdi dir="rtl">{priceText(fromTotal)}</bdi>
                {unpriced > 0 ? <span className="font-bold"> + {unpriced === 1 ? 'פריט אחד' : `${unpriced} פריטים`} לפי הצעת מחיר</span> : null}
                <span className="mt-0.5 block text-[13px] font-bold text-mist-300">המחיר הסופי נקבע לפי התמונה.</span>
              </>
            ) : (
              <>
                לפי הצעת מחיר
                <span className="mt-0.5 block text-[13px] font-bold text-mist-300">שלחו תמונה ונחזור עם מספר.</span>
              </>
            )}
          </p>
        ) : null}

        {error ? (
          <p role="alert" className="mt-3 text-sm font-bold text-red-600">
            {error}
          </p>
        ) : null}

        <div className="mt-5 grid gap-2.5 sm:grid-cols-[1.2fr_1fr]">
          <button
            type="submit"
            className="shine-shimmer inline-flex items-center justify-center gap-2.5 rounded-full bg-wa-600 px-6 py-3.5 text-lg font-extrabold text-white shadow-lg shadow-wa-600/30 transition-colors hover:bg-wa-500"
          >
            <WhatsAppIcon className="h-6 w-6" />
            שלחו ב-WhatsApp
          </button>
          <WaLink
            href={waLink()}
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
            kind="message"
            message={new URL(blockedHref).searchParams.get('text') ?? ''}
            href={blockedHref}
            onClose={() => setBlockedHref('')}
          />
        ) : null}
      </form>
    </div>
  );
}
