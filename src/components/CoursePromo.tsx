import Link from 'next/link';
import { PlayIcon } from '@/components/icons';
import { Price } from '@/components/Price';
import type { Product } from '@/lib/products';
import { asset } from '@/lib/site';

/**
 * Featured band between the product grid and the FAQ: the course's own demo
 * clip in a framed, phone-shaped box (it was shot portrait, so the frame
 * stays portrait and centered rather than stretched full-width), with a
 * short hook and a link through to the full course page for the actual
 * order flow.
 */
export function CoursePromo({ course }: { course: Product }) {
  if (!course.video) return null;

  return (
    <section className="border-y border-ink-700 bg-ink-900">
      <div className="mx-auto max-w-7xl px-4 py-14 sm:px-6 sm:py-20 lg:px-8">
        <div className="mx-auto max-w-md text-center">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-brand-700">
            <span aria-hidden className="h-0.5 w-4 rounded-full bg-brand-500" />
            הכשרה מקצועית
          </p>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-balance-he sm:text-3xl">
            {course.name}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-mist-500">{course.tagline}</p>

          <div className="mx-auto mt-7 max-w-[280px] overflow-hidden rounded-card border border-ink-700 bg-black shadow-[0_24px_48px_-28px_rgb(0_0_0/0.35)]">
            <video
              className="block aspect-[9/16] w-full object-cover"
              controls
              muted
              loop
              playsInline
              preload="metadata"
              poster={asset(course.video.poster)}
              aria-label={`${course.name} — סרטון הדגמה`}
            >
              <source src={asset(course.video.webm)} type="video/webm" />
              <source src={asset(course.video.mp4)} type="video/mp4" />
            </video>
          </div>

          {course.price !== undefined ? (
            <p className="mt-6 text-3xl font-extrabold">
              <Price value={course.price} />
            </p>
          ) : null}

          <Link
            href={`/products/${course.slug}`}
            className="mt-5 inline-flex h-12 items-center gap-2 rounded-xl bg-brand-500 px-7 text-base font-bold text-on-brand transition-colors duration-200 hover:bg-brand-600"
          >
            <PlayIcon className="h-4 w-4" />
            לפרטים ולהרשמה
          </Link>
        </div>
      </div>
    </section>
  );
}
