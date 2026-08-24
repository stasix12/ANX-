import { CoursePromo } from '@/components/CoursePromo';
import { Faq, faqItems } from '@/components/Faq';
import { Hero } from '@/components/Hero';
import { ProductGrid } from '@/components/ProductGrid';
import { Section } from '@/components/Section';
import { TrustStrip } from '@/components/TrustStrip';
import { fetchPublishedProducts } from '@/lib/products';
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

export default async function HomePage() {
  const products = await fetchPublishedProducts();
  const course = products.find((p) => p.category === 'courses');

  return (
    <>
      <Hero />
      <TrustStrip />

      {/*
        The hero above carries the h1 now, so this heading steps down to an h2.
        It stays in the document rather than being deleted: the grid needs a
        heading of its own for search engines and screen readers, even though
        the page reads better without a second title on screen.
      */}
      <Section
        id="products"
        titleAs="h2"
        title="המוצרים שלנו"
        description="ידיות שאיבה, צינורות ומתאמים למכונות Sabrina. משלוחים לכל הארץ, הזמנות בוואטסאפ."
        headerHidden
      >
        <ProductGrid initialProducts={products} />
      </Section>

      {course ? <CoursePromo course={course} /> : null}

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
