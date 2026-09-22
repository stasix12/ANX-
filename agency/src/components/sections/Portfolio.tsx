import { portfolio as copy } from '@/content/copy';
import { hasPortfolio, placeholderCount, projects } from '@/content/portfolio';
import { Reveal } from '@/components/ui/Reveal';
import { SectionHeading } from '@/components/ui/SectionHeading';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { BrowserIcon, WhatsAppIcon } from '@/components/ui/icons';
import dynamic from 'next/dynamic';

// next/image only joins the bundle once real projects exist.
const ProjectCard = dynamic(() => import('@/components/sections/ProjectCard').then((m) => m.ProjectCard));

/**
 * "אתרים שבנינו". With no real projects yet, renders labelled placeholder
 * cards on preview builds only (see content/portfolio.ts); in production the
 * whole section (and its nav link) disappears until real work is added.
 */
export function Portfolio() {
  if (!hasPortfolio) return null;
  const hasProjects = projects.length > 0;

  return (
    <section id="portfolio" aria-labelledby="portfolio-title" className="section bg-light text-navy">
      <div className="container-site">
        <Reveal>
          <SectionHeading
            id="portfolio-title"
            eyebrow={copy.eyebrow}
            title={copy.title}
            intro={hasProjects ? copy.intro : copy.introEmpty}
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
                <Reveal
                  as="li"
                  key={i}
                  delay={i * 60}
                  className={i === 0 ? '' : i === 1 ? 'hidden sm:block' : 'hidden lg:block'}
                >
                  <article className="card-light overflow-hidden">
                    <div className="relative flex aspect-[4/3] flex-col items-center justify-center gap-3 bg-[#eaf0fa] text-navy-subtle">
                      <BrowserIcon className="h-12 w-12" strokeWidth={1.5} />
                      <p className="text-[13px]">{copy.placeholder.mediaCaption}</p>
                      <span className="absolute top-3 start-3 rounded-full bg-white px-2.5 py-1 text-xs font-semibold text-navy-subtle">
                        {copy.placeholder.badge}
                      </span>
                    </div>
                    <div className="p-5">
                      <p className="text-lg font-semibold text-navy">{copy.placeholder.name}</p>
                      <p className="mt-1 text-sm text-navy-subtle">{copy.placeholder.field}</p>
                    </div>
                  </article>
                </Reveal>
              ))}
            </ul>
            <Reveal delay={120}>
              <p className="mt-8 flex flex-wrap items-center gap-x-2 gap-y-1 text-[15px] text-navy-muted">
                {copy.emptyState}
                <WhatsAppLink
                  context="portfolio"
                  location="portfolio"
                  className="inline-flex items-center gap-1.5 font-semibold text-accent-hover hover:underline"
                >
                  <WhatsAppIcon className="h-4 w-4 text-whatsapp" />
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
