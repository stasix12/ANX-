import type { Metadata } from 'next';
import Link from 'next/link';
import { BeforeAfterGallery } from '@/components/hamavrik/BeforeAfterGallery';
import { FeaturedVideo } from '@/components/hamavrik/FeaturedVideo';
import { FinalCta } from '@/components/hamavrik/FinalCta';
import { JsonLd, breadcrumbSchema } from '@/components/hamavrik/JsonLd';
import { Section, SectionHeading } from '@/components/hamavrik/Section';
import { WorkGallery } from '@/components/hamavrik/WorkGallery';
import { beforeAfterJobs, business } from '@/lib/hamavrik/config';
import { absoluteUrl, href } from '@/lib/hamavrik/links';

export const metadata: Metadata = {
  title: 'גלריית עבודות — לפני ואחרי',
  description: `עבודות ניקוי ספות, מזרנים, כיסאות, רכב ושטיחים של ${business.name}: לפני ואחרי, לפי סוג ועיר.`,
  alternates: { canonical: absoluteUrl('/gallery') },
};

/** Every before/after job with category tabs, plus the plain job photos. */
export default function GalleryPage() {
  return (
    <>
      <JsonLd data={breadcrumbSchema([{ name: business.name, path: '/' }, { name: 'גלריית עבודות', path: '/gallery' }])} />
      <nav aria-label="פירורי לחם" className="mx-auto max-w-6xl px-4 pt-5 text-sm text-mist-500 sm:px-6">
        <ol className="flex flex-wrap items-center gap-2">
          <li>
            <Link href={href('/')} className="font-bold hover:text-brand-400">
              {business.name}
            </Link>
          </li>
          <li aria-hidden>‹</li>
          <li aria-current="page" className="font-bold text-mist-300">
            גלריית עבודות
          </li>
        </ol>
      </nav>
      <Section id="before-after" className="pt-6 sm:pt-8">
        <SectionHeading as="h1" eyebrow="לפני ואחרי" title="גלריית העבודות שלנו" lede="גררו את הידית בכל עבודה ותראו את ההבדל." />
        <FeaturedVideo />
        <BeforeAfterGallery jobs={beforeAfterJobs} tabs />
      </Section>
      <WorkGallery />
      <Section id="cta" tone="tint">
        <FinalCta />
      </Section>
    </>
  );
}
