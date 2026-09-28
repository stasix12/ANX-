'use client';

import type { QueueRow } from '@/lib/social/client';

/**
 * Turns a raw failure into something a business owner can act on: what
 * happened, whether it will retry itself, and what they should do. Technical
 * text from Meta or the browser stays in the queue row and the activity log;
 * this is the plain-language layer on top.
 */
export interface FailureExplanation {
  headline: string;
  advice: string;
  canRetry: boolean;
  needsOwner: boolean;
  /**
   * How loudly to say it. 'error' is red, 'warn' amber, 'note' quiet.
   *
   * It exists because the `error` column is not only used for errors: a
   * publication that SUCCEEDED can carry a remark, and a remark rendered in
   * red under the word "published" is a screen that contradicts itself.
   */
  tone: 'error' | 'warn' | 'note';
}

export function explainFailure(row: Pick<QueueRow, 'status' | 'error' | 'skip_reason'>): FailureExplanation {
  const text = `${row.error ?? ''} ${row.skip_reason ?? ''}`;

  /*
   * A PUBLISHED ROW IS NEVER A FAILURE, WHATEVER IS IN `error`.
   *
   * This branch has to come first, and it is here because of a screen the
   * owner photographed: one card showing the green pill "פורסם · Published"
   * and, directly under it, a red "הפרסום נכשל" with a "נסה שוב" button.
   *
   * Both halves were reading the database correctly. On a successful
   * publication the worker writes a REMARK into the column named `error`
   * (worker/social-worker.ts — `error: note || null`), and the remark is one
   * of two pieces of good news with a caveat: the group is moderated so the
   * post is queued for its admin, or the post went up but was not found in
   * the feed afterwards to confirm it. Everything below this line then read a
   * non-empty `error`, matched none of its patterns, and fell through to the
   * generic "it failed".
   *
   * The dangerous half was the button. "נסה שוב" on a row that already
   * published puts the same words in front of the same group a second time —
   * and the one thing this product must never do to somebody's Facebook
   * account is post twice. canRetry is false on every branch here.
   */
  if (row.status === 'published') {
    /*
     * The worker can write BOTH remarks into one string, and a chain of `if`s
     * gives that case to whichever pattern is written first — which is how the
     * first version of this branch answered a post that was moderated AND
     * unverified with the calm moderation line alone, losing the only half
     * that asks the owner to go and look. The test caught it. So the two are
     * read as two facts and the four combinations are answered as four.
     */
    const moderated = /ממתין לאישור/.test(text);
    const unverified = /לא הצלחתי לאמת|לא הצלחנו לאמת/.test(text);

    if (moderated && unverified) {
      return {
        headline: 'הפוסט נשלח וממתין לאישור מנהל הקבוצה',
        advice: 'לא ראינו אותו בפיד, וזה מה שמצופה בקבוצה עם מודרציה — הוא לא מופיע עד שהמנהל מאשר. שווה להציץ בקבוצה בהמשך היום. אל תפרסמו שוב, כדי לא ליצור פוסט כפול אם הוא יאושר.',
        canRetry: false,
        needsOwner: true,
        tone: 'warn',
      };
    }
    if (unverified) {
      return {
        headline: 'הפוסט נשלח, אבל לא ראינו אותו בפיד',
        advice: 'הפרסום הושלם בלי שגיאה — פשוט לא מצאנו את הפוסט בפיד הקבוצה אחר כך כדי לוודא. פתחו את הקבוצה ובדקו. אל תפרסמו שוב לפני שבדקתם, כדי לא ליצור פוסט כפול.',
        canRetry: false,
        needsOwner: true,
        tone: 'warn',
      };
    }
    if (moderated) {
      return {
        headline: 'הפוסט עלה וממתין לאישור מנהל הקבוצה',
        advice: 'בקבוצות עם מודרציה זה המסלול הרגיל. הוא יופיע לחברי הקבוצה ברגע שהמנהל יאשר, ואין שום דבר לעשות מהצד שלנו.',
        canRetry: false,
        needsOwner: false,
        tone: 'note',
      };
    }
    /* Some other remark. Shown as itself rather than translated into a verdict
       nobody can check. */
    return {
      headline: 'הפוסט עלה — עם הערה',
      advice: text.trim() || 'הפרסום הושלם.',
      canRetry: false,
      needsOwner: false,
      tone: 'note',
    };
  }

  if (row.status === 'needs_attention') {
    if (/אימות|בדיקת אבטחה|חסימה|להתחבר/.test(text)) {
      return {
        headline: 'פייסבוק ביקשה אימות',
        advice: 'פתחו את חלון הדפדפן שנפתח במחשב, אשרו את מה שפייסבוק מבקשת, ואז "בדוק שוב" בלוח הבקרה.',
        canRetry: false,
        needsOwner: true,
        tone: 'warn',
      };
    }
    return {
      headline: 'הפרסום נעצר באמצע',
      advice: 'בדקו בקבוצה אם הפוסט כבר עלה. אם לא — נסו שוב; אם כן — דלגו, כדי לא לפרסם פעמיים.',
      canRetry: true,
      needsOwner: true,
      tone: 'warn',
    };
  }

  if (/מכסה היומית/.test(text)) {
    return { headline: 'ממתין בגלל המכסה היומית', advice: 'זה מכוון. הפרסום יצא ביום הראשון שיש בו מקום, או העלו את המכסה בהגדרות.', canRetry: true, needsOwner: false, tone: 'note' };
  }
  if (/כבר פורסם|אותו תוכן/.test(text)) {
    return { headline: 'כבר פורסם לקבוצה הזו', advice: 'ההגנה מכפילויות מנעה פרסום שני. לא נדרשת פעולה.', canRetry: false, needsOwner: false, tone: 'note' };
  }
  if (/אי אפשר לפרסם|לא חבר|הרשאת פרסום/.test(text)) {
    return { headline: 'אין הרשאת פרסום בקבוצה', advice: 'פתחו את הקבוצה ובדקו שאתם חברים ושמותר לפרסם בה. אם לא — כבו אותה ברשימת הקבוצות.', canRetry: false, needsOwner: true, tone: 'warn' };
  }
  if (/תיבת "כתבו משהו|לא מצאתי/.test(text)) {
    /*
     * This used to end "…ושלחו אותו לתמיכה" — send it to support. There is no
     * support address, link or phone anywhere in /social, so the one sentence
     * the owner reads at the exact moment they are stuck pointed at a door
     * that does not exist. Until there is a support channel to name, the
     * advice is the thing they can actually do by themselves.
     */
    return {
      headline: 'לא נמצא חלון הפוסט בקבוצה',
      advice: 'ייתכן שפייסבוק שינתה את המסך בקבוצה הזו, או שאין לכם הרשאת פרסום בה. פתחו את הקבוצה ובדקו שאפשר לכתוב בה פוסט, ואז נסו שוב. צילום התקלה בתפריט של השורה מראה מה הדפדפן ראה.',
      canRetry: true,
      needsOwner: false,
      tone: 'error',
    };
  }
  if (/קצב|rate|הגבילה/.test(text)) {
    return { headline: 'פייסבוק ביקשה להאט', advice: 'המערכת ממתינה ותנסה שוב לבד. לא נדרשת פעולה.', canRetry: false, needsOwner: false, tone: 'note' };
  }
  if (/טוקן|פג תוקף|להתחבר מחדש/.test(text)) {
    return { headline: 'החיבור לפייסבוק פג', advice: 'התחברו מחדש במסך הדפים, ואז נסו שוב.', canRetry: true, needsOwner: true, tone: 'warn' };
  }
  if (row.status === 'skipped') {
    return { headline: 'הפרסום דולג', advice: row.skip_reason || 'הפריט לא נשלח.', canRetry: true, needsOwner: false, tone: 'warn' };
  }
  return { headline: 'הפרסום נכשל', advice: 'אפשר לנסות שוב. אם זה חוזר, פתחו את צילום התקלה מהתפריט של השורה כדי לראות מה הדפדפן ראה.', canRetry: true, needsOwner: false, tone: 'error' };
}

/** The one place a tone becomes a colour, so the sheet and the row agree. */
export const TONE_CLASS: Record<FailureExplanation['tone'], string> = {
  error: 'text-error-400',
  warn: 'text-warning-400',
  note: 'text-mist-300',
};

export function ErrorDetail({ row, technical = false }: { row: QueueRow; technical?: boolean }) {
  const info = explainFailure(row);
  return (
    <div className="text-xs">
      <p className={`font-bold ${TONE_CLASS[info.tone]}`}>{info.headline}</p>
      <p className="mt-0.5 text-mist-300">{info.advice}</p>
      {technical && (row.error || row.skip_reason) && (
        <details className="mt-1">
          {/*
            * This is a tap target on a phone: one line of text-xs made it 16px
            * tall, a third of the 44px floor the rest of the product uses.
            * min-h-11 + the padding that fills it; the display stays list-item
            * so the native disclosure triangle survives.
            */}
          <summary className="min-h-11 cursor-pointer py-3.5 text-mist-500">פרטים טכניים</summary>
          <p className="mt-1 break-words text-mist-500">{row.error || row.skip_reason}</p>
        </details>
      )}
    </div>
  );
}
