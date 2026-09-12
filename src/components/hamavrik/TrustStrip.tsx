import { ICONS } from '@/components/hamavrik/icons';
import { GoogleIcon } from '@/components/hamavrik/icons';
import { StarIcon } from '@/components/icons';
import { business, reviews, stats, trustPoints } from '@/lib/hamavrik/config';

/**
 * The trust bar right under the hero.
 *
 * The Google block appears only once there is something real behind it — a
 * rating, a review count, or at least one review in config.ts. Until then it
 * is gone entirely, and so is the link it carried: "לקוחות ממליצים" with no
 * customers behind it is a claim the business cannot back, and the link sent
 * a visitor we paid for to a Google results page full of competitors' ads.
 * The day a review lands in config.ts, the block comes back on its own.
 */
export function TrustStrip() {
  const hasNumbers = stats.rating !== null || stats.reviewCount !== null;
  const showGoogle = hasNumbers || reviews.length > 0;
  return (
    <section aria-label="למה לסמוך עלינו" className="border-b border-ink-800 bg-white">
      <div
        className={`mx-auto flex max-w-6xl flex-col gap-4 px-4 py-4 sm:px-6 sm:py-5 lg:flex-row lg:items-center ${
          showGoogle ? 'lg:justify-between' : 'lg:justify-center'
        }`}
      >
        {showGoogle ? (
          <a
            href={business.googleReviewsUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-3 rounded-2xl px-2 py-1 transition-colors hover:bg-ink-900 lg:justify-start"
          >
            {hasNumbers ? (
              <span aria-hidden className="flex gap-0.5 text-amber-400">
                {Array.from({ length: 5 }, (_, i) => (
                  <StarIcon key={i} className="h-5 w-5 fill-current" />
                ))}
              </span>
            ) : (
              <GoogleIcon className="h-7 w-7" />
            )}
            <span className="text-sm font-extrabold">
              {stats.rating !== null ? <span dir="ltr">{stats.rating.toFixed(1)}</span> : null}
              {stats.rating !== null && stats.reviewCount !== null ? ' · ' : ''}
              {stats.reviewCount !== null ? `${stats.reviewCount} ביקורות` : 'ביקורות Google'}
              <span className="block text-xs font-medium text-mist-500">לביקורות שלנו ב-Google ‹</span>
            </span>
          </a>
        ) : null}

        <ul className="grid grid-cols-2 gap-x-3 gap-y-2.5 sm:grid-cols-4 lg:gap-x-8">
          {trustPoints.map((t) => {
            const Icon = ICONS[t.icon];
            return (
              <li key={t.title} className="flex items-center gap-2.5">
                <span className="grid h-9 w-9 shrink-0 place-items-center rounded-xl bg-brand-300/60 text-brand-400">
                  <Icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-sm font-extrabold leading-tight">{t.title}</span>
                  <span className="block text-xs text-mist-500">{t.desc}</span>
                </span>
              </li>
            );
          })}
        </ul>
      </div>
    </section>
  );
}
