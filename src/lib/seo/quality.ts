import { CITY_SLUGS, LINK_TARGETS, MIN_WORDS, QUALITY_PASS, SERVICES, pricing } from '@/lib/seo/config';
import type { Article, Block, QualityCheck, QualityReport } from '@/lib/seo/types';

/**
 * The automated quality gate: ten checks an article must survive before a human
 * is ever shown it.
 *
 * Every check here is DETERMINISTIC — plain text and structure analysis, no
 * second model call. That matters for two reasons. A model grading its own
 * output is not a check, it is the same guess twice; and a deterministic gate
 * gives the same verdict on the same draft every time, so a rejection can be
 * explained to the operator in concrete terms ("this price is not in the price
 * list") instead of a vague score.
 *
 * The resulting score is INTERNAL. It is not a Google score and the dashboard
 * labels it as such wherever it appears.
 */

/** Cities outside the service area. Naming one implies service the business does not offer. */
const OUT_OF_AREA = [
  'תל אביב', 'תל-אביב', 'ירושלים', 'חיפה', 'ראשון לציון', 'פתח תקווה', 'פתח-תקווה',
  'נתניה', 'חולון', 'בת ים', 'רמת גן', 'גבעתיים', 'הרצליה', 'כפר סבא', 'רעננה',
  'אשדוד', 'מודיעין', 'בני ברק', 'רחובות', 'נהריה', 'עכו', 'טבריה', 'צפת',
  'Тель-Авив', 'Иерусалим', 'Хайфа', 'Нетания', 'Ашдод', 'Ришон-ле-Цион',
];

/**
 * Claims the business has not substantiated. A generated article that promises
 * a guarantee, a ranking or a removal rate is rejected outright — the spec
 * forbids inventing results, and an unkeepable promise is a liability for a
 * service business, not just an SEO problem.
 */
const UNFOUNDED = [
  '100%', 'מתחייבים', 'מובטח', 'הבטחה', 'אחריות מלאה', 'הזול ביותר', 'הטוב ביותר בארץ',
  'מספר 1', 'כל הכתמים יורדים', 'הסרת כל הכתמים', 'ללא יוצא מן הכלל',
  'гарантируем', 'гарантия', '100 %', 'самый дешёвый', 'самый дешевый', 'лучший в Израиле',
  'номер 1', 'выводим все пятна',
];

/** Flattens the structured body into the plain text the checks read. */
function bodyText(body: Block[]): string {
  return body
    .map((b) => (b.type === 'ul' ? b.items.join(' ') : b.text))
    .join('\n');
}

function words(text: string): string[] {
  return text.split(/[\s,.;:!?()[\]"'״׳—–-]+/u).filter(Boolean);
}

/** Share of letters belonging to one script — how a language mixup is caught. */
function scriptShare(text: string, re: RegExp): number {
  const letters = text.match(/\p{L}/gu) ?? [];
  if (letters.length === 0) return 0;
  const hits = text.match(re) ?? [];
  return hits.length / letters.length;
}

/** Word trigrams, for the overlap comparison in the duplication check. */
function shingles(text: string): Set<string> {
  const w = words(text.toLowerCase());
  const out = new Set<string>();
  for (let i = 0; i + 2 < w.length; i += 1) out.add(`${w[i]} ${w[i + 1]} ${w[i + 2]}`);
  return out;
}

/**
 * The draft being graded. A partial Article, because the gate runs on freshly
 * generated content that has no id or timestamps yet.
 */
export type Draft = Pick<
  Article,
  'lang' | 'city' | 'title' | 'meta_description' | 'h1' | 'body' | 'faq' | 'internal_links' | 'keywords'
>;

/**
 * Runs all ten checks.
 *
 * `existing` is every article already in the database (any status) EXCEPT the
 * one being graded — the duplication check needs it, and passing it in rather
 * than querying here keeps this module pure and unit-testable.
 */
export function runQualityChecks(draft: Draft, existing: Draft[] = []): QualityReport {
  const text = bodyText(draft.body);
  const all = `${draft.title}\n${draft.meta_description}\n${draft.h1}\n${text}`;
  const wordCount = words(text).length;
  const checks: QualityCheck[] = [];

  // 1 ── Service area. The city must be one we serve, and no out-of-area city
  //      may be named, since naming one implies we come there.
  const strayCity = OUT_OF_AREA.find((c) => all.includes(c));
  const cityValid = draft.city === null || (CITY_SLUGS as readonly string[]).includes(draft.city);
  checks.push({
    id: 'region',
    label: 'התאמה לאזור הדרום',
    pass: cityValid && !strayCity,
    detail: !cityValid
      ? `העיר "${draft.city}" אינה באזור השירות`
      : strayCity
        ? `המאמר מזכיר "${strayCity}" — מחוץ לאזור השירות`
        : draft.city
          ? `ממוקד ב-${draft.city}, בתוך אזור השירות`
          : 'מאמר אזורי כללי לדרום, ללא עיר ספציפית',
  });

  // 2 ── Language. A Hebrew article must actually be in Hebrew script and a
  //      Russian one in Cyrillic. This is what catches a translation mixup or
  //      an English fallback before a human reads a word.
  const share = draft.lang === 'he'
    ? scriptShare(text, /[֐-׿]/gu)
    : scriptShare(text, /[Ѐ-ӿ]/gu);
  checks.push({
    id: 'language',
    label: draft.lang === 'he' ? 'איכות עברית' : 'איכות רוסית',
    pass: share >= 0.6 && wordCount >= MIN_WORDS,
    detail: share < 0.6
      ? `רק ${Math.round(share * 100)}% מהתוכן בשפה הנדרשת`
      : wordCount < MIN_WORDS
        ? `${wordCount} מילים — מתחת למינימום ${MIN_WORDS}`
        : `${wordCount} מילים, ${Math.round(share * 100)}% בשפה הנדרשת`,
  });

  // 3 ── Professional accuracy. Every shekel figure in the text must appear in
  //      the price list. This is the check that makes an invented price
  //      impossible to publish rather than merely unlikely.
  const allowedPrices = new Set(
    SERVICES.flatMap((s) => (s.priceFrom === null ? [] : [String(s.priceFrom)])),
  );
  const quoted = [...all.matchAll(/(\d{2,5})\s*(?:₪|ש"ח|שח|шекел|NIS)/gu)].map((m) => m[1]);
  const badPrice = quoted.find((p) => !allowedPrices.has(p));
  checks.push({
    id: 'accuracy',
    label: 'דיוק מקצועי ומחירים',
    pass: !badPrice,
    detail: badPrice
      ? `המחיר ${badPrice} ₪ אינו במחירון המאושר`
      : quoted.length
        ? `כל ${quoted.length} המחירים שהוזכרו תואמים את המחירון`
        : 'לא הוזכרו מחירים',
  });

  // 4 ── Originality and value: enough substance, real structure, and no
  //      paragraph repeated to pad the length.
  const paras = draft.body.filter((b) => b.type === 'p').map((b) => (b as { text: string }).text.trim());
  const repeated = paras.length - new Set(paras).size;
  const headings = draft.body.filter((b) => b.type === 'h2' || b.type === 'h3').length;
  checks.push({
    id: 'originality',
    label: 'מקוריות וערך לקורא',
    pass: repeated === 0 && headings >= 3 && draft.faq.length >= 2,
    detail: repeated > 0
      ? `${repeated} פסקאות חוזרות על עצמן`
      : headings < 3
        ? `רק ${headings} כותרות משנה — התוכן שטוח מדי`
        : draft.faq.length < 2
          ? 'פחות משתי שאלות ותשובות'
          : `${headings} כותרות משנה, ${draft.faq.length} שאלות ותשובות`,
  });

  // 5 ── Duplication against content already in the system. Trigram overlap
  //      above 30% means the subject is already covered and this draft would
  //      compete with our own page.
  const mine = shingles(text);
  let worst = { ratio: 0, title: '' };
  for (const other of existing) {
    if (other.lang !== draft.lang) continue;
    const theirs = shingles(bodyText(other.body));
    if (theirs.size === 0 || mine.size === 0) continue;
    let shared = 0;
    for (const s of mine) if (theirs.has(s)) shared += 1;
    const ratio = shared / mine.size;
    if (ratio > worst.ratio) worst = { ratio, title: other.title };
  }
  checks.push({
    id: 'duplication',
    label: 'היעדר כפילות מול תוכן קיים',
    pass: worst.ratio < 0.3,
    detail: worst.ratio >= 0.3
      ? `${Math.round(worst.ratio * 100)}% חפיפה עם "${worst.title}"`
      : existing.length
        ? `החפיפה הגבוהה ביותר: ${Math.round(worst.ratio * 100)}% — בטווח התקין`
        : 'אין תוכן קיים להשוואה',
  });

  // 6 ── Headings and SEO tags. One H1, a title and description inside the
  //      lengths Google actually renders, and no H3 orphaned before its H2.
  const firstH3 = draft.body.findIndex((b) => b.type === 'h3');
  const firstH2 = draft.body.findIndex((b) => b.type === 'h2');
  const orphanH3 = firstH3 !== -1 && (firstH2 === -1 || firstH3 < firstH2);
  const titleOk = draft.title.length >= 25 && draft.title.length <= 65;
  const descOk = draft.meta_description.length >= 70 && draft.meta_description.length <= 160;
  const h1Ok = draft.h1.trim().length > 0;
  checks.push({
    id: 'headings',
    label: 'תקינות כותרות ותגיות SEO',
    pass: titleOk && descOk && h1Ok && !orphanH3 && firstH2 !== -1,
    detail: !h1Ok
      ? 'חסר H1'
      : !titleOk
        ? `אורך ה-Title ${draft.title.length} תווים (נדרש 25–65)`
        : !descOk
          ? `אורך ה-Meta Description ${draft.meta_description.length} תווים (נדרש 70–160)`
          : firstH2 === -1
            ? 'אין אף כותרת H2'
            : orphanH3
              ? 'כותרת H3 מופיעה לפני H2'
              : 'H1 יחיד, היררכיית H2/H3 תקינה, אורכי תגיות בטווח',
  });

  // 7 ── Internal links. Only known targets, and not so many that the article
  //      turns into a link farm.
  const allowed = new Set<string>(LINK_TARGETS.map((t) => t.href));
  const broken = draft.internal_links.filter((l) => !allowed.has(l.href) && !l.href.startsWith('/articles/'));
  const tooMany = draft.internal_links.length > 6;
  checks.push({
    id: 'links',
    label: 'תקינות קישורים פנימיים',
    pass: broken.length === 0 && draft.internal_links.length >= 1 && !tooMany,
    detail: broken.length
      ? `קישור לא מוכר: ${broken[0].href}`
      : draft.internal_links.length === 0
        ? 'אין אף קישור פנימי'
        : tooMany
          ? `${draft.internal_links.length} קישורים — הצפת קישורים`
          : `${draft.internal_links.length} קישורים, כולם לנתיבים קיימים`,
  });

  // 8 ── Search intent. The phrase we are targeting has to appear in the title
  //      and in the body, or the page answers a question nobody asked.
  const primary = draft.keywords[0]?.toLowerCase().trim() ?? '';
  const inTitle = primary.length > 0 && draft.title.toLowerCase().includes(primary);
  const inBody = primary.length > 0 && text.toLowerCase().includes(primary);
  checks.push({
    id: 'intent',
    label: 'התאמה לכוונת החיפוש',
    pass: inTitle && inBody,
    detail: !primary
      ? 'לא הוגדר ביטוי מטרה'
      : !inTitle
        ? `הביטוי "${primary}" לא מופיע בכותרת`
        : !inBody
          ? `הביטוי "${primary}" לא מופיע בגוף המאמר`
          : `הביטוי "${primary}" מופיע בכותרת ובגוף`,
  });

  // 9 ── Unfounded promises. See the UNFOUNDED list: guarantees and
  //      superlatives the business never authorised.
  const promise = UNFOUNDED.find((p) => all.includes(p));
  checks.push({
    id: 'claims',
    label: 'היעדר הבטחות לא מבוססות',
    pass: !promise,
    detail: promise ? `נמצאה הבטחה לא מבוססת: "${promise}"` : 'לא נמצאו הבטחות או נתונים לא מבוססים',
  });

  // 10 ─ Google Search Central basics: no keyword stuffing, and a description
  //      that is not just the title again.
  const density = primary && wordCount
    ? (text.toLowerCase().split(primary).length - 1) * words(primary).length / wordCount
    : 0;
  const descEchoesTitle = draft.meta_description.trim() === draft.title.trim();
  const hasDisclaimer = quoted.length === 0
    || all.includes(pricing.disclaimer[draft.lang].slice(0, 25));
  checks.push({
    id: 'guidelines',
    label: 'התאמה להנחיות Google Search Central',
    pass: density <= 0.03 && !descEchoesTitle && hasDisclaimer,
    detail: density > 0.03
      ? `צפיפות ביטוי המטרה ${(density * 100).toFixed(1)}% — הצפת מילות מפתח`
      : descEchoesTitle
        ? 'ה-Meta Description זהה ל-Title'
        : !hasDisclaimer
          ? 'המאמר מזכיר מחיר בלי הסתייגות המחיר הסופי'
          : 'ללא הצפת מילות מפתח, תגיות ייחודיות',
  });

  const passed = checks.filter((c) => c.pass).length;
  return {
    score: Math.round((passed / checks.length) * 100),
    checks,
    checkedAt: new Date().toISOString(),
  };
}

/**
 * Whether a report clears the bar for the human approval queue.
 *
 * Two gates, not one: a high enough score AND no failure in the checks that
 * must never be waived. An article that names a city we do not serve, invents a
 * price or makes a promise the business cannot keep does not reach a human at
 * all, however well it scores elsewhere.
 */
export const BLOCKING_CHECKS = ['region', 'accuracy', 'claims', 'links'] as const;

export function clearsGate(report: QualityReport): boolean {
  const blocked = report.checks.some(
    (c) => (BLOCKING_CHECKS as readonly string[]).includes(c.id) && !c.pass,
  );
  return !blocked && report.score >= QUALITY_PASS;
}
