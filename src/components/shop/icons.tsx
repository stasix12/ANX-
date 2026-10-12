import type { SVGProps } from 'react';
import type { CategoryIcon } from '@/lib/shop/types';

/**
 * Line icons of the ANX3D storefront — 24px grid, 1.8 stroke, round caps,
 * matching the thin outline set in the design reference.
 */
type P = SVGProps<SVGSVGElement> & { size?: number; filled?: boolean };

function Base({ size = 24, children, filled: _filled, ...rest }: P & { children: React.ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  );
}

export const IconMenu = (p: P) => (
  <Base {...p}>
    <path d="M4 7h16M4 12h16M4 17h16" />
  </Base>
);
export const IconSearch = (p: P) => (
  <Base {...p}>
    <circle cx="11" cy="11" r="6.5" />
    <path d="m20 20-4.2-4.2" />
  </Base>
);
export const IconCart = (p: P) => (
  <Base {...p}>
    <path d="M3 4h2.2l2.1 10.2a1.6 1.6 0 0 0 1.6 1.3h8.3a1.6 1.6 0 0 0 1.6-1.2L20.5 8H6.1" />
    <circle cx="9.5" cy="19.5" r="1.3" />
    <circle cx="17" cy="19.5" r="1.3" />
  </Base>
);
export const IconHeart = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Base {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M12 20s-7.5-4.6-7.5-10.2A4.3 4.3 0 0 1 12 7.2a4.3 4.3 0 0 1 7.5 2.6C19.5 15.4 12 20 12 20Z" />
  </Base>
);
export const IconHome = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Base {...p} fill={filled ? 'currentColor' : 'none'}>
    <path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4.5v-5.5h-5V20H5a1 1 0 0 1-1-1v-8.5Z" />
  </Base>
);
export const IconGrid = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Base {...p} fill={filled ? 'currentColor' : 'none'}>
    <rect x="4" y="4" width="6.5" height="6.5" rx="1.6" />
    <rect x="13.5" y="4" width="6.5" height="6.5" rx="1.6" />
    <rect x="4" y="13.5" width="6.5" height="6.5" rx="1.6" />
    <rect x="13.5" y="13.5" width="6.5" height="6.5" rx="1.6" />
  </Base>
);
export const IconUser = ({ filled, ...p }: P & { filled?: boolean }) => (
  <Base {...p} fill={filled ? 'currentColor' : 'none'}>
    <circle cx="12" cy="8" r="3.8" />
    <path d="M4.5 20c.6-3.8 3.6-6 7.5-6s6.9 2.2 7.5 6Z" />
  </Base>
);
export const IconChevron = ({ dir = 'left', ...p }: P & { dir?: 'left' | 'right' | 'down' | 'up' }) => {
  const d = { left: 'm14.5 6-6 6 6 6', right: 'm9.5 6 6 6-6 6', down: 'm6 9.5 6 6 6-6', up: 'm6 14.5 6-6 6 6' }[dir];
  return (
    <Base {...p}>
      <path d={d} />
    </Base>
  );
};
export const IconArrow = ({ dir = 'left', ...p }: P & { dir?: 'left' | 'right' }) => (
  <Base {...p}>
    {dir === 'left' ? <path d="M19 12H5m6-6-6 6 6 6" /> : <path d="M5 12h14m-6-6 6 6-6 6" />}
  </Base>
);
export const IconClose = (p: P) => (
  <Base {...p}>
    <path d="M6 6l12 12M18 6 6 18" />
  </Base>
);
export const IconTrash = (p: P) => (
  <Base {...p}>
    <path d="M4.5 7h15M10 11v6M14 11v6M6.5 7l.8 11.2A2 2 0 0 0 9.3 20h5.4a2 2 0 0 0 2-1.8L17.5 7M9.5 7V5a1 1 0 0 1 1-1h3a1 1 0 0 1 1 1v2" />
  </Base>
);
export const IconMinus = (p: P) => (
  <Base {...p}>
    <path d="M6 12h12" />
  </Base>
);
export const IconPlus = (p: P) => (
  <Base {...p}>
    <path d="M12 6v12M6 12h12" />
  </Base>
);
export const IconFilter = (p: P) => (
  <Base {...p}>
    <path d="M4 7h10M18 7h2M4 17h4M12 17h8" />
    <circle cx="16" cy="7" r="2" />
    <circle cx="10" cy="17" r="2" />
  </Base>
);
export const IconCheck = (p: P) => (
  <Base {...p}>
    <path d="m5 12.5 4.5 4.5L19 7.5" />
  </Base>
);
export const IconTruck = (p: P) => (
  <Base {...p}>
    <path d="M3 6.5h11v9H3zM14 9.5h3.6l3 3.2v2.8H14" />
    <circle cx="7" cy="17.5" r="1.8" />
    <circle cx="17.5" cy="17.5" r="1.8" />
  </Base>
);
export const IconShield = (p: P) => (
  <Base {...p}>
    <path d="M12 3.5 19 6v5.5c0 4.3-3 7.6-7 9-4-1.4-7-4.7-7-9V6l7-2.5Z" />
    <path d="m9 12 2.2 2.2L15.5 10" />
  </Base>
);
export const IconBox = (p: P) => (
  <Base {...p}>
    <path d="m12 3 8 4.3v9.4L12 21l-8-4.3V7.3L12 3Z" />
    <path d="m4 7.3 8 4.4 8-4.4M12 11.7V21" />
  </Base>
);
export const IconPin = (p: P) => (
  <Base {...p}>
    <path d="M12 21s-6.5-5.6-6.5-11a6.5 6.5 0 0 1 13 0c0 5.4-6.5 11-6.5 11Z" />
    <circle cx="12" cy="10" r="2.3" />
  </Base>
);
export const IconCardId = (p: P) => (
  <Base {...p}>
    <rect x="3.5" y="5" width="17" height="14" rx="2" />
    <circle cx="9" cy="11" r="2" />
    <path d="M6 16c.5-1.5 1.6-2.2 3-2.2s2.5.7 3 2.2M14.5 10h3M14.5 13h3" />
  </Base>
);
export const IconBell = (p: P) => (
  <Base {...p}>
    <path d="M6 16.5V11a6 6 0 0 1 12 0v5.5l1.5 1.5h-15L6 16.5ZM10 20.5h4" />
  </Base>
);
export const IconGear = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="3" />
    <path d="M12 2.8v2.4M12 18.8v2.4M21.2 12h-2.4M5.2 12H2.8M18.5 5.5l-1.7 1.7M7.2 16.8l-1.7 1.7M18.5 18.5l-1.7-1.7M7.2 7.2 5.5 5.5" />
  </Base>
);
export const IconOrders = (p: P) => (
  <Base {...p}>
    <path d="M6 3.5h12v17l-3-2-3 2-3-2-3 2v-17Z" />
    <path d="M9 8.5h6M9 12h6" />
  </Base>
);
export const IconLogout = (p: P) => (
  <Base {...p}>
    <path d="M14 4h4a1 1 0 0 1 1 1v14a1 1 0 0 1-1 1h-4M10 8l-4 4 4 4M6 12h9" />
  </Base>
);
export const IconLock = (p: P) => (
  <Base {...p}>
    <rect x="5" y="10.5" width="14" height="10" rx="2" />
    <path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" />
  </Base>
);
export const IconClock = (p: P) => (
  <Base {...p}>
    <circle cx="12" cy="12" r="8" />
    <path d="M12 7.5V12l3 2" />
  </Base>
);
export const IconWallet = (p: P) => (
  <Base {...p}>
    <rect x="3.5" y="6" width="17" height="13" rx="2" />
    <path d="M3.5 10h17M7 15h3" />
  </Base>
);
export const IconUpload = (p: P) => (
  <Base {...p}>
    <path d="M12 16V5m-4.5 4.5L12 5l4.5 4.5M5 15v3.5a1.5 1.5 0 0 0 1.5 1.5h11a1.5 1.5 0 0 0 1.5-1.5V15" />
  </Base>
);
export const IconEdit = (p: P) => (
  <Base {...p}>
    <path d="M4.5 19.5h4l10-10-4-4-10 10v4ZM13 7l4 4" />
  </Base>
);
export const IconStar = ({ amount = 1, ...p }: Omit<P, 'fill'> & { amount?: number }) => {
  const id = `st${Math.round(amount * 100)}`;
  return (
    <svg width={p.size ?? 12} height={p.size ?? 12} viewBox="0 0 24 24" aria-hidden="true" className={p.className}>
      <defs>
        <linearGradient id={id} x1="1" x2="0" y1="0" y2="0">
          {/* RTL: stars fill from the right. */}
          <stop offset={`${amount * 100}%`} stopColor="currentColor" />
          <stop offset={`${amount * 100}%`} stopColor="#d6dbe6" />
        </linearGradient>
      </defs>
      <path
        fill={`url(#${id})`}
        d="m12 2.8 2.8 5.8 6.3.9-4.6 4.4 1.1 6.3L12 17.2l-5.6 3 1.1-6.3-4.6-4.4 6.3-.9L12 2.8Z"
      />
    </svg>
  );
};

/* Category glyphs for the round chips on the home page. */
export function CategoryGlyph({ icon, ...p }: P & { icon: CategoryIcon }) {
  switch (icon) {
    case 'all':
      return (
        <Base {...p}>
          <path d="m12 3 8 4.5v9L12 21l-8-4.5v-9L12 3Z" />
          <path d="m4 7.5 8 4.5 8-4.5M12 12v9" />
        </Base>
      );
    case 'handle':
      // Upholstery tool: grip with trigger and a clear nozzle head.
      return (
        <Base {...p}>
          <path d="M3 9.5 13 6.5l1.5 3-9 3.2" />
          <path d="M8.5 11.5 7 16.5H4.5L6 11.9" />
          <path d="M13 6.5 17 9l-1 2.5 4.5 6H13l1-6.5" />
        </Base>
      );
    case 'wand':
      // Carpet wand: shaft into a wide floor head.
      return (
        <Base {...p}>
          <path d="M12 3v10" />
          <path d="M9.5 13h5l5.5 5H4l5.5-5Z" />
          <path d="M6 20.5h12" />
        </Base>
      );
    case 'adapter':
      // Pipe fitting: two diameters joined.
      return (
        <Base {...p}>
          <rect x="3.5" y="8" width="7" height="8" rx="1.5" />
          <rect x="10.5" y="6" width="10" height="12" rx="2" />
          <path d="M14 6v12M17 6v12" />
        </Base>
      );
    case 'suction':
      // Narrow suction nozzle.
      return (
        <Base {...p}>
          <path d="M5 20 19 6" />
          <path d="M15 4l5 5-3 1.5-3.5-3.5L15 4Z" />
          <path d="M4 21l2.5-.5L5.5 19.5 4 21Z" />
        </Base>
      );
    case 'parts':
      return (
        <Base {...p}>
          <circle cx="12" cy="12" r="3" />
          <path d="M12 3v3M12 18v3M3 12h3M18 12h3M5.6 5.6l2.1 2.1M16.3 16.3l2.1 2.1M5.6 18.4l2.1-2.1M16.3 7.7l2.1-2.1" />
        </Base>
      );
    case 'accessory':
      // Pump box.
      return (
        <Base {...p}>
          <rect x="4" y="8" width="16" height="12" rx="2" />
          <path d="M9 8V5.5h6V8M8 14h2M14 14h2" />
        </Base>
      );
  }
}
