import { cn } from '@/lib/cn';

/**
 * Eyebrow + h2 + optional intro. `tone` picks the text colours for dark or
 * light section backgrounds. `center` is reserved for the final CTA.
 */
export function SectionHeading({
  id,
  eyebrow,
  title,
  intro,
  tone = 'dark',
  center = false,
  className = '',
}: {
  id: string;
  eyebrow?: string;
  title: string;
  intro?: string;
  tone?: 'dark' | 'light';
  center?: boolean;
  className?: string;
}) {
  const light = tone === 'light';
  return (
    <div className={cn('max-w-[40rem]', center && 'mx-auto text-center', className)}>
      {eyebrow ? (
        <p className={cn('eyebrow', light && 'eyebrow-light', center && 'justify-center')}>{eyebrow}</p>
      ) : null}
      <h2 id={id} className={cn('h2 mt-4', light ? 'text-navy' : 'text-fg')}>
        {title}
      </h2>
      {intro ? <p className={cn('lead mt-4', light ? 'text-navy-muted' : 'text-muted')}>{intro}</p> : null}
    </div>
  );
}
