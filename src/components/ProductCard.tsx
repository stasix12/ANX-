import Image from 'next/image';
import Link from 'next/link';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { CheckIcon } from '@/components/icons';
import { formatPrice, type Product } from '@/lib/products';

export function ProductCard({ product, priority = false }: { product: Product; priority?: boolean }) {
  return (
    <article className="group overflow-hidden rounded-xl border border-ink-700 surface transition-colors duration-300 hover:border-brand-500/60">
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
          <span className="absolute top-1.5 start-1.5 rounded-full bg-brand-500 px-2 py-0.5 text-[10px] font-bold text-white">
            {product.badge}
          </span>
        ) : null}
      </Link>

      <div className="p-2.5">
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
          The buyer's first objection is "will this fit my machine?" — answering
          it on the card itself, not only inside the product page, is what keeps
          someone who never clicks through from bouncing.
        */}
        <p className="mt-1.5 flex items-center gap-1 text-[11px] font-semibold text-brand-700">
          <CheckIcon className="h-3 w-3 shrink-0" />
          מתאים למכונות Sabrina
        </p>

        <WhatsAppButton productName={product.name} size="xs" className="mt-2 w-full" />
      </div>
    </article>
  );
}
