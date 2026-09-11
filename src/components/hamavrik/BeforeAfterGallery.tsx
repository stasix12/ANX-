'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { Scene, sceneLabel } from '@/components/hamavrik/Illustrations';
import { track } from '@/lib/hamavrik/analytics';
import { beforeAfterCategories, type BeforeAfterItem } from '@/lib/hamavrik/config';

/**
 * Draggable before/after comparison. Runs LTR internally so the clip math
 * and the range direction agree; the Hebrew labels are absolute and
 * unaffected. The invisible range input on top is what makes it work with
 * keyboard, screen readers and touch alike — on a phone the thumb drags
 * anywhere on the image and the native input tracks it.
 */
export function BeforeAfterSlider({ item, eager = false }: { item: BeforeAfterItem; eager?: boolean }) {
  const [pos, setPos] = useState(50);
  const [touched, setTouched] = useState(false);
  const tracked = useRef(false);
  const usePhotos = Boolean(item.before && item.after);

  function move(next: number) {
    setPos(next);
    if (!touched) setTouched(true);
    if (!tracked.current) {
      tracked.current = true;
      track('before_after_interaction', { item: item.title, category: item.category });
    }
  }

  return (
    <figure className="surface surface-hover overflow-hidden rounded-[1.5rem]">
      <div dir="ltr" className="relative aspect-8/5 select-none overflow-hidden bg-ink-900">
        <div className="absolute inset-0">
          {usePhotos ? (
            <Image
              src={item.before!}
              alt={sceneLabel(item.scene, 'before')}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              loading={eager ? 'eager' : 'lazy'}
              className="object-cover"
            />
          ) : (
            <Scene kind={item.scene} variant="before" />
          )}
        </div>
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {usePhotos ? (
            <Image
              src={item.after!}
              alt={sceneLabel(item.scene, 'after')}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              loading={eager ? 'eager' : 'lazy'}
              className="object-cover"
            />
          ) : (
            <Scene kind={item.scene} variant="after" />
          )}
        </div>

        <div
          aria-hidden
          className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]"
          style={{ left: `${pos}%` }}
        >
          <span className="absolute left-1/2 top-1/2 flex h-12 w-12 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-brand-500 shadow-xl ring-4 ring-white/40">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 8l-4 4 4 4M16 8l4 4-4 4" />
            </svg>
          </span>
        </div>

        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-extrabold text-white backdrop-blur-sm sm:text-sm">
          לפני
        </span>
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-wa-500 px-3 py-1 text-xs font-extrabold text-white sm:text-sm">
          אחרי
        </span>

        {!touched ? (
          <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">
            ⟷ גררו כדי להשוות
          </span>
        ) : null}

        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => move(Number(e.target.value))}
          aria-label={`השוואת לפני ואחרי — ${item.title}`}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <figcaption className="flex items-center justify-between gap-3 px-4 py-3">
        <p className="font-extrabold">{item.title}</p>
        <p className="flex flex-wrap justify-end gap-1.5">
          {item.chips.map((chip) => (
            <span key={chip} className="rounded-full bg-brand-300/60 px-2.5 py-0.5 text-[11px] font-bold text-brand-400">
              {chip}
            </span>
          ))}
        </p>
      </figcaption>
    </figure>
  );
}

/**
 * Category tabs above the sliders. Only categories that actually have
 * items get a tab; "הכול" shows the first item of each category.
 */
export function BeforeAfterGallery({ items }: { items: BeforeAfterItem[] }) {
  const present = beforeAfterCategories.filter((c) => items.some((i) => i.category === c.id));
  const [active, setActive] = useState<'all' | BeforeAfterItem['category']>('all');

  const visible =
    active === 'all'
      ? present.map((c) => items.find((i) => i.category === c.id)!).slice(0, 6)
      : items.filter((i) => i.category === active);

  return (
    <div>
      <div role="group" aria-label="קטגוריה" className="shine-rail -mx-4 mb-8 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:justify-center sm:px-0">
        {[{ id: 'all' as const, label: 'הכול' }, ...present].map((c) => {
          const on = active === c.id;
          return (
            <button
              key={c.id}
              type="button"
              aria-pressed={on}
              onClick={() => setActive(c.id)}
              className={`shrink-0 rounded-full px-5 py-2.5 text-sm font-extrabold transition-all ${
                on ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25' : 'bg-white text-mist-300 ring-1 ring-ink-700 hover:ring-brand-500/40'
              }`}
            >
              {c.label}
            </button>
          );
        })}
      </div>

      <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((item, i) => (
          <BeforeAfterSlider key={`${item.category}-${item.title}`} item={item} eager={i === 0} />
        ))}
      </div>
    </div>
  );
}
