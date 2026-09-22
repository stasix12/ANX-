import { hero } from '@/content/copy';
import { CtaLink } from '@/components/ui/CtaLink';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { CheckIcon, WhatsAppIcon } from '@/components/ui/icons';
import { HeroMockup } from '@/components/sections/HeroMockup';

export function Hero() {
  return (
    <section
      id="hero"
      aria-labelledby="hero-title"
      className="relative -mt-16 overflow-hidden pt-[calc(64px+56px)] pb-16 lg:-mt-[72px] lg:pt-[calc(72px+96px)] lg:pb-28"
      style={{ background: 'var(--gradient-hero)' }}
    >
      <div className="container-site grid items-center gap-12 lg:grid-cols-12 lg:gap-12">
        <div className="lg:col-span-6">
          <p className="eyebrow hero-rise">{hero.eyebrow}</p>
          <h1
            id="hero-title"
            className="h1 hero-rise mt-5 max-w-[18ch] text-fg"
            style={{ '--delay': '60ms' } as React.CSSProperties}
          >
            {hero.h1Start} <span className="underline-accent">{hero.h1Accent}</span>
            {hero.h1End}
          </h1>
          <p
            className="lead hero-rise mt-6 max-w-[34rem] text-muted"
            style={{ '--delay': '120ms' } as React.CSSProperties}
          >
            {hero.sub}
          </p>

          <div
            className="hero-rise mt-8 flex flex-col gap-3 sm:flex-row"
            style={{ '--delay': '180ms' } as React.CSSProperties}
          >
            <CtaLink location="hero" label={hero.ctaPrimary} className="btn btn-primary btn-lg">
              {hero.ctaPrimary}
            </CtaLink>
            <WhatsAppLink location="hero" className="btn btn-outline btn-lg">
              <WhatsAppIcon className="h-5 w-5 text-whatsapp" />
              {hero.ctaSecondary}
            </WhatsAppLink>
          </div>
          <p className="hero-rise mt-3 text-sm text-subtle" style={{ '--delay': '220ms' } as React.CSSProperties}>
            {hero.reassurance}
          </p>

          <ul
            className="hero-rise mt-8 grid grid-cols-2 gap-x-6 gap-y-3 text-sm text-muted sm:flex sm:flex-wrap"
            style={{ '--delay': '240ms' } as React.CSSProperties}
            aria-label="מה כלול בכל אתר"
          >
            {hero.trust.map((item) => (
              <li key={item} className="flex items-center gap-2">
                <CheckIcon className="h-4 w-4 shrink-0 text-accent" strokeWidth={2.5} />
                <span>{item}</span>
              </li>
            ))}
          </ul>
        </div>

        <div className="lg:col-span-6">
          <HeroMockup />
        </div>
      </div>
    </section>
  );
}
