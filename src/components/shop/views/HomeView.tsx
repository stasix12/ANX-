'use client';

import Link from 'next/link';
import { sortProducts } from '@/lib/shop/logic';
import type { Product } from '@/lib/shop/types';
import { useShop } from '@/lib/shop/store';
import { CategoryChips } from '../CategoryChips';
import { SampleRibbon, ShopFrame } from '../Chrome';
import { IconArrow, IconBox, IconShield } from '../icons';
import { ProductCard, ProductGrid } from '../ProductCard';
import { Logo } from '../Logo';
import { Img } from '../ui';

export function HomeView() {
  const s = useShop();
  const published = s.db.products.filter((p) => p.published);
  // On the home page the handles always lead every row; the rest keep their order.
  const handlesFirst = (list: Product[]) => [
    ...list.filter((p) => p.categories.includes('handles')),
    ...list.filter((p) => !p.categories.includes('handles')),
  ];
  const featured = handlesFirst(sortProducts(published.filter((p) => p.featured), 'recommended'));
  const all = handlesFirst(sortProducts(published, 'recommended'));
  const newest = handlesFirst(sortProducts(published, 'newest'));

  return (
    <ShopFrame nav="home" header="light" uprightLogo>
      {/* Hero — black ANACONDA before a waving Israeli flag on a light studio
          backdrop (scripts/shop-hero-light-asset.py). All copy is live HTML. */}
      <section className="relative isolate -mt-[16px] min-h-[420px] overflow-hidden bg-[#eef2f8] text-[#0d1b4c] sm:min-h-[480px] lg:-mt-[26px] lg:min-h-[600px]">
        <Img
          path="/shop/img2/hero-anaconda-light.webp"
          alt="ידית ANACONDA שחורה לניקוי ספות לפני דגל ישראל"
          eager
          className="absolute inset-x-0 top-[16px] -z-20 h-auto w-full sm:inset-x-0 sm:top-[16px] sm:bottom-0 sm:h-[calc(100%-16px)] sm:object-cover sm:object-[70%_40%] lg:top-[26px] lg:right-0 lg:left-auto lg:h-[calc(100%-26px)] lg:w-[62%] lg:object-[60%_45%] lg:[mask-image:linear-gradient(90deg,transparent,#000_20%)]"
        />
        {/* Soft white wash behind the copy only, for contrast. */}
        <div className="absolute top-[178px] left-0 -z-10 h-[150px] w-[82%] bg-[radial-gradient(85%_75%_at_22%_50%,rgba(255,255,255,0.78),rgba(255,255,255,0.45)_55%,rgba(255,255,255,0)_85%)] sm:hidden" />
        <div className="mx-auto max-w-7xl px-[22px] pt-[161px] sm:pt-36 sm:pb-10 lg:px-8 lg:pt-44 lg:pb-20">
          <div dir="ltr" className="mr-auto max-w-[300px] animate-x-fade sm:max-w-md lg:max-w-xl">
            <p className="flex items-center gap-2 whitespace-nowrap">
              <span className="h-[3px] w-6 shrink-0 rounded-full bg-[#1f45ff] lg:w-10" />
              <Logo upright className="shrink-0 text-[18px] tracking-[-0.02em] lg:text-[28px]" />
              <span aria-hidden="true" className="h-4 w-px shrink-0 bg-[#0d1b4c]/40 lg:h-6" />
              <span dir="rtl" className="text-[10.75px] leading-tight font-bold text-[#0d1b4c] [text-shadow:0_0_4px_#fff,0_0_8px_#fff,0_0_2px_#fff] lg:text-[15px]">
                נוצר על ידי מנקי ספות בשביל מנקי ספות
              </span>
            </p>
            <h1 dir="rtl" className="mt-0.5 text-left text-[25.5px] leading-[1.03] font-black lg:mt-3 lg:text-[54px] lg:leading-[1.1]">
              <span className="text-[#0a1640]">הדור הבא של</span>
              <br />
              <span className="text-[#0a2cff]">ציוד הניקוי המקצועי</span>
            </h1>
            <p dir="rtl" className="mt-1.5 text-left text-[13.4px] leading-[1.38] font-semibold text-[#14234f] lg:mt-4 lg:text-lg lg:leading-[1.5]">
              אביזרים חדשניים לניקוי ספות ושטיחים,
              <br />
              המיוצרים בטכנולוגיית הדפסת תלת־ממד.
            </p>
            <Link
              href="/shop/c/all"
              dir="rtl"
              className="relative mt-[7px] inline-flex h-[30px] items-center gap-2 rounded-full bg-[#041cfc] px-[15px] text-[14.5px] font-extrabold text-white shadow-[0_5px_14px_rgb(4_28_252/0.35)] transition after:absolute after:inset-x-0 after:-inset-y-[7px] after:content-[''] hover:brightness-110 lg:mt-6 lg:h-14 lg:px-9 lg:text-lg"
            >
              לצפייה במוצרים
              <IconArrow dir="right" size={16} />
            </Link>
          </div>

          {/* Benefits row */}
          <ul dir="ltr" className="mt-[10px] grid grid-cols-3 lg:mt-14 lg:mr-auto lg:max-w-xl">
            {[
              { Icon: IconShield, title: 'עמידות גבוהה', text: 'בשימוש יומיומי' },
              { Icon: IconCog, title: 'עיצוב ארגונומי', text: 'נוחות מקסימלית' },
              { Icon: IconBox, title: 'הדפסת תלת־ממד', text: 'פתרונות מותאמים' },
            ].map(({ Icon, title, text }) => (
              <li key={title} dir="rtl" className="flex flex-col items-center text-center">
                <span className="grid size-[29px] place-items-center rounded-full border-[1.5px] border-[#0a3cfd] bg-white/70 text-[#0a3cfd] lg:size-12">
                  <Icon size={16} />
                </span>
                <span className="mt-1 text-[11px] leading-[14px] font-extrabold text-[#0a1640] lg:text-[15px]">{title}</span>
                <span className="text-[10px] leading-[13px] font-medium text-[#3a4566] lg:text-[13px]">{text}</span>
              </li>
            ))}
          </ul>
          <div aria-hidden="true" dir="ltr" className="mt-1.5 flex justify-center gap-1.5 lg:hidden">
            <span className="size-[5px] rounded-full bg-[#1f45ff]" />
            <span className="size-[5px] rounded-full border border-[#0d1b4c]/60" />
          </div>
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
            <Img path="/products/anaconda-hose-set/4.webp" alt="" className="absolute inset-y-0 left-0 h-full w-[55%] bg-white object-cover object-[50%_45%]" />
            <div className="absolute inset-0 bg-[linear-gradient(270deg,rgba(10,16,40,0.96)_0%,rgba(10,16,40,0.8)_45%,rgba(10,16,40,0.05)_100%)]" />
            <div className="relative ms-5 me-auto max-w-[58%] text-white lg:ms-10">
              <p className="text-xs font-bold text-[#8fb4ff]">סט מלא</p>
              <p className="mt-1 text-[19px] leading-tight font-black lg:text-3xl">ANACONDA — צינור בתוך צינור, עם ידית או בלי</p>
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

/** Toothed cog for the "עיצוב ארגונומי" benefit, as in the hero design. */
function IconCog({ size = 24 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.8} strokeLinejoin="round" aria-hidden="true">
      <path d="M10.3 3h3.4l.5 2.4 1.6.9 2.3-.8 1.7 2.9-1.8 1.6v1.9l1.8 1.6-1.7 2.9-2.3-.8-1.6.9-.5 2.4h-3.4l-.5-2.4-1.6-.9-2.3.8-1.7-2.9L5.8 13v-1.9L4 9.4l1.7-2.9 2.3.8 1.6-.9.7-2.4Z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
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
