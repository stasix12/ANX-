'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { cardImage, inStock, productHref, purchasable } from '@/lib/shop/logic';
import { STATIC_PRODUCT_SLUGS } from '@/lib/shop/static';
import { actions, useShop } from '@/lib/shop/store';
import type { Product } from '@/lib/shop/types';
import { IconCart, IconHeart } from './icons';
import { Img, Price, Stars, toast } from './ui';

export function FavoriteButton({ product, className = '', size = 'sm' }: { product: Product; className?: string; size?: 'sm' | 'lg' }) {
  const s = useShop();
  const on = s.favorites.includes(product.id);
  const dim = size === 'lg' ? 'size-11' : 'size-8';
  return (
    <button
      type="button"
      aria-pressed={on}
      aria-label={on ? `הסרת ${product.name} מהמועדפים` : `הוספת ${product.name} למועדפים`}
      onClick={(e) => {
        e.preventDefault();
        e.stopPropagation();
        const added = actions.toggleFavorite(product.id);
        toast(added ? 'נוסף למועדפים' : 'הוסר מהמועדפים', added ? { href: '/shop/favorites', label: 'למועדפים' } : undefined);
      }}
      className={`grid ${dim} place-items-center rounded-full transition active:scale-90 ${
        size === 'lg' ? 'bg-black/35 text-white backdrop-blur-sm' : `bg-white shadow-[0_1px_4px_rgb(0_0_0/0.12)] ${on ? 'text-x-blue' : 'text-x-ink'}`
      } ${className}`}
    >
      <IconHeart size={size === 'lg' ? 24 : 17} filled={on} />
    </button>
  );
}

export function addProductToCart(product: Product, colorId?: string | null, qty = 1, options: Record<string, string> = {}) {
  const color = colorId === undefined ? (product.colors[0]?.id ?? null) : colorId;
  const r = actions.addToCart(product.id, color, qty, options);
  if (!r.ok) return toast(r.error);
  const colorName = product.colors.find((c) => c.id === color)?.name;
  toast(`${product.name}${colorName ? ` · ${colorName}` : ''} נוסף לסל`, { href: '/shop/cart', label: 'לעגלה' });
}

/**
 * Product card from the design: photo with a heart chip, bold name, blue
 * stars + count, price on the left and the square cart button on the right.
 */
export function ProductCard({
  product,
  accent = 'blue',
  compact,
  priority,
}: {
  product: Product;
  accent?: 'blue' | 'violet';
  /** The tighter 3-up card of the home page's featured row. */
  compact?: boolean;
  priority?: boolean;
}) {
  const router = useRouter();
  const href = productHref(product, STATIC_PRODUCT_SLUGS);
  const available = inStock(product);
  const priced = product.price !== null;
  // A product with versions to choose (or no price yet) is ordered from its page.
  const direct = purchasable(product) && !product.variants.length;
  const note = product.imageNotes[cardImage(product)];
  return (
    <article dir="rtl" className="group relative flex flex-col overflow-hidden rounded-[14px] bg-white shadow-x-card ring-1 ring-x-line/60 transition hover:shadow-x-pop">
      <Link href={href} className="absolute inset-0 z-0" aria-label={product.name} />
      <div className={`pointer-events-none relative overflow-hidden bg-x-soft ${compact ? 'aspect-[1/0.86]' : 'aspect-[1/0.92]'}`}>
        <Img path={cardImage(product)} alt={product.name} eager={priority} className="size-full object-cover transition duration-500 group-hover:scale-[1.04]" />
        <FavoriteButton product={product} className={`pointer-events-auto absolute z-10 ${compact ? 'top-1.5 left-1.5 size-7!' : 'top-2 left-2'}`} />
        {note && (
          <span className="absolute bottom-1.5 left-1.5 rounded-full bg-black/45 px-1.5 py-0.5 text-[9px] font-semibold text-white/90 backdrop-blur-sm">{note}</span>
        )}
        {!available && (
          <span className="absolute right-2 bottom-2 rounded-full bg-x-ink/80 px-2 py-0.5 text-[11px] font-bold text-white">אזל מהמלאי</span>
        )}
      </div>
      <div className={`pointer-events-none relative flex flex-1 flex-col ${compact ? 'px-2 pt-2 pb-2' : 'px-3 pt-2.5 pb-3'}`}>
        <h3 className={`truncate font-extrabold text-x-ink ${compact ? 'text-[13px]' : 'text-[15px]'}`}>{product.name}</h3>
        {product.subtitle && <p className={`truncate font-semibold text-x-ink-2 ${compact ? 'text-[12px]' : 'text-[14px]'}`}>{product.subtitle}</p>}
        <div className="mt-1">
          <Stars rating={product.rating} count={product.reviewCount} size={compact ? 11 : 13} />
        </div>
        <div className="mt-auto flex items-end justify-between pt-2">
          <button
            type="button"
            disabled={!available}
            aria-label={direct ? `הוספת ${product.name} לסל` : `לפרטים ולהזמנה — ${product.name}`}
            onClick={() => (direct ? addProductToCart(product) : router.push(href))}
            className={`pointer-events-auto relative z-10 grid place-items-center rounded-[10px] text-white shadow-[0_4px_10px_rgb(60_80_250/0.25)] transition active:scale-90 disabled:bg-x-faint! disabled:shadow-none ${
              compact ? 'size-9' : 'size-10'
            } ${accent === 'violet' ? 'bg-x-violet hover:bg-x-violet-600' : 'bg-x-indigo hover:bg-x-violet-600'}`}
          >
            <IconCart size={compact ? 19 : 21} />
          </button>
          {priced ? (
            <Price value={product.price as number} className={compact ? 'text-[17px]' : 'text-[19px]'} />
          ) : (
            <span className={`font-bold text-x-muted ${compact ? 'text-[11px]' : 'text-[13px]'}`}>מחיר יעודכן</span>
          )}
        </div>
      </div>
    </article>
  );
}

export function ProductGrid({ products, alternate, className = '' }: { products: Product[]; alternate?: boolean; className?: string }) {
  return (
    // dir=ltr: the design fills the grid from the left (first product top-left).
    <div dir="ltr" className={`grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 lg:gap-5 xl:grid-cols-5 ${className}`}>
      {products.map((p, i) => (
        // The design alternates blue/violet cart buttons by column in the catalogue.
        <ProductCard key={p.id} product={p} accent={alternate && i % 2 === 1 ? 'violet' : 'blue'} priority={i < 4} />
      ))}
    </div>
  );
}
