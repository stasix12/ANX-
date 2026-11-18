/**
 * ─── כיסוי ארצי · THE CATALOG FILLING ITSELF ───────────────────────────────
 *
 *   "מאגר קבוצות פייסבוק מרכזי, ארצי, חכם ומתעדכן אוטומטית, שמכסה את כל
 *    הערים בישראל." — 18.11.2026, and "אז תעשה את הקוד" for this part.
 *
 * ─── WHAT THIS IS, AND WHAT IT IS NOT ─────────────────────────────────────
 *
 * It is a PLAN: a list of search phrases, in an order, with a cursor. Nothing
 * here opens a browser, talks to Facebook or decides when anything runs — the
 * worker does that, through the one path it has always used for a search a
 * person typed (the `discover` command). This module is the part that can be
 * read, tested and argued with.
 *
 * It is NOT a scraper, and the distinction is the whole safety story: every
 * phrase it produces is a phrase the owner could have typed into the same box
 * himself, it is run one at a time with hours between them, and what comes
 * back is read, never joined, never messaged, never clicked.
 *
 * ─── WHY PHRASES AND NOT "CATEGORIES" ─────────────────────────────────────
 *
 * The brief asks for ten categories. A category is only useful here if it
 * matches how Israeli groups are actually NAMED, because a search finds names:
 * nobody calls a group "real estate", they call it "דירות להשכרה בחיפה". So
 * the ten below are the words that really open those names — each one both a
 * search phrase and, when a group's own name carries it, the category that
 * group is filed under.
 *
 * ─── AND IT IS SLOW ON PURPOSE ────────────────────────────────────────────
 *
 * 413 localities × 10 phrases is 4,130 searches. At the default six a day
 * that is years, which is exactly why the order matters more than the size:
 * the cities he already publishes in come first, then the big ones, then the
 * rest. The first fifty cities — where most of the country's groups are — are
 * covered in about eighty days at the default, or three weeks at the ceiling.
 * Faster than that is not a setting this product offers, because the account
 * doing the searching is the one his business publishes from.
 */
import { ALL_CITIES, OTHER_CITY, regionOf } from './cities';

/** One kind of group, as a phrase that really opens their names. */
export interface CoverageTopic {
  id: string;
  /** The word searched, and the word looked for in a name. */
  word: string;
  /** Other spellings of the same thing, for reading a name. */
  also?: readonly string[];
}

/**
 * THE TEN. Each is a phrase an Israeli group is really named with — and the
 * category a group gets when its own name carries the word.
 */
export const COVERAGE_TOPICS: readonly CoverageTopic[] = [
  { id: 'יד שנייה', word: 'יד שנייה', also: ['יד 2', 'יד2', 'יד שניה'] },
  { id: 'לוח מודעות', word: 'לוח מודעות', also: ['לוח'] },
  { id: 'דרושים', word: 'דרושים', also: ['דרושות', 'עבודה'] },
  { id: 'נדל״ן', word: 'דירות', also: ['נדלן', 'נדל"ן', 'להשכרה', 'למכירה'] },
  { id: 'תושבים', word: 'תושבי', also: ['קהילת', 'תושבות'] },
  { id: 'עסקים', word: 'עסקים', also: ['בעלי עסקים', 'ממליצים'] },
  { id: 'המלצות', word: 'המלצות', also: ['ממליצים על'] },
  { id: 'אבידות', word: 'אבידות ומציאות', also: ['אבידות'] },
  { id: 'מה קורה', word: 'מה קורה', also: ['אירועים'] },
  { id: 'הורים', word: 'הורים', also: ['גן ילדים', 'חוגים'] },
];

/** The phrase the machine will search: "יד שנייה באר שבע". */
export function coveragePhrase(city: string, topic: CoverageTopic): string {
  return `${topic.word} ${city}`.trim();
}

/** A step is one city and one topic, named so a cursor can be stored. */
export function coverageKey(city: string, topicId: string): string {
  return `${topicId}|${city}`;
}

/**
 * The cities Israel's groups are actually in, in the order worth searching.
 *
 * NOT A POPULATION TABLE — this product has none and inventing one would be a
 * number nobody checked. It is the list everybody would name if asked which
 * cities in Israel are big, and its only job is to decide what gets searched
 * in the first three months rather than the third year.
 */
export const BIG_CITIES: readonly string[] = [
  'ירושלים', 'תל אביב-יפו', 'חיפה', 'ראשון לציון', 'פתח תקווה', 'אשדוד', 'נתניה', 'באר שבע',
  'בני ברק', 'חולון', 'רמת גן', 'רחובות', 'אשקלון', 'בת ים', 'בית שמש', 'כפר סבא', 'הרצליה',
  'חדרה', 'מודיעין-מכבים-רעות', 'נצרת', 'לוד', 'רמלה', 'רעננה', 'ביתר עילית', 'קריית גת',
  'נהריה', 'טבריה', 'אום אל-פחם', 'רהט', 'עפולה', 'אילת', 'עכו', 'קריית אתא', 'אלעד',
  'כרמיאל', 'צפת', 'דימונה', 'טמרה', 'סח\'נין', 'שפרעם', 'יבנה', 'נס ציונה', 'אור יהודה',
  'קריית מוצקין', 'קריית ביאליק', 'קריית ים', 'מעלה אדומים', 'נוף הגליל', 'ערד', 'שדרות',
];

/**
 * The whole plan, in order: his own cities first, then the big ones, then the
 * rest of the country.
 *
 * HIS OWN FIRST, and that is not a courtesy — it is where the next group he
 * actually publishes to is. A plan that starts alphabetically would spend its
 * first month on Abu Ghosh.
 */
export function coverageCities(mine: readonly string[] = []): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  const take = (city: string) => {
    const name = (city ?? '').trim();
    if (!name || name === OTHER_CITY || seen.has(name)) return;
    /* Only a real locality: his own list can hold "אחר" and anything a human
       typed into the city field. */
    if (!regionOf(name)) return;
    seen.add(name);
    out.push(name);
  };
  for (const c of mine) take(c);
  for (const c of BIG_CITIES) take(c);
  for (const c of [...ALL_CITIES].sort((a, b) => a.localeCompare(b, 'he'))) take(c);
  return out;
}

/**
 * The next phrase to search, or null when the plan is finished.
 *
 * CITY-MAJOR: all ten phrases for one city, then the next city. A city that
 * has been searched is a city whose groups are IN the catalog and can be
 * published to — ten cities covered ten ways beats a hundred cities covered
 * once.
 */
export function nextCoverageStep(
  done: readonly string[],
  mine: readonly string[] = [],
): { city: string; topic: CoverageTopic; phrase: string; key: string } | null {
  const finished = new Set(done);
  for (const city of coverageCities(mine)) {
    for (const topic of COVERAGE_TOPICS) {
      const key = coverageKey(city, topic.id);
      if (finished.has(key)) continue;
      return { city, topic, phrase: coveragePhrase(city, topic), key };
    }
  }
  return null;
}

/** How many steps the plan holds in total, for an honest progress line. */
export function coverageTotal(mine: readonly string[] = []): number {
  return coverageCities(mine).length * COVERAGE_TOPICS.length;
}

/**
 * ─── THE PACE ─────────────────────────────────────────────────────────────
 *
 * Six a day by default: one search every four hours, in an idle window,
 * never while a publication is due. The ceiling is twenty-four — one an hour
 * — and there is no setting above it, because the account doing the searching
 * is the one his business publishes from.
 */
export const COVERAGE_PER_DAY_DEFAULT = 6;
export const COVERAGE_PER_DAY_MIN = 3;
export const COVERAGE_PER_DAY_MAX = 24;

export function clampCoveragePerDay(n: number | null | undefined): number {
  const v = Math.round(Number(n));
  if (!Number.isFinite(v)) return COVERAGE_PER_DAY_DEFAULT;
  return Math.min(COVERAGE_PER_DAY_MAX, Math.max(COVERAGE_PER_DAY_MIN, v));
}

/** Milliseconds between two searches at this pace. */
export function coverageGapMs(perDay: number): number {
  return Math.round((24 * 60 * 60_000) / clampCoveragePerDay(perDay));
}

/**
 * Which of the ten a group's own NAME belongs to — the category it is filed
 * under in the catalog.
 *
 * READ FROM THE NAME, not from the search that found it. Facebook's search is
 * fuzzy: "יד שנייה חיפה" returns groups with neither word in them, and filing
 * those under "יד שנייה" would be a category nobody can trust. A group is
 * filed only when it says so itself.
 */
export function detectTopic(name: string | null | undefined): string {
  const text = (name ?? '').trim();
  if (!text) return '';
  for (const topic of COVERAGE_TOPICS) {
    for (const word of [topic.word, ...(topic.also ?? [])]) {
      if (text.includes(word)) return topic.id;
    }
  }
  return '';
}

/** A short, honest line about where the plan has got to. */
export function coverageProgress(done: readonly string[], mine: readonly string[] = []): {
  done: number;
  total: number;
  cities: number;
  citiesDone: number;
} {
  const cities = coverageCities(mine);
  const finished = new Set(done);
  let citiesDone = 0;
  for (const city of cities) {
    if (COVERAGE_TOPICS.every((t) => finished.has(coverageKey(city, t.id)))) citiesDone += 1;
  }
  return { done: finished.size, total: cities.length * COVERAGE_TOPICS.length, cities: cities.length, citiesDone };
}

/** The region a plan step belongs to — for a progress line that reads well. */
export const coverageRegionOf = regionOf;
