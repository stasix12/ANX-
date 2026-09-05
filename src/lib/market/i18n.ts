import type { Language } from './types';

/**
 * Marketplace i18n. Hebrew is the source of truth and the default; the
 * customer-facing core strings ship in all four languages, and any key
 * missing from a translation falls back to Hebrew, so screens never break
 * while coverage grows. Arabic and Hebrew render RTL, Russian/English LTR.
 */
export const LANGUAGES: { id: Language; label: string; dir: 'rtl' | 'ltr' }[] = [
  { id: 'he', label: 'עברית', dir: 'rtl' },
  { id: 'ru', label: 'Русский', dir: 'ltr' },
  { id: 'ar', label: 'العربية', dir: 'rtl' },
  { id: 'en', label: 'English', dir: 'ltr' },
];

type Dict = Record<string, string>;

const he: Dict = {
  heroTitle: 'צריכים ניקוי ספה?',
  heroSubtitle: 'מצאו מקצוען פנוי באזור שלכם תוך דקות',
  addressPlaceholder: 'לאיזו כתובת להגיע? למשל: רגר 12, באר שבע',
  useMyLocation: 'השתמש במיקום שלי',
  chooseService: 'מה מנקים היום?',
  findMeCleaner: 'מצא לי מנקה',
  choosePro: 'בחר בעל מקצוע',
  from: 'החל מ-',
  comingSoon: 'בקרוב',
  continue: 'המשך',
  back: 'חזרה',
  estimatedPrice: 'מחיר משוער',
  bookNow: 'הזמן עכשיו',
  searchingPro: 'מחפשים לך מנקה…',
  home: 'בית',
  search: 'חיפוש',
  orders: 'הזמנות',
  messages: 'הודעות',
  profile: 'פרופיל',
};

const ru: Dict = {
  heroTitle: 'Нужна чистка дивана?',
  heroSubtitle: 'Найдём свободного мастера рядом с вами за минуты',
  addressPlaceholder: 'Куда приехать? Например: Ригер 12, Беэр-Шева',
  useMyLocation: 'Моё местоположение',
  chooseService: 'Что чистим сегодня?',
  findMeCleaner: 'Найти мастера',
  choosePro: 'Выбрать мастера',
  from: 'от ',
  comingSoon: 'скоро',
  continue: 'Далее',
  back: 'Назад',
  estimatedPrice: 'Ориентировочная цена',
  bookNow: 'Заказать',
  searchingPro: 'Ищем вам мастера…',
  home: 'Главная',
  search: 'Поиск',
  orders: 'Заказы',
  messages: 'Сообщения',
  profile: 'Профиль',
};

const ar: Dict = {
  heroTitle: 'بحاجة لتنظيف الكنب؟',
  heroSubtitle: 'اعثر على محترف متاح في منطقتك خلال دقائق',
  addressPlaceholder: 'إلى أي عنوان نصل؟ مثلاً: شارع رچر 12، بئر السبع',
  useMyLocation: 'استخدم موقعي',
  chooseService: 'ماذا ننظف اليوم؟',
  findMeCleaner: 'اعثر لي على منظف',
  choosePro: 'اختر محترفاً',
  from: 'ابتداءً من ',
  comingSoon: 'قريباً',
  continue: 'متابعة',
  back: 'رجوع',
  estimatedPrice: 'السعر التقديري',
  bookNow: 'احجز الآن',
  searchingPro: 'نبحث لك عن منظف…',
  home: 'الرئيسية',
  search: 'بحث',
  orders: 'الطلبات',
  messages: 'الرسائل',
  profile: 'الملف الشخصي',
};

const en: Dict = {
  heroTitle: 'Need your sofa cleaned?',
  heroSubtitle: 'Find an available pro in your area within minutes',
  addressPlaceholder: 'Where should we come? e.g. Rager 12, Beer Sheva',
  useMyLocation: 'Use my location',
  chooseService: 'What are we cleaning today?',
  findMeCleaner: 'Find me a cleaner',
  choosePro: 'Choose a pro',
  from: 'from ',
  comingSoon: 'coming soon',
  continue: 'Continue',
  back: 'Back',
  estimatedPrice: 'Estimated price',
  bookNow: 'Book now',
  searchingPro: 'Finding you a cleaner…',
  home: 'Home',
  search: 'Search',
  orders: 'Orders',
  messages: 'Messages',
  profile: 'Profile',
};

const dictionaries: Record<Language, Dict> = { he, ru, ar, en };

export function translate(lang: Language, key: string): string {
  return dictionaries[lang][key] ?? he[key] ?? key;
}

export function langDir(lang: Language): 'rtl' | 'ltr' {
  return LANGUAGES.find((l) => l.id === lang)?.dir ?? 'rtl';
}
