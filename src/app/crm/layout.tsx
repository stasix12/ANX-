import type { Metadata, Viewport } from 'next';

/**
 * Segment metadata for the CRM: its own title, the iOS home-screen icon and
 * standalone-app hints, and noindex — this is a private business tool, not a
 * page for search engines.
 */
export const metadata: Metadata = {
  title: 'הפתרון המבריק — ניהול עבודות',
  robots: { index: false, follow: false },
  icons: { apple: '/crm/apple-touch-icon.png' },
  appleWebApp: {
    capable: true,
    title: 'הפתרון המבריק',
    // Fullscreen with white status-bar text — it sits over the header's blue
    // gradient, which pads itself with env(safe-area-inset-top).
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  // The header gradient's sky blue, so the phone's status bar blends into it.
  themeColor: '#1e40af',
  colorScheme: 'light',
  // Fixed scale so form taps don't zoom the layout — the CRM sets 16px+ font
  // sizes on every input, which is what actually prevents iOS auto-zoom.
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  // .crm-theme rescopes the brand-* tokens to the CRM's blue (globals.css).
  return <div className="crm-theme">{children}</div>;
}
