import Image from 'next/image';
import type { ReactNode } from 'react';
import { PhoneButton, WaButton } from '@/components/hamavrik/CtaLinks';
import { HeroVideo } from '@/components/hamavrik/HeroVideo';
import { CheckIcon } from '@/components/icons';
import { business, heroMedia, priceList, priceText, serviceAreas } from '@/lib/hamavrik/config';
import { waAsk, waLink } from '@/lib/hamavrik/links';

const TRUST = ['מגיעים עד הבית', 'מחיר סופי ידוע מראש', 'מתייבש תוך מספר שעות'];

/**
 * The first screen, sized so one phone screen answers the four questions a
 * Google Ads visitor has: what (sofa cleaning at home), where (Beer Sheva
 * and the south), how much (from 299 ₪) and how to order (send a photo on
 * WhatsApp). Three trust points, two buttons, nothing else above the fold.
 */
export function Hero({
  title = (
    <>
      ניקוי ספות מקצועי{' '}
      <span className="block text-aqua-300">ב{serviceAreaShort()} – עד הבית</span>
    </>
  ),
  subtitle = 'מסירים כתמים, לכלוך וריחות מעומק הבד – ולא רק מפני השטח. שלחו לנו תמונה של הספה ב‑WhatsApp וקבלו הצעת מחיר.',
  kicker,
  waMessage = waAsk(),
  priceFrom = priceList[0]?.from ?? null,
  priceUnit,
  priceLabel = 'ניקוי ספה',
}: {
  title?: ReactNode;
  /** A second headline line OUTSIDE the H1 (same size, aqua) – a landing
   *  page keeps its H1 to the exact phrase people search for. */
  kicker?: string;
  subtitle?: string;
  /** The prepared WhatsApp message – narrowed to the service and city on a
   *  landing page, so the first line the business reads already says both. */
  waMessage?: string;
  priceFrom?: number | null;
  /** 'למ״ר' / 'לכיסא' – shown after the price when it is not per item. */
  priceUnit?: string;
  priceLabel?: string;
}) {
  return (
    <section className="shine-hero relative overflow-hidden">
      <div className="relative mx-auto grid max-w-6xl items-center gap-8 px-4 pb-10 pt-8 sm:px-6 sm:pt-12 lg:grid-cols-[1.1fr_0.9fr] lg:gap-12 lg:pb-16 lg:pt-16">
        <div className="min-w-0 shine-rise">
          <h1 className="text-[2.1rem] font-black leading-[1.1] text-balance-he sm:text-5xl lg:text-[3.4rem]">{title}</h1>
          {kicker ? (
            <p className="text-[2.1rem] font-black leading-[1.1] text-aqua-300 text-balance-he sm:text-5xl lg:text-[3.4rem]">{kicker}</p>
          ) : null}

          {priceFrom ? (
            <p className="mt-4 inline-flex items-baseline gap-2 rounded-2xl bg-white px-4 py-2 text-mist-100 shadow-lg">
              <span className="text-sm font-bold text-mist-500">{priceLabel}</span>
              <span className="text-2xl font-black text-brand-400 sm:text-3xl">
                החל מ-<bdi dir="rtl">{priceText(priceFrom)}</bdi>
              </span>
              {priceUnit ? <span className="text-sm font-bold text-mist-500">{priceUnit}</span> : null}
            </p>
          ) : null}

          <p className="mt-4 max-w-xl text-base leading-relaxed text-white/85 sm:text-lg">{subtitle}</p>

          <ul className="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-[15px] font-bold">
            {TRUST.map((c) => (
              <li key={c} className="flex items-center gap-1.5">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-wa-500 text-white">
                  <CheckIcon className="h-3 w-3" />
                </span>
                {c}
              </li>
            ))}
          </ul>

          <div id="hero-cta" className="mt-6 flex flex-col gap-2.5 sm:max-w-md">
            <WaButton location="hero" href={waLink(waMessage)} size="lg" shimmer className="w-full max-sm:px-5 max-sm:text-base">
              שלחו תמונה, קבלו מחיר ב‑WhatsApp
            </WaButton>
            <PhoneButton location="hero" variant="light" className="w-full">
              <span className="whitespace-nowrap">
                חייגו <span dir="ltr">{business.phoneDisplay}</span>
              </span>
            </PhoneButton>
          </div>
        </div>

        {/* REAL HERO PHOTO/VIDEO: see heroMedia in config.ts. */}
        <div className="relative shine-rise [animation-delay:120ms] max-lg:hidden">
          <div className="relative overflow-hidden rounded-[1.5rem] shadow-2xl shadow-black/40 ring-1 ring-white/15">
            {heroMedia.video ? (
              <HeroVideo
                webm={heroMedia.video.webm}
                mp4={heroMedia.video.mp4}
                poster={heroMedia.video.poster}
                alt="ראש שאיבה מקצועי מנקה ריפוד ספה – צילום אמיתי מעבודה של הפתרון המבריק"
              />
            ) : heroMedia.image ? (
              <Image
                src={heroMedia.image}
                alt="ניקוי ספה מקצועי בבית הלקוח"
                width={1200}
                height={900}
                preload
                sizes="(max-width: 1024px) 100vw, 520px"
                className="aspect-4/3 w-full object-cover"
              />
            ) : null}
            <p className="absolute bottom-3 start-3 max-w-[70%] truncate rounded-full bg-black/55 px-3.5 py-1.5 text-xs font-bold text-white backdrop-blur-sm sm:text-sm">
              🎥 {heroMedia.caption}
            </p>
          </div>
        </div>
      </div>
    </section>
  );
}

/** "באר שבע והדרום" – the two headline areas collapsed into one short phrase. */
function serviceAreaShort(): string {
  return `${serviceAreas.primary[0]} והדרום`;
}
