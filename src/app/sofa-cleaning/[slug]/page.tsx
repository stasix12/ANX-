import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { BeforeAfterGallery } from '@/components/hamavrik/BeforeAfterGallery';
import { Explainer } from '@/components/hamavrik/Explainer';
import { Faq } from '@/components/hamavrik/Faq';
import { FinalCta } from '@/components/hamavrik/FinalCta';
import { Hero } from '@/components/hamavrik/Hero';
import { HowItWorks } from '@/components/hamavrik/HowItWorks';
import { JsonLd, faqSchema, landingBreadcrumb, serviceSchema } from '@/components/hamavrik/JsonLd';
import { Pricing } from '@/components/hamavrik/Pricing';
import { QuickQuote } from '@/components/hamavrik/QuickQuote';
import { Reveal } from '@/components/hamavrik/Reveal';
import { Reviews } from '@/components/hamavrik/Reviews';
import { Section, SectionHeading } from '@/components/hamavrik/Section';
import { ServiceAreas } from '@/components/hamavrik/ServiceAreas';
import { ServicesGrid } from '@/components/hamavrik/Services';
import { TrustStrip } from '@/components/hamavrik/TrustStrip';
import { WhyUs } from '@/components/hamavrik/WhyUs';
import {
  beforeAfter,
  business,
  landingPages,
  reviews,
  serviceById,
  services,
  type BeforeAfterItem,
  type ServiceId,
} from '@/lib/hamavrik/config';
import { absoluteUrl, href } from '@/lib/hamavrik/links';

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
  };
}

/** Which before/after tab matches each service. */
const GALLERY_CATEGORY: Partial<Record<ServiceId, BeforeAfterItem['category']>> = {
  sofa: 'sofa',
  armchair: 'sofa',
  mattress: 'mattress',
  chairs: 'chairs',
  stroller: 'chairs',
  car: 'car',
  carpet: 'carpet',
  'wall-to-wall': 'carpet',
};

/**
 * City × service landing page. Same conversion skeleton as the home page,
 * with the copy, the quote form defaults, the gallery and the structured
 * data all narrowed to this city and this service.
 */
export default async function LandingPage({ params }: PageProps) {
  const { slug } = await params;
  const page = landingPages.find((p) => p.slug === slug);
  if (!page) notFound();

  const service = serviceById[page.service];
  const category = GALLERY_CATEGORY[page.service];
  const gallery = category ? beforeAfter.filter((i) => i.category === category) : beforeAfter;
  const otherServices = services.filter((s) => s.id !== service.id && s.featured);

  return (
    <>
      <JsonLd data={[serviceSchema(service, page.city), faqSchema(), landingBreadcrumb(page)]} />

      <Hero
        eyebrow={`${service.name} · ${page.city} והסביבה`}
        title={
          <>
            {page.h1}{' '}
            <span className="block text-aqua-300">בבית הלקוח, בציוד מקצועי.</span>
          </>
        }
        subtitle={`${page.description.split('. ').slice(0, 2).join('. ').replace(/\.$/, '')}.`}
        waContext={`(${page.h1})`}
        priceFrom={service.priceFrom}
      />
      <TrustStrip />

      <nav aria-label="פירורי לחם" className="mx-auto max-w-6xl px-4 pt-6 text-sm text-mist-500 sm:px-6">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href={href('/')} className="font-bold hover:text-brand-400">
              {business.name}
            </Link>
          </li>
          <li aria-hidden>‹</li>
          <li aria-current="page" className="font-bold text-mist-300">
            {page.h1}
          </li>
        </ol>
      </nav>

      <Section id="quote" className="pt-8 sm:pt-10 lg:pt-12">
        <SectionHeading
          eyebrow="הצעת מחיר מהירה"
          title={`כמה יעלה ${service.name.replace('ניקוי', 'לנקות')} ב${page.city}?`}
          lede={page.intro}
        />
        <Reveal delay={80}>
          <QuickQuote defaultService={service.id} defaultCity={page.city} />
        </Reveal>
      </Section>

      <Section id="before-after" tone="tint">
        <SectionHeading eyebrow="לפני ואחרי" title="התוצאות מדברות בעד עצמן" lede="גררו את הידית ותראו את ההבדל." />
        <BeforeAfterGallery items={gallery.length ? gallery : beforeAfter} />
      </Section>

      <Section id="prices">
        <SectionHeading
          eyebrow="מחירון"
          title={`מחירי ${service.name} ב${page.city}`}
          lede="מחירי פתיחה שקופים. המחיר הסופי נסגר מראש לפי תמונה."
        />
        <Pricing />
      </Section>

      <Section id="how" tone="tint">
        <SectionHeading eyebrow="התהליך" title="איך זה עובד?" />
        <HowItWorks />
      </Section>

      <Section id="why">
        <SectionHeading eyebrow="למה אנחנו" title={`למה לבחור ב${business.name} ב${page.city}?`} />
        <WhyUs />
      </Section>

      <Section id="services" tone="tint">
        <SectionHeading eyebrow="עוד שירותים" title={`מה עוד אנחנו מנקים ב${page.city}?`} />
        <ServicesGrid services={otherServices} />
      </Section>

      <Section id="reviews">
        <SectionHeading eyebrow="ביקורות" title="מה הלקוחות שלנו אומרים?" />
        <Reviews reviews={reviews} />
      </Section>

      {service.id === 'sofa' ? (
        <Section id="about" tone="tint">
          <SectionHeading eyebrow="מדריך מקצועי" title="ניקוי ספות מקצועי — מה חשוב לדעת?" align="start" />
          <Explainer />
        </Section>
      ) : null}

      <Section id="faq" tone={service.id === 'sofa' ? 'plain' : 'tint'}>
        <SectionHeading eyebrow="שאלות ותשובות" title="שאלות נפוצות" />
        <Faq />
      </Section>

      <Section id="areas">
        <SectionHeading eyebrow="אזורי שירות" title={`${page.city} והסביבה`} />
        <ServiceAreas currentSlug={page.slug} />
      </Section>

      <Section id="cta" tone="tint" className="pb-24">
        <FinalCta />
      </Section>
    </>
  );
}
