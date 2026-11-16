/*
 * ─── THE TRANSLATOR, DROPPED ONTO A PAGE THAT IS ALREADY DRAWN ────────────
 *
 * Ten of this repo's screens are measured as static HTML: render-dash.tsx and
 * its siblings print the real components, with the real class names, through
 * renderToStaticMarkup. That is how the dashboard's height is measured at
 * all — the screen itself sits behind a Supabase session and an app router.
 *
 * Those pages have no React runtime, and they do not need one: the thing that
 * puts this app into Russian is a DOM translator, and a DOM is exactly what
 * they have. So this script is appended to them, reads the language from the
 * query string, and does what src/app/social/layout.tsx does at runtime —
 * nothing simulated, the same two functions.
 */
import { applyDomLanguage } from '@/lib/social/dom-translate';
import { setLang, type Lang } from '@/lib/social/i18n';

declare global {
  interface Window {
    __langReady?: boolean;
  }
}

const lang: Lang = new URLSearchParams(location.search).get('lang') === 'ru' ? 'ru' : 'he';
setLang(lang);
applyDomLanguage(lang);
window.__langReady = true;
