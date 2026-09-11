'use client';

import Image from 'next/image';
import { WaLink } from '@/components/hamavrik/CtaLinks';
import { Scene } from '@/components/hamavrik/Illustrations';
import { Reveal } from '@/components/hamavrik/Reveal';
import { WhatsAppIcon } from '@/components/icons';
import { track } from '@/lib/hamavrik/analytics';
import type { Service } from '@/lib/hamavrik/config';
import { waLinkFor } from '@/lib/hamavrik/links';

export function ServiceCard({ service, delay = 0 }: { service: Service; delay?: number }) {
  return (
    <Reveal as="li" delay={delay} className="h-full">
      <article className="surface surface-hover group flex h-full flex-col overflow-hidden rounded-[1.5rem]">
        <div className="relative aspect-3/2 overflow-hidden bg-ink-900">
          {service.image ? (
            <Image
              src={service.image}
              alt={`${service.name} — ${service.short}`}
              fill
              sizes="(max-width: 640px) 100vw, (max-width: 1024px) 50vw, 33vw"
              className="object-cover transition-transform duration-500 group-hover:scale-[1.04]"
            />
          ) : (
            <div className="h-full w-full transition-transform duration-500 group-hover:scale-[1.04]">
              <Scene kind={service.scene} variant="after" />
            </div>
          )}
          {service.priceFrom ? (
            <span className="absolute end-3 top-3 rounded-full bg-white/95 px-3 py-1 text-sm font-black text-brand-400 shadow">
              החל מ-{service.priceFrom} ₪
            </span>
          ) : null}
        </div>
        <div className="flex flex-1 flex-col p-5">
          <h3 className="text-xl font-black">{service.name}</h3>
          <p className="mt-2 flex-1 text-[15px] leading-relaxed text-mist-300">{service.short}</p>
          <WaLink
            href={waLinkFor(`מתעניין/ת ב${service.name}.`)}
            location={`service-card:${service.id}`}
            className="mt-5 inline-flex items-center justify-center gap-2 rounded-full bg-ink-900 px-5 py-3 text-sm font-extrabold text-brand-400 transition-colors group-hover:bg-wa-500 group-hover:text-white"
          >
            <WhatsAppIcon className="h-4 w-4" />
            הצעת מחיר ל{service.label}
          </WaLink>
        </div>
      </article>
    </Reveal>
  );
}

export function ServicesGrid({ services }: { services: Service[] }) {
  return (
    <ul
      className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3"
      onClickCapture={(e) => {
        const card = (e.target as HTMLElement).closest('article');
        const title = card?.querySelector('h3')?.textContent;
        if (title) track('service_click', { service: title, location: 'services-grid' });
      }}
    >
      {services.map((s, i) => (
        <ServiceCard key={s.id} service={s} delay={(i % 3) * 90} />
      ))}
    </ul>
  );
}
