'use client';

import { useEffect, useState } from 'react';
import { useOrderList } from '@/components/OrderListProvider';
import { CartIcon, CheckIcon } from '@/components/icons';
import { singleLine } from '@/lib/order';
import type { Product } from '@/lib/products';

/**
 * The store's primary action: adds one unit to the order list, then confirms
 * in place for a moment ("✓ נוסף להזמנה"). The confirmation matters — the
 * list lives in the header cart and the bottom bar, so without feedback at the
 * button there is nothing where the eye is to show the tap registered. Screen
 * readers get the same news from the provider's live region.
 *
 * Out-of-stock products cannot be added; the button says so instead.
 */
export function AddToOrderButton({
  product,
  model,
  size = 'xs',
}: {
  product: Product;
  model: string;
  size?: 'xs' | 'md';
}) {
  const { add } = useOrderList();
  const [added, setAdded] = useState(false);

  // The confirmation belongs to the model it was given for — switching the
  // Sabrina fit must not leave "נוסף" on a choice that was never added.
  useEffect(() => setAdded(false), [model]);

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 1600);
    return () => window.clearTimeout(timer);
  }, [added]);

  const scale =
    size === 'md'
      ? 'h-13 gap-2 px-6 text-base'
      : 'h-11 gap-1.5 px-3 text-sm';
  const icon = size === 'md' ? 'h-5 w-5' : 'h-4 w-4';

  const line = singleLine(product, `מתאים ל${model}`);

  if (!product.inStock) {
    return (
      <button
        type="button"
        disabled
        className={`inline-flex w-full cursor-not-allowed items-center justify-center rounded-xl border border-ink-700 bg-ink-900 font-bold text-mist-500 ${scale}`}
      >
        אזל מהמלאי
      </button>
    );
  }

  return (
    <button
      type="button"
      onClick={() => {
        add(line);
        setAdded(true);
      }}
      /*
       * The line travels in the markup so the exported static preview — where
       * React never boots — can rebuild the same list without re-deriving it
       * from product data it does not have.
       */
      data-order-line={JSON.stringify(line)}
      className={`inline-flex w-full items-center justify-center rounded-xl border font-bold whitespace-nowrap transition-[background-color,border-color,color,transform] duration-200 active:scale-[0.98] ${scale} ${
        added
          ? 'border-brand-500 bg-white text-brand-700'
          : 'border-brand-500 bg-brand-500 text-on-brand hover:border-brand-600 hover:bg-brand-600'
      }`}
    >
      {added ? (
        <>
          <CheckIcon className={icon} />
          נוסף להזמנה
        </>
      ) : (
        <>
          <CartIcon className={icon} />
          הוסף להזמנה
        </>
      )}
    </button>
  );
}
