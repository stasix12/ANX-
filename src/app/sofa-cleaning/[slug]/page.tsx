import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Explainer } from '@/components/hamavrik/Explainer';
import { Faq, faqFor } from '@/components/hamavrik/Faq';
import { FeaturedVideo } from '@/components/hamavrik/FeaturedVideo';
import { FinalCta } from '@/components/hamavrik/FinalCta';
import { Hero } from '@/components/hamavrik/Hero';
import { HowItWorks } from '@/components/hamavrik/HowItWorks';
import { JsonLd, faqSchema, landingBreadcrumb, serviceSchema } from '@/components/hamavrik/JsonLd';
import { Pricing } from '@/components/hamavrik/Pricing';
import { QuickQuote } from '@/components/hamavrik/QuickQuote';
import { Reveal } from '@/components/hamavrik/Reveal';
import { Section, SectionHeading } from '@/components/hamavrik/Section';
import { ServiceAreas } from '@/components/hamavrik/ServiceAreas';
import { ServicesGrid } from '@/components/hamavrik/Services';
import { TrustStrip } from '@/components/hamavrik/TrustStrip';
import { WhyUs } from '@/components/hamavrik/WhyUs';
import { business, featuredVideo, landingPages, processVideo, serviceById, services } from '@/lib/hamavrik/config';
import { absoluteUrl, href, waAsk } from '@/lib/hamavrik/links';

interface PageProps {
  params: Promise<{ slug: string }>;
}

/** Every landing page listed in config.ts is pre-rendered; anything else 404s. */
export const dynamicParams = false;

export function generateStaticParams() {
  return landingPages.map((page) => ({ slug: page.slug }));
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { slug } = await params;
  const page = landingPages.find((p) => p.slug === slug);
  if (!page) return { title: 'הדף לא נמצא' };
  const url = absoluteUrl(`/${page.slug}`);
  return {
    title: page.title,
    description: page.description,
    alternates: { canonical: url },
    openGraph: {
      type: 'website',
      locale: 'he_IL',
      siteName: business.name,
      url,
      title: `${page.title} | ${business.name}`,
      description: page.description,
      images: [{ url: absoluteUrl('/opengraph-image'), width: 1200, height: 630, alt: `${business.name} — ${page.h1}` }],
    },
    twitter: { card: 'summary_large_image', title: page.title, description: page.description },
  };
}

/**
 * City × service landing page — the page the ad actually lands on. Same
 * conversion skeleton as the home page, with the copy, the quote form
 * defaults, the FAQ and the structured data all narrowed to this city and
 * this service.
 *
 * The subtitle under the H1 used to be the meta description: four lines that
 * repeated the H1 and then repeated the price the pill had just shown. It is
 * now `heroSubtitle`, written for the page, and the paragraph that names the
 * Beer Sheva neighbourhoods — the only copy that makes this page anything
 * other than the home page — moved out of a "before and after" lede it had
 * nothing to do with and into a block of its own under the form.
 */
export default async function LandingPage({ params }: PageProps) {
  const { slug } = await params;
  const page = landingPages.find((p) => p.slug === slug);
  if (!page) notFound();

  const service = serviceById[page.service];
  const otherServices = services.filter((s) => s.id !== service.id && s.featured);
  const faqItems = faqFor(page.faqOverrides);

  return (
    <>
      <JsonLd data={[serviceSchema(service, page.city), faqSchema(faqItems), landingBreadcrumb(page)]} />

      <Hero
        title={
          <>
            {page.h1}{' '}
            <span className="block text-aqua-300">עד הבית, מחיר לפי תמונה</span>
          </>
        }
        subtitle={page.heroSubtitle}
        waMessage={waAsk(service.waNoun, page.city)}
        priceFrom={service.priceFrom}
        priceLabel={service.name}
      />
      <TrustStrip />

      <nav aria-label="פירורי לחם" className="mx-auto max-w-6xl px-4 pt-6 text-sm text-mist-500 sm:px-6">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href={href('/')} prefetch={false} className="font-bold hover:text-brand-400">
              {business.name}
            </Link>
          </li>
          <li aria-hidden>‹</li>
          <li aria-current="page" className="font-bold text-mist-300">
            {page.h1}
          </li>
        </ol>
      </nav>

      {service.id === 'sofa' ? (
        <Section id="before-after" className="pt-8 sm:pt-10 lg:pt-12">
          <SectionHeading
            eyebrow="מהשטח"
            title="ככה זה נראה מקרוב"
            lede="סרטון מעבודה אמיתית שלנו — לא סטוק ולא הדמיה. מתחתיו כתוב בדיוק מה קורה שם."
          />
          <FeaturedVideo video={processVideo ?? featuredVideo} />
        </Section>
      ) : null}

      <Section id="prices" tone="tint">
        <SectionHeading eyebrow="מחירון" title={`מחירי ${service.name} ב${page.city}`} lede="מחירי פתיחה שקופים. המחיר הסופי נסגר מראש לפי תמונה." />
        <Pricing />
      </Section>

      <Section id="quote">
        <SectionHeading
          eyebrow="הצעת מחיר מהירה"
          title={`קבלו מחיר ל${service.waNoun.replace('ניקוי ', '')} שלכם ב${page.city}`}
          titleId="quote-title"
          lede="שלוש שאלות, ואז שולחים תמונה בוואטסאפ ומקבלים מחיר."
        />
        <Reveal delay={60}>
          <QuickQuote defaultService={service.id} defaultCity={page.city} />
        </Reveal>

        {page.localBlock ? (
          <Reveal className="mx-auto mt-8 max-w-3xl rounded-2xl bg-ink-900 p-5 sm:p-7">
            <h3 className="text-lg font-black sm:text-xl">{page.localBlock.title}</h3>
            <p className="mt-2 text-[15px] leading-relaxed text-mist-300">{page.localBlock.body}</p>
          </Reveal>
        ) : null}
      </Section>

      <Section id="services" tone="tint">
        <SectionHeading eyebrow="עוד שירותים" title={`מה עוד אנחנו מנקים ב${page.city}?`} />
        <ServicesGrid services={otherServices} />
      </Section>

      <Section id="how">
        <SectionHeading eyebrow="התהליך" title="איך זה עובד?" />
        <HowItWorks />
      </Section>

      <Section id="why" tone="tint">
        <SectionHeading eyebrow="למה אנחנו" title={`למה לבחור ב${business.name} ב${page.city}?`} />
        <WhyUs />
      </Section>

      {service.id === 'sofa' ? (
        <Section id="about">
          <SectionHeading eyebrow="מדריך מקצועי" title="ניקוי ספות מקצועי — מה חשוב לדעת?" align="start" />
          <Explainer />
        </Section>
      ) : null}

      <Section id="faq" tone={service.id === 'sofa' ? 'tint' : 'plain'}>
        <SectionHeading eyebrow="שאלות ותשובות" title="שאלות נפוצות" />
        <Faq items={faqItems} />
      </Section>

      <Section id="areas" tone={service.id === 'sofa' ? 'plain' : 'tint'}>
        <SectionHeading eyebrow="אזורי שירות" title={`${page.city} והסביבה`} />
        <ServiceAreas currentSlug={page.slug} />
      </Section>

      <Section id="cta" tone={service.id === 'sofa' ? 'tint' : 'plain'}>
        <FinalCta />
      </Section>
    </>
  );
}
