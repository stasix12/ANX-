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

export function HomeView() {
  const s = useShop();
  const published = s.db.products.filter((p) => p.published);
  const featured = sortProducts(published.filter((p) => p.featured), 'recommended');
  const all = sortProducts(published, 'recommended');
  const newest = sortProducts(published, 'newest');

  return (
    <ShopFrame nav="home" header="overlay">
      {/* Hero — dark stage, dragon on the left, copy on the right. */}
      <section className="relative isolate overflow-hidden bg-[#0a1640] text-white">
        <div className="absolute inset-0 -z-20 bg-[radial-gradient(120%_90%_at_15%_40%,#1d3fa8_0%,#0f2160_45%,#081233_100%)]" />
        <Img
          path="/shop/img2/hero-handle.webp"
          alt="ידית ANX3D לניקוי ספות על ספה"
          eager
          className="absolute bottom-0 left-0 -z-10 h-[88%] w-[52%] object-cover object-[40%_50%] [mask-image:linear-gradient(90deg,#000_62%,transparent)] sm:w-[44%] lg:h-full lg:w-[42%]"
        />
        <span className="absolute bottom-7 left-2 -z-10 text-[9px] font-semibold text-white/45 lg:bottom-12 lg:left-4">הדמיה</span>
        <div className="absolute inset-x-0 top-0 -z-10 h-24 bg-linear-to-b from-black/35 to-transparent" />
        <div className="mx-auto flex min-h-[330px] max-w-7xl items-start px-4 pt-[calc(64px+env(safe-area-inset-top))] pb-12 sm:min-h-[400px] lg:min-h-[480px] lg:items-center lg:px-8 lg:pt-24">
          <div className="ms-0 me-auto w-[62%] max-w-md animate-x-fade sm:w-1/2 lg:max-w-xl">
            <p className="text-left" dir="ltr">
              <Logo tone="light" className="text-[34px] lg:text-[52px]" />
            </p>
            <h1 className="mt-1.5 text-[23px] leading-[1.2] font-black sm:text-[30px] lg:text-[44px]">
              הדור הבא של
              <br />
              <span className="bg-linear-to-l from-[#7fb6ff] to-[#3f8cff] bg-clip-text text-transparent">ציוד הניקוי המקצועי</span>
            </h1>
            <p className="mt-2.5 text-[13.5px] leading-snug text-white/90 lg:mt-4 lg:text-lg">
              אביזרים חדשניים לניקוי ספות ושטיחים,
              <br />
              המיוצרים בטכנולוגיית הדפסת תלת־ממד.
            </p>
            <Link
              href="/shop/c/all"
              className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-linear-to-r from-[#6a4cfc] to-[#4f52fb] px-6 text-[15px] font-bold shadow-[0_8px_22px_rgb(84_74_252/0.45)] transition hover:brightness-110 lg:h-14 lg:px-8 lg:text-base"
            >
              לצפייה במוצרים
              <IconArrow dir="right" size={18} />
            </Link>
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
