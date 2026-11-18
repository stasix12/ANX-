/**
 * City detection for targets, from the group's name. Hebrew, English and
 * Russian spellings; anything unmatched is "אחר". Shared by the dashboard
 * (on load / on add) and the worker (after it fetches the real name).
 */
import { CITY_REGION, CITY_SPELLINGS, DO_NOT_DETECT, HEBREW_PREFIXES, REGIONS, type Region } from './cities-data';

export { REGIONS, type Region };

export const OTHER_CITY = 'אחר';

const CITY_PATTERNS: [string, RegExp][] = [
  ['ערד', /ערד|\barad\b|арад/i],
  // \b does not work next to Hebrew letters (they are not \w), hence the lookarounds.
  ['באר שבע', /באר[\s-]?שבע|(?<![\p{L}])ב["'׳״]?ש(?![\p{L}])|beer[\s-]?sheva|beersheba|b7\b|беэр[\s-]?шев|беэр-шева/iu],
  ['אופקים', /אופקים|ofakim|офаким/i],
  ['דימונה', /דימונה|dimona|димон/i],
  ['נתיבות', /נתיבות|netivot|нетивот/i],
  ['שדרות', /שדרות|sderot|сдерот/i],
  ['ירוחם', /ירוחם|yeruham|йерухам/i],
  ['מצפה רמון', /מצפה[\s-]?רמון|mitzpe|мицпе/i],
  ['אשקלון', /אשקלון|ashkelon|ашкелон/i],
  ['אשדוד', /אשדוד|ashdod|ашдод/i],
  ['קריית גת', /קרי?ית[\s-]?גת|kiryat[\s-]?gat|кирьят[\s-]?гат/i],
  ['עומר', /(?<![\p{L}])עומר(?![\p{L}])|\bomer\b/iu],
  ['להבים', /להבים|lehavim/i],
  ['מיתר', /(?<![\p{L}])מיתר(?![\p{L}])|meitar/iu],
  ['רהט', /(?<![\p{L}])רהט(?![\p{L}])|rahat/iu],
];

/** The fifteen tuned by hand above — never regenerated over. */
const KNOWN_FIRST = new Set(CITY_PATTERNS.map(([c]) => c));

export function detectCity(name: string): string {
  const text = (name ?? '').trim();
  if (!text) return OTHER_CITY;
  const had = DETECTED.get(text);
  if (had !== undefined) return had;
  const found = detectCityUncached(text);
  DETECTED.set(text, found);
  return found;
}

function detectCityUncached(name: string): string {
  /* THE HAND-TUNED FIFTEEN FIRST — see the note on GENERATED_PATTERNS. */
  for (const [city, re] of CITY_PATTERNS) {
    if (re.test(name)) return city;
  }
  for (const [city, re] of GENERATED_PATTERNS) {
    if (re.test(name)) return city;
  }
  return OTHER_CITY;
}

/** Display order: the business's main cities first, then the rest, "אחר" last. */
export function sortCities(cities: string[], primary: string[] = ['ערד', 'באר שבע', 'אופקים']): string[] {
  const set = Array.from(new Set(cities.filter(Boolean)));
  return set.sort((a, b) => {
    const ia = primary.indexOf(a);
    const ib = primary.indexOf(b);
    if (a === OTHER_CITY) return 1;
    if (b === OTHER_CITY) return -1;
    if (ia !== -1 || ib !== -1) return (ia === -1 ? 99 : ia) - (ib === -1 ? 99 : ib);
    return a.localeCompare(b, 'he');
  });
}

/**
 * ─── כל הארץ, מעבר לחמש-עשרה הערים שהעסק הזה התחיל מהן ────────────────────
 *
 * "במאגר הארצי להוסיף את כל הערים של כל הארץ כולל צפון מרכז דרום ואילת."
 *
 * CITY_PATTERNS above stays exactly as it is and stays FIRST. Those fifteen
 * are the south this business actually works in, and each one is tuned by
 * hand — the ב״ש abbreviation, b7, Russian spellings, the lookarounds that
 * stop "עומר" matching inside another word. Nothing generated is allowed to
 * replace a rule somebody wrote on purpose.
 *
 * What follows is the rest of the country, built from cities-data.ts.
 *
 * ─── WHY THE SHORT AND COMMON NAMES ARE NOT DETECTED ──────────────────────
 *
 * A few localities are also ordinary Hebrew words — אזור (an area), זמר (a
 * singer), מתן (a gift). A group called "מכירות אזור המרכז" is not a group in
 * the town of אזור, and filing it there would put a wrong chip on a real
 * group. They stay in CITY_REGION, so a group really in one of them can be
 * filed there by hand or by the catalog, and only the automatic reading of a
 * NAME skips them.
 *
 * ─── ORDER: THE LONGEST NAME WINS ────────────────────────────────────────
 *
 * "מגדל העמק" must be tested before "מגדל", or every group in the Emek is
 * filed under a town it is not in. Sorted by length, descending, once.
 */
/* The list lives in cities-data.ts with the other place names — see the note
   there. Here it is only the rule that uses it. */
const AMBIGUOUS_NAMES = new Set<string>(DO_NOT_DETECT);

/** `א` … `ת` plus the final forms — what a Hebrew word is made of. */
const HEB = '\\u0590-\\u05FF';

function escapeForRegex(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * One locality's spellings as a single alternation, guarded so that a short
 * name cannot match inside a longer word.
 *
 * The Hebrew guard is a lookaround and not `\b`: `\b` is defined against
 * [A-Za-z0-9_], so next to a Hebrew letter there is never a word boundary and
 * every such pattern would match nothing at all. (That exact mistake cost a
 * test that could never fail — see worker/test/catalog-screen.test.ts.)
 */
function cityPattern(he: string, spellings: readonly string[]): RegExp {
  const forms = [he, ...spellings]
    /* A hyphenated or spaced name is written both ways: "תל אביב-יפו",
       "תל אביב", "תל-אביב". One pattern covers all three. */
    .map((f) => escapeForRegex(f).replace(/[\s\u2010-\u2015-]+/g, '[\\s\u2010-\u2015-]?'))
    /*
     * ─── RUSSIAN DECLINES, AND THE GROUPS ARE NAMED IN IT ──────────────
     *
     * "Квартиры в Хайфе" is a Haifa group; "Беэр-Шева объявления" and
     * "в Беэр-Шеве" are the same city. Stored in the nominative only, the
     * pattern misses every name that puts the city in any other case — which
     * in Russian is most of them, because the city usually follows в / из /
     * по. The final vowel is dropped and up to three Cyrillic letters are
     * allowed after the stem, which covers the cases without reaching into
     * another word: the guard after it still requires a non-letter.
     */
    .map((f) => (/^[\u0400-\u04FF]/.test(f) ? `${f.replace(/[аяыиоеуёюь]$/i, '')}[\\u0430-\\u044F\\u0451]{0,3}` : f))
    .filter(Boolean);
  const body = `(?:${[...new Set(forms)].join('|')})`;
  /*
   * ─── THE ONE LETTER IN FRONT ──────────────────────────────────────────
   *
   * Hebrew attaches its prepositions to the word: a group is "דירות להשכרה
   * בתל אביב", not "ב תל אביב". A guard that refuses any Hebrew letter in
   * front therefore refuses the way people actually write the city — the
   * first version of this missed בתל אביב, בחיפה and ברהט, which is most of
   * the real names.
   *
   * So up to two of ב ל מ ו ה ש כ may stand in front, which covers "בחיפה",
   * "ובאשדוד", "שברהט" — and nothing else may, so "מוערד" still does not
   * match ערד.
   */
  const prefix = `[${HEBREW_PREFIXES}]{0,2}`;
  return new RegExp(`(?<![${HEB}\\p{L}])${prefix}${body}(?![${HEB}\\p{L}])`, 'iu');
}

const GENERATED_PATTERNS: [string, RegExp][] = Object.keys(CITY_REGION)
  .filter((he) => !KNOWN_FIRST.has(he) && !AMBIGUOUS_NAMES.has(he))
  .sort((a, b) => b.length - a.length)
  .map((he) => [he, cityPattern(he, CITY_SPELLINGS[he] ?? [])]);

/**
 * Read once per distinct name, not once per render.
 *
 * detectCity is called from the groups screen for every group on every pass,
 * and it is now four hundred patterns rather than fifteen. The answer for a
 * given name cannot change while the page is open, so it is remembered.
 */
const DETECTED = new Map<string, string>();

/** The region a locality belongs to, or '' when we have never heard of it. */
export function regionOf(city: string | null | undefined): Region | '' {
  return CITY_REGION[(city ?? '').trim()] ?? '';
}

/** Whether this locality is in that region — the catalog's city filter. */
export function cityInRegion(city: string, region: string): boolean {
  return Boolean(region) && regionOf(city) === region;
}

/** Every locality the app knows, for a filter that covers the country. */
export const ALL_CITIES: readonly string[] = Object.keys(CITY_REGION);

export const KNOWN_CITIES = CITY_PATTERNS.map(([c]) => c);

/*
 * AREA_PATTERNS AND OTHER_AREAS ARE GONE WITH THE FEATURE THAT USED THEM.
 *
 * They existed only to answer "is this group about somewhere I do not work?"
 * for the audience suggestion — "לפרסם רק לאן שיש לקוחות" — which the owner
 * asked to have removed. Nothing else in the product ever read them, and a
 * table of a hundred regular expressions kept for nobody is a file that gets
 * believed later. The region list above, which detectCity() uses, is untouched.
 */
