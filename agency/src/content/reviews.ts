/**
 * Google reviews — real ones only.
 *
 * Every entry here must correspond to an existing public Google review.
 * Ask for the review link before adding one; never type reviews "from
 * memory". While the array is empty the section shows an honest empty state
 * (no names, no stars, no invented ratings) — or nothing at all when
 * `showWhenEmpty` is false.
 */
export type Review = {
  /** Reviewer name exactly as shown on Google. */
  name: string;
  /** Optional business / field. */
  business?: string;
  /** Review text, unedited. */
  text: string;
  /** 1–5 as given on Google. */
  rating: 1 | 2 | 3 | 4 | 5;
  /** ISO month, e.g. "2026-09". Displayed as "ספטמבר 2026". */
  date: string;
  /** Link to the original review (optional). */
  sourceUrl?: string;
};

export const reviews: Review[] = [
  // TODO: add real Google reviews only.
];

/**
 * Aggregate numbers straight from the Google Business Profile. Leave null
 * unless you copy them from Google — they are displayed as-is.
 */
export const aggregate: { rating: number; count: number } | null = null;

/**
 * The honest empty state is shown on dev/preview builds only; in production
 * the section disappears until real reviews exist.
 */
export const showWhenEmpty = process.env.NODE_ENV !== 'production' || process.env.NEXT_PUBLIC_SHOW_PLACEHOLDERS === '1';
