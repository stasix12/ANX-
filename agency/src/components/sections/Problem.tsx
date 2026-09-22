import { problem } from '@/content/copy';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';

export function Problem() {
  return (
    <section id="problem" aria-labelledby="problem-title" className="section lg:pt-24">
      <div className="container-site">
        <div className="max-w-[720px]">
          <Reveal>
            <SectionHeading id="problem-title" eyebrow={problem.eyebrow} title={problem.title} intro={problem.intro} />
          </Reveal>

          <Reveal delay={60}>
            <ul className="mt-8 grid grid-cols-2 gap-3">
              {problem.points.map((p) => (
                <li key={p.title} className="rounded-[var(--radius-md)] border border-border bg-surface-1 px-4 py-3.5">
                  <h3 className="flex items-center gap-2 text-[15px] font-semibold text-fg">
                    <span aria-hidden className="h-1.5 w-1.5 shrink-0 rounded-full bg-accent" />
                    {p.title}
                  </h3>
                  <p className="mt-1 text-[13px] leading-relaxed text-subtle sm:text-sm sm:text-muted">{p.text}</p>
                </li>
              ))}
            </ul>
          </Reveal>

          <Reveal delay={120}>
            <p className="mt-10 max-w-[34rem] text-xl font-semibold leading-snug text-fg">{problem.closing}</p>
          </Reveal>
        </div>
      </div>
    </section>
  );
}
