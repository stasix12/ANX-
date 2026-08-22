import type { ReactNode } from 'react';

interface SectionProps {
  id?: string;
  eyebrow?: string;
  title: string;
  description?: string;
  children: ReactNode;
  className?: string;
}

/** Shared section shell: consistent rhythm, heading hierarchy and max width. */
export function Section({
  id,
  eyebrow,
  title,
  description,
  children,
  className = '',
}: SectionProps) {
  const headingId = id ? `${id}-title` : undefined;

  return (
    <section
      id={id}
      aria-labelledby={headingId}
      className={`scroll-mt-24 py-16 sm:py-20 lg:py-24 ${className}`}
    >
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <header className="max-w-2xl">
          {eyebrow ? (
            <p className="text-xs font-semibold tracking-[0.18em] text-brand-700 uppercase">
              {eyebrow}
            </p>
          ) : null}
          <h2
            id={headingId}
            className="mt-3 text-3xl font-extrabold tracking-tight text-balance-he sm:text-4xl"
          >
            {title}
          </h2>
          {description ? (
            <p className="mt-4 text-base leading-relaxed text-mist-300 sm:text-lg">{description}</p>
          ) : null}
        </header>

        <div className="mt-10 sm:mt-12">{children}</div>
      </div>
    </section>
  );
}
