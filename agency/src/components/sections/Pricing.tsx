import { pricing } from '@/config/site';
import { pricingCopy as copy } from '@/content/copy';
import { cn } from '@/lib/cn';
import { formatCurrency } from '@/lib/format';
import { CtaLink } from '@/components/ui/CtaLink';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { CheckIcon, WhatsAppIcon } from '@/components/ui/icons';

/**
 * Two tiers, recommended one first in reading order. Prices come from
 * config/site.ts — `null` renders the honest "הצעת מחיר לפי אפיון" label; a
 * number renders "החל מ-X ₪".
 */
export function Pricing() {
  const tiers = [
    { ...pricing['website-google'], ...copy.google, intent: 'website_ads' as const },
    { ...pricing.website, ...copy.website, intent: 'website' as const },
  ];

  return (
    <section id="pricing" aria-labelledby="pricing-title" className="section">
      <div className="container-site">
        <Reveal>
          <SectionHeading id="pricing-title" eyebrow={copy.eyebrow} title={copy.title} intro={copy.intro} />
        </Reveal>

        <div className="mx-auto mt-12 grid max-w-[880px] gap-6 lg:grid-cols-2 lg:items-stretch">
          {tiers.map((tier, i) => (
            <Reveal
              as="article"
              key={tier.id}
              delay={i * 80}
              className={cn(
                'relative flex flex-col rounded-[var(--radius-xl)] border p-7 lg:p-10',
                tier.popular
                  ? 'accent-top border-accent/40 bg-surface-2 lg:-translate-y-3'
                  : 'border-border bg-surface-1',
              )}
            >
              {tier.popular && 'badge' in tier ? (
                <span className="badge absolute top-0 start-7 -translate-y-1/2 lg:start-10">{tier.badge}</span>
              ) : null}
              <h3 className="h3 text-fg">{tier.name}</h3>
              <p className="mt-2 text-sm text-muted">{tier.tagline}</p>

              <div className="mt-6 border-b border-border pb-6">
                {typeof tier.price === 'number' ? (
                  <>
                    <p className="tabular text-[22px] font-semibold leading-none text-fg">
                      <span className="text-base font-medium text-muted">{copy.from}</span>
                      <bdi>{formatCurrency(tier.price)}</bdi>
                    </p>
                    {tier.priceNote ? <p className="mt-2 text-[13px] text-subtle">{tier.priceNote}</p> : null}
                    {typeof tier.monthly === 'number' ? (
                      <p className="mt-2 text-sm text-muted">
                        {copy.monthlyPrefix}
                        <bdi className="tabular font-semibold text-fg">
                          {formatCurrency(tier.monthly)}
                        </bdi>
                        {tier.monthlyNote ? (
                          <span className="block text-[13px] text-subtle">{tier.monthlyNote}</span>
                        ) : null}
                      </p>
                    ) : null}
                  </>
                ) : (
                  <>
                    <p className="text-[22px] font-semibold leading-tight text-fg">{copy.noPrice}</p>
                    <p className="mt-2 text-[13px] text-subtle">{copy.noPriceSub}</p>
                  </>
                )}
              </div>

              <ul className="check-list mt-6 text-muted">
                {tier.features.map((f) => (
                  <li key={f}>
                    <CheckIcon strokeWidth={2.5} />
                    <span>{f}</span>
                  </li>
                ))}
              </ul>
              {tier.popular ? <p className="mt-5 text-[13px] leading-relaxed text-subtle">{copy.budgetNote}</p> : null}

              <div className="mt-auto pt-8">
                <CtaLink
                  intent={tier.intent}
                  location="pricing"
                  label={tier.cta}
                  events={['pricing_cta_click']}
                  className={cn('btn btn-block btn-lg', tier.popular ? 'btn-primary' : 'btn-outline')}
                >
                  {tier.cta}
                </CtaLink>
              </div>
            </Reveal>
          ))}
        </div>

        <Reveal delay={160}>
          <div className="mx-auto mt-8 flex max-w-[880px] flex-col gap-3 text-sm text-muted sm:flex-row sm:items-center sm:justify-between">
            <p className="flex items-center gap-2">
              <CheckIcon className="h-4 w-4 text-accent" strokeWidth={2.5} />
              {copy.ownership}
            </p>
            <p className="flex flex-wrap items-center gap-x-2">
              {copy.helpLine}
              <WhatsAppLink
                context="pricing"
                location="pricing"
                className="inline-flex items-center gap-1.5 font-semibold text-accent-soft hover:underline"
              >
                <WhatsAppIcon className="h-4 w-4 text-whatsapp" />
                {copy.helpCta}
              </WhatsAppLink>
            </p>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
