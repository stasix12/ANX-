import Image from 'next/image';
import Link from 'next/link';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { CheckIcon } from '@/components/icons';
import { formatPrice, type Product } from '@/lib/products';

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  return (
    <article className="group flex flex-col overflow-hidden rounded-2xl border border-ink-700 surface transition-colors duration-300 hover:border-brand-500/60">
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
          className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
        />
        {product.badge ? (
          <span className="absolute top-2 start-2 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white">
            {product.badge}
          </span>
        ) : null}
      </Link>

      <div className="flex flex-1 flex-col p-3 sm:p-4">
        <h3 className="text-sm leading-snug font-bold tracking-tight sm:text-base">
          <Link
            href={`/products/${product.slug}`}
            className="line-clamp-2 rounded transition-colors duration-200 hover:text-brand-700"
          >
            {product.name}
          </Link>
        </h3>

        <p className="mt-1.5 inline-flex w-fit items-center gap-1 text-[11px] font-semibold text-brand-700">
          <CheckIcon className="h-3 w-3" />
          מתאים ל-Sabrina
        </p>

        <p className="mt-2 text-base font-extrabold text-mist-100 sm:text-lg">
          {product.price !== undefined ? (
            formatPrice(product.price)
          ) : (
            <span className="text-xs font-semibold text-mist-500">לפרטי מחיר בוואטסאפ</span>
          )}
        </p>

        <div className="mt-3 flex flex-col gap-1.5 border-t border-ink-700 pt-3">
          <WhatsAppButton productName={product.name} size="xs" className="w-full" />
          <Link
            href={`/products/${product.slug}`}
            className="inline-flex items-center justify-center rounded-full border border-ink-600 px-3 py-2 text-xs font-bold text-mist-100 transition-colors duration-200 hover:border-brand-500 hover:text-brand-700"
          >
            לפרטים
          </Link>
        </div>
      </div>
    </article>
  );
}
