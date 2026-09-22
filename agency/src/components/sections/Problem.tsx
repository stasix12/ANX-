import { problem } from '@/content/copy';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';

export function Problem() {
  return (
    <section id="problem" aria-labelledby="problem-title" className="section">
      <div className="container-narrow">
        <Reveal>
          <SectionHeading id="problem-title" eyebrow={problem.eyebrow} title={problem.title} intro={problem.intro} />
        </Reveal>

        <Reveal delay={60}>
          <ul className="mt-8 grid gap-3 sm:grid-cols-2">
            {problem.points.map((p) => (
              <li key={p.title} className="card-dark p-5">
                <h3 className="flex items-center gap-2 text-base font-semibold text-fg">
                  <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-accent" />
                  {p.title}
                </h3>
                <p className="mt-1.5 text-sm leading-relaxed text-muted">{p.text}</p>
              </li>
            ))}
          </ul>
        </Reveal>

        <Reveal delay={120}>
          <p className="mt-10 max-w-[34rem] text-xl font-semibold leading-snug text-fg">{problem.closing}</p>
        </Reveal>
      </div>
    </section>
  );
}
