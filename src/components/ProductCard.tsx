'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { AddToOrderButton } from '@/components/AddToOrderButton';
import { Price } from '@/components/Price';
import { ProductBadge } from '@/components/ProductBadge';
import { CheckIcon } from '@/components/icons';
import { sabrinaModels, type Product } from '@/lib/products';
import { orderLink } from '@/lib/site';

/** "סברינה מקסי" → "מקסי": the segment sits under a "מתאים לסברינה" label. */
const shortModel = (model: string) => model.replace(/^סברינה\s+/, '');

/**
 * A catalogue card built to sell: a large image in a neutral well, the name,
 * one line on what it does, which Sabrina it fits, a price you cannot miss,
 * and one orange "הוסף להזמנה". WhatsApp is not on the card any more — the
 * order list collects everything and goes out as one message from the cart,
 * and the product page still offers a direct chat.
 */
export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  // A course isn't ordered against a Sabrina model, so it skips the fit picker entirely.
  const isCourse = product.category === 'courses';
  const models = product.fitsModels ?? sabrinaModels;
  const [model, setModel] = useState<string>(models[0]);
  const hasSale = product.price !== undefined && product.salePrice !== undefined && product.salePrice < product.price;

  return (
    <article
      data-order-scope
      className="group relative flex flex-col overflow-hidden rounded-card border border-ink-700 surface transition-[box-shadow,border-color,transform] duration-200 hover:-translate-y-0.5 hover:border-ink-600 hover:shadow-[0_2px_4px_rgb(0_0_0/0.04),0_16px_32px_-16px_rgb(0_0_0/0.16)] motion-reduce:hover:translate-y-0"
    >
      <Link
        href={`/products/${product.slug}`}
        tabIndex={-1}
        aria-hidden
        className="relative block aspect-square overflow-hidden bg-ink-900"
      >
        <Image
          src={product.images[0]}
          alt={`${product.name} — תמונה ראשית`}
          fill
          loading={priority ? 'eager' : 'lazy'}
          priority={priority}
          sizes="(min-width: 1280px) 300px, (min-width: 768px) 32vw, 48vw"
          className="object-cover transition-transform duration-300 ease-out group-hover:scale-[1.03]"
        />
        {product.badge ? <ProductBadge label={product.badge} className="absolute top-2.5 start-2.5" /> : null}
        {!product.inStock ? (
          <span className="absolute top-2.5 end-2.5 rounded-md bg-mist-100/85 px-2 py-1 text-[11px] font-bold text-white">
            אזל מהמלאי
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <h3 className="text-[15px] leading-snug font-bold break-words text-mist-100 sm:text-base">
          <Link
            href={`/products/${product.slug}`}
            className="line-clamp-2 rounded after:absolute after:inset-0 after:content-[''] hover:text-brand-700"
          >
            {product.name}
          </Link>
        </h3>

        {product.tagline ? (
          <p className="mt-1 line-clamp-2 text-[13px] leading-snug text-mist-500">{product.tagline}</p>
        ) : null}

        {/*
          Which Sabrina it fits. One model → a plain confirmation line. Two →
          a compact segmented control, still native radios underneath (grouped
          keyboard navigation and screen-reader semantics come free). Each
          option carries its finished wa.me URL and model string in data-*
          so the exported static preview can wire it up without React.
          relative z-10 lifts the controls above the card-wide link overlay.
        */}
        {isCourse ? null : models.length === 1 ? (
          <p className="mt-2.5 flex items-center gap-1.5 text-xs font-semibold text-mist-300">
            <CheckIcon className="h-3.5 w-3.5 shrink-0 text-[#16a34a]" />
            מתאים ל{models[0]}
          </p>
        ) : (
          <fieldset className="relative z-10 mt-2.5">
            <legend className="flex items-center gap-1.5 text-xs font-semibold text-mist-300">
              <CheckIcon className="h-3.5 w-3.5 shrink-0 text-[#16a34a]" />
              מתאים לסברינה
              <span className="sr-only">— בחירת דגם עבור {product.name}</span>
            </legend>
            <div className="mt-1.5 grid grid-cols-2 gap-1 rounded-xl bg-ink-900 p-1">
              {models.map((option) => (
                <label
                  key={option}
                  className="grid h-9 cursor-pointer place-items-center rounded-lg text-xs font-bold text-mist-500 transition-colors duration-150 has-[:checked]:bg-white has-[:checked]:text-mist-100 has-[:checked]:shadow-[0_1px_3px_rgb(0_0_0/0.1)] has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-mist-100"
                >
                  <input
                    type="radio"
                    name={`fit-${product.slug}`}
                    value={option}
                    checked={model === option}
                    onChange={() => setModel(option)}
                    data-order-href={orderLink(product.name, `מתאים ל${option}`)}
                    data-order-model={`מתאים ל${option}`}
                    className="sr-only"
                  />
                  <span>{shortModel(option)}</span>
                </label>
              ))}
            </div>
          </fieldset>
        )}

        {/* mt-auto pins price + CTA to the bottom, aligned across a row of uneven cards. */}
        <div className="relative z-10 mt-auto pt-3">
          <p className="flex flex-wrap items-baseline gap-x-2 text-xl leading-tight font-extrabold text-mist-100 sm:text-[22px]">
            {product.price === undefined ? (
              <span className="text-sm font-semibold text-mist-500">מחיר לפי הזמנה</span>
            ) : hasSale ? (
              <>
                <Price value={product.salePrice!} />
                <Price value={product.price} className="text-sm font-semibold text-mist-500 line-through" />
              </>
            ) : (
              <Price value={product.price} />
            )}
          </p>
          <div className="mt-3">
            <AddToOrderButton product={product} model={isCourse ? 'קורס 1 על 1' : model} />
          </div>
        </div>
      </div>
    </article>
  );
}
