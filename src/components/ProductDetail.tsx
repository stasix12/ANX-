'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import { ProductCard } from '@/components/ProductCard';
import { ProductGallery } from '@/components/ProductGallery';
import { ProductOrderPanel } from '@/components/ProductOrderPanel';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { Price } from '@/components/Price';
import { ProductBadge } from '@/components/ProductBadge';
import { CheckIcon, MachineIcon, TruckIcon } from '@/components/icons';
import { categoryName, fetchProductBySlug, fetchPublishedProducts, relatedProducts, type Product } from '@/lib/products';
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
      if (all.length > 0) setRelated(relatedProducts(all, fresh ?? product));
    })();
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const hasSale = product.salePrice !== undefined && product.price !== undefined && product.salePrice < product.price;

  return (
    <>
      <nav aria-label="מסלול ניווט" className="text-[13px] text-mist-500">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href="/" className="inline-block py-2 transition-colors hover:text-mist-100">
              דף הבית
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li>
            <Link href="/#products" className="inline-block py-2 transition-colors hover:text-mist-100">
              {categoryName(product.category)}
            </Link>
          </li>
          <li aria-hidden>/</li>
          <li aria-current="page" className="line-clamp-1 text-mist-300">
            {product.name}
          </li>
        </ol>
      </nav>

      <div className="mt-4 grid gap-8 sm:mt-6 lg:grid-cols-2 lg:gap-14">
        <ProductGallery images={product.images} productName={product.name} video={product.video} />

        <div>
          <p className="text-sm font-bold text-brand-700">{categoryName(product.category)}</p>
          <h1 className="mt-2 text-[28px] leading-tight font-extrabold tracking-tight break-words text-balance-he sm:text-4xl">
            {product.name}
          </h1>
          {product.tagline ? <p className="mt-2 text-base text-mist-500">{product.tagline}</p> : null}

          <div className="mt-4 flex flex-wrap items-center gap-2">
            {product.category === 'courses' ? null : (
              <span className="inline-flex items-center gap-1.5 rounded-md border border-[#bbf7d0] bg-[#f0fdf4] px-2.5 py-1.5 text-xs font-bold text-[#15803d]">
                <CheckIcon className="h-3.5 w-3.5" />
                מתאים לסברינה
              </span>
            )}
            {product.badge ? <ProductBadge label={product.badge} className="py-1.5 text-xs" /> : null}
            {!product.inStock ? (
              <span className="rounded-md bg-ink-800 px-2.5 py-1.5 text-xs font-bold text-mist-500">אזל מהמלאי</span>
            ) : null}
          </div>

          <p className="mt-6 flex flex-wrap items-baseline gap-x-3 text-[34px] leading-none font-extrabold sm:text-4xl">
            {product.price === undefined ? (
              <span className="text-xl font-semibold text-mist-500">מחיר בפנייה</span>
            ) : hasSale ? (
              <>
                <Price value={product.salePrice!} />
                <Price value={product.price} className="text-lg font-semibold text-mist-500 line-through" />
              </>
            ) : (
              <Price value={product.price} />
            )}
          </p>
          <p className="mt-2 text-xs text-mist-500">המחיר כולל מע״מ</p>

          <ProductOrderPanel product={product} />

          {/* whitespace-pre-line: longer descriptions are written in paragraphs,
              and HTML would otherwise run them together. */}
          <p className="mt-8 border-t border-ink-700 pt-6 text-base leading-7 whitespace-pre-line text-mist-300">
            {product.description}
          </p>

          <div className="mt-6 flex items-start gap-3.5 rounded-xl border border-ink-700 bg-ink-900 p-4 sm:p-5">
            <TruckIcon className="mt-0.5 h-6 w-6 shrink-0 text-mist-100" />
            <div>
              <p className="font-bold">{site.shippingNote}</p>
              <p className="mt-1 text-sm text-mist-500">
                מועד אספקה משוער נמסר בוואטסאפ בעת ההזמנה.
              </p>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-14 grid gap-5 sm:mt-20 lg:grid-cols-2 lg:gap-6">
        {product.compatibility.length > 0 ? (
          <section aria-labelledby="compatibility-title" className="rounded-card border border-ink-700 bg-white p-6 sm:p-8">
            <h2 id="compatibility-title" className="flex items-center gap-2.5 text-xl font-bold">
              <MachineIcon className="h-6 w-6 text-mist-100" />
              התאמה למכונות
            </h2>
            <ul className="mt-5 space-y-3">
              {product.compatibility.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-mist-300">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#16a34a]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {product.variants.length > 0 ? (
          <section aria-labelledby="variants-title" className="rounded-card border border-ink-700 bg-white p-6 sm:p-8">
            <h2 id="variants-title" className="text-xl font-bold">
              אפשרויות בחירה
            </h2>
            <p className="mt-2 text-sm text-mist-500">האפשרויות הזמינות — את הבחירה מאשרים איתנו בוואטסאפ עם ההזמנה.</p>
            <div className="mt-5 space-y-5">
              {product.variants.map((group) => (
                <div key={group.id}>
                  <h3 className="text-sm font-bold text-mist-100">{group.label}</h3>
                  <ul className="mt-2.5 flex flex-wrap gap-2">
                    {group.options.map((option) => (
                      <li key={option} className="rounded-md bg-ink-900 px-3 py-1.5 text-sm text-mist-300">
                        {option}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </section>
        ) : null}

        {product.highlights.length > 0 ? (
          <section aria-labelledby="highlights-title" className="rounded-card border border-ink-700 bg-white p-6 sm:p-8">
            <h2 id="highlights-title" className="text-xl font-bold">
              יתרונות
            </h2>
            <ul className="mt-5 space-y-3">
              {product.highlights.map((item) => (
                <li key={item} className="flex items-start gap-2.5 text-sm text-mist-300">
                  <CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-[#16a34a]" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          </section>
        ) : null}

        {product.specs.length > 0 ? (
          <section aria-labelledby="specs-title" className="rounded-card border border-ink-700 bg-white p-6 sm:p-8">
            <h2 id="specs-title" className="text-xl font-bold">
              מפרט טכני
            </h2>
            <dl className="mt-5 divide-y divide-ink-700">
              {product.specs.map((spec) => (
                <div key={spec.label} className="grid grid-cols-[auto_1fr] items-baseline gap-x-4 py-3">
                  <dt className="text-sm text-mist-500">{spec.label}</dt>
                  <dd className="text-end text-sm font-semibold break-words text-mist-100">{spec.value}</dd>
                </div>
              ))}
            </dl>
          </section>
        ) : null}
      </div>

      <div className="mt-6 rounded-card border border-ink-700 bg-ink-900 p-6 text-center sm:p-10">
        <h2 className="text-xl font-extrabold tracking-tight sm:text-2xl">שאלה על {product.name}?</h2>
        <p className="mx-auto mt-2 max-w-lg text-sm text-mist-500 sm:text-base">
          לא בטוחים איזה דגם מתאים, או צריכים כמות? שולחים הודעה ומקבלים תשובה ממי שמייצר. {site.shippingNote}.
        </p>
        <div className="mt-5 flex justify-center">
          <WhatsAppButton productName={product.name} size="md" variant="outline" label="דברו איתנו בוואטסאפ" />
        </div>
      </div>

      {related.length > 0 ? (
        <section aria-labelledby="related-title" className="mt-16 sm:mt-24">
          <h2 id="related-title" className="text-2xl font-extrabold tracking-tight sm:text-3xl">
            משלימים את הציוד
          </h2>
          <div className="mt-6 grid grid-cols-2 gap-3 sm:mt-8 sm:gap-5 md:grid-cols-3 xl:grid-cols-4">
            {related.map((item) => (
              <ProductCard key={item.slug} product={item} />
            ))}
          </div>
        </section>
      ) : null}
    </>
  );
}
