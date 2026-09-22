'use client';

import { useEffect, useRef, useState } from 'react';
import { AddToOrderButton } from '@/components/AddToOrderButton';
import { useOrderList } from '@/components/OrderListProvider';
import { Price } from '@/components/Price';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { BULK_THRESHOLD, orderItemCount } from '@/lib/order';
import { sabrinaModels, type Product } from '@/lib/products';

/**
 * The order controls on a product page: pick the Sabrina fit, then add it to
 * the order (the primary, orange action) — or, secondary, ask about it
 * straight away in WhatsApp.
 *
 * The model has to be chosen here rather than left to the chat, so the order
 * arrives already specified — and so the same choice can travel with the line
 * when it goes into a multi-item list.
 */
export function ProductOrderPanel({ product }: { product: Product }) {
  // A course isn't ordered against a Sabrina model, so it skips the fit picker entirely.
  const isCourse = product.category === 'courses';
  const models = product.fitsModels ?? sabrinaModels;
  const [model, setModel] = useState<string>(models[0]);
  const orderModel = isCourse ? 'קורס 1 על 1' : model;
  const ctaRef = useRef<HTMLDivElement>(null);
  const showSticky = useStickyCta(ctaRef);
  const { lines, ready } = useOrderList();
  const barShowing = ready && orderItemCount(lines) > 0;
  const price = product.salePrice !== undefined && product.price !== undefined && product.salePrice < product.price
    ? product.salePrice
    : product.price;

  return (
    <div data-order-scope className="mt-6">
      {isCourse ? null : (
        <fieldset>
          <legend className="text-sm font-bold text-mist-100">דגם המכונה שלכם</legend>
          <div className="mt-2.5 grid grid-cols-2 gap-2">
            {models.map((option) => (
              <label
                key={option}
                className="flex min-h-12 cursor-pointer items-center gap-2.5 rounded-xl border border-ink-700 bg-white px-3.5 py-2.5 text-sm font-semibold text-mist-300 transition-colors duration-200 hover:border-ink-600 has-[:checked]:border-mist-100 has-[:checked]:text-mist-100 has-[:checked]:shadow-[inset_0_0_0_1px_var(--color-mist-100)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-mist-100"
              >
                <input
                  type="radio"
                  name={`fit-page-${product.slug}`}
                  value={option}
                  checked={model === option}
                  onChange={() => setModel(option)}
                  data-order-model={`מתאים ל${option}`}
                  className="h-[18px] w-[18px] shrink-0 appearance-none rounded-full border-2 border-ink-600 bg-white transition-colors duration-200 checked:border-brand-500 checked:bg-brand-500 checked:shadow-[inset_0_0_0_3px_#fff]"
                />
                <span>{option}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div ref={ctaRef} className="mt-5">
        <AddToOrderButton product={product} model={orderModel} size="md" />
        <WhatsAppButton
          productName={product.name}
          orderNote={isCourse ? undefined : `מתאים ל${model}`}
          size="md"
          variant="outline"
          label="הזמנה ישירה בוואטסאפ"
          className="mt-2.5 w-full"
        />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-mist-500">
        מזמינים {BULK_THRESHOLD} יחידות ומעלה? מוסיפים להזמנה ושולחים הכל בהודעה אחת — נחזור אליכם עם
        מחיר לכמות.
      </p>

      {/*
        Phones only: while the button above is off screen (the gallery pushes
        it below the first screen), a slim bar keeps price + add one thumb
        away. It sits above the order bar when that is showing, and steps
        aside near the page end so it never covers the footer.
      */}
      {showSticky ? (
        <div
          className={`order-bar-in fixed inset-x-0 z-40 border-t border-ink-700 bg-white/95 px-3 py-2.5 shadow-[0_-4px_20px_rgb(0_0_0/0.06)] backdrop-blur-lg lg:hidden ${
            barShowing ? 'bottom-[calc(4.25rem+env(safe-area-inset-bottom))]' : 'bottom-0 pb-[calc(0.625rem+env(safe-area-inset-bottom))]'
          }`}
        >
          <div className="flex items-center gap-3">
            <div className="min-w-0 flex-1 leading-tight">
              <p className="truncate text-xs text-mist-500">
                {product.name}
                {isCourse ? '' : ` · ${model}`}
              </p>
              <p className="text-lg font-extrabold">
                {price === undefined ? <span className="text-sm text-mist-500">מחיר בפנייה</span> : <Price value={price} />}
              </p>
            </div>
            <div className="w-40 shrink-0">
              <AddToOrderButton product={product} model={orderModel} />
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

/** True while the watched element is out of view and the page end is not near. */
function useStickyCta(ref: React.RefObject<HTMLElement | null>) {
  const [show, setShow] = useState(false);
  useEffect(() => {
    const update = () => {
      const element = ref.current;
      if (!element) return;
      const rect = element.getBoundingClientRect();
      const offScreen = rect.bottom < 0 || rect.top > window.innerHeight;
      const nearEnd = window.innerHeight + window.scrollY > document.documentElement.scrollHeight - 320;
      setShow(offScreen && !nearEnd);
    };
    update();
    window.addEventListener('scroll', update, { passive: true });
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update);
      window.removeEventListener('resize', update);
    };
  }, [ref]);
  return show;
}
