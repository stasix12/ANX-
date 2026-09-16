import type { Metadata } from 'next';
import { BeforeAfterGallery } from '@/components/hamavrik/BeforeAfterGallery';
import { Explainer } from '@/components/hamavrik/Explainer';
import { Faq } from '@/components/hamavrik/Faq';
import { FeaturedVideo } from '@/components/hamavrik/FeaturedVideo';
import { FinalCta } from '@/components/hamavrik/FinalCta';
import { Hero } from '@/components/hamavrik/Hero';
import { HowItWorks } from '@/components/hamavrik/HowItWorks';
import { JsonLd, allServicesSchema, breadcrumbSchema, faqSchema, featuredVideoSchema } from '@/components/hamavrik/JsonLd';
import { Pricing } from '@/components/hamavrik/Pricing';
import { QuickQuote } from '@/components/hamavrik/QuickQuote';
import { Reveal } from '@/components/hamavrik/Reveal';
import { Section, SectionHeading } from '@/components/hamavrik/Section';
import { ServiceAreas } from '@/components/hamavrik/ServiceAreas';
import { ServicesGrid } from '@/components/hamavrik/Services';
import { TrustStrip } from '@/components/hamavrik/TrustStrip';
import { WhyUs } from '@/components/hamavrik/WhyUs';
import { WorkGallery } from '@/components/hamavrik/WorkGallery';
import { business, featuredVideo, priceList, priceText, processVideo, serviceAreas, services, beforeAfterJobs, HOME_JOBS } from '@/lib/hamavrik/config';

/**
 * `absolute` keeps the storefront's "| ANX3D" title template off this page.
 * The city is in the title because the H1 has always had it and the ad always
 * carries it – without it the home page competed with /beer-sheva for the one
 * query that matters and neither of them won it.
 */
export const metadata: Metadata = {
  title: { absolute: `ניקוי ספות בבאר שבע – עד הבית, החל מ-299 ₪ | ${business.name}` },
};

/**
 * Home page, ordered for a Google Ads visitor on a phone:
 *   what / where / how much (hero) → why us in one line (trust strip) →
 *   PROOF (the one real clip) → PRICE (the list) → ACTION (the form) →
 *   everything else we clean → how it works → what makes us different →
 *   the long copy and the FAQ for the doubters and for Google → where we go →
 *   the closing ask.
 *
 * Two things used to sit between the proof and the form and no longer do:
 * three illustrated "before/after" cards (2.4 phone screens of drawings under
 * a heading that said "the results speak for themselves"), and an empty
 * reviews box that asked "what do our customers say?" and answered with a
 * link to Google. Both moved the form to screen four and cost trust on the
 * way. The illustrations still live in /gallery; the reviews section comes
 * back by itself the day a real review lands in config.ts.
 */
export default function HomePage() {
  const sofaFrom = priceList[0]?.from;
  const realJobs = beforeAfterJobs.filter((job) => job.beforeImage && job.afterImage);
  return (
    <>
      <JsonLd data={[...allServicesSchema(), faqSchema(), breadcrumbSchema([{ name: business.name, path: '/' }]), ...(featuredVideoSchema() ? [featuredVideoSchema()!] : [])]} />

      <Hero />
      <TrustStrip />

      <Section id="before-after">
        <SectionHeading
          eyebrow="מהשטח"
          title="ככה זה נראה מקרוב"
          lede={
            realJobs.length > 0
              ? 'סרטון ותמונות מעבודות אמיתיות שלנו – לא סטוק ולא הדמיה. גררו את הידית ותראו את ההבדל.'
              : 'סרטון מעבודה אמיתית שלנו – לא סטוק ולא הדמיה. מתחתיו כתוב בדיוק מה קורה שם.'
          }
        />
        <FeaturedVideo video={processVideo ?? featuredVideo} />
        {/* Only jobs with real photos. Illustrated placeholders stay in /gallery;
            the first real pair in config.ts brings this block back by itself. */}
        {realJobs.length > 0 ? (
          <div className="mt-6 sm:mt-8">
            <BeforeAfterGallery jobs={realJobs} limit={HOME_JOBS} />
          </div>
        ) : null}
      </Section>

      <WorkGallery />

      <Section id="prices" tone="tint">
        <SectionHeading eyebrow="מחירון" title="מחירים שקופים, בלי הפתעות" lede="מחירי פתיחה לכל שירות. המחיר הסופי נסגר מראש לפי תמונה." />
        <Pricing />
      </Section>

      <Section id="quote">
        <SectionHeading
          eyebrow="הצעת מחיר מהירה"
          title="קבלו הצעת מחיר לספה שלכם"
          titleId="quote-title"
          lede="מסמנים מה לנקות, שולחים ב-WhatsApp – ומקבלים הצעת מחיר."
        />
        <Reveal delay={60}>
          <QuickQuote />
        </Reveal>
      </Section>

      <Section id="services" tone="tint">
        <SectionHeading
          eyebrow="השירותים שלנו"
          title="מה אנחנו מנקים?"
          lede={sofaFrom ? <>ספות החל מ-<bdi dir="rtl">{priceText(sofaFrom)}</bdi> – וכל ריפוד אחר בבית או ברכב. תמיד אצלכם, בלי להוביל.</> : undefined}
        />
        <ServicesGrid services={services.filter((s) => s.featured)} />
        <p className="mt-3 text-center text-sm text-mist-500">
          וגם: {services.filter((s) => !s.featured).map((s) => s.name.replace('ניקוי ', '')).join(', ')} – שלחו תמונה ונחזור עם מחיר.
        </p>
      </Section>

      <Section id="how">
        <SectionHeading eyebrow="התהליך" title="איך זה עובד?" />
        <HowItWorks />
      </Section>

      <Section id="why" tone="tint">
        <SectionHeading eyebrow="למה אנחנו" title={`למה לבחור ב${business.name}?`} />
        <WhyUs />
      </Section>

      <Section id="about">
        <SectionHeading eyebrow="מדריך מקצועי" title="ניקוי ספות מקצועי – מה חשוב לדעת?" align="start" />
        <Explainer />
      </Section>

      <Section id="faq" tone="tint">
        <SectionHeading eyebrow="שאלות ותשובות" title="שאלות נפוצות" />
        <Faq />
      </Section>

      <Section id="areas">
        <SectionHeading eyebrow="אזורי שירות" title={`${serviceAreas.primary.join(', ')} ו${serviceAreas.regionLabel}`} />
        <ServiceAreas />
      </Section>

      <Section id="cta" tone="tint">
        <FinalCta />
      </Section>
    </>
  );
}
