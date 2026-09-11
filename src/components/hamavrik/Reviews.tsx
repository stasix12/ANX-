import { Reveal } from '@/components/hamavrik/Reveal';
import { GoogleIcon } from '@/components/hamavrik/icons';
import { StarIcon } from '@/components/icons';
import { business, type Review } from '@/lib/hamavrik/config';

const AVATARS = ['#1a56db', '#0f8f84', '#7c3aed', '#c2410c'];

/**
 * Review cards. A review flagged `placeholder` in config.ts wears a visible
 * "ביקורת לדוגמה" ribbon — the site never passes off invented praise as
 * real, and the ribbon disappears the moment the text is replaced.
 */
export function Reviews({ reviews }: { reviews: Review[] }) {
  return (
    <>
      <ul className="grid gap-5 md:grid-cols-3">
        {reviews.map((r, i) => (
          <Reveal as="li" key={`${r.name}-${i}`} delay={i * 100} className="h-full">
            <figure className="surface relative flex h-full flex-col rounded-[1.5rem] p-6">
              {r.placeholder ? (
                <span className="absolute -top-3 start-5 rounded-full bg-amber-100 px-3 py-1 text-[11px] font-black text-amber-800 ring-1 ring-amber-300">
                  ביקורת לדוגמה — יוחלף בביקורת אמיתית
                </span>
              ) : null}
              <div className="flex items-center justify-between">
                <span aria-label={`${r.rating} מתוך 5 כוכבים`} className="flex gap-0.5 text-amber-400">
                  {Array.from({ length: 5 }, (_, s) => (
                    <StarIcon key={s} className={`h-4.5 w-4.5 ${s < r.rating ? 'fill-current' : 'opacity-25'}`} />
                  ))}
                </span>
                {r.source === 'google' ? <GoogleIcon className="h-5 w-5" /> : null}
              </div>
              <blockquote className={`mt-3 flex-1 leading-relaxed ${r.placeholder ? 'text-mist-500' : 'text-mist-100'}`}>
                &ldquo;{r.text}&rdquo;
              </blockquote>
              <figcaption className="mt-5 flex items-center gap-3">
                <span
                  aria-hidden
                  className="grid h-10 w-10 shrink-0 place-items-center rounded-full text-base font-black text-white"
                  style={{ background: AVATARS[i % AVATARS.length] }}
                >
                  {r.name.charAt(0)}
                </span>
                <span>
                  <span className="block text-sm font-extrabold">{r.name}</span>
                  <span className="block text-xs text-mist-500">{r.city}</span>
                </span>
              </figcaption>
            </figure>
          </Reveal>
        ))}
      </ul>
      <Reveal className="mt-8 text-center">
        <a
          href={business.googleReviewsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex items-center gap-2.5 rounded-full bg-white px-6 py-3.5 text-base font-extrabold text-mist-100 shadow-md ring-1 ring-ink-700 transition hover:ring-brand-500/50"
        >
          <GoogleIcon className="h-5 w-5" />
          לכל הביקורות שלנו
        </a>
      </Reveal>
    </>
  );
}
