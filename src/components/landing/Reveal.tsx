'use client';

import { useEffect, useRef, type ReactNode } from 'react';

/**
 * Fade-and-rise on first scroll into view. One shared IntersectionObserver
 * would be marginally cheaper, but per-element observers that disconnect on
 * first hit cost nothing measurable at this page's element count and keep the
 * component self-contained. Content is visible (not animated in) when
 * JavaScript never runs — the base .lp-reveal opacity:0 is applied here, on
 * mount, not in the server markup, so the page never renders blank for
 * crawlers or with JS disabled.
 */
export function Reveal({
  children,
  delay = 0,
  className = '',
}: {
  children: ReactNode;
  /** Stagger offset in ms, for cards revealed as a group. */
  delay?: number;
  className?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    // Reduced-motion users get the content plainly visible — hiding it and
    // then snapping it in is worse than no effect at all.
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) return;
    el.classList.add('lp-reveal');
    // Already on screen (hero, or a reload mid-page): show without animating.
    const rect = el.getBoundingClientRect();
    if (rect.top < window.innerHeight && rect.bottom > 0) {
      el.classList.add('is-in');
      return;
    }
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            el.classList.add('is-in');
            observer.disconnect();
          }
        }
      },
      { rootMargin: '0px 0px -8% 0px' },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  return (
    <div ref={ref} className={className} style={delay ? { ['--lp-delay' as string]: `${delay}ms` } : undefined}>
      {children}
    </div>
  );
}
