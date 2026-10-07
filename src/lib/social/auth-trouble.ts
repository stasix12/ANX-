import { friendlyMessage } from './errors';

/**
 * WHY A SIGN-IN WAS REFUSED, IN ONE SENTENCE THE PERSON CAN ACT ON.
 *
 * THIS FILE EXISTS BECAUSE OF A SCREENSHOT. The owner typed his email and his
 * password into /social/login and got back:
 *
 *     "לא הצלחנו להשלים את הפעולה. נסו שוב."
 *
 * That sentence is the FALLBACK — the thing the old authMessage() returned when
 * none of its six string matches fired and friendlyMessage() recognised nothing
 * either. So it was not a wrong password (that answer exists and is specific),
 * it was not an unconfirmed address, it was not a rate limit. It was one of the
 * failures nobody had written a line for, and the screen answered by telling
 * him nothing at all: not what broke, not whether it was his fault, not what to
 * do. He retyped a correct password, which is the only move that sentence
 * suggests, and it failed again.
 *
 * There is a much better source than the English prose. Since supabase-js 2.x
 * every AuthError carries `code` — a stable machine string like
 * 'invalid_credentials' or 'email_provider_disabled' — and `status`. Matching
 * prose was always guessing at a string GoTrue is free to reword; `code` is the
 * contract. So this maps code first, status second, and text only as the last
 * resort for the gateway errors that never reach GoTrue at all and therefore
 * have no code.
 *
 * THE RULE THIS FILE KEEPS: there is no ending that says nothing. Every branch
 * names something — and the branch that recognises nothing still reports the
 * code, the HTTP status and the server's own words, because a person who can
 * read nine characters down a telephone is not stuck, and a person holding
 * "נסו שוב" is.
 *
 * `blame` is not decoration either. It decides whether the screen offers a
 * connection check and prints the technical tail: a wrong password needs
 * neither, and everything else needs both.
 */

/** Who can actually fix this: the person typing, or somebody else. */
export type Blame =
  /** The email, the password, or the address — retyping can fix it. */
  | 'you'
  /** A switch in the Supabase project. Nothing the person typing can do. */
  | 'settings'
  /** The project or the keys the site is configured with. Also not theirs. */
  | 'project'
  /** The phone's connection, or the request never arrived. */
  | 'network'
  /** Correct details, refused for now — a limit that lifts by itself. */
  | 'wait'
  /** Refused, and the server did not say why. Still reported, never hidden. */
  | 'unknown';

export type SignInTrouble = {
  /** Hebrew, shown to the person. */
  message: string;
  blame: Blame;
  /** code · status · the server's English, for reading aloud. '' if there is none. */
  detail: string;
};

/* The one thing every "not your fault" message has to say before anything else.
   The owner's instinct on being refused is to retype the password, and for all
   of these that is the one move that cannot work. */
const NOT_YOU = 'זה לא המייל ולא הסיסמה';

function technical(code: string, status: number, message: string): string {
  const bits: string[] = [];
  if (code) bits.push(code);
  if (status) bits.push(`HTTP ${status}`);
  /* Collapsed and clipped: this goes into a 12px line on a phone, and GoTrue's
     longer messages wrap to four. No password and no token ever reaches it —
     these are the server's own words about a request, not about its contents. */
  const clean = message.replace(/\s+/g, ' ').trim();
  if (clean) bits.push(clean.length > 120 ? `${clean.slice(0, 120)}…` : clean);
  return bits.join(' · ');
}

/**
 * Classify a rejected sign-in or sign-up.
 *
 * Takes `unknown` on purpose: the caller has a Supabase error object, but it
 * also has catch blocks, and a classifier that only accepts the happy shape is
 * a classifier that throws on the day it is needed most.
 */
export function signInTrouble(err: unknown): SignInTrouble {
  const e = (typeof err === 'object' && err !== null ? err : {}) as {
    message?: unknown; code?: unknown; status?: unknown;
  };
  const message = typeof e.message === 'string' ? e.message : typeof err === 'string' ? err : '';
  const code = typeof e.code === 'string' ? e.code : '';
  /* A fetch that never got a response carries status 0 (auth-js constructs
     AuthRetryableFetchError that way), so 0 means "no answer", not "fine". */
  const status = typeof e.status === 'number' && Number.isFinite(e.status) ? e.status : 0;
  const text = message.toLowerCase();
  const has = (...needles: string[]) => needles.some((n) => text.includes(n));
  const detail = technical(code, status, message);
  const out = (blame: Blame, msg: string): SignInTrouble => ({ message: msg, blame, detail });

  /* ---------------------------------------------------- it really is the person */

  /*
   * UNCONFIRMED FIRST, and the order is a bug that already happened twice in
   * this product: an address that was never confirmed is refused by the same
   * form as a wrong password, and told it was a wrong password, it is retyped
   * for ever. desktop/main.ts keeps the same order for the same reason.
   */
  if (code === 'email_not_confirmed' || has('not confirmed')) {
    return out('you', 'צריך לאשר את המייל קודם — חפשו הודעה מאיתנו בתיבה (גם בספאם) ולחצו על הקישור שבה.');
  }
  if (code === 'invalid_credentials' || has('invalid login credentials')) {
    return out('you', 'המייל או הסיסמה לא נכונים.');
  }
  if (code === 'email_exists' || code === 'user_already_exists' || has('already registered', 'already been registered')) {
    return out('you', 'כבר קיים חשבון עם המייל הזה. אפשר להיכנס איתו.');
  }
  if (code === 'user_not_found') {
    return out('you', 'אין חשבון עם המייל הזה. בדקו את הכתובת, או פתחו חשבון חדש.');
  }
  if (code === 'weak_password' || (has('password') && has('at least', ' 6 ', ' 8 ', '6 char', '8 char'))) {
    return out('you', 'הסיסמה קצרה או פשוטה מדי. נסו סיסמה ארוכה יותר.');
  }
  if (code === 'email_address_invalid' || code === 'email_address_not_authorized') {
    return out('you', 'כתובת המייל הזאת לא נתקבלה על ידי השרת. נסו כתובת אחרת.');
  }
  if (code === 'validation_failed') {
    return out('you', `הפרטים לא עברו את הבדיקה של השרת. בדקו שהמייל והסיסמה מלאים ונסו שוב. (${detail})`);
  }

  /* --------------------------------------------- correct details, refused for now */

  /*
   * EVERY over_* code and every 429. This is the one case where "נסו שוב"
   * is a real instruction, so it says how long.
   */
  if (code.startsWith('over_') || status === 429 || has('rate limit', 'too many')) {
    return out('wait', 'יותר מדי ניסיונות ברצף. המתינו דקה ונסו שוב — הפרטים עצמם בסדר.');
  }

  /* ------------------------------------------- a switch in the Supabase project */

  if (code === 'signup_disabled' || has('signups not allowed', 'signup is disabled')) {
    return out('settings', `${NOT_YOU}: פתיחת חשבונות חדשים כבויה כרגע בהגדרות. פנו למי שהקים את המערכת.`);
  }
  /*
   * EMAIL LOGINS SWITCHED OFF. A single toggle in Supabase → Authentication →
   * Sign In / Providers → Email, and with it off every correct password in the
   * world is refused. The old code had no line for it, so it produced the
   * screenshot this file is named after.
   */
  if (code === 'email_provider_disabled' || code === 'provider_disabled' || has('logins are disabled', 'provider is disabled')) {
    return out(
      'settings',
      `${NOT_YOU}: הכניסה עם מייל וסיסמה כבויה בהגדרות Supabase (Authentication → Sign In / Providers → Email). צריך להדליק אותה שם.`,
    );
  }
  if (code === 'user_banned' || has('user is banned')) {
    return out('settings', `${NOT_YOU}: החשבון הזה מסומן כחסום בהגדרות Supabase (Authentication → Users). צריך לשחרר אותו שם.`);
  }
  if (code === 'captcha_failed') {
    return out('settings', `${NOT_YOU}: הגנת ה-CAPTCHA של Supabase דחתה את הבקשה. צריך לכבות או להגדיר אותה נכון בהגדרות הפרויקט.`);
  }

  /* ------------------------------------ the project, or the keys pointing at it */

  /*
   * "Invalid API key" NEVER REACHES GOTRUE. It is the API gateway answering 401
   * before the request gets near a user table, it carries no `code`, and it
   * means one thing: the key the website was built with is not a key this
   * project accepts — most often a legacy anon key after the project moved to
   * publishable keys, or a key belonging to a DIFFERENT project. This product
   * has already lost a night to two project references, so the message names
   * the fix rather than the symptom.
   */
  if (has('api key', 'apikey') || (!code && (status === 401 || status === 403))) {
    return out(
      'project',
      `${NOT_YOU}: המפתח שהאתר מחזיק ל-Supabase לא נתקבל. צריך לעדכן ב-Vercel את NEXT_PUBLIC_SUPABASE_ANON_KEY מהמפתח שב-Supabase → Settings → API Keys, ואז Redeploy.`,
    );
  }
  if (code === 'bad_jwt' || code === 'no_authorization') {
    return out('project', `${NOT_YOU}: השרת דחה את ההרשאה של האתר. צריך לבדוק את מפתחות Supabase ב-Vercel.`);
  }
  /*
   * ANYTHING 500 AND UP, INCLUDING CLOUDFLARE'S 52x. A paused project, a
   * project over its quota, and an auth database that cannot be reached all
   * land here — and all three look identical from a phone. "Database error
   * querying schema" is the most common wording and it is the reason this
   * branch exists: it matched none of the old rules, so it printed nothing.
   */
  if (status >= 500 || code === 'unexpected_failure' || has('database error')) {
    return out(
      'project',
      `${NOT_YOU}: שרת ההתחברות של Supabase מחזיר שגיאה. לרוב זה פרויקט שמושהה או שעבר את המכסה. בדקו בלוח הבקרה של Supabase שהפרויקט פעיל, ונסו שוב.`,
    );
  }
  /*
   * A BODY THAT IS NOT JSON. auth-js wraps the parse failure, so the message is
   * the parser's ("Unexpected token '<'"). It means the address answered with a
   * web page instead of an API — a wrong NEXT_PUBLIC_SUPABASE_URL, or something
   * in between intercepting the request.
   */
  if (has('unexpected token', 'not valid json', 'json.parse', 'unexpected end of json')) {
    return out('project', `${NOT_YOU}: הכתובת שהאתר מוגדר אליה לא ענתה כמו פרויקט Supabase. צריך לבדוק את NEXT_PUBLIC_SUPABASE_URL ב-Vercel.`);
  }

  /* ---------------------------------------------------------------- the network */

  /*
   * The request never got an answer. errors.ts already owns the wording for
   * every connectivity failure in this product and it is reused rather than
   * copied — one sentence, one place.
   */
  if (status === 0 && message && has('fetch', 'network', 'timeout', 'timed out', 'load failed', 'abort', 'connection')) {
    return out('network', friendlyMessage(message));
  }

  /* ------------------------------------------------- recognised nothing — still says it */

  /*
   * THE ONE ENDING THAT USED TO SAY NOTHING. It now says three true things:
   * that the refusal came from the server, that it is worth checking the
   * connection, and exactly what the server said — so the next person to look
   * at it starts from the answer instead of from a retyped password.
   */
  return out(
    'unknown',
    detail
      ? `ההתחברות נדחתה והשרת לא אמר למה. ${NOT_YOU} — זאת תקלה בצד השרת. הנה מה שהוא החזיר: ${detail}`
      : 'ההתחברות נדחתה בלי שום הסבר מהשרת. בדקו את החיבור לאינטרנט ונסו שוב.',
  );
}
