import type { MetadataRoute } from 'next';

export const dynamic = 'force-static';

/**
 * Web app manifest for the publishing app. Installing from any /social page
 * pins "הפתרון המבריק — פרסום" to the phone's home screen, opening straight
 * into the dashboard full-screen (standalone), Hebrew RTL.
 */
export default function manifest(): MetadataRoute.Manifest {
  return {
    name: 'הפתרון המבריק — פרסום',
    short_name: 'פרסום',
    description: 'ניהול ופרסום תוכן לפייסבוק: פוסטים, קבוצות, הפצה ומעקב.',
    id: '/social',
    start_url: '/social',
    scope: '/social',
    display: 'standalone',
    orientation: 'portrait',
    dir: 'rtl',
    lang: 'he',
    background_color: '#eef2f7',
    theme_color: '#2563eb',
    icons: [
      { src: '/crm/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/crm/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/crm/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
