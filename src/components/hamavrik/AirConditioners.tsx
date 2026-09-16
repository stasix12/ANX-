'use client';

import { useState } from 'react';
import { WhatsAppFallback } from '@/components/WhatsAppFallback';
import { Reveal } from '@/components/hamavrik/Reveal';
import { SectionHeading } from '@/components/hamavrik/Section';
import { WhatsAppIcon } from '@/components/icons';
import { track } from '@/lib/hamavrik/analytics';
import { acCleaning, business, priceText } from '@/lib/hamavrik/config';
import { waLink } from '@/lib/hamavrik/links';
import { openWhatsApp } from '@/lib/openExternal';

/** "מזגן אחד", "2 מזגנים" – the line that goes into the WhatsApp message. */
function unitsLine(qty: number): string {
  return `${acCleaning.emoji} ${qty === 1 ? `${acCleaning.one} אחד` : `${qty} ${acCleaning.many}`}`;
}

/**
 * The air-conditioner offer: a counter, the price when there is one to show
 * (from `bulkMin` units up), and one green button that lands in WhatsApp
 * with the count already written. Deliberately separate from the upholstery
 * quote form – a different job, a different price logic.
 */
export function AirConditioners() {
  const [qty, setQty] = useState<number>(acCleaning.bulkMin);
  const [blockedHref, setBlockedHref] = useState('');
  const bulk = qty >= acCleaning.bulkMin;

  function change(next: number) {
    setQty(Math.max(1, Math.min(acCleaning.maxQty, next)));
  }

  function send() {
    track('quote_completed', { items: `ac:${qty}`, count: 1, city: '', location: 'air-conditioners' });
    const href = waLink(
      [
        `היי 👋 הגעתי דרך האתר של ${business.name}.`,
        'אשמח לקבל הצעת מחיר לניקוי מזגנים 😊',
        '',
        unitsLine(qty),
        '',
        'אשמח לדעת מחיר וזמינות 🙏',
      ].join('\n'),
    );
    openWhatsApp(href, () => setBlockedHref(href));
  }

  const stepBtn =
    'grid h-12 w-12 shrink-0 place-items-center rounded-full border-2 border-ink-800 bg-white text-2xl font-black text-brand-400 transition-colors hover:border-brand-500/50 disabled:opacity-40';

  return (
    <>
      <SectionHeading
        eyebrow="שירות נוסף"
        title="ניקוי מזגנים – עד הבית"
        titleId="ac-title"
        light
        lede={
          <>
            {acCleaning.lede} החל מ-<bdi dir="rtl">{priceText(acCleaning.bulkFrom)}</bdi> למזגן בהזמנת {acCleaning.bulkMin} מזגנים ומעלה.
          </>
        }
      />

      <Reveal delay={60}>
        <div className="relative mx-auto max-w-xl">
          <span aria-hidden className="shine-glow" />
          <div className="surface rounded-[1.5rem] p-4 sm:p-7" role="group" aria-labelledby="ac-title">
            <div className="flex items-center justify-between gap-3">
              <span className="min-w-0">
                <span className="block text-sm font-extrabold text-mist-300">כמה מזגנים לנקות?</span>
                <span className="mt-0.5 block text-xs font-medium text-mist-500">מ-{acCleaning.bulkMin} מזגנים המחיר יורד</span>
              </span>
              <div role="group" aria-label="כמות מזגנים" className="flex items-center gap-2">
                <button type="button" aria-label="פחות" disabled={qty <= 1} onClick={() => change(qty - 1)} className={stepBtn}>
                  −
                </button>
                <span aria-live="polite" className="w-8 text-center text-2xl font-black tabular-nums">
                  {qty}
                </span>
                <button type="button" aria-label="עוד" disabled={qty >= acCleaning.maxQty} onClick={() => change(qty + 1)} className={stepBtn}>
                  +
                </button>
              </div>
            </div>

            {/* The price line shows a number only where the owner set one. */}
            <div className="mt-4 rounded-2xl bg-brand-300/40 p-4">
              <p className="text-[15px] font-extrabold text-mist-100">{unitsLine(qty)}</p>
              {bulk ? (
                <p className="mt-1.5 text-[15px] font-extrabold text-brand-400">
                  סה״כ החל מ-<bdi dir="rtl">{priceText(acCleaning.bulkFrom * qty)}</bdi>
                  <span className="mt-0.5 block text-[13px] font-bold text-mist-300">
                    <bdi dir="rtl">{priceText(acCleaning.bulkFrom)}</bdi> למזגן
                  </span>
                </p>
              ) : (
                <p className="mt-1.5 text-[13px] font-bold text-mist-300">
                  מחיר ל{qty === 1 ? 'מזגן אחד' : `-${qty} מזגנים`} – לפי הצעת מחיר ב‑WhatsApp. החל מ-
                  <bdi dir="rtl">{priceText(acCleaning.bulkFrom)}</bdi> למזגן מ-{acCleaning.bulkMin} מזגנים ומעלה.
                </p>
              )}
            </div>

            <button
              type="button"
              onClick={send}
              className="shine-shimmer mt-4 inline-flex w-full items-center justify-center gap-2.5 whitespace-nowrap rounded-full bg-wa-600 px-5 py-4 text-base font-extrabold text-white shadow-lg shadow-wa-600/30 transition-colors hover:bg-wa-500 sm:text-lg"
            >
              <WhatsAppIcon className="h-6 w-6 shrink-0" />
              שלחו לקבלת מחיר ב‑WhatsApp
            </button>
          </div>
        </div>
      </Reveal>

      {blockedHref ? (
        <WhatsAppFallback kind="message" message={new URL(blockedHref).searchParams.get('text') ?? ''} href={blockedHref} onClose={() => setBlockedHref('')} />
      ) : null}
    </>
  );
}
