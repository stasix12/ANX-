/*
 * ─── THE SAME SCREEN, IN THE OTHER LANGUAGE ───────────────────────────────
 *
 * "תבדוק גם שהטקסט נכנס גם בכל המשבצות ומתאים לעיצוב."
 *
 * Russian runs about 46% longer than Hebrew on the short strings — the ones
 * that live inside buttons, chips, tabs and stat tiles, where there is no
 * room to grow. So every screen this repo already measures has to be
 * measured again in Russian, and the measurement has to be of the REAL
 * screen rather than of a copy made for the occasion.
 *
 * SO NOTHING HERE IS A NEW FIXTURE. It imports one of the fixtures the
 * layout suites already use — whose props were curated by those suites —
 * and then does to it exactly what the app does to a screen at runtime:
 * setLang() for the document's dir and lang, applyDomLanguage() for the
 * text, and the observer inside it for everything React draws afterwards.
 * That is src/app/social/layout.tsx's LangBoundary, minus the React
 * subscription the fixtures do not need.
 *
 * Which fixture, and which language, come from the query string, so one
 * bundle serves every screen in both languages and the comparison is
 * between two runs of identical code.
 */
import { applyDomLanguage } from '@/lib/social/dom-translate';
import { setLang, type Lang } from '@/lib/social/i18n';

declare global {
  interface Window {
    /** Set once the language has been applied, so the suite can wait for it. */
    __langReady?: boolean;
    /** Re-applies the language — used after a fixture changes state. */
    __repaint?: () => void;
  }
}

const params = new URLSearchParams(location.search);
const lang: Lang = params.get('lang') === 'ru' ? 'ru' : 'he';

/* dir and lang on <html>, exactly as the app sets them. */
setLang(lang);

/*
 * The fixture renders itself on import, and React may finish after this
 * module does. applyDomLanguage installs a MutationObserver, so nodes that
 * arrive later are painted too — the same way the running app works.
 */
void (async () => {
  const which = params.get('m') ?? '';
  /* A static list, not a computed path: esbuild has to see every import to
     bundle it, and a template string would bundle nothing. */
  if (which === 'auth') await import('./mount-auth');
  else if (which === 'cycle') await import('./mount-cycle');
  else if (which === 'frozen') await import('./mount-frozen');
  else if (which === 'picker') await import('./mount-picker');
  else if (which === 'pull') await import('./mount-pull');
  else if (which === 'scene') await import('./mount-scene');
  else if (which === 'schedule') await import('./mount-schedule-panel');
  else if (which === 'swiper') await import('./mount-swiper');
  else if (which === 'tile') await import('./mount-tile');
  else if (which === 'timepick') await import('./mount-timepick');
  else if (which === 'toggle') await import('./mount-toggle');
  else throw new Error(`unknown fixture: ${which}`);

  applyDomLanguage(lang);
  window.__repaint = () => applyDomLanguage(lang);
  /* Two frames: one for React's commit, one for the paint after it. */
  requestAnimationFrame(() =>
    requestAnimationFrame(() => {
      applyDomLanguage(lang);
      window.__langReady = true;
    }),
  );
})();
