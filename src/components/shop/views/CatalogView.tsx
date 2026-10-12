'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { activeFilterCount, applyFilters, emptyFilters, sortProducts } from '@/lib/shop/logic';
import { useShop } from '@/lib/shop/store';
import type { Filters, SortKey } from '@/lib/shop/types';
import { SampleRibbon, ShopFrame } from '../Chrome';
import { FilterSheet } from '../FilterSheet';
import { CategoryGlyph, IconChevron, IconFilter } from '../icons';
import { ProductGrid } from '../ProductCard';
import { EmptyState } from '../ui';
import { ShopFooter } from './HomeView';

const SORTS: SortKey[] = ['recommended', 'price-asc', 'price-desc', 'rating', 'newest'];

/** Reads ?cat= / ?sort=; the page renders the param-less view as the prerendered fallback. */
export function CatalogWithParams({ slug }: { slug: string }) {
  const params = useSearchParams();
  const cat = params.get('cat');
  const sort = params.get('sort');
  return <CatalogView key={`${cat}|${sort}`} slug={slug} cat={cat} sortParam={sort} />;
}

export function CatalogView({ slug, cat, sortParam }: { slug: string; cat?: string | null; sortParam?: string | null }) {
  const s = useShop();
  const catSlug = slug === 'all' ? (cat ?? 'all') : slug;
  const category = s.db.categories.find((c) => c.slug === catSlug);
  const initialSort = SORTS.includes(sortParam as SortKey) ? (sortParam as SortKey) : 'recommended';
  const [sort, setSort] = useState<SortKey>(initialSort);
  const [filters, setFilters] = useState<Filters>(() => emptyFilters(s.db.products));
  const [open, setOpen] = useState(false);

  const scope = useMemo(
    () => s.db.products.filter((p) => p.published && (catSlug === 'all' || p.categories.includes(catSlug))),
    [s.db.products, catSlug],
  );
  const list = useMemo(() => sortProducts(applyFilters(scope, filters), sort), [scope, filters, sort]);
  const nFilters = activeFilterCount(filters, s.db.products);
  const title = catSlug === 'all' ? 'כל המוצרים' : (category?.name ?? 'קטגוריה');

  const pill = (on: boolean) =>
    `h-10 shrink-0 rounded-full px-5 text-[14px] font-semibold transition ${on ? 'bg-linear-to-r from-x-violet to-x-indigo text-white shadow-[0_4px_12px_rgb(86_73_251/0.3)]' : 'bg-x-soft text-x-ink-2 hover:bg-x-line/60'}`;

  if (catSlug !== 'all' && !category && s.ready) {
    return (
      <ShopFrame nav="categories" back="/shop/categories">
        <EmptyState icon={<CategoryGlyph icon="all" size={34} />} title="הקטגוריה לא נמצאה" action={{ label: 'לכל הקטגוריות', href: '/shop/categories' }} />
      </ShopFrame>
    );
  }

  return (
    <ShopFrame nav="categories" back="/shop/categories">
      <div className="mx-auto max-w-7xl px-4 lg:px-8">
        <nav aria-label="פירורי לחם" className="pt-1 text-[13px] text-x-muted lg:pt-6">
          <ol className="flex items-center gap-1.5">
            <li>
              <Link href="/shop" className="hover:text-x-blue">
                בית
              </Link>
            </li>
            <li aria-hidden="true">
              <IconChevron dir="left" size={13} />
            </li>
            <li>
              <Link href="/shop/categories" className="hover:text-x-blue">
                קטגוריות
              </Link>
            </li>
            <li aria-hidden="true">
              <IconChevron dir="left" size={13} />
            </li>
            <li aria-current="page" className="font-semibold text-x-ink-2">
              {title}
            </li>
          </ol>
        </nav>

        <div dir="ltr" className="mt-3 flex items-baseline justify-between">
          <h1 className="text-[24px] font-black lg:text-3xl">{title}</h1>
          <span dir="rtl" className="text-[13px] text-x-muted">
            ({list.length} מוצרים)
          </span>
        </div>

        <div dir="ltr" className="x-noscrollbar -mx-4 mt-3 flex gap-2.5 overflow-x-auto px-4 pb-1 lg:mx-0 lg:px-0">
          <button type="button" onClick={() => setSort('recommended')} aria-pressed={sort === 'recommended'} className={pill(sort === 'recommended')}>
            הכל
          </button>
          <button
            type="button"
            onClick={() => setSort(sort === 'price-asc' ? 'price-desc' : 'price-asc')}
            aria-pressed={sort.startsWith('price')}
            aria-label={sort === 'price-asc' ? 'מיון לפי מחיר: מהנמוך לגבוה' : sort === 'price-desc' ? 'מיון לפי מחיר: מהגבוה לנמוך' : 'מיון לפי מחיר'}
            className={pill(sort.startsWith('price'))}
          >
            מחיר{sort === 'price-asc' ? ' ↑' : sort === 'price-desc' ? ' ↓' : ''}
          </button>
          <button type="button" onClick={() => setSort('newest')} aria-pressed={sort === 'newest'} className={pill(sort === 'newest')}>
            חדשים
          </button>
          <button
            type="button"
            onClick={() => setOpen(true)}
            aria-label="סינון מוצרים"
            className={`${pill(nFilters > 0)} relative ms-auto grid min-w-14 place-items-center px-4!`}
          >
            <IconFilter size={21} />
            {nFilters > 0 && (
              <span className="absolute -top-1 -right-1 grid size-5 place-items-center rounded-full bg-x-blue text-[11px] font-bold text-white">{nFilters}</span>
            )}
          </button>
        </div>

        <div className="mt-4">
          {list.length ? (
            <ProductGrid products={list} />
          ) : (
            <EmptyState
              icon={<IconFilter size={34} />}
              title="לא נמצאו מוצרים"
              text={nFilters ? 'נסו להרחיב את הסינון או לנקות אותו.' : 'עדיין אין מוצרים בקטגוריה הזו.'}
            />
          )}
          {nFilters > 0 && !list.length && (
            <div className="text-center">
              <button type="button" onClick={() => setFilters(emptyFilters(s.db.products))} className="font-bold text-x-blue">
                ניקוי סינון
              </button>
            </div>
          )}
        </div>
        <div className="mt-6 overflow-hidden rounded-xl">
          <SampleRibbon />
        </div>
      </div>
      <ShopFooter />
      <FilterSheet open={open} onClose={() => setOpen(false)} value={filters} onApply={setFilters} scope={scope} lockedCategory={catSlug === 'all' ? undefined : catSlug} />
    </ShopFrame>
  );
}
