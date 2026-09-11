import { Reveal } from '@/components/hamavrik/Reveal';
import { ICONS } from '@/components/hamavrik/icons';
import { whyUs } from '@/lib/hamavrik/config';

export function WhyUs() {
  return (
    <ul className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
      {whyUs.map((item, i) => {
        const Icon = ICONS[item.icon];
        return (
          <Reveal as="li" key={item.title} delay={(i % 3) * 90} className="h-full">
            <div className="surface surface-hover h-full rounded-[1.5rem] p-6">
              <span className="grid h-12 w-12 place-items-center rounded-2xl bg-brand-300/60 text-brand-400">
                <Icon className="h-6 w-6" />
              </span>
              <h3 className="mt-4 text-lg font-black">{item.title}</h3>
              <p className="mt-1.5 text-[15px] leading-relaxed text-mist-300">{item.desc}</p>
            </div>
          </Reveal>
        );
      })}
    </ul>
  );
}
