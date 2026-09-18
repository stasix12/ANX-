/**
 * City detection for targets, from the group's name. Hebrew, English and
 * Russian spellings; anything unmatched is "אחר". Shared by the dashboard
 * (on load / on add) and the worker (after it fetches the real name).
 */
export const OTHER_CITY = 'אחר';

const CITY_PATTERNS: [string, RegExp][] = [
  ['ערד', /ערד|\barad\b|арад/i],
  ['באר שבע', /באר[\s-]?שבע|ב["'׳״]?ש\b|beer[\s-]?sheva|beersheba|b7\b|беэр[\s-]?шев|беэр-шева/i],
  ['אופקים', /אופקים|ofakim|офаким/i],
  ['דימונה', /דימונה|dimona|димон/i],
  ['נתיבות', /נתיבות|netivot|нетивот/i],
  ['שדרות', /שדרות|sderot|сдерот/i],
  ['ירוחם', /ירוחם|yeruham|йерухам/i],
  ['מצפה רמון', /מצפה[\s-]?רמון|mitzpe|мицпе/i],
  ['אשקלון', /אשקלון|ashkelon|ашкелон/i],
  ['אשדוד', /אשדוד|ashdod|ашдод/i],
  ['קריית גת', /קרי?ית[\s-]?גת|kiryat[\s-]?gat|кирьят[\s-]?гат/i],
  ['עומר', /\bעומר\b|\bomer\b/i],
  ['להבים', /להבים|lehavim/i],
  ['מיתר', /\bמיתר\b|meitar/i],
  ['רהט', /\bרהט\b|rahat/i],
];

export function detectCity(name: string): string {
  for (const [city, re] of CITY_PATTERNS) {
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

export const KNOWN_CITIES = CITY_PATTERNS.map(([c]) => c);
