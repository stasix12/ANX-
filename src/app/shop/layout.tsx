import type { Metadata, Viewport } from 'next';

/**
 * ANX3D — 3D-printed models store. A standalone app under /shop with its own
 * chrome (SiteChrome steps aside), tokens (x-* in globals.css) and data layer
 * (src/lib/shop). The cleaning-equipment store at / is untouched.
 */
export const metadata: Metadata = {
  title: {
    default: 'ANX3D — מודלים תלת מימד שמדפיסים בבית',
    template: '%s | ANX3D',
  },
  description:
    'חנות ANX3D: דמויות, דרקונים גמישים, מעמדים, אביזרי גיימינג, עיצוב לבית וקבצי STL — מודפסים בתלת ממד באיכות גבוהה.',
  alternates: { canonical: '/shop' },
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: 'ANX3D',
    title: 'ANX3D — מודלים תלת מימד שמדפיסים בבית',
    description: 'עיצובים ייחודיים, איכות גבוהה, לכל הרמות והמדפסות.',
  },
};

export const viewport: Viewport = {
  themeColor: '#ffffff',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function ShopLayout({ children }: { children: React.ReactNode }) {
  return <div className="shop-theme min-h-dvh overflow-x-clip">{children}</div>;
}
