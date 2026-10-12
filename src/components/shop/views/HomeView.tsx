'use client';

import Link from 'next/link';
import { sortProducts } from '@/lib/shop/logic';
import { useShop } from '@/lib/shop/store';
import { CategoryChips } from '../CategoryChips';
import { SampleRibbon, ShopFrame } from '../Chrome';
import { IconArrow } from '../icons';
import { ProductCard, ProductGrid } from '../ProductCard';
import { Logo } from '../Logo';
import { Img } from '../ui';

/** The hero's three benefits, in the reference's right-to-left order. */
const HERO_BENEFITS = [
  { title: 'הדפסת תלת־ממד', text: 'פתרונות מותאמים', Icon: IconCube },
  { title: 'עיצוב ארגונומי', text: 'נוחות מקסימלית', Icon: IconCog },
  { title: 'עמידות גבוהה', text: 'בשימוש יומיומי', Icon: IconShieldCheck },
];

function HeroIcon({ className, children }: { className?: string; children: React.ReactNode }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7} strokeLinecap="round" strokeLinejoin="round" className={className} aria-hidden="true">
      {children}
    </svg>
  );
}

function IconCube({ className }: { className?: string }) {
  return (
    <HeroIcon className={className}>
      <path d="m12 3 8 4.3v9.4L12 21l-8-4.3V7.3L12 3Z" />
      <path d="m4 7.3 8 4.4 8-4.4M12 11.7V21" />
    </HeroIcon>
  );
}

function IconCog({ className }: { className?: string }) {
  return (
    <HeroIcon className={className}>
      <path d="M10.3 3.5h3.4l.5 2.4 1.6.9 2.3-.8 1.7 2.9-1.8 1.6v1.9l1.8 1.6-1.7 2.9-2.3-.8-1.6.9-.5 2.4h-3.4l-.5-2.4-1.6-.9-2.3.8-1.7-2.9L6 13V11L4.2 9.4l1.7-2.9 2.3.8 1.6-.9.5-2.4Z" />
      <circle cx="12" cy="12" r="2.8" />
    </HeroIcon>
  );
}

function IconShieldCheck({ className }: { className?: string }) {
  return (
    <HeroIcon className={className}>
      <path d="M12 3.5 19 6v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6l7-2.5Z" />
      <path d="m9 12 2.2 2.2L15.5 10" />
    </HeroIcon>
  );
}

export function HomeView() {
  const s = useShop();
  const published = s.db.products.filter((p) => p.published);
  const featured = sortProducts(published.filter((p) => p.featured), 'recommended');
  const all = sortProducts(published, 'recommended');
  const newest = sortProducts(published, 'newest');

  return (
    <ShopFrame nav="home" header="overlay">
      {/*
        Hero — the approved reference: the black ANACONDA on a sofa on the
        right, copy left-aligned on the left, three benefits along the bottom.
        On phones the whole composition scales with the screen width (--u is
        one reference pixel at 390 wide) so the copy never runs into the
        handle; from sm up it becomes a fixed-height stage.
      */}
      <section className="relative isolate min-h-[calc(396*var(--u))] overflow-hidden bg-[#07172c] text-white [--u:calc(100vw/390)] sm:min-h-0">
        <Img
          path="/shop/img2/hero-anaconda.webp"
          alt="ידית ANACONDA לניקוי ספות מונחת על ספה"
          eager
          className="absolute top-[calc(-16*var(--u)+env(safe-area-inset-top))] right-0 -z-10 w-full max-w-none sm:top-0 sm:h-full sm:w-auto sm:[mask-image:linear-gradient(90deg,transparent,#000_32%)]"
        />
        <span className="absolute right-2 bottom-[calc(28*var(--u))] -z-10 text-[9px] font-semibold text-white/40 sm:bottom-12">הדמיה</span>

        <div className="mx-auto max-w-7xl pt-[calc(145.4*var(--u)+env(safe-area-inset-top))] pr-[calc(20*var(--u))] pl-[calc(20.5*var(--u))] text-left sm:min-h-[540px] sm:px-8 sm:pt-28 lg:min-h-[620px] lg:pt-32">
          <div className="animate-x-fade sm:mr-auto sm:max-w-[340px] lg:max-w-xl">
            <p dir="ltr" className="flex items-center gap-[calc(7.5*var(--u))] sm:gap-3">
              <span aria-hidden="true" className="h-[2px] w-[calc(18*var(--u))] rounded-full bg-[#2f4ef0] sm:w-8" />
              <Logo tone="light" upright className="text-[length:calc(15*var(--u))] sm:text-[22px] lg:text-[26px]" />
            </p>
            <h1 className="mt-[calc(3.4*var(--u))] text-[length:calc(23.5*var(--u))] leading-[1.07] font-black sm:mt-3 sm:text-[28px] lg:text-[50px]">
              הדור הבא של
              <br />
              <span className="bg-linear-to-l from-[#4b45f9] via-[#2c4cf5] to-[#4a44f7] bg-clip-text text-transparent">ציוד הניקוי המקצועי</span>
            </h1>
            <p className="mt-[calc(4.9*var(--u))] text-[length:calc(12.2*var(--u))] leading-[1.21] text-white/92 sm:mt-4 sm:text-base lg:text-lg">
              אביזרים חדשניים לניקוי ספות ושטיחים,
              <br />
              המיוצרים בטכנולוגיית הדפסת תלת־ממד.
            </p>
            <Link
              href="/shop/c/all"
              className="mt-[calc(9.8*var(--u))] -ms-[calc(1*var(--u))] inline-flex h-[calc(30*var(--u))] w-[calc(137*var(--u))] items-center justify-center gap-[calc(9*var(--u))] rounded-full bg-linear-to-r from-[#4b37fb] via-[#3a4afc] to-[#1662fd] text-[length:calc(12.4*var(--u))] font-bold shadow-[0_calc(5*var(--u))_calc(16*var(--u))_rgb(73_55_251/0.55)] transition hover:brightness-110 sm:mt-7 sm:h-13 sm:w-auto sm:gap-2.5 sm:px-8 sm:text-base sm:shadow-[0_8px_24px_rgb(73_55_251/0.5)]"
            >
              לצפייה במוצרים
              <IconArrow dir="right" className="size-[calc(15*var(--u))] sm:size-[18px]" />
            </Link>
          </div>

          <ul className="mt-[calc(13.8*var(--u))] grid grid-cols-3 text-center sm:mt-12 sm:mr-auto sm:max-w-md lg:mt-14 lg:max-w-xl">
            {HERO_BENEFITS.map(({ title, text, Icon }) => (
              <li key={title} className="flex flex-col items-center">
                <span className="grid size-[calc(28*var(--u))] place-items-center rounded-full bg-white/[0.04] ring-[1.5px] ring-white/80 sm:size-12">
                  <Icon className="size-[calc(15*var(--u))] sm:size-6" />
                </span>
                <span className="mt-[calc(4*var(--u))] text-[length:calc(10.6*var(--u))] leading-tight font-bold sm:mt-2.5 sm:text-[15px]">{title}</span>
                <span className="mt-[calc(0.5*var(--u))] text-[length:calc(8.8*var(--u))] leading-tight text-white/80 sm:text-[13px]">{text}</span>
              </li>
            ))}
          </ul>
          <div aria-hidden="true" dir="ltr" className="mt-[calc(8*var(--u))] flex justify-center gap-[calc(6*var(--u))] pb-[calc(22.8*var(--u))] sm:hidden">
            <span className="size-[calc(5*var(--u))] rounded-full bg-white" />
            <span className="size-[calc(5*var(--u))] rounded-full ring-1 ring-white/70" />
          </div>
          <div className="hidden pb-16 sm:block" />
        </div>
      </section>

      {/* White sheet that overlaps the hero, as in the design. */}
      <div className="relative z-10 -mt-6 rounded-t-[24px] bg-white pt-5 lg:mx-auto lg:-mt-10 lg:max-w-7xl lg:rounded-[28px] lg:px-8 lg:pt-8 lg:shadow-x-card">
        <div className="px-4 lg:px-0">
          <CategoryChips />
        </div>

        <section aria-labelledby="featured" className="px-4 pt-6 lg:px-0 lg:pt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="featured" className="text-[20px] font-black lg:text-2xl">
              מוצרים נבחרים
            </h2>
            <Link href="/shop/c/all" className="inline-flex items-center gap-1 text-[14px] font-bold text-x-blue">
              הצג הכל <IconArrow dir="right" size={16} />
            </Link>
          </div>
          {/* Phone: the design's 3-up row (swipe for more). Desktop: a grid. */}
          <div dir="ltr" className="x-noscrollbar -mx-4 flex snap-x gap-2.5 overflow-x-auto px-4 pb-3 lg:hidden">
            {featured.map((p, i) => (
              <div key={p.id} className="w-[calc((100vw-52px)/3)] max-w-[220px] min-w-[108px] shrink-0 snap-start">
                <ProductCard product={p} compact priority={i < 3} />
              </div>
            ))}
          </div>
          <ProductGrid products={featured} className="hidden lg:grid" />
          <div className="mt-2 overflow-hidden rounded-xl lg:mt-6">
            <SampleRibbon />
          </div>
        </section>

        {/* Promo band under the featured row — the ANACONDA set, from real photos. */}
        <section className="px-4 pt-4 lg:px-0 lg:pt-10">
          <Link href="/shop/p/anaconda-set" className="relative flex h-[150px] items-center overflow-hidden rounded-[20px] bg-[#111827] lg:h-[220px]">
            <Img path="/products/anx-anaconda-set/1.webp" alt="" className="absolute inset-y-0 left-0 h-full w-[55%] object-cover object-[50%_40%]" />
            <div className="absolute inset-0 bg-[linear-gradient(270deg,rgba(10,16,40,0.96)_0%,rgba(10,16,40,0.8)_45%,rgba(10,16,40,0.05)_100%)]" />
            <div className="relative ms-5 me-auto max-w-[58%] text-white lg:ms-10">
              <p className="text-xs font-bold text-[#8fb4ff]">סט מלא</p>
              <p className="mt-1 text-[19px] leading-tight font-black lg:text-3xl">ANACONDA — ידית, צינור משולב ומחבר 360°</p>
              <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-bold text-white/90">
                לפרטים <IconArrow dir="right" size={15} />
              </span>
            </div>
          </Link>
        </section>

        <section aria-labelledby="new" className="px-4 pt-7 lg:px-0 lg:pt-12">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="new" className="text-[20px] font-black lg:text-2xl">
              חדשים בחנות
            </h2>
            <Link href="/shop/c/all?sort=newest" className="inline-flex items-center gap-1 text-[14px] font-bold text-x-blue">
              הצג הכל <IconArrow dir="right" size={16} />
            </Link>
          </div>
          <ProductGrid products={newest.slice(0, 4)} alternate />
        </section>

        <section aria-labelledby="all" className="px-4 pt-7 pb-4 lg:px-0 lg:pt-12 lg:pb-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 id="all" className="text-[20px] font-black lg:text-2xl">
              כל המוצרים
            </h2>
            <span className="text-sm text-x-muted">({all.length} מוצרים)</span>
          </div>
          <ProductGrid products={all} alternate />
        </section>
      </div>
      <ShopFooter />
    </ShopFrame>
  );
}

export function ShopFooter() {
  return (
    <footer className="mt-6 hidden border-t border-x-line bg-x-soft-2 lg:block">
      <div className="mx-auto grid max-w-7xl grid-cols-4 gap-8 px-8 py-12 text-sm">
        <div>
          <p className="text-2xl font-black">
            ANX<span className="text-x-blue">3D</span>
          </p>
          <p className="mt-2 text-x-muted">אביזרים מקצועיים לניקוי ספות, שטיחים וריפודים — מתוכננים ומיוצרים בהדפסת תלת־ממד.</p>
        </div>
        <div>
          <p className="mb-3 font-bold">חנות</p>
          <ul className="space-y-2 text-x-muted">
            <li><Link href="/shop/c/all" className="hover:text-x-blue">כל המוצרים</Link></li>
            <li><Link href="/shop/categories" className="hover:text-x-blue">קטגוריות</Link></li>
            <li><Link href="/shop/search" className="hover:text-x-blue">חיפוש</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 font-bold">החשבון שלי</p>
          <ul className="space-y-2 text-x-muted">
            <li><Link href="/shop/account" className="hover:text-x-blue">אזור אישי</Link></li>
            <li><Link href="/shop/account/orders" className="hover:text-x-blue">ההזמנות שלי</Link></li>
            <li><Link href="/shop/favorites" className="hover:text-x-blue">מועדפים</Link></li>
          </ul>
        </div>
        <div>
          <p className="mb-3 font-bold">תשלום מאובטח</p>
          <p className="text-x-muted">פרטי אשראי לא נשמרים באתר — התשלום מתבצע בעמוד המאובטח של חברת הסליקה.</p>
        </div>
      </div>
    </footer>
  );
}
