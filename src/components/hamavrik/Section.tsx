import type { ReactNode } from 'react';
import { Reveal } from '@/components/hamavrik/Reveal';

/**
 * Shared section shell: consistent vertical rhythm, max width, and the
 * eyebrow / title / lede stack every section opens with.
 */
export function Section({
  id,
  tone = 'plain',
  className = '',
  children,
}: {
  id?: string;
  tone?: 'plain' | 'tint' | 'dark';
  className?: string;
  children: ReactNode;
}) {
  const bg =
    tone === 'tint' ? 'bg-ink-900' : tone === 'dark' ? 'shine-hero relative overflow-hidden' : '';
  return (
    <section id={id} className={`${bg} py-16 sm:py-20 lg:py-24 ${className}`}>
      <div className="mx-auto max-w-6xl px-4 sm:px-6">{children}</div>
    </section>
  );
}

export function SectionHeading({
  eyebrow,
  title,
  lede,
  align = 'center',
  as: Tag = 'h2',
  light = false,
}: {
  eyebrow?: string;
  title: ReactNode;
  lede?: ReactNode;
  align?: 'center' | 'start';
  as?: 'h1' | 'h2';
  light?: boolean;
}) {
  const alignment = align === 'center' ? 'mx-auto text-center items-center' : 'text-start items-start';
  return (
    <Reveal className={`mb-10 flex max-w-2xl flex-col sm:mb-14 ${alignment}`}>
      {eyebrow ? (
        <span className={light ? 'shine-eyebrow bg-white/15 text-white' : 'shine-eyebrow'}>{eyebrow}</span>
      ) : null}
      <Tag
        className={`mt-4 text-3xl font-black leading-tight text-balance-he sm:text-4xl lg:text-[2.75rem] ${light ? 'text-white' : ''}`}
      >
        {title}
      </Tag>
      {lede ? (
        <p className={`mt-4 text-lg leading-relaxed ${light ? 'text-white/80' : 'text-mist-300'}`}>{lede}</p>
      ) : null}
    </Reveal>
  );
}
