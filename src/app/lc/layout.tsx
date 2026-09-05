import type { Metadata, Viewport } from 'next';
import { Inter } from 'next/font/google';
import { LcProvider } from '@/lib/lc/context';
import { ToastProvider } from '@/components/lc/ui/toast';

const inter = Inter({ subsets: ['latin', 'cyrillic'], display: 'swap', variable: '--font-inter' });

export const metadata: Metadata = {
  title: { default: 'LeadCloser AI', template: '%s · LeadCloser AI' },
  description: 'Turn incoming leads into booked jobs automatically.',
  robots: { index: false, follow: false },
  manifest: '/lc/manifest.webmanifest',
  icons: { icon: '/lc/icon.svg', apple: '/lc/icon.svg' },
  appleWebApp: { capable: true, title: 'LeadCloser', statusBarStyle: 'default' },
};

export const viewport: Viewport = {
  themeColor: '#f6f7fb',
  colorScheme: 'light',
  width: 'device-width',
  initialScale: 1,
  viewportFit: 'cover',
};

export default function LcLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className={`lc-theme ${inter.variable} min-h-dvh`}>
      <ToastProvider>
        <LcProvider>{children}</LcProvider>
      </ToastProvider>
    </div>
  );
}
