import { ICONS } from '@/components/hamavrik/icons';
import { StarIcon } from '@/components/icons';
import { stats, trustPoints } from '@/lib/hamavrik/config';

/**
 * The trust bar right under the hero. The star row is real (we do ask for
 * Google reviews); the numbers next to it appear only when config.ts has
 * them — nothing is invented.
 */
export function TrustStrip() {
  const hasNumbers = stats.rating !== null || stats.reviewCount !== null;
  return (
    <section aria-label="למה לסמוך עלינו" className="border-b border-ink-800 bg-white">
      <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 py-6 sm:px-6 lg:flex-row lg:items-center lg:justify-between">
        <div className="flex items-center justify-center gap-3 lg:justify-start">
          <span aria-hidden className="flex gap-0.5 text-amber-400">
            {Array.from({ length: 5 }, (_, i) => (
              <StarIcon key={i} className="h-5 w-5 fill-current" />
            ))}
          </span>
          <p className="text-sm font-extrabold">
            {hasNumbers ? (
              <>
                {stats.rating !== null ? <span dir="ltr">{stats.rating.toFixed(1)}</span> : null}
                {stats.rating !== null && stats.reviewCount !== null ? ' · ' : ''}
                {stats.reviewCount !== null ? `${stats.reviewCount} ביקורות` : ''}
                <span className="block text-xs font-medium text-mist-500">לקוחות מרוצים ב-Google</span>
              </>
            ) : (
              <>
                לקוחות מרוצים
                <span className="block text-xs font-medium text-mist-500">שירות שמדורג בחמישה כוכבים</span>
              </>
            )}
          </p>
        </div>

        <ul className="grid grid-cols-2 gap-x-4 gap-y-3 sm:grid-cols-4 lg:gap-x-8">
          {trustPoints.map((t) => {
            const Icon = ICONS[t.icon];
            return (
              <li key={t.title} className="flex items-center gap-2.5">
                <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-300/60 text-brand-400">
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
