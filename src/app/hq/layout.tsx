import type { Metadata, Viewport } from 'next';

/** HQ — sales CRM, dispatch monitor and owner dashboard. Internal tool. */
export const metadata: Metadata = {
  title: {
    default: 'קלין ישראל HQ',
    template: '%s | קלין HQ',
  },
  robots: { index: false, follow: false },
};

export const viewport: Viewport = {
  themeColor: '#0e7490',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function HqLayout({ children }: { children: React.ReactNode }) {
  return <div className="platform-theme min-h-dvh bg-ink-950">{children}</div>;
}
