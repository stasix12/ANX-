import { WEEKLY_TOPICS } from '@/lib/seo/config';

/**
 * Projected API spend, shown in the dashboard.
 *
 * Kept in its own module (rather than in server/generate.ts) so the dashboard
 * can display it without importing anything server-only — generate.ts throws
 * when loaded in a browser, by design.
 *
 * These are list prices for the model the engine uses, multiplied by the
 * measured shape of one generation call. They are a projection, labelled as
 * such in the UI: the real bill comes from the Anthropic console.
 */
export const MODEL_ID = 'claude-opus-5-5';

/** USD per million tokens, list price for the model above. */
const INPUT_PER_1M = 4;
const OUTPUT_PER_1M = 20;

/** One article: ~1.5K tokens of prompt in, ~4K tokens of article out. */
const INPUT_TOKENS = 1_500;
const OUTPUT_TOKENS = 4_000;

export const COST_PER_ARTICLE_USD =
  (INPUT_TOKENS / 1_000_000) * INPUT_PER_1M + (OUTPUT_TOKENS / 1_000_000) * OUTPUT_PER_1M;

/** Two subjects a week in two languages. */
export const VERSIONS_PER_WEEK = WEEKLY_TOPICS * 2;

export const COST_PER_WEEK_USD = COST_PER_ARTICLE_USD * VERSIONS_PER_WEEK;
export const COST_PER_MONTH_USD = COST_PER_WEEK_USD * 4.33;

const usd = (n: number) => `$${n.toFixed(2)}`;

export const COST_NOTE = [
  `מנוע הכתיבה עובד מול ${MODEL_ID}.`,
  `הערכה: כ-${usd(COST_PER_ARTICLE_USD)} לגרסת מאמר,`,
  `כ-${usd(COST_PER_WEEK_USD)} בשבוע (${VERSIONS_PER_WEEK} גרסאות),`,
  `כ-${usd(COST_PER_MONTH_USD)} בחודש.`,
  'קריאות ל-Search Console הן בחינם.',
  'החיוב האמיתי מופיע בקונסולת Anthropic — זו הערכה לפי מחירון ולפי אורך קריאה טיפוסי.',
].join(' ');
