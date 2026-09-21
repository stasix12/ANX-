'use client';

import { useEffect, useState } from 'react';

/**
 * "A new version is live — tap to load it."
 *
 * iOS Safari holds a statically rendered page for a long time, so a deploy can
 * land and the owner still sees yesterday's screen, with nothing to tell them
 * apart a fix that shipped from one that did not work. This asks the server
 * what build it is on and says so, rather than leaving them to guess or to
 * learn about cache-busting query strings.
 *
 * Silent unless the two genuinely differ: a failed fetch (offline, mid-deploy)
 * changes nothing on screen.
 */
const CHECK_EVERY_MS = 90_000;

export function UpdateBanner() {
  const mine = process.env.NEXT_PUBLIC_BUILD_STAMP ?? '';
  const [live, setLive] = useState('');

  useEffect(() => {
    if (!mine) return;
    let alive = true;
    const check = async () => {
      try {
        const res = await fetch('/api/version', { cache: 'no-store' });
        if (!res.ok) return;
        const data = (await res.json()) as { build?: string };
        if (alive && data.build) setLive(data.build);
      } catch {
        // Offline or mid-deploy. Nothing to say, so say nothing.
      }
    };
    check();
    const id = setInterval(check, CHECK_EVERY_MS);
    return () => {
      alive = false;
      clearInterval(id);
    };
  }, [mine]);

  if (!mine || !live || live === mine) return null;

  return (
    <button
      type="button"
      onClick={() => window.location.reload()}
      className="flex min-h-11 w-full items-center justify-center gap-2 bg-brand-500 px-4 text-sm font-bold text-on-brand"
    >
      <span>יש גרסה חדשה של המערכת — הקישו לטעינה</span>
      <span dir="ltr" className="font-mono text-xs opacity-80">
        {live}
      </span>
    </button>
  );
}
