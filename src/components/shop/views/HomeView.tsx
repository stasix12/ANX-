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
      {/* Hero — photo (black ANACONDA before the Israeli flag, scripts/shop-hero-light-asset.py)
          on top, centred copy below it. All copy is live HTML. */}
      <section className="relative isolate -mt-[16px] bg-[#f6f8fd] pb-[44px] text-center text-[#0b1020] lg:-mt-[26px] lg:pb-20">
        <div className="mx-auto max-w-[900px] pt-[12px] sm:[mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)] lg:max-w-[760px] lg:pt-[26px]">
          <Img
            path="/shop/img2/hero-anaconda-light.webp"
            alt="ידית ANACONDA שחורה לניקוי ספות לפני דגל ישראל"
            eager
            className="block h-auto w-full"
          />
        </div>
        <div className="relative mx-auto -mt-[16px] max-w-xl px-[28px] animate-x-fade lg:-mt-6">
          <p dir="ltr" className="flex items-center gap-[9px] whitespace-nowrap">
            <span className="h-[2.5px] w-[14px] shrink-0 rounded-full bg-[#0068fa]" />
            <Logo upright className="shrink-0 text-[17px] tracking-[-0.02em] lg:text-[24px]" />
            <span aria-hidden="true" className="ms-[2px] h-[13px] w-px shrink-0 bg-[#0b1020]/70" />
            <span dir="rtl" className="ms-[2px] text-[10.4px] leading-tight font-semibold text-[#0b1020] lg:text-[14px]">
              נוצר על ידי מנקי ספות בשביל מנקי ספות
            </span>
          </p>
          <h1 className="mt-[10px] font-black">
            <span className="block text-[31.5px] leading-[1.05] lg:text-[46px]">הדור הבא של</span>
            <span className="relative mx-auto mt-0 block w-[302px] max-w-full lg:w-[440px]">
              <span aria-hidden="true" className="absolute inset-0 -skew-x-[14deg] rounded-[9px] bg-[#0168fa]" />
              <span className="relative block py-[1.5px] text-[29px] leading-[1.1] whitespace-nowrap text-white lg:text-[42px]">ציוד הניקוי המקצועי</span>
            </span>
          </h1>
          <p className="mx-auto mt-[2px] text-[14.85px] leading-[1.22] font-medium text-[#0e213d] lg:text-lg">
            אביזרים חדשניים לניקוי ספות ושטיחים,
            <br />
            המיוצרים בטכנולוגיית הדפסת תלת־ממד.
          </p>
          <Link
            href="/shop/c/all"
            className="relative mt-[8px] inline-flex h-[31px] w-[168px] items-center justify-center gap-[14px] rounded-full bg-[#004ee7] text-[15px] font-extrabold text-white shadow-[0_6px_16px_rgb(0_78_231/0.28)] transition after:absolute after:inset-x-0 after:-inset-y-[7px] after:content-[''] hover:brightness-110 lg:h-12 lg:w-56 lg:text-lg"
          >
            לצפייה במוצרים
            <IconArrow dir="right" size={15} />
          </Link>

          {/* Benefits row */}
          <ul dir="ltr" className="mx-auto mt-[15px] grid max-w-[362px] grid-cols-3 lg:max-w-md">
            {[
              { Icon: IconShield, title: 'עמידות גבוהה', text: 'בשימוש יומיומי' },
              { Icon: IconCog, title: 'עיצוב ארגונומי', text: 'נוחות מקסימלית' },
              { Icon: IconBox, title: 'הדפסת תלת־ממד', text: 'פתרונות מותאמים' },
            ].map(({ Icon, title, text }, i) => (
              <li key={title} dir="rtl" className={`relative flex flex-col items-center ${i ? "before:absolute before:top-[27px] before:left-0 before:h-[32px] before:w-px before:bg-[#cdd0d8] before:content-['']" : ''}`}>
                <span className="grid size-[31px] place-items-center rounded-full border-[1.6px] border-[#0653e0] text-[#0653e0] lg:size-11">
                  <Icon size={18} />
                </span>
                <span className="mt-[5px] text-[13.8px] leading-[1.1] font-extrabold whitespace-nowrap text-[#0b1020] lg:text-[15px]">{title}</span>
                <span className="mt-[3px] text-[11.4px] leading-[1.1] whitespace-nowrap text-[#1f2c53] lg:text-[13px]">{text}</span>
              </li>
            ))}
          </ul>
          <div aria-hidden="true" dir="ltr" className="mt-[12px] flex justify-center gap-[8px] lg:hidden">
            <span className="size-[5.5px] rounded-full bg-[#005bf3]" />
            <span className="size-[5.5px] rounded-full bg-[#c5c8d0]" />
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
          <p className="mb-3 font-bold">קניות</p>
          <ul className="space-y-2 text-x-muted">
            <li><Link href="/shop/cart" className="hover:text-x-blue">עגלת קניות</Link></li>
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
