/**
 * The build the SERVER is running, uncached.
 *
 * Every screen carries NEXT_PUBLIC_BUILD_STAMP, inlined into the bundle when
 * that page was built. This route reports the same value from whichever build
 * is deployed right now. When the two disagree, the page in front of the owner
 * came out of a cache and a deploy has happened since — which has cost this
 * project an evening more than once, because a stale page is indistinguishable
 * from a fix that did not work.
 */
export const dynamic = 'force-dynamic';
export const revalidate = 0;

export function GET() {
  return Response.json(
    { build: process.env.NEXT_PUBLIC_BUILD_STAMP ?? '' },
    { headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' } },
  );
}
