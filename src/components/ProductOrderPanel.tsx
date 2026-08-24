'use client';

import { useState } from 'react';
import { AddToOrderButton } from '@/components/AddToOrderButton';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { BULK_THRESHOLD } from '@/lib/order';
import { sabrinaModels, type Product } from '@/lib/products';

/**
 * The order controls on a product page: pick the Sabrina fit, then either send
 * a one-product message or add it to the list and keep browsing.
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

  return (
    <div data-order-scope className="mt-6">
      {isCourse ? null : (
        <fieldset className="rounded-card border border-ink-700 surface p-4">
          <legend className="px-1 text-xs font-bold text-mist-300">בחרו את דגם המכונה</legend>
          <div className="mt-1 grid gap-2 sm:grid-cols-2">
            {models.map((option) => (
              <label
                key={option}
                className="flex cursor-pointer items-center gap-2.5 rounded-xl border border-ink-700 px-3 py-2.5 text-sm font-semibold text-mist-300 transition-colors duration-200 has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500/10 has-[:checked]:text-brand-700"
              >
                <input
                  type="radio"
                  name={`fit-page-${product.slug}`}
                  value={option}
                  checked={model === option}
                  onChange={() => setModel(option)}
                  data-order-model={`מתאים ל${option}`}
                  className="h-4 w-4 shrink-0 appearance-none rounded-[3px] border border-ink-600 bg-ink-850 transition-colors duration-200 checked:border-brand-500 checked:bg-brand-500 checked:shadow-[inset_0_0_0_3px_var(--color-on-brand)]"
                />
                <span>מתאים ל{option}</span>
              </label>
            ))}
          </div>
        </fieldset>
      )}

      <div className="mt-4">
        <WhatsAppButton
          productName={product.name}
          orderNote={isCourse ? undefined : `מתאים ל${model}`}
          size="lg"
          label="הזמנה ב-WhatsApp"
          className="w-full"
        />
        <AddToOrderButton product={product} model={isCourse ? 'קורס 1 על 1' : model} size="md" />
      </div>

      <p className="mt-3 text-sm text-mist-500">
        מזמינים {BULK_THRESHOLD} יחידות ומעלה? הוסיפו לרשימה ושלחו הכל בהודעה אחת — נחזור אליכם עם
        מחיר לכמות.
      </p>
    </div>
  );
}
