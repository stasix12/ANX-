'use client';

import Link from 'next/link';
import { sortProducts } from '@/lib/shop/logic';
import { useShop } from '@/lib/shop/store';
import { CategoryChips } from '../CategoryChips';
import { SampleRibbon, ShopFrame } from '../Chrome';
import { IconArrow } from '../icons';
import { ProductCard, ProductGrid } from '../ProductCard';
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
      <section className="relative isolate overflow-hidden bg-[#10141c] text-white">
        {/* Blurred copy fills the stage; the sharp dragon sits bottom-left at the design's scale. */}
        <Img path="/shop/img/dragon-blue-hero.webp" alt="" eager className="absolute inset-0 -z-20 size-full scale-125 object-cover opacity-70 blur-xl" />
        <Img
          path="/shop/img/dragon-blue-hero.webp"
          alt="דרקון גמיש מודפס בתלת ממד בצבעי שחור וכחול"
          eager
          className="absolute bottom-[3%] -left-[2%] -z-10 aspect-square h-[76%] max-h-[440px] object-cover [mask-image:radial-gradient(closest-side,#000_74%,transparent)] sm:h-[90%] lg:left-[6%]"
        />
        <div className="absolute inset-0 -z-10 bg-[linear-gradient(270deg,#0d1118_0%,rgba(13,17,24,0.92)_26%,rgba(13,17,24,0.35)_52%,rgba(13,17,24,0)_70%)]" />
        <div className="absolute inset-x-0 top-0 -z-10 h-28 bg-linear-to-b from-black/45 to-transparent" />
        <div className="mx-auto flex min-h-[330px] max-w-7xl items-start px-4 pt-[calc(66px+env(safe-area-inset-top))] pb-12 sm:min-h-[400px] lg:min-h-[480px] lg:items-center lg:px-8 lg:pt-24">
          <div className="ms-0 me-auto w-[64%] max-w-md animate-x-fade sm:w-1/2 lg:max-w-lg">
            <h1 className="text-[26px] leading-[1.18] font-black sm:text-[34px] lg:text-[48px]">
              מודלים תלת מימד
              <br />
              <span className="bg-linear-to-l from-[#9b7bff] to-[#7a55ff] bg-clip-text text-transparent">שמדפיסים בבית</span>
            </h1>
            <p className="mt-2.5 text-[14px] leading-snug text-white/90 lg:mt-4 lg:text-lg">
              עיצובים ייחודיים, איכות גבוהה,
              <br />
              לכל הרמות והמדפסות.
            </p>
            <Link
              href="/shop/c/all"
              className="mt-5 inline-flex h-12 items-center gap-2 rounded-full bg-linear-to-r from-[#5c4dfc] to-[#4f4bfb] px-6 text-[15px] font-bold shadow-[0_8px_22px_rgb(84_74_252/0.45)] transition hover:brightness-110 lg:h-14 lg:px-8 lg:text-base"
            >
              לכל המוצרים
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

        {/* Promo band — the white dragon / knight strip under the featured row. */}
        <section className="px-4 pt-4 lg:px-0 lg:pt-10">
          <Link
            href="/shop/c/figurines"
            className="relative flex h-[150px] items-center overflow-hidden rounded-[20px] bg-[#1a1d24] lg:h-[220px]"
          >
            <Img path="/shop/img/dragon-white-1.webp" alt="" className="absolute inset-y-0 left-0 h-full w-1/2 object-cover" />
            <Img path="/shop/img/knight-bust.webp" alt="" className="absolute inset-y-0 right-0 h-full w-1/2 object-cover opacity-70" />
            <div className="absolute inset-0 bg-[linear-gradient(270deg,rgba(10,13,20,0.92)_0%,rgba(10,13,20,0.7)_45%,rgba(10,13,20,0.1)_100%)]" />
            <div className="relative ms-5 me-auto max-w-[60%] text-white lg:ms-10">
              <p className="text-xs font-bold text-[#a993ff]">חדש בחנות</p>
              <p className="mt-1 text-[19px] leading-tight font-black lg:text-3xl">דמויות ופסלים לאספנים</p>
              <span className="mt-2 inline-flex items-center gap-1 text-[13px] font-bold text-white/90">
                לקולקציה <IconArrow dir="right" size={15} />
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
          <p className="mt-2 text-x-muted">מודלים ומוצרים מודפסים בתלת ממד — עיצובים ייחודיים לבית, למשרד ולמתנה.</p>
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
