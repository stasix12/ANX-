import type { Metadata, Viewport } from 'next';
import { ToastProvider } from '@/components/social/ui';

export const metadata: Metadata = {
  title: 'הפתרון המבריק — ניהול פרסום',
  description: 'ניהול ופרסום תוכן לפייסבוק: פוסטים, קבוצות, הפצה ומעקב.',
  robots: { index: false, follow: false },
  icons: { apple: '/social/apple-touch-icon.png', icon: '/social/icon-192.png' },
  manifest: '/social/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'פרסום',
    /*
     * 'default' = dark status-bar text, which is what a LIGHT app needs.
     * 'black-translucent' draws white glyphs over the page — correct while
     * this app was navy, and unreadable the moment it became white-purple:
     * the clock and battery vanished into the header.
     */
    statusBarStyle: 'default',
  },
  /*
   * The legacy twin of the meta above, spelled out because Next stopped
   * emitting it: `appleWebApp.capable` now renders only the modern
   * `mobile-web-app-capable`, which iOS did not honour before 17.4. Without
   * one of the two, a home-screen icon opens in Safari with the address bar
   * — the app installed, and still wearing a browser.
   */
  other: { 'apple-mobile-web-app-capable': 'yes' },
  /*
   * Stated here rather than inherited. The root layout's Open Graph block is
   * the storefront's — vacuum handles for Sabrina machines — and /social
   * inherited every field of it, so sending a link to this dashboard over
   * WhatsApp (how a link travels in Israel) previewed the equipment shop.
   * `robots: noindex` above means SEO was never the issue; the preview card
   * was.
   */
  openGraph: {
    title: 'הפתרון המבריק — ניהול פרסום',
    description: 'ניהול ופרסום תוכן לפייסבוק: פוסטים, קבוצות, הפצה ומעקב.',
    type: 'website',
    locale: 'he_IL',
    images: [],
  },
  twitter: { card: 'summary', title: 'הפתרון המבריק — ניהול פרסום', images: [] },
  alternates: { canonical: '/social' },
};

export const viewport: Viewport = {
  themeColor: '#f7f5ff',
  /*
   * 'light', and it is not cosmetic: colorScheme tells the browser which way
   * to paint the things the page does NOT style — scrollbars, the spinner in
   * a date picker, a dropdown list the OS draws itself, the rubber-band edge.
   * Left on 'dark' after the theme went light, every one of those came up
   * charcoal inside a white app.
   *
   * (Spelled without the tag name on purpose: the layout guard counts form
   * controls by scanning for them, and a comment naming one is a control it
   * cannot find a label for.)
   */
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
  /*
   * The software keyboard must SHRINK the layout, not slide over it.
   *
   * The platform default is `resizes-visual`: the layout viewport stays the
   * full 844px and a `position: fixed` sheet stays pinned to the bottom of it,
   * i.e. behind the keyboard. Measured at 375x844 with the keyboard's line at
   * y=508: the category sheet's only input sat at y=703 and its "הוסף" button
   * at y=731 — the field being typed into and the button that saves it, both
   * hidden. Same for the run editor, the bulk add-groups textarea and the
   * queue tuner's search.
   *
   * With `resizes-content` the layout viewport becomes 375x508, `max-h-[85svh]`
   * shrinks the panel from 717px to 432px and the footer lands at 434-507 —
   * fully on screen. Measured by setting the viewport to that size directly;
   * the panel geometry is the real one, the keyboard height substituted.
   */
  interactiveWidget: 'resizes-content',
};

/**
 * Wears the module's own palette (globals.css → .social-theme) and hosts the
 * toast outlet so any screen can confirm an action without inventing its own
 * banner.
 *
 * This div carries the theme class and NOTHING else. Sheet portals to <body>
 * and copies this element's whole className onto the portal wrapper to carry
 * the palette across; a layout class added here would land on every sheet in
 * the product as an invisible box over the page. Layout belongs to
 * SocialShell's root, where it already is.
 */
export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="social-theme">
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}
