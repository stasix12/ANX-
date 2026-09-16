import Image from 'next/image';
import { Reveal } from '@/components/hamavrik/Reveal';
import { Section, SectionHeading } from '@/components/hamavrik/Section';
import { GoogleIcon } from '@/components/hamavrik/icons';
import { StarIcon } from '@/components/icons';
import type { GoogleReview, GoogleReviewsData } from '@/lib/hamavrik/googleReviews';

const AVATARS = ['#1a56db', '#0f8f84', '#7c3aed', '#b45309', '#be123c'];

/** Five stars, filled to the exact rating (4.7 → 4.7 stars), for the summary line. */
function StarRow({ value, size = 'h-5 w-5' }: { value: number; size?: string }) {
  const pct = Math.max(0, Math.min(100, (value / 5) * 100));
  return (
    <span dir="ltr" className="relative inline-flex" aria-hidden>
      <span className="flex gap-0.5 text-amber-400/30">
        {Array.from({ length: 5 }, (_, i) => (
          <StarIcon key={i} className={`${size} fill-current`} />
        ))}
      </span>
      <span className="absolute inset-y-0 left-0 flex gap-0.5 overflow-hidden text-amber-400" style={{ width: `${pct}%` }}>
        {Array.from({ length: 5 }, (_, i) => (
          <StarIcon key={i} className={`${size} shrink-0 fill-current`} />
        ))}
      </span>
    </span>
  );
}

function ReviewCard({ review, index }: { review: GoogleReview; index: number }) {
  const initial = review.author.trim().charAt(0);
  return (
    <figure className="surface flex h-full flex-col rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between gap-3">
        <span aria-label={`${review.rating} מתוך 5 כוכבים`} className="flex gap-0.5 text-amber-400">
          {Array.from({ length: 5 }, (_, s) => (
            <StarIcon key={s} className={`h-4 w-4 ${s < review.rating ? 'fill-current' : 'opacity-25'}`} />
          ))}
        </span>
        <span className="inline-flex items-center gap-1 text-[11px] font-bold text-mist-500">
          <GoogleIcon className="h-3.5 w-3.5" />
          ביקורת Google
        </span>
      </div>

      {/* The text exactly as Google delivered it — never shortened or edited. */}
      <blockquote className="mt-2.5 flex-1 whitespace-pre-line text-[15px] leading-relaxed text-mist-100">{review.text}</blockquote>

      <figcaption className="mt-3 flex items-center gap-2.5">
        {review.authorPhoto ? (
          <Image
            src={review.authorPhoto}
            alt=""
            width={36}
            height={36}
            className="h-9 w-9 shrink-0 rounded-full object-cover"
            loading="lazy"
          />
        ) : (
          <span
            aria-hidden
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full text-sm font-black text-white"
            style={{ background: AVATARS[index % AVATARS.length] }}
          >
            {initial}
          </span>
        )}
        <span className="min-w-0">
          {review.authorUrl ? (
            <a href={review.authorUrl} target="_blank" rel="noopener noreferrer nofollow" className="block truncate text-sm font-extrabold hover:text-brand-400">
              {review.author}
            </a>
          ) : (
            <span className="block truncate text-sm font-extrabold">{review.author}</span>
          )}
          <span className="block text-xs text-mist-500">
            {review.when}
            {review.reportUrl ? (
              <>
                {' · '}
                <a href={review.reportUrl} target="_blank" rel="noopener noreferrer nofollow" className="hover:text-mist-300">
                  דיווח
                </a>
              </>
            ) : null}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Real Google reviews, straight from the Places API. Renders nothing when
 * there is no data — no placeholder, no "coming soon", nothing invented.
 * Phones get a swipeable rail (CSS scroll-snap, no JavaScript); wider
 * screens a grid.
 */
export function GoogleReviews({ data }: { data: GoogleReviewsData | null }) {
  if (!data || data.reviews.length === 0) return null;
  const shown = data.reviews.slice(0, 6);
  const ratingText = data.rating.toFixed(1);

  return (
    <Section id="reviews">
      <SectionHeading eyebrow="ביקורות" title="מה הלקוחות שלנו אומרים" />

      <Reveal className="mx-auto -mt-2 mb-6 flex max-w-2xl flex-col items-center gap-1.5 text-center sm:mb-8">
        <StarRow value={data.rating} size="h-7 w-7" />
        <p className="text-lg font-black">
          <span dir="ltr">{ratingText}</span> בגוגל
        </p>
        <p className="text-sm font-bold text-mist-500">
          מבוסס על <span dir="ltr">{data.reviewCount}</span> ביקורות
        </p>
      </Reveal>

      {/* Phone: one card per swipe. sm+: a grid. */}
      <ul
        className="shine-rail -mx-4 flex snap-x snap-mandatory gap-3 overflow-x-auto px-4 pb-1 sm:mx-0 sm:grid sm:grid-cols-2 sm:overflow-visible sm:px-0 lg:grid-cols-3"
        aria-label="ביקורות Google"
      >
        {shown.map((r, i) => (
          <li key={r.id} className="w-[85%] shrink-0 snap-center sm:w-auto">
            <ReviewCard review={r} index={i} />
          </li>
        ))}
      </ul>

      <Reveal className="mt-6 flex flex-col items-center gap-3 text-center">
        <a
          href={data.mapsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 rounded-full bg-white px-6 py-3.5 text-base font-extrabold text-brand-400 shadow-sm ring-2 ring-brand-500/25 transition hover:ring-brand-500/50"
        >
          <GoogleIcon className="h-5 w-5" />
          קראו את כל הביקורות בגוגל
        </a>
        <p className="inline-flex items-center gap-1.5 text-xs text-mist-500">
          <GoogleIcon className="h-3.5 w-3.5" />
          ביקורות מתוך Google
        </p>
      </Reveal>
    </Section>
  );
}
