'use client';

import { usePathname } from 'next/navigation';
import { useEffect } from 'react';
import { beaconEnabled, sendHit } from '@/lib/hamavrik/beacon';

/** One "view" per page, then a heartbeat every 30s while the tab is visible –
 *  that heartbeat is what "on the site right now" in /admin counts. */
export function VisitBeacon() {
  const pathname = usePathname();

  useEffect(() => {
    if (!beaconEnabled()) return;
    sendHit('view');
  }, [pathname]);

  useEffect(() => {
    if (!beaconEnabled()) return;
    const tick = () => {
      if (document.visibilityState === 'visible') sendHit('ping');
    };
    const id = window.setInterval(tick, 30_000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      window.clearInterval(id);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  return null;
}
