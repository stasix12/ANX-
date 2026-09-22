'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Fade-and-rise on first scroll into view. The hidden state is applied on
 * mount only, so server HTML (crawlers, no-JS) shows everything, and reduced
 * motion users never see anything hidden.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
  as: Tag = 'div',
}: {
  children: ReactNode;
  /** Stagger in ms, capped at 240 for grids. */
  delay?: number;
  className?: string;
  as?: 'div' | 'li' | 'article';
}) {
  const ref = useRef<HTMLElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    // Measure first: content already on screen is left alone (no blink).
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight * 0.9 && rect.bottom > 0) return;
    el.classList.add('reveal');
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('is-in');
            observer.disconnect();
          }
        }
      },
      { threshold: 0.15, rootMargin: '0px 0px -10% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const style = delay ? ({ '--delay': `${Math.min(delay, 240)}ms` } as React.CSSProperties) : undefined;
  const Comp = Tag as React.ElementType;
  return (
    <Comp ref={ref} className={className} style={style}>
      {children}
    </Comp>
  );
}
