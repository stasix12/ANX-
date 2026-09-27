'use client';

import { usePathname, useRouter } from 'next/navigation';
import { useEffect } from 'react';
import { SpinnerIcon } from '@/components/icons';
import { useSocialSession } from '@/lib/social/auth';

/**
 * Sends somebody who is not signed in to the door instead of to an empty room.
 *
 * NOT A SECURITY BOUNDARY, and it matters that this is understood. Row-level
 * security is: since v16 every table is scoped to the businesses the signed-in
 * user belongs to, so an anonymous visitor already reads zero rows. What they
 * got was a full dashboard rendering zeroes, with no way to sign in anywhere
 * on the screen — a product that looks broken rather than one that looks
 * locked. This fixes the second thing only. If this file were deleted, the
 * screens would render for a stranger and still show them nothing.
 *
 * WHICH WAY IT FAILS. While the session is still resolving it shows a spinner
 * rather than the page, because flashing a dashboard and then yanking it is
 * worse than a beat of waiting. And it redirects only once resolution is
 * FINISHED — `loading` false and `session` null — so a slow network is never
 * mistaken for a logged-out person and nobody is thrown out mid-read.
 *
 * `next` is carried so a link into a deep screen survives the detour, and it
 * is checked to start with /social on the way back out: an open redirect is
 * the classic way this exact three-line component becomes a vulnerability.
 */
export function SocialGate({ children }: { children: React.ReactNode }) {
  const { session, loading } = useSocialSession();
  const pathname = usePathname();
  const router = useRouter();
  /* The door itself is never guarded, or there is nowhere to knock. */
  const open = pathname === '/social/login';

  useEffect(() => {
    if (open || loading || session) return;
    const next = pathname && pathname !== '/social' ? `?next=${encodeURIComponent(pathname)}` : '';
    router.replace(`/social/login${next}`);
  }, [open, loading, session, pathname, router]);

  if (open) return <>{children}</>;
  if (loading || !session) {
    return (
      <div className="grid min-h-dvh place-items-center">
        <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
      </div>
    );
  }
  return <>{children}</>;
}
