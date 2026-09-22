'use client';

import Image from 'next/image';
import { useState } from 'react';
import { portfolio as copy } from '@/content/copy';
import type { Project } from '@/content/portfolio';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { ExternalIcon } from '@/components/ui/icons';

/** Real project card: screenshot with a desktop/mobile toggle + live link. */
export function ProjectCard({ project }: { project: Project }) {
  const [view, setView] = useState<'desktop' | 'mobile'>('desktop');
  const src = view === 'desktop' ? project.desktopImage : project.mobileImage;

  return (
    <article className="card-light card-hover overflow-hidden">
      <div className="relative aspect-[4/3] bg-[#eaf0fa]">
        <Image
          src={src}
          alt={project.alt}
          fill
          sizes="(min-width: 1024px) 33vw, (min-width: 640px) 50vw, 100vw"
          className={cn('object-cover', view === 'mobile' && 'object-top')}
        />
      </div>
      <div className="p-5">
        <h3 className="text-lg font-semibold text-navy">{project.name}</h3>
        <p className="mt-1 text-sm text-navy-subtle">{project.field}</p>
        <div className="mt-4 flex gap-2" role="group" aria-label="תצוגה">
          {(['desktop', 'mobile'] as const).map((v) => (
            <button
              key={v}
              type="button"
              aria-pressed={view === v}
              onClick={() => setView(v)}
              className={cn(
                'rounded-full border px-3 py-1 text-xs font-medium transition-colors',
                view === v
                  ? 'border-navy bg-navy text-white'
                  : 'border-light-border text-navy-subtle hover:border-navy-subtle',
              )}
            >
              {v === 'desktop' ? copy.toggleDesktop : copy.toggleMobile}
            </button>
          ))}
        </div>
        <a
          href={project.url}
          target="_blank"
          rel="noopener noreferrer"
          aria-label={copy.viewAria(project.name)}
          onClick={() => track('portfolio_click', { project_name: project.name })}
          className="btn btn-outline-light btn-block mt-5"
        >
          {copy.view}
          <ExternalIcon className="h-4 w-4" />
        </a>
      </div>
    </article>
  );
}
