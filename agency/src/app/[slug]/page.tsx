import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { site } from '@/config/site';
import { cities, cityPagePath, serviceLabels, validateCityPages, type CityPage } from '@/content/cities';
import { breadcrumbs } from '@/lib/schema';
import { JsonLd } from '@/components/ui/JsonLd';
import { Contact } from '@/components/sections/Contact';
import { FaqAccordion } from '@/components/sections/FaqAccordion';

/**
 * Dormant local-SEO route: /website-building-beer-sheva, /google-ads-arad …
 *
 * Builds one static page per entry in content/cities.ts `cityPages`. The
 * registry is empty today, so this generates nothing — no thin pages, nothing
 * in the sitemap — until real city-specific copy is added there.
 */
export const dynamicParams = false;

function findPage(slug: string): CityPage | undefined {
  return validateCityPages().find((p) => cityPagePath(p) === `/${slug}`);
}

export function generateStaticParams(): { slug: string }[] {
  return validateCityPages().map((p) => ({ slug: cityPagePath(p).slice(1) }));
}

export async function generateMetadata({ params }: { params: Promise<{ slug: string }> }): Promise<Metadata> {
  const { slug } = await params;
  const page = findPage(slug);
  if (!page) return {};
  const city = cities.find((c) => c.slug === page.city)!;
  const service = serviceLabels[page.service];
  return {
    title: `${service.title} ${city.nameIn}`,
    description: page.intro.slice(0, 150),
    alternates: { canonical: `/${slug}` },
  };
}

export default async function CityServicePage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const page = findPage(slug);
  if (!page) notFound();
  const city = cities.find((c) => c.slug === page.city)!;
  const service = serviceLabels[page.service];
  const title = `${service.title} ${city.nameIn}`;
  const nearby = (city.nearby ?? [])
    .map((s) => validateCityPages().find((p) => p.city === s && p.service === page.service))
    .filter((p): p is CityPage => Boolean(p));

  return (
    <>
      <JsonLd
        data={{
          '@context': 'https://schema.org',
          '@graph': [
            breadcrumbs([
              { name: 'דף הבית', path: '/' },
              { name: title, path: `/${slug}` },
            ]),
            {
              '@type': 'Service',
              name: title,
              serviceType: service.title,
              provider: { '@id': `${site.url}/#business` },
              areaServed: { '@type': 'City', name: city.name },
              url: `${site.url}/${slug}`,
            },
            {
              '@type': 'FAQPage',
              mainEntity: page.faq.map((f) => ({
                '@type': 'Question',
                name: f.q,
                acceptedAnswer: { '@type': 'Answer', text: f.a },
              })),
            },
          ],
        }}
      />
      <section className="section">
        <div className="container-narrow">
          <nav aria-label="פירורי לחם" className="text-sm text-subtle">
            <ol className="flex items-center gap-2">
              <li>
                <Link href="/" className="hover:text-fg">
                  דף הבית
                </Link>
              </li>
              <li aria-hidden>‹</li>
              <li aria-current="page" className="text-muted">
                {title}
              </li>
            </ol>
          </nav>
          <h1 className="h1 mt-6 text-fg">{title}</h1>
          <p className="lead mt-6 text-muted">{page.intro}</p>
          <h2 className="h3 mt-10 text-fg">
            {service.verb} {city.nameIn} — מה חשוב לדעת
          </h2>
          <ul className="check-list mt-4 text-muted">
            {page.localPoints.map((p) => (
              <li key={p}>• {p}</li>
            ))}
          </ul>
          <h2 className="h3 mt-10 text-fg">שאלות נפוצות</h2>
          <div className="mt-4">
            <FaqAccordion items={page.faq.map((f, i) => ({ id: `${slug}-${i}`, q: f.q, a: f.a }))} />
          </div>
          {nearby.length > 0 ? (
            <>
              <h2 className="h3 mt-10 text-fg">ערים נוספות</h2>
              <ul className="mt-3 flex flex-wrap gap-2">
                {nearby.map((p) => {
                  const c = cities.find((x) => x.slug === p.city)!;
                  return (
                    <li key={p.city}>
                      <a href={cityPagePath(p)} className="chip hover:text-fg">
                        {service.verb} {c.nameIn}
                      </a>
                    </li>
                  );
                })}
              </ul>
            </>
          ) : null}
        </div>
      </section>
      <Contact />
    </>
  );
}
