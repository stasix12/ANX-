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

/*
 * AND WHICH DATABASE IT IS RUNNING AGAINST — the project reference only, never
 * the key.
 *
 * This is not a disclosure: the same string is inlined into the JavaScript of
 * every page this site serves, because the browser has to know where to send
 * its requests. What it adds is a way to ASK, from somewhere that is not a
 * browser.
 *
 * It was added the night a customer signed in to this website perfectly and
 * was refused by the program on his PC with "wrong email or password". The
 * account existed here and not there, and there was no way to compare the two
 * without a person reading a file inside an installer. The installer's build
 * now reads this line and refuses to ship a package that would ask a different
 * database than the one the dashboard is on — see .github/workflows/
 * build-app.yml.
 */
const project = (process.env.NEXT_PUBLIC_SUPABASE_URL ?? '').replace(/^https?:\/\//, '').split('.')[0];

export function GET() {
  return Response.json(
    { build: process.env.NEXT_PUBLIC_BUILD_STAMP ?? '', db: project },
    { headers: { 'cache-control': 'no-store, max-age=0, must-revalidate' } },
  );
}
