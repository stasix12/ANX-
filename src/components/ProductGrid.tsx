'use client';

import { useMemo, useState } from 'react';
import { ProductCard } from '@/components/ProductCard';
import { categories, type CategoryId, type Product } from '@/lib/products';

type Filter = CategoryId | 'all';

const filters: { id: Filter; label: string }[] = [
  { id: 'all', label: 'הכל' },
  ...categories.map((category) => ({ id: category.id as Filter, label: category.name })),
];

export function ProductGrid({ products }: { products: Product[] }) {
  const [active, setActive] = useState<Filter>('all');

  const visible = useMemo(
    () => (active === 'all' ? products : products.filter((p) => p.category === active)),
    [active, products],
  );

  return (
    <div>
      {/* Radio-group semantics so arrow keys and screen readers behave like a real filter. */}
      <div
        role="radiogroup"
        aria-label="סינון מוצרים לפי קטגוריה"
        className="flex flex-wrap gap-2"
      >
        {filters.map((filter) => {
          const selected = active === filter.id;
          return (
            <button
              key={filter.id}
              type="button"
              role="radio"
              aria-checked={selected}
              onClick={() => setActive(filter.id)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-bold transition-colors duration-200 sm:px-5 sm:py-2.5 ${
                selected
                  ? 'border-brand-500 bg-brand-500 text-on-brand'
                  : 'border-ink-700 text-mist-300 hover:border-brand-500/60 hover:text-mist-100'
              }`}
            >
              {filter.label}
            </button>
          );
        })}
      </div>

      <p aria-live="polite" className="mt-6 text-sm text-mist-500">
        {visible.length} מוצרים
      </p>

      <div className="mt-5 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3 xl:grid-cols-4">
        {visible.map((product) => (
          <ProductCard key={product.slug} product={product} />
        ))}
      </div>
    </div>
  );
}
