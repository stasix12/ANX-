'use client';

import type { ReactNode } from 'react';
import { track, type TrackEvent } from '@/lib/analytics';
import { setIntent, type Intent } from '@/lib/intent';

/**
 * Anchor to the lead form. Remembers which package the visitor came from so
 * the form pre-selects it, and fires the analytics events for the click.
 */
export function CtaLink({
  intent,
  location,
  label,
  events = [],
  className = '',
  children,
  href = '#contact',
}: {
  intent?: Intent;
  location: string;
  label?: string;
  /** Extra events beyond the generic cta_click (e.g. pricing_cta_click). */
  events?: TrackEvent[];
  className?: string;
  children: ReactNode;
  href?: string;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        if (intent) setIntent(intent, location);
        track('cta_click', { location, label, destination: 'form', package: intent });
        for (const event of events) track(event, { location, package: intent });
        if (intent === 'website_ads') track('google_package_cta_click', { location, destination: 'form' });
      }}
    >
      {children}
    </a>
  );
}
