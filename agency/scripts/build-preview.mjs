/**
 * Turns the static export in out/ into a folder that can be hosted as plain
 * files under any base path (a preview link, a claude.ai artifact):
 *
 *   EXPORT=1 NEXT_PUBLIC_SITE_URL=http://localhost:3000 npx next build
 *   node scripts/build-preview.mjs        → preview/
 *
 * The export is built with a relative assetPrefix, so only root-relative links
 * are rewritten here, and a small capture-phase handler lets the browser follow
 * them instead of Next's client router (which would fetch the real routes).
 * An unlayered body rule is added because a host page may wrap this file with
 * its own reset, which would otherwise beat Tailwind's layered base styles.
 */
import { cpSync, mkdirSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const out = join(root, 'out');
const dest = join(root, 'preview');

rmSync(dest, { recursive: true, force: true });
mkdirSync(dest, { recursive: true });
cpSync(join(out, '_next/static'), join(dest, 'site/_next/static'), { recursive: true });
for (const f of ['icon.svg', 'manifest.webmanifest', 'opengraph-image']) {
  try {
    cpSync(join(out, f), join(dest, f));
  } catch {
    // optional
  }
}

const intercept = `<script>
// Preview only: Next's <Link> would route through the app router, which cannot
// resolve the real routes on a static host. Let the browser follow the DOM href.
document.addEventListener('click', function (e) {
  var a = e.target && e.target.closest && e.target.closest('a[href]');
  if (!a) return;
  var key = Object.keys(a).find(function (k) { return k.indexOf('__reactProps') === 0; });
  var props = key ? a[key] : null;
  if (props && props.onMouseEnter && props.onTouchStart) e.stopPropagation();
}, true);
</script>`;

const bodyStyle =
  '<style>body{margin:0;background:#0b1220;color:#f5f7fb;font-family:var(--font-heebo),"Segoe UI",system-ui,sans-serif;font-size:16px;line-height:1.7}</style>';

const pages = ['index.html', 'accessibility.html', 'privacy.html', '404.html'];
for (const page of pages) {
  let html = readFileSync(join(out, page), 'utf8');
  const home = page === 'index.html';
  html = html
    .replaceAll('href="/icon.svg', 'href="icon.svg')
    .replaceAll('href="/manifest.webmanifest"', 'href="manifest.webmanifest"')
    .replaceAll('href="/#', home ? 'href="#' : 'href="index.html#')
    .replaceAll('href="/accessibility"', 'href="accessibility.html"')
    .replaceAll('href="/privacy"', 'href="privacy.html"')
    .replaceAll('href="/"', 'href="index.html"')
    .replace('<head>', `<head>${intercept}`)
    .replace('</head>', `${bodyStyle}</head>`);
  writeFileSync(join(dest, page), html);
}

// Some hosts reject a literal U+FFFD in text files; inside JS string literals
// the escape sequence is equivalent.
for (const f of readdirSync(dest, { recursive: true })) {
  if (!f.endsWith('.js')) continue;
  const path = join(dest, f);
  const js = readFileSync(path, 'utf8');
  if (js.includes('\uFFFD')) writeFileSync(path, js.replaceAll('\uFFFD', '\\uFFFD'));
}

const files = readdirSync(dest, { recursive: true }).filter((f) => !f.endsWith('.map'));
console.log(`preview/ ready: ${files.length} files`);
