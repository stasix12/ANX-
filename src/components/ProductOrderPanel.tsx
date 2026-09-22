'use client';

import { useState } from 'react';
import { AddToOrderButton } from '@/components/AddToOrderButton';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { BULK_THRESHOLD } from '@/lib/order';
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

      <div className="mt-5">
        <AddToOrderButton product={product} model={isCourse ? 'קורס 1 על 1' : model} size="md" />
        <WhatsAppButton
          productName={product.name}
          orderNote={isCourse ? undefined : `מתאים ל${model}`}
          size="md"
          variant="outline"
          label="הזמנה ישירה ב-WhatsApp"
          className="mt-2.5 w-full"
        />
      </div>

      <p className="mt-3 text-sm leading-relaxed text-mist-500">
        מזמינים {BULK_THRESHOLD} יחידות ומעלה? מוסיפים להזמנה ושולחים הכל בהודעה אחת — נחזור אליכם עם
        מחיר לכמות.
      </p>
    </div>
  );
}
