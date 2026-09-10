import type { Metadata, Viewport } from 'next';

/** Professionals app — installable, mobile-first, bottom navigation. */
export const metadata: Metadata = {
  title: {
    default: 'קלין ישראל — בעלי מקצוע',
    template: '%s | קלין ישראל Pro',
  },
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'קלין Pro', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#0e7490',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function ProLayout({ children }: { children: React.ReactNode }) {
  return <div className="platform-theme min-h-dvh bg-ink-950">{children}</div>;
}
