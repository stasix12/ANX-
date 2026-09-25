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
    /*
     * The app's own palette, not the light theme it was born from.
     * `#eef2f7` painted the standalone splash screen near-white and `#2563eb`
     * is a blue that exists in no token scale here — so the installed app
     * flashed two off-palette colours before the first navy pixel, on the
     * product the owner is told to keep on their home screen. These are
     * ink-950 (the page) and brand-500 (the button surface), the same two the
     * viewport export already declares.
     */
    background_color: '#f7f5ff',
    theme_color: '#7c3aed',
    /*
     * The app's own mark at last: a megaphone on the brand gradient. It was
     * the CRM's sky-blue sofa until now — the code said so and called it a
     * pre-launch requirement rather than a bug, which was right, and this is
     * that requirement met.
     *
     * Flat white geometry on purpose. An icon is read at 48px on a home
     * screen, where anything detailed turns to mush; a silhouette survives.
     */
    icons: [
      { src: '/social/icon-192.png', sizes: '192x192', type: 'image/png' },
      { src: '/social/icon-512.png', sizes: '512x512', type: 'image/png' },
      { src: '/social/icon-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
