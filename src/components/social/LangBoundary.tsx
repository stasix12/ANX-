'use client';

import { useEffect } from 'react';
import { bootLang, useLang } from '@/lib/social/i18n';

/**
 * WHAT MAKES A LANGUAGE CHANGE REACH EVERY SCREEN.
 *
 * The screens call the plain `t()` rather than a hook, so nothing in them
 * subscribes to the language. This does, and its `key` changes with it —
 * React throws the subtree away and builds it again, in the new language.
 *
 * `display: contents` so this wrapper is not a box: it must not add a layout
 * of its own to an app whose heights are measured in tests.
 *
 * It also boots the stored choice, which is why the app opens in the language
 * the customer last chose rather than in Hebrew with a flicker.
 */
export function LangBoundary({ children }: { children: React.ReactNode }) {
  const lang = useLang();
  useEffect(() => {
    bootLang();
  }, []);
  return (
    <div key={lang} style={{ display: 'contents' }}>
      {children}
    </div>
  );
}
