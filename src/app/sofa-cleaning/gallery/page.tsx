import type { Metadata } from 'next';
import Link from 'next/link';
import { BeforeAfterGallery } from '@/components/hamavrik/BeforeAfterGallery';
import { FeaturedVideo } from '@/components/hamavrik/FeaturedVideo';
import { FinalCta } from '@/components/hamavrik/FinalCta';
import { JsonLd, breadcrumbSchema } from '@/components/hamavrik/JsonLd';
import { Section, SectionHeading } from '@/components/hamavrik/Section';
import { WorkGallery } from '@/components/hamavrik/WorkGallery';
import { beforeAfterJobs, business, featuredVideo, mainVideo } from '@/lib/hamavrik/config';
import { absoluteUrl, href } from '@/lib/hamavrik/links';

export const metadata: Metadata = {
  title: 'לפני ואחרי – עבודות ניקוי ספות ומזרנים בבאר שבע',
  description: `תמונות אמיתיות מעבודות של ${business.name}: ספה פינתית, ספת בד ומזרן לפני ואחרי ניקוי בבאר שבע, וסרטון מהעבודה. לא סטוק ולא הדמיה.`,
  alternates: { canonical: absoluteUrl('/gallery') },
  /* The og:url used to point at the home page, so every share of this page
     announced a different one. */
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: business.name,
    url: absoluteUrl('/gallery'),
    title: `לפני ואחרי – ${business.name}`,
    images: [{ url: absoluteUrl('/opengraph-image'), width: 1200, height: 630, alt: `${business.name} – לפני ואחרי` }],
  },
  twitter: { card: 'summary_large_image', title: `לפני ואחרי – ${business.name}` },
};

/**
 * Real jobs only – the illustrated placeholders in config.ts stay out of
 * this page too. A page titled "our work" that is mostly drawings is thin
 * for Google and confusing for a customer.
 */
export default function GalleryPage() {
  const realJobs = beforeAfterJobs.filter((job) => job.beforeImage && job.afterImage);
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: business.name, path: '/' }, { name: 'לפני ואחרי', path: '/gallery' }])} />
      <nav aria-label="פירורי לחם" className="mx-auto max-w-6xl px-4 pt-5 text-sm text-mist-500 sm:px-6">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href={href('/')} prefetch={false} className="font-bold hover:text-brand-400">
              {business.name}
            </Link>
          </li>
          <li aria-hidden>‹</li>
          <li aria-current="page" className="font-bold text-mist-300">
            לפני ואחרי
          </li>
        </ol>
      </nav>
      <Section id="before-after" className="pt-6 sm:pt-8">
        <SectionHeading
          as="h1"
          eyebrow="מהשטח"
          title="לפני ואחרי – עבודות אמיתיות שלנו"
          lede="סרטון ותמונות מעבודות שביצענו – לא סטוק ולא הדמיה. גררו את הידית בכל תמונה ותראו את ההבדל."
        />
        <FeaturedVideo video={mainVideo} />
        {featuredVideo && featuredVideo !== mainVideo ? <FeaturedVideo video={featuredVideo} /> : null}
        {realJobs.length > 0 ? <BeforeAfterGallery jobs={realJobs} tabs /> : null}
      </Section>
      <WorkGallery />
      <Section id="cta" tone="tint">
        <FinalCta />
      </Section>
    </>
  );
}
