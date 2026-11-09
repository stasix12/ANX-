/*
 * "זה לא מפרסם, זה פשוט מדלג על הפוסטים, כמו שהיה מקודם"
 *
 * אחרי ש-v35 אפס כל רצפה וכל מגבלה — "0 מגבלה" — זה עדיין דילג. וזאת הסיבה:
 * v35 הוריד את המרווח בין שני פרסומים לאותה קבוצה ולא נגע במתג שמתיר פרסום
 * חוזר בכלל (grep -c repeat_enabled v35.sql → 0), ו-rules.ts בודק את המתג
 * לפני המרווח:
 *
 *     if (previous && previous.length > 0) {
 *       if (!repeat.enabled) return { action: 'skip', reason: `הפוסט הזה כבר פורסם ל-...` };
 *
 * כלומר על פוסט שכבר פורסם ל-252 הקבוצות, מתג כבוי מדלג על כל 252 מיד —
 * המרווח לא נבדק אפילו פעם אחת, ולכן אפסון שלו לא משנה דבר.
 *
 * ולמה המתג היה כבוי: ensureRunForPost פתח קמפיין עם { name, status } בלבד.
 * repeat_enabled נפל לברירת המחדל של מסד הנתונים, ו-DEFAULT_CAMPAIGN_REPEAT —
 * שההערה שלו אומרת "what a new campaign starts as, AND WHAT GETS WRITTEN" —
 * לא נכתב לשום מקום. v31 הופך את ברירת המחדל במסד ל-true, וזה נכון וקיים, אבל
 * ברירת מחדל של מסד נתונים אינה החלטה של המוצר: היא תלויה בכך שקובץ מסוים
 * הורץ, והערך שלפניו היה false — ובדיוק בנקודה שבה readRepeat מסביר באריכות
 * שאי אפשר להבדיל בין "הוא כיבה" לבין "אף אחד לא בחר".
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { DEFAULT_CAMPAIGN_REPEAT, REPEAT_WHEN_UNKNOWN } from '../../src/lib/social/campaign-schedule';

let checks = 0;
const ok = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = <T>(got: T, want: T, what: string) => {
  checks += 1;
  assert.deepEqual(got, want, `${what} — התקבל ${JSON.stringify(got)}`);
};

const raw = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
const code = raw
  .replace(/\/\*[\s\S]*?\*\//g, '')
  .split('\n')
  .map((l) => l.replace(/^\s*\/\/.*$/, ''))
  .join('\n');

/* ───────────── אחד: שני הקבועים נשארים שתי תשובות שונות ───────────────── */

eq(DEFAULT_CAMPAIGN_REPEAT.enabled, true, 'ברירת המחדל של המוצר לקמפיין חדש היא חזרה דולקת — זה מה שהוא ביקש');
eq(REPEAT_WHEN_UNKNOWN.enabled, false, 'ומה שמניחים כשאי אפשר לקרוא נשאר כבוי: קריאה שנכשלה אסור שתהפוך להרשאה לפרסם פעמיים');

/* ───────────── שניים: הקמפיין החדש כותב את המתג, לא מניח אותו ──────────── */

const helper = code.slice(code.indexOf('async function createRunWithRepeat'), code.indexOf('export async function ensureRunForPost'));
ok(helper.length > 100, 'createRunWithRepeat קיים');

ok(/repeat_enabled: DEFAULT_CAMPAIGN_REPEAT\.enabled/.test(helper), 'המתג נכתב מברירת המחדל של המוצר');
ok(/repeat_min_hours: DEFAULT_CAMPAIGN_REPEAT\.minHours/.test(helper), 'וגם המרווח, מאותו מקור');
ok(
  !/repeat_enabled: true/.test(helper),
  'ולא כמילולית: ברירת המחדל של המוצר חיה בקבוע אחד, אחרת שינוי שלו לא מגיע לכאן',
);
ok(
  /const run = await createRunWithRepeat\(/.test(code),
  'וensureRunForPost עובר דרכו ולא פותח קמפיין בעצמו',
);
ok(
  !/saveCampaign\(\{ name: post\.title/.test(code),
  'הקריאה הישנה — { name, status } בלבד — איננה: היא זאת שהשאירה את המתג לברירת המחדל של מסד הנתונים',
);

/* ───────────── שלושה: והכתיבה לא הורגת השקה על מסד לא מעודכן ───────────── */

/*
 * PostgREST מסרב לכל הכתיבה כשעמודה אחת חסרה, אז כתיבה תמימה הייתה הורגת כל
 * השקה על מסד שלא הריץ v25. זאת בדיוק התקלה ש-OPTIONAL_SCHEDULE_COLUMNS הוא
 * הצלקת שלה — אחת-עשרה ימים של השקות שלא הכניסו כלום לתור, בלי שאף מסך אמר
 * מילה.
 */
ok(
  /const OPTIONAL_CAMPAIGN_COLUMNS = \['repeat_enabled', 'repeat_min_hours', 'schedule_gap_seconds', 'schedule_gap_minutes'\] as const;/.test(code),
  'ארבע העמודות רשומות כעמודות שמסד לא מעודכן עשוי לא להכיר — והרשימה היא ליטרל מדויק בכוונה, כדי שלא תגדל בשקט',
);
ok(/isMissingColumnNamed\(first\.error as/.test(helper), 'והניסיון השני רק על השגיאה שאומרת "העמודה לא קיימת"');
ok(
  !/if \(first\.error\) \{[\s\S]{0,120}insert\(rest\)/.test(helper),
  'ולא על כל שגיאה: כתיבה שנדחתה, חיבור שנפל וטוקן שפג הם תשובות אחרות וחייבות להמשיך להיכשל בקול',
);
ok(/if \(!missing\.length\) return unwrap<Campaign>\(first\);/.test(helper), 'ושגיאה שאינה עמודה חסרה נזרקת כמו שהיא');
ok(/'campaign_column_missing'/.test(helper), 'והמסלול האיטי נאמר בפעם הבאה שהוא מסתכל, ולא נסבל בשקט');
ok(
  /לא יֵצא שוב לקבוצה שהוא כבר פורסם אליה/.test(raw),
  'וההודעה אומרת מה בפועל יקרה — לא "חסרה עמודה", אלא שאותו פוסט לא יחזור לאותה קבוצה',
);

/* ───────────── ארבעה: המנוע עדיין בודק את המתג לפני המרווח ─────────────── */

/*
 * זה לא תיקון, זאת העובדה שהופכת את התיקון לנדרש: אם הסדר יתהפך, אפסון
 * המרווח כן היה פותר את זה, והתיקון למעלה היה נראה מיותר למי שיקרא אותו.
 */
const rules = readFileSync(new URL('../../src/lib/social/rules.ts', import.meta.url), 'utf8');
const gate = rules.slice(rules.indexOf('if (previous && previous.length > 0)'), rules.indexOf('if (previous && previous.length > 0)') + 900);
ok(/if \(!repeat\.enabled\) return \{ action: 'skip'/.test(gate), 'המתג נבדק בתוך הענף של "כבר פורסם לקבוצה הזאת"');
ok(
  gate.indexOf('!repeat.enabled') < gate.indexOf('repeat.minHours'),
  'ולפני המרווח — וזאת הסיבה שאיפוס המרווח לבדו לא שינה דבר',
);

console.log(`✓ repeat-switch: ${checks} בדיקות עברו`);
