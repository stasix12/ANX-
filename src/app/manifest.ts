import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

/**
 * Web app manifest for the CRM. Installing from any page pins the app to the
 * phone's home screen opening straight into /crm, full-screen (standalone),
 * in Hebrew RTL. Served by Next at /manifest.webmanifest and linked
 * automatically on every page.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'הפתרון המבריק — ניהול עבודות',
    short_name: 'הפתרון המבריק',
    description: 'מערכת ניהול לידים ועבודות של הפתרון המבריק: יומן, לקוחות, סטטוסים והכנסות.',
    id: '/crm',
    start_url: '/crm',
    scope: '/',
    display: 'standalone',
    orientation: 'portrait',
    dir: 'rtl',
    lang: 'he',
    background_color: '#eef2f7',
    theme_color: '#1e40af',
    icons: [
      { src: '/crm/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/crm/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/crm/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
