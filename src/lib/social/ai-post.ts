/**
 * ─── THE AI POST GENERATOR'S CONTRACT ──────────────────────────────────────
 *
 * "שילוב מנגנון AI לכתיבת פוסטים" — 07.11.2026, with a screenshot as a binding
 * specification.
 *
 * THIS FILE IS THE ONLY PLACE THE CHOICES ARE WRITTEN DOWN, and that is the
 * whole reason it exists rather than the lists living in the component.
 *
 * The screen offers three dropdowns; the server turns the chosen values into a
 * prompt. If the two held their own copies, a label renamed on the screen
 * would reach the server as a value it does not recognise — and the honest
 * answer to that is a refusal, not a post written against the wrong brief. So
 * the lists are shared, the server VALIDATES against them, and an unknown
 * value is rejected rather than interpolated into a prompt.
 *
 * That last point is not tidiness. Everything in `AiPostRequest` crosses from
 * a browser into a model prompt, and this product's own rule is that an id
 * from the frontend is never trusted. A free-text field has to be accepted as
 * free text — the owner is allowed to type what he likes into "נושא" — but it
 * is length-capped and it is delivered as DATA, inside a tagged block the
 * system prompt tells the model to treat as untrusted. The business details
 * come from the saved settings row on the server, never from the request.
 */

/** What the post is FOR. The engine never reads this; the model does. */
export const AI_POST_KINDS = [
  'פרסום שירות',
  'מבצע מיוחד',
  'פוסט תדמיתי',
  'המלצה',
  'פוסט מידע',
  'פוסט שמטרתו לקבל פניות',
] as const;
export type AiPostKind = (typeof AI_POST_KINDS)[number];

/**
 * The services, and the last entry is why this is a list and not an enum.
 *
 * "אפשרות להוספת שירות מותאם אישית" — the owner's own business is upholstery
 * cleaning, but the product is sold to other businesses, so a fixed list would
 * be wrong for every customer after the first. `CUSTOM_SERVICE` switches the
 * dropdown into a text box; the server accepts any string in `serviceOther`
 * under the same cap and the same untrusted-data framing as the topic.
 */
export const AI_POST_SERVICES = [
  'ניקוי ספות',
  'ניקוי מזרנים',
  'ניקוי ריפודים',
  'ניקוי מושבי רכב',
  'ניקוי שטיחים',
] as const;
export const CUSTOM_SERVICE = 'אחר' as const;
export type AiPostService = (typeof AI_POST_SERVICES)[number] | typeof CUSTOM_SERVICE;

/** How it should sound. */
export const AI_POST_TONES = [
  'מקצועי ומשכנע',
  'ידידותי',
  'יוקרתי',
  'קצר וישיר',
  'שיווקי ואגרסיבי',
  'טבעי ואנושי',
] as const;
export type AiPostTone = (typeof AI_POST_TONES)[number];

/**
 * CAPS, AND THEY ARE A COST CONTROL AS MUCH AS A SAFETY ONE.
 *
 * Every character of `topic` is a character the owner pays for on every
 * generation, and a paste of a whole document into that box would be billed
 * silently. 400 is comfortably more than "מבצע ניקוי ספות בבאר שבע – 299₪" and
 * far short of anything that could bury the instructions around it.
 */
export const AI_TOPIC_MAX = 400;
export const AI_SERVICE_MAX = 60;

export interface AiPostRequest {
  kind: AiPostKind;
  service: AiPostService;
  /** Only when `service === CUSTOM_SERVICE`. */
  serviceOther?: string;
  tone: AiPostTone;
  /** "נושא / רעיון לפוסט (אופציונלי)" — a post may be generated without one. */
  topic?: string;
  /**
   * The versions already produced in this sitting, so "צור גרסה נוספת" gets a
   * genuinely different post rather than the same one again.
   *
   * It is capped on the server too: this is the one field whose size grows
   * with use, and an unbounded history would turn the fifth generation into a
   * very expensive request.
   */
  previous?: string[];
}

export interface AiPostResponse {
  text: string;
}

/**
 * ─── WHAT A FAILURE IS ALLOWED TO SAY ──────────────────────────────────────
 *
 * "אין להציג תוכן דמה כאילו נוצר באמצעות AI."
 *
 * So there is no fallback text anywhere in this feature: when the model cannot
 * be reached the screen says so and offers to try again. These are the reasons
 * it can say, and they are a closed set because each one means something
 * different to the person reading it — "the key is missing" is for the owner
 * to fix in one place, "Meta is rate-limiting us" is to wait out, and a
 * network blip is to retry at once. A single "שגיאה" would collapse the three.
 */
export type AiFailure = 'no_key' | 'rate_limited' | 'refused' | 'upstream' | 'network' | 'bad_request';

export const AI_FAILURE_TEXT: Record<AiFailure, string> = {
  no_key:
    'מחולל הפוסטים לא מוגדר עדיין. צריך להוסיף מפתח ANTHROPIC_API_KEY בהגדרות הפרויקט ב-Vercel, ואז לנסות שוב. אפשר להמשיך לכתוב ידנית בינתיים.',
  rate_limited: 'יותר מדי בקשות ברצף. נסו שוב בעוד דקה.',
  refused:
    'המודל לא הסכים לכתוב את הפוסט הזה. נסו לנסח את הנושא אחרת, או לכתוב ידנית.',
  upstream: 'שירות הכתיבה לא זמין כרגע. נסו שוב בעוד רגע.',
  network: 'לא הצלחנו להגיע לשירות הכתיבה. בדקו את החיבור לאינטרנט ונסו שוב.',
  bad_request: 'משהו בבחירות לא תקין. רעננו את הדף ונסו שוב.',
};

/** The service as a sentence, for the prompt and for the screen's own hint. */
export function serviceLabel(req: Pick<AiPostRequest, 'service' | 'serviceOther'>): string {
  if (req.service !== CUSTOM_SERVICE) return req.service;
  const other = (req.serviceOther ?? '').trim();
  return other || 'השירות של העסק';
}

/**
 * VALIDATION, SHARED SO THE TWO SIDES CANNOT DISAGREE ABOUT WHAT IS VALID.
 *
 * Returns the request narrowed and trimmed, or a reason. The server runs this
 * on the parsed body before anything reaches a prompt; the screen runs it
 * before spending a request it knows will be refused.
 */
export function validateAiRequest(raw: unknown): { ok: true; value: AiPostRequest } | { ok: false; why: string } {
  if (!raw || typeof raw !== 'object') return { ok: false, why: 'body' };
  const r = raw as Record<string, unknown>;

  const kind = r.kind;
  if (typeof kind !== 'string' || !(AI_POST_KINDS as readonly string[]).includes(kind)) return { ok: false, why: 'kind' };

  const service = r.service;
  const known = [...AI_POST_SERVICES, CUSTOM_SERVICE] as readonly string[];
  if (typeof service !== 'string' || !known.includes(service)) return { ok: false, why: 'service' };

  const tone = r.tone;
  if (typeof tone !== 'string' || !(AI_POST_TONES as readonly string[]).includes(tone)) return { ok: false, why: 'tone' };

  /* Free text is trimmed and capped, never rejected for its content: the cap
     is the control, and what it says is the owner's business. */
  const topic = typeof r.topic === 'string' ? r.topic.trim().slice(0, AI_TOPIC_MAX) : '';
  const serviceOther = typeof r.serviceOther === 'string' ? r.serviceOther.trim().slice(0, AI_SERVICE_MAX) : '';

  /* A custom service with nothing typed in it is not a choice yet. */
  if (service === CUSTOM_SERVICE && !serviceOther) return { ok: false, why: 'serviceOther' };

  /* At most three previous versions, each capped: enough for the model to see
     what it has already said, bounded so the fifth press is not the costliest. */
  const previous = Array.isArray(r.previous)
    ? r.previous.filter((p): p is string => typeof p === 'string').slice(-3).map((p) => p.slice(0, 1200))
    : [];

  return {
    ok: true,
    value: {
      kind: kind as AiPostKind,
      service: service as AiPostService,
      ...(serviceOther ? { serviceOther } : {}),
      tone: tone as AiPostTone,
      ...(topic ? { topic } : {}),
      ...(previous.length ? { previous } : {}),
    },
  };
}
