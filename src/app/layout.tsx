import type { Metadata, Viewport } from 'next';
import { Heebo, Roboto } from 'next/font/google';
import { SiteChrome } from '@/components/SiteChrome';
import { site } from '@/lib/site';
import './globals.css';

const heebo = Heebo({
  subsets: ['hebrew', 'latin'],
  display: 'swap',
  variable: '--font-heebo',
});

/*
 * ─── HEEBO HAS NO CYRILLIC. NONE. ────────────────────────────────────────
 *
 * next/font's own data for Heebo lists hebrew, latin, latin-ext, math and
 * symbols — and that is the whole app's typeface. So every Russian letter on
 * every screen was drawn by whatever the browser happened to fall back to:
 * Segoe UI on Windows, Roboto on Android, something else on a Mac. Three
 * platforms, three different designs, and none of them the one this product
 * was drawn in. It is invisible to a layout measurement taken on one machine,
 * which is exactly why it survived until somebody asked which font the
 * Russian was in.
 *
 * ROBOTO IS THE RIGHT ANSWER rather than a convenient one: Heebo IS Roboto's
 * Hebrew sibling — same skeleton, same proportions, built to sit beside it —
 * so Cyrillic in Roboto next to Hebrew in Heebo reads as one typeface.
 *
 * ONLY THE CYRILLIC SUBSET IS ASKED FOR, and that is what makes this free for
 * everybody else: the @font-face carries a unicode-range, so a browser
 * fetches the file only when a Cyrillic letter is actually on the page. A
 * Hebrew-only screen downloads nothing extra, and Latin still comes from
 * Heebo because Heebo is first in the stack.
 */
const roboto = Roboto({
  subsets: ['cyrillic', 'cyrillic-ext'],
  display: 'swap',
  variable: '--font-roboto',
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
  themeColor: '#17191c',
  colorScheme: 'dark',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="he" dir="rtl" className={`${heebo.variable} ${roboto.variable}`}>
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
