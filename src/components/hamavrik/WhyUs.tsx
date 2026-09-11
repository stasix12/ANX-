import { Reveal } from '@/components/hamavrik/Reveal';
import { ICONS } from '@/components/hamavrik/icons';
import { whyUs } from '@/lib/hamavrik/config';

export function WhyUs() {
  return (
    <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
      {whyUs.map((item, i) => {
        const Icon = ICONS[item.icon];
        return (
          <Reveal as="li" key={item.title} delay={(i % 3) * 90} className="h-full">
            <div className="surface surface-hover flex h-full gap-4 rounded-2xl p-4 sm:flex-col sm:p-5">
              <span className="grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-300/60 text-brand-400">
                <Icon className="h-6 w-6" />
              </span>
              <div>
                <h3 className="text-base font-black sm:mt-3 sm:text-lg">{item.title}</h3>
                <p className="mt-1 text-sm leading-relaxed text-mist-300">{item.desc}</p>
              </div>
            </div>
          </Reveal>
        );
      })}
    </ul>
  );
}
