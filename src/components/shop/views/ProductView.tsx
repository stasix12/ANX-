'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { categoryHref, galleryFor, inStock, maxQty, sortProducts } from '@/lib/shop/logic';
import { STATIC_CATEGORY_SLUGS } from '@/lib/shop/static';
import { useShop } from '@/lib/shop/store';
import type { Product } from '@/lib/shop/types';
import { SampleRibbon, ShopFrame } from '../Chrome';
import { IconBox, IconCart, IconChevron, IconSearch, IconShield, IconTruck } from '../icons';
import { addProductToCart, FavoriteButton, ProductGrid } from '../ProductCard';
import { btn, EmptyState, Img, Price, QtyStepper, Stars, Swatch } from '../ui';
import { ShopFooter } from './HomeView';

export function ProductView({ slug }: { slug: string | null }) {
  const s = useShop();
  const product = slug ? s.db.products.find((p) => p.slug === slug && p.published) : undefined;

  if (!product) {
    // During prerender of /shop/item the slug is unknown until the client reads it.
    if (!s.ready && !slug) return <ShopFrame nav={false} back="/shop" >{null}</ShopFrame>;
    return (
      <ShopFrame nav="categories" back="/shop">
        <EmptyState
          icon={<IconSearch size={34} />}
          title="המוצר לא נמצא"
          text="ייתכן שהמוצר הוסר מהחנות או שהקישור שגוי."
          action={{ label: 'לכל המוצרים', href: '/shop/c/all' }}
        />
      </ShopFrame>
    );
  }
  return <ProductDetail key={product.id} product={product} />;
}

function ProductDetail({ product }: { product: Product }) {
  const s = useShop();
  const [colorId, setColorId] = useState<string | null>(product.colors[0]?.id ?? null);
  const [qty, setQty] = useState(1);
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const images = galleryFor(product, colorId);
  const available = inStock(product);
  const limit = maxQty(product);
  const standard = s.db.settings.shippingMethods.find((m) => m.id === 'standard');
  const color = product.colors.find((c) => c.id === colorId);
  const primaryCat = s.db.categories.find((c) => c.slug === product.categories[0]);

  // Changing color swaps the gallery to that color's photos.
  useEffect(() => {
    setIndex(0);
    track.current?.scrollTo({ left: 0, behavior: 'instant' as ScrollBehavior });
  }, [colorId]);

  const go = (i: number) => {
    const n = (i + images.length) % images.length;
    setIndex(n);
    const el = track.current;
    if (el) el.scrollTo({ left: -n * el.clientWidth * (getComputedStyle(el).direction === 'rtl' ? 1 : -1), behavior: 'smooth' });
  };

  const onScroll = () => {
    const el = track.current;
    if (!el) return;
    const n = Math.round(Math.abs(el.scrollLeft) / el.clientWidth);
    if (n !== index) setIndex(n);
  };

  const related = sortProducts(
    s.db.products.filter((p) => p.published && p.id !== product.id && p.categories.some((c) => product.categories.includes(c))),
    'recommended',
  ).slice(0, 4);

  return (
    <ShopFrame nav={false} back={primaryCat ? categoryHref(primaryCat.slug, STATIC_CATEGORY_SLUGS) : '/shop'}>
      <div className="mx-auto max-w-7xl lg:px-8 lg:pt-6">
        {primaryCat && (
          <nav aria-label="פירורי לחם" className="hidden text-[13px] text-x-muted lg:block">
            <Link href="/shop" className="hover:text-x-blue">
              בית
            </Link>
            <span className="mx-1.5">›</span>
            <Link href={categoryHref(primaryCat.slug, STATIC_CATEGORY_SLUGS)} className="hover:text-x-blue">
              {primaryCat.name}
            </Link>
            <span className="mx-1.5">›</span>
            <span className="font-semibold text-x-ink-2">{product.name}</span>
          </nav>
        )}
        <div className="lg:mt-4 lg:grid lg:grid-cols-[1.1fr_1fr] lg:gap-12">
          {/* Gallery */}
          <div className="px-3 lg:px-0">
            <div className="relative overflow-hidden rounded-[18px] bg-x-soft">
              <div
                ref={track}
                dir="ltr"
                onScroll={onScroll}
                className="x-noscrollbar flex aspect-[1.6/1] snap-x snap-mandatory overflow-x-auto lg:aspect-[1.25/1]"
                aria-roledescription="גלריה"
              >
                {images.map((img, i) => (
                  <div key={img + i} className="size-full shrink-0 snap-center" aria-hidden={i !== index}>
                    <Img path={img} alt={`${product.name}${color ? ` — ${color.name}` : ''}, תמונה ${i + 1}`} eager={i === 0} className="size-full object-cover" />
                  </div>
                ))}
              </div>
              <FavoriteButton product={product} size="lg" className="absolute top-3 right-3" />
              {images.length > 1 && (
                <>
                  <button
                    type="button"
                    aria-label="התמונה הקודמת"
                    onClick={() => go(index - 1)}
                    className="absolute top-1/2 left-3 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white text-x-ink shadow-md lg:size-11"
                  >
                    <IconChevron dir="left" size={20} />
                  </button>
                  <button
                    type="button"
                    aria-label="התמונה הבאה"
                    onClick={() => go(index + 1)}
                    className="absolute top-1/2 right-3 grid size-9 -translate-y-1/2 place-items-center rounded-full bg-white text-x-ink shadow-md lg:size-11"
                  >
                    <IconChevron dir="right" size={20} />
                  </button>
                  <span dir="ltr" className="absolute right-3 bottom-3 rounded-full bg-black/55 px-2.5 py-1 text-[12px] font-semibold text-white tabular-nums">
                    {index + 1} / {images.length}
                  </span>
                </>
              )}
            </div>
            {images.length > 1 && (
              <div dir="ltr" className="x-noscrollbar mt-2.5 flex gap-2 overflow-x-auto">
                {images.map((img, i) => (
                  <button
                    key={img + i}
                    type="button"
                    aria-label={`תמונה ${i + 1}`}
                    aria-current={i === index}
                    onClick={() => go(i)}
                    className={`aspect-[1.12/1] w-[calc((100%-32px)/5)] min-w-16 shrink-0 overflow-hidden rounded-[10px] ring-offset-1 transition ${
                      i === index ? 'ring-2 ring-x-blue' : 'opacity-90 ring-1 ring-x-line hover:opacity-100'
                    }`}
                  >
                    <Img path={img} alt="" className="size-full object-cover" />
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="px-4 pt-4 lg:px-0 lg:pt-0">
            <div dir="ltr" className="flex items-start justify-between gap-3">
              <h1 dir="rtl" className="text-[26px] leading-tight font-black lg:text-4xl">
                {product.name}
              </h1>
              <div className="shrink-0 text-left">
                {product.compareAtPrice && product.compareAtPrice > product.price && (
                  <span dir="rtl" className="me-2 text-base text-x-faint line-through">
                    {product.compareAtPrice} ₪
                  </span>
                )}
                <Price value={product.price} className="text-[28px] lg:text-4xl" />
              </div>
            </div>
            <div dir="ltr" className="mt-2 flex items-center justify-between">
              <Stars rating={product.rating} count={product.reviewCount} countLabel="ביקורות" size={19} />
              {available ? (
                <span dir="rtl" className="inline-flex items-center gap-1.5 text-[15px] font-bold text-x-green">
                  <span className="grid size-[18px] place-items-center rounded-full bg-x-green text-white">
                    <svg width="11" height="11" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.5" aria-hidden="true">
                      <path d="m5 12.5 4.5 4.5L19 7.5" />
                    </svg>
                  </span>
                  {product.digital ? 'זמין להורדה' : product.stock === null ? 'בהזמנה אישית' : product.stock <= 5 ? `במלאי · נותרו ${product.stock}` : 'במלאי'}
                </span>
              ) : (
                <span className="text-[15px] font-bold text-x-red">אזל מהמלאי</span>
              )}
            </div>

            <p className="mt-4 text-[15px] leading-relaxed text-x-muted">{product.description}</p>
            <p className="mt-2 text-[13px] text-x-faint">חומר: {product.material}</p>

            {product.colors.length > 0 && (
              <div className="mt-5">
                <p className="mb-3 text-left text-[16px] font-extrabold">
                  בחר צבע: <span className="font-semibold text-x-muted">{color?.name}</span>
                </p>
                <div dir="ltr" className="flex flex-wrap justify-between gap-y-3 sm:justify-start sm:gap-x-5">
                  {product.colors.map((c) => (
                    <Swatch key={c.id} color={c} size={44} selected={c.id === colorId} onClick={() => setColorId(c.id)} />
                  ))}
                </div>
              </div>
            )}

            <div dir="ltr" className="mt-6 flex items-center gap-3">
              {!product.digital && <QtyStepper value={qty} onChange={setQty} max={Math.max(1, limit)} />}
              <button
                type="button"
                disabled={!available}
                onClick={() => {
                  addProductToCart(product, colorId, qty);
                  setQty(1);
                }}
                className={`${btn.blue} h-13 flex-1 text-[18px]`}
              >
                <span dir="rtl">{available ? 'הוסף לסל' : 'אזל מהמלאי'}</span>
                <IconCart size={22} />
              </button>
            </div>

            <ul dir="ltr" className="mt-6 grid grid-cols-3 divide-x divide-x-line border-t border-x-line pt-4">
              <Feature icon={<IconTruck size={26} />} title="משלוח מהיר" text={standard?.eta ?? ''} />
              <Feature icon={<IconShield size={26} />} title="איכות מובטחת" text="הדפסה מקצועית" />
              <Feature icon={<IconBox size={26} />} title="תמיכה מלאה" text="שירות לקוחות" />
            </ul>
            <div className="mt-5 overflow-hidden rounded-xl">
              <SampleRibbon />
            </div>
          </div>
        </div>

        {related.length > 0 && (
          <section className="px-4 pt-10 lg:px-0">
            <h2 className="mb-3 text-[20px] font-black">אולי יעניין אותך</h2>
            <ProductGrid products={related} />
          </section>
        )}
      </div>
      <ShopFooter />
    </ShopFrame>
  );
}

function Feature({ icon, title, text }: { icon: React.ReactNode; title: string; text: string }) {
  return (
    <li dir="rtl" className="flex items-center justify-center gap-2 px-1.5">
      <span className="text-x-ink">{icon}</span>
      <span className="min-w-0">
        <span className="block text-[12.5px] font-extrabold">{title}</span>
        <span className="block truncate text-[11px] text-x-muted">{text}</span>
      </span>
    </li>
  );
}
