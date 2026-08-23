'use client';

import type { ReactNode } from 'react';
import { openExternal } from '@/lib/openExternal';

/**
 * Every outbound wa.me link on the site goes through here, so the
 * popup-blocked fallback in openExternal applies everywhere rather than to
 * whichever buttons someone remembered to wire up.
 */
export function WhatsAppLink({
  href,
  className = '',
  'aria-label': ariaLabel,
  children,
}: {
  href: string;
  className?: string;
  'aria-label'?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      aria-label={ariaLabel}
      onClick={(event) => openExternal(event, href)}
      className={className}
    >
      {children}
    </a>
  );
}
