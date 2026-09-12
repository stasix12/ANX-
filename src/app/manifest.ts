import type { MetadataRoute } from 'next';
import { business, STANDALONE } from '@/lib/hamavrik/config';

export const dynamic = 'force-static';

/**
 * On its own domain the cleaning site gets its own manifest — the one below
 * would otherwise install a shortcut straight into the CRM, on a site whose
 * visitors are customers, not the business.
 */
function cleaningManifest(): MetadataRoute.Manifest {
  return {
    name: `${business.name} — ניקוי ספות עד הבית`,
    short_name: business.name,
    description: business.tagline,
    id: '/',
    start_url: '/',
    scope: '/',
    display: 'browser',
    dir: 'rtl',
    lang: 'he',
    background_color: '#f5f8fc',
    theme_color: '#1a56db',
    icons: [
      { src: '/hamavrik/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/hamavrik/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/hamavrik/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}

/**
 * Web app manifest for the CRM. Installing from any page pins the app to the
 * phone's home screen opening straight into /crm, full-screen (standalone),
 * in Hebrew RTL. Served by Next at /manifest.webmanifest and linked
 * automatically on every page.
 */
export default function manifest(): MetadataRoute.Manifest {
  if (STANDALONE) return cleaningManifest();
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
    theme_color: '#0284c7',
    icons: [
      { src: '/crm/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/crm/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/crm/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
