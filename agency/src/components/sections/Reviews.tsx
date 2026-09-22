import { site } from '@/config/site';
import { reviewsCopy as copy } from '@/content/copy';
import { aggregate, reviews, showWhenEmpty } from '@/content/reviews';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { ExternalIcon, QuoteIcon, StarIcon } from '@/components/ui/icons';

const monthFormatter = new Intl.DateTimeFormat('he-IL', { month: 'long', year: 'numeric' });

/**
 * Google reviews. Real entries only (content/reviews.ts). With none, shows a
 * calm, honest empty state on preview builds — and nothing in production.
 */
export function Reviews() {
  const has = reviews.length > 0;
  if (!has && !showWhenEmpty) return null;
  const googleUrl = site.social.googleReviews;

  return (
    <section id="reviews" aria-labelledby="reviews-title" className="section pt-0 lg:pt-0">
      <div className="container-site">
        <Reveal>
          <SectionHeading
            id="reviews-title"
            eyebrow={copy.eyebrow}
            title={has ? copy.titleWithReviews : copy.title}
            center={!has}
          />
        </Reveal>

        {has ? (
          <>
            {aggregate ? (
              <p className="mt-4 text-sm text-muted">
                דירוג ממוצע <bdi dir="ltr">{aggregate.rating}</bdi> מתוך 5 על סמך <bdi dir="ltr">{aggregate.count}</bdi>{' '}
                ביקורות
              </p>
            ) : null}
            <ul className="mt-10 grid gap-6 md:grid-cols-2 lg:grid-cols-3">
              {reviews.map((r, i) => (
                <Reveal as="li" key={`${r.name}-${r.date}`} delay={i * 60} className="card-dark flex flex-col p-6">
                  <div className="flex items-center gap-3">
                    <span
                      aria-hidden
                      className="flex h-10 w-10 items-center justify-center rounded-full bg-surface-2 text-base font-bold text-fg"
                    >
                      {r.name.trim().charAt(0)}
                    </span>
                    <div>
                      <p className="font-semibold text-fg">{r.name}</p>
                      {r.business ? <p className="text-[13px] text-subtle">{r.business}</p> : null}
                    </div>
                  </div>
                  <p className="mt-3 flex gap-0.5" aria-label={copy.ratingAria(r.rating)}>
                    {Array.from({ length: 5 }).map((_, s) => (
                      <StarIcon key={s} className={`h-4 w-4 ${s < r.rating ? 'text-accent' : 'text-border-strong'}`} />
                    ))}
                  </p>
                  <p className="mt-3 text-[15px] leading-relaxed text-muted">{r.text}</p>
                  <p className="mt-4 flex items-center justify-between text-[13px] text-subtle">
                    <time dateTime={r.date}>{monthFormatter.format(new Date(`${r.date}-01`))}</time>
                    {r.sourceUrl ? (
                      <a
                        href={r.sourceUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-1 hover:text-fg"
                      >
                        {copy.original}
                        <ExternalIcon className="h-3.5 w-3.5" />
                      </a>
                    ) : null}
                  </p>
                </Reveal>
              ))}
            </ul>
          </>
        ) : (
          <Reveal delay={60}>
            <div className="card-dark mx-auto mt-10 max-w-[560px] p-8 text-center" data-placeholder="reviews-empty">
              <QuoteIcon className="mx-auto h-10 w-10 text-accent" strokeWidth={1.5} />
              <h3 className="mt-4 text-lg font-semibold text-fg">{copy.emptyTitle}</h3>
              <p className="mt-2 text-[15px] leading-relaxed text-muted">{copy.empty}</p>
              <p className="mt-2 text-sm text-subtle">{copy.emptySecondary}</p>
              {googleUrl ? (
                <a href={googleUrl} target="_blank" rel="noopener noreferrer" className="btn btn-outline mt-5">
                  {copy.googleCta}
                  <ExternalIcon className="h-4 w-4" />
                </a>
              ) : null}
            </div>
          </Reveal>
        )}
      </div>
    </section>
  );
}
