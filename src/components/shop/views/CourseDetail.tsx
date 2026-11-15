'use client';

import { useState } from 'react';
import { whatsappLink } from '@/lib/site';
import type { Product } from '@/lib/shop/types';
import { ShopFrame } from '../Chrome';
import { FavoriteButton } from '../ProductCard';
import { Img } from '../ui';

/**
 * Product page of a 1-1 course (bookingOnly): dark hero with the photo,
 * gallery, price, benefits strip and a booking button that opens WhatsApp.
 * Not sold through the cart.
 */

const I = {
  user: (s = 18) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="8" r="3.8" />
      <path d="M4.5 20c.6-3.8 3.6-6 7.5-6s6.9 2.2 7.5 6" />
    </svg>
  ),
  check: (s = 15) => (
    <svg width={s} height={s} viewBox="0 0 24 24" aria-hidden="true">
      <circle cx="12" cy="12" r="11" fill="#2f6bff" />
      <path d="m7 12.5 3.3 3.2L17 9" fill="none" stroke="#fff" strokeWidth={2.6} strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  ),
  calendar: (s = 22) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinecap="round" aria-hidden="true">
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M3.5 9.5h17M8 3v4M16 3v4" />
      <path d="M8 13h.01M12 13h.01M16 13h.01M8 16.5h.01M12 16.5h.01M16 16.5h.01" strokeWidth={2.6} />
    </svg>
  ),
  timer: (s = 30) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
      <circle cx="12" cy="13.5" r="7.5" />
      <path d="M12 13.5V9.5M10 2.5h4M12 2.5v3.5M18.5 6.5l1.5-1.5" />
    </svg>
  ),
  flask: (s = 30) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M9.5 3h5M10 3v6L4.8 18.2A1.8 1.8 0 0 0 6.4 21h11.2a1.8 1.8 0 0 0 1.6-2.8L14 9V3" />
      <path d="M7.2 14.5h9.6" />
    </svg>
  ),
  sofa: (s = 30) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d="M5 11V8a2.5 2.5 0 0 1 2.5-2.5h9A2.5 2.5 0 0 1 19 8v3" />
      <path d="M3.5 11.5a1.8 1.8 0 0 1 3.5.5v2h10v-2a1.8 1.8 0 0 1 3.5-.5V17a1 1 0 0 1-1 1h-15a1 1 0 0 1-1-1v-5.5ZM6 18v1.5M18 18v1.5" />
    </svg>
  ),
  infinity: (s = 30) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" aria-hidden="true">
      <path d="M12 12c-1.8-2.6-3.4-4-5.3-4a4 4 0 0 0 0 8c1.9 0 3.5-1.4 5.3-4Zm0 0c1.8 2.6 3.4 4 5.3 4a4 4 0 0 0 0-8c-1.9 0-3.5 1.4-5.3 4Z" />
    </svg>
  ),
  lock: (s = 26) => (
    <svg width={s} height={s} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" aria-hidden="true">
      <rect x="5" y="10.5" width="14" height="10" rx="2" />
      <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5M12 14.5v2.5" />
    </svg>
  ),
};

export function CourseDetail({ product }: { product: Product }) {
  const [index, setIndex] = useState(0);
  const book = whatsappLink(`היי, אשמח לתאם ${product.name} אישי 1-1`);
  const photo = product.images[index] ?? product.images[0];
  // "קורס ניקוי" / "מזרנים": the last word gets the big blue line.
  const words = product.name.split(' ');
  const last = words.pop();
  const strip = [
    { icon: I.infinity(), text: 'ללא הגבלת זמן' },
    { icon: I.sofa(), text: 'מתאים גם לספות' },
    { icon: I.flask(), text: 'רק 2 חומרים' },
    { icon: I.timer(), text: "תוך 20 דק'" },
  ];
  const trust = [
    { icon: I.calendar(20), text: 'תיאום מועד גמיש' },
    { icon: I.user(20), text: 'ליווי אישי שלי' },
    { icon: I.lock(20), text: 'תשלום מאובטח' },
  ];

  return (
    <ShopFrame nav={false} header="dark" back="/shop/c/courses">
      <div className="mx-auto max-w-3xl">
        {/* Hero: copy on the left, the real photo on the right. */}
        <section dir="ltr" className="relative isolate h-[214px] overflow-hidden bg-[#071430] sm:h-[300px] lg:mt-6 lg:h-[380px] lg:rounded-[22px]">
          <Img path={photo} alt={product.name} eager className="absolute inset-y-0 right-0 -z-10 h-full w-[58%] object-cover object-[50%_35%]" />
          <div className="absolute inset-0 -z-10 bg-[linear-gradient(90deg,#06122b_0%,#081a3e_38%,rgba(8,26,62,0.75)_46%,rgba(8,26,62,0)_62%)]" />
          <div className="absolute inset-0 -z-10 bg-[radial-gradient(70%_90%_at_10%_0%,rgba(47,107,255,0.28),transparent_60%)]" />
          <FavoriteButton product={product} size="lg" className="absolute top-3 right-3 bg-[#0b1530]/80!" />
          <div dir="rtl" className="flex h-full w-[47%] flex-col items-start justify-center ps-3 text-right text-white sm:w-[44%] lg:ps-8">
            <h1 className="leading-[0.95] font-black">
              <span className="block text-[27px] whitespace-nowrap sm:text-[40px] lg:text-[50px]">{words.join(' ')}</span>
              <span className="block bg-linear-to-b from-[#8cc4ff] to-[#4d93ff] bg-clip-text text-[38px] text-transparent sm:text-[52px] lg:text-[64px]">{last}</span>
            </h1>
            {product.badge && (
              <span className="mt-2.5 inline-flex h-[26px] items-center justify-center gap-1.5 rounded-[9px] px-3.5 sm:px-5 border border-[#5d8dff] bg-linear-to-l from-[#1d4fe0] to-[#1a3fb0] text-[14px] font-black shadow-[0_0_14px_rgb(70_120_255/0.75)] sm:h-9 sm:text-[18px]">
                {product.badge}
                {I.user(15)}
              </span>
            )}
            <ul className="mt-2.5 space-y-[5px] sm:space-y-2">
              {product.highlights.slice(0, 4).map((h) => (
                <li key={h} className="flex items-center justify-start gap-1.5 text-[10.5px] leading-tight font-semibold sm:text-[14px] lg:text-[16px]">
                  <span className="shrink-0">{I.check()}</span>
                  {h}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {/* Gallery */}
        <div dir="ltr" className="mt-2.5 grid grid-cols-4 gap-2 px-3 lg:px-0">
          {product.images.map((src, i) => (
            <button
              key={src}
              type="button"
              aria-label={`תמונה ${i + 1}`}
              aria-current={i === index}
              onClick={() => setIndex(i)}
              className={`aspect-[1.55/1] overflow-hidden rounded-[10px] transition ${i === index ? 'ring-2 ring-x-blue ring-offset-1' : 'ring-1 ring-x-line'}`}
            >
              <Img path={src} alt="" className="size-full object-cover" />
            </button>
          ))}
        </div>

        <div className="px-4 pt-4 lg:px-0">
          {/* Name + badge, price box */}
          <div dir="ltr" className="flex items-start justify-between gap-3">
            <span className="mt-1 grid h-[38px] shrink-0 place-items-center rounded-[14px] bg-x-blue-50 px-3 sm:h-12 sm:px-4">
              <span dir="rtl" className="text-[23px] font-black tabular-nums sm:text-[32px]">
                {product.price} ₪
              </span>
            </span>
            <div dir="rtl" className="min-w-0 flex-1 text-left">
              <div dir="ltr" className="flex flex-wrap items-center justify-end gap-x-1.5 gap-y-1">
                {product.badge && (
                  <span className="inline-flex h-[21px] shrink-0 items-center gap-1 rounded-full bg-[#1846c9] px-2 text-[10.5px] font-bold whitespace-nowrap text-white sm:text-[12px]">
                    {product.badge}
                    {I.user(13)}
                  </span>
                )}
                <h2 className="text-[18px] font-black whitespace-nowrap sm:text-[24px]">{product.name}</h2>
              </div>
              <p className="mt-0.5 text-[13.5px] font-semibold text-x-ink-2">{product.subtitle}</p>
            </div>
          </div>

          <div dir="ltr" className="mt-2.5 flex justify-start">
            <span className="inline-flex h-[26px] items-center gap-1.5 rounded-full bg-[#dcf7e3] px-3 text-[12.5px] font-bold text-[#178a3f]">
              {I.calendar(17)}
              <span dir="rtl">גישה מיידית לתיאום מועד</span>
            </span>
          </div>

          {/* Benefits strip */}
          <ul className="mt-3 grid grid-cols-4 rounded-[16px] bg-[#e9f1ff] py-2.5 text-center">
            {strip.map((b) => (
              <li key={b.text} className="flex flex-col items-center gap-1 border-[#c9d8f5] px-1 not-first:border-s">
                <span className="text-[#2a66f0]">{b.icon}</span>
                <span className="text-[11.5px] leading-tight font-extrabold">{b.text}</span>
              </li>
            ))}
          </ul>

          <p className="mt-4 text-center text-[14.5px] leading-relaxed text-x-ink">{product.description}</p>

          <a
            href={book}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-5 flex h-[54px] items-center justify-center gap-3 rounded-[16px] bg-linear-to-b from-[#2b63ff] to-[#1a46e0] text-[20px] font-black text-white shadow-[0_8px_20px_rgb(37_90_255/0.35)] transition hover:brightness-110 active:scale-[0.99]"
          >
            לתיאום קורס אישי 1-1
            {I.calendar(26)}
          </a>

          <ul className="mt-4 grid grid-cols-3 pb-6">
            {trust.map((t) => (
              <li key={t.text} className="flex items-center justify-center gap-1 border-x-line px-0.5 text-[11px] font-bold whitespace-nowrap not-first:border-s sm:gap-1.5 sm:text-[13px]">
                <span className="text-x-ink-2">{t.icon}</span>
                {t.text}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </ShopFrame>
  );
}
