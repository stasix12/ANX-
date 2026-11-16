'use client';

import { useCallback, useSyncExternalStore } from 'react';

/**
 * ─── עברית ורוסית ─────────────────────────────────────────────────────────
 *
 * "תוסיף אופציה גם לרוסית באפליקציה גם בחיבור וגם בתוכנה עצמה."
 *
 * KEYED BY THE HEBREW SENTENCE ITSELF, and that is the whole design.
 *
 * This app holds about 3,600 Hebrew strings across 124 files. A scheme with
 * invented keys (`auth.welcome`) would mean touching every one of them before
 * a single word could be shown in Russian, and until that finished the screen
 * would say `auth.welcome` wherever a key was missed. Keyed by the source
 * sentence, a string that has no translation yet renders in HEBREW — exactly
 * what it renders today — so coverage can grow screen by screen and a gap is
 * never a broken screen. `t('ברוכים הבאים')` is also readable at the call
 * site, which the key form is not.
 *
 * NO LIBRARY. "אין להוסיף ספריות מיותרות" — this is a Map and a subscription.
 *
 * THE BRAND NAME IS NOT TRANSLATED. "אין לשנות את הלוגו או שם האפליקציה",
 * and a product's name is not a word anyway.
 */

export type Lang = 'he' | 'ru';

export const LANGS: { code: Lang; label: string; dir: 'rtl' | 'ltr' }[] = [
  { code: 'he', label: 'עברית', dir: 'rtl' },
  { code: 'ru', label: 'Русский', dir: 'ltr' },
];

export const LANG_KEY = 'anx.social.lang';

export function dirOf(lang: Lang): 'rtl' | 'ltr' {
  return lang === 'ru' ? 'ltr' : 'rtl';
}

/* ─── the dictionary ─────────────────────────────────────────────────────
 *
 * Hebrew on the left exactly as it appears in the source — including the full
 * stop, which is part of the sentence and part of what has to match.
 */
const RU: Record<string, string> = {
  /* ── the sign-in screen ── */
  'פרסום לקבוצות פייסבוק': 'Публикация в группы Facebook',
  'פרסום אוטומטי': 'Автопубликация',
  'ריבוי חשבונות': 'Несколько аккаунтов',
  'מהיר ויעיל': 'Быстро и эффективно',
  'ברוכים הבאים': 'Добро пожаловать',
  'הזינו את הפרטים כדי להיכנס למערכת.': 'Введите свои данные, чтобы войти в систему.',
  'פתיחת חשבון': 'Регистрация',
  'דקה אחת, ואפשר להתחיל לפרסם.': 'Одна минута — и можно начинать публиковать.',
  'שם העסק': 'Название бизнеса',
  'לדוגמה: ניקוי ספות בדרום': 'Например: химчистка диванов на юге',
  'אימייל': 'Эл. почта',
  'סיסמה': 'Пароль',
  'לפחות 8 תווים': 'Минимум 8 символов',
  'הצג סיסמה': 'Показать пароль',
  'הסתר סיסמה': 'Скрыть пароль',
  'זכור אותי': 'Запомнить меня',
  'כניסה למערכת': 'Войти в систему',
  'פתחו חשבון': 'Создать аккаунт',
  'אין לכם עדיין חשבון? ': 'Ещё нет аккаунта? ',
  'כבר יש לכם חשבון? ': 'Уже есть аккаунт? ',
  'פתחו חשבון חדש': 'Создать аккаунт',
  'בדיקת חיבור לשרת': 'Проверить соединение с сервером',
  'בודק את החיבור…': 'Проверяем соединение…',
  'שלחנו לכם מייל': 'Мы отправили вам письмо',
  'חזרה למסך הכניסה': 'Вернуться ко входу',
  'איך זה עובד': 'Как это работает',
  '1. נרשמים כאן ובונים פוסטים וקבוצות — מהטלפון, מכל מקום.':
    '1. Регистрируетесь здесь и создаёте посты и группы — с телефона, откуда угодно.',
  '2. מתקינים את התוכנה על המחשב ומקלידים בה את אותו מייל.':
    '2. Устанавливаете программу на компьютер и вводите в ней тот же адрес почты.',
  '3. המחשב מפרסם לפי התזמון. הסיסמה של פייסבוק נשארת אצלכם.':
    '3. Компьютер публикует по расписанию. Пароль от Facebook остаётся у вас.',
  'שפה': 'Язык',
  'בחירת שפה': 'Выбор языка',
  'בוחרים פעם אחת, והבחירה נשמרת במכשיר הזה': 'Выбирается один раз и сохраняется на этом устройстве',

  /* ── the navigation, on every screen ── */
  'ראשי': 'Главная',
  'קמפיינים': 'Кампании',
  'קבוצות': 'Группы',
  'גילוי קבוצות': 'Поиск групп',
  'היסטוריה': 'История',
  'פעילות': 'Активность',
  'ספרייה': 'Библиотека',
  'דפי פייסבוק': 'Страницы Facebook',
  'הגדרות': 'Настройки',
  'ניווט ראשי': 'Основная навигация',
  'ניווט פרסום': 'Навигация по публикациям',

  /* ── the shell: what the bar says about the system ── */
  'הפרסום מושהה': 'Публикация приостановлена',
  'המחשב כבוי — הבקשה ממתינה לו': 'Компьютер выключен — запрос ждёт его',
  'המחשב מחובר — פרטי החיבור': 'Компьютер подключён — сведения о подключении',
  'המחשב לא מחובר — פרטי החיבור': 'Компьютер не подключён — сведения о подключении',
  'פעיל': 'Активно',
  'כבוי': 'Выключено',
  'יציאה מהחשבון': 'Выйти из аккаунта',
  'לצאת מהחשבון?': 'Выйти из аккаунта?',
  'יוצא…': 'Выходим…',
  'רגע, שומר…': 'Секунду, сохраняем…',
  'סגירה': 'Закрыть',
  'סגירת פרטי החיבור': 'Закрыть сведения о подключении',
};

/** The Hebrew sentence when there is no Russian for it — never an empty slot. */
export function translate(lang: Lang, hebrew: string): string {
  if (lang === 'he') return hebrew;
  return RU[hebrew] ?? hebrew;
}

/** Every Hebrew sentence this dictionary can answer. Read by the tests. */
export function translatedKeys(): string[] {
  return Object.keys(RU);
}

/* ─── the store ──────────────────────────────────────────────────────────
 *
 * A module store rather than a React context, for one concrete reason: a
 * provider would have to be mounted in src/app/social/layout.tsx, a file
 * every screen in the app renders through, and this task may not put a new
 * wrapper around all of them. Components subscribe to this instead and
 * nothing above them changes.
 */
let current: Lang = 'he';
let booted = false;
const listeners = new Set<() => void>();

function emit() {
  for (const l of listeners) l();
}

/** Applies the choice to the document, which is what makes Russian read LTR. */
function applyToDocument(lang: Lang) {
  if (typeof document === 'undefined') return;
  document.documentElement.setAttribute('lang', lang);
  document.documentElement.setAttribute('dir', dirOf(lang));
}

export function getLang(): Lang {
  return current;
}

export function setLang(lang: Lang): void {
  if (lang !== 'he' && lang !== 'ru') return;
  current = lang;
  try {
    window.localStorage.setItem(LANG_KEY, lang);
  } catch {
    /* a locked-down browser may refuse storage; the choice still applies to
       this page, it just will not survive a reload. Never a crash. */
  }
  applyToDocument(lang);
  emit();
}

/*
 * READ ONCE, AFTER HYDRATION, ON PURPOSE.
 *
 * The server renders Hebrew because it cannot know the choice. If this store
 * answered "ru" during hydration the markup would not match what the server
 * sent and React would discard it. So the first paint is always Hebrew and
 * the stored choice is applied immediately after — one frame, no mismatch.
 */
export function bootLang(): void {
  if (booted || typeof window === 'undefined') return;
  booted = true;
  let saved: string | null = null;
  try {
    saved = window.localStorage.getItem(LANG_KEY);
  } catch {
    saved = null;
  }
  if (saved === 'ru' || saved === 'he') {
    current = saved;
    applyToDocument(saved);
    emit();
  }
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => {
    listeners.delete(fn);
  };
}

export function useLang(): Lang {
  return useSyncExternalStore(
    subscribe,
    () => current,
    () => 'he' as Lang,
  );
}

/** `const t = useT()` — then `t('ברוכים הבאים')`. */
export function useT(): (hebrew: string) => string {
  const lang = useLang();
  return useCallback((hebrew: string) => translate(lang, hebrew), [lang]);
}
