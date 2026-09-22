import { process as copy } from '@/content/copy';
import { CtaLink } from '@/components/ui/CtaLink';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { ArrowEndIcon } from '@/components/ui/icons';

export function Process() {
  return (
    <section id="process" aria-labelledby="process-title" className="section bg-light text-navy">
      <div className="container-site">
        <Reveal>
          <SectionHeading
            id="process-title"
            eyebrow={copy.eyebrow}
            title={copy.title}
            intro={copy.intro}
            tone="light"
          />
        </Reveal>

        <ol className="relative mt-12 grid gap-8 lg:grid-cols-4 lg:gap-6">
          <span
            aria-hidden
            className="absolute inset-y-12 start-[23px] border-s border-dashed border-light-border lg:inset-x-[12.5%] lg:inset-y-auto lg:top-6 lg:border-s-0 lg:border-t"
          />
          {copy.steps.map((step, i) => (
            <Reveal as="li" key={step.n} delay={i * 60} className="relative grid grid-cols-[48px_1fr] gap-4 lg:block">
              <span className="tabular relative z-10 flex h-12 w-12 items-center justify-center rounded-full bg-navy text-base font-bold text-white">
                <bdi dir="ltr">{step.n}</bdi>
              </span>
              <div className="lg:mt-5">
                <h3 className="h3 text-navy">{step.title}</h3>
                <p className="mt-2 text-[15px] leading-relaxed text-navy-muted">{step.text}</p>
              </div>
            </Reveal>
          ))}
        </ol>

        <Reveal delay={120}>
          <div className="mt-12 flex flex-col gap-4 rounded-[var(--radius-lg)] border border-light-border bg-white p-5 sm:flex-row sm:items-center sm:justify-between sm:p-6">
            <p className="max-w-[46rem] text-[15px] leading-relaxed text-navy-muted">
              <span className="font-semibold text-navy">{copy.googleNoteLead}</span> {copy.googleNote}
            </p>
            <CtaLink
              location="process"
              label={copy.cta}
              className="inline-flex items-center gap-2 text-[15px] font-semibold text-accent-hover hover:underline"
            >
              {copy.cta}
              <ArrowEndIcon className="h-4 w-4" />
            </CtaLink>
          </div>
        </Reveal>
      </div>
    </section>
  );
}
