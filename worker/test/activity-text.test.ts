/*
 * WHAT A LOG ROW SAYS TO A PERSON.
 *
 * The owner, about their own dashboard: "אני לא רוצה לראות יותר טקסטים
 * טכניים ארוכים כמו facebook/selectors.ts". The line they were reading is the
 * first case below, verbatim from their screen.
 *
 * The risk in a change like this is not that it fails to hide the file name.
 * It is that it hides the only specific thing the row had — which group, which
 * post, what actually happened — and leaves a screen of identical polite
 * headlines that tell nobody anything. So most of what is asserted here is
 * that the specifics SURVIVE.
 */
import assert from 'node:assert/strict';
import { activityText, hasTechnicalDetail, plainMessage } from '../../src/lib/social/activity-text';

let checks = 0;
const is = (cond: unknown, msg: string) => { checks += 1; assert.ok(cond, msg); };
const eq = (a: unknown, b: unknown, msg: string) => { checks += 1; assert.equal(a, b, msg); };

/* ------------------------------------------------- the line they complained about */
{
  const raw =
    'ניסיון 2 לפרסום נכשל. לא מצאתי את תיבת "כתבו משהו…" בקבוצה. ייתכן שאין הרשאת פרסום או ש-Facebook שינתה את הממשק (facebook/selectors.ts). המערכת תנסה שוב ב-27.09.2026, 18:51.';
  const out = plainMessage(raw);
  is(!/selectors\.ts/.test(out), 'the file name is gone — it is addressed to whoever maintains the selectors, not to the owner');
  is(!/\(\s*\)/.test(out), 'and it does not leave the empty brackets it lived in behind');
  is(/ניסיון 2 לפרסום נכשל/.test(out), 'what happened survives — that is the whole point of the row');
  is(out.length < raw.length, 'and the row is shorter than it was');
}

/* -------------------------------------------- the specifics must not be flattened */
{
  const t = activityText({
    event: 'publish_failed',
    level: 'error',
    message: 'הפרסום לקבוצה "באר שבע ביחד" נכשל: לא נמצאה תיבת הכתיבה.',
    meta: { target: 'Город Арад , глазами жителей', queueId: 'q1' },
  });
  eq(t.title, 'פרסום נכשל', 'the headline names the event in Hebrew');
  is(/באר שבע ביחד/.test(t.detail), 'the sentence the writer wrote is kept — it is the only specific thing most rows have');
  eq(t.subject, 'Город Арад , глазами жителей', 'and the group the writer stamped is carried through, Cyrillic and all');
}

/* ------------------------------------- a date is not a sentence boundary */
{
  const out = plainMessage(
    'הפרסום נדחה כי המרווח בין פרסומים עוד לא חלף, והמערכת תנסה שוב ב-27.09.2026 בשעה 18:51 אחרי שהמרווח ייגמר.',
  );
  is(!/^.{0,40}27\.$/.test(out), 'it must not cut inside 27.09.2026 — the old naive split on "." did exactly that');
  is(out.length > 40, 'and it keeps a readable sentence');
}
{
  is(plainMessage('התוכנה עודכנה לגרסה 3.39.0 והופעלה מחדש. אין צורך לגעת במחשב, היא חוזרת לעבוד לבד תוך כמה שניות.').includes('3.39.0'),
     'nor inside a version number');
}

/* ------------------------------------------------ an exception is not shown at all */
{
  const raw = "browserType.launchPersistentContext: Executable doesn't exist at /root/.cache/ms-playwright/chromium-1187/chrome-linux/chrome";
  eq(plainMessage(raw), '', 'a message with no Hebrew in it is not paraphrased into a guess — it is left to the full details');
  const t = activityText({ event: 'browser_start_failed', level: 'error', message: raw, meta: {} });
  eq(t.title, 'הדפדפן לא נפתח', 'the headline still tells the owner what happened');
  eq(t.detail, '', 'and nothing English reaches the card');
  is(hasTechnicalDetail({ message: raw, meta: {} }), 'while the original is still there to open');
}

/* ------------------------------------------------------ no headline said twice */
{
  const t = activityText({ event: 'worker_stopped', level: 'info', message: 'המחשב התנתק', meta: {} });
  eq(t.title, 'המחשב התנתק', 'short messages become the headline');
  eq(t.detail, '', 'and are not then repeated underneath it');
}

/* ------------------------------------------- every writer has a name a person reads */
{
  /* Read from the classification map next door, so a writer added there and
     forgotten here is caught at build time rather than on the owner's screen
     as "עדכון מהמערכת" for something that plainly is not. */
  const src = require('node:fs').readFileSync(new URL('../../src/lib/social/activity.ts', import.meta.url), 'utf8') as string;
  const block = src.slice(src.indexOf('const KIND'), src.indexOf('export function activityKind'));
  const events = [...block.matchAll(/^\s{2}([a-z_][a-z0-9_]*):\s*'/gm)].map((m) => m[1]);
  is(events.length > 30, `the classification map was read (${events.length} events)`);
  for (const event of events) {
    const t = activityText({ event, level: 'info', message: 'x', meta: {} });
    is(t.title !== 'עדכון מהמערכת', `${event} must have a headline of its own, not the generic fallback`);
    is(!/[a-z_]{4,}/.test(t.title), `${event}'s headline must not be the raw event name`);
  }
}

/* ------------------------------------- an unknown writer still lands somewhere honest */
{
  eq(activityText({ event: 'something_new', level: 'error', message: 'x', meta: {} }).title, 'תקלה', 'an unlisted error reads as one');
  eq(activityText({ event: 'something_new', level: 'warn', message: 'x', meta: {} }).title, 'דורש תשומת לב', 'so does a warning');
  eq(activityText({ event: 'something_new', level: 'info', message: 'x', meta: {} }).title, 'עדכון מהמערכת', 'and an unremarkable one says so');
}

/* ------------------------------------------------------------ nothing crashes */
{
  is(typeof activityText({ event: '', level: 'info', message: '', meta: {} }).title === 'string', 'an empty row renders');
  is(typeof plainMessage('') === 'string', 'so does an empty message');
  is(!hasTechnicalDetail({ message: 'הכול טוב', meta: {} }), 'a clean row with no meta offers nothing to open');
  is(hasTechnicalDetail({ message: 'הכול טוב', meta: { queueId: 'q' } }), 'but a row with meta does');
}

console.log(`activity text tests OK — ${checks} assertions`);
