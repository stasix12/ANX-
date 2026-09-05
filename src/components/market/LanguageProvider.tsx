'use client';

import { createContext, useContext, useEffect, useState } from 'react';
import { LANGUAGES, langDir, translate } from '@/lib/market/i18n';
import type { Language } from '@/lib/market/types';

/**
 * Client-side language state for the marketplace. Hebrew/RTL is the default;
 * the choice persists per browser and flips the marketplace subtree's dir
 * attribute (the rest of the site stays Hebrew).
 */

const LangContext = createContext<{
  lang: Language;
  setLang: (l: Language) => void;
  t: (key: string) => string;
  dir: 'rtl' | 'ltr';
}>({ lang: 'he', setLang: () => {}, t: (k) => translate('he', k), dir: 'rtl' });

const KEY = 'cleango:lang';

export function LanguageProvider({ children }: { children: React.ReactNode }) {
  const [lang, setLangState] = useState<Language>('he');

  useEffect(() => {
    const saved = window.localStorage.getItem(KEY) as Language | null;
    if (saved && LANGUAGES.some((l) => l.id === saved)) setLangState(saved);
  }, []);

  const setLang = (l: Language) => {
    setLangState(l);
    window.localStorage.setItem(KEY, l);
  };

  return (
    <LangContext.Provider value={{ lang, setLang, t: (k) => translate(lang, k), dir: langDir(lang) }}>
      <div dir={langDir(lang)}>{children}</div>
    </LangContext.Provider>
  );
}

export function useLang() {
  return useContext(LangContext);
}

export function LanguageSwitcher() {
  const { lang, setLang } = useLang();
  return (
    <select
      value={lang}
      onChange={(e) => setLang(e.target.value as Language)}
      className="rounded-lg border border-slate-200 bg-white px-2 py-1 text-xs font-bold text-slate-600"
      aria-label="שפה"
    >
      {LANGUAGES.map((l) => (
        <option key={l.id} value={l.id}>
          {l.label}
        </option>
      ))}
    </select>
  );
}
