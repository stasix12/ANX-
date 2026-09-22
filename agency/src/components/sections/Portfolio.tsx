import { portfolio as copy } from '@/content/copy';
import { placeholderCount, projects, showPlaceholders } from '@/content/portfolio';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { BrowserIcon } from '@/components/ui/icons';
import { ProjectCard } from '@/components/sections/ProjectCard';

/**
 * "אתרים שבנינו". With no real projects yet, renders labelled placeholder
 * cards (see content/portfolio.ts) or a single empty-state line. Never invents
 * clients.
 */
export function Portfolio() {
  const hasProjects = projects.length > 0;
  if (!hasProjects && !showPlaceholders) return null;

  return (
    <section id="portfolio" aria-labelledby="portfolio-title" className="section bg-light text-navy">
      <div className="container-site">
        <Reveal>
          <SectionHeading
            id="portfolio-title"
            eyebrow={copy.eyebrow}
            title={copy.title}
            intro={copy.intro}
            tone="light"
          />
        </Reveal>

        {hasProjects ? (
          <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {projects.map((project, i) => (
              <Reveal as="li" key={project.url} delay={i * 60}>
                <ProjectCard project={project} />
              </Reveal>
            ))}
          </ul>
        ) : (
          <>
            {/* PLACEHOLDER cards — replaced automatically once `projects` has entries. */}
            <ul className="mt-10 grid gap-6 sm:grid-cols-2 lg:grid-cols-3" data-placeholder="portfolio">
              {Array.from({ length: placeholderCount }).map((_, i) => (
                <Reveal as="li" key={i} delay={i * 60} className={i === 2 ? 'hidden lg:block' : ''}>
                  <article className="card-light overflow-hidden">
                    <div className="relative flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-[#eaf0fa] text-navy-subtle">
                      <BrowserIcon className="h-12 w-12" strokeWidth={1.5} />
                      <p className="text-[13px]">{copy.placeholder.mediaCaption}</p>
                      <span className="absolute top-3 start-3 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-navy-subtle">
                        {copy.placeholder.badge}
                      </span>
                    </div>
                    <div className="p-5">
                      <h3 className="text-lg font-semibold text-navy">{copy.placeholder.name}</h3>
                      <p className="mt-1 text-sm text-navy-subtle">{copy.placeholder.field}</p>
                      <div className="mt-4 flex gap-2" aria-hidden>
                        <span className="rounded-full border border-light-border px-3 py-1 text-xs text-navy-subtle">
                          {copy.toggleDesktop}
                        </span>
                        <span className="rounded-full border border-light-border px-3 py-1 text-xs text-navy-subtle">
                          {copy.toggleMobile}
                        </span>
                      </div>
                      <span aria-hidden className="btn btn-outline-light btn-block mt-5 opacity-60">
                        {copy.view}
                      </span>
                    </div>
                  </article>
                </Reveal>
              ))}
            </ul>
            <Reveal delay={120}>
              <p className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-navy-muted">
                {copy.emptyState}
                <WhatsAppLink
                  href={undefined}
                  context="portfolio"
                  location="portfolio"
                  className="font-semibold text-accent-hover hover:underline"
                >
                  {copy.emptyCta}
                </WhatsAppLink>
              </p>
            </Reveal>
          </>
        )}
      </div>
    </section>
  );
}
