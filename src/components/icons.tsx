import type { SVGProps } from 'react';

/**
 * Inline icon set — keeps the bundle free of an icon library.
 * Every icon is decorative by default (aria-hidden); the surrounding
 * link or button carries the accessible name.
 */
type IconProps = SVGProps<SVGSVGElement>;

const base = {
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.8,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
  focusable: false,
};

export function InstagramIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="3" y="3" width="18" height="18" rx="5" />
      <circle cx="12" cy="12" r="4" />
      <circle cx="17.2" cy="6.8" r="1.1" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function TikTokIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
      <path d="M16.5 3c.35 1.62 1.3 2.9 2.79 3.45.6.22 1.24.33 1.9.34v3.03a7.7 7.7 0 01-4.5-1.44v6.09a5.98 5.98 0 11-5.98-5.98c.24 0 .47.01.7.04v3.1a2.9 2.9 0 101.99 2.75V3h3.1z" />
    </svg>
  );
}

export function WhatsAppIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden focusable="false" {...props}>
      <path d="M12.03 2C6.6 2 2.2 6.4 2.2 11.83c0 1.94.55 3.75 1.5 5.29L2 22l5.02-1.64a9.78 9.78 0 005.01 1.37h.01c5.42 0 9.83-4.4 9.83-9.83 0-2.63-1.02-5.1-2.88-6.96A9.76 9.76 0 0012.03 2zm0 1.96a7.86 7.86 0 017.87 7.87 7.87 7.87 0 01-11.9 6.75l-.36-.21-2.98.97.98-2.9-.24-.37a7.83 7.83 0 01-1.2-4.24 7.86 7.86 0 017.83-7.87zm-3.6 4.2c-.17 0-.44.06-.67.31-.23.25-.88.86-.88 2.1s.9 2.44 1.03 2.6c.13.18 1.75 2.79 4.3 3.8 2.12.84 2.55.67 3.01.63.46-.04 1.49-.6 1.7-1.2.21-.58.21-1.08.15-1.19-.06-.1-.23-.16-.48-.29-.25-.12-1.49-.73-1.72-.82-.23-.08-.4-.12-.57.13-.16.25-.65.82-.8.99-.14.16-.29.19-.54.06-.25-.12-1.06-.39-2.02-1.24-.75-.67-1.25-1.49-1.4-1.74-.14-.25-.01-.38.11-.5.11-.11.25-.29.37-.44.12-.14.16-.25.25-.41.08-.17.04-.31-.02-.44-.06-.12-.55-1.37-.78-1.87-.19-.42-.38-.4-.53-.41h-.5z" />
    </svg>
  );
}

export function MenuIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 7h16M4 12h16M4 17h16" />
    </svg>
  );
}

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
    </svg>
  );
}

/** Points toward the reading direction; flipped for RTL by the caller. */
export function ArrowIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 12h14M13 6l6 6-6 6" />
    </svg>
  );
}

export function ChevronDownIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 9l6 6 6-6" />
    </svg>
  );
}

export function CheckIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.4} {...props}>
      <path d="M4.5 12.5l5 5 10-11" />
    </svg>
  );
}

export function ToolIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M14.7 6.3a4 4 0 01-5 5L5.4 15.6a2.3 2.3 0 103.2 3.2l4.3-4.3a4 4 0 015-5l-2.6 2.6-2.3-.6-.6-2.3 2.6-2.6a4 4 0 00-2.3.7z" />
    </svg>
  );
}

export function MachineIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="4" y="7" width="12" height="12" rx="2.5" />
      <path d="M7 7V5.5A1.5 1.5 0 018.5 4h3A1.5 1.5 0 0113 5.5V7" />
      <path d="M7.5 11h5" />
      <circle cx="8" cy="15.5" r="1.4" />
      <path d="M16 12c2.5 0 2 4 4.5 4" />
    </svg>
  );
}

export function ShieldIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l7 3v5.5c0 4.2-2.9 7.6-7 9.5-4.1-1.9-7-5.3-7-9.5V6l7-3z" />
      <path d="M9 12l2 2 4-4.5" />
    </svg>
  );
}

export function TruckIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 7.5A1.5 1.5 0 014.5 6H14v9H3V7.5z" />
      <path d="M14 9.5h3.6L21 12.6V15h-7V9.5z" />
      <circle cx="7" cy="17.5" r="1.8" />
      <circle cx="17" cy="17.5" r="1.8" />
    </svg>
  );
}

export function PhoneIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6.5 3.5h3l1.5 4-2 1.4a12 12 0 006.1 6.1l1.4-2 4 1.5v3a2 2 0 01-2.2 2A16.5 16.5 0 014.5 5.7a2 2 0 012-2.2z" />
    </svg>
  );
}

export function HoseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 6c3 0 3 4 6 4s3-4 6-4 3 4 5 4" />
      <circle cx="3.5" cy="6" r="1.4" fill="currentColor" stroke="none" />
      <circle cx="20.5" cy="10" r="1.4" fill="currentColor" stroke="none" />
    </svg>
  );
}

export function SparkleIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3l1.9 5.1L19 10l-5.1 1.9L12 17l-1.9-5.1L5 10l5.1-1.9L12 3z" />
      <path d="M19 14.5l.7 1.8 1.8.7-1.8.7-.7 1.8-.7-1.8-1.8-.7 1.8-.7z" />
    </svg>
  );
}
