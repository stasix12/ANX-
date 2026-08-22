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
      {/*
        The catalog is the whole page, so its heading is the page's h1 rather
        than a section h2 — nothing above it holds that role any more.
      */}
      <Section
        id="products"
        titleAs="h1"
        title="המוצרים שלנו"
        description="ידיות שאיבה, צינורות ומתאמים למכונות Sabrina. משלוחים לכל הארץ, הזמנות בוואטסאפ."
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
