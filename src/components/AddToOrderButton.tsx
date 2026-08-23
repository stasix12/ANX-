'use client';

import { useEffect, useState } from 'react';
import { useOrderList } from '@/components/OrderListProvider';
import { CheckIcon } from '@/components/icons';
import { singleLine } from '@/lib/order';
import type { Product } from '@/lib/products';

/**
 * Adds one unit to the order list, then confirms in place for a moment. The
 * confirmation matters: the list bar sits at the bottom of the screen, so
 * without feedback at the button there is nothing to show the tap registered.
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

  useEffect(() => {
    if (!added) return;
    const timer = window.setTimeout(() => setAdded(false), 1600);
    return () => window.clearTimeout(timer);
  }, [added]);

  const scale =
    size === 'md'
      ? 'mt-3 gap-2 px-6 py-3.5 text-base'
      : 'mt-1.5 gap-1 px-2.5 py-1.5 text-[11px]';

  const line = singleLine(product, `מתאים ל${model}`);

  return (
    <button
      type="button"
      onClick={() => {
        add(line);
        setAdded(true);
      }}
      aria-live="polite"
      /*
       * The line travels in the markup so the exported static preview — where
       * React never boots — can rebuild the same list without re-deriving it
       * from product data it does not have.
       */
      data-order-line={JSON.stringify(line)}
      className={`inline-flex w-full items-center justify-center rounded-full border font-bold transition-colors duration-200 ${scale} ${
        added
          ? 'border-brand-500 bg-brand-500/10 text-brand-700'
          : 'border-ink-600 text-mist-300 hover:border-brand-500 hover:text-brand-700'
      }`}
    >
      {added ? (
        <>
          <CheckIcon className={size === 'md' ? 'h-5 w-5' : 'h-3 w-3'} />
          נוסף לרשימה
        </>
      ) : (
        '+ הוספה לרשימת הזמנה'
      )}
    </button>
  );
}
