import { whyUs } from '@/content/copy';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { FingerprintIcon, SmartphoneIcon, TargetIcon, TrendIcon } from '@/components/ui/icons';

const icons = [FingerprintIcon, SmartphoneIcon, TargetIcon, TrendIcon];

export function WhyUs() {
  return (
    <section id="why-us" aria-labelledby="why-title" className="section pt-0 lg:pt-0">
      <div className="container-site">
        <Reveal>
          <SectionHeading id="why-title" eyebrow={whyUs.eyebrow} title={whyUs.title} />
        </Reveal>
        <ul className="mt-10 grid grid-cols-2 gap-x-4 gap-y-8 lg:grid-cols-4 lg:gap-x-6">
          {whyUs.items.map((item, i) => {
            const Icon = icons[i];
            return (
              <Reveal as="li" key={item.title} delay={i * 60}>
                <div className="icon-tile bg-surface-1">
                  <Icon className="h-[22px] w-[22px]" />
                </div>
                <h3 className="mt-4 text-base font-semibold text-fg sm:text-lg">{item.title}</h3>
                <p className="mt-2 text-[13px] leading-relaxed text-muted sm:text-sm">{item.text}</p>
              </Reveal>
            );
          })}
        </ul>
        <Reveal delay={180}>
          <p className="mt-10 text-sm text-subtle">{whyUs.proofLine}</p>
        </Reveal>
      </div>
    </section>
  );
}
