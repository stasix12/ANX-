import type { Metadata, Viewport } from 'next';

export const metadata: Metadata = {
  title: 'הפתרון המבריק — ניהול פרסום',
  robots: { index: false, follow: false },
  icons: { apple: '/crm/apple-touch-icon.png' },
};

export const viewport: Viewport = {
  themeColor: '#2563eb',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

/** Reuses the CRM's light theme tokens (globals.css → .crm-theme). */
export default function SocialLayout({ children }: { children: React.ReactNode }) {
  return <div className="crm-theme">{children}</div>;
}
