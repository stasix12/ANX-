import type { Metadata, Viewport } from 'next';
import { ToastProvider } from '@/components/social/ui';

export const metadata: Metadata = {
  title: 'הפתרון המבריק — ניהול פרסום',
  robots: { index: false, follow: false },
  icons: { apple: '/crm/apple-touch-icon.png' },
  manifest: '/social/manifest.webmanifest',
  appleWebApp: {
    capable: true,
    title: 'פרסום',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#071426',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
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
