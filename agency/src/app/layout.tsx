import type { Metadata, Viewport } from 'next';
import { Heebo } from 'next/font/google';
import { noIndex, site } from '@/config/site';
import { nav, seo } from '@/content/copy';
import { analyticsIds } from '@/lib/analytics';
import { brand, homeOpenGraph, homeTitle, homeTwitter } from '@/lib/metadata';
import { Analytics, GtmNoScript } from '@/components/layout/Analytics';
import { FloatingWhatsApp } from '@/components/layout/FloatingWhatsApp';
import { Footer } from '@/components/layout/Footer';
import { Header } from '@/components/layout/Header';
import { SectionObserver } from '@/components/layout/SectionObserver';
import { StickyBar } from '@/components/layout/StickyBar';
import './globals.css';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  display: 'swap',
  variable: '--font-heebo',
});

export const metadata: Metadata = {
  metadataBase: new URL(site.url),
  title: { default: homeTitle, template: brand ? `%s | ${brand}` : '%s' },
  description: seo.description,
  applicationName: brand || undefined,
  openGraph: homeOpenGraph,
  twitter: homeTwitter,
  robots: noIndex
    ? { index: false, follow: false }
    : {
        index: true,
        follow: true,
        googleBot: {
          index: true,
          follow: true,
          'max-image-preview': 'large',
          'max-snippet': -1,
          'max-video-preview': -1,
        },
      },
  verification: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION
    ? { google: process.env.NEXT_PUBLIC_GOOGLE_SITE_VERIFICATION }
    : undefined,
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  themeColor: '#0b1220',
  colorScheme: 'dark',
};

const hasGoogleTags = Boolean(analyticsIds.gtm || analyticsIds.ga4 || analyticsIds.gadsId);

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={heebo.variable}>
      <head>
        {hasGoogleTags ? <link rel="preconnect" href="https://www.googletagmanager.com" /> : null}
        {analyticsIds.metaPixel ? <link rel="preconnect" href="https://connect.facebook.net" /> : null}
      </head>
      <body className="min-h-dvh bg-base font-sans text-fg antialiased">
        <GtmNoScript />
        <a
          href="#main"
          className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:start-3 focus:z-[100] focus:rounded-[var(--radius-md)] focus:bg-accent-strong focus:px-5 focus:py-3 focus:font-semibold focus:text-white"
        >
          {nav.skip}
        </a>
        <Header />
        <main id="main" tabIndex={-1} className="outline-none">
          {children}
        </main>
        <div style={{ paddingBottom: 'var(--sticky-bar-space)' }}>
          <Footer />
        </div>
        <StickyBar />
        <FloatingWhatsApp />
        <SectionObserver />
        <Analytics />
      </body>
    </html>
  );
}
