'use client';

import { usePathname } from 'next/navigation';
import { DEFAULT_SERVICES } from '@/lib/market/services';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { OrderBar } from '@/components/OrderBar';
import { OrderListProvider } from '@/components/OrderListProvider';

/**
 * The admin panel (/admin), the cleaning-business CRM (/crm), the
 * sofa-cleaning landing page (/sofa-cleaning) and the marketplace
 * (/market + /pro, which carries its own light-themed chrome) are separate
 * from the storefront — the apps have their own login and nav, and the
 * landing page deliberately has no nav at all so ad traffic stays in the
 * funnel. usePathname() already excludes basePath, so this check works the
 * same on GitHub Pages as it does locally.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  const isStandaloneApp =
    pathname?.startsWith('/admin') ||
    pathname?.startsWith('/crm') ||
    pathname?.startsWith('/sofa-cleaning') ||
    pathname?.startsWith('/market') ||
    // Careful: '/products' also starts with '/pro', so match the segment.
    pathname === '/pro' ||
    pathname?.startsWith('/pro/') ||
    // Marketplace SEO pages: /<service-slug>/<city> (e.g. /mattress-cleaning/arad).
    DEFAULT_SERVICES.some((s) => pathname?.startsWith(`/${s.id}/`));

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
