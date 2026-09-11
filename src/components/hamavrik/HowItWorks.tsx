import { Reveal } from '@/components/hamavrik/Reveal';
import { steps } from '@/lib/hamavrik/config';

/** Five numbered steps on a connector line; stacks vertically on phones. */
export function HowItWorks() {
  return (
    <ol className="relative grid gap-6 lg:grid-cols-5 lg:gap-4">
      <span aria-hidden className="shine-steps-line absolute inset-x-[10%] top-7 hidden h-1 rounded-full opacity-40 lg:block" />
      {steps.map((step, i) => (
        <Reveal as="li" key={step.title} delay={i * 100} className="relative">
          <div className="flex gap-4 lg:flex-col lg:items-center lg:text-center">
            <span className="relative grid h-14 w-14 shrink-0 place-items-center rounded-full bg-brand-500 text-lg font-black text-white shadow-lg shadow-brand-500/30 ring-4 ring-ink-950">
              {String(i + 1).padStart(2, '0')}
            </span>
            <div className="lg:mt-3">
              <h3 className="text-lg font-black">{step.title}</h3>
              <p className="mt-1 text-[15px] leading-relaxed text-mist-300">{step.desc}</p>
            </div>
          </div>
        </Reveal>
      ))}
    </ol>
  );
}
