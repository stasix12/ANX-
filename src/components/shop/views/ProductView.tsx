'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { categoryHref, galleryFor, inStock, maxQty, optionsText, sortProducts } from '@/lib/shop/logic';
import { orderLink } from '@/lib/site';
import { STATIC_CATEGORY_SLUGS } from '@/lib/shop/static';
import { useShop } from '@/lib/shop/store';
import type { Product } from '@/lib/shop/types';
import { SampleRibbon, ShopFrame } from '../Chrome';
import { IconBox, IconCart, IconChevron, IconSearch, IconShield, IconTruck } from '../icons';
import { addProductToCart, FavoriteButton, ProductGrid } from '../ProductCard';
import { btn, EmptyState, Img, Price, QtyStepper, src, Stars, Swatch, toast } from '../ui';
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
  const [options, setOptions] = useState<Record<string, string>>({});
  const [qty, setQty] = useState(1);
  const [index, setIndex] = useState(0);
  const track = useRef<HTMLDivElement>(null);
  const photos = galleryFor(product, colorId);
  // The demo clip rides as the last slide, like the play tile in the design.
  const slides: { kind: 'img' | 'video'; src: string }[] = [
    ...photos.map((src) => ({ kind: 'img' as const, src })),
    ...(product.video ? [{ kind: 'video' as const, src: product.video.poster }] : []),
  ];
  const available = inStock(product);
  const priced = product.price !== null;
  const limit = maxQty(product);
  const standard = s.db.settings.shippingMethods.find((m) => m.id === 'standard');
  const color = product.colors.find((c) => c.id === colorId);
  const primaryCat = s.db.categories.find((c) => c.slug === product.categories[0]);
  const current = slides[index];
  const note = current?.kind === 'img' ? product.imageNotes[current.src] : undefined;
  const missing = product.variants.find((v) => !options[v.id]);
  const chosen = [color && `צבע: ${color.name}`, optionsText(product, options)].filter(Boolean).join(' · ');

  // Changing color swaps the gallery to that color's photos.
  useEffect(() => {
    setIndex(0);
    track.current?.scrollTo({ left: 0, behavior: 'instant' as ScrollBehavior });
  }, [colorId]);

  const go = (i: number) => {
    const n = (i + slides.length) % slides.length;
    setIndex(n);
    const el = track.current;
    if (el) el.scrollTo({ left: n * el.clientWidth, behavior: 'smooth' });
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
                {slides.map((sl, i) => (
                  <div key={sl.src + i} className="size-full shrink-0 snap-center bg-[#f3f4f6]" aria-hidden={i !== index}>
                    {sl.kind === 'video' && product.video ? (
                      <video
                        controls
                        playsInline
                        preload="none"
                        poster={src(product.video.poster)}
                        className="size-full object-contain"
                        aria-label={`סרטון הדגמה — ${product.name}`}
                      >
                        <source src={src(product.video.webm)} type="video/webm" />
                        <source src={src(product.video.mp4)} type="video/mp4" />
                      </video>
                    ) : (
                      <Img
                        path={sl.src}
                        alt={`${product.name}${color ? ` — ${color.name}` : ''}, תמונה ${i + 1}`}
                        eager={i === 0}
                        className={`size-full ${product.imageNotes[sl.src]?.startsWith('הדמיית') ? 'object-contain bg-white' : 'object-cover'}`}
                      />
                    )}
                  </div>
                ))}
              </div>
              <FavoriteButton product={product} size="lg" className="absolute top-3 right-3" />
              {note && (
                <span className="absolute top-3 left-3 rounded-full bg-black/50 px-2.5 py-1 text-[11px] font-semibold text-white backdrop-blur-sm">{note}</span>
              )}
              {slides.length > 1 && (
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
                    {index + 1} / {slides.length}
                  </span>
                </>
              )}
            </div>
            {slides.length > 1 && (
              <div dir="ltr" className="x-noscrollbar mt-2.5 flex gap-2 overflow-x-auto">
                {slides.map((sl, i) => (
                  <button
                    key={sl.src + i}
                    type="button"
                    aria-label={sl.kind === 'video' ? 'סרטון הדגמה' : `תמונה ${i + 1}`}
                    aria-current={i === index}
                    onClick={() => go(i)}
                    className={`relative aspect-[1.12/1] w-[calc((100%-32px)/5)] min-w-16 shrink-0 overflow-hidden rounded-[10px] bg-white ring-offset-1 transition ${
                      i === index ? 'ring-2 ring-x-blue' : 'opacity-90 ring-1 ring-x-line hover:opacity-100'
                    }`}
                  >
                    <Img path={sl.src} alt="" className="size-full object-cover" />
                    {sl.kind === 'video' && (
                      <span className="absolute inset-0 grid place-items-center bg-black/25">
                        <span className="grid size-8 place-items-center rounded-full bg-white/90 text-x-ink">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                            <path d="M8 5v14l11-7z" />
                          </svg>
                        </span>
                      </span>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>

          {/* Details */}
          <div className="px-4 pt-4 lg:px-0 lg:pt-0">
            <div dir="ltr" className="flex items-start justify-between gap-3">
              <div dir="rtl" className="min-w-0 text-left">
                <h1 className="text-[24px] leading-tight font-black lg:text-4xl">{product.name}</h1>
                {product.subtitle && <p className="mt-0.5 text-[16px] font-bold text-x-ink-2 lg:text-xl">{product.subtitle}</p>}
              </div>
              <div className="shrink-0 text-left">
                {priced ? (
                  <>
                    {product.compareAtPrice && product.compareAtPrice > (product.price as number) && (
                      <span dir="rtl" className="me-2 text-base text-x-faint line-through">
                        {product.compareAtPrice} ₪
                      </span>
                    )}
                    <Price value={product.price as number} className="text-[28px] lg:text-4xl" />
                  </>
                ) : (
                  <span className="text-[15px] font-bold text-x-muted">מחיר יעודכן בקרוב</span>
                )}
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
                  {product.digital ? 'זמין להורדה' : product.stock === null ? 'זמין להזמנה' : product.stock <= 5 ? `במלאי · נותרו ${product.stock}` : 'במלאי'}
                </span>
              ) : (
                <span className="text-[15px] font-bold text-x-red">אזל מהמלאי</span>
              )}
            </div>

            <p className="mt-4 text-[15px] leading-relaxed text-x-muted">{product.description}</p>

            {product.colors.length > 0 && (
              <div className="mt-5">
                <p className="mb-3 text-left text-[16px] font-extrabold">
                  בחר צבע: <span className="font-semibold text-x-muted">{color?.name}</span>
                </p>
                <div dir="ltr" className="flex flex-wrap gap-x-5 gap-y-3">
                  {product.colors.map((c) => (
                    <Swatch key={c.id} color={c} size={44} selected={c.id === colorId} onClick={() => setColorId(c.id)} />
                  ))}
                </div>
              </div>
            )}

            {product.variants.map((v) => (
              <fieldset key={v.id} className="mt-5">
                <legend className="mb-3 w-full text-left text-[16px] font-extrabold">{v.label}:</legend>
                <div dir="ltr" className="grid grid-cols-4 gap-2">
                  {v.values.map((val) => {
                    const on = options[v.id] === val;
                    return (
                      <button
                        key={val}
                        type="button"
                        aria-pressed={on}
                        onClick={() => setOptions({ ...options, [v.id]: val })}
                        className={`h-11 truncate rounded-xl border px-2 text-[14px] font-bold transition ${on ? 'border-x-indigo bg-x-blue-50 text-x-indigo' : 'border-x-line text-x-ink-2 hover:border-x-faint'}`}
                      >
                        <span dir="rtl">{val}</span>
                      </button>
                    );
                  })}
                </div>
              </fieldset>
            ))}

            {priced ? (
              <div dir="ltr" className="mt-6 flex items-center gap-3">
                {!product.digital && <QtyStepper value={qty} onChange={setQty} max={Math.max(1, limit)} />}
                <button
                  type="button"
                  disabled={!available}
                  onClick={() => {
                    if (missing) return toast(`יש לבחור ${missing.label}`);
                    addProductToCart(product, colorId, qty, options);
                    setQty(1);
                  }}
                  className={`${btn.blue} h-13 flex-1 text-[18px]`}
                >
                  <span dir="rtl">{available ? 'הוסף לסל' : 'אזל מהמלאי'}</span>
                  <IconCart size={22} />
                </button>
              </div>
            ) : (
              <a
                href={orderLink(product.name, chosen || undefined)}
                target="_blank"
                rel="noopener noreferrer"
                className={`${btn.blue} mt-6 h-13 w-full text-[17px]`}
              >
                לבירור מחיר והזמנה בוואטסאפ
              </a>
            )}

            <ul dir="ltr" className="mt-6 grid grid-cols-3 divide-x divide-x-line border-t border-x-line pt-4">
              <Feature icon={<IconTruck size={26} />} title="משלוח מהיר" text={standard?.eta ?? ''} />
              <Feature icon={<IconShield size={26} />} title="איכות מובטחת" text="הדפסה מקצועית" />
              <Feature icon={<IconBox size={26} />} title="תמיכה מלאה" text="שירות לקוחות" />
            </ul>

            <div className="mt-6 space-y-2">
              {product.highlights.length > 0 && (
                <Section title="יתרונות" open>
                  <ul className="space-y-1.5">
                    {product.highlights.map((h) => (
                      <li key={h} className="flex gap-2">
                        <span className="mt-2 size-1.5 shrink-0 rounded-full bg-x-blue" />
                        {h}
                      </li>
                    ))}
                  </ul>
                </Section>
              )}
              {(product.specs.length > 0 || product.material) && (
                <Section title="מפרט טכני" open>
                  <dl className="divide-y divide-x-line">
                    {product.material && (
                      <div className="flex justify-between gap-4 py-2">
                        <dt className="text-x-muted">חומר הדפסה</dt>
                        <dd className="text-left font-semibold">{product.material}</dd>
                      </div>
                    )}
                    {product.specs.map((r) => (
                      <div key={r.label} className="flex justify-between gap-4 py-2">
                        <dt className="shrink-0 text-x-muted">{r.label}</dt>
                        <dd className="text-left font-semibold">{r.value}</dd>
                      </div>
                    ))}
                  </dl>
                </Section>
              )}
              {product.compatibility.length > 0 && (
                <Section title="התאמה למכונות ולצינורות">
                  <ul className="list-inside list-disc space-y-1">
                    {product.compatibility.map((c) => (
                      <li key={c}>{c}</li>
                    ))}
                  </ul>
                </Section>
              )}
              {product.usage && (
                <Section title="הוראות שימוש ותחזוקה">
                  <p className="whitespace-pre-line">{product.usage}</p>
                </Section>
              )}
            </div>
            {s.db.settings.sampleDataNotice && (
              <div className="mt-5 overflow-hidden rounded-xl">
                <SampleRibbon />
              </div>
            )}
          </div>
        </div>

        {related.length > 0 && (
          <section className="px-4 pt-10 lg:px-0">
            <h2 className="mb-3 text-[20px] font-black">מוצרים נוספים בקטגוריה</h2>
            <ProductGrid products={related} />
          </section>
        )}
      </div>
      <ShopFooter />
    </ShopFrame>
  );
}

function Section({ title, children, open }: { title: string; children: React.ReactNode; open?: boolean }) {
  return (
    <details open={open} className="group rounded-2xl ring-1 ring-x-line">
      <summary className="flex cursor-pointer list-none items-center justify-between px-4 py-3.5 text-[16px] font-extrabold [&::-webkit-details-marker]:hidden">
        {title}
        <IconChevron dir="down" size={18} className="transition group-open:rotate-180" />
      </summary>
      <div className="px-4 pb-4 text-[14px] leading-relaxed text-x-ink-2">{children}</div>
    </details>
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
