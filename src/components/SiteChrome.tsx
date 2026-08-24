'use client';

import { usePathname } from 'next/navigation';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { OrderBar } from '@/components/OrderBar';
import { OrderListProvider } from '@/components/OrderListProvider';

/**
 * The admin panel is a separate app living under /admin — its own login,
 * its own nav, nothing about the public storefront's chrome belongs there.
 * usePathname() already excludes basePath, so this check works the same on
 * GitHub Pages as it does locally.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isAdmin = pathname?.startsWith('/admin');

  if (isAdmin) return <main id="main">{children}</main>;

  return (
    <OrderListProvider>
      <Header />
      {/* Bottom padding clears the order bar, which is fixed over the page. */}
      <main id="main" className="pb-24">
        {children}
      </main>
      <Footer />
      <OrderBar />
    </OrderListProvider>
  );
}
