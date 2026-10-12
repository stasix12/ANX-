'use client';

import Link from 'next/link';
import { categoryHref } from '@/lib/shop/logic';
import { STATIC_CATEGORY_SLUGS } from '@/lib/shop/static';
import { useShop } from '@/lib/shop/store';
import { CategoryGlyph } from './icons';

/** Round-square category chips of the home page ("כל המוצרים" first, highlighted). */
export function CategoryChips({ active = 'all' }: { active?: string }) {
  const s = useShop();
  const cats = [...s.db.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const items = [{ slug: 'all', shortName: 'כל המוצרים', icon: 'all' as const }, ...cats];
  return (
    <ul dir="ltr" className="x-noscrollbar -mx-4 flex snap-x gap-[9px] overflow-x-auto px-4 pb-1 lg:mx-0 lg:flex-wrap lg:gap-4 lg:px-0">
      {items.map((c) => {
        const on = c.slug === active;
        return (
          <li key={c.slug} className="snap-start">
            <Link href={categoryHref(c.slug, STATIC_CATEGORY_SLUGS)} className="group flex w-[52px] flex-col items-center gap-1.5 lg:w-[84px]">
              <span
                className={`grid size-[50px] place-items-center rounded-[15px] transition lg:size-[72px] ${
                  on
                    ? 'bg-linear-to-b from-[#3d72ff] to-x-blue text-white shadow-[0_6px_14px_rgb(47_93_251/0.35)]'
                    : 'bg-x-soft text-x-ink group-hover:bg-x-blue-50 group-hover:text-x-blue'
                }`}
              >
                <CategoryGlyph icon={c.icon} size={24} />
              </span>
              <span dir="rtl" className={`whitespace-nowrap text-[11px] lg:text-[13px] ${on ? 'font-extrabold text-x-ink' : 'font-semibold text-x-muted'}`}>
                {c.shortName}
              </span>
            </Link>
          </li>
        );
      })}
    </ul>
  );
}
