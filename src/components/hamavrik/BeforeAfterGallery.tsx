'use client';

import Image from 'next/image';
import { useRef, useState } from 'react';
import { Scene, sceneLabel } from '@/components/hamavrik/Illustrations';
import { track } from '@/lib/hamavrik/analytics';
import Link from 'next/link';
import { galleryCategories, galleryCategoryOf, workGallery, type BeforeAfterJob, type GalleryCategory } from '@/lib/hamavrik/config';
import { href } from '@/lib/hamavrik/links';

/**
 * Draggable before/after comparison. Runs LTR internally so the clip math
 * and the range direction agree; the Hebrew labels are absolute and
 * unaffected. The invisible range input on top is what makes it work with
 * keyboard, screen readers and touch alike. A job without photos draws its
 * illustration and says so on the card — nothing pretends to be a real job.
 */
export function BeforeAfterSlider({ job, eager = false, className = '' }: { job: BeforeAfterJob; eager?: boolean; className?: string }) {
  // Left of the divider is the old (before), right of it the new (after).
  const [pos, setPos] = useState(50);
  const [touched, setTouched] = useState(false);
  const tracked = useRef(false);
  const real = Boolean(job.beforeImage && job.afterImage);

  function move(next: number) {
    setPos(next);
    if (!touched) setTouched(true);
    if (!tracked.current) {
      tracked.current = true;
      track('before_after_interaction', { job: job.id, service: job.service });
    }
  }

  return (
    <figure data-category={galleryCategoryOf[job.service]} className={`surface surface-hover overflow-hidden rounded-2xl ${className}`}>
      <div dir="ltr" className="relative aspect-8/5 select-none overflow-hidden bg-ink-900">
        <div className="absolute inset-0">
          {real ? (
            <Image src={job.beforeImage!} alt={sceneLabel(job.scene, 'before')} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" loading={eager ? 'eager' : 'lazy'} className="object-cover" />
          ) : (
            <Scene kind={job.scene} variant="before" />
          )}
        </div>
        <div className="absolute inset-0" style={{ clipPath: `inset(0 0 0 ${pos}%)` }}>
          {real ? (
            <Image src={job.afterImage!} alt={sceneLabel(job.scene, 'after')} fill sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw" loading={eager ? 'eager' : 'lazy'} className="object-cover" />
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

        <span className="pointer-events-none absolute left-3 top-3 rounded-full bg-black/55 px-3 py-1 text-xs font-extrabold text-white backdrop-blur-sm">לפני</span>
        <span className="pointer-events-none absolute right-3 top-3 rounded-full bg-wa-500 px-3 py-1 text-xs font-extrabold text-white">אחרי</span>
        {!touched ? (
          <span className="pointer-events-none absolute bottom-3 left-1/2 -translate-x-1/2 rounded-full bg-black/55 px-3 py-1 text-xs font-bold text-white backdrop-blur-sm">גררו להשוואה</span>
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
      <figcaption className="px-3.5 py-2.5">
        <p className="font-extrabold">
          {job.itemLabel} <span className="font-medium text-mist-500">| {job.city}</span>
        </p>
        <p className="text-sm text-mist-300">
          {job.problem}
          {!real ? <span className="ms-2 rounded-full bg-ink-900 px-2 py-0.5 text-[11px] font-bold text-mist-500">איור להמחשה</span> : null}
        </p>
      </figcaption>
    </figure>
  );
}

function diversify(jobs: BeforeAfterJob[]): BeforeAfterJob[] {
  const seen = new Set<string>();
  const firsts: BeforeAfterJob[] = [];
  const rest: BeforeAfterJob[] = [];
  for (const job of jobs) {
    const cat = galleryCategoryOf[job.service];
    if (seen.has(cat)) rest.push(job);
    else {
      seen.add(cat);
      firsts.push(job);
    }
  }
  return [...firsts, ...rest];
}

/**
 * The gallery. `limit` caps the number of jobs (the home page shows 3 on
 * phones, 4 on wider screens, and links to /gallery for the rest); `tabs`
 * adds category filters (the gallery page). Real-photo jobs are listed first.
 */
export function BeforeAfterGallery({
  jobs,
  limit,
  tabs = false,
  galleryLink = false,
}: {
  jobs: BeforeAfterJob[];
  limit?: number;
  tabs?: boolean;
  galleryLink?: boolean;
}) {
  const ordered = [...jobs].sort((a, b) => Number(Boolean(b.beforeImage && b.afterImage)) - Number(Boolean(a.beforeImage && a.afterImage)));
  const present = galleryCategories.filter((c) => ordered.some((j) => galleryCategoryOf[j.service] === c.id));
  const [active, setActive] = useState<'all' | GalleryCategory>('all');
  const showTabs = tabs && present.length > 1;

  const filtered = active === 'all' ? ordered : ordered.filter((j) => galleryCategoryOf[j.service] === active);
  // A limited view (the home page) shows variety first: one job per
  // category, then the rest — so four placeholders are never four sofas.
  const spread = limit && active === 'all' ? diversify(filtered) : filtered;
  const visible = limit ? spread.slice(0, limit) : spread;
  const more = jobs.length > visible.length || workGallery.length > 0;

  return (
    <div>
      {showTabs ? (
        <div role="group" aria-label="קטגוריה" className="shine-rail -mx-4 mb-5 flex gap-2 overflow-x-auto px-4 sm:mx-0 sm:justify-center sm:px-0">
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

      <div className={`grid gap-4 sm:grid-cols-2 ${limit === 4 ? 'lg:grid-cols-4' : 'lg:grid-cols-3'}`}>
        {visible.map((job, i) => (
          <BeforeAfterSlider key={job.id} job={job} eager={i === 0} className={limit && i === limit - 1 ? 'max-sm:hidden' : ''} />
        ))}
      </div>

      {galleryLink && more ? (
        <p className="mt-5 text-center">
          <Link
            href={href('/gallery')}
            className="inline-flex items-center gap-2 rounded-full bg-white px-5 py-2.5 text-sm font-extrabold text-brand-400 shadow-sm ring-1 ring-ink-700 transition hover:ring-brand-500/50 sm:text-base"
          >
            איורים ודוגמאות ‹
          </Link>
        </p>
      ) : null}
    </div>
  );
}
