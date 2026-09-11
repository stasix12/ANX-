import { Reveal } from '@/components/hamavrik/Reveal';
import { ICONS } from '@/components/hamavrik/icons';
import { steps } from '@/lib/hamavrik/config';

/** Four steps, an icon and one line each. A 2×2 grid on phones, a row on desktop. */
export function HowItWorks() {
  return (
    <ol className="relative grid grid-cols-2 gap-x-3 gap-y-6 lg:grid-cols-4 lg:gap-4">
      <span aria-hidden className="shine-steps-line absolute inset-x-[12%] top-7 hidden h-0.5 rounded-full opacity-40 lg:block" />
      {steps.map((step, i) => {
        const Icon = ICONS[step.icon];
        return (
          <Reveal as="li" key={step.title} delay={i * 80} className="relative flex flex-col items-center text-center">
            <span className="relative grid h-14 w-14 place-items-center rounded-full bg-brand-500 text-white shadow-md shadow-brand-500/25 ring-4 ring-ink-950">
              <Icon className="h-6 w-6" />
              <span className="absolute -end-1 -top-1 grid h-6 w-6 place-items-center rounded-full bg-white text-[11px] font-black text-brand-400 shadow">
                {i + 1}
              </span>
            </span>
            <h3 className="mt-3 text-base font-black sm:text-lg">{step.title}</h3>
            <p className="mt-1 max-w-[16rem] text-[13px] leading-snug text-mist-300 sm:text-sm">{step.desc}</p>
          </Reveal>
        );
      })}
    </ol>
  );
}
