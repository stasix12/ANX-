import type { Metadata, Viewport } from 'next';
import { AnalyticsScripts } from '@/components/hamavrik/AnalyticsScripts';
import { Footer } from '@/components/hamavrik/Footer';
import { Header } from '@/components/hamavrik/Header';
import { JsonLd, localBusinessSchema } from '@/components/hamavrik/JsonLd';
import { StickyCta } from '@/components/hamavrik/StickyCta';
import { VisitBeacon } from '@/components/hamavrik/VisitBeacon';
import { business } from '@/lib/hamavrik/config';
import { absoluteUrl } from '@/lib/hamavrik/links';

/**
 * "הפתרון המבריק" – the sofa-cleaning business site. Its own light premium
 * theme, header, footer and sticky CTAs; the storefront chrome at / is
 * bypassed by SiteChrome for this segment. Every page under here inherits
 * the LocalBusiness JSON-LD, the analytics tags and the title template.
 */
export const metadata: Metadata = {
  title: {
    default: `ניקוי ספות מקצועי בבית הלקוח | ${business.name}`,
    template: `%s | ${business.name}`,
  },
  description:
    'ניקוי ספות מקצועי בבית הלקוח בבאר שבע, ערד ודרום הארץ. ציוד מתקדם, טיפול בכתמים וריחות, ניקוי עמוק וייבוש מהיר – החל מ-299 ₪. שלחו תמונה ב‑WhatsApp וקבלו הצעת מחיר.',
  keywords: [
    'ניקוי ספות',
    'ניקוי ספות באר שבע',
    'ניקוי ספות ערד',
    'ניקוי מזרנים',
    'ניקוי ריפודי רכב',
    'ניקוי שטיחים',
    'ניקוי כורסאות',
    'ניקוי ספות בבית הלקוח',
    'הפתרון המבריק',
  ],
  alternates: { canonical: absoluteUrl('/') },
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    siteName: business.name,
    url: absoluteUrl('/'),
    title: `ניקוי ספות מקצועי בבית הלקוח | ${business.name}`,
    description:
      'ציוד מתקדם, טיפול בכתמים וריחות, ניקוי עמוק – החל מ-299 ₪. שלחו תמונה ב‑WhatsApp וקבלו הצעת מחיר.',
  },
  twitter: {
    card: 'summary_large_image',
    title: `ניקוי ספות מקצועי בבית הלקוח | ${business.name}`,
    description: 'שלחו לנו תמונה של הספה ב‑WhatsApp וקבלו הצעת מחיר. באר שבע, ערד והדרום.',
  },
  robots: { index: true, follow: true },
  // The sofa mark from the real logo, as plain files under /public: a
  // file-based icon in this segment was silently dropped once `icons` was
  // set here, and the static host serves /public as-is.
  icons: {
    icon: [{ url: '/hamavrik/favicon.png', type: 'image/png', sizes: '256x256' }],
    apple: '/hamavrik/apple-touch-icon.png',
  },
};

export const viewport: Viewport = {
  themeColor: '#f5f8fc',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function ShineLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="shine-theme relative min-h-dvh overflow-x-clip bg-ink-950 text-mist-100 pb-[calc(4.5rem+env(safe-area-inset-bottom,0px))] sm:pb-0">
      <JsonLd data={localBusinessSchema()} />
      <Header />
      {children}
      <Footer />
      <StickyCta />
      <AnalyticsScripts />
      <VisitBeacon />
    </div>
  );
}
