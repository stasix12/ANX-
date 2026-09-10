import type { Metadata, Viewport } from 'next';

/**
 * Customer-facing sales site of the cleaning platform. One national brand:
 * the customer never sees a list of professionals — he orders from us.
 */
export const metadata: Metadata = {
  title: {
    default: 'קלין ישראל — ניקוי ספות, מזרנים ושטיחים עד הבית',
    template: '%s | קלין ישראל',
  },
  description:
    'הזמינו ניקוי ספות, מזרנים, שטיחים ומזגנים מרשת ארצית: מחיר סגור מראש, בעל מקצוע מאומת, אחריות על התוצאה.',
};

export const viewport: Viewport = {
  themeColor: '#0e7490',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function CleanLayout({ children }: { children: React.ReactNode }) {
  return <div className="platform-theme min-h-dvh bg-ink-950">{children}</div>;
}
