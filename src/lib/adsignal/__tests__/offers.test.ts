import { describe, expect, it } from 'vitest';
import { contentHash, extractOffers, normalizeBody } from '../offers';

describe('extractOffers', () => {
  it('extracts Hebrew price points in both ₪ orders', () => {
    expect(extractOffers('ניקוי ספה שלושה מושבים רק ₪299 כולל הכל')).toContainEqual({ normalized: '₪299', kind: 'price_point' });
    expect(extractOffers('מבצע! 299₪ בלבד')).toContainEqual({ normalized: '₪299', kind: 'price_point' });
    expect(extractOffers('רק 350 ש"ח לספה')).toContainEqual({ normalized: '₪350', kind: 'price_point' });
  });

  it('extracts discounts, free offers and urgency in Hebrew and English', () => {
    expect(extractOffers('20% הנחה לזמן מוגבל')).toEqual(
      expect.arrayContaining([
        { normalized: '20% הנחה', kind: 'discount' },
        { normalized: 'מבצע לזמן מוגבל', kind: 'urgency' },
      ]),
    );
    expect(extractOffers('Free estimate, same-day service!')).toEqual(
      expect.arrayContaining([
        { normalized: 'הצעת מחיר חינם', kind: 'free' },
        { normalized: 'שירות באותו היום', kind: 'urgency' },
      ]),
    );
  });

  it('returns nothing for copy without an offer — no guessing', () => {
    expect(extractOffers('אנחנו חברת ניקיון מקצועית עם ניסיון רב')).toEqual([]);
    expect(extractOffers(null)).toEqual([]);
  });

  it('dedupes repeated offers within one text', () => {
    const found = extractOffers('משלוח חינם! כן, משלוח חינם לכל הארץ');
    expect(found.filter((o) => o.normalized === 'משלוח חינם')).toHaveLength(1);
  });
});

describe('variant hashing', () => {
  it('hashes emoji/whitespace variants of the same copy identically', () => {
    const a = normalizeBody('ניקוי ספות מקצועי 🔥🔥  רק ₪299');
    const b = normalizeBody('ניקוי ספות מקצועי רק ₪299');
    expect(contentHash(a)).toBe(contentHash(b));
  });
  it('hashes different copy differently', () => {
    expect(contentHash(normalizeBody('ניקוי ספות ₪299'))).not.toBe(contentHash(normalizeBody('ניקוי מזגנים ₪399')));
  });
});
