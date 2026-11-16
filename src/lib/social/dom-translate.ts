'use client';

import { translate, type Lang } from './i18n';

/**
 * ─── התרגום שרואים על המסך ─────────────────────────────────────────────────
 *
 * "התוכנה לא עוברת לרוסית מלאה … עדיין יש כפתורים והרבה דברים בעברית."
 *
 * He is right, and the reason is structural. Wrapping sentences with t() at
 * the call site reaches JSX text and a few attributes — about 460 sentences.
 * The app holds roughly two thousand more Hebrew string literals, and most of
 * them are NOT in a position a codemod may touch:
 *
 *   · label maps in src/lib/social (statuses, activity lines, reasons)
 *   · options inside arrays and objects
 *   · strings built in conditionals and returned from helpers
 *   · eighteen files that already bind a local `t`
 *
 * AND SOME OF THOSE LITERALS ARE DATA, NOT TEXT. `status === 'דולג'` and the
 * values written to the database are Hebrew too. Wrapping those would not
 * translate a screen, it would break publishing. That is the line this file
 * refuses to cross: it never touches a value, a comparison, or anything the
 * code reads back — only what has already been painted on the screen.
 *
 * SO IT TRANSLATES THE DOM. Text nodes and three attributes, matched against
 * the same dictionary, after React has rendered. The desktop window has done
 * exactly this since 16.11 and it is how that window became fully Russian.
 *
 * EACH NODE REMEMBERS ITS OWN HEBREW, because translating in place and back
 * would need a reverse lookup, and two Hebrew sentences can share a Russian.
 *
 * WHAT IT WILL NOT TOUCH, deliberately:
 *   · <script>, <style>, <textarea> — code and user-editable content
 *   · an input's value — the customer's own typing is never rewritten
 *   · any node inside [data-no-translate], for anything that must stay put
 */

const ATTRS = ['placeholder', 'aria-label', 'title'] as const;
const SKIP_TAGS = new Set(['SCRIPT', 'STYLE', 'TEXTAREA', 'CODE', 'PRE']);

type Marked = Text & {
  __anxHe?: string | null;
  __anxSrc?: string;
  __anxOut?: string;
  __anxPre?: string;
  __anxPost?: string;
};
type MarkedEl = Element & { [k: string]: unknown };

let lang: Lang = 'he';
let observer: MutationObserver | null = null;

function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * ─── RE-READING A NODE REACT HAS REWRITTEN ──────────────────────────────
 *
 * Remembering each node's Hebrew once was right while the dictionary only
 * answered fixed sentences: those never change, so a cached original was
 * always the current one. Patterns break that. `נשארו 7 דקות` becomes
 * `נשארו 6 דקות` a minute later, and a cache would keep painting "7" over
 * React's "6" for as long as the page stayed open — a stale number is worse
 * than an untranslated one.
 *
 * So the node remembers BOTH sides: the Hebrew it was read from, and the
 * exact string we wrote out. On every visit, a value equal to what we wrote
 * is our own paint and the cache stands; anything else is React writing new
 * source text, and the Hebrew is read again from it.
 */
function source(node: Marked): string | null {
  const cur = node.nodeValue ?? '';
  /*
   * TWO STRINGS ARE REMEMBERED, and both are needed to skip work:
   * __anxSrc is the value this node was last READ from, __anxOut the value
   * last WRITTEN to it. A node holding a bare number or a group name has no
   * translation, and without __anxSrc it would be looked up again on every
   * render for the life of the page — a few microseconds each, times every
   * node, times every render. With it, an unchanged node costs one compare.
   */
  if (node.__anxHe !== undefined && (cur === node.__anxSrc || cur === node.__anxOut)) {
    return node.__anxHe;
  }
  node.__anxSrc = cur;
  const txt = tidy(cur);
  /*
   * ─── THE SPACE AROUND THE WORDS IS NOT DECORATION ─────────────────────
   *
   * JSX splits `{n} קבוצות היום` into separate text nodes, and one of them
   * is the string " קבוצות היום" — leading space and all. That space is the
   * only thing between the number and the word on screen. Translating the
   * trimmed core and writing it back bare would render "5групп", so the
   * whitespace the node came with is kept and put back around whatever is
   * written into it.
   */
  node.__anxPre = txt ? (/^\s*/.exec(cur)?.[0] ?? '') : '';
  node.__anxPost = txt ? (/\s*$/.exec(cur)?.[0] ?? '') : '';
  /* Only sentences the dictionary can actually answer are remembered, so a
     bare name or a lone number is never stored and never fought over. */
  node.__anxHe = txt && translate('ru', txt) !== txt ? txt : null;
  return node.__anxHe;
}

function paintText(node: Marked) {
  const parent = node.parentNode as Element | null;
  if (parent && SKIP_TAGS.has(parent.nodeName)) return;
  if (parent && parent.closest && parent.closest('[data-no-translate]')) return;
  const he = source(node);
  if (!he) return;
  const core = lang === 'he' ? he : translate(lang, he);
  const want = (node.__anxPre ?? '') + core + (node.__anxPost ?? '');
  if (node.nodeValue !== want) node.nodeValue = want;
  node.__anxOut = want;
}

function paintAttrs(el: MarkedEl) {
  for (const name of ATTRS) {
    if (!el.hasAttribute?.(name)) continue;
    const store = `__anxAttr_${name}`;
    const out = `__anxOut_${name}`;
    const cur = el.getAttribute(name) ?? '';
    if (el[store] === undefined || el[out] === undefined || cur !== el[out]) {
      const txt = tidy(cur);
      el[store] = txt && translate('ru', txt) !== txt ? txt : null;
    }
    const he = el[store] as string | null;
    if (!he) continue;
    const want = lang === 'he' ? he : translate(lang, he);
    if (el.getAttribute(name) !== want) el.setAttribute(name, want);
    el[out] = want;
  }
}

function paint(root: Node) {
  if (root.nodeType === Node.TEXT_NODE) {
    paintText(root as Marked);
    return;
  }
  if (root.nodeType !== Node.ELEMENT_NODE && root.nodeType !== Node.DOCUMENT_FRAGMENT_NODE) return;
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT | NodeFilter.SHOW_ELEMENT);
  let node: Node | null = walker.currentNode;
  while (node) {
    if (node.nodeType === Node.TEXT_NODE) paintText(node as Marked);
    else if (node.nodeType === Node.ELEMENT_NODE) paintAttrs(node as MarkedEl);
    node = walker.nextNode();
  }
  if (root.nodeType === Node.ELEMENT_NODE) paintAttrs(root as MarkedEl);
}

/**
 * Applies `next` to everything on screen and keeps applying it as React
 * renders. Safe to call repeatedly; the observer is created once.
 */
export function applyDomLanguage(next: Lang): void {
  if (typeof document === 'undefined') return;
  lang = next;
  paint(document.body);

  if (observer) return;
  observer = new MutationObserver((records) => {
    for (const r of records) {
      if (r.type === 'characterData') paintText(r.target as Marked);
      else if (r.type === 'attributes') paintAttrs(r.target as MarkedEl);
      else for (const added of Array.from(r.addedNodes)) paint(added);
    }
  });
  observer.observe(document.body, {
    subtree: true,
    childList: true,
    characterData: true,
    attributes: true,
    attributeFilter: [...ATTRS],
  });
}
