import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import { SiteChrome } from '@/components/SiteChrome';
import { site } from '@/lib/site';
import './globals.css';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  display: 'swap',
  variable: '--font-heebo',
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: {
    default: `${site.name} — ציוד ושדרוגים למכונות Sabrina`,
    template: `%s | ${site.name}`,
  },
  description: site.description,
  keywords: [
    'ANX3D',
    'ניקוי ספות',
    'ניקוי ריפודים',
    'Sabrina',
    'ידית שאיבה',
    'צינור שאיבה',
    'מתאם למכונת ניקוי',
    'ציוד לניקוי ריפודים',
  ],
  alternates: { canonical: '/' },
  openGraph: {
    type: 'website',
    locale: 'he_IL',
    url: site.url,
    siteName: site.name,
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
  },
  twitter: {
    card: 'summary_large_image',
    title: `${site.name} — ${site.tagline}`,
    description: site.description,
  },
  robots: { index: true, follow: true },
};

export const viewport: Viewport = {
  themeColor: '#f2fafb',
  colorScheme: 'light',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <body className="min-h-dvh bg-ink-950 font-sans antialiased">
        <div aria-hidden className="site-backdrop">
          <span className="site-backdrop-glow" />
        </div>
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:absolute focus:top-4 focus:start-4 focus:z-100 focus:rounded-lg focus:bg-brand-500 focus:px-5 focus:py-3 focus:font-bold focus:text-on-brand"
        >
          דילוג לתוכן הראשי
        </a>
        <SiteChrome>{children}</SiteChrome>
      </body>
    </html>
  );
}
