'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { Scene, sceneLabel } from '@/components/hamavrik/Illustrations';
import { track } from '@/lib/hamavrik/analytics';
import { galleryCategories, galleryCategoryOf, type BeforeAfterJob, type GalleryCategory } from '@/lib/hamavrik/config';

/**
 * Draggable before/after comparison. Runs LTR internally so the clip math
 * and the range direction agree; the Hebrew labels are absolute and
 * unaffected. The invisible range input on top is what makes it work with
 * keyboard, screen readers and touch alike. A job without photos draws its
 * illustration and says so on the card — nothing pretends to be a real job.
 */
export function BeforeAfterSlider({ job, eager = false }: { job: BeforeAfterJob; eager?: boolean }) {
  const [pos, setPos] = useState(50);
  const [touched, setTouched] = useState(false);
  const tracked = useRef(false);
  const real = Boolean(job.before && job.after);

  function move(next: number) {
    setPos(next);
    if (!touched) setTouched(true);
    if (!tracked.current) {
      tracked.current = true;
      track('before_after_interaction', { job: job.id, service: job.service });
    }
  }

  return (
    <figure data-category={galleryCategoryOf[job.service]} className="surface surface-hover overflow-hidden rounded-2xl">
      <div dir="ltr" className="relative aspect-8/5 select-none overflow-hidden bg-ink-900">
        <div className="absolute inset-0">
          {real ? (
            <Image src={job.before!} alt={sceneLabel(job.scene, 'before')} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" loading={eager ? 'eager' : 'lazy'} className="object-cover" />
          ) : (
            <Scene kind={job.scene} variant="before" />
          )}
        </div>
        <div className="absolute inset-0" style={{ clipPath: `inset(0 ${100 - pos}% 0 0)` }}>
          {real ? (
            <Image src={job.after!} alt={sceneLabel(job.scene, 'after')} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" loading={eager ? 'eager' : 'lazy'} className="object-cover" />
          ) : (
            <Scene kind={job.scene} variant="after" />
          )}
        </div>

        <div aria-hidden className="pointer-events-none absolute inset-y-0 w-0.5 -translate-x-1/2 bg-white shadow-[0_0_0_1px_rgba(0,0,0,0.15)]" style={{ left: `${pos}%` }}>
          <span className="absolute left-1/2 top-1/2 flex h-11 w-11 -translate-x-1/2 -translate-y-1/2 items-center justify-center rounded-full bg-white text-brand-500 shadow-lg ring-4 ring-white/40">
            <svg viewBox="0 0 24 24" className="h-6 w-6" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
              <path d="M8 8l-4 4 4 4M16 8l4 4-4 4" />
            </svg>
          </span>
        </div>

        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-extrabold text-white backdrop-blur-sm">לפני</span>
        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-wa-500 px-3 py-1 text-xs font-extrabold text-white">אחרי</span>
        {!real ? (
          <span className="pointer-events-none absolute bottom-3 right-3 rounded-full bg-white/90 px-2.5 py-0.5 text-[11px] font-bold text-mist-500">איור להמחשה</span>
        ) : null}
        {!touched ? (
          <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">⟷ גררו להשוואה</span>
        ) : null}

        <input
          type="range"
          min={0}
          max={100}
          value={pos}
          onChange={(e) => move(Number(e.target.value))}
          aria-label={`השוואת לפני ואחרי — ${job.itemLabel}, ${job.city}`}
          className="absolute inset-0 h-full w-full cursor-ew-resize opacity-0"
        />
      </div>
      <figcaption className="px-4 py-3">
        <p className="font-extrabold">
          {job.itemLabel} <span className="font-medium text-mist-500">| {job.city}</span>
        </p>
        <p className="text-sm text-mist-300">{job.problem}</p>
      </figcaption>
    </figure>
  );
}

/** Category tabs above the sliders; "הכול" shows one job per category. */
export function BeforeAfterGallery({ jobs }: { jobs: BeforeAfterJob[] }) {
  const present = galleryCategories.filter((c) => jobs.some((j) => galleryCategoryOf[j.service] === c.id));
  const [active, setActive] = useState<'all' | GalleryCategory>('all');
  const showTabs = present.length > 1;

  const visible =
    active === 'all'
      ? showTabs
        ? present.map((c) => jobs.find((j) => galleryCategoryOf[j.service] === c.id)!).slice(0, 6)
        : jobs.slice(0, 6)
      : jobs.filter((j) => galleryCategoryOf[j.service] === active);

  return (
    <div>
      {showTabs ? (
        <div role="group" aria-label="קטגוריה" className="shine-rail -mx-4 mb-6 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:justify-center sm:px-0">
          {[{ id: 'all' as const, label: 'הכול' }, ...present].map((c) => {
            const on = active === c.id;
            return (
              <button
                key={c.id}
                type="button"
                aria-pressed={on}
                data-category={c.id}
                onClick={() => setActive(c.id)}
                className={`shrink-0 rounded-full px-4 py-2 text-sm font-extrabold transition-colors ${
                  on ? 'bg-brand-500 text-white shadow-md shadow-brand-500/25' : 'bg-white text-mist-300 ring-1 ring-ink-700 hover:ring-brand-500/40'
                }`}
              >
                {c.label}
              </button>
            );
          })}
        </div>
      ) : null}

      <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((job, i) => (
          <BeforeAfterSlider key={job.id} job={job} eager={i === 0} />
        ))}
      </div>
    </div>
  );
}
