import { roi as copy } from '@/content/copy';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { RoiCalculator } from '@/components/sections/RoiCalculator';

export function Roi() {
  return (
    <section id="roi" aria-labelledby="roi-title" className="section bg-light text-navy">
      <div className="container-site">
        <Reveal>
          <SectionHeading id="roi-title" eyebrow={copy.eyebrow} title={copy.title} intro={copy.intro} tone="light" />
        </Reveal>
        <Reveal delay={80} className="mt-10">
          <RoiCalculator />
        </Reveal>
      </div>
    </section>
  );
}
