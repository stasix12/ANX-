import type { Metadata } from 'next';
import { site } from '@/config/site';
import { homeOpenGraph, homeTwitter } from '@/lib/metadata';
import { homeGraph } from '@/lib/schema';
import { JsonLd } from '@/components/ui/JsonLd';
import { BeforeAfter } from '@/components/sections/BeforeAfter';
import { Contact } from '@/components/sections/Contact';
import { Faq } from '@/components/sections/Faq';
import { FinalCta } from '@/components/sections/FinalCta';
import { Hero } from '@/components/sections/Hero';
import { Portfolio } from '@/components/sections/Portfolio';
import { Pricing } from '@/components/sections/Pricing';
import { Problem } from '@/components/sections/Problem';
import { Process } from '@/components/sections/Process';
import { Reviews } from '@/components/sections/Reviews';
import { Roi } from '@/components/sections/Roi';
import { Services } from '@/components/sections/Services';
import { WhyUs } from '@/components/sections/WhyUs';

export const metadata: Metadata = {
  alternates: { canonical: `${site.url}/` },
  openGraph: homeOpenGraph,
  twitter: homeTwitter,
};

/**
 * Section order (CRO): pain → two answers → process → visual proof →
 * differentiation → work → value in ₪ → price → social proof → objections →
 * form → last push.
 */
export default function HomePage() {
  return (
    <>
      <JsonLd data={homeGraph()} />
      <Hero />
      <Problem />
      <Services />
      <Process />
      <BeforeAfter />
      <WhyUs />
      <Portfolio />
      <Roi />
      <Pricing />
      <Reviews />
      <Faq />
      <Contact />
      <FinalCta />
    </>
  );
}
