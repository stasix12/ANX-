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
  themeColor: '#2563eb',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/**
 * Reuses the CRM's light theme tokens (globals.css → .crm-theme), and hosts
 * the toast outlet so any screen can confirm an action without inventing its
 * own banner.
 */
export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="crm-theme">
      <ToastProvider>{children}</ToastProvider>
    </div>
  );
}
