import type { Locale, PricingRule, Service } from '../types';
import { addDays, toDateKey } from '../util';

/**
 * Lightweight natural-language understanding for the mock AI provider.
 * Keyword + pattern based, in Hebrew, Russian and English. Good enough to run
 * a realistic sales conversation offline; the LLM provider can replace it.
 */

export const CITIES: { he: string; ru: string; en: string; aliases?: string[] }[] = [
  { he: 'תל אביב', ru: 'Тель-Авив', en: 'Tel Aviv', aliases: ['ת"א', 'תל-אביב', 'Тель Авив', 'ТА'] },
  { he: 'ירושלים', ru: 'Иерусалим', en: 'Jerusalem' },
  { he: 'חיפה', ru: 'Хайфа', en: 'Haifa' },
  { he: 'ראשון לציון', ru: 'Ришон-ле-Цион', en: 'Rishon LeZion', aliases: ['ראשון', 'Ришон', 'Rishon'] },
  { he: 'פתח תקווה', ru: 'Петах-Тиква', en: 'Petah Tikva', aliases: ['פ"ת', 'Петах Тиква', 'Petach Tikva'] },
  { he: 'אשדוד', ru: 'Ашдод', en: 'Ashdod' },
  { he: 'נתניה', ru: 'Нетания', en: 'Netanya' },
  { he: 'באר שבע', ru: 'Беэр-Шева', en: 'Beer Sheva', aliases: ['ב"ש', 'Беер-Шева', 'Беэр Шева', 'Beersheba'] },
  { he: 'בני ברק', ru: 'Бней-Брак', en: 'Bnei Brak' },
  { he: 'חולון', ru: 'Холон', en: 'Holon' },
  { he: 'רמת גן', ru: 'Рамат-Ган', en: 'Ramat Gan', aliases: ['Рамат Ган'] },
  { he: 'אשקלון', ru: 'Ашкелон', en: 'Ashkelon' },
  { he: 'רחובות', ru: 'Реховот', en: 'Rehovot' },
  { he: 'בת ים', ru: 'Бат-Ям', en: 'Bat Yam', aliases: ['Бат Ям'] },
  { he: 'הרצליה', ru: 'Герцлия', en: 'Herzliya' },
  { he: 'כפר סבא', ru: 'Кфар-Саба', en: 'Kfar Saba', aliases: ['Кфар Саба'] },
  { he: 'חדרה', ru: 'Хадера', en: 'Hadera' },
  { he: 'מודיעין', ru: 'Модиин', en: 'Modiin' },
  { he: 'רעננה', ru: 'Раанана', en: 'Raanana' },
  { he: 'גבעתיים', ru: 'Гиватаим', en: 'Givatayim' },
  { he: 'קריית אונו', ru: 'Кирьят-Оно', en: 'Kiryat Ono' },
  { he: 'הוד השרון', ru: 'Ход-ха-Шарон', en: 'Hod Hasharon' },
  { he: 'נס ציונה', ru: 'Нес-Циона', en: 'Ness Ziona' },
  { he: 'יבנה', ru: 'Явне', en: 'Yavne' },
  { he: 'ראש העין', ru: 'Рош-ха-Аин', en: 'Rosh HaAyin' },
  { he: 'אור יהודה', ru: 'Ор-Йехуда', en: 'Or Yehuda' },
  { he: 'רמת השרון', ru: 'Рамат-ха-Шарон', en: 'Ramat Hasharon' },
  { he: 'לוד', ru: 'Лод', en: 'Lod' },
  { he: 'רמלה', ru: 'Рамла', en: 'Ramla' },
];

const norm = (s: string) => s.toLowerCase().replace(/[־\-–]/g, ' ').replace(/\s+/g, ' ').trim();

export function detectCity(text: string): string | undefined {
  const n = norm(text);
  for (const c of CITIES) {
    const names = [c.he, c.ru, c.en, ...(c.aliases ?? [])].map(norm);
    if (names.some((name) => n.includes(name))) return c.he;
  }
  return undefined;
}

export function cityLabel(cityHe: string, locale: Locale): string {
  const c = CITIES.find((x) => x.he === cityHe);
  return c ? c[locale] : cityHe;
}

const NUMBER_WORDS: Record<string, number> = {
  אחד: 1, אחת: 1, שני: 2, שתי: 2, שניים: 2, שתיים: 2, שלוש: 3, שלושה: 3, ארבע: 4, ארבעה: 4, חמש: 5, חמישה: 5, שש: 6, שישה: 6, שבע: 7, שבעה: 7, שמונה: 8, תשע: 9, תשעה: 9, עשר: 10, עשרה: 10,
  один: 1, одна: 1, одно: 1, два: 2, две: 2, пара: 2, три: 3, четыре: 4, пять: 5, шесть: 6, семь: 7, восемь: 8, девять: 9, десять: 10,
  one: 1, a: 1, an: 1, two: 2, couple: 2, three: 3, four: 4, five: 5, six: 6, seven: 7, eight: 8, nine: 9, ten: 10,
};

function numberBefore(text: string, index: number): number | undefined {
  const before = text.slice(Math.max(0, index - 18), index);
  const digit = before.match(/(\d+)\s*[^\d]*$/);
  if (digit) return Number(digit[1]);
  const words = before.split(/[\s,.-]+/).filter(Boolean).slice(-2);
  for (const w of words.reverse()) {
    const v = NUMBER_WORDS[w.toLowerCase()];
    if (v) return v;
  }
  return undefined;
}

export interface DetectedItem {
  serviceId: string;
  quantity: number;
}

/** Recognise services by their per-language keyword lists; longest keyword wins per position. */
export function detectServices(text: string, services: Service[]): DetectedItem[] {
  const n = norm(text);
  const found = new Map<string, DetectedItem>();
  const candidates: { serviceId: string; kw: string; idx: number; unit: string }[] = [];
  for (const s of services.filter((x) => x.active)) {
    const kws = [s.keywords.he, s.keywords.ru, s.keywords.en]
      .filter(Boolean)
      .flatMap((k) => k!.split(','))
      .map((k) => norm(k))
      .filter(Boolean);
    for (const kw of kws) {
      let idx = n.indexOf(kw);
      while (idx >= 0) {
        candidates.push({ serviceId: s.id, kw, idx, unit: s.unit });
        idx = n.indexOf(kw, idx + kw.length);
      }
    }
  }
  // Prefer longer keywords when they overlap (e.g. "corner sofa" beats "sofa").
  candidates.sort((a, b) => b.kw.length - a.kw.length);
  const taken: [number, number][] = [];
  for (const c of candidates) {
    const range: [number, number] = [c.idx, c.idx + c.kw.length];
    if (taken.some(([a, b]) => c.idx < b && a < range[1])) continue;
    taken.push(range);
    const qty = numberBefore(n, c.idx) ?? (c.unit === 'sqm' ? 6 : 1);
    const prev = found.get(c.serviceId);
    found.set(c.serviceId, { serviceId: c.serviceId, quantity: prev ? Math.max(prev.quantity, qty) : qty });
  }
  return [...found.values()];
}

export function detectExtras(text: string, rules: PricingRule[]): string[] {
  const n = norm(text);
  return rules
    .filter((r) => r.active && r.type === 'extra')
    .filter((r) => {
      const kws = [r.config.keywords?.he, r.config.keywords?.ru, r.config.keywords?.en].filter(Boolean).flatMap((k) => k!.split(',')).map(norm);
      return kws.some((k) => k && n.includes(k));
    })
    .map((r) => r.id);
}

export function detectCondition(text: string, keywords: { he: string[]; ru: string[]; en: string[] }): string | undefined {
  const n = norm(text);
  const hits = [...keywords.he, ...keywords.ru, ...keywords.en].filter((k) => n.includes(norm(k)));
  return hits.length ? hits.join(', ') : undefined;
}

const WEEKDAYS: Record<string, number> = {
  ראשון: 0, שני: 1, שלישי: 2, רביעי: 3, חמישי: 4, שישי: 5, שבת: 6,
  воскресенье: 0, понедельник: 1, вторник: 2, среда: 3, среду: 3, четверг: 4, пятница: 5, пятницу: 5, суббота: 6, субботу: 6,
  sunday: 0, monday: 1, tuesday: 2, wednesday: 3, thursday: 4, friday: 5, saturday: 6,
};

export function detectDate(text: string, now: Date): string | undefined {
  const n = norm(text);
  if (/(היום|сегодня|today)/.test(n)) return toDateKey(now);
  if (/(מחרתיים|послезавтра|day after tomorrow)/.test(n)) return toDateKey(addDays(now, 2));
  if (/(מחר|завтра|tomorrow)/.test(n)) return toDateKey(addDays(now, 1));
  const dm = n.match(/\b(\d{1,2})[./](\d{1,2})\b/);
  if (dm) {
    const d = new Date(now.getFullYear(), Number(dm[2]) - 1, Number(dm[1]));
    if (d.getTime() < now.getTime() - 86400000) d.setFullYear(d.getFullYear() + 1);
    return toDateKey(d);
  }
  for (const [word, day] of Object.entries(WEEKDAYS)) {
    // Hebrew weekday names collide with number words ("שני" = two / Monday) — require "יום" prefix in Hebrew.
    const pattern = /[֐-׿]/.test(word) ? new RegExp(`יום ${word}|ב${word}\\b`) : new RegExp(`\\b${word}\\b`);
    if (pattern.test(n)) {
      let diff = (day - now.getDay() + 7) % 7;
      if (diff === 0) diff = 7;
      return toDateKey(addDays(now, diff));
    }
  }
  return undefined;
}

export function detectTime(text: string): string | undefined {
  const n = norm(text);
  const hm = n.match(/\b([01]?\d|2[0-3])[:.]([0-5]\d)\b/);
  if (hm) return `${hm[1].padStart(2, '0')}:${hm[2]}`;
  const h = n.match(/(?:בשעה|ב-|в|at)\s*(\d{1,2})\b/);
  if (h && Number(h[1]) >= 7 && Number(h[1]) <= 20) return `${h[1].padStart(2, '0')}:00`;
  if (/(בבוקר|בוקר|утром|утро|morning)/.test(n)) return '09:00';
  if (/(צהריים|אחה"צ|אחר הצהריים|днём|днем|после обеда|afternoon|noon)/.test(n)) return '13:00';
  if (/(בערב|ערב|вечером|вечер|evening)/.test(n)) return '17:00';
  return undefined;
}

export function detectUrgent(text: string): boolean {
  return /(דחוף|היום|עכשיו|срочно|сегодня|urgent|asap|today)/.test(norm(text));
}

export function isAffirmative(text: string): boolean {
  return /^(כן|בסדר|סבבה|מעולה|אוקיי|אוקי|ok|okay|yes|sure|great|да|давайте|давай|хорошо|отлично|ок|окей|ага|конечно|יאללה|מתאים|טוב|נשמע טוב|подходит|good)\b/i.test(text.trim()) || /(מתאים לי|נשמע טוב|בוא נקבע|давайте запишемся|подходит|let's book|book it|sounds good)/i.test(text);
}

export function isNegative(text: string): boolean {
  return /^(לא|не|нет|no|nope|не надо|לא תודה|no thanks)\b/i.test(text.trim());
}

export function asksIfBot(text: string): boolean {
  return /(בוט|רובוט|אתה אמיתי|את אמיתית|בן אדם אמיתי|מחשב|робот|бот|это человек|живой человек|ты человек|нейросет|are you (a )?(bot|robot|real|human|ai)|is this (a )?(bot|real person)|\bai\b)/i.test(text);
}

export function wantsHuman(text: string, extraKeywords: string[]): boolean {
  const base = /(מנהל|בן אדם|נציג|אדם אמיתי|לדבר עם מישהו|менеджер|человек|оператор|живой|позовите|хочу поговорить|human|manager|real person|someone real|speak to a person|agent)/i;
  if (base.test(text)) return true;
  return extraKeywords.some((k) => k.trim() && text.toLowerCase().includes(k.trim().toLowerCase()));
}

export function isAngry(text: string): boolean {
  return /(מזעזע|נורא|שערורייה|עצבני|תלונה|לא מקצועי|ужас|ужасно|безобразие|жалоба|возмущ|кошмар|terrible|awful|complaint|unacceptable|disgrace|furious|angry|scam)/i.test(text) || /!{3,}/.test(text);
}

export function isComplaint(text: string): boolean {
  return /(פעם שעברה|לא נוקה|נשאר כתם|בפעם הקודמת|прошлый раз|осталось пятно|не отчистили|плохо почистили|last time|didn't come out|still stained|previous job)/i.test(text);
}

export function isPriceObjection(text: string): boolean {
  return /(יקר|הנחה|יותר זול|מחיר סופי|дорого|скидк|дешевле|подешевле|expensive|discount|cheaper|too much|best price)/i.test(text);
}

export function asksPrice(text: string): boolean {
  return /(כמה עולה|מה המחיר|מחיר|עולה|сколько стоит|стоимость|цена|почём|how much|price|cost|quote)/i.test(text);
}

export function declinesPhotos(text: string): boolean {
  return /(אין לי תמונה|בלי תמונה|לא יכול לצלם|нет фото|без фото|не могу сфотографировать|no photo|can't send|without photo)/i.test(text);
}

export function detectName(text: string): string | undefined {
  const m = text.match(/(?:קוראים לי|שמי|אני)\s+([֐-׿]{2,}(?:\s[֐-׿]{2,})?)/) || text.match(/(?:меня зовут|я)\s+([А-ЯЁ][а-яё]+(?:\s[А-ЯЁ][а-яё]+)?)/) || text.match(/(?:my name is|i'm|i am)\s+([A-Z][a-z]+(?:\s[A-Z][a-z]+)?)/i);
  return m?.[1];
}

export function detectPhone(text: string): string | undefined {
  const m = text.replace(/[\s-]/g, '').match(/(?:\+972|0)(5\d{8})/);
  return m ? `0${m[1]}` : undefined;
}

export function detectAddress(text: string): string | undefined {
  const m = text.match(/(?:רחוב|רח'|ул\.|улица|street|st\.)\s*([^\n,]{3,40})/i) || text.match(/\b([֐-׿А-Яа-яA-Za-z][^\d\n,]{2,30}\s\d{1,4}(?:\/\d{1,3})?)\b/);
  return m?.[1]?.trim();
}

/** Matches the customer's answer against offered ISO slot start times. */
export function chooseSlot(text: string, offered: string[], now: Date): string | undefined {
  if (offered.length === 0) return undefined;
  const n = norm(text);
  const time = detectTime(text);
  const date = detectDate(text, now);
  const byTime = time ? offered.filter((iso) => `${String(new Date(iso).getHours()).padStart(2, '0')}:${String(new Date(iso).getMinutes()).padStart(2, '0')}` === time) : [];
  if (byTime.length === 1) return byTime[0];
  if (byTime.length > 1 && date) return byTime.find((iso) => toDateKey(iso) === date) ?? byTime[0];
  if (time) {
    const hour = Number(time.split(':')[0]);
    const sameHour = offered.filter((iso) => new Date(iso).getHours() === hour);
    if (sameHour.length >= 1) return sameHour[0];
  }
  if (/(הראשון|הראשונה|первый|первое|первую|first|earlier|המוקדם|раньше)/.test(n)) return offered[0];
  if (/(השני|השנייה|второй|второе|вторую|second|later|המאוחר|позже)/.test(n)) return offered[1] ?? offered[0];
  if (date) {
    const sameDay = offered.filter((iso) => toDateKey(iso) === date);
    if (sameDay.length === 1) return sameDay[0];
  }
  if (offered.length === 1 && isAffirmative(text)) return offered[0];
  return undefined;
}
