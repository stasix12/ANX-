import Link from 'next/link';
import { WaButton } from '@/components/hamavrik/CtaLinks';
import { Reveal } from '@/components/hamavrik/Reveal';
import { MapPinIcon } from '@/components/icons';
import { landingPages, serviceAreas } from '@/lib/hamavrik/config';
import { href, waLinkFor } from '@/lib/hamavrik/links';

/**
 * Where we go. The two headline cities are big; the nearby towns are a chip
 * cloud; each existing city landing page is linked (internal links for SEO
 * and a real destination for a visitor who wants "their" page).
 */
export function ServiceAreas({ currentSlug }: { currentSlug?: string }) {
  const pages = landingPages.filter((p) => p.slug !== currentSlug);
  return (
    <div className="grid gap-6 lg:grid-cols-[1fr_1fr]">
      <Reveal>
        <div className="shine-hero relative h-full overflow-hidden rounded-[1.5rem] p-7 sm:p-9">
          <MapPinIcon className="h-8 w-8 text-aqua-300" />
          <p className="mt-4 text-sm font-bold text-white/70">מגיעים אליכם ב-</p>
          <p className="mt-1 text-4xl font-black leading-tight sm:text-5xl">
            {serviceAreas.primary.map((c, i) => (
              <span key={c} className="block">
                {c}
                {i < serviceAreas.primary.length - 1 ? '' : ''}
              </span>
            ))}
            <span className="block text-2xl text-aqua-300 sm:text-3xl">ו{serviceAreas.regionLabel}</span>
          </p>
          <p className="mt-5 max-w-sm text-white/80">{serviceAreas.note}</p>
          <WaButton location="service-areas" href={waLinkFor('האם אתם מגיעים ליישוב שלי?')} className="mt-6">
            בדקו אם אנחנו מגיעים אליכם
          </WaButton>
        </div>
      </Reveal>

      <Reveal delay={120}>
        <div className="surface h-full rounded-[1.5rem] p-7 sm:p-9">
          <h3 className="text-lg font-black">יישובים נוספים באזור</h3>
          <ul className="mt-4 flex flex-wrap gap-2">
            {serviceAreas.nearby.map((town) => (
              <li key={town} className="rounded-full bg-ink-900 px-3.5 py-1.5 text-sm font-bold text-mist-300">
                {town}
              </li>
            ))}
          </ul>
          {pages.length ? (
            <>
              <h3 className="mt-8 text-lg font-black">עמודי שירות לפי עיר</h3>
              <ul className="mt-3 grid gap-2 sm:grid-cols-2">
                {pages.map((p) => (
                  <li key={p.slug}>
                    <Link
                      href={href(`/${p.slug}`)}
                      className="flex items-center gap-2 rounded-xl px-3 py-2 text-sm font-bold text-brand-400 transition-colors hover:bg-brand-300/40"
                    >
                      <MapPinIcon className="h-4 w-4 shrink-0" />
                      {p.h1}
                    </Link>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
      </Reveal>
    </div>
  );
}
