import { Reveal } from '@/components/hamavrik/Reveal';
import { ICONS } from '@/components/hamavrik/icons';
import { whyUs } from '@/lib/hamavrik/config';

export function WhyUs() {
  return (
    <ul className="grid grid-cols-2 gap-2.5 sm:gap-3 lg:grid-cols-4">
      {whyUs.map((item, i) => {
        const Icon = ICONS[item.icon];
        return (
          <Reveal as="li" key={item.title} delay={(i % 3) * 90} className="h-full">
            <div className="surface surface-hover flex h-full flex-col gap-2.5 rounded-2xl p-3.5 sm:p-5">
              <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-brand-300/60 text-brand-400">
                <Icon className="h-6 w-6" />
              </span>
              <div>
                <h3 className="text-[15px] font-black leading-tight sm:text-lg">{item.title}</h3>
                <p className="mt-1 text-[13px] leading-snug text-mist-300 sm:text-sm">{item.desc}</p>
              </div>
            </div>
          </Reveal>
        );
      })}
    </ul>
  );
}
