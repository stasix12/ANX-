/*
 * "רשום דולג, אבל בפועל נכנסתי וראיתי שזה פרסם, זה חמור מאד"
 *
 * הקליק על "פרסום" יושב בין השלב 'publishing' לשלב 'verifying', ולכן פרסום
 * שנפל בנקודה הזאת אולי הצליח — ושום דבר במסד הנתונים לא יודע את זה. ה-worker
 * מסמן בדיוק את המקרה הזה: הוא חונה את השורה כ-needs_attention וכותב
 * step='submitted', כדי שמסך אחד יוכל לפעול עליה — אדם בודק בקבוצה ומחליט,
 * ושום מסלול אוטומטי לא מנסה אותה שוב.
 *
 * והבעיה: needs_attention נמצא בתוך WAITING_STATUSES, ולכן בתוך
 * CANCELLABLE_STATUSES. אז כל ביטול המוני במוצר תפס את השורות האלה — וכל אחד
 * מהם כותב step: '', כלומר מוחק את הראיה היחידה שהפוסט אולי באוויר. ברגע
 * שהראיה נמחקת, שתי הגנות הכפילות נפתחות יחד: rules.ts סופר שורות עם
 * status='published', ו-targetsAlreadyWaiting מחזיק קבוצה רק כל עוד השורה
 * פתוחה. ביטול שנועד למנוע פרסומים יכול לגרום לפרסום שני לאותה קבוצה.
 *
 * resumeNeedsAttention כבר החריג את זה. שבעת הביטולים ההמוניים לא.
 *
 * הבדיקה הזאת נכתבת כ-יחס ולא כרשימה: כל כתיבה ל-'skipped' שמסתמכת על
 * CANCELLABLE חייבת להחריג את השלב. רשימה צריך לתחזק, ורשימה שלא תוחזקה היא
 * בדיוק איך שהבאג הזה חזר אחרי שתוקן.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { CANCELLABLE_STATUSES, MAYBE_LIVE_STEP, WAITING_STATUSES } from '../../src/lib/social/status';

let checks = 0;
const ok = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = <T>(got: T, want: T, what: string) => {
  checks += 1;
  assert.deepEqual(got, want, `${what} — התקבל ${JSON.stringify(got)}`);
};

/* ─────────────── אחד: הקבוע, והסיבה שהוא בכלל צריך להתקיים ─────────────── */

eq(MAYBE_LIVE_STEP, 'submitted', 'השלב שה-worker כותב כשהפוסט אולי כבר עלה');
ok(
  CANCELLABLE_STATUSES.includes('needs_attention'),
  'needs_attention הוא אכן בר-ביטול — זאת הסיבה שההחרגה נחוצה; אם זה משתנה, ההגנה הזאת צריכה חשיבה מחדש ולא מחיקה',
);
ok(WAITING_STATUSES.includes('needs_attention'), 'והוא שם דרך WAITING_STATUSES, לא כרשומה נפרדת');

/* ────────── שניים: כל ביטול המוני מחריג אותו — כיחס, לא כרשימה ────────── */

/**
 * ביטול המוני = כתיבה ל-status 'skipped' שמסננת לפי CANCELLABLE בשרשרת.
 *
 * נמצא על ידי סריקה ולא לפי רשימה שמורה, כי רשימה שמורה היא בדיוק מה שלא
 * תוחזק: הגנה כזאת נוספה פעם אחת לשישה אתרים, ואתר שביעי (ה-sweep של
 * plan.ts) נוסף אחר כך בלי אחת.
 */
function bulkCancels(src: string): { at: number; chunk: string }[] {
  const out: { at: number; chunk: string }[] = [];
  const needle = "status: 'skipped'";
  let i = src.indexOf(needle);
  while (i > -1) {
    /* חלון השרשרת: מספיק גדול לתפוס את הפילטרים, מספיק קטן לא לדלוף לקריאה
       הבאה. נמדד — הארוך מבין השבעה הוא ~420 תווים. */
    const chunk = src.slice(i, i + 520);
    if (/\.in\('status', CANCELLABLE(_STATUSES)?\)/.test(chunk)) out.push({ at: i, chunk });
    i = src.indexOf(needle, i + 1);
  }
  return out;
}

for (const file of ['client.ts', 'plan.ts']) {
  const src = readFileSync(new URL(`../../src/lib/social/${file}`, import.meta.url), 'utf8');
  const found = bulkCancels(src);
  ok(found.length > 0, `${file}: נמצאו ביטולים המוניים לסרוק (${found.length})`);
  for (const { chunk } of found) {
    const reason = (chunk.match(/skip_reason: ([^\n]{0,70})/) ?? [])[1] ?? '?';
    ok(
      /\.neq\('step', MAYBE_LIVE_STEP\)/.test(chunk),
      `${file}: הביטול עם ${reason.trim()} חייב להחריג step=submitted, אחרת הוא מוחק את הראיה שהפוסט אולי באוויר`,
    );
  }
}

/* הקבוע מיובא ולא משוכפל כמילולית — שתי מילוליות בשני קבצים נסחפות, וההיסחפות
   כאן היא לכיוון פרסום כפול. */
for (const file of ['client.ts', 'plan.ts']) {
  const src = readFileSync(new URL(`../../src/lib/social/${file}`, import.meta.url), 'utf8');
  ok(/MAYBE_LIVE_STEP,?\s*\}? ?from '\.\/status'|MAYBE_LIVE_STEP,/.test(src), `${file}: מייבא את הקבוע`);
  const code = src
    .replace(/\/\*[\s\S]*?\*\//g, '')
    .split('\n')
    .map((l) => l.replace(/^\s*\/\/.*$/, ''))
    .join('\n');
  ok(
    !/\.neq\('step', 'submitted'\)/.test(code),
    `${file}: לא מילולית 'submitted' בפילטר — דרך הקבוע, אחרת שינוי במקור לא מגיע לכאן`,
  );
}

/* ─────────── שלושה: ההחייאה האוטומטית ממשיכה להחריג אותו ──────────────── */

const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
/* נחתך עד הפונקציה הבאה ולא לפי ספירת תווים: חלון של 1400 תווים הפסיק להגיע
   ל-.neq ברגע שנוספה מעליו הערה, והבדיקה "נכשלה" על שום דבר. */
const resumeAt = client.indexOf('export async function resumeNeedsAttention');
assert.ok(resumeAt > -1, 'resumeNeedsAttention קיים — יש להצביע מחדש ולא למחוק');
const resumeEnd = client.indexOf('\nexport ', resumeAt + 10);
const resume = client.slice(resumeAt, resumeEnd === -1 ? client.length : resumeEnd);
ok(resume.length > 100, 'resumeNeedsAttention קיים');
ok(
  /\.neq\('step', MAYBE_LIVE_STEP\)/.test(resume),
  '"המשך סבב" מחייה כל שורת needs_attention בבת אחת, ואסור לו לגעת בשורה שאולי כבר פורסמה — זאת ההגנה שהייתה קיימת לבדה',
);

/* ───────── ארבעה: ביטול של שורה בודדת נשאר כפי שהוא, במכוון ───────────── */

/*
 * guardedUpdate(id, CANCELLABLE, { ... 'בוטל ידנית' }) הוא שורה אחת שהבעלים
 * בחר, מול הצילום שלה, אחרי שבדק את הקבוצה — בדיוק ההחלטה שהשורות האלה
 * זקוקות לה. הוא לא נסרק למעלה כי הוא לא משרשר .in('status', CANCELLABLE),
 * וזה נאמר כאן במפורש כדי שהיעדרו לא ייקרא כפספוס.
 */
ok(
  /guardedUpdate\(id, CANCELLABLE, \{ status: 'skipped'/.test(client),
  'ביטול ידני של שורה אחת עובר דרך guardedUpdate ונשאר ללא החרגה — זאת החלטה של אדם שמסתכל על השורה',
);

/* ───────── חמש: הכותב והמסנן חייבים להסכים על אותו שלב ────────────────── */

/*
 * ה-worker כותב את השלב כמילולית, וחמש הגנות אחרות מצמידות אותו שם (ב-
 * performance, stranded, detach-wait, cadence-30s, updates). אין צורך לשנות
 * אותן — אבל חייבת להיות טענה אחת שקושרת את שני הצדדים, כי אחרת שינוי של
 * הקבוע כאן משאיר מסנן שמחריג שלב שאף אחד לא כותב: ההגנה נראית קיימת ומסננת
 * כלום. זה הכישלון הגרוע מכולם — הגנה שחושבים שהיא שם.
 *
 * מוצמד להקשר של afterSubmit ולא לכל הקובץ, כי step: 'pending' נכתב בתור
 * בשורה אחרת, ועוגן רחב היה עובר על כל ערך שהקבוע יקבל.
 */
const workerSrc = readFileSync(new URL('../social-worker.ts', import.meta.url), 'utf8');
ok(
  new RegExp(`if \\(afterSubmit\\)[\\s\\S]{0,400}step: '${MAYBE_LIVE_STEP}'`).test(workerSrc),
  `ה-worker כותב בפועל step: '${MAYBE_LIVE_STEP}' במסלול שאחרי הקליק — אם הקבוע משתנה בלי הכותב, המסנן מחריג שלב שאף אחד לא כותב`,
);

console.log(`✓ maybe-live: ${checks} בדיקות עברו`);
