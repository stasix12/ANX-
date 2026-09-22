'use client';

import { useEffect } from 'react';
import { track } from '@/lib/analytics';

/** Fires `section_view` once per section per page load (≥50% visible). */
export function SectionObserver() {
  useEffect(() => {
    const sections = Array.from(document.querySelectorAll<HTMLElement>('main section[id]'));
    if (sections.length === 0 || !('IntersectionObserver' in window)) return;
    const seen = new Set<string>();
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          const id = (entry.target as HTMLElement).id;
          if (entry.isIntersecting && !seen.has(id)) {
            seen.add(id);
            track('section_view', { section_id: id });
            observer.unobserve(entry.target);
          }
        }
      },
      { threshold: 0.5 },
    );
    for (const section of sections) observer.observe(section);
    return () => observer.disconnect();
  }, []);
  return null;
}
