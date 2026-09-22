'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { categories, fetchPublishedProducts, type CategoryId, type Product } from '@/lib/products';

type Filter = CategoryId | 'all';

const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'הכל' },
  ...categories.map((category) => ({ id: category.id as Filter, label: category.name })),
];

/**
 * Reads the live catalog straight from Supabase on mount, so a product the
 * admin just published shows up here without anyone having to rebuild the
 * site. `initialProducts` (rendered server-side at build time, when it can
 * reach the network CI does) fills the grid before that fetch resolves —
 * without it, every visitor would see a blank grid for a beat on first paint.
 */
export function ProductGrid({ initialProducts = [] }: { initialProducts?: Product[] }) {
  const [products, setProducts] = useState<Product[]>(initialProducts);
  const [active, setActive] = useState<Filter>('all');
  const pillRefs = useRef<(HTMLButtonElement | null)[]>([]);

  useEffect(() => {
    let cancelled = false;
    fetchPublishedProducts().then((fresh) => {
      if (!cancelled && fresh.length > 0) setProducts(fresh);
    });
    return () => {
      cancelled = true;
    };
  }, []);

  const visible = useMemo(
    () => (active === 'all' ? products : products.filter((p) => p.category === active)),
    [active, products],
  );

  /*
   * Real radio-group keyboard behaviour: one tab stop (the selected pill),
   * arrows move and select. Right-to-left, so ArrowLeft is "next".
   */
  const onKeyDown = (event: React.KeyboardEvent, index: number) => {
    const last = filters.length - 1;
    let next: number | null = null;
    if (event.key === 'ArrowLeft' || event.key === 'ArrowDown') next = index === last ? 0 : index + 1;
    if (event.key === 'ArrowRight' || event.key === 'ArrowUp') next = index === 0 ? last : index - 1;
    if (event.key === 'Home') next = 0;
    if (event.key === 'End') next = last;
    if (next === null) return;
    event.preventDefault();
    setActive(filters[next].id);
    pillRefs.current[next]?.focus();
  };

  return (
    <div>
      {/*
        One scrolling row on a phone rather than wrapping to two: it keeps the
        grid higher on the screen, and the pills stay one thumb-swipe away.
        -mx/px lets the row run to the screen edge while the first pill still
        lines up with the page gutter.
      */}
      <div
        role="radiogroup"
        aria-label="סינון מוצרים לפי קטגוריה"
        className="scrollbar-none -mx-4 flex snap-x gap-2 overflow-x-auto px-4 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {filters.map((filter, index) => {
          const selected = active === filter.id;
          return (
            <button
              key={filter.id}
              ref={(node) => {
                pillRefs.current[index] = node;
              }}
              type="button"
              role="radio"
              aria-checked={selected}
              tabIndex={selected ? 0 : -1}
              onClick={() => setActive(filter.id)}
              onKeyDown={(event) => onKeyDown(event, index)}
              className={`h-11 shrink-0 snap-start rounded-full border px-5 text-sm font-bold whitespace-nowrap transition-colors duration-200 ${
                selected
                  ? 'border-brand-500 bg-brand-500 text-on-brand'
                  : 'border-ink-700 bg-white text-mist-300 hover:border-ink-600 hover:text-mist-100'
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      <p aria-live="polite" className="sr-only">
        {visible.length} מוצרים
      </p>

      <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
        {visible.map((product, index) => (
          <ProductCard key={product.slug} product={product} priority={index < 2} />
        ))}
      </div>
    </div>
  );
}
