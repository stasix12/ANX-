import type { Metadata, Viewport } from 'next';
import { IBM_Plex_Mono } from 'next/font/google';
import { AdsignalBottomNav, AdsignalTopBar } from '@/components/adsignal/Nav';
import './adsignal.css';

const plexMono = IBM_Plex_Mono({
  subsets: ['latin'],
  weight: ['400', '600', '700'],
  variable: '--font-mono',
  display: 'swap',
});

export const metadata: Metadata = {
  title: { default: 'AdSignal', template: '%s · AdSignal' },
  description: 'ניטור מודעות, קריאייטיבים וטרנדים — זיהוי מוקדם של מה שמתחיל לעבוד.',
  robots: { index: false, follow: false },
  appleWebApp: { capable: true, title: 'AdSignal', statusBarStyle: 'black-translucent' },
};

export const viewport: Viewport = {
  themeColor: '#0e1420',
  colorScheme: 'dark',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function AdsignalLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`adsignal ${plexMono.variable}`}>
      <AdsignalTopBar />
      <main className="as-wrap">{children}</main>
      <AdsignalBottomNav />
    </div>
  );
}
