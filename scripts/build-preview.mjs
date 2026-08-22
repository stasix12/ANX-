/**
 * Folds the static export in out/ into a single self-contained HTML file that
 * can be opened from anywhere — no server, no network. Used to hand someone a
 * clickable preview of the site before it is deployed.
 *
 *   npm run build   (with output: 'export' in next.config.mjs)
 *   node scripts/build-preview.mjs
 *
 * React never boots in the preview, so the handful of interactive behaviours
 * (menu, category filter, gallery, routing) are re-implemented in plain JS
 * against the exact markup Next emitted.
 */
import { readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'out');

/** Order matters: it mirrors the order products render in the grid. */
const productOrder = [
  ['anx-pro-handle', 'handles'],
  ['anx-mini-handle', 'handles'],
  ['anx-crystal-handle', 'handles'],
  ['anx-hose-3m', 'hoses'],
  ['anx-hose-5m', 'hoses'],
  ['anx-hose-combo', 'hoses'],
  ['anx-adapter-sabrina', 'adapters'],
  ['anx-adapter-quick', 'adapters'],
  ['anx-adapter-90', 'adapters'],
];

const dataUri = (buf, mime) => `data:${mime};base64,${buf.toString('base64')}`;

async function inlineFonts(css) {
  const mediaDir = join(outDir, '_next', 'static', 'media');
  const files = await readdir(mediaDir);
  let result = css;

  for (const file of files.filter((f) => f.endsWith('.woff2'))) {
    const buf = await readFile(join(mediaDir, file));
    result = result.replaceAll(`../media/${file}`, dataUri(buf, 'font/woff2'));
  }
  return result;
}

/** Every /products/<slug>/N.svg and /hero/machine.svg referenced by the pages. */
async function buildImageMap(html) {
  const map = new Map();
  const paths = new Set(html.match(/\/(?:products|hero)\/[^"']+?\.svg/g) ?? []);

  for (const path of paths) {
    const buf = await readFile(join(root, 'public', path));
    map.set(path, dataUri(buf, 'image/svg+xml'));
  }
  return map;
}

/** Strips the Next runtime and returns just what lived inside <body>. */
function bodyOf(html) {
  const stripped = html.replace(/<script[\s\S]*?<\/script>/g, '');
  const match = stripped.match(/<body[^>]*>([\s\S]*)<\/body>/);
  if (!match) throw new Error('no <body> found in exported page');
  return match[1];
}

/**
 * Turns Next's real hrefs into preview routes. Section links such as
 * "/#products" become "#/::products" so one router handles both.
 */
function rewriteLinks(html) {
  return html
    .replace(/href="\/#([a-z-]+)"/g, 'href="#/::$1"')
    .replace(/href="\/products\/([a-z0-9-]+)\/?"/g, 'href="#/products/$1"')
    .replace(/href="\/"/g, 'href="#/"');
}

/**
 * The grid markup carries no category, so tag each card by its position.
 * Matches on the `<article class="group ` prefix ProductCard always opens
 * with (its hover/zoom trick needs the `group` utility) rather than the
 * full class string, so this survives card style edits.
 */
function tagCategories(html) {
  let index = 0;
  return html.replace(/<article class="group /g, (match) => {
    const entry = productOrder[index++];
    return entry ? `<article data-category="${entry[1]}" class="group ` : match;
  });
}

const routerScript = (fontClass) => `
(function () {
  var root = document.documentElement;
  root.setAttribute('lang', 'he');
  root.setAttribute('dir', 'rtl');
  /* next/font declares --font-heebo on <html>, which the host owns here. */
  ${fontClass ? `root.classList.add(${JSON.stringify(fontClass)});` : ''}

  var routes = {};
  document.querySelectorAll('[data-route]').forEach(function (el) {
    routes[el.getAttribute('data-route')] = el;
  });

  function show(path, anchor) {
    var target = routes[path] || routes['/'];
    Object.keys(routes).forEach(function (key) {
      routes[key].hidden = routes[key] !== target;
    });
    closeMenu();
    if (anchor) {
      var section = target.querySelector('#' + CSS.escape(anchor));
      if (section) {
        section.scrollIntoView({ behavior: 'smooth' });
        return;
      }
    }
    window.scrollTo(0, 0);
  }

  function apply() {
    var hash = window.location.hash.replace(/^#/, '') || '/';
    var parts = hash.split('::');
    show(parts[0] || '/', parts[1]);
  }

  window.addEventListener('hashchange', apply);

  /* --- mobile menu --- */
  function menuParts() {
    var page = document.querySelector('[data-route]:not([hidden])') || document;
    return {
      button: page.querySelector('[aria-controls="mobile-menu"]'),
      panel: page.querySelector('#mobile-menu'),
    };
  }

  function closeMenu() {
    document.querySelectorAll('#mobile-menu').forEach(function (p) { p.hidden = true; });
    document.querySelectorAll('[aria-controls="mobile-menu"]').forEach(function (b) {
      b.setAttribute('aria-expanded', 'false');
    });
    document.body.style.overflow = '';
  }

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[aria-controls="mobile-menu"]');
    if (!button) return;
    var parts = menuParts();
    if (!parts.panel) return;
    var opening = parts.panel.hidden;
    parts.panel.hidden = !opening;
    button.setAttribute('aria-expanded', String(opening));
    document.body.style.overflow = opening ? 'hidden' : '';
  });

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape') closeMenu();
  });

  /* --- header background on scroll --- */
  var solid = ['border-ink-700', 'bg-ink-950/90', 'backdrop-blur-lg'];
  var clear = ['border-transparent', 'bg-transparent'];
  function onScroll() {
    var scrolled = window.scrollY > 12;
    document.querySelectorAll('header').forEach(function (header) {
      solid.forEach(function (c) { header.classList.toggle(c, scrolled); });
      clear.forEach(function (c) { header.classList.toggle(c, !scrolled); });
    });
  }
  window.addEventListener('scroll', onScroll, { passive: true });
  onScroll();

  /* --- category filter --- */
  var filterMap = { 'הכל': 'all', 'ידיות שאיבה': 'handles', 'צינורות': 'hoses', 'מתאמים': 'adapters' };
  var onClasses = ['border-brand-500', 'bg-brand-500', 'text-white'];
  var offClasses = ['border-ink-700', 'text-mist-300', 'hover:border-brand-500/60', 'hover:text-mist-100'];

  document.addEventListener('click', function (event) {
    var button = event.target.closest('[role="radio"]');
    if (!button) return;
    var group = button.closest('[role="radiogroup"]');
    var wanted = filterMap[button.textContent.trim()] || 'all';

    group.querySelectorAll('[role="radio"]').forEach(function (other) {
      var active = other === button;
      other.setAttribute('aria-checked', String(active));
      onClasses.forEach(function (c) { other.classList.toggle(c, active); });
      offClasses.forEach(function (c) { other.classList.toggle(c, !active); });
    });

    var scope = group.parentElement;
    var shown = 0;
    scope.querySelectorAll('article[data-category]').forEach(function (card) {
      var visible = wanted === 'all' || card.getAttribute('data-category') === wanted;
      card.style.display = visible ? '' : 'none';
      if (visible) shown++;
    });

    var count = scope.querySelector('[aria-live="polite"]');
    if (count) count.textContent = shown + ' מוצרים';
  });

  /* --- product gallery --- */
  document.addEventListener('click', function (event) {
    var thumb = event.target.closest('button[aria-label^="הצגת תמונה"]');
    if (!thumb) return;
    var strip = thumb.parentElement;
    var main = strip.parentElement.querySelector('img');
    var source = thumb.querySelector('img');
    if (main && source) main.setAttribute('src', source.getAttribute('src'));

    strip.querySelectorAll('button').forEach(function (other) {
      var active = other === thumb;
      other.setAttribute('aria-current', String(active));
      other.classList.toggle('border-brand-500', active);
      other.classList.toggle('border-ink-700', !active);
    });
  });

  apply();
})();
`;

async function main() {
  const chunksDir = join(outDir, '_next', 'static', 'chunks');
  const cssFile = (await readdir(chunksDir)).find((f) => f.endsWith('.css'));
  const css = await inlineFonts(await readFile(join(chunksDir, cssFile), 'utf8'));

  const pages = [['/', 'index.html'], ...productOrder.map(([slug]) => [`/products/${slug}`, `products/${slug}.html`])];

  const home = await readFile(join(outDir, 'index.html'), 'utf8');
  const fontClass = home.match(/<html[^>]*class="([^"]*)"/)?.[1] ?? '';

  const sections = [];
  let combined = '';

  for (const [route, file] of pages) {
    let body = bodyOf(await readFile(join(outDir, file), 'utf8'));
    body = rewriteLinks(body);
    if (route === '/') body = tagCategories(body);
    sections.push([route, body]);
    combined += body;
  }

  const images = await buildImageMap(combined);

  const markup = sections
    .map(([route, body]) => {
      let html = body;
      for (const [path, uri] of images) html = html.replaceAll(`"${path}"`, `"${uri}"`);
      return `<div data-route="${route}"${route === '/' ? '' : ' hidden'}>${html}</div>`;
    })
    .join('\n');

  const file = `<title>חנות ANX3D</title>
<style>
${css}
/* The artifact host owns <html>/<body>, so paint the ground explicitly.
   Pulls from the same theme tokens as the compiled CSS above, so this
   never drifts out of sync with a theme change again. */
html, body { background: var(--color-ink-950); color: var(--color-mist-100); }
body { margin: 0; min-height: 100dvh; }
</style>
${markup}
<script>${routerScript(fontClass)}</script>
`;

  const target = join(root, 'preview.html');
  await writeFile(target, file, 'utf8');
  console.log(`preview.html · ${(Buffer.byteLength(file) / 1024 / 1024).toFixed(2)} MB · ${sections.length} pages`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
