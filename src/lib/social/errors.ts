/**
 * Every error the owner can see passes through here first.
 *
 * Supabase, Postgres and fetch all throw in English, in the vocabulary of the
 * database — "new row violates row-level security policy", "duplicate key value
 * violates unique constraint", "Failed to fetch". None of that tells a business
 * owner what went wrong or what to do about it, and a stack trace or an SQL
 * constraint name in a toast is a leak, not a message.
 *
 * So: known shapes get a plain Hebrew sentence that says what happened and what
 * to try. Anything unrecognised gets a neutral sentence — never the raw text.
 * The original is kept on `cause` so it still reaches the console for debugging.
 */

/** Messages we wrote ourselves are already in Hebrew and already friendly. */
function isOurs(message: string): boolean {
  return /[֐-׿]/.test(message);
}

type Rule = { match: RegExp; text: string };

const RULES: Rule[] = [
  // Connectivity — by far the most common real-world failure on a phone.
  { match: /failed to fetch|networkerror|network request failed|load failed/i, text: 'אין חיבור לשרת. בדקו את האינטרנט ונסו שוב.' },
  { match: /timeout|timed out|etimedout/i, text: 'השרת לא הגיב בזמן. נסו שוב בעוד רגע.' },
  { match: /aborted|abort/i, text: 'הפעולה בוטלה לפני שהסתיימה. נסו שוב.' },

  // Auth / permissions.
  { match: /jwt|token.*expire|invalid.*(token|session)|not authenticated|unauthorized|401/i, text: 'ההתחברות פגה. התחברו מחדש ונסו שוב.' },
  { match: /row-level security|rls|permission denied|forbidden|403/i, text: 'אין הרשאה לפעולה הזו בחשבון הנוכחי.' },

  // Data conflicts.
  { match: /duplicate key|already exists|unique constraint/i, text: 'הפריט הזה כבר קיים במערכת.' },
  { match: /foreign key|violates foreign key constraint/i, text: 'הפריט מקושר לנתונים אחרים ולכן לא ניתן לשמור את השינוי.' },
  { match: /not-null|null value in column/i, text: 'חסר שדה חובה. מלאו את כל השדות ונסו שוב.' },
  { match: /check constraint|invalid input syntax|out of range/i, text: 'אחד הערכים שהוזנו אינו תקין. בדקו את השדות ונסו שוב.' },

  // Missing schema — the owner has not run the SQL migration yet.
  { match: /(relation|table|column).*does not exist|schema cache/i, text: 'מבנה הנתונים לא מעודכן. יש להריץ את קובץ העדכון של מסד הנתונים.' },

  // Storage.
  { match: /payload too large|413|exceeded the maximum|file size/i, text: 'הקובץ גדול מדי. נסו קובץ קטן יותר.' },
  { match: /bucket|storage/i, text: 'העלאת הקובץ נכשלה. נסו שוב.' },

  // Rate limiting / server.
  { match: /rate limit|too many requests|429/i, text: 'יותר מדי בקשות ברצף. המתינו רגע ונסו שוב.' },
  { match: /5\d\d|internal server error|service unavailable/i, text: 'תקלה זמנית בשרת. נסו שוב בעוד רגע.' },
];

/** Plain Hebrew for anything we could not classify. */
export const GENERIC_ERROR = 'משהו השתבש. נסו שוב, ואם זה חוזר — רעננו את הדף.';

/**
 * Turns anything thrown into a sentence that is safe to show the owner.
 * Accepts an Error, a Supabase error object, a string, or anything at all.
 */
export function friendlyMessage(err: unknown, fallback = GENERIC_ERROR): string {
  const raw =
    typeof err === 'string'
      ? err
      : err instanceof Error
        ? err.message
        : typeof err === 'object' && err !== null && 'message' in err
          ? String((err as { message: unknown }).message)
          : '';

  if (!raw) return fallback;
  // Our own copy is already written for the owner — pass it through untouched.
  if (isOurs(raw)) return raw;

  for (const rule of RULES) {
    if (rule.match.test(raw)) return rule.text;
  }
  return fallback;
}

/**
 * Wraps a raw failure in an Error whose message is safe to display, keeping the
 * original on `cause` so it is still there in the console.
 */
export function friendlyError(err: unknown, fallback = GENERIC_ERROR): Error {
  const e = new Error(friendlyMessage(err, fallback));
  (e as Error & { cause?: unknown }).cause = err;
  return e;
}
