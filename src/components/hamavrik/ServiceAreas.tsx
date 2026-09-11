import Link from 'next/link';
import { WaButton } from '@/components/hamavrik/CtaLinks';
import { Reveal } from '@/components/hamavrik/Reveal';
import { MapPinIcon } from '@/components/icons';
import { landingPages, serviceAreas } from '@/lib/hamavrik/config';
import { href, waLinkFor } from '@/lib/hamavrik/links';

/**
 * Where we go: the two headline cities, the nearby towns as quiet chips,
 * and the city/service pages as a tidy list of links (real destinations,
 * and internal links for Google) — one card, no keyword walls.
 */
export function ServiceAreas({ currentSlug }: { currentSlug?: string }) {
  const pages = landingPages.filter((p) => p.slug !== currentSlug);
  return (
    <Reveal>
      <div className="surface grid gap-6 rounded-[1.5rem] p-5 sm:p-7 lg:grid-cols-[1fr_1fr] lg:gap-10">
        <div>
          <p className="flex items-center gap-2 text-sm font-bold text-mist-500">
            <MapPinIcon className="h-4 w-4 text-brand-500" />
            מגיעים אליכם ב-
          </p>
          <p className="mt-1 text-3xl font-black leading-tight sm:text-4xl">
            {serviceAreas.primary.join(', ')}
            <span className="block text-xl text-brand-400 sm:text-2xl">ו{serviceAreas.regionLabel}</span>
          </p>
          <ul className="mt-4 flex flex-wrap gap-1.5">
            {serviceAreas.nearby.map((town) => (
              <li key={town} className="rounded-full bg-ink-900 px-3 py-1 text-[13px] font-bold text-mist-300">
                {town}
              </li>
            ))}
          </ul>
          <p className="mt-4 text-sm text-mist-300">{serviceAreas.note}</p>
          <WaButton location="service-areas" href={waLinkFor('האם אתם מגיעים ליישוב שלי?')} className="mt-4">
            שלחו תמונה וקבלו מחיר
          </WaButton>
        </div>

        {pages.length ? (
          <div className="border-t border-ink-800 pt-5 lg:border-s lg:border-t-0 lg:ps-10 lg:pt-0">
            <h3 className="text-sm font-black tracking-wide text-mist-500">עמודי שירות לפי עיר</h3>
            <ul className="mt-2 divide-y divide-ink-800">
              {pages.map((p) => (
                <li key={p.slug}>
                  <Link href={href(`/${p.slug}`)} className="flex items-center justify-between gap-3 py-2.5 text-[15px] font-bold text-brand-400 transition-colors hover:text-brand-500">
                    {p.h1}
                    <span aria-hidden className="text-mist-500">‹</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </div>
    </Reveal>
  );
}
