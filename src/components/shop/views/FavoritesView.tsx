'use client';

import { useShop } from '@/lib/shop/store';
import { ShopFrame } from '../Chrome';
import { IconHeart } from '../icons';
import { ProductGrid } from '../ProductCard';
import { EmptyState } from '../ui';

export function FavoritesView() {
  const s = useShop();
  const list = s.favorites
    .map((id) => s.db.products.find((p) => p.id === id && p.published))
    .filter((p): p is NonNullable<typeof p> => !!p);
  return (
    <ShopFrame nav="favorites" back="/shop">
      <div className="mx-auto max-w-7xl px-4 lg:px-8 lg:pt-8">
        <h1 className="mb-4 text-center text-[24px] font-black lg:text-start lg:text-3xl">
          מועדפים {s.ready && <span>({list.length})</span>}
        </h1>
        {!s.ready ? null : list.length ? (
          <ProductGrid products={list} />
        ) : (
          <EmptyState
            icon={<IconHeart size={34} />}
            title="אין עדיין מועדפים"
            text="לחצו על הלב שעל מוצר כדי לשמור אותו כאן."
            action={{ label: 'לגלות מוצרים', href: '/shop/c/all' }}
          />
        )}
      </div>
    </ShopFrame>
  );
}
