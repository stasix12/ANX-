import { Contact } from '@/components/Contact';
import { Faq, faqItems } from '@/components/Faq';
import { Hero } from '@/components/Hero';
import { ProductGrid } from '@/components/ProductGrid';
import { Section } from '@/components/Section';
import { WhyUs } from '@/components/WhyUs';
import { products } from '@/lib/products';
import { site } from '@/lib/site';

/** FAQ rich result — lets search engines surface the answers directly. */
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
};

const businessJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Store',
  name: site.name,
  description: site.description,
  url: site.url,
  telephone: `+${site.whatsappNumber}`,
  areaServed: 'IL',
};

export default function HomePage() {
  return (
    <>
      <Hero />

      <Section
        id="products"
        eyebrow="קטלוג"
        title="המוצרים שלנו"
        description="ידיות שאיבה, צינורות ומתאמים — כולם מותאמים למכונות Sabrina. בחרו קטגוריה או עברו על הכל."
      >
        <ProductGrid products={products} />
      </Section>

      <WhyUs />
      <Faq />
      <Contact />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(businessJsonLd) }}
      />
    </>
  );
}
