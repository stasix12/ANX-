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

export function PhoneIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={1.6} {...props}>
      <path d="M6.5 3.5h3l1.5 4-2 1.4a12 12 0 006.1 6.1l1.4-2 4 1.5v3a2 2 0 01-2.2 2A16.5 16.5 0 014.5 5.7a2 2 0 012-2.2z" />
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

export function CloseIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M6 6l12 12M18 6L6 18" />
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

/** Solid, unlike the rest: it sits over a photograph and has to read at 28px. */
export function PlayIcon(props: IconProps) {
  return (
    <svg {...base} {...props} fill="currentColor" stroke="none">
      <path d="M8.5 5.6a1 1 0 011.52-.85l8.1 5a1 1 0 010 1.7l-8.1 5a1 1 0 01-1.52-.85V5.6z" />
    </svg>
  );
}

/* --- Admin panel icons: same line-drawing style as the set above. --- */

export function PlusIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.2} {...props}>
      <path d="M12 5v14M5 12h14" />
    </svg>
  );
}

export function PencilIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M4 20l1-4.2L15.3 5.5a1.5 1.5 0 012.2 0l1 1a1.5 1.5 0 010 2.2L8.2 19 4 20z" />
      <path d="M13.5 7.3l3.2 3.2" />
    </svg>
  );
}

export function TrashIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M5 7h14" />
      <path d="M9 7V5a1 1 0 011-1h4a1 1 0 011 1v2" />
      <path d="M7 7l1 13a1 1 0 001 1h6a1 1 0 001-1l1-13" />
      <path d="M10 11v6M14 11v6" />
    </svg>
  );
}

export function TagIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12.6 3.5H6a1 1 0 00-1 1v6.6c0 .27.1.52.3.7l9.2 9.2c.4.4 1 .4 1.4 0l6.6-6.6c.4-.4.4-1 0-1.4l-9.2-9.2a1 1 0 00-.7-.3z" />
      <circle cx="8.5" cy="8.5" r="1.4" />
    </svg>
  );
}

export function BoxIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3.5 8.2L12 4l8.5 4.2v8.6L12 20l-8.5-3.2V8.2z" />
      <path d="M3.5 8.2L12 12l8.5-3.8" />
      <path d="M12 12v8" />
    </svg>
  );
}

export function EyeIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
      <circle cx="12" cy="12" r="3" />
    </svg>
  );
}

export function EyeOffIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M3 3l18 18" />
      <path d="M10.6 5.6A10.6 10.6 0 0112 5.5c6 0 9.5 6.5 9.5 6.5a15.6 15.6 0 01-3.3 4.1M6.6 6.9C4 8.7 2.5 12 2.5 12S6 18.5 12 18.5c1.3 0 2.5-.24 3.6-.66" />
      <path d="M9.9 10a3 3 0 004.1 4.1" />
    </svg>
  );
}

export function CopyIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="9" y="9" width="11" height="11" rx="2" />
      <path d="M6 15H5a2 2 0 01-2-2V5a2 2 0 012-2h8a2 2 0 012 2v1" />
    </svg>
  );
}

export function SearchIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="10.5" cy="10.5" r="6.5" />
      <path d="M20 20l-4.8-4.8" />
    </svg>
  );
}

export function UsersIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="9" cy="8" r="3" />
      <path d="M3 20c0-3.3 2.7-6 6-6s6 2.7 6 6" />
      <path d="M16 4.3a3 3 0 010 5.8" />
      <path d="M20.5 20a6 6 0 00-4-5.6" />
    </svg>
  );
}

export function ClipboardListIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <rect x="5" y="4" width="14" height="17" rx="2" />
      <path d="M9 3.5h6a1 1 0 011 1V6H8V4.5a1 1 0 011-1z" />
      <path d="M8.5 11h7M8.5 14.5h7M8.5 18h4.5" />
    </svg>
  );
}

export function GearIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <circle cx="12" cy="12" r="3.2" />
      <path d="M12 3.5v2M12 18.5v2M20.5 12h-2M5.5 12h-2M18 6l-1.4 1.4M7.4 16.6L6 18M18 18l-1.4-1.4M7.4 7.4L6 6" />
    </svg>
  );
}

export function ArrowUpIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.2} {...props}>
      <path d="M12 19V5M6 11l6-6 6 6" />
    </svg>
  );
}

export function ArrowDownIcon(props: IconProps) {
  return (
    <svg {...base} strokeWidth={2.2} {...props}>
      <path d="M12 5v14M6 13l6 6 6-6" />
    </svg>
  );
}

export function StarIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M12 3.5l2.6 5.3 5.9.85-4.25 4.15 1 5.8L12 16.8l-5.25 2.8 1-5.8L3.5 9.65l5.9-.85z" />
    </svg>
  );
}

export function LogOutIcon(props: IconProps) {
  return (
    <svg {...base} {...props}>
      <path d="M9 4H6a2 2 0 00-2 2v12a2 2 0 002 2h3" />
      <path d="M16 16l4-4-4-4" />
      <path d="M20 12H9" />
    </svg>
  );
}

export function SpinnerIcon(props: IconProps) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden focusable={false} {...props}>
      <circle cx="12" cy="12" r="9" stroke="currentColor" strokeOpacity="0.25" strokeWidth="3" />
      <path d="M21 12a9 9 0 00-9-9" stroke="currentColor" strokeWidth="3" strokeLinecap="round" />
    </svg>
  );
}

/**
 * The flag of Israel, 11:8 as the standard has it.
 *
 * Not part of the icon set above: those are single-colour line drawings that
 * take their colour from the text around them, and a flag has to keep its own.
 */
export function IsraelFlagIcon(props: SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 44 32" aria-hidden focusable={false} {...props}>
      <rect width="44" height="32" fill="#fff" />
      <rect y="4.5" width="44" height="3.5" fill="#0038B8" />
      <rect y="24" width="44" height="3.5" fill="#0038B8" />
      <g fill="none" stroke="#0038B8" strokeWidth="1.6" strokeLinejoin="round">
        <path d="M22 9.5 27.63 19.25H16.37Z" />
        <path d="M22 22.5 27.63 12.75H16.37Z" />
      </g>
    </svg>
  );
}
