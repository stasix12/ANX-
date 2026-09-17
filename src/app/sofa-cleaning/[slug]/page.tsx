import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { Faq, faqFor } from '@/components/hamavrik/Faq';
import { AirConditioners } from '@/components/hamavrik/AirConditioners';
import { BeforeAfterGallery } from '@/components/hamavrik/BeforeAfterGallery';
import { FeaturedVideo } from '@/components/hamavrik/FeaturedVideo';
import { GoogleReviews } from '@/components/hamavrik/GoogleReviews';
import { FinalCta } from '@/components/hamavrik/FinalCta';
import { Hero } from '@/components/hamavrik/Hero';
import { HowItWorks } from '@/components/hamavrik/HowItWorks';
import { JsonLd, faqSchema, landingBreadcrumb, serviceSchema, videoSchema } from '@/components/hamavrik/JsonLd';
import { Pricing } from '@/components/hamavrik/Pricing';
import { QuickQuote } from '@/components/hamavrik/QuickQuote';
import { Reveal } from '@/components/hamavrik/Reveal';
import { Section, SectionHeading } from '@/components/hamavrik/Section';
import { ServiceAreas } from '@/components/hamavrik/ServiceAreas';
import { ServicesGrid } from '@/components/hamavrik/Services';
import { TrustStrip } from '@/components/hamavrik/TrustStrip';
import { WhyUs } from '@/components/hamavrik/WhyUs';
import { business, landingPages, mainVideo, serviceById, services, beforeAfterJobs, HOME_JOBS, galleryCategoryOf, withPrefix } from '@/lib/hamavrik/config';
import { getGoogleReviews } from '@/lib/hamavrik/googleReviews';
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
      images: [{ url: absoluteUrl('/opengraph-image'), width: 1200, height: 630, alt: `${business.name} – ${page.h1}` }],
    },
    twitter: { card: 'summary_large_image', title: page.title, description: page.description },
  };
}

/**
 * City × service landing page – the page the ad actually lands on. Same
 * conversion skeleton as the home page, with the copy, the quote form
 * defaults, the FAQ and the structured data all narrowed to this city and
 * this service.
 *
 * The subtitle under the H1 used to be the meta description: four lines that
 * repeated the H1 and then repeated the price the pill had just shown. It is
 * now `heroSubtitle`, written for the page, and the paragraph that names the
 * Beer Sheva neighbourhoods – the only copy that makes this page anything
 * other than the home page – moved out of a "before and after" lede it had
 * nothing to do with and into a block of its own under the form.
 */
export default async function LandingPage({ params }: PageProps) {
  const realJobs = beforeAfterJobs.filter((job) => job.beforeImage && job.afterImage);
  const { slug } = await params;
  const page = landingPages.find((p) => p.slug === slug);
  if (!page) notFound();

  const service = serviceById[page.service];
  const pageJobs = realJobs.filter((job) => galleryCategoryOf[job.service] === galleryCategoryOf[service.id]);
  const googleReviews = await getGoogleReviews();
  const otherServices = services.filter((s) => s.id !== service.id && s.featured);
  const faqItems = faqFor(page.faqOverrides, page.faqExtra);
  /** The clip this page opens with: the page's own, or the main sofa clip on a sofa page. */
  const pageVideo = page.video ?? (service.id === 'sofa' ? mainVideo : null);

  /* The page's own guide – the copy that makes this page about THIS city
     and THIS service, in place of the explainer the home page has. Sofa
     pages open with the video and the gallery and read it further down;
     every other service opens with it. */
  const guideFirst = service.id !== 'sofa';
  /* Tints alternate down the page: a guide that follows a (plain) gallery is
     tinted and the price table after it is not; a guide straight under the
     breadcrumb is plain and the price table keeps its tint. */
  const guideTinted = guideFirst && (pageJobs.length > 0 || Boolean(page.video));
  const guide = page.guide ? (
    <Section id="guide" tone={guideTinted ? 'tint' : undefined} className={guideFirst && !guideTinted ? 'pt-8 sm:pt-10 lg:pt-12' : undefined}>
      <SectionHeading eyebrow={guideFirst ? 'המדריך המלא' : 'מדריך מקומי'} title={page.guide.title} lede={page.guide.lede} align="start" />
      <div className="grid gap-x-10 gap-y-6 lg:grid-cols-2">
        {page.guide.blocks.map((block, i) => (
          <Reveal as="article" key={block.title} delay={(i % 2) * 90} className="border-s-4 border-brand-300 ps-5">
            <h3 className="text-lg font-black sm:text-xl">{block.title}</h3>
            <p className="mt-1.5 text-[15px] leading-relaxed text-mist-300">{block.body}</p>
          </Reveal>
        ))}
      </div>
    </Section>
  ) : null;

  return (
    <>
      <JsonLd data={[serviceSchema(service, page.city, page.intro), faqSchema(faqItems), landingBreadcrumb(page), ...(pageVideo ? [videoSchema(pageVideo)] : [])]} />

      {/* The H1 is exactly the phrase people search for; the second line is
          styled the same but lives outside it. */}
      <Hero
        title={page.h1}
        kicker="עד הבית, מחיר לפי תמונה"
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
            lede={
              realJobs.length > 0
                ? 'סרטון ותמונות מעבודות אמיתיות שלנו – לא סטוק ולא הדמיה. גררו את הידית ותראו את ההבדל.'
                : 'סרטון מעבודה אמיתית שלנו – לא סטוק ולא הדמיה. מתחתיו כתוב בדיוק מה קורה שם.'
            }
          />
          <FeaturedVideo video={mainVideo} />
          {realJobs.length > 0 ? (
            <div className="mt-6 sm:mt-8">
              <BeforeAfterGallery jobs={realJobs} limit={HOME_JOBS} />
            </div>
          ) : null}
        </Section>
      ) : pageJobs.length > 0 || page.video ? (
        /* The shared video is of upholstery; a mattress, car or carpet page
           shows only its own real clip and its own before/after photos – and
           nothing at all until it has some. */
        <Section id="before-after" className="pt-8 sm:pt-10 lg:pt-12">
          <SectionHeading
            eyebrow="מהשטח"
            title="ככה זה נראה מקרוב"
            lede={
              page.video && pageJobs.length > 0
                ? 'סרטון ותמונות מעבודות אמיתיות שלנו – לא סטוק ולא הדמיה. גררו את הידית ותראו את ההבדל.'
                : page.video
                  ? 'סרטון מעבודה אמיתית שלנו – לא סטוק ולא הדמיה. ככה זה נראה כשמנקים אצלכם.'
                  : 'תמונות מעבודות אמיתיות שלנו – לא סטוק ולא הדמיה. גררו את הידית ותראו את ההבדל.'
            }
          />
          {page.video ? <FeaturedVideo video={page.video} /> : null}
          {pageJobs.length > 0 ? (
            <div className={page.video ? 'mt-6 sm:mt-8' : undefined}>
              <BeforeAfterGallery jobs={pageJobs} limit={HOME_JOBS} />
            </div>
          ) : null}
        </Section>
      ) : null}

      {/* On a mattress, car or carpet page the guide is the first thing after
          the hero: those pages have no video and little or no gallery, so
          without it the visitor lands on a price table and nothing else. */}
      {guideFirst ? guide : null}

      <GoogleReviews data={googleReviews} />

      <Section id="prices" tone={guideTinted ? undefined : 'tint'}>
        <SectionHeading eyebrow="מחירון" title={`מחירי ${service.name} ב${page.city}`} lede="מחירי פתיחה שקופים. המחיר הסופי נסגר מראש לפי תמונה." />
        <Pricing />
      </Section>

      <Section id="quote">
        <SectionHeading
          eyebrow="הצעת מחיר מהירה"
          title={`קבלו הצעת מחיר ל${service.waNoun.replace('ניקוי ', '')} שלכם ב${page.city}`}
          titleId="quote-title"
          lede="מסמנים מה לנקות, שולחים ב‑WhatsApp – ומקבלים הצעת מחיר."
        />
        <Reveal delay={60}>
          <QuickQuote defaultService={service.id} defaultCity={page.city} />
        </Reveal>
      </Section>

      <Section id="services" tone="tint">
        <SectionHeading
          eyebrow="עוד שירותים"
          title={`מה עוד אנחנו מנקים ב${page.city}?`}
          lede={`ניקוי ריפודים ב${page.city} באותו ביקור: ${otherServices.map((s) => s.name.replace('ניקוי ', '')).join(', ')}.`}
        />
        <ServicesGrid services={otherServices} />
      </Section>

      <Section id="how">
        <SectionHeading eyebrow="התהליך" title="איך זה עובד?" />
        <HowItWorks />
      </Section>

      <Section id="why" tone="tint">
        <SectionHeading eyebrow="למה אנחנו" title={`למה לבחור ${withPrefix('ב', business.name)} ב${page.city}?`} />
        <WhyUs />
      </Section>

      {guideFirst ? null : guide}

      <Section id="faq" tone="tint">
        <SectionHeading eyebrow="שאלות ותשובות" title="שאלות נפוצות" />
        <Faq items={faqItems} />
      </Section>

      <Section id="areas">
        <SectionHeading eyebrow="אזורי שירות" title={`${page.city} והסביבה`} />
        <ServiceAreas currentSlug={page.slug} />
      </Section>

      <Section id="air-conditioners" tone="dark">
        <AirConditioners />
      </Section>

      <Section id="cta" tone="tint">
        <FinalCta noun={service.id === 'sofa' ? 'הספה' : service.id === 'mattress' ? 'המזרן' : service.id === 'car' ? 'הרכב' : service.id === 'carpet' ? 'השטיח' : 'הריפוד'} />
      </Section>
    </>
  );
}
