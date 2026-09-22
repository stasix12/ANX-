import { services } from '@/content/copy';
import { hasWhatsApp } from '@/lib/whatsapp';
import { CtaLink } from '@/components/ui/CtaLink';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { BrowserIcon, ChartCursorIcon, CheckIcon, WhatsAppIcon } from '@/components/ui/icons';

export function Services() {
  return (
    <section id="services" aria-labelledby="services-title" className="section pt-0 lg:pt-0">
      <div className="container-site">
        <Reveal>
          <SectionHeading
            id="services-title"
            eyebrow={services.eyebrow}
            title={services.title}
            intro={services.intro}
          />
        </Reveal>

        <div className="mt-10 grid gap-6 lg:grid-cols-2">
          <Reveal as="article" className="card-dark card-hover flex flex-col p-6 lg:p-8">
            <div className="icon-tile">
              <BrowserIcon className="h-5 w-5" />
            </div>
            <h3 className="h3 mt-5 text-fg">{services.website.title}</h3>
            <p className="mt-2 text-[15px] text-muted">{services.website.description}</p>
            <ul className="check-list check-list-2 mt-6 text-muted">
              {services.website.features.map((f) => (
                <li key={f}>
                  <CheckIcon strokeWidth={2.5} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <div className="mt-auto pt-8">
              <CtaLink
                intent="website"
                location="services"
                label={services.website.cta}
                events={['website_package_cta_click']}
                className="btn btn-outline btn-block"
              >
                {services.website.cta}
              </CtaLink>
            </div>
          </Reveal>

          <Reveal
            as="article"
            delay={80}
            className="card-dark card-hover accent-top relative flex flex-col bg-surface-2 p-6 lg:p-8"
          >
            <span className="badge absolute top-0 start-6 -translate-y-1/2">{services.google.badge}</span>
            <div className="icon-tile bg-surface-1">
              <ChartCursorIcon className="h-5 w-5" />
            </div>
            <h3 className="h3 mt-5 text-fg">{services.google.title}</h3>
            <p className="mt-2 text-[15px] text-muted">{services.google.description}</p>
            <p className="mt-6 text-sm font-semibold text-fg">{services.google.featuresLead}</p>
            <ul className="check-list check-list-2 mt-3 text-muted">
              {services.google.features.map((f) => (
                <li key={f}>
                  <CheckIcon strokeWidth={2.5} />
                  <span>{f}</span>
                </li>
              ))}
            </ul>
            <p className="mt-5 text-[13px] leading-relaxed text-subtle">{services.budgetNote}</p>
            <div className="mt-auto pt-6">
              {hasWhatsApp ? (
                <p className="mb-3 text-center text-sm">
                  <WhatsAppLink
                    context="google"
                    location="services"
                    packageId="website_ads"
                    className="inline-flex items-center gap-1.5 font-medium text-accent-soft hover:underline"
                  >
                    <WhatsAppIcon className="h-4 w-4 text-whatsapp" />
                    {services.googleWhatsApp}
                  </WhatsAppLink>
                </p>
              ) : null}
              <CtaLink
                intent="website_ads"
                location="services"
                label={services.google.cta}
                className="btn btn-primary btn-block"
              >
                {services.google.cta}
              </CtaLink>
            </div>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
