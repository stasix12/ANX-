import { business } from '@/lib/hamavrik/config';

/**
 * Real Google reviews for the business, from Google's own Places API (New).
 *
 * Nothing here is typed in by hand. The section that renders this data
 * shows nothing at all until the two environment variables below exist and
 * Google answers — there is no placeholder and no fallback content.
 *
 *   GOOGLE_PLACE_ID          the business's Place ID (safe to commit; it is
 *                            public and Google exempts it from caching limits)
 *   GOOGLE_PLACES_API_KEY    a Google Cloud API key with "Places API (New)"
 *                            enabled. Read on the server / at build time only;
 *                            it never reaches the browser.
 *   GOOGLE_PLACES_API_BASE   (optional) override of the API origin — used
 *                            only to test the rendering against a local stub.
 *
 * Google returns at most five reviews per place, in its own "most relevant"
 * order, plus the overall rating and the total review count. We display them
 * as delivered: same text, same author name, same star count, with the
 * author link, the author photo when Google provides one, the "Google"
 * attribution and a report link — as the Places API policies require. The
 * data is fetched once per build (static host) or at most once a day
 * (server host), well inside Google's 30-day caching allowance.
 */

export interface GoogleReview {
  /** Stable id from Google (`places/…/reviews/…`). */
  id: string;
  author: string;
  /** Link to the author's Google profile, when Google provides one. */
  authorUrl: string | null;
  /** Author photo, when Google provides one. */
  authorPhoto: string | null;
  /** 1–5, exactly as on Google. */
  rating: number;
  /** The review text, untouched. */
  text: string;
  /** "לפני חודש" — Google's own relative time, localised by `languageCode`. */
  when: string;
  /** ISO timestamp, for ordering. */
  publishedAt: string;
  /** Google's link for reporting the review as inappropriate. */
  reportUrl: string | null;
}

export interface GoogleReviewsData {
  rating: number;
  reviewCount: number;
  /** The business's real Google Maps page — the "read all reviews" target. */
  mapsUrl: string;
  reviews: GoogleReview[];
}

interface PlaceResponse {
  rating?: number;
  userRatingCount?: number;
  googleMapsUri?: string;
  reviews?: Array<{
    name?: string;
    rating?: number;
    text?: { text?: string; languageCode?: string };
    originalText?: { text?: string; languageCode?: string };
    relativePublishTimeDescription?: string;
    publishTime?: string;
    flagContentUri?: string;
    authorAttribution?: { displayName?: string; uri?: string; photoUri?: string };
  }>;
}

const FIELDS = 'rating,userRatingCount,googleMapsUri,reviews';

/** True when the site is configured to talk to Google at all. */
export function googleReviewsConfigured(): boolean {
  return Boolean(process.env.GOOGLE_PLACE_ID && process.env.GOOGLE_PLACES_API_KEY);
}

export async function getGoogleReviews(): Promise<GoogleReviewsData | null> {
  const placeId = process.env.GOOGLE_PLACE_ID;
  const apiKey = process.env.GOOGLE_PLACES_API_KEY;
  if (!placeId || !apiKey) return null;

  const base = (process.env.GOOGLE_PLACES_API_BASE ?? 'https://places.googleapis.com').replace(/\/+$/, '');
  const url = `${base}/v1/places/${encodeURIComponent(placeId)}?languageCode=he&regionCode=IL`;

  let data: PlaceResponse;
  try {
    const res = await fetch(url, {
      headers: { 'X-Goog-Api-Key': apiKey, 'X-Goog-FieldMask': FIELDS },
      // Server deployments refresh daily; the static build fetches once per build.
      next: { revalidate: 60 * 60 * 24 },
    });
    if (!res.ok) {
      console.warn(`[google-reviews] Places API answered ${res.status} for ${business.name}; section hidden.`);
      return null;
    }
    data = (await res.json()) as PlaceResponse;
  } catch (err) {
    console.warn('[google-reviews] Places API unreachable; section hidden.', err instanceof Error ? err.message : err);
    return null;
  }

  const rating = typeof data.rating === 'number' ? data.rating : null;
  const reviewCount = typeof data.userRatingCount === 'number' ? data.userRatingCount : null;
  const mapsUrl = typeof data.googleMapsUri === 'string' ? data.googleMapsUri : null;
  if (rating === null || reviewCount === null || !mapsUrl) return null;

  const reviews: GoogleReview[] = (data.reviews ?? [])
    .map((r, i) => {
      const text = (r.text?.text ?? r.originalText?.text ?? '').trim();
      const author = (r.authorAttribution?.displayName ?? '').trim();
      const stars = typeof r.rating === 'number' ? Math.round(r.rating) : 0;
      if (!text || !author || stars < 1) return null;
      return {
        id: r.name ?? `review-${i}`,
        author,
        authorUrl: r.authorAttribution?.uri ?? null,
        authorPhoto: r.authorAttribution?.photoUri ?? null,
        rating: Math.min(5, stars),
        text,
        when: r.relativePublishTimeDescription ?? '',
        publishedAt: r.publishTime ?? '',
        reportUrl: r.flagContentUri ?? null,
      } satisfies GoogleReview;
    })
    .filter((r): r is GoogleReview => r !== null);

  return { rating, reviewCount, mapsUrl, reviews };
}
