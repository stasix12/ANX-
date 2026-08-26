'use client';

import { useRef } from 'react';
import { StarIcon } from '@/components/icons';

export type Review = { name: string; city: string; text: string };

const AVATAR_GRADIENTS = [
  'linear-gradient(135deg, #38bdf8, #0369a1)',
  'linear-gradient(135deg, #2dd4bf, #0f766e)',
  'linear-gradient(135deg, #a78bfa, #6d28d9)',
  'linear-gradient(135deg, #fbbf24, #d97706)',
];

/**
 * Snap-scrolling review rail with arrow paging on desktop. The avatars are
 * initial-letter circles, not photos — inventing customer faces would be worse
 * than honest monograms. Scrolling is native (touch just works, RTL included);
 * the arrows only call scrollBy, so there is no state to fall out of sync.
 */
export function ReviewsCarousel({ reviews }: { reviews: Review[] }) {
  const railRef = useRef<HTMLDivElement>(null);

  function page(direction: 1 | -1) {
    const rail = railRef.current;
    if (!rail) return;
    const card = rail.querySelector('figure');
    const step = (card?.clientWidth ?? 320) + 20;
    // In RTL, scrolling toward "next" content means negative scrollLeft.
    rail.scrollBy({ left: -direction * step, behavior: 'smooth' });
  }

  return (
    <div className="relative">
      <div
        ref={railRef}
        className="crm-snap -mx-4 flex snap-x snap-mandatory gap-5 overflow-x-auto px-4 pb-2 sm:mx-0 sm:px-1"
      >
        {reviews.map((review, i) => (
          <figure
            key={review.name}
            className="surface w-[85%] shrink-0 snap-center rounded-card p-6 sm:w-96"
          >
            <span aria-hidden className="flex gap-0.5 text-amber-400">
              {Array.from({ length: 5 }, (_, s) => (
                <StarIcon key={s} className="h-4 w-4 fill-current" />
              ))}
            </span>
            <blockquote className="mt-3 leading-relaxed text-mist-100">
              &ldquo;{review.text}&rdquo;
            </blockquote>
            <figcaption className="mt-5 flex items-center gap-3">
              <span
                aria-hidden
                className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full text-lg font-black text-white"
                style={{ background: AVATAR_GRADIENTS[i % AVATAR_GRADIENTS.length] }}
              >
                {review.name.charAt(0)}
              </span>
              <span>
                <span className="block text-sm font-extrabold">{review.name}</span>
                <span className="block text-xs text-mist-500">{review.city}</span>
              </span>
            </figcaption>
          </figure>
        ))}
      </div>

      <div className="mt-4 hidden justify-center gap-3 sm:flex">
        <button
          type="button"
          onClick={() => page(-1)}
          aria-label="הביקורת הקודמת"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-ink-600 bg-ink-850 text-mist-300 transition hover:border-brand-500 hover:text-brand-400"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M9 6l6 6-6 6" />
          </svg>
        </button>
        <button
          type="button"
          onClick={() => page(1)}
          aria-label="הביקורת הבאה"
          className="flex h-11 w-11 items-center justify-center rounded-full border border-ink-600 bg-ink-850 text-mist-300 transition hover:border-brand-500 hover:text-brand-400"
        >
          <svg viewBox="0 0 24 24" className="h-5 w-5" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
            <path d="M15 6l-6 6 6 6" />
          </svg>
        </button>
      </div>
    </div>
  );
}
