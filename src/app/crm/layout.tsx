import type { Metadata, Viewport } from 'next';

/**
 * Segment metadata for the CRM: its own title, the iOS home-screen icon and
 * standalone-app hints, and noindex — this is a private business tool, not a
 * page for search engines.
 */
export const metadata: Metadata = {
  title: 'ניהול עבודות',
  robots: { index: false, follow: false },
  icons: { apple: '/crm/apple-touch-icon.png' },
  appleWebApp: {
    capable: true,
    title: 'ניהול עבודות',
    statusBarStyle: 'black-translucent',
  },
};

export const viewport: Viewport = {
  themeColor: '#17191c',
  colorScheme: 'dark',
  // Fixed scale so form taps don't zoom the layout — the CRM sets 16px+ font
  // sizes on every input, which is what actually prevents iOS auto-zoom.
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function CrmLayout({ children }: { children: React.ReactNode }) {
  return children;
}
