/*
 * ─── A TEXT NODE IS NOT A SENTENCE, AND THE TRANSLATOR ONLY SEES NODES ────
 *
 * Every render-*.tsx fixture in this folder prints a real component as HTML
 * and a browser measures it. For geometry that is exact: a comment node has
 * no width, and renderToStaticMarkup gives the shortest honest markup.
 *
 * It is NOT exact for the Russian suites, and the reason is a detail of
 * React that decides what the DOM translator can answer.
 *
 *   <p>יומן פעילות ({n})</p>
 *
 * A browser running React makes THREE text nodes out of that: "יומן פעילות (",
 * the number, and ")". src/lib/social/dom-translate.ts walks text nodes, so
 * what it looks up is the first of those three on its own — which is why
 * src/lib/social/i18n.ts carries the entry 'יומן פעילות (' and why the real
 * screen reads "Журнал активности (6)".
 *
 * renderToStaticMarkup merges them into ONE node, "יומן פעילות (6)". No
 * dictionary entry answers that, so the Russian suites read a screen that
 * says it is still in Hebrew — and russian-layout then measures the Hebrew
 * string in a box the app would have filled with Russian. Both answers are
 * wrong, and both are artefacts of the fixture rather than faults in the app.
 *
 * renderToString writes the same markup with `<!-- -->` between adjacent text
 * children, which is exactly the split a client render produces. So:
 *
 *   · ANX_SPLIT_TEXT=1 → renderToString, the node boundaries the app has.
 *     The Russian suites set it, because they are about what the translator
 *     can see.
 *   · unset → renderToStaticMarkup, byte for byte what it has always been.
 *     Every other suite that reads these snapshots is unaffected.
 *
 * A composed string is unaffected either way: counted(252, 'קבוצות') is one
 * JavaScript string before React ever sees it, so it is one text node in both
 * modes — which is why "252 קבוצות" is a real gap in the dictionary and
 * "יומן פעילות (6)" never was.
 */
import type { ReactNode } from 'react';
import { renderToStaticMarkup, renderToString } from 'react-dom/server';

export function renderSnapshot(el: ReactNode): string {
  return process.env.ANX_SPLIT_TEXT === '1' ? renderToString(el) : renderToStaticMarkup(el);
}
