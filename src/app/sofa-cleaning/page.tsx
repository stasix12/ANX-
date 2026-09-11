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
import { Reviews } from '@/components/hamavrik/Reviews';
import { Section, SectionHeading } from '@/components/hamavrik/Section';
import { ServiceAreas } from '@/components/hamavrik/ServiceAreas';
import { ServicesGrid } from '@/components/hamavrik/Services';
import { TrustStrip } from '@/components/hamavrik/TrustStrip';
import { WhyUs } from '@/components/hamavrik/WhyUs';
import { WorkGallery } from '@/components/hamavrik/WorkGallery';
import { HOME_JOBS, beforeAfterJobs, business, priceList, reviews, serviceAreas, services } from '@/lib/hamavrik/config';

/** `absolute` keeps the storefront's "| ANX3D" title template off this page. */
export const metadata: Metadata = {
  title: { absolute: `ניקוי ספות מקצועי בבית הלקוח | ${business.name}` },
};

/**
 * Home page, ordered for a Google Ads visitor on a phone: what/where/price
 * (hero) → trust → proof (before/after, reviews) → the quote flow → what
 * else we clean, prices, how it works, why us → the long-form SEO copy and
 * FAQ for the doubters and for Google → where we go → the closing ask.
 */
export default function HomePage() {
  const sofaFrom = priceList[0]?.from;
  return (
    <>
      <JsonLd data={[...allServicesSchema(), faqSchema(), breadcrumbSchema([{ name: business.name, path: '/' }]), ...(featuredVideoSchema() ? [featuredVideoSchema()!] : [])]} />

      <Hero />
      <TrustStrip />

      <Section id="before-after">
        <SectionHeading eyebrow="לפני ואחרי" title="התוצאות מדברות בעד עצמן" lede="צפו בסרטון, ואז גררו את הידית ותראו את ההבדל בעצמכם." />
        <FeaturedVideo />
        <BeforeAfterGallery jobs={beforeAfterJobs} limit={HOME_JOBS} galleryLink />
      </Section>

      <WorkGallery />

      <Section id="reviews" tone="tint">
        <SectionHeading eyebrow="ביקורות" title="מה הלקוחות שלנו אומרים?" />
        <Reviews reviews={reviews} />
      </Section>

      <Section id="quote">
        <SectionHeading
          eyebrow="הצעת מחיר מהירה"
          title="כמה יעלה לנקות את הספה שלכם?"
          lede="שלוש לחיצות — ואתם ב-WhatsApp עם כל הפרטים מוכנים. אפשר גם פשוט לשלוח תמונה."
        />
        <Reveal delay={60}>
          <QuickQuote />
        </Reveal>
      </Section>

      <Section id="services" tone="tint">
        <SectionHeading
          eyebrow="השירותים שלנו"
          title="מה אנחנו מנקים?"
          lede={sofaFrom ? `ניקוי ספות החל מ-${sofaFrom}₪ — וכל ריפוד אחר בבית וברכב, בבית הלקוח.` : undefined}
        />
        <ServicesGrid services={services.filter((s) => s.featured)} />
        <p className="mt-3 text-center text-sm text-mist-500">
          וגם: {services.filter((s) => !s.featured).map((s) => s.name.replace('ניקוי ', '')).join(', ')} — שלחו תמונה ונחזור עם מחיר.
        </p>
      </Section>

      <Section id="prices">
        <SectionHeading eyebrow="מחירון" title="מחירים שקופים, בלי הפתעות" lede="מחירי פתיחה לכל שירות. המחיר הסופי נסגר מראש לפי תמונה." />
        <Pricing />
      </Section>

      <Section id="how" tone="tint">
        <SectionHeading eyebrow="התהליך" title="איך זה עובד?" />
        <HowItWorks />
      </Section>

      <Section id="why">
        <SectionHeading eyebrow="למה אנחנו" title={`למה לבחור ב${business.name}?`} />
        <WhyUs />
      </Section>

      <Section id="about" tone="tint">
        <SectionHeading eyebrow="מדריך מקצועי" title="ניקוי ספות מקצועי — מה חשוב לדעת?" align="start" />
        <Explainer />
      </Section>

      <Section id="faq">
        <SectionHeading eyebrow="שאלות ותשובות" title="שאלות נפוצות" />
        <Faq />
      </Section>

      <Section id="areas" tone="tint">
        <SectionHeading eyebrow="אזורי שירות" title={`${serviceAreas.primary.join(', ')} ו${serviceAreas.regionLabel}`} />
        <ServiceAreas />
      </Section>

      <Section id="cta">
        <FinalCta />
      </Section>
    </>
  );
}
