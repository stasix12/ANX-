import type { ReactNode } from 'react';

interface SectionProps {
  id?: string;
  eyebrow?: string;
  title: string;
  /**
   * Heading level for the title. Defaults to h2 for sections stacked under a
   * page-level h1; pass 'h1' when this section *is* the page's main heading.
   */
  titleAs?: 'h1' | 'h2';
  description?: string;
  /**
   * Keeps the heading and description in the document for search engines and
   * screen readers while hiding them visually — for when something above the
   * section already carries the message, so repeating it on screen is noise.
   */
  headerHidden?: boolean;
  children: ReactNode;
  className?: string;
}

/** Shared section shell: consistent rhythm, heading hierarchy and max width. */
export function Section({
  id,
  eyebrow,
  title,
  titleAs: Heading = 'h2',
  description,
  headerHidden = false,
  children,
  className = '',
}: SectionProps) {
  const headingId = id ? `${id}-title` : undefined;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`scroll-mt-20 py-14 sm:py-20 lg:py-24 ${className}`}
    >
      <div className="mx-auto max-w-7xl px-4 sm:px-6 lg:px-8">
        <header className={headerHidden ? 'sr-only' : 'max-w-2xl'}>
          {eyebrow ? (
            <p className="flex items-center gap-2 text-sm font-bold text-brand-700">
              <span aria-hidden className="h-0.5 w-4 rounded-full bg-brand-500" />
              {eyebrow}
            </p>
          ) : null}
          <Heading
            id={headingId}
            className="mt-3 text-[28px] leading-tight font-extrabold tracking-tight text-balance-he sm:text-4xl"
          >
            {title}
          </Heading>
          {description ? (
            <p className="mt-3 text-base leading-relaxed text-mist-500 sm:text-lg">{description}</p>
          ) : null}
        </header>

        <div className={headerHidden ? '' : 'mt-8 sm:mt-10'}>{children}</div>
      </div>
    </section>
  );
}
