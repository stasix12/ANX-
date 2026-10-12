'use client';

import { useEffect, useState } from 'react';
import { COLOR_LIST } from '@/lib/shop/seed';
import { applyFilters, emptyFilters, priceBounds } from '@/lib/shop/logic';
import { useShop } from '@/lib/shop/store';
import type { Filters, Product } from '@/lib/shop/types';
import { IconClose, IconStar } from './icons';
import { btn, Swatch } from './ui';

/**
 * "סינון מוצרים" — price range, categories, colors, minimum rating.
 * Edits a draft; "הצג N מוצרים" applies it, "ניקוי סינון" resets.
 */
export function FilterSheet({
  open,
  onClose,
  value,
  onApply,
  scope,
  lockedCategory,
}: {
  open: boolean;
  onClose: () => void;
  value: Filters;
  onApply: (f: Filters) => void;
  /** Products the filters run over (e.g. the current category). */
  scope: Product[];
  lockedCategory?: string;
}) {
  const s = useShop();
  const [draft, setDraft] = useState(value);
  const [min, max] = priceBounds(s.db.products);

  useEffect(() => {
    if (open) setDraft(value);
  }, [open, value]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  if (!open) return null;
  const count = applyFilters(scope, draft).length;
  const toggle = (list: string[], v: string) => (list.includes(v) ? list.filter((x) => x !== v) : [...list, v]);
  const cats = [...s.db.categories].sort((a, b) => a.sortOrder - b.sortOrder).filter((c) => c.slug !== lockedCategory);
  const pct = (v: number) => ((v - min) / (max - min)) * 100;
  const label = 'mb-3 text-[16px] font-extrabold';

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center lg:items-center" role="dialog" aria-modal="true" aria-labelledby="filters-title">
      <button type="button" aria-label="סגירה" onClick={onClose} className="absolute inset-0 bg-x-ink/45 animate-x-fade" />
      <div className="relative flex h-[calc(100dvh-10px)] w-full flex-col overflow-hidden rounded-t-[26px] bg-white sm:h-auto sm:max-h-[92dvh] shadow-x-pop animate-x-sheet sm:max-w-lg lg:max-h-[88dvh] lg:rounded-[26px]">
        <div dir="ltr" className="grid h-16 shrink-0 grid-cols-[1fr_auto_1fr] items-center px-5">
          <button type="button" onClick={() => setDraft(emptyFilters(s.db.products))} className="justify-self-start text-[14px] font-bold text-x-blue">
            ניקוי סינון
          </button>
          <h2 id="filters-title" className="text-[18px] font-extrabold">
            סינון מוצרים
          </h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="-mr-2 grid size-10 place-items-center justify-self-end">
            <IconClose size={24} />
          </button>
        </div>

        <div className="flex-1 space-y-7 overflow-y-auto px-5 pt-2 pb-6">
          <section>
            <h3 className={label}>טווח מחיר</h3>
            <div dir="ltr" className="relative h-8">
              <div className="absolute top-1/2 h-1.5 w-full -translate-y-1/2 rounded-full bg-x-line" />
              <div
                className="absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-x-blue"
                style={{ left: `${pct(draft.minPrice)}%`, right: `${100 - pct(draft.maxPrice)}%` }}
              />
              <input
                type="range"
                aria-label="מחיר מינימלי"
                min={min}
                max={max}
                step={5}
                value={draft.minPrice}
                onChange={(e) => setDraft({ ...draft, minPrice: Math.min(+e.target.value, draft.maxPrice - 5) })}
                className="x-range absolute inset-0 w-full"
              />
              <input
                type="range"
                aria-label="מחיר מקסימלי"
                min={min}
                max={max}
                step={5}
                value={draft.maxPrice}
                onChange={(e) => setDraft({ ...draft, maxPrice: Math.max(+e.target.value, draft.minPrice + 5) })}
                className="x-range absolute inset-0 w-full"
              />
            </div>
            <div dir="ltr" className="mt-1 flex justify-between text-[13px] font-bold tabular-nums">
              <span dir="rtl">{draft.minPrice} ₪</span>
              <span dir="rtl">{draft.maxPrice} ₪</span>
            </div>
          </section>

          {cats.length > 0 && (
            <section>
              <h3 className={label}>קטגוריה</h3>
              <div className="grid grid-cols-3 gap-2.5">
                {cats.map((c) => {
                  const on = draft.categories.includes(c.slug);
                  return (
                    <button
                      key={c.slug}
                      type="button"
                      aria-pressed={on}
                      onClick={() => setDraft({ ...draft, categories: toggle(draft.categories, c.slug) })}
                      className={`h-10 truncate rounded-full px-2 text-[13px] font-semibold transition ${on ? 'bg-x-blue-50 text-x-blue ring-1 ring-x-blue-100' : 'bg-x-soft text-x-ink-2'}`}
                    >
                      {c.shortName}
                    </button>
                  );
                })}
              </div>
            </section>
          )}

          <section>
            <h3 className={label}>צבע</h3>
            <div dir="ltr" className="flex flex-wrap justify-between gap-3">
              {COLOR_LIST.map((c) => (
                <Swatch
                  key={c.id}
                  color={c}
                  size={42}
                  selected={draft.colors.includes(c.id)}
                  onClick={() => setDraft({ ...draft, colors: toggle(draft.colors, c.id) })}
                />
              ))}
            </div>
          </section>

          <section>
            <h3 className={label}>דירוג מינימלי</h3>
            <div className="flex items-center justify-between gap-3">
              <button
                type="button"
                aria-pressed={draft.minRating === 0}
                onClick={() => setDraft({ ...draft, minRating: 0 })}
                className={`h-10 rounded-full px-4 text-[13px] font-semibold ${draft.minRating === 0 ? 'bg-x-blue-50 text-x-blue' : 'bg-x-soft text-x-ink-2'}`}
              >
                ללא מינימום
              </button>
              <div dir="ltr" className="flex gap-1">
                {[1, 2, 3, 4, 5].map((n) => (
                  <button
                    key={n}
                    type="button"
                    aria-label={`${n} כוכבים ומעלה`}
                    aria-pressed={draft.minRating === n}
                    onClick={() => setDraft({ ...draft, minRating: n })}
                    className="grid size-9 place-items-center text-x-star"
                  >
                    <IconStar size={26} amount={n <= draft.minRating ? 1 : 0} />
                  </button>
                ))}
              </div>
            </div>
          </section>

          <label className="flex items-center justify-between rounded-2xl bg-x-soft px-4 py-3.5">
            <span className="text-[15px] font-semibold">רק מוצרים במלאי</span>
            <input
              type="checkbox"
              checked={draft.inStockOnly}
              onChange={(e) => setDraft({ ...draft, inStockOnly: e.target.checked })}
              className="size-5 accent-x-blue"
            />
          </label>
        </div>

        <div className="shrink-0 border-t border-x-line px-5 pt-3 pb-[calc(12px+env(safe-area-inset-bottom))]">
          <button
            type="button"
            onClick={() => {
              onApply(draft);
              onClose();
            }}
            className={`${btn.blue} h-14 w-full text-[17px]`}
          >
            הצג {count} מוצרים
          </button>
        </div>
      </div>
    </div>
  );
}
