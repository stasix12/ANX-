'use client';

import { usePathname } from 'next/navigation';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { OrderBar } from '@/components/OrderBar';
import { OrderListProvider } from '@/components/OrderListProvider';

/**
 * The admin panel (/admin), the cleaning-business CRM (/crm) and the trading
 * dashboard (/trading) are separate apps — each has its own login and nav,
 * and nothing about the public storefront's chrome belongs in any of them.
 * usePathname() already excludes basePath, so this check works the same on
 * GitHub Pages as it does locally.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStandaloneApp =
    pathname?.startsWith('/admin') || pathname?.startsWith('/crm') || pathname?.startsWith('/trading');

  if (isStandaloneApp) return <main id="main">{children}</main>;

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
