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

/*
 * Kept in step with the app rather than hard-coded: the preview's order list
 * restates the message format, and these two values are what it shares with
 * src/lib/order.ts and src/lib/site.ts.
 */
const BULK_THRESHOLD = 3;
const WHATSAPP_NUMBER = '972535257250';
const PHONE_DISPLAY = '053-5257250';

/**
 * Fails the build if either value has moved in the app without being updated
 * here — otherwise the preview would quietly compose orders against a stale
 * threshold or, worse, the wrong phone number.
 */
async function assertConstantsInSync() {
  const checks = [
    {
      file: 'src/lib/order.ts',
      pattern: /BULK_THRESHOLD\s*=\s*(\d+)/,
      expected: String(BULK_THRESHOLD),
      name: 'BULK_THRESHOLD',
    },
    {
      file: 'src/lib/site.ts',
      pattern: /whatsappNumber:\s*'(\d+)'/,
      expected: WHATSAPP_NUMBER,
      name: 'whatsappNumber',
    },
    {
      file: 'src/lib/site.ts',
      pattern: /phoneDisplay:\s*'([\d-]+)'/,
      expected: PHONE_DISPLAY,
      name: 'phoneDisplay',
    },
  ];

  for (const { file, pattern, expected, name } of checks) {
    const match = (await readFile(join(root, file), 'utf8')).match(pattern);
    if (!match) throw new Error(`build-preview: could not find ${name} in ${file}`);
    if (match[1] !== expected) {
      throw new Error(
        `build-preview: ${name} is ${match[1]} in ${file} but ${expected} in this script — update it here too`,
      );
    }
  }
}

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const outDir = join(root, 'out');

/** Order matters: it mirrors the order products render in the grid. */
const productOrder = [
  ['anx-anaconda', 'handles'],
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

const mimeByExtension = {
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.mp4': 'video/mp4',
  '.webm': 'video/webm',
};

/**
 * Every local asset the pages reference — the numbered placeholders, the brand
 * logo, and the demo video with its poster. Anything left as a bare /path here
 * would simply fail to load once the page is opened as a standalone file.
 */
async function buildAssetMap(html) {
  const map = new Map();
  const pattern = /\/(?:products|hero|brand|video)\/[^"']+?\.(?:svg|png|jpe?g|webp|mp4|webm)/g;

  for (const path of new Set(html.match(pattern) ?? [])) {
    const extension = path.slice(path.lastIndexOf('.')).toLowerCase();
    const mime = mimeByExtension[extension];
    if (!mime) continue;
    map.set(path, dataUri(await readFile(join(root, 'public', path)), mime));
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

  /*
   * --- blocked hand-off fallback ---
   * Mirrors src/lib/openExternal.ts and src/components/WhatsAppFallback.tsx.
   *
   * This file is normally opened inside a sandboxed iframe, where window.open
   * is refused and every order button looks simply broken — and a framed page
   * cannot fall back to navigating itself either, because WhatsApp refuses to
   * be framed. Some in-app browsers are worse still: they return a Window that
   * never goes anywhere, so failure has to be watched for rather than
   * detected. Delegated, so it covers the links the order list builds at
   * runtime too.
   */
  var HANDOFF_TIMEOUT_MS = 900;

  function isFramed() {
    try { return window.top !== window.self; } catch (e) { return true; }
  }

  /*
   * A window that reached wa.me is cross-origin, so reading its location
   * throws — that throw is the success signal. One still sitting on
   * about:blank, or closed again by a popup blocker, never left.
   */
  function didNavigate(opened) {
    try {
      if (opened.closed) return false;
      var loc = opened.location;
      // An in-app browser can hand back a stub with no usable location at all.
      if (!loc) return false;
      return !!loc.href && loc.href !== 'about:blank';
    } catch (e) {
      return true;
    }
  }

  function watchForHandoff(opened, onBlocked) {
    var settled = false, timer = 0;

    function settle() {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      window.removeEventListener('blur', settle);
      window.removeEventListener('pagehide', settle);
      document.removeEventListener('visibilitychange', onVisibility);
    }

    function onVisibility() {
      if (document.visibilityState === 'hidden') settle();
    }

    window.addEventListener('blur', settle);
    window.addEventListener('pagehide', settle);
    document.addEventListener('visibilitychange', onVisibility);

    timer = setTimeout(function () {
      if (settled) return;
      settle();
      if (document.visibilityState === 'hidden' || !document.hasFocus()) return;
      if (didNavigate(opened)) return;
      onBlocked();
    }, HANDOFF_TIMEOUT_MS);
  }

  function openWhatsApp(href) {
    var opened = null;
    // No 'noopener' here: some browsers return null for it, which is
    // indistinguishable from a blocked popup and would double-navigate.
    try { opened = window.open(href, '_blank'); } catch (e) { opened = null; }

    if (opened) {
      try { opened.opener = null; } catch (e) {}
      watchForHandoff(opened, function () { showFallback(href); });
      return;
    }

    if (!isFramed()) {
      window.location.href = href;
      return;
    }

    showFallback(href);
  }

  document.addEventListener('click', function (event) {
    var link = event.target.closest('a[href^="https://wa.me/"]');
    if (!link || link.hasAttribute('data-direct')) return;
    if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;

    event.preventDefault();
    openWhatsApp(link.href);
  });

  var fallback;

  function messageFromLink(href) {
    try { return new URL(href).searchParams.get('text') || ''; } catch (e) { return ''; }
  }

  /*
   * navigator.clipboard is unavailable outside a secure context and inside
   * some sandboxes — exactly the situations this fallback exists for — so the
   * old selection-based copy stays as a second attempt.
   */
  function copyText(value) {
    if (navigator.clipboard && navigator.clipboard.writeText) {
      return navigator.clipboard.writeText(value).then(function () { return true; }, selectionCopy);
    }
    return Promise.resolve(selectionCopy());

    function selectionCopy() {
      var field = document.createElement('textarea');
      field.value = value;
      field.setAttribute('readonly', '');
      field.style.position = 'fixed';
      field.style.top = '-1000px';
      document.body.appendChild(field);
      var ok = false;
      try {
        field.select();
        field.setSelectionRange(0, value.length);
        ok = document.execCommand('copy');
      } catch (e) { ok = false; }
      field.remove();
      return ok;
    }
  }

  function bindCopy(button, getValue, label, doneLabel) {
    button.textContent = label;
    button.addEventListener('click', function () {
      Promise.resolve(copyText(getValue())).then(function (ok) {
        if (!ok) return;
        button.textContent = '✓ ' + doneLabel;
        setTimeout(function () { button.textContent = label; }, 2000);
      });
    });
  }

  function buildFallback() {
    fallback = document.createElement('div');
    fallback.className = 'fixed inset-0 z-70 flex items-end justify-center bg-mist-100/50 backdrop-blur-sm sm:items-center sm:p-6';
    fallback.hidden = true;
    fallback.innerHTML =
      '<div role="dialog" aria-modal="true" class="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-card border border-ink-700 bg-white shadow-2xl sm:rounded-card">' +
        '<div class="flex items-start justify-between gap-3 border-b border-ink-700 px-5 py-4">' +
          '<div>' +
            '<h2 class="text-lg font-extrabold">שליחת ההזמנה</h2>' +
            '<p class="mt-1 text-sm text-mist-300">הדפדפן חסם את הפתיחה האוטומטית של וואטסאפ. ההזמנה מוכנה — אפשר לשלוח אותה בשתי לחיצות.</p>' +
          '</div>' +
          '<button type="button" data-close aria-label="סגירה" class="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-mist-300">✕</button>' +
        '</div>' +
        '<div class="flex-1 overflow-y-auto px-5 py-4">' +
          '<div>' +
            '<div class="flex items-center gap-2">' +
              '<span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-extrabold text-white">1</span>' +
              '<h3 class="text-sm font-bold">העתיקו את ההזמנה</h3>' +
            '</div>' +
            '<pre data-message dir="rtl" class="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-ink-950 p-3 font-sans text-xs leading-relaxed text-mist-100"></pre>' +
            '<button type="button" data-copy-message class="mt-2 w-full rounded-full bg-[#25D366] px-5 py-3 text-sm font-bold text-mist-100"></button>' +
          '</div>' +
          '<div class="mt-4">' +
            '<div class="flex items-center gap-2">' +
              '<span class="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-extrabold text-white">2</span>' +
              '<h3 class="text-sm font-bold">שלחו לנו בוואטסאפ</h3>' +
            '</div>' +
            '<p dir="ltr" class="mt-2 text-center text-2xl font-extrabold tracking-wide tabular-nums">${PHONE_DISPLAY}</p>' +
            '<button type="button" data-copy-phone class="mt-2 w-full rounded-full border border-ink-600 px-5 py-3 text-sm font-bold text-mist-100"></button>' +
          '</div>' +
        '</div>' +
        '<div class="border-t border-ink-700 px-5 py-4">' +
          /* data-direct keeps the delegated handler off it: a bare tap gets the
             browser's own handling, which sometimes succeeds where the scripted
             open was refused. */
          '<a data-retry data-direct target="_blank" rel="noopener noreferrer" class="flex items-center justify-center gap-2.5 rounded-full border border-[#1da851]/50 px-6 py-3 text-sm font-bold text-[#1a9e4f]">נסו שוב לפתוח את וואטסאפ</a>' +
        '</div>' +
      '</div>';
    document.body.appendChild(fallback);

    fallback.querySelector('[data-close]').addEventListener('click', function () { fallback.hidden = true; });
    fallback.addEventListener('click', function (e) { if (e.target === fallback) fallback.hidden = true; });
    bindCopy(
      fallback.querySelector('[data-copy-message]'),
      function () { return fallback.querySelector('[data-message]').textContent; },
      'העתקת ההזמנה',
      'ההזמנה הועתקה'
    );
    bindCopy(
      fallback.querySelector('[data-copy-phone]'),
      function () { return ${JSON.stringify(PHONE_DISPLAY)}; },
      'העתקת המספר',
      'המספר הועתק'
    );
  }

  function showFallback(href) {
    if (!fallback) buildFallback();
    fallback.querySelector('[data-message]').textContent = messageFromLink(href);
    fallback.querySelector('[data-retry]').setAttribute('href', href);
    fallback.hidden = false;
  }

  document.addEventListener('keydown', function (event) {
    if (event.key === 'Escape' && fallback && !fallback.hidden) fallback.hidden = true;
  });

  var routes = {};
  document.querySelectorAll('[data-route]').forEach(function (el) {
    routes[el.getAttribute('data-route')] = el;
  });

  function show(path, anchor) {
    var target = routes[path] || routes['/'];
    Object.keys(routes).forEach(function (key) {
      routes[key].hidden = routes[key] !== target;
    });
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

  /*
   * No mobile-menu or header-scroll handlers here: the header is a plain
   * static bar with no drawer and a permanent background. A scroll handler
   * that toggled those background classes would actively strip them at the
   * top of the page, leaving the header transparent over the content.
   */

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

  /*
   * --- machine-fit picker ---
   * Native radios keep their own checked state and the selected label restyles
   * itself through CSS (:checked), so the only thing React was doing that has
   * to be replaced here is repointing the card's WhatsApp link. Each radio
   * carries its finished URL, so there is no order-message format duplicated
   * between the app and this script.
   */
  document.addEventListener('change', function (event) {
    var radio = event.target.closest('input[data-order-href]');
    if (!radio) return;
    var card = radio.closest('article');
    var link = card && card.querySelector('a[href^="https://wa.me/"]');
    if (link) link.setAttribute('href', radio.getAttribute('data-order-href'));
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

  /*
   * --- order list ---
   * The real list is React state, so it renders as nothing in a static export
   * and every "add" button would be dead. This rebuilds it in plain JS: each
   * button carries its line in data-order-line, so nothing about the products
   * is re-derived here. The message format is the one place that is restated
   * from src/lib/order.ts — the two are checked against each other when the
   * preview is built.
   */
  var BULK_THRESHOLD = ${BULK_THRESHOLD};
  var order = [];

  function shekels(n) {
    return '₪' + n.toLocaleString('he-IL');
  }

  function orderTotal() {
    var total = 0, complete = true;
    order.forEach(function (l) {
      if (typeof l.price !== 'number') complete = false;
      else total += l.price * l.quantity;
    });
    return { total: total, complete: complete };
  }

  function orderCount() {
    return order.reduce(function (s, l) { return s + l.quantity; }, 0);
  }

  function orderMessage() {
    if (!order.length) return 'היי, מעוניין לקבל פרטים על הציוד ל-Sabrina';
    var items = order.map(function (l) {
      return '• ' + l.quantity + '× ' + l.name + ' — ' + l.model;
    }).join('\\n');
    var t = orderTotal(), count = orderCount();
    var parts = ['היי, מעוניין להזמין:', '', items, ''];
    if (t.total > 0) {
      parts.push(t.complete
        ? 'סה״כ: ' + shekels(t.total)
        : 'סה״כ חלקי: ' + shekels(t.total) + ' (יש פריטים לתמחור)');
    }
    if (count >= BULK_THRESHOLD) {
      parts.push('הזמנה של ' + count + ' יחידות — אשמח לבדוק מחיר לכמות.');
    }
    return parts.join('\\n');
  }

  var waBase = 'https://wa.me/${WHATSAPP_NUMBER}?text=';
  var bar, sheet, sheetList;

  function buildChrome() {
    bar = document.createElement('div');
    bar.className = 'fixed inset-x-0 bottom-0 z-50 border-t border-ink-700 bg-white/95 backdrop-blur-lg';
    bar.hidden = true;
    bar.innerHTML =
      '<div class="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">' +
        '<button type="button" data-open class="flex min-w-0 flex-1 items-baseline gap-2 rounded-lg text-start">' +
          '<span class="text-sm font-extrabold" data-count></span>' +
          '<span class="truncate text-sm text-mist-300" data-total></span>' +
          '<span class="text-xs font-semibold text-brand-700 underline">עריכה</span>' +
        '</button>' +
        '<a target="_blank" rel="noopener noreferrer" data-send class="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-sm font-bold text-mist-100">שליחת ההזמנה</a>' +
      '</div>';
    document.body.appendChild(bar);

    sheet = document.createElement('div');
    sheet.className = 'fixed inset-0 z-60 flex items-end justify-center bg-mist-100/40 backdrop-blur-sm sm:items-center sm:p-6';
    sheet.hidden = true;
    sheet.innerHTML =
      '<div class="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-t-card border border-ink-700 bg-white shadow-2xl sm:rounded-card">' +
        '<div class="flex items-center justify-between border-b border-ink-700 px-5 py-4">' +
          '<h2 class="text-lg font-extrabold">רשימת ההזמנה</h2>' +
          '<button type="button" data-close class="grid h-9 w-9 place-items-center rounded-lg text-mist-300">✕</button>' +
        '</div>' +
        '<ul class="flex-1 divide-y divide-ink-700 overflow-y-auto px-5" data-list></ul>' +
        '<div class="border-t border-ink-700 px-5 py-4">' +
          '<div class="flex items-baseline justify-between"><span class="text-sm text-mist-300" data-scount></span><span class="text-lg font-extrabold" data-stotal></span></div>' +
          '<a target="_blank" rel="noopener noreferrer" data-send class="mt-3 flex items-center justify-center gap-2.5 rounded-full bg-[#25D366] px-6 py-3.5 text-base font-bold text-mist-100">שליחת ההזמנה בוואטסאפ</a>' +
          '<button type="button" data-clear class="mt-2 w-full rounded-lg py-2 text-xs font-semibold text-mist-500">ניקוי הרשימה</button>' +
        '</div>' +
      '</div>';
    document.body.appendChild(sheet);
    sheetList = sheet.querySelector('[data-list]');

    bar.querySelector('[data-open]').addEventListener('click', function () { sheet.hidden = false; });
    sheet.querySelector('[data-close]').addEventListener('click', function () { sheet.hidden = true; });
    sheet.querySelector('[data-clear]').addEventListener('click', function () { order = []; render(); });
    sheet.addEventListener('click', function (e) { if (e.target === sheet) sheet.hidden = true; });
  }

  function render() {
    var count = orderCount(), t = orderTotal();
    bar.hidden = count === 0;
    if (count === 0) sheet.hidden = true;

    bar.querySelector('[data-count]').textContent = count + ' יחידות';
    bar.querySelector('[data-total]').textContent = shekels(t.total) + (t.complete ? '' : '+');
    sheet.querySelector('[data-scount]').textContent = count + ' יחידות';
    sheet.querySelector('[data-stotal]').textContent = shekels(t.total);

    var href = waBase + encodeURIComponent(orderMessage());
    [bar, sheet].forEach(function (root) {
      root.querySelectorAll('[data-send]').forEach(function (a) { a.setAttribute('href', href); });
    });

    sheetList.innerHTML = order.map(function (l, i) {
      var value = typeof l.price === 'number'
        ? shekels(l.price * l.quantity)
        : '<span class="text-xs font-semibold text-mist-500">לתמחור בוואטסאפ</span>';
      return '<li class="flex items-start gap-3 py-4">' +
        '<div class="min-w-0 flex-1"><p class="text-sm font-bold"></p><p class="mt-0.5 text-xs text-mist-500"></p>' +
        '<p class="mt-1 text-sm font-extrabold">' + value + '</p></div>' +
        '<div class="flex shrink-0 items-center gap-1">' +
          '<button type="button" data-step="-1" data-i="' + i + '" class="grid h-8 w-8 place-items-center rounded-lg border border-ink-600 text-base font-bold">−</button>' +
          '<span class="w-8 text-center text-sm font-bold tabular-nums">' + l.quantity + '</span>' +
          '<button type="button" data-step="1" data-i="' + i + '" class="grid h-8 w-8 place-items-center rounded-lg border border-ink-600 text-base font-bold">+</button>' +
          '<button type="button" data-remove data-i="' + i + '" class="ms-1 grid h-8 w-8 place-items-center rounded-lg text-mist-500">✕</button>' +
        '</div></li>';
    }).join('');

    // Names go in as text, never as markup, so a product name can never inject HTML.
    sheetList.querySelectorAll('li').forEach(function (li, i) {
      li.querySelectorAll('p')[0].textContent = order[i].name;
      li.querySelectorAll('p')[1].textContent = order[i].model;
    });
  }

  document.addEventListener('click', function (event) {
    var addButton = event.target.closest('[data-order-line]');
    if (addButton) {
      var line = JSON.parse(addButton.getAttribute('data-order-line'));
      /*
       * data-order-line is rendered once with the default fit, and nothing
       * rewrites it here the way React would. Read the fit that is actually
       * ticked, or picking the second model would silently order the first.
       */
      var scope = addButton.closest('[data-order-scope]');
      var picked = scope && scope.querySelector('input[data-order-model]:checked');
      if (picked) line.model = picked.getAttribute('data-order-model');
      var found = order.find(function (l) { return l.slug === line.slug && l.model === line.model; });
      if (found) found.quantity += line.quantity;
      else order.push(Object.assign({}, line));
      render();
      return;
    }

    var step = event.target.closest('[data-step]');
    if (step) {
      var si = +step.getAttribute('data-i');
      order[si].quantity += +step.getAttribute('data-step');
      if (order[si].quantity <= 0) order.splice(si, 1);
      render();
      return;
    }

    var rm = event.target.closest('[data-remove]');
    if (rm) {
      order.splice(+rm.getAttribute('data-i'), 1);
      render();
    }
  });

  buildChrome();
  render();

  apply();
})();
`;

async function main() {
  await assertConstantsInSync();

  const chunksDir = join(outDir, '_next', 'static', 'chunks');
  const cssFile = (await readdir(chunksDir)).find((f) => f.endsWith('.css'));
  const css = await inlineFonts(await readFile(join(chunksDir, cssFile), 'utf8'));

  // trailingSlash is on for the export, so each route is a directory index.
  const pages = [
    ['/', 'index.html'],
    ...productOrder.map(([slug]) => [`/products/${slug}`, `products/${slug}/index.html`]),
  ];

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

  const assets = await buildAssetMap(combined);

  const markup = sections
    .map(([route, body]) => {
      let html = body;
      for (const [path, uri] of assets) html = html.replaceAll(`"${path}"`, `"${uri}"`);
      return `<div data-route="${route}"${route === '/' ? '' : ' hidden'}>${html}</div>`;
    })
    .join('\n');

  // The charset has to be declared here. Opened as a standalone file there is
  // no server sending a Content-Type, and a browser left to guess renders the
  // whole Hebrew site as mojibake. It only looked right in the shared preview
  // because a framed page inherits its parent's encoding.
  const file = `<meta charset="utf-8">
<title>חנות ANX3D</title>
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
