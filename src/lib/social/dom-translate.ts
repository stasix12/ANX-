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

type Marked = Text & { __anxHe?: string | null };
type MarkedEl = Element & { [k: string]: unknown };

let lang: Lang = 'he';
let observer: MutationObserver | null = null;

function tidy(s: string): string {
  return s.replace(/\s+/g, ' ').trim();
}

/** The Hebrew this node was born with, or null if it is not ours to touch. */
function original(node: Marked): string | null {
  if (node.__anxHe === undefined) {
    const txt = tidy(node.nodeValue ?? '');
    /* Only sentences the dictionary can actually answer are remembered. A
       live counter or a name would otherwise be stored and re-written on
       every tick, fighting React for no gain. */
    node.__anxHe = txt && translate('ru', txt) !== txt ? txt : null;
  }
  return node.__anxHe;
}

function paintText(node: Marked) {
  const parent = node.parentNode as Element | null;
  if (parent && SKIP_TAGS.has(parent.nodeName)) return;
  if (parent && parent.closest && parent.closest('[data-no-translate]')) return;
  const he = original(node);
  if (!he) return;
  const want = lang === 'he' ? he : translate(lang, he);
  if (node.nodeValue !== want) node.nodeValue = want;
}

function paintAttrs(el: MarkedEl) {
  for (const name of ATTRS) {
    if (!el.hasAttribute?.(name)) continue;
    const store = `__anxAttr_${name}`;
    if (el[store] === undefined) {
      const txt = tidy(el.getAttribute(name) ?? '');
      el[store] = txt && translate('ru', txt) !== txt ? txt : null;
    }
    const he = el[store] as string | null;
    if (!he) continue;
    const want = lang === 'he' ? he : translate(lang, he);
    if (el.getAttribute(name) !== want) el.setAttribute(name, want);
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
