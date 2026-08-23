import { Faq, faqItems } from '@/components/Faq';
import { MachineStrip } from '@/components/MachineStrip';
import { ProductGrid } from '@/components/ProductGrid';
import { Section } from '@/components/Section';
import { TrustStrip } from '@/components/TrustStrip';
import { products } from '@/lib/products';
import { site } from '@/lib/site';

const businessJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'Store',
  name: site.name,
  description: site.description,
  url: site.url,
  telephone: `+${site.whatsappNumber}`,
  areaServed: 'IL',
};

/** FAQ rich result — lets the answers surface directly in search. */
const faqJsonLd = {
  '@context': 'https://schema.org',
  '@type': 'FAQPage',
  mainEntity: faqItems.map((item) => ({
    '@type': 'Question',
    name: item.question,
    acceptedAnswer: { '@type': 'Answer', text: item.answer },
  })),
};

export default function HomePage() {
  return (
    <>
      <MachineStrip />
      <TrustStrip />

      {/*
        The strip above opens the page, but the h1 and the description stay in
        the document — they are the page's only descriptive copy, and dropping
        them outright would leave it with no heading at all for search engines
        and screen readers.
      */}
      <Section
        id="products"
        titleAs="h1"
        title="המוצרים שלנו"
        description="ידיות שאיבה, צינורות ומתאמים למכונות Sabrina. משלוחים לכל הארץ, הזמנות בוואטסאפ."
        headerHidden
      >
        <ProductGrid products={products} />
      </Section>

      <Faq />

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(businessJsonLd) }}
      />
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(faqJsonLd) }}
      />
    </>
  );
}
