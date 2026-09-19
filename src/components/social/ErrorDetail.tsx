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
}

export function explainFailure(row: Pick<QueueRow, 'status' | 'error' | 'skip_reason'>): FailureExplanation {
  const text = `${row.error ?? ''} ${row.skip_reason ?? ''}`;

  if (row.status === 'needs_attention') {
    if (/אימות|בדיקת אבטחה|חסימה|להתחבר/.test(text)) {
      return {
        headline: 'פייסבוק ביקשה אימות',
        advice: 'פתחו את הדפדפן של ה-worker, אשרו את מה שפייסבוק מבקשת, ואז "בדוק שוב" בלוח הבקרה.',
        canRetry: false,
        needsOwner: true,
      };
    }
    return {
      headline: 'הפרסום נעצר באמצע',
      advice: 'בדקו בקבוצה אם הפוסט כבר עלה. אם לא — נסו שוב; אם כן — דלגו, כדי לא לפרסם פעמיים.',
      canRetry: true,
      needsOwner: true,
    };
  }

  if (/מכסה היומית/.test(text)) {
    return { headline: 'נעצר בגלל המכסה היומית', advice: 'זה מכוון. הפרסום ימשיך מחר, או העלו את המכסה בהגדרות.', canRetry: true, needsOwner: false };
  }
  if (/כבר פורסם|אותו תוכן/.test(text)) {
    return { headline: 'כבר פורסם לקבוצה הזו', advice: 'ההגנה מכפילויות מנעה פרסום שני. לא נדרשת פעולה.', canRetry: false, needsOwner: false };
  }
  if (/אי אפשר לפרסם|לא חבר|הרשאת פרסום/.test(text)) {
    return { headline: 'אין הרשאת פרסום בקבוצה', advice: 'פתחו את הקבוצה ובדקו שאתם חברים ושמותר לפרסם בה. אם לא — כבו אותה ברשימת הקבוצות.', canRetry: false, needsOwner: true };
  }
  if (/תיבת "כתבו משהו|לא מצאתי/.test(text)) {
    return { headline: 'לא נמצא חלון הפוסט בקבוצה', advice: 'ייתכן שפייסבוק שינתה את המסך בקבוצה הזו. צפו בצילום התקלה ושלחו אותו לתמיכה.', canRetry: true, needsOwner: false };
  }
  if (/קצב|rate|הגבילה/.test(text)) {
    return { headline: 'פייסבוק ביקשה להאט', advice: 'המערכת ממתינה ותנסה שוב לבד. לא נדרשת פעולה.', canRetry: false, needsOwner: false };
  }
  if (/טוקן|פג תוקף|להתחבר מחדש/.test(text)) {
    return { headline: 'החיבור לפייסבוק פג', advice: 'התחברו מחדש במסך הדפים, ואז נסו שוב.', canRetry: true, needsOwner: true };
  }
  if (row.status === 'skipped') {
    return { headline: 'הפרסום דולג', advice: row.skip_reason || 'הפריט לא נשלח.', canRetry: true, needsOwner: false };
  }
  return { headline: 'הפרסום נכשל', advice: 'אפשר לנסות שוב. אם זה חוזר, צפו בצילום התקלה.', canRetry: true, needsOwner: false };
}

export function ErrorDetail({ row, technical = false }: { row: QueueRow; technical?: boolean }) {
  const info = explainFailure(row);
  return (
    <div className="text-xs">
      <p className={`font-bold ${info.needsOwner ? 'text-warning-400' : 'text-error-400'}`}>{info.headline}</p>
      <p className="mt-0.5 text-mist-300">{info.advice}</p>
      {technical && (row.error || row.skip_reason) && (
        <details className="mt-1">
          <summary className="cursor-pointer text-mist-500">פרטים טכניים</summary>
          <p className="mt-1 break-words text-mist-500">{row.error || row.skip_reason}</p>
        </details>
      )}
    </div>
  );
}
