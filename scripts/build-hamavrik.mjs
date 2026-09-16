/**
 * Builds הפתרון המבריק as a standalone static site for its own domain.
 *
 *   NEXT_PUBLIC_SITE_URL=https://example.co.il npm run build:hamavrik
 *
 * 1. Runs the normal `next build` with NEXT_PUBLIC_HAMAVRIK_STANDALONE=1, so
 *    every link, canonical, sitemap entry and JSON-LD URL drops the
 *    /sofa-cleaning prefix and points at NEXT_PUBLIC_SITE_URL.
 * 2. Starts the built app on a local port and harvests only the cleaning
 *    pages — the list comes from the app's own sitemap, so a landing page
 *    added to config.ts is picked up with no change here — plus the sitemap,
 *    robots, manifest and Open Graph image, into dist-hamavrik/ with the
 *    hashed assets they reference. The store never reaches the cleaning
 *    domain.
 *
 * (`output: 'export'` is not used on purpose: the store's dynamic routes
 * cannot be exported, and this site does not need them to be.)
 *
 * Deploy dist-hamavrik/ to any static host. Cloudflare Pages: build command
 * `npm run build:hamavrik`, output directory `dist-hamavrik`.
 */
import { spawn, spawnSync } from 'node:child_process';
import { cp, mkdir, rm, writeFile, access } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const dist = join(root, 'dist-hamavrik');
const PORT = 3977;

const siteUrl = (process.env.NEXT_PUBLIC_SITE_URL ?? '').replace(/\/+$/, '');
if (!/^https?:\/\//.test(siteUrl)) {
  console.error("Set NEXT_PUBLIC_SITE_URL to the site's public origin, e.g. https://hamavrik.co.il");
  process.exit(1);
}

const env = {
  ...process.env,
  EXPORT: '',
  NEXT_PUBLIC_HAMAVRIK_STANDALONE: '1',
  NEXT_PUBLIC_SITE_URL: siteUrl,
  NEXT_PUBLIC_BASE_PATH: '',
};

const build = spawnSync('npx', ['next', 'build'], { cwd: root, stdio: 'inherit', env });
if (build.status !== 0) process.exit(build.status ?? 1);

const local = `http://127.0.0.1:${PORT}`;

// A server left over from an earlier run would serve an earlier build's HTML
// (which references chunks this build no longer has) — refuse to harvest it.
try {
  await fetch(`${local}/robots.txt`);
  console.error(`Port ${PORT} is already in use — stop whatever is listening there and rerun.`);
  process.exit(1);
} catch {}

// Run next's own entry point in a plain node process, as its own process
// group, so stopping it stops the actual server — not just a shell wrapper.
const server = spawn(
  process.execPath,
  [join(root, 'node_modules', 'next', 'dist', 'bin', 'next'), 'start', '-p', String(PORT)],
  { cwd: root, env, stdio: 'ignore', detached: true },
);
const stop = () => {
  try { process.kill(-server.pid, 'SIGTERM'); } catch {}
  try { server.kill('SIGKILL'); } catch {}
};
process.on('exit', stop);

const ready = async () => {
  for (let i = 0; i < 60; i++) {
    if (server.exitCode !== null) throw new Error(`next start exited with ${server.exitCode}`);
    try { if ((await fetch(`${local}/robots.txt`)).ok) return; } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  throw new Error('next start did not come up');
};
// The routes still live at /sofa-cleaning/* inside the app; only the links,
// canonicals and metadata dropped the prefix. This maps a public path back
// to where the built app serves it.
const ROUTE_BASE = '/sofa-cleaning';
const route = (p) => `${ROUTE_BASE}${p === '/' ? '' : p}`;
const get = async (path) => {
  const res = await fetch(local + path, { redirect: 'manual' });
  if (!res.ok) throw new Error(`${path} → ${res.status}`);
  return res;
};

try {
  await ready();

  await rm(dist, { recursive: true, force: true });
  await mkdir(dist, { recursive: true });

  // The page list is whatever the app itself puts in its sitemap.
  const sitemap = await (await get('/sitemap.xml')).text();
  const pages = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)]
    .map((m) => m[1].replace(siteUrl, '') || '/')
    .filter((p) => p.startsWith('/'));

  const fixHtml = (html) =>
    html
      // Next writes these two from the route they are colocated in; on the
      // standalone domain they sit at the root. The OG image becomes a file.
      // (The same URLs also sit inside the RSC payload as JSON, where the
      // closing quote is escaped — hence the backslash excluded from the query
      // match, so the escape survives and the script stays valid.)
      .replace(/\/(?:sofa-cleaning\/)?opengraph-image(?:\?[^"'\\]*)?(?=\\?["'])/g, '/opengraph-image.jpg')
      // The card is a photo now, and as a PNG it weighs ~900KB – WhatsApp
      // silently drops previews above ~300KB, so it is re-encoded as JPEG
      // below and the type tag follows.
      .replace(/(?:og|twitter):image:type(" content="|\\",\\"content\\":\\")image\/png/g, (m, sep) => m.replace('image/png', 'image/jpeg'))
      // The optimiser is gone; next/image already emits plain src in this mode,
      // this only covers anything that still went through /_next/image.
      .replace(/\/_next\/image\?url=([^&"'\\]+)[^"'\\]*/g, (_, u) => decodeURIComponent(u));

  for (const page of pages) {
    const html = fixHtml(await (await get(route(page))).text());
    // /beer-sheva → beer-sheva.html, so the static host serves the extensionless
    // URL directly (no trailing-slash redirect) and it matches the canonical.
    const file = page === '/' ? 'index.html' : `${page.replace(/^\//, '')}.html`;
    await mkdir(dirname(join(dist, file)), { recursive: true });
    await writeFile(join(dist, file), html);
    console.log(`  ${page.padEnd(32)} → ${file}`);
  }

  for (const [path, file] of [
    ['/sitemap.xml', 'sitemap.xml'],
    ['/robots.txt', 'robots.txt'],
    ['/manifest.webmanifest', 'manifest.webmanifest'],
  ]) {
    try {
      await writeFile(join(dist, file), Buffer.from(await (await get(path)).arrayBuffer()));
    } catch (e) {
      console.warn(`  skipped ${path}: ${e.message}`);
    }
  }

  // Hashed CSS/JS/fonts the pages reference, and the site's own media.
  await cp(join(root, '.next', 'static'), join(dist, '_next', 'static'), { recursive: true });
  const exists = (p) => access(p).then(() => true, () => false);
  await cp(join(root, 'public', 'hamavrik'), join(dist, 'hamavrik'), { recursive: true });
  // Of the store's videos only the hero clip (desktop) and its poster are used here.
  await mkdir(join(dist, 'video'), { recursive: true });
  for (const f of ['anx-hero.webm', 'anx-hero.mp4', 'anx-hero-poster.jpg']) {
    if (await exists(join(root, 'public', 'video', f))) await cp(join(root, 'public', 'video', f), join(dist, 'video', f));
  }

  // Cloudflare Pages / Netlify conventions.
  await writeFile(
    join(dist, '_redirects'),
    [
      '# Old shared-domain paths keep working on the new domain.',
      '/sofa-cleaning        /            301',
      '/sofa-cleaning/*      /:splat      301',
      '',
    ].join('\n'),
  );
  await writeFile(
    join(dist, '_headers'),
    [
      '/*',
      '  X-Content-Type-Options: nosniff',
      '  Referrer-Policy: strict-origin-when-cross-origin',
      '  X-Frame-Options: SAMEORIGIN',
      '/_next/static/*',
      '  Cache-Control: public, max-age=31536000, immutable',
      '/hamavrik/*',
      '  Cache-Control: public, max-age=604800',
      '/video/*',
      '  Cache-Control: public, max-age=604800',
      '',
    ].join('\n'),
  );

  // The share card: rendered by Next as PNG, published as JPEG (see fixHtml).
  {
    const png = Buffer.from(await (await get(route('/opengraph-image'))).arrayBuffer());
    const { default: sharp } = await import('sharp');
    await writeFile(join(dist, 'opengraph-image.jpg'), await sharp(png).jpeg({ quality: 84, mozjpeg: true }).toBuffer());
  }

  // A 404 in the site's own language and theme rather than the store's.
  await writeFile(
    join(dist, '404.html'),
    `<!DOCTYPE html><html lang="he" dir="rtl"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>הדף לא נמצא</title><meta name="robots" content="noindex"><link rel="icon" href="/hamavrik/favicon.png" type="image/png"></head>
<body style="margin:0;font-family:Heebo,system-ui,sans-serif;background:#f5f8fc;color:#0f172a;display:grid;place-items:center;min-height:100dvh;text-align:center;padding:24px">
<main><p style="font-size:14px;font-weight:800;color:#1a56db;letter-spacing:.04em">404</p>
<h1 style="font-size:28px;margin:8px 0 12px">הדף הזה לא קיים</h1>
<p style="color:#475569;margin:0 0 24px">אולי הקישור ישן. הכל נמצא בעמוד הראשי.</p>
<a href="/" style="display:inline-block;background:#1a56db;color:#fff;font-weight:800;padding:14px 28px;border-radius:999px;text-decoration:none">לעמוד הראשי</a></main>
</body></html>
`,
  );

  console.log(`\nhamavrik standalone site assembled in ${dist} for ${siteUrl} (${pages.length} pages)`);
} finally {
  stop();
}
