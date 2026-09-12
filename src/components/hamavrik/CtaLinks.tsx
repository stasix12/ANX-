'use client';

import { useState, type ReactNode } from 'react';
import { WhatsAppFallback } from '@/components/WhatsAppFallback';
import { PhoneIcon, WhatsAppIcon } from '@/components/icons';
import { track } from '@/lib/hamavrik/analytics';
import { telLink, waLink } from '@/lib/hamavrik/links';
import { business } from '@/lib/hamavrik/config';
import { messageFromLink, openExternal } from '@/lib/openExternal';

/**
 * The two conversion primitives. Every WhatsApp and phone link on the site
 * goes through these, so tracking and the blocked-popup fallback apply
 * everywhere instead of to whichever buttons someone remembered to wire up.
 */

export function WaLink({
  href = waLink(),
  location,
  className = '',
  children,
  'aria-label': ariaLabel,
}: {
  href?: string;
  /** Where on the page the click came from — lands in analytics as `location`. */
  location: string;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}) {
  const [blocked, setBlocked] = useState(false);

  return (
    <>
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={ariaLabel}
        className={className}
        onClick={(event) => {
          track('whatsapp_click', { location });
          openExternal(event, href, () => setBlocked(true));
        }}
      >
        {children}
      </a>
      {blocked ? (
        <WhatsAppFallback kind="message" message={messageFromLink(href)} href={href} onClose={() => setBlocked(false)} />
      ) : null}
    </>
  );
}

export function PhoneLink({
  location,
  className = '',
  children,
  'aria-label': ariaLabel,
}: {
  location: string;
  className?: string;
  children: ReactNode;
  'aria-label'?: string;
}) {
  return (
    <a
      href={telLink}
      aria-label={ariaLabel ?? `התקשרו: ${business.phoneDisplay}`}
      className={className}
      onClick={() => track('phone_click', { location })}
    >
      {children}
    </a>
  );
}

/* ── Ready-made buttons ─────────────────────────────────────────────────── */

const WA_BTN =
  'inline-flex items-center justify-center gap-2.5 rounded-full bg-wa-600 font-extrabold text-white shadow-lg shadow-wa-600/30 transition-colors hover:bg-wa-500';
const PHONE_BTN =
  'inline-flex items-center justify-center gap-2.5 rounded-full font-extrabold transition-colors';

export function WaButton({
  href,
  location,
  size = 'md',
  className = '',
  shimmer = false,
  children,
}: {
  href?: string;
  location: string;
  size?: 'md' | 'lg' | 'xl';
  className?: string;
  shimmer?: boolean;
  children: ReactNode;
}) {
  const sizing =
    size === 'xl'
      ? 'px-9 py-5 text-xl'
      : size === 'lg'
        ? 'px-7 py-4 text-lg'
        : 'px-5 py-3 text-base';
  return (
    <WaLink
      href={href}
      location={location}
      className={`${WA_BTN} ${sizing} ${shimmer ? 'shine-shimmer' : ''} ${className}`}
    >
      <WhatsAppIcon className={size === 'md' ? 'h-5 w-5' : 'h-6 w-6'} />
      {children}
    </WaLink>
  );
}

export function PhoneButton({
  location,
  variant = 'outline',
  size = 'md',
  className = '',
  children,
}: {
  location: string;
  variant?: 'outline' | 'solid' | 'ghost' | 'light';
  size?: 'md' | 'lg';
  className?: string;
  children?: ReactNode;
}) {
  const look =
    variant === 'solid'
      ? 'bg-brand-500 text-white hover:bg-brand-600 shadow-lg shadow-brand-500/25'
      : variant === 'light'
        ? 'bg-white/10 text-white ring-1 ring-white/30 hover:bg-white/20 backdrop-blur'
        : variant === 'ghost'
          ? 'text-brand-400 hover:bg-brand-300/40'
          : 'text-brand-400 ring-2 ring-brand-500/25 hover:ring-brand-500/50 bg-white';
  const sizing = size === 'lg' ? 'px-7 py-4 text-lg' : 'px-5 py-3 text-base';
  return (
    <PhoneLink location={location} className={`${PHONE_BTN} ${look} ${sizing} ${className}`}>
      <PhoneIcon className="h-5 w-5 shrink-0" />
      {children ?? (
        <span className="whitespace-nowrap">
          חייגו עכשיו – <span dir="ltr">{business.phoneDisplay}</span>
        </span>
      )}
    </PhoneLink>
  );
}
