'use client';

import { useEffect } from 'react';
import { bootLang, LANGS, setLang, useLang, useT } from '@/lib/social/i18n';

/**
 * עברית · Русский
 *
 * "תוסיף אופציה גם לרוסית באפליקציה גם בחיבור וגם בתוכנה עצמה."
 *
 * TWO REAL BUTTONS, not a select: there are exactly two languages, both fit,
 * and a customer who cannot read the current one should not have to open a
 * menu written in it to get out. The one that is on is marked with
 * aria-pressed, so a screen reader says which it is.
 *
 * IT ALSO BOOTS THE STORED CHOICE. Wherever this appears, the saved language
 * is applied on mount — which is why the sign-in screen and the app only have
 * to render the switch, not remember anything themselves.
 */
export function LangSwitch({ className = '' }: { className?: string }) {
  const lang = useLang();
  const t = useT();

  useEffect(() => {
    bootLang();
  }, []);

  return (
    <div className={`anxl-wrap ${className}`.trim()} role="group" aria-label={t('בחירת שפה')}>
      {LANGS.map((l) => (
        <button
          key={l.code}
          type="button"
          lang={l.code}
          onClick={() => setLang(l.code)}
          aria-pressed={lang === l.code}
          className="anxl-btn"
        >
          {l.label}
        </button>
      ))}
    </div>
  );
}
