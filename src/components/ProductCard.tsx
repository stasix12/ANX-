import Image from 'next/image';
import Link from 'next/link';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { CheckIcon } from '@/components/icons';
import { formatPrice, type Product } from '@/lib/products';

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-card border border-ink-700 surface transition-colors duration-300 hover:border-brand-500/60">
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
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        {product.badge ? (
          <span className="absolute top-4 start-4 rounded-full bg-brand-500 px-3 py-1 text-xs font-bold text-white">
            {product.badge}
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-5 sm:p-6">
        <h3 className="text-xl font-bold tracking-tight">
          <Link
            href={`/products/${product.slug}`}
            className="rounded transition-colors duration-200 hover:text-brand-300"
          >
            {product.name}
          </Link>
        </h3>

        <p className="mt-2.5 text-sm leading-relaxed text-mist-300">{product.tagline}</p>

        <p className="mt-4 inline-flex w-fit items-center gap-1.5 rounded-full border border-brand-500/35 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-300">
          <CheckIcon className="h-3.5 w-3.5" />
          מתאים ל-Sabrina
        </p>

        <p className="mt-5 text-lg font-extrabold text-mist-100">
          {product.price !== undefined ? (
            formatPrice(product.price)
          ) : (
            <span className="text-base font-semibold text-mist-500">לפרטי מחיר בוואטסאפ</span>
          )}
        </p>

        {/* Stacked rather than side by side: at three-column width the Hebrew
            "הזמנה ב-WhatsApp" label wraps inside a half-width button. */}
        <div className="mt-5 flex flex-col gap-2.5 border-t border-ink-700 pt-5">
          <Link
            href={`/products/${product.slug}`}
            className="inline-flex flex-1 items-center justify-center rounded-full border border-ink-600 px-5 py-3 text-sm font-bold text-mist-100 transition-colors duration-200 hover:border-brand-500 hover:text-brand-300"
          >
            לפרטים
          </Link>
          <WhatsAppButton productName={product.name} size="sm" className="flex-1" />
        </div>
      </div>
    </article>
  );
}
