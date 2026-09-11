import { WaLink } from '@/components/hamavrik/CtaLinks';
import { Scene } from '@/components/hamavrik/Illustrations';
import { Reveal } from '@/components/hamavrik/Reveal';
import { WhatsAppIcon } from '@/components/icons';
import type { Service } from '@/lib/hamavrik/config';
import { waLinkFor } from '@/lib/hamavrik/links';
import Image from 'next/image';

/**
 * Compact service rows: illustration (or the real photo from config) on the
 * side, name, one line, the starting price where there is one, and a small
 * "קבלו מחיר" — six services fit in one and a half phone screens instead of
 * six.
 */
export function ServiceCard({ service, delay = 0 }: { service: Service; delay?: number }) {
  return (
    <Reveal as="li" delay={delay}>
      <article className="surface surface-hover flex items-center gap-3 rounded-2xl p-2.5 sm:gap-4 sm:p-4">
        <div className="relative h-[4.25rem] w-[5.5rem] shrink-0 overflow-hidden rounded-xl bg-ink-900 sm:h-24 sm:w-28">
          {service.image ? (
            <Image src={service.image} alt={service.name} fill sizes="112px" className="object-cover" />
          ) : (
            <Scene kind={service.scene} variant="after" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <h3 className="text-base font-black leading-tight sm:text-lg">
            {service.name}
            {service.priceFrom ? (
              <span className="ms-2 whitespace-nowrap rounded-full bg-brand-300/60 px-2 py-0.5 text-xs font-black text-brand-400">
                החל מ-{service.priceFrom}₪
              </span>
            ) : null}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-mist-300 sm:text-sm">{service.short}</p>
          <WaLink
            href={waLinkFor(`מתעניין/ת ב${service.name}.`)}
            location={`service-card:${service.id}`}
            className="mt-1.5 inline-flex items-center gap-1.5 rounded-full bg-wa-100 px-3 py-1 text-xs font-extrabold text-wa-600 transition-colors hover:bg-wa-500 hover:text-white"
          >
            <WhatsAppIcon className="h-3.5 w-3.5" />
            קבלו מחיר
          </WaLink>
        </div>
      </article>
    </Reveal>
  );
}

export function ServicesGrid({ services }: { services: Service[] }) {
  return (
    <ul className="grid gap-2.5 sm:grid-cols-2 sm:gap-3 lg:grid-cols-3">
      {services.map((s, i) => (
        <ServiceCard key={s.id} service={s} delay={(i % 3) * 70} />
      ))}
    </ul>
  );
}
