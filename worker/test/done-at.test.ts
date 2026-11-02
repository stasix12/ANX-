/*
 * "הוא מדלג ורושם הסבב נעצר למרות שלא עשיתי כלום"
 *
 * הוא צדק, ואף אחד לא ביטל כלום באותו רגע. לחיצה אחת על "סיים ואפס" ביטלה
 * מאות שורות עתידיות בעדכון אחד — אופק התכנון הוא 48 שעות (HORIZON_HOURS),
 * ובמרווח של 30 שניות זה שורות ששעתן פזורה שתיים בדקה על פני יומיים.
 *
 * ואז כל מסך במוצר הציב שורה שהסתיימה בדקה שתוכננה לה:
 *
 *   · listTimelineDone סינן וסידר לפי scheduled_at, והדשבורד קורא לו עם
 *     until = עכשיו — אז שורה שבוטלה ב-21:00 עבור 23:47 לא נכנסה לקריאה
 *     ב-21:00, ב-22:00 ולא ב-23:00. היא נכנסה ב-23:47.
 *   · Timeline, PublicationItem ומסך ההיסטוריה כולם חישבו
 *     `published_at ?? scheduled_at`, ושום דבר לא כותב published_at על שורה
 *     מבוטלת — אז החלופה הייתה תמיד השעה המתוכננת.
 *
 * התוצאה: "הסבב נעצר" חדש-למראה אחת ל-30 שניות, במשך יומיים, מפעולה אחת
 * שנעשתה שעות קודם ובצדק נחשבה גמורה. הוא ראה את זה, הסיק שמשהו עוד שובר,
 * והיה צודק בכל מילה חוץ מהמסקנה — שהמסך שתל אצלו.
 *
 * updated_at הוא הרגע הכתוב בפועל: הטריגר social_queue_set_updated_at חותם
 * אותו בכל עדכון, ו-failuresSince קורא אותו מאותה סיבה בדיוק מאז שאריח
 * "נכשלו היום" תוקן.
 *
 * הבדיקה אומתה אדוורסרית פעמיים לפני שנכתבה: מאמת אחד כתב שניסה לשבור את
 * השרשרת שלב-שלב ולא הצליח, ושני עדים בתוך הטענה עצמה — קומיט וקומיט-ביטול
 * — מאשרים אותה במילים שלהם.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const ok = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const strip = (src: string) =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, ''))
    .join('\n');

/* ───────────── אחד: הקריאה שואלת מתי זה קרה, לא מתי תוכנן ─────────────── */

const client = strip(readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8'));
const doneRead = client.slice(client.indexOf('export async function listTimelineDone'), client.indexOf('export async function listQueue'));
ok(doneRead.length > 100, 'listTimelineDone קיים');

ok(/\.gte\('updated_at', opts\.since\)/.test(doneRead), 'הגבול התחתון הוא מתי השורה השתנתה');
ok(/\.lte\('updated_at', opts\.until\)/.test(doneRead), 'וגם הגבול העליון — אחרת שורה שבוטלה נשארת מוסתרת עד הדקה שתוכננה לה');
ok(/\.order\('updated_at', \{ ascending: false \}\)/.test(doneRead), 'והסדר לפי אותה עמודה, אחרת התקרה חותכת את השורות הלא נכונות');
ok(
  !/scheduled_at/.test(doneRead),
  'ואין יותר scheduled_at בקריאה הזאת בכלל: שורה לא יכולה להסתיים בעתיד, ולכן הגבול לעבר מפסיק להיות עקיפה של העמודה הלא נכונה',
);
/*
 * וְהעמודה נבחרת — וזאת המוטציה החמורה מכולן, כי היא חוזרת בשקט מוחלט.
 *
 * PostgREST לא מחזיר עמודה שלא ביקשו, אז SELECT בלי updated_at מחזיר
 * undefined, doneAt נופלת ל-scheduled_at, וכל הבאג חוזר בלי שאף טיפוס ואף
 * בדיקה צועקים. חתוך עד נקודה-פסיק של ההצהרה בלבד: חלון של 260 תווים קלט
 * את `export type TimelineRow = Pick<QueueRow, ... 'updated_at' ...>` שבא
 * מיד אחריו, ולכן עבר על SELECT שלא בחר כלום. מוטציה הוכיחה את זה.
 */
const selAt = client.indexOf('const TIMELINE_SELECT');
ok(selAt > -1, 'TIMELINE_SELECT קיים');
const sel = client.slice(selAt, client.indexOf(';', selAt));
ok(/updated_at/.test(sel), 'updated_at נבחר בפועל ב-TIMELINE_SELECT');
ok(/skip_reason/.test(sel), 'וגם סיבת הדילוג, שהיא התשובה שהפס היה צריך להציג במקום "דולג" חשוף');

/* ───────────── שניים: ההצבה — פונקציה אחת, לא שני ביטויים ─────────────── */

const timeline = readFileSync(new URL('../../src/components/social/Timeline.tsx', import.meta.url), 'utf8');
const tl = strip(timeline);

ok(
  /const doneAt = \(row: \{[^}]*\}\) =>\s*row\.published_at \?\? row\.updated_at \?\? row\.scheduled_at;/.test(tl),
  'רגע הסיום מחושב בפונקציה אחת: published_at, אחריו updated_at, ו-scheduled_at רק כמילוט אחרון',
);
/*
 * שני השימושים — מיון והצבה — חייבים לקרוא אותה. הם נסחפו זה מזה פעם אחת
 * כבר: המיון תוקן והצבה לא, ואין שום דבר במסך שמראה היסחפות כזאת.
 */
ok(/\.sort\(\(a, b\) => new Date\(doneAt\(a\)\)\.getTime\(\) - new Date\(doneAt\(b\)\)\.getTime\(\)\)/.test(tl), 'המיון קורא אותה');
ok(/if \(doneLine\) return \{ row, doneLine, at: doneAt\(row\) \};/.test(tl), 'וההצבה קוראת אותה');
ok(
  !/published_at \?\? row\.scheduled_at/.test(tl) && !/published_at \?\? a\.scheduled_at/.test(tl),
  'ואין יותר אף חישוב מקומי של אותו רגע',
);

/* שני המסכים האחרים מחשבים את אותו דבר, ולכן חייבים את אותה שרשרת. */
const item = strip(readFileSync(new URL('../../src/components/social/PublicationItem.tsx', import.meta.url), 'utf8'));
ok(/row\.published_at \?\? row\.updated_at \?\? null/.test(item), 'PublicationItem מציב שורה שהסתיימה ברגע שהסתיימה');
/*
 * הסדר נבדק בתוך אותו ביטוי ולא בקובץ כולו: ל-PublicationItem יש שני
 * חישובים של `at`, ורק השני הוא על שורה שיכולה להיות סופית. הראשון הוא
 * ב-statusLine ונוגע לשורה שעוד ממתינה — שם scheduled_at הוא התשובה הנכונה,
 * ועבור 'skipped' הפונקציה הזאת מחזירה טקסט בלי זמן בכלל. עוגן על הקובץ
 * כולו מצא את הראשון ו"נכשל" על קוד תקין.
 */
const itemAt = item.indexOf('const terminalAt');
ok(itemAt > -1, 'החישוב הסופי קיים');
const itemTail = item.slice(itemAt, itemAt + 320);
ok(
  /const at = terminalAt \?\? \(projectedAt === undefined/.test(itemTail),
  'והתחזית נשארת אחרי זה: היא שייכת לשורה שעוד ממתינה, ולשורה שהסתיימה לא מנבאים',
);

const history = strip(readFileSync(new URL('../../src/app/social/history/page.tsx', import.meta.url), 'utf8'));
ok(
  /r\.published_at \?\? r\.updated_at \?\? projected\.get\(r\.id\) \?\? r\.scheduled_at/.test(history),
  'מסך ההיסטוריה — אותה שרשרת, ו-updated_at לפני התחזית',
);

/* ───────────── שלושה: הטיפוס לא משקר על מה שנבחר ──────────────────────── */

const types = readFileSync(new URL('../../src/lib/social/types.ts', import.meta.url), 'utf8');
ok(
  /updated_at\?: string \| null;/.test(types),
  'updated_at אופציונלי ב-QueueItem: רוב הקריאות לא בוחרות אותו, וטיפוס שמבטיח אותו בכל מקום משקר על כל שורה שחוזרת מ-QUEUE_SELECT_LITE',
);
ok(
  /social_queue_set_updated_at/.test(types),
  'והערת הטיפוס אומרת מי כותב אותו — טריגר ולא כותב, וזאת הסיבה שאי אפשר לשכוח לעדכן אותו',
);

/* והטריגר באמת קיים, אחרת כל זה מסתמך על עמודה שלא מתעדכנת. */
const schema = readFileSync(new URL('../../supabase/social-schema.sql', import.meta.url), 'utf8');
ok(/create trigger social_queue_set_updated_at/.test(schema), 'הטריגר קיים בסכימה');

console.log(`✓ done-at: ${checks} בדיקות עברו`);
