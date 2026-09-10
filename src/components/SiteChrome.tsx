'use client';

import { usePathname } from 'next/navigation';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { OrderBar } from '@/components/OrderBar';
import { OrderListProvider } from '@/components/OrderListProvider';

/**
 * The admin panel (/admin), the cleaning-business CRM (/crm) and the
 * sofa-cleaning landing page (/sofa-cleaning) are separate from the
 * storefront — the apps have their own login and nav, and the landing page
 * deliberately has no nav at all so ad traffic stays in the funnel.
 * usePathname() already excludes basePath, so this check works the same on
 * GitHub Pages as it does locally.
 */
export function SiteChrome({ children }: { children: React.ReactNode }) {
  const pathname = usePathname();
  // Segment-exact match: '/pro' must not swallow the store's '/products'.
  const inSegment = (base: string) => pathname === base || pathname?.startsWith(`${base}/`);
  const isStandaloneApp =
    inSegment('/admin') ||
    inSegment('/crm') ||
    inSegment('/sofa-cleaning') ||
    inSegment('/clean') ||
    inSegment('/pro') ||
    inSegment('/hq');

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
