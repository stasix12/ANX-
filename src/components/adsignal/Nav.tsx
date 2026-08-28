'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

const ITEMS = [
  { href: '/adsignal', label: 'דשבורד', ico: '📊', exact: true },
  { href: '/adsignal/ads', label: 'מודעות', ico: '🔎' },
  { href: '/adsignal/israel', label: 'ישראל', ico: '🇮🇱' },
  { href: '/adsignal/opportunities', label: 'הזדמנויות', ico: '💎' },
  { href: '/adsignal/alerts', label: 'התראות', ico: '🔔' },
];

const TOP_EXTRA = [
  { href: '/adsignal/import', label: '＋ ייבוא' },
  { href: '/adsignal/offers', label: 'Offers' },
  { href: '/adsignal/clusters', label: 'Clusters' },
  { href: '/adsignal/competitors', label: 'מתחרים' },
  { href: '/adsignal/status', label: 'חיבורים' },
];

function isOn(pathname: string | null, href: string, exact?: boolean): boolean {
  if (!pathname) return false;
  return exact ? pathname === href : pathname.startsWith(href);
}

export function AdsignalTopBar() {
  const pathname = usePathname();
  return (
    <header className="as-topbar">
      <Link href="/adsignal" className="as-logo">
        Ad<span>Signal</span>
      </Link>
      <nav className="as-topnav">
        {ITEMS.map((item) => (
          <Link key={item.href} href={item.href} className={isOn(pathname, item.href, item.exact) ? 'on' : ''}>
            {item.label}
          </Link>
        ))}
        {TOP_EXTRA.map((item) => (
          <Link key={item.href} href={item.href} className={isOn(pathname, item.href) ? 'on' : ''}>
            {item.label}
          </Link>
        ))}
      </nav>
    </header>
  );
}

export function AdsignalBottomNav() {
  const pathname = usePathname();
  return (
    <nav className="as-bottomnav" aria-label="ניווט ראשי">
      {ITEMS.map((item) => (
        <Link key={item.href} href={item.href} className={isOn(pathname, item.href, item.exact) ? 'on' : ''}>
          <span className="ico" aria-hidden>{item.ico}</span>
          {item.label}
        </Link>
      ))}
    </nav>
  );
}
