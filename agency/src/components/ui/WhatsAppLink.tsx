'use client';

import { useState, type ReactNode } from 'react';
import { track } from '@/lib/analytics';
import { messageFromLink, openExternal } from '@/lib/openExternal';
import { hasWhatsApp, whatsappHref, type WhatsAppContext } from '@/lib/whatsapp';
import { WhatsAppFallback } from '@/components/ui/WhatsAppFallback';

/**
 * Every outbound WhatsApp link goes through here: consistent tracking and the
 * blocked-popup fallback.
 *
 * Until NEXT_PUBLIC_WHATSAPP_NUMBER is configured the same button scrolls to
 * the lead form instead, so the layout never loses its CTAs and nothing fake
 * is dialled. Set the number before launch (see .env.example).
 */
export function WhatsAppLink({
  context = 'default',
  href,
  location,
  packageId,
  className = '',
  'aria-label': ariaLabel,
  children,
}: {
  context?: WhatsAppContext;
  /** Custom href (already built) — overrides `context`. */
  href?: string;
  /** Where on the page the click happened (analytics). */
  location: string;
  packageId?: 'website' | 'website_ads' | 'unsure';
  className?: string;
  'aria-label'?: string;
  children: ReactNode;
}) {
  const [blocked, setBlocked] = useState(false);

  if (!hasWhatsApp) {
    return (
      <a
        href="#contact"
        className={className}
        aria-label={ariaLabel}
        data-whatsapp-unconfigured
        onClick={() =>
          track('cta_click', { location, destination: 'form', package: packageId, note: 'whatsapp_unconfigured' })
        }
      >
        {children}
      </a>
    );
  }

  const target = href ?? whatsappHref(context);

  return (
    <>
      <a
        href={target}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        className={className}
        onClick={(event) => {
          track('whatsapp_click', { location, context, package: packageId });
          track('cta_click', { location, destination: 'whatsapp', package: packageId });
          openExternal(event, target, () => setBlocked(true));
        }}
      >
        {children}
      </a>
      {blocked ? (
        <WhatsAppFallback message={messageFromLink(target)} href={target} onClose={() => setBlocked(false)} />
      ) : null}
    </>
  );
}
