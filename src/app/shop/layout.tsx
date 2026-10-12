import type { Metadata, Viewport } from 'next';

/**
 * ANX3D — professional upholstery/carpet cleaning accessories, 3D printed. A standalone app under /shop with its own
 * chrome (SiteChrome steps aside), tokens (x-* in globals.css) and data layer
 * (src/lib/shop). The cleaning-equipment store at / is untouched.
 */
export const metadata: Metadata = {
  title: {
    default: 'ANX3D — הדור הבא של ציוד הניקוי המקצועי',
    template: '%s | ANX3D',
  },
  description:
    'ANX3D: ידיות לניקוי ספות, טולים לניקוי שטיחים, מתאמים, מחברים ואביזרי שאיבה לאנשי מקצוע — מיוצרים בהדפסת תלת־ממד.',
  alternates: { canonical: '/shop' },
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: 'ANX3D',
    title: 'ANX3D — הדור הבא של ציוד הניקוי המקצועי',
    description: 'אביזרים חדשניים לניקוי ספות ושטיחים, המיוצרים בטכנולוגיית הדפסת תלת־ממד.',
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
