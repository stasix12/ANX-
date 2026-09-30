/**
 * City detection for targets, from the group's name. Hebrew, English and
 * Russian spellings; anything unmatched is "אחר". Shared by the dashboard
 * (on load / on add) and the worker (after it fetches the real name).
 */
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

/*
 * PLACES THIS BUSINESS DOES NOT DRIVE TO.
 *
 * The list above is the owner's own region — a group that names one of those
 * cities is a group in his market. This list is the other direction, and it
 * exists for one question: "is this group about somewhere I do not work?"
 *
 * It is used ONLY by the audience suggestion (audience.ts), and only to offer
 * an answer a person then accepts or rejects. Nothing is filtered by it
 * automatically, because a group named after a distant city can still be the
 * one his cousin runs — the owner knows, this file does not.
 *
 * The label is a display name, so a suggestion can say "נראית כמו קבוצה של תל
 * אביב" in the reason the owner reads. Cities from the region list above are
 * deliberately absent: two lists that both claim a city would make the
 * suggestion depend on which one was consulted first.
 */
const AREA_PATTERNS: [string, RegExp][] = [
  ['תל אביב', /תל[\s-]?אביב|ת["'׳״]?א(?![\p{L}])|tel[\s-]?aviv|тель[\s-]?авив/iu],
  ['ירושלים', /ירושלים|jerusalem|иерусалим/i],
  ['חיפה', /חיפה|haifa|хайфа/i],
  ['נתניה', /נתניה|netanya|нетания/i],
  ['רעננה', /רעננה|raanana/i],
  ['הרצליה', /הרצליה|herzliya/i],
  ['רמת גן', /רמת[\s-]?גן|ramat[\s-]?gan/i],
  ['גבעתיים', /גבעתיים|givatayim/i],
  ['בת ים', /בת[\s-]?ים|bat[\s-]?yam/i],
  ['חולון', /חולון|holon/i],
  ['ראשון לציון', /ראשון[\s-]?לציון|rishon/i],
  ['רחובות', /רחובות|rehovot|реховот/i],
  ['נס ציונה', /נס[\s-]?ציונה|ness?[\s-]?ziona/i],
  ['מודיעין', /מודיעין|modiin/i],
  ['בית שמש', /בית[\s-]?שמש|beit[\s-]?shemesh/i],
  ['פתח תקווה', /פתח[\s-]?תקו?ו?ה|petah/i],
  ['כפר סבא', /כפר[\s-]?סבא|kfar[\s-]?saba/i],
  ['הוד השרון', /הוד[\s-]?השרון|hod[\s-]?hasharon/i],
  ['ראש העין', /ראש[\s-]?העין|rosh[\s-]?haayin/i],
  ['חדרה', /חדרה|hadera|хадера/i],
  ['הקריות', /קריית[\s-]?(ביאליק|ים|מוצקין|חיים)|הקריות/i],
  ['עכו', /(?<![\p{L}])עכו(?![\p{L}])|\bakko\b|\bacre\b/iu],
  ['נהריה', /נהריה|nahariya/i],
  ['כרמיאל', /כרמיאל|karmiel|кармиэль/i],
  ['צפת', /(?<![\p{L}])צפת(?![\p{L}])|\bsafed\b/iu],
  ['טבריה', /טבריה|tiberias/i],
  ['עפולה', /עפולה|afula/i],
  ['נצרת', /נצרת|nazareth/i],
  ['בית שאן', /בית[\s-]?שאן/i],
  ['קריית שמונה', /קריית[\s-]?שמונה/i],
  ['אילת', /(?<![\p{L}])אילת(?![\p{L}])|\beilat\b|эйлат/iu],
  ['יבנה', /(?<![\p{L}])יבנה(?![\p{L}])|\byavne\b/iu],
  ['גדרה', /(?<![\p{L}])גדרה(?![\p{L}])/iu],
  ['לוד', /(?<![\p{L}])לוד(?![\p{L}])|\blod\b/iu],
  ['רמלה', /(?<![\p{L}])רמלה(?![\p{L}])|\bramla\b/iu],
];

export const OTHER_AREAS: [string, RegExp][] = AREA_PATTERNS.filter(([name]) => !KNOWN_CITIES.includes(name));
