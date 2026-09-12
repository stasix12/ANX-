import Link from 'next/link';
import Image from 'next/image';
import { WaLink } from '@/components/hamavrik/CtaLinks';
import { Scene } from '@/components/hamavrik/Illustrations';
import { Reveal } from '@/components/hamavrik/Reveal';
import { WhatsAppIcon } from '@/components/icons';
import { landingPages, priceText, type Service } from '@/lib/hamavrik/config';
import { href, waAsk, waLink } from '@/lib/hamavrik/links';

/** The landing page for this service, when one exists — the only internal
 *  links in the body copy used to be WhatsApp, which is a dead end for Google. */
function pageFor(service: Service) {
  return landingPages.find((p) => p.service === service.id) ?? null;
}

/**
 * Compact service rows: illustration (or the real photo from config) on the
 * side, name, one line, the starting price, and a WhatsApp button.
 *
 * That button stays, against the suggestion to drop it because "the sticky bar
 * offers the same thing": it does not. The sticky bar sends a generic message;
 * this one arrives already saying "ניקוי מזרן", and it is the only place on
 * the page where someone who came for a mattress or a car can ask in context.
 */
export function ServiceCard({ service, delay = 0 }: { service: Service; delay?: number }) {
  const page = pageFor(service);
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
            {page ? (
              <Link href={href(`/${page.slug}`)} prefetch={false} className="hover:text-brand-400">
                {service.name}
              </Link>
            ) : (
              service.name
            )}
          </h3>
          <p className="mt-0.5 line-clamp-2 text-[13px] leading-snug text-mist-300 sm:text-sm">{service.short}</p>
          <div className="mt-1.5 flex flex-wrap items-center gap-2">
            <WaLink
              href={waLink(waAsk(service.waNoun))}
              location={`service-card:${service.id}`}
              className="inline-flex min-h-11 items-center gap-1.5 rounded-full bg-wa-100 px-3.5 text-[13px] font-extrabold text-wa-600 transition-colors hover:bg-wa-600 hover:text-white"
            >
              <WhatsAppIcon className="h-4 w-4" />
              קבלו מחיר
            </WaLink>
            {service.priceFrom ? (
              <span className="text-[13px] font-black text-brand-400">
                החל מ-<bdi dir="rtl">{priceText(service.priceFrom)}</bdi>
              </span>
            ) : null}
          </div>
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
