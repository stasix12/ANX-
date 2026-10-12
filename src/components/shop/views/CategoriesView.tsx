'use client';

import Link from 'next/link';
import { categoryHref } from '@/lib/shop/logic';
import { STATIC_CATEGORY_SLUGS } from '@/lib/shop/static';
import { useShop } from '@/lib/shop/store';
import { ShopFrame } from '../Chrome';
import { IconSearch } from '../icons';
import { Img } from '../ui';
import { ShopFooter } from './HomeView';

export function CategoriesView() {
  const s = useShop();
  const cats = [...s.db.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const counts = (slug: string) => s.db.products.filter((p) => p.published && p.categories.includes(slug)).length;
  return (
    <ShopFrame nav="categories">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 lg:pt-8">
        <h1 className="sr-only">קטגוריות</h1>
        <Link
          href="/shop/search"
          dir="ltr"
          className="flex h-12 items-center gap-3 rounded-full bg-x-soft px-4 text-[14px] text-x-faint lg:hidden"
        >
          <IconSearch size={22} className="text-x-ink" />
          <span dir="rtl">חיפוש מוצרים, דמויות, אביזרים...</span>
        </Link>
        <h2 className="mb-5 hidden text-3xl font-black lg:block">קטגוריות</h2>
        <ul dir="ltr" className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:mt-0 lg:grid-cols-4 lg:gap-5">
          {cats.map((c, i) => (
            <li key={c.slug}>
              <Link
                href={categoryHref(c.slug, STATIC_CATEGORY_SLUGS)}
                className="group relative block aspect-[1.27/1] overflow-hidden rounded-[16px] bg-[#1b1e25] shadow-x-card"
              >
                <Img path={c.image} alt="" eager={i < 4} className="absolute inset-0 size-full object-cover transition duration-500 group-hover:scale-105" />
                <span className="absolute inset-x-0 bottom-0 h-1/2 bg-linear-to-t from-black/80 via-black/40 to-transparent" />
                <span dir="rtl" className="absolute inset-x-2 bottom-2.5 text-center text-[16px] font-extrabold text-white drop-shadow lg:text-lg">
                  {c.name}
                  <span className="sr-only"> ({counts(c.slug)} מוצרים)</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </div>
      <ShopFooter />
    </ShopFrame>
  );
}
