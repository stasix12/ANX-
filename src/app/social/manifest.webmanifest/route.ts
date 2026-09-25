import manifest from '../manifest';

/**
 * Serves the publishing app's manifest at /social/manifest.webmanifest.
 *
 * It has to be a route handler rather than the file beside it. Next treats
 * `manifest.ts` as a metadata file only at the ROOT of app/ — `app/social/
 * manifest.ts` is an ordinary module that builds nothing, so the <link
 * rel="manifest"> in the layout pointed at a 404. That is not cosmetic: with
 * no manifest there is no `display: standalone`, and Next 15 stopped emitting
 * the legacy apple-mobile-web-app-capable meta that used to carry it — so
 * "Add to Home Screen" produced a shortcut that opened in Safari, address bar
 * and all, which is exactly the complaint this fixes.
 *
 * The manifest itself stays in one place and is imported, so the icons, the
 * name and the colours cannot drift from what the file next door declares.
 */
export const dynamic = 'force-static';

export function GET() {
  return new Response(JSON.stringify(manifest()), {
    headers: {
      'content-type': 'application/manifest+json; charset=utf-8',
      'cache-control': 'public, max-age=0, must-revalidate',
    },
  });
}
