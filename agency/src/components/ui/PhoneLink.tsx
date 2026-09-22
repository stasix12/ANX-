'use client';

import type { ReactNode } from 'react';
import { track } from '@/lib/analytics';

export function PhoneLink({
  href,
  location,
  className = '',
  'aria-label': ariaLabel,
  children,
}: {
  href: string;
  location: string;
  className?: string;
  'aria-label'?: string;
  children: ReactNode;
}) {
  return (
    <a
      href={href}
      className={className}
      aria-label={ariaLabel}
      onClick={() => {
        track('phone_click', { location });
        track('cta_click', { location, destination: 'phone' });
      }}
    >
      {children}
    </a>
  );
}
