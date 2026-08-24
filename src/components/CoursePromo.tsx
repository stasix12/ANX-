import Link from 'next/link';
import { PlayIcon } from '@/components/icons';
import { formatPrice, type Product } from '@/lib/products';
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
    <section className="border-y border-ink-700">
      <div className="mx-auto max-w-6xl px-4 py-12 sm:px-6 sm:py-16">
        <div className="mx-auto max-w-md text-center">
          <p className="text-xs font-semibold tracking-[0.18em] text-brand-700 uppercase">
            קורס אונליין
          </p>
          <h2 className="mt-3 text-2xl font-extrabold tracking-tight text-balance-he sm:text-3xl">
            {course.name}
          </h2>
          <p className="mt-3 text-base leading-relaxed text-mist-300">{course.tagline}</p>

          <div className="mx-auto mt-7 max-w-[280px] overflow-hidden rounded-card border border-ink-700 bg-black shadow-xl">
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

          <p className="mt-6 text-2xl font-extrabold">{course.price !== undefined ? formatPrice(course.price) : ''}</p>

          <Link
            href={`/products/${course.slug}`}
            className="mt-5 inline-flex items-center gap-2 rounded-full bg-brand-500 px-6 py-3 text-sm font-bold text-on-brand transition-colors duration-200 hover:bg-brand-400"
          >
            <PlayIcon className="h-4 w-4" />
            לפרטים ולהרשמה
          </Link>
        </div>
      </div>
    </section>
  );
}
