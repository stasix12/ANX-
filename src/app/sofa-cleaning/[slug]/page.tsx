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
  beforeAfterJobs,
  business,
  galleryCategoryOf,
  landingPages,
  reviews,
  serviceById,
  services,
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
  const category = galleryCategoryOf[page.service];
  const gallery = beforeAfterJobs.filter((j) => galleryCategoryOf[j.service] === category);
  const otherServices = services.filter((s) => s.id !== service.id && s.featured);

  return (
    <>
      <JsonLd data={[serviceSchema(service, page.city), faqSchema(), landingBreadcrumb(page)]} />

      <Hero
        title={
          <>
            {page.h1}{' '}
            <span className="block text-aqua-300">עד הבית, בציוד מקצועי</span>
          </>
        }
        subtitle={`${page.description.split('. ').slice(0, 2).join('. ').replace(/\.$/, '')}.`}
        waContext={`(${page.h1})`}
        priceFrom={service.priceFrom}
        priceLabel={service.name}
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

      <Section id="before-after" className="pt-8 sm:pt-10 lg:pt-12">
        <SectionHeading eyebrow="לפני ואחרי" title="התוצאות מדברות בעד עצמן" lede={page.intro} />
        <BeforeAfterGallery jobs={gallery.length ? gallery : beforeAfterJobs} limit={3} galleryLink />
      </Section>

      <Section id="reviews" tone="tint">
        <SectionHeading eyebrow="ביקורות" title="מה הלקוחות שלנו אומרים?" />
        <Reviews reviews={reviews} />
      </Section>

      <Section id="quote">
        <SectionHeading
          eyebrow="הצעת מחיר מהירה"
          title={`כמה יעלה ${service.name.replace('ניקוי', 'לנקות')} ב${page.city}?`}
          lede="שלוש לחיצות — ואתם ב-WhatsApp עם כל הפרטים מוכנים."
        />
        <Reveal delay={60}>
          <QuickQuote defaultService={service.id} defaultCity={page.city} />
        </Reveal>
      </Section>

      <Section id="services" tone="tint">
        <SectionHeading eyebrow="עוד שירותים" title={`מה עוד אנחנו מנקים ב${page.city}?`} />
        <ServicesGrid services={otherServices} />
      </Section>

      <Section id="prices">
        <SectionHeading eyebrow="מחירון" title={`מחירי ${service.name} ב${page.city}`} lede="מחירי פתיחה שקופים. המחיר הסופי נסגר מראש לפי תמונה." />
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

      <Section id="areas" tone={service.id === 'sofa' ? 'tint' : 'plain'}>
        <SectionHeading eyebrow="אזורי שירות" title={`${page.city} והסביבה`} />
        <ServiceAreas currentSlug={page.slug} />
      </Section>

      <Section id="cta">
        <FinalCta />
      </Section>
    </>
  );
}
