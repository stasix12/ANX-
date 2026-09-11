import Image from 'next/image';
import { Reveal } from '@/components/hamavrik/Reveal';
import { GoogleIcon } from '@/components/hamavrik/icons';
import { StarIcon } from '@/components/icons';
import { business, reviewScreenshots, type Review } from '@/lib/hamavrik/config';

const AVATARS = ['#1a56db', '#0f8f84', '#7c3aed'];

/** One real Google review: the real star count, first name, city, a short quote, the Google mark. */
export function GoogleReviewCard({ review, index = 0 }: { review: Review; index?: number }) {
  return (
    <figure className="surface flex h-full flex-col rounded-2xl p-4 sm:p-5">
      <div className="flex items-center justify-between">
        <span aria-label={`${review.rating} מתוך 5 כוכבים`} className="flex gap-0.5 text-amber-400">
          {Array.from({ length: 5 }, (_, s) => (
            <StarIcon key={s} className={`h-4 w-4 ${s < review.rating ? 'fill-current' : 'opacity-25'}`} />
          ))}
        </span>
        <GoogleIcon className="h-5 w-5" />
      </div>
      <blockquote className="mt-2.5 line-clamp-4 flex-1 text-[15px] leading-relaxed text-mist-100">&ldquo;{review.text}&rdquo;</blockquote>
      <figcaption className="mt-3 flex items-center gap-2.5">
        <span aria-hidden className="grid h-8 w-8 shrink-0 place-items-center rounded-full text-sm font-black text-white" style={{ background: AVATARS[index % AVATARS.length] }}>
          {review.name.charAt(0)}
        </span>
        <span>
          <span className="block text-sm font-extrabold">{review.name}</span>
          <span className="block text-xs text-mist-500">
            {review.city}
            {review.date ? ` · ${new Date(review.date).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' })}` : ''}
          </span>
        </span>
      </figcaption>
    </figure>
  );
}

/**
 * Three real reviews from config.ts, or — while there are none — one quiet
 * line that links to the Google profile. No invented quotes, no invented
 * averages.
 */
export function Reviews({ reviews }: { reviews: Review[] }) {
  const link = (
    <a
      href={business.googleReviewsUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-full bg-white px-4 py-2.5 text-sm font-extrabold text-mist-100 shadow-sm ring-1 ring-ink-700 transition hover:ring-brand-500/50"
    >
      <GoogleIcon className="h-4.5 w-4.5" />
      לכל הביקורות שלנו ב-Google
    </a>
  );

  if (!reviews.length && !reviewScreenshots.length) {
    return (
      <Reveal>
        <div className="surface mx-auto flex max-w-xl flex-col items-center gap-3 rounded-2xl px-5 py-5 text-center sm:flex-row sm:justify-between sm:text-start">
          <p className="flex items-center gap-3">
            <GoogleIcon className="h-8 w-8 shrink-0" />
            <span>
              <span className="block font-black">ביקורות Google של לקוחותינו</span>
              <span className="block text-sm text-mist-300">מציגים כאן רק ביקורות אמיתיות מ-Google.</span>
            </span>
          </p>
          {link}
        </div>
      </Reveal>
    );
  }

  return (
    <>
      {reviews.length ? (
        <ul className="grid gap-3 md:grid-cols-3">
          {reviews.slice(0, 3).map((r, i) => (
            <Reveal as="li" key={`${r.name}-${i}`} delay={i * 80} className="h-full">
              <GoogleReviewCard review={r} index={i} />
            </Reveal>
          ))}
        </ul>
      ) : null}

      {reviewScreenshots.length ? (
        <ul className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
          {reviewScreenshots.map((shot) => (
            <li key={shot.src} className="surface overflow-hidden rounded-2xl">
              <Image src={shot.src} alt={shot.alt} width={600} height={900} sizes="(max-width: 640px) 50vw, 25vw" className="h-auto w-full" />
            </li>
          ))}
        </ul>
      ) : null}

      <Reveal className="mt-5 text-center">{link}</Reveal>
    </>
  );
}
