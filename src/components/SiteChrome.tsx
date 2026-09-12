'use client';

import dynamic from 'next/dynamic';
import { usePathname } from 'next/navigation';
import { Footer } from '@/components/Footer';
import { Header } from '@/components/Header';
import { OrderListProvider } from '@/components/OrderListProvider';

/*
 * Loaded on demand rather than imported statically. OrderBar pulls in
 * lib/order → lib/products → @supabase/supabase-js — 62KB gzipped of database
 * client that every page in this repository was shipping, including the
 * sofa-cleaning landing pages, which never render an order bar and have no
 * database. Splitting it here takes that weight off them without moving a
 * single file, URL or piece of metadata; the store is unchanged except that
 * the bar arrives one chunk later, and it is fixed-position, so nothing moves.
 */
const OrderBar = dynamic(() => import('@/components/OrderBar').then((m) => m.OrderBar));

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
