'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useState } from 'react';
import { AddToOrderButton } from '@/components/AddToOrderButton';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { formatPrice, sabrinaModels, type Product } from '@/lib/products';
import { orderLink } from '@/lib/site';

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  const models = product.fitsModels ?? sabrinaModels;
  const [model, setModel] = useState<string>(models[0]);

  return (
    <article
      data-order-scope
      className="group flex flex-col overflow-hidden rounded-xl border border-ink-700 surface transition-colors duration-300 hover:border-brand-500/60"
    >
      <Link
        href={`/products/${product.slug}`}
        tabIndex={-1}
        aria-hidden
        className="relative block aspect-square overflow-hidden bg-ink-850"
      >
        <Image
          src={product.images[0]}
          alt={`${product.name} — תמונה ראשית`}
          fill
          loading={priority ? 'eager' : 'lazy'}
          priority={priority}
          sizes="(min-width: 1024px) 25vw, 45vw"
          className="object-contain transition-transform duration-500 group-hover:scale-[1.04]"
        />
        {product.badge ? (
          <span className="absolute top-1.5 start-1.5 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white">
            {product.badge}
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-2.5">
        <p className="text-sm font-extrabold text-mist-100">
          {product.price !== undefined ? (
            formatPrice(product.price)
          ) : (
            <span className="text-xs font-semibold text-mist-500">מחיר בוואטסאפ</span>
          )}
        </p>

        <h3 className="mt-0.5 text-xs leading-snug font-medium text-mist-300">
          <Link
            href={`/products/${product.slug}`}
            className="line-clamp-2 rounded transition-colors duration-200 hover:text-brand-700"
          >
            {product.name}
          </Link>
        </h3>

        {/*
          Laid out as separated rows with a square tick, matching the variant
          picker on the shop this was modelled on — small inline dots did not
          read as something you could tap. The whole row is the label, so the
          tap target is the full width rather than the 14px box.

          Still native radios underneath: grouped keyboard navigation and
          screen-reader semantics come for free. Each option carries its
          finished wa.me URL in data-order-href so the exported static preview
          can wire this up without rebuilding the message. The box is drawn
          with appearance-none because the native unchecked state renders as a
          solid dark disc that reads as "selected" next to the real one.
        */}
        <fieldset className="mt-2">
          <legend className="sr-only">בחירת דגם מכונה עבור {product.name}</legend>
          {models.map((option) => (
            <label
              key={option}
              className="flex cursor-pointer items-center gap-2 border-t border-ink-700 py-2 text-[11px] font-semibold text-mist-300 transition-colors duration-200 has-[:checked]:text-brand-700"
            >
              <input
                type="radio"
                name={`fit-${product.slug}`}
                value={option}
                checked={model === option}
                onChange={() => setModel(option)}
                data-order-href={orderLink(product.name, `מתאים ל${option}`)}
                data-order-model={`מתאים ל${option}`}
                className="h-3.5 w-3.5 shrink-0 appearance-none rounded-[3px] border border-ink-600 bg-white transition-colors duration-200 checked:border-brand-500 checked:bg-brand-500 checked:shadow-[inset_0_0_0_2px_white]"
              />
              <span>מתאים ל{option}</span>
            </label>
          ))}
        </fieldset>

        {/*
          Two paths on purpose. The green button is the one-tap order for
          someone buying a single part; the add button builds a list so an
          order of several parts is one WhatsApp message instead of one per
          product, which is what made ordering in bulk tedious before.
          mt-auto keeps them aligned across a row of uneven-height cards.
        */}
        <div className="mt-auto border-t border-ink-700 pt-2">
          <WhatsAppButton
            productName={product.name}
            orderNote={`מתאים ל${model}`}
            size="xs"
            className="w-full"
          />
          <AddToOrderButton product={product} model={model} />
        </div>
      </div>
    </article>
  );
}
