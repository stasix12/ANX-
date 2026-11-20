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
 * 413 localities × 11 phrases is 4,543 searches: at the default six a day
 * that is two years, at the ceiling of seventy-two about nine weeks. Which is
 * exactly why the ORDER matters more than the size — and why the order is two
 * rounds rather than city-by-city (see nextCoverageStep).
 *
 * Round 1 is the bare name of all 413 localities: 69 days at the default,
 * 5.7 days at the ceiling. Only then does any city get its second phrase, so
 * the fifty cities where most of the country's groups are do not have all
 * eleven of their phrases until 413 + 500 searches have run — about 152 days
 * at the default, under 13 at the ceiling. The earlier version of this
 * comment promised those fifty "in about eighty days", which was true of the
 * city-major order this file no longer has; the whole-country round comes
 * first now because that is what was asked for.
 *
 * Faster than the ceiling is not a setting this product offers, because the
 * account doing the searching is the one his business publishes from.
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
  /*
   * ─── THE CITY ON ITS OWN, FIRST ────────────────────────────────────────
   *
   * "תחפש את כל הקבוצות שיש בישראל."
   *
   * The highest-yielding phrase for a city is its name. "חיפה" returns every
   * kind of group at once — the ones named for the city and the ones that
   * merely mention it — where "יד שנייה חיפה" returns one kind. It is first
   * in the list so that a city's single best search runs before its nine
   * narrower ones, and a plan that is stopped halfway has still read the
   * broadest page for every city it reached.
   *
   * Its `word` is empty: coveragePhrase() then produces the city alone.
   * Nothing is ever FILED under it — detectTopic skips an empty word — so a
   * group found this way keeps whatever category its own name says.
   */
  { id: 'העיר', word: '' },
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
 * ─── THE WHOLE COUNTRY FIRST, THEN THE DEPTH ─────────────────────────────
 *
 *   "אני רוצה שבשבוע הקרוב תסרוק את כל הקבוצות של הערים בפייסבוק בישראל."
 *
 * TWO ROUNDS, and the order between them is the entire answer to that.
 *
 *   Round 1 — the bare name of EVERY city, 413 searches. It is the broadest
 *   page each city has: "חיפה" returns its second-hand groups, its jobs
 *   groups and its neighbourhood groups at once. At the ceiling this round
 *   finishes in under a week, and when it does, every city in the country has
 *   been read.
 *
 *   Round 2 — the ten narrower phrases, city by city, as before.
 *
 * It used to be city-major from the start: all eleven phrases for Arad, then
 * all eleven for Be'er Sheva. A week of that is thirty cities covered deeply
 * and three hundred and eighty untouched — the opposite of what he asked for.
 * The other order, 4,543 searches in a week, is one every two minutes, which
 * is the rate that gets the account his business publishes from restricted.
 * So the plan changes and the pace does not.
 */
export function nextCoverageStep(
  done: readonly string[],
  mine: readonly string[] = [],
): { city: string; topic: CoverageTopic; phrase: string; key: string } | null {
  const finished = new Set(done);
  const cities = coverageCities(mine);
  const [broad, ...narrow] = COVERAGE_TOPICS;

  /* Round 1: the country, once. */
  for (const city of cities) {
    const key = coverageKey(city, broad.id);
    if (finished.has(key)) continue;
    return { city, topic: broad, phrase: coveragePhrase(city, broad), key };
  }

  /* Round 2: the depth, city by city. */
  for (const city of cities) {
    for (const topic of narrow) {
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
 * Six a day by default: one search every four hours, and never while a
 * publication is due — a promise the worker keeps in runCommands, which holds
 * an automatic command back until the queue is clear, not merely in
 * coveragePass, which only decides when to QUEUE one. See autoCommandHold.
 *
 * The ceiling is SEVENTY-TWO — one every twenty minutes — raised from
 * twenty-four on 18.11 at his explicit request; the note on
 * COVERAGE_PER_DAY_MAX below is the whole of why. There is no setting above
 * it, because the account doing the searching is the one his business
 * publishes from.
 */
export const COVERAGE_PER_DAY_DEFAULT = 6;
export const COVERAGE_PER_DAY_MIN = 3;
/*
 * 24 → 48 → 72 on 18.11, at his explicit request, and it is the last number
 * in this file that is a judgement rather than a measurement.
 *
 * 72 a day is one search every twenty minutes, which finishes round 1 — the
 * bare name of all 413 cities — in five and a half days. That is what "scan
 * all the country's city groups this week" really costs, and it is why the
 * ORDER changed rather than the rate: the week he asked for buys the whole
 * country at this pace, while buying it at the pace the naive reading implies
 * (4,543 searches in seven days, one every two minutes) buys a restricted
 * account instead.
 *
 * A page load every twenty minutes from a machine that is signed in all day
 * anyway is still a page load every twenty minutes. The burst guard in the
 * worker (IDLE_WINDOW_LIMIT) is what actually stops a storm and is untouched,
 * and the DEFAULT is still six.
 */
export const COVERAGE_PER_DAY_MAX = 72;

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
 * When the last search was queued, as an instant a caller may compare.
 *
 * A STAMP THAT CANNOT BE TRUSTED MEANS "WAIT", NEVER "NEVER RAN".
 *
 * The worker had this inline as
 * `Number.isFinite(last) && last <= nowMs ? last : 0`, and the `: 0` is the
 * whole bug: a stamp in the future, or one that will not parse, fell through
 * to zero — and zero skips the gap check entirely, because the check reads
 * `if (lastMs && …)`. The one case where the conservative answer is obvious
 * got the least conservative one.
 *
 * With one worker that self-heals after a single unpaced search, since the
 * next write stamps the local clock. With TWO workers sharing the row it does
 * not: two workers are supported by design (the single-instance check only
 * rejects a duplicate of the same worker NAME), and if one clock runs an hour
 * fast they ping-pong — each sees a stamp written against the other's clock,
 * each decides the gap is open, and a deep Facebook search is queued on every
 * five-second tick while the screen still says one every twenty minutes.
 *
 * Treating an untrustworthy stamp as "just ran" costs one interval and is
 * self-correcting. It lives here, and not in the worker, so it can be CALLED
 * by a test instead of grepped for.
 */
export function coverageLastRun(at: string | null | undefined, nowMs: number): number {
  if (!at) return 0;
  const parsed = Date.parse(at);
  if (!Number.isFinite(parsed)) return nowMs;
  return Math.min(parsed, nowMs);
}

/**
 * The same interval in the words the settings screen prints — "אחד כל 20 דקות".
 *
 * CALCULATED, BECAUSE THE DESCRIPTION WENT STALE. The hint under the input
 * said "עם שעות ביניהם" and kept saying it when the ceiling went from
 * twenty-four a day to seventy-two, where the gap is twenty minutes: the
 * screen understated what it does by three times, at the exact value its own
 * `max` attribute invites. A sentence derived from the number cannot drift
 * from it again.
 */
export function coverageGapLabel(perDay: number): string {
  const mins = Math.round(coverageGapMs(perDay) / 60_000);
  if (mins < 60) return `אחד כל ${mins} דקות`;
  const hours = mins / 60;
  if (hours === 1) return 'אחד כל שעה';
  const said = Number.isInteger(hours) ? String(hours) : hours.toFixed(1);
  return `אחד כל ${said} שעות`;
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
      /* An empty word is in every string. The bare-city phrase has one, and
         it is a way of SEARCHING, not a category to file a group under. */
      if (word && text.includes(word)) return topic.id;
    }
  }
  return '';
}

/** A short, honest line about where the plan has got to. */
export function coverageProgress(done: readonly string[], mine: readonly string[] = []): {
  done: number;
  total: number;
  cities: number;
  /** Cities whose broad page has been read — round 1. */
  citiesTouched: number;
  /** Cities whose eleven phrases have all run — round 2. */
  citiesDone: number;
} {
  const cities = coverageCities(mine);
  const finished = new Set(done);
  /*
   * TWO NUMBERS, BECAUSE THE PLAN HAS TWO ROUNDS. Counting only the cities
   * that are FINISHED would show zero for the whole of round 1 — the week in
   * which every city in the country is read once — and a progress line that
   * says zero while the machine works all week is a progress line nobody
   * believes again.
   */
  let citiesTouched = 0;
  let citiesDone = 0;
  for (const city of cities) {
    if (finished.has(coverageKey(city, COVERAGE_TOPICS[0].id))) citiesTouched += 1;
    if (COVERAGE_TOPICS.every((t) => finished.has(coverageKey(city, t.id)))) citiesDone += 1;
  }
  return {
    done: finished.size,
    total: cities.length * COVERAGE_TOPICS.length,
    cities: cities.length,
    citiesTouched,
    citiesDone,
  };
}

/** The region a plan step belongs to — for a progress line that reads well. */
export const coverageRegionOf = regionOf;
