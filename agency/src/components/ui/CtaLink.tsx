'use client';

import type { ReactNode } from 'react';
import { track, type TrackEvent, type TrackParams } from '@/lib/analytics';
import { setIntent, type Intent } from '@/lib/intent';

/**
 * After the smooth scroll lands, put the visitor "in" the form: desktop
 * focuses the name field, mobile focuses the heading (an input would pop the
 * keyboard and jump the viewport).
 */
function focusContact() {
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
  window.setTimeout(
    () => {
      const desktop = window.matchMedia('(min-width: 1024px)').matches;
      const target = desktop
        ? document.querySelector<HTMLInputElement>('#contact input[name="name"]')
        : document.getElementById('contact-title');
      target?.focus({ preventScroll: true });
    },
    reduced ? 0 : 500,
  );
}

/**
 * Anchor to the lead form. Remembers which package the visitor came from so
 * the form pre-selects it, and fires the analytics events for the click.
 */
export function CtaLink({
  intent,
  location,
  label,
  events = [],
  extra = {},
  onBeforeNavigate,
  className = '',
  children,
  href = '/#contact',
}: {
  intent?: Intent;
  location: string;
  label?: string;
  /** Extra events beyond the generic cta_click (e.g. pricing_cta_click). */
  events?: TrackEvent[];
  /** Extra params merged into every event fired by this click. */
  extra?: TrackParams;
  onBeforeNavigate?: () => void;
  className?: string;
  children: ReactNode;
  href?: string;
}) {
  return (
    <a
      href={href}
      className={className}
      onClick={() => {
        onBeforeNavigate?.();
        setIntent(intent, location);
        track('cta_click', { location, label, destination: 'form', package: intent, ...extra });
        for (const event of events) track(event, { location, package: intent, ...extra });
        if (intent === 'website_ads') track('google_package_cta_click', { location, destination: 'form' });
        if (href.endsWith('#contact') && window.location.pathname === '/') focusContact();
      }}
    >
      {children}
    </a>
  );
}
