/**
 * Tests the SEO quality gate — the ten checks that stand between generated text
 * and the approval queue.
 *
 *   npm run test:seo
 *
 * The gate is the one part of the system worth testing automatically: it is
 * pure, deterministic logic, and it is what enforces the rules that matter
 * (never a city we don't serve, never an invented price, never an unfounded
 * promise). If it silently stopped catching those, nothing else would notice.
 *
 * The project has no test runner, so this script is self-contained: it compiles
 * the handful of modules under test with tsc, rewrites the `@/` path alias that
 * only Next understands, and exercises the result with node:test. Nothing is
 * mocked and nothing is duplicated — the code under test is the shipped code.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, readdirSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import test from 'node:test';
import { pathToFileURL } from 'node:url';

const out = mkdtempSync(join(tmpdir(), 'seo-quality-'));

/*
 * tsc reports the unresolved `@/` imports as type errors and still emits valid
 * JavaScript, which is all this script needs — so a non-zero exit is expected
 * here and is not a failure.
 */
try {
  execFileSync(
    'npx',
    [
      'tsc',
      'src/lib/seo/quality.ts',
      'src/lib/seo/config.ts',
      'src/lib/seo/planner.ts',
      '--outDir', out,
      '--module', 'esnext',
      '--target', 'es2022',
      '--moduleResolution', 'bundler',
      '--skipLibCheck',
    ],
    { stdio: 'pipe' },
  );
} catch {
  // Type-resolution errors only; the emit is what matters.
}

// Rewrite `@/lib/seo/x` to the sibling file tsc actually emitted.
for (const file of readdirSync(out).filter((f) => f.endsWith('.js'))) {
  const path = join(out, file);
  writeFileSync(
    path,
    readFileSync(path, 'utf8').replace(/from '@\/lib\/seo\/([\w-]+)'/g, "from './$1.js'"),
  );
}

const { runQualityChecks, clearsGate, BLOCKING_CHECKS } = await import(
  pathToFileURL(join(out, 'quality.js')).href
);
const { planWeeklyTopics } = await import(pathToFileURL(join(out, 'planner.js')).href);

/**
 * A Hebrew body long enough to clear the word-count floor, built from distinct
 * paragraphs (the originality check rejects a repeated one) and containing the
 * target phrase exactly once, which is what the intent check looks for.
 */
function hebrewBody(extra = []) {
  return [
    {
      type: 'p',
      text:
        'ניקוי ספות בבאר שבע הוא שירות מבוקש במיוחד, והסיבה לכך פשוטה: אבק מדברי נכנס הביתה ' +
        'גם כשהחלונות סגורים, ומצטבר בתוך סיבי הריפוד ולא רק על פני השטח. ספה שנראית נקייה ' +
        'למדי מבחוץ יכולה להחזיק בתוכה כמות לכלוך משמעותית, וזה מה שגורם לריח שחוזר כמה ימים ' +
        'אחרי כל ניקוי שטחי.',
    },
    { type: 'h2', text: 'איך עובד התהליך בפועל' },
    {
      type: 'p',
      text:
        'העבודה מתבצעת בשיטת הזרקה ויניקה. תמיסה חמה מוחדרת בלחץ אל תוך עומק הריפוד, מפרקת ' +
        'את הלכלוך שנאחז בסיבים, ונשאבת מיד בחזרה יחד איתו. ההבדל מול שטיפה ידנית הוא בדיוק ' +
        'בשלב השאיבה: בלעדיו המים נשארים בתוך הספה, והלכלוך עולה חזרה למעלה בזמן הייבוש.',
    },
    { type: 'h3', text: 'התאמה לסוג הבד' },
    {
      type: 'p',
      text:
        'לא כל בד מגיב אותו דבר. בד אריג סופג יותר ודורש פחות לחות, בד סינתטי מאפשר עבודה ' +
        'אגרסיבית יותר, ומיקרופייבר רגיש לכתמי מים אם הייבוש אינו אחיד. לכן בדיקת הבד נעשית ' +
        'לפני תחילת העבודה ולא במהלכה, וקובעת גם את סוג התמיסה וגם את עוצמת השאיבה.',
    },
    { type: 'h2', text: 'כמה זמן זה לוקח' },
    {
      type: 'p',
      text:
        'ספה תלת-מושבית סטנדרטית לוקחת בדרך כלל בין 45 דקות לשעה וחצי. מה שמאריך את העבודה ' +
        'זה בעיקר כתמים ותיקים, ריפוד שלא נוקה שנים, או פינתית גדולה עם הרבה כריות נפרדות. ' +
        'אין צורך להכין משהו מיוחד מלבד גישה לחשמל ולמים.',
    },
    { type: 'h3', text: 'ייבוש' },
    {
      type: 'p',
      text:
        'אחרי השאיבה הספה נשארת לחה ולא רטובה. ברוב המקרים היא חוזרת לשימוש תוך שעות ספורות, ' +
        'ואוורור טוב מקצר את זה משמעותית. בקיץ בדרום, עם חלון פתוח ומזגן, הייבוש מהיר יותר ' +
        'מאשר בחורף בדירה סגורה.',
    },
    { type: 'h2', text: 'מה ריאלי לצפות מכתמים' },
    {
      type: 'p',
      text:
        'רוב הכתמים היומיומיים — אוכל, שתייה, לכלוך כללי וריחות — מגיבים טוב מאוד. כתמים ' +
        'ותיקים מאוד, או כאלה שטופלו בעבר בחומר לא מתאים וקבעו את הצבע, עלולים להשאיר סימן. ' +
        'עדיף לדעת את זה מראש מאשר לגלות אחרי העבודה, ולכן שווה לצלם ולשאול לפני שסוגרים.',
    },
    { type: 'h2', text: 'באיזו תדירות כדאי לנקות' },
    {
      type: 'p',
      text:
        'בבית ממוצע פעם בשנה עד שנה וחצי מספיקה. בבית עם ילדים קטנים, עם חיית מחמד שעולה על ' +
        'הספה, או בדירה שפונה לכיוון פתוח שמכניס הרבה אבק, כדאי לקצר לפעם בחצי שנה עד שמונה ' +
        'חודשים. אין בזה שום דבר מוחלט: הסימן הטוב ביותר הוא פשוט להעביר יד על הריפוד ולראות ' +
        'אם נשאר אבק, או לשים לב אם יש ריח שמתעורר כשמתיישבים.',
    },
    { type: 'h3', text: 'בין ניקוי לניקוי' },
    {
      type: 'p',
      text:
        'שאיבה שבועית של הריפוד, כולל החריצים בין הכריות, מאריכה משמעותית את הזמן עד שצריך ' +
        'טיפול עומק. כתם טרי כדאי לספוג מיד במטלית לחה בלי לשפשף, כי שפשוף דוחף את הכתם ' +
        'פנימה לתוך הסיבים ומקשה על הוצאתו אחר כך. מה שלא כדאי זה לשפוך חומר ניקוי כללי על ' +
        'הבד בתקווה שזה יעבוד — חלק מהחומרים מקבעים את הכתם או מבהירים את הצבע באופן בלתי הפיך.',
    },
    { type: 'h2', text: 'מה כדאי לבדוק מראש' },
    {
      type: 'ul',
      items: [
        'גישה לנקודת חשמל ולמים בתוך הבית',
        'סוג הבד של הריפוד, אם הוא מופיע בתווית',
        'כתמים ותיקים במיוחד שכדאי להצביע עליהם',
        'האם יש כריות שאפשר להסיר ולנקות בנפרד',
      ],
    },
    {
      type: 'p',
      text:
        'אחרי שהעבודה נגמרת כדאי להשאיר את הכריות מופרדות מעט אחת מהשנייה עד שהריפוד מתייבש ' +
        'לגמרי, כדי שהאוויר יעבור משני הצדדים. זה הפרט הקטן שעושה את ההבדל בין ספה שמתייבשת ' +
        'אחיד לבין ספה שנשארת לחה בנקודות מסוימות. אם יש ספק לגבי פריט מסוים, הדרך הפשוטה ' +
        'ביותר היא לצלם אותו ולשאול לפני שמזמינים — כך גם ברור מראש מה אפשר לצפות וגם מה המחיר.',
    },
    ...extra,
  ];
}

/** A draft that should pass every check. The baseline the cases below mutate. */
function goodDraft(overrides = {}) {
  return {
    lang: 'he',
    city: 'beer-sheva',
    title: 'ניקוי ספות בבאר שבע — איך בוחרים ומה חשוב לדעת',
    meta_description:
      'כל מה שחשוב לדעת על ניקוי ספות בבאר שבע: איך עובד התהליך, מה משפיע על המחיר, כמה זמן לוקח הייבוש ומתי כדאי להזמין בעל מקצוע.',
    h1: 'ניקוי ספות בבאר שבע',
    body: hebrewBody(),
    faq: [
      { q: 'כמה זמן לוקח ניקוי ספה?', a: 'בדרך כלל בין 45 דקות לשעה וחצי, תלוי בגודל ובמצב.' },
      { q: 'כמה זמן לוקח הייבוש?', a: 'ברוב המקרים שעות ספורות, תלוי בבד ובאוורור בבית.' },
    ],
    internal_links: [{ href: '/sofa-cleaning', anchor: 'ניקוי ספות מקצועי בבית הלקוח' }],
    keywords: ['ניקוי ספות בבאר שבע', 'ניקוי ספות'],
    ...overrides,
  };
}

const idOf = (report, id) => report.checks.find((c) => c.id === id);

test('a well-formed draft passes every check and clears the gate', () => {
  const report = runQualityChecks(goodDraft());
  const failed = report.checks.filter((c) => !c.pass);
  assert.deepEqual(
    failed.map((c) => `${c.id}: ${c.detail}`),
    [],
    'expected no failing checks',
  );
  assert.equal(report.score, 100);
  assert.equal(clearsGate(report), true);
});

test('names a city outside the service area → region check fails and blocks', () => {
  const draft = goodDraft();
  draft.body = [...draft.body, { type: 'p', text: 'אנחנו מגיעים גם לתל אביב ולראשון לציון.' }];
  const report = runQualityChecks(draft);
  assert.equal(idOf(report, 'region').pass, false);
  assert.match(idOf(report, 'region').detail, /תל אביב/);
  assert.equal(clearsGate(report), false, 'an out-of-area city must block publishing');
  assert.ok(BLOCKING_CHECKS.includes('region'));
});

test('invents a price → accuracy check fails and blocks', () => {
  const draft = goodDraft();
  draft.body = [...draft.body, { type: 'p', text: 'ניקוי ספה אצלנו עולה 149 ₪ בלבד.' }];
  const report = runQualityChecks(draft);
  assert.equal(idOf(report, 'accuracy').pass, false);
  assert.match(idOf(report, 'accuracy').detail, /149/);
  assert.equal(clearsGate(report), false);
});

test('a price that IS in the price list passes', () => {
  const draft = goodDraft();
  draft.body = [
    ...draft.body,
    {
      type: 'p',
      text:
        'ניקוי ספה מתחיל ב-299 ₪. המחיר הסופי נקבע לפי גודל הפריט, סוג הבד ומצב הריפוד. ' +
        'אפשר לשלוח תמונה בוואטסאפ ולקבל הצעת מחיר מדויקת.',
    },
  ];
  const report = runQualityChecks(draft);
  assert.equal(idOf(report, 'accuracy').pass, true);
  assert.equal(idOf(report, 'guidelines').pass, true, 'disclaimer present, so guidelines pass');
});

test('a price without the disclaimer fails the guidelines check', () => {
  const draft = goodDraft();
  draft.body = [...draft.body, { type: 'p', text: 'ניקוי ספה מתחיל ב-299 ₪ וזה הכל.' }];
  const report = runQualityChecks(draft);
  assert.equal(idOf(report, 'accuracy').pass, true, 'the figure itself is allowed');
  assert.equal(idOf(report, 'guidelines').pass, false, 'but it needs the price disclaimer');
});

test('promises a guarantee → claims check fails and blocks', () => {
  for (const promise of ['אנחנו מתחייבים לתוצאה', 'מסירים 100% מהכתמים', 'הזול ביותר בדרום']) {
    const draft = goodDraft();
    draft.body = [...draft.body, { type: 'p', text: promise }];
    const report = runQualityChecks(draft);
    assert.equal(idOf(report, 'claims').pass, false, `expected "${promise}" to be caught`);
    assert.equal(clearsGate(report), false);
  }
});

test('a Russian article written in Hebrew → language check fails', () => {
  const draft = goodDraft({ lang: 'ru' });
  const report = runQualityChecks(draft);
  assert.equal(idOf(report, 'language').pass, false);
  assert.match(idOf(report, 'language').detail, /בשפה הנדרשת/);
});

test('a short article fails the language check on word count', () => {
  const draft = goodDraft({
    body: [{ type: 'h2', text: 'כותרת' }, { type: 'p', text: 'פסקה קצרה מדי.' }],
  });
  const report = runQualityChecks(draft);
  assert.equal(idOf(report, 'language').pass, false);
  assert.match(idOf(report, 'language').detail, /מתחת למינימום/);
});

test('an unknown internal link fails the links check and blocks', () => {
  const draft = goodDraft({
    internal_links: [{ href: '/sofa-cleaning-beer-sheva', anchor: 'ניקוי ספות באר שבע' }],
  });
  const report = runQualityChecks(draft);
  assert.equal(idOf(report, 'links').pass, false);
  assert.match(idOf(report, 'links').detail, /sofa-cleaning-beer-sheva/);
  assert.equal(clearsGate(report), false, 'a broken link must never reach a published page');
});

test('a link to another article is accepted', () => {
  const draft = goodDraft({
    internal_links: [{ href: '/articles/some-published-article', anchor: 'קראו גם' }],
  });
  assert.equal(idOf(runQualityChecks(draft), 'links').pass, true);
});

test('too many links is flagged as link flooding', () => {
  const draft = goodDraft({
    internal_links: Array.from({ length: 7 }, (_, i) => ({
      href: `/articles/a-${i}`,
      anchor: `קישור ${i}`,
    })),
  });
  assert.equal(idOf(runQualityChecks(draft), 'links').pass, false);
});

test('a title missing the target phrase fails the intent check', () => {
  const draft = goodDraft({ title: 'מדריך כללי לתחזוקת רהיטים בבית פרטי ובדירה' });
  const report = runQualityChecks(draft);
  assert.equal(idOf(report, 'intent').pass, false);
  assert.match(idOf(report, 'intent').detail, /לא מופיע בכותרת/);
});

test('an over-long title and a too-short description fail the headings check', () => {
  const tooLong = runQualityChecks(
    goodDraft({ title: `ניקוי ספות בבאר שבע ${'ועוד מידע חשוב מאוד '.repeat(4)}` }),
  );
  assert.equal(idOf(tooLong, 'headings').pass, false);
  assert.match(idOf(tooLong, 'headings').detail, /Title/);

  const shortDesc = runQualityChecks(goodDraft({ meta_description: 'ניקוי ספות בבאר שבע.' }));
  assert.equal(idOf(shortDesc, 'headings').pass, false);
  assert.match(idOf(shortDesc, 'headings').detail, /Meta Description/);
});

test('an H3 before any H2 fails the headings check', () => {
  const draft = goodDraft();
  draft.body = [{ type: 'h3', text: 'תת-כותרת ראשונה' }, ...draft.body];
  assert.equal(idOf(runQualityChecks(draft), 'headings').pass, false);
});

test('a near-copy of an existing article fails the duplication check', () => {
  const existing = goodDraft();
  const copy = goodDraft({ title: 'ניקוי ספות בבאר שבע — מדריך מלא לתושבי העיר' });
  const report = runQualityChecks(copy, [existing]);
  assert.equal(idOf(report, 'duplication').pass, false);
  assert.match(idOf(report, 'duplication').detail, /חפיפה/);
});

test('an article in the other language is not compared for duplication', () => {
  const report = runQualityChecks(goodDraft(), [goodDraft({ lang: 'ru' })]);
  assert.equal(idOf(report, 'duplication').pass, true);
});

test('repeated padding paragraphs fail the originality check', () => {
  const draft = goodDraft();
  const repeated = draft.body.find((b) => b.type === 'p');
  draft.body = [...draft.body, repeated];
  assert.equal(idOf(runQualityChecks(draft), 'originality').pass, false);
});

test('keyword stuffing fails the guidelines check', () => {
  const draft = goodDraft({
    body: [
      { type: 'h2', text: 'ניקוי ספות בבאר שבע' },
      { type: 'p', text: 'ניקוי ספות בבאר שבע '.repeat(80) },
      { type: 'h2', text: 'עוד' },
      { type: 'p', text: 'ניקוי ספות בבאר שבע '.repeat(40) },
      { type: 'h3', text: 'ועוד' },
    ],
  });
  assert.equal(idOf(runQualityChecks(draft), 'guidelines').pass, false);
});

test('a non-blocking failure alone can still clear the gate', () => {
  // 9/10 checks pass → score 90, above the pass mark, and nothing blocking fails.
  const draft = goodDraft({ meta_description: 'קצר מדי.' });
  const report = runQualityChecks(draft);
  assert.equal(idOf(report, 'headings').pass, false);
  assert.equal(report.score, 90);
  assert.equal(clearsGate(report), true);
});

test('the planner never repeats a subject already in the database', () => {
  const first = planWeeklyTopics({ existingTopicKeys: [], seedCursor: 0 });
  assert.equal(first.length, 2);

  const keys = first.map((t) => t.topicKey);
  const second = planWeeklyTopics({ existingTopicKeys: keys, seedCursor: keys.length });
  assert.equal(second.length, 2);
  for (const topic of second) {
    assert.ok(!keys.includes(topic.topicKey), `${topic.topicKey} was planned twice`);
  }
});

test('the planner only ever targets cities in the service area', () => {
  const allowed = new Set(['beer-sheva', 'arad', 'dimona', 'ofakim', null]);
  const seen = [];
  for (let cursor = 0; cursor < 40; cursor += 2) {
    for (const topic of planWeeklyTopics({ existingTopicKeys: seen, seedCursor: cursor })) {
      assert.ok(allowed.has(topic.city), `unexpected city: ${topic.city}`);
      seen.push(topic.topicKey);
    }
  }
});

test('the planner plans both languages for each subject', () => {
  for (const topic of planWeeklyTopics({ existingTopicKeys: [] })) {
    assert.ok(topic.subject.he?.length > 0, 'missing Hebrew subject');
    assert.ok(topic.subject.ru?.length > 0, 'missing Russian subject');
    assert.notEqual(topic.subject.he, topic.subject.ru, 'the two must not be the same string');
  }
});

test('real Search Console demand outranks the seed backlog', () => {
  const topics = planWeeklyTopics({
    opportunities: [
      {
        query: 'ניקוי ספות דימונה',
        lang: 'he',
        city: 'dimona',
        impressions: 240,
        clicks: 1,
        ctr: 0.004,
        position: 14.2,
        opportunity: 'high_impressions_low_ctr',
      },
    ],
    existingTopicKeys: [],
  });
  assert.match(topics[0].topicKey, /^gsc-/);
  assert.match(topics[0].rationale, /Search Console/);
  assert.equal(topics[0].city, 'dimona');
});
