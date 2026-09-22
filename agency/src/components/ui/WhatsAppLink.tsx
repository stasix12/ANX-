'use client';

import Link from 'next/link';
import { useState, type ReactNode } from 'react';
import { track, type TrackEvent, type TrackParams } from '@/lib/analytics';
import { messageFromLink, openExternal } from '@/lib/openExternal';
import { hasWhatsApp, whatsappHref, type WhatsAppContext } from '@/lib/whatsapp';
import { WhatsAppFallback } from '@/components/ui/WhatsAppFallback';

/**
 * Every outbound WhatsApp link goes through here: consistent tracking and the
 * blocked-popup fallback.
 *
 * Until NEXT_PUBLIC_WHATSAPP_NUMBER is configured the same link scrolls to
 * the lead form instead (buttons that sit next to a form CTA hide themselves
 * via `hasWhatsApp`; inline text links use this fallback), so nothing fake is
 * dialled. Set the number before launch (see .env.example).
 */
export function WhatsAppLink({
  context = 'default',
  href,
  location,
  packageId,
  label,
  events = [],
  extra = {},
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
  /** Button text for analytics; defaults to the string children. */
  label?: string;
  events?: TrackEvent[];
  extra?: TrackParams;
  className?: string;
  'aria-label'?: string;
  children: ReactNode;
}) {
  const [blocked, setBlocked] = useState(false);
  const text = label ?? (typeof children === 'string' ? children : ariaLabel);

  if (!hasWhatsApp) {
    return (
      <Link
        href="/#contact"
        className={className}
        aria-label={ariaLabel}
        data-whatsapp-unconfigured
        onClick={() =>
          track('cta_click', {
            location,
            label: text,
            destination: 'form',
            package: packageId,
            note: 'whatsapp_unconfigured',
            ...extra,
          })
        }
      >
        {children}
      </Link>
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
          track('whatsapp_click', { location, context, package: packageId, ...extra });
          track('cta_click', { location, label: text, destination: 'whatsapp', package: packageId, ...extra });
          for (const e of events) track(e, { location, destination: 'whatsapp', package: packageId, ...extra });
          if (packageId === 'website_ads') {
            track('google_package_cta_click', { location, destination: 'whatsapp' });
          }
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
