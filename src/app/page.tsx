import { DemoVideo } from '@/components/DemoVideo';
import { ProductGrid } from '@/components/ProductGrid';
import { Section } from '@/components/Section';
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

export default function HomePage() {
  return (
    <>
      <DemoVideo />

      {/*
        The banner above replaces the heading block on screen, but the h1 and
        the description stay in the document — they are the page's only
        descriptive copy, and dropping them outright would leave it with no
        heading at all for search engines and screen readers.
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

      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{ __html: JSON.stringify(businessJsonLd) }}
      />
    </>
  );
}
