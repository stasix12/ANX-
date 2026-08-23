'use client';

import { useState, type ReactNode } from 'react';
import { WhatsAppFallback } from '@/components/WhatsAppFallback';
import { messageFromLink, openExternal } from '@/lib/openExternal';

/**
 * Every outbound wa.me link on the site goes through here, so the
 * blocked-handoff fallback applies everywhere rather than to whichever buttons
 * someone remembered to wire up.
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
  const [blocked, setBlocked] = useState(false);

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        onClick={(event) => openExternal(event, href, () => setBlocked(true))}
        className={className}
      >
        {children}
      </a>

      {blocked ? (
        <WhatsAppFallback
          message={messageFromLink(href)}
          href={href}
          onClose={() => setBlocked(false)}
        />
      ) : null}
    </>
  );
}
