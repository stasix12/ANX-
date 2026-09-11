import Image from 'next/image';
import type { ReactNode } from 'react';
import { PhoneButton, WaButton } from '@/components/hamavrik/CtaLinks';
import { HeroVideo } from '@/components/hamavrik/HeroVideo';
import { CameraIcon } from '@/components/hamavrik/icons';
import { CheckIcon, HomeIcon } from '@/components/icons';
import { heroMedia, priceList, serviceAreas } from '@/lib/hamavrik/config';
import { waLinkFor } from '@/lib/hamavrik/links';

const CHECKS = ['ניקוי בבית הלקוח', 'ציוד מקצועי', 'טיפול בכתמים וריחות', 'שירות מהיר', 'תוצאות שרואים'];

/**
 * The first screen. In 5–10 seconds a visitor should know what we do, why
 * us, roughly what it costs and how to order — so the H1 says what changes,
 * the sub says how, five checks say why, a price badge says how much and
 * two big buttons say how to order. Dark navy ground: a big company, not a
 * one-man ad.
 */
export function Hero({
  eyebrow = `ניקוי ספות מקצועי · ${serviceAreas.primary.join(', ')} ו${serviceAreas.regionLabel}`,
  title = (
    <>
      הספה שלכם יכולה להיראות{' '}
      <span className="block text-aqua-300">אחרת לגמרי.</span>
    </>
  ),
  subtitle = 'ניקוי ספות מקצועי בבית הלקוח עם ציוד מתקדם, טיפול בכתמים וניקוי עמוק של הריפוד.',
  waContext = '(מה-Hero)',
  priceFrom = priceList[0]?.from ?? null,
}: {
  eyebrow?: string;
  title?: ReactNode;
  subtitle?: string;
  waContext?: string;
  priceFrom?: number | null;
}) {
  return (
    <section className="shine-hero relative overflow-hidden">
      <div className="relative mx-auto grid max-w-6xl items-center gap-10 px-4 pb-16 pt-12 sm:px-6 lg:grid-cols-[1.05fr_0.95fr] lg:gap-14 lg:pb-24 lg:pt-20">
        <div className="min-w-0 animate-rise">
          <span className="inline-flex items-center gap-2 rounded-full bg-white/10 px-3.5 py-1.5 text-sm font-bold text-aqua-300 ring-1 ring-white/15 backdrop-blur">
            <HomeIcon className="h-4 w-4" />
            {eyebrow}
          </span>

          <h1 className="mt-5 text-[2.5rem] font-black leading-[1.08] text-balance-he sm:text-5xl lg:text-6xl">
            {title}
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-white/80 sm:text-xl">{subtitle}</p>

          <ul className="mt-6 grid max-w-xl grid-cols-1 gap-x-6 gap-y-2.5 text-[15px] font-bold sm:grid-cols-2">
            {CHECKS.map((c) => (
              <li key={c} className="flex items-center gap-2">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-wa-500 text-white">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                {c}
              </li>
            ))}
          </ul>

          <div className="mt-8 flex flex-col gap-3">
            <div className="flex flex-col items-center gap-2 sm:items-start">
              <WaButton location="hero" href={waLinkFor(waContext)} size="xl" shimmer className="w-full whitespace-nowrap max-sm:px-6 max-sm:text-lg sm:w-auto sm:min-w-[22rem]">
                קבלו הצעת מחיר ב-WhatsApp
              </WaButton>
              <p className="inline-flex items-center gap-1.5 text-sm font-medium text-white/70">
                <CameraIcon className="h-4 w-4" />
                שלחו לנו תמונה של הספה וקבלו הצעת מחיר
              </p>
            </div>
            <PhoneButton location="hero" variant="light" size="lg" className="w-full sm:w-auto sm:min-w-[22rem] sm:self-start" />
          </div>
        </div>

        <div className="relative animate-rise [animation-delay:120ms]">
          <div className="relative overflow-hidden rounded-[1.75rem] shadow-2xl shadow-black/40 ring-1 ring-white/15">
            {heroMedia.video ? (
              <HeroVideo
                webm={heroMedia.video.webm}
                mp4={heroMedia.video.mp4}
                poster={heroMedia.video.poster}
                alt="ראש שאיבה מקצועי מנקה ריפוד ספה — צילום אמיתי מעבודה של הפתרון המבריק"
              />
            ) : heroMedia.image ? (
              <Image
                src={heroMedia.image}
                alt="ניקוי ספה מקצועי בבית הלקוח"
                width={1200}
                height={900}
                preload
                sizes="(max-width: 1024px) 100vw, 560px"
                className="aspect-4/3 w-full object-cover"
              />
            ) : null}
            <p className="absolute bottom-3 start-3 max-w-[60%] truncate rounded-full bg-black/55 px-3.5 py-1.5 text-xs font-bold text-white backdrop-blur-sm sm:text-sm">
              🎥 {heroMedia.caption}
            </p>
          </div>

          {priceFrom ? (
            <div className="shine-float absolute -top-4 start-3 rounded-2xl bg-white px-4 py-2.5 text-mist-100 shadow-xl sm:-start-4">
              <p className="text-[11px] font-bold text-mist-500">ניקוי ספה</p>
              <p className="text-xl font-black leading-tight text-brand-400">
                החל מ-{priceFrom} ₪
              </p>
            </div>
          ) : null}
          <div className="shine-float shine-float-delay absolute -bottom-4 end-3 flex items-center gap-2 rounded-2xl bg-white px-4 py-2.5 text-mist-100 shadow-xl sm:-end-4">
            <span className="grid h-8 w-8 place-items-center rounded-full bg-wa-100 text-wa-600">
              <CheckIcon className="h-4 w-4" />
            </span>
            <span className="text-sm font-extrabold">מגיעים עד הבית</span>
          </div>
        </div>
      </div>
    </section>
  );
}
