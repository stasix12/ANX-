/**
 * Rule-based offer extraction from real ad copy (Hebrew + English).
 * Rows created from this are DERIVED — computed from REAL text, and each
 * ad_offers link records detected_by='rule'. No model guessing here; the
 * AI pipeline (P3) may add detected_by='ai' links later.
 */

export type DetectedOffer = { normalized: string; kind: string };

type Rule = { pattern: RegExp; kind: string; normalize: (m: RegExpMatchArray) => string };

const RULES: Rule[] = [
  {
    // "299₪", "₪299", "299 ש"ח", "299 שח"
    pattern: /(?:₪\s?(\d{2,5})|(\d{2,5})\s?(?:₪|ש["״]?ח))/,
    kind: 'price_point',
    normalize: (m) => `₪${m[1] ?? m[2]}`,
  },
  {
    pattern: /(\d{1,2})\s?%\s?(?:הנחה|off|discount)/i,
    kind: 'discount',
    normalize: (m) => `${m[1]}% הנחה`,
  },
  {
    pattern: /הצעת\s?מחיר\s?(?:חינם|ללא\s?עלות)|free\s(?:estimate|quote)/i,
    kind: 'free',
    normalize: () => 'הצעת מחיר חינם',
  },
  {
    pattern: /משלוח\s?חינם|free\s?(?:shipping|delivery)/i,
    kind: 'free',
    normalize: () => 'משלוח חינם',
  },
  {
    pattern: /בדיקה\s?חינם|ייעוץ\s?חינם|free\s?consultation/i,
    kind: 'free',
    normalize: () => 'ייעוץ/בדיקה חינם',
  },
  {
    pattern: /(?:שירות\s?)?(?:באותו\s?(?:ה?יום)|תוך\s?24|same[-\s]?day)/i,
    kind: 'urgency',
    normalize: () => 'שירות באותו היום',
  },
  {
    pattern: /(\d)\s?\+\s?(\d)\s?(?:מתנה|חינם)|buy\s?(\d)\s?get\s?(\d)/i,
    kind: 'bundle',
    normalize: (m) => (m[3] ? `Buy ${m[3]} Get ${m[4]}` : `${m[1]}+${m[2]} מתנה`),
  },
  {
    pattern: /אחריות(?:\s?מלאה)?|החזר\s?כספי|money[-\s]?back/i,
    kind: 'guarantee',
    normalize: () => 'אחריות / החזר כספי',
  },
  {
    pattern: /מבצע\s?סוף|לזמן\s?מוגבל|limited\s?time/i,
    kind: 'urgency',
    normalize: () => 'מבצע לזמן מוגבל',
  },
];

export function extractOffers(text: string | null | undefined): DetectedOffer[] {
  if (!text) return [];
  const found = new Map<string, DetectedOffer>();
  for (const rule of RULES) {
    const match = text.match(rule.pattern);
    if (!match) continue;
    const normalized = rule.normalize(match);
    if (!found.has(normalized)) found.set(normalized, { normalized, kind: rule.kind });
  }
  return [...found.values()];
}

/** Stable content hash for grouping creative variants — djb2, hex. */
export function contentHash(text: string): string {
  let hash = 5381;
  for (let i = 0; i < text.length; i++) {
    hash = ((hash << 5) + hash + text.charCodeAt(i)) | 0;
  }
  return (hash >>> 0).toString(16);
}

/** Collapse whitespace/emoji noise so near-identical variants hash together. */
export function normalizeBody(text: string): string {
  return text
    .replace(/[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]/gu, '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();
}
