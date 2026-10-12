'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import { categoryHref, productHref, searchProducts, suggestions } from '@/lib/shop/logic';
import { STATIC_CATEGORY_SLUGS, STATIC_PRODUCT_SLUGS } from '@/lib/shop/static';
import { useShop } from '@/lib/shop/store';
import { ShopFrame } from '../Chrome';
import { CategoryGlyph, IconClock, IconClose, IconSearch } from '../icons';
import { ProductGrid } from '../ProductCard';
import { EmptyState } from '../ui';

const RECENT_KEY = 'anx3d-shop-recent-searches';

function readRecent(): string[] {
  try {
    const v = JSON.parse(localStorage.getItem(RECENT_KEY) ?? '[]');
    return Array.isArray(v) ? v.slice(0, 6) : [];
  } catch {
    return [];
  }
}

export function SearchWithParams() {
  const q = useSearchParams().get('q') ?? '';
  return <SearchView key={q} initial={q} />;
}

export function SearchView({ initial = '' }: { initial?: string }) {
  const s = useShop();
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [text, setText] = useState(initial);
  const [submitted, setSubmitted] = useState(initial);
  const [recent, setRecent] = useState<string[]>([]);
  const [active, setActive] = useState(-1);

  useEffect(() => {
    setRecent(readRecent());
    if (!initial) input.current?.focus();
  }, [initial]);

  const sugg = useMemo(() => suggestions(s.db.products, s.db.categories, text), [s.db.products, s.db.categories, text]);
  const results = useMemo(() => searchProducts(s.db.products, s.db.categories, submitted), [s.db.products, s.db.categories, submitted]);
  const showSuggest = text.trim() !== '' && text !== submitted;

  const run = (q: string) => {
    const t = q.trim();
    setText(t);
    setSubmitted(t);
    setActive(-1);
    input.current?.blur();
    if (!t) return;
    const next = [t, ...recent.filter((r) => r !== t)].slice(0, 6);
    setRecent(next);
    try {
      localStorage.setItem(RECENT_KEY, JSON.stringify(next));
    } catch {}
    router.replace(`/shop/search?q=${encodeURIComponent(t)}`, { scroll: false });
  };

  const pick = (i: number) => {
    const sg = sugg[i];
    if (!sg) return run(text);
    if (sg.kind === 'category') router.push(categoryHref(sg.slug, STATIC_CATEGORY_SLUGS));
    else run(sg.label);
  };

  const cats = [...s.db.categories].sort((a, b) => a.sortOrder - b.sortOrder);

  return (
    <ShopFrame nav={false}>
      <div className="mx-auto max-w-7xl px-4 lg:px-8 lg:pt-8">
        <h1 className="sr-only">חיפוש</h1>
        <form
          role="search"
          onSubmit={(e) => {
            e.preventDefault();
            if (active >= 0) pick(active);
            else run(text);
          }}
          className="relative"
        >
          <div dir="ltr" className="flex h-12 items-center gap-3 rounded-full bg-x-soft px-4 focus-within:ring-2 focus-within:ring-x-blue-100 lg:h-14">
            <IconSearch size={22} className="shrink-0 text-x-ink" />
            <input
              ref={input}
              type="search"
              enterKeyHint="search"
              value={text}
              onChange={(e) => {
                setText(e.target.value);
                setActive(-1);
              }}
              onKeyDown={(e) => {
                if (!showSuggest) return;
                if (e.key === 'ArrowDown') {
                  e.preventDefault();
                  setActive((a) => Math.min(sugg.length - 1, a + 1));
                } else if (e.key === 'ArrowUp') {
                  e.preventDefault();
                  setActive((a) => Math.max(-1, a - 1));
                }
              }}
              placeholder="חיפוש מוצרים, דמויות, אביזרים..."
              aria-label="חיפוש מוצרים"
              aria-autocomplete="list"
              aria-controls="search-suggestions"
              aria-expanded={showSuggest && sugg.length > 0}
              aria-activedescendant={active >= 0 ? `sg-${active}` : undefined}
              role="combobox"
              autoComplete="off"
              dir="rtl"
              className="w-full bg-transparent text-left outline-none! focus-visible:outline-none text-[16px] font-semibold text-x-ink outline-none placeholder:font-normal placeholder:text-x-faint [&::-webkit-search-cancel-button]:hidden"
            />
            {text && (
              <button
                type="button"
                aria-label="ניקוי החיפוש"
                onClick={() => {
                  setText('');
                  setSubmitted('');
                  input.current?.focus();
                }}
                className="grid size-8 shrink-0 place-items-center text-x-ink"
              >
                <IconClose size={20} />
              </button>
            )}
          </div>
        </form>

        {showSuggest ? (
          <ul id="search-suggestions" role="listbox" className="mt-2">
            {sugg.map((sg, i) => {
              const words = text.trim();
              const idx = sg.label.indexOf(words);
              return (
                <li key={sg.kind + sg.slug} id={`sg-${i}`} role="option" aria-selected={i === active}>
                  <button
                    type="button"
                    onClick={() => pick(i)}
                    dir="ltr"
                    className={`flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left text-[16px] ${i === active ? 'bg-x-soft' : 'hover:bg-x-soft'}`}
                  >
                    {sg.kind === 'category' ? (
                      <CategoryGlyph icon="all" size={20} className="text-x-muted" />
                    ) : (
                      <IconSearch size={20} className="text-x-muted" />
                    )}
                    <span dir="rtl" className="text-x-muted">
                      {idx >= 0 ? (
                        <>
                          {sg.label.slice(0, idx)}
                          <b className="font-extrabold text-x-ink">{sg.label.slice(idx, idx + words.length)}</b>
                          {sg.label.slice(idx + words.length)}
                        </>
                      ) : (
                        <b className="font-extrabold text-x-ink">{sg.label}</b>
                      )}
                    </span>
                    {sg.kind === 'category' && <span className="ml-auto text-xs text-x-faint">קטגוריה</span>}
                  </button>
                </li>
              );
            })}
            {!sugg.length && <li className="px-2 py-4 text-sm text-x-muted">אין הצעות — הקישו חיפוש כדי לחפש בכל החנות.</li>}
          </ul>
        ) : submitted ? (
          <section className="mt-5" aria-live="polite">
            <p className="mb-3 text-[15px] text-x-muted">
              {results.length ? (
                <>
                  נמצאו <b className="text-x-ink">{results.length}</b> תוצאות עבור &quot;{submitted}&quot;
                </>
              ) : null}
            </p>
            {results.length ? (
              <ProductGrid products={results} />
            ) : (
              <EmptyState icon={<IconSearch size={34} />} title={`לא נמצאו תוצאות עבור "${submitted}"`} text="נסו מילה אחרת, או עיינו בקטגוריות." action={{ label: 'לכל הקטגוריות', href: '/shop/categories' }} />
            )}
          </section>
        ) : (
          <div className="mt-5 space-y-7">
            {recent.length > 0 && (
              <section>
                <div className="mb-2 flex items-center justify-between">
                  <h2 className="text-[16px] font-extrabold">חיפושים אחרונים</h2>
                  <button
                    type="button"
                    onClick={() => {
                      setRecent([]);
                      try {
                        localStorage.removeItem(RECENT_KEY);
                      } catch {}
                    }}
                    className="text-[13px] font-bold text-x-blue"
                  >
                    ניקוי
                  </button>
                </div>
                <ul>
                  {recent.map((r) => (
                    <li key={r}>
                      <button type="button" onClick={() => run(r)} className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-[15px] hover:bg-x-soft">
                        <IconClock size={20} className="text-x-muted" />
                        {r}
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            )}
            <section>
              <h2 className="mb-3 text-[16px] font-extrabold">חיפושים פופולריים</h2>
              <div className="flex flex-wrap gap-2">
                {['דרקון', 'גמיש', 'מעמד', 'עציץ', 'גיימינג', 'STL'].map((t) => (
                  <button key={t} type="button" onClick={() => run(t)} className="h-9 rounded-full bg-x-soft px-4 text-[14px] font-semibold text-x-ink-2 hover:bg-x-blue-50 hover:text-x-blue">
                    {t}
                  </button>
                ))}
              </div>
            </section>
            <section>
              <h2 className="mb-3 text-[16px] font-extrabold">קטגוריות</h2>
              <ul className="grid grid-cols-2 gap-2 sm:grid-cols-4">
                {cats.map((c) => (
                  <li key={c.slug}>
                    <Link href={categoryHref(c.slug, STATIC_CATEGORY_SLUGS)} className="flex items-center gap-2.5 rounded-xl bg-x-soft px-3 py-3 text-[14px] font-semibold hover:bg-x-blue-50">
                      <CategoryGlyph icon={c.icon} size={20} className="text-x-blue" />
                      {c.name}
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
            <section>
              <h2 className="mb-3 text-[16px] font-extrabold">מוצרים מובילים</h2>
              <ul className="divide-y divide-x-line">
                {s.db.products
                  .filter((p) => p.published && p.featured)
                  .slice(0, 4)
                  .map((p) => (
                    <li key={p.id}>
                      <Link href={productHref(p, STATIC_PRODUCT_SLUGS)} className="flex items-center gap-3 py-2.5 text-[15px] font-semibold">
                        <IconSearch size={18} className="text-x-muted" />
                        {p.name}
                      </Link>
                    </li>
                  ))}
              </ul>
            </section>
          </div>
        )}
      </div>
    </ShopFrame>
  );
}
