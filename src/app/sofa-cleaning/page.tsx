import { BeforeAfterGallery } from '@/components/hamavrik/BeforeAfterGallery';
import { Explainer } from '@/components/hamavrik/Explainer';
import { Faq } from '@/components/hamavrik/Faq';
import { FinalCta } from '@/components/hamavrik/FinalCta';
import { Hero } from '@/components/hamavrik/Hero';
import { HowItWorks } from '@/components/hamavrik/HowItWorks';
import { JsonLd, allServicesSchema, breadcrumbSchema, faqSchema } from '@/components/hamavrik/JsonLd';
import { Pricing } from '@/components/hamavrik/Pricing';
import { QuickQuote } from '@/components/hamavrik/QuickQuote';
import { Reveal } from '@/components/hamavrik/Reveal';
import { Reviews } from '@/components/hamavrik/Reviews';
import { Section, SectionHeading } from '@/components/hamavrik/Section';
import { ServiceAreas } from '@/components/hamavrik/ServiceAreas';
import { ServicesGrid } from '@/components/hamavrik/Services';
import { TrustStrip } from '@/components/hamavrik/TrustStrip';
import { WhyUs } from '@/components/hamavrik/WhyUs';
import { beforeAfter, business, reviews, serviceAreas, services } from '@/lib/hamavrik/config';
import type { Metadata } from 'next';

/** `absolute` keeps the storefront's "| ANX3D" title template off this page. */
export const metadata: Metadata = {
  title: { absolute: `ניקוי ספות מקצועי בבית הלקוח | ${business.name}` },
};

/**
 * Home page. The order is the sales argument: what changes (hero) → how
 * much and how to order (quote) → proof (before/after) → what we clean →
 * prices → process → why us → reviews → depth for the doubters and for
 * Google (explainer, FAQ) → where → the closing ask.
 */
export default function HomePage() {
  return (
    <>
      <JsonLd data={[...allServicesSchema(), faqSchema(), breadcrumbSchema([{ name: business.name, path: '/' }])]} />

      <Hero />
      <TrustStrip />

      <Section id="quote" tone="tint">
        <SectionHeading
          eyebrow="הצעת מחיר מהירה"
          title="כמה יעלה לנקות את הספה שלכם?"
          lede="בוחרים מה לנקות, משאירים פרטים — ונחזור אליכם עם מחיר ב-WhatsApp. אפשר גם פשוט לשלוח תמונה."
        />
        <Reveal delay={80}>
          <QuickQuote />
        </Reveal>
      </Section>

      <Section id="before-after">
        <SectionHeading
          eyebrow="לפני ואחרי"
          title="התוצאות מדברות בעד עצמן"
          lede="גררו את הידית ותראו את ההבדל בעצמכם — ספות, מזרנים, כיסאות, רכב ושטיחים."
        />
        <BeforeAfterGallery items={beforeAfter} />
      </Section>

      <Section id="services" tone="tint">
        <SectionHeading
          eyebrow="השירותים שלנו"
          title="מה אנחנו מנקים?"
          lede="כל ריפוד בבית (וברכב) — בציוד מקצועי, בבית הלקוח, עם הצעת מחיר ברורה מראש."
        />
        <ServicesGrid services={services} />
      </Section>

      <Section id="prices">
        <SectionHeading
          eyebrow="מחירון"
          title="מחירים שקופים, בלי הפתעות"
          lede="מחירי פתיחה לכל שירות. המחיר הסופי נסגר מראש לפי תמונה — לפני שהגענו."
        />
        <Pricing />
      </Section>

      <Section id="how" tone="tint">
        <SectionHeading
          eyebrow="התהליך"
          title="איך זה עובד?"
          lede="מתמונה ב-WhatsApp ועד ספה נקייה — בחמישה שלבים פשוטים."
        />
        <HowItWorks />
      </Section>

      <Section id="why">
        <SectionHeading
          eyebrow="למה אנחנו"
          title={`למה לבחור ב${business.name}?`}
          lede="כי ניקוי ספות הוא מקצוע — וההבדל בין ניקוי חיצוני לניקוי עמוק נראה, מורגש ומריח."
        />
        <WhyUs />
      </Section>

      <Section id="reviews" tone="tint">
        <SectionHeading
          eyebrow="ביקורות"
          title="מה הלקוחות שלנו אומרים?"
          lede="הביקורות מגיעות מלקוחות אמיתיים ב-Google."
        />
        <Reviews reviews={reviews} />
      </Section>

      <Section id="about">
        <SectionHeading
          eyebrow="מדריך מקצועי"
          title="ניקוי ספות מקצועי — מה חשוב לדעת?"
          lede="שאלות שלקוחות שואלים אותנו לפני שהם מזמינים, ותשובות ישרות בלי שיווק."
          align="start"
        />
        <Explainer />
      </Section>

      <Section id="faq" tone="tint">
        <SectionHeading eyebrow="שאלות ותשובות" title="שאלות נפוצות" />
        <Faq />
      </Section>

      <Section id="areas">
        <SectionHeading
          eyebrow="אזורי שירות"
          title={`${serviceAreas.primary.join(', ')} ו${serviceAreas.regionLabel}`}
          lede="מגיעים אליכם עם כל הציוד. לא בטוחים שאנחנו מגיעים ליישוב שלכם? שאלו אותנו."
        />
        <ServiceAreas />
      </Section>

      <Section id="cta" tone="tint" className="pb-24">
        <FinalCta />
      </Section>
    </>
  );
}
