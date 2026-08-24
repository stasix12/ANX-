'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { ProductGallery } from '@/components/ProductGallery';
import { ProductOrderPanel } from '@/components/ProductOrderPanel';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { CheckIcon, MachineIcon, TruckIcon } from '@/components/icons';
import { categoryName, fetchProductBySlug, fetchPublishedProducts, formatPrice, type Product } from '@/lib/products';
import { site } from '@/lib/site';

/**
 * Re-fetches the product (and its related list) from Supabase on mount, so a
 * price or stock change the admin just saved shows up without waiting for
 * the next deploy. `initialProduct`/`initialRelated` — rendered server-side
 * at build time — cover first paint and SEO; this only replaces them if the
 * live fetch actually succeeds, so a flaky connection just keeps showing the
 * build-time snapshot instead of breaking the page.
 */
export function ProductDetail({
  slug,
  initialProduct,
  initialRelated,
}: {
  slug: string;
  initialProduct: Product;
  initialRelated: Product[];
}) {
  const [product, setProduct] = useState(initialProduct);
  const [related, setRelated] = useState(initialRelated);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      const [fresh, all] = await Promise.all([fetchProductBySlug(slug), fetchPublishedProducts()]);
      if (cancelled) return;
      if (fresh) setProduct(fresh);
      if (all.length > 0) {
        setRelated(
          all.filter((item) => item.category === (fresh ?? product).category && item.slug !== slug).slice(0, 3),
        );
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const hasSale = product.salePrice !== undefined && product.price !== undefined && product.salePrice < product.price;

  return (
    <>
      <nav aria-label="מסלול ניווט" className="text-sm text-mist-500">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="transition-colors hover:text-brand-700">
              דף הבית
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href="/#products" className="transition-colors hover:text-brand-700">
              {categoryName(product.category)}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="text-mist-300">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="mt-8 grid gap-10 lg:grid-cols-2 lg:gap-14">
        <ProductGallery images={product.images} productName={product.name} video={product.video} />

        <div>
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-700 uppercase">
            {categoryName(product.category)}
          </p>
          <h1 className="mt-3 text-3xl font-extrabold tracking-tight text-balance-he sm:text-4xl">
            {product.name}
          </h1>

          <div className="mt-4 flex flex-wrap items-center gap-3">
            <span className="inline-flex items-center gap-1.5 rounded-full border border-brand-500/35 bg-brand-500/10 px-3 py-1.5 text-xs font-semibold text-brand-700">
              <CheckIcon className="h-3.5 w-3.5" />
              מתאים ל-Sabrina
            </span>
            {product.badge ? (
              <span className="rounded-full bg-brand-500 px-3 py-1.5 text-xs font-bold text-on-brand">
                {product.badge}
              </span>
            ) : null}
            {!product.inStock ? (
              <span className="rounded-full bg-mist-500/15 px-3 py-1.5 text-xs font-bold text-mist-500">
                אזל מהמלאי
              </span>
            ) : null}
          </div>

          {/* whitespace-pre-line: longer descriptions are written in paragraphs,
              and HTML would otherwise run them together. */}
          <p className="mt-6 text-base leading-relaxed whitespace-pre-line text-mist-300 sm:text-lg">
            {product.description}
          </p>

          <p className="mt-7 flex items-baseline gap-2.5 text-3xl font-extrabold">
            {product.price === undefined ? (
              <span className="text-xl font-semibold text-mist-500">לפרטי מחיר בוואטסאפ</span>
            ) : hasSale ? (
              <>
                <span>{formatPrice(product.salePrice!)}</span>
                <span className="text-lg font-semibold text-mist-500 line-through">
                  {formatPrice(product.price)}
                </span>
              </>
            ) : (
              formatPrice(product.price)
            )}
          </p>

          <ProductOrderPanel product={product} />

          <div className="mt-8 flex items-start gap-3.5 rounded-2xl border border-ink-700 surface p-5">
            <TruckIcon className="mt-0.5 h-6 w-6 shrink-0 text-brand-600" />
            <div>
              <p className="font-bold">{site.shippingNote}</p>
              <p className="mt-1 text-sm text-mist-300">
                מועד אספקה משוער נמסר בוואטסאפ בעת ההזמנה.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-14 grid gap-6 lg:grid-cols-2 lg:gap-8">
        <section aria-labelledby="compatibility-title" className="rounded-card border border-ink-700 surface p-6 sm:p-7">
          <h2 id="compatibility-title" className="flex items-center gap-2.5 text-xl font-bold">
            <MachineIcon className="h-6 w-6 text-brand-600" />
            התאמה למכונות
          </h2>
          <ul className="mt-5 space-y-3">
            {product.compatibility.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-mist-300">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="variants-title" className="rounded-card border border-ink-700 surface p-6 sm:p-7">
          <h2 id="variants-title" className="text-xl font-bold">
            אפשרויות בחירה
          </h2>
          <p className="mt-2 text-sm text-mist-500">בוחרים את הווריאציה איתנו בצ׳אט הוואטסאפ בעת ההזמנה.</p>
          <div className="mt-5 space-y-5">
            {product.variants.map((group) => (
              <div key={group.id}>
                <h3 className="text-sm font-bold text-mist-100">{group.label}</h3>
                <ul className="mt-2.5 flex flex-wrap gap-2">
                  {group.options.map((option) => (
                    <li key={option} className="rounded-full border border-ink-600 px-4 py-2 text-sm text-mist-300">
                      {option}
                    </li>
                  ))}
                </ul>
              </div>
            ))}
          </div>
        </section>

        <section aria-labelledby="highlights-title" className="rounded-card border border-ink-700 surface p-6 sm:p-7">
          <h2 id="highlights-title" className="text-xl font-bold">
            יתרונות
          </h2>
          <ul className="mt-5 space-y-3">
            {product.highlights.map((item) => (
              <li key={item} className="flex items-start gap-2.5 text-sm text-mist-300">
                <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-brand-600" />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="specs-title" className="rounded-card border border-ink-700 surface p-6 sm:p-7">
          <h2 id="specs-title" className="text-xl font-bold">
            מפרט טכני
          </h2>
          <dl className="mt-5 divide-y divide-ink-700">
            {product.specs.map((spec) => (
              <div key={spec.label} className="flex items-center justify-between gap-4 py-3">
                <dt className="text-sm text-mist-500">{spec.label}</dt>
                <dd className="text-sm font-semibold text-mist-100">{spec.value}</dd>
              </div>
            ))}
          </dl>
        </section>
      </div>

      <div className="mt-12 rounded-card border border-brand-500/30 surface p-7 text-center sm:p-10">
        <h2 className="text-2xl font-extrabold tracking-tight sm:text-3xl">רוצים להזמין את {product.name}?</h2>
        <p className="mx-auto mt-3 max-w-lg text-mist-300">
          שולחים הודעה, סוגרים וריאציה ופרטי משלוח, ואנחנו יוצאים לדרך. {site.shippingNote}.
        </p>
        <div className="mt-7 flex justify-center">
          <WhatsAppButton productName={product.name} size="lg" label="הזמנה ב-WhatsApp" />
        </div>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related-title" className="mt-16">
          <h2 id="related-title" className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            מוצרים נוספים בקטגוריה
          </h2>
          <div className="mt-8 grid grid-cols-2 gap-2.5 sm:gap-4 lg:grid-cols-3">
            {related.map((item) => (
              <ProductCard key={item.slug} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
