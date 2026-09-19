'use client';

import Link from 'next/link';
import { CheckIcon } from '@/components/icons';
import { CARD, TONE_FILL, TONE_TEXT } from './ui';

/**
 * The three things that have to be true before a single word reaches
 * Facebook, in the order they have to be true, shown only until they are.
 *
 * There was no onboarding anywhere in /social — grep for onboard|wizard|
 * getting.started across the module returns nothing. A cold install opened
 * straight onto the full production dashboard: four zero tiles, a daily-limit
 * footnote, a quick-action grid, a worker card and an empty activity log. The
 * individual empty states are good ("הספרייה עדיין ריקה… צור פוסט ראשון",
 * "אין עדיין קבוצות… הוסף קבוצה ראשונה") but nothing SEQUENCED them, and
 * nothing said that groups need a PC running before any of it matters. The
 * header's primary action is "פוסט חדש", so that is where a new owner starts
 * — writing a post they cannot send anywhere.
 *
 * Every step's done/not-done is read from real data the dashboard already
 * loaded: how many targets are enabled, whether a worker has a live
 * heartbeat, and whether the queue has ever held a row. Nothing here is a
 * stored "onboarding_completed" flag that can disagree with reality, and the
 * card removes itself the moment the first publication exists.
 */
export function SetupChecklist({
  hasTargets,
  workerOnline,
  hasPublications,
}: {
  hasTargets: boolean;
  workerOnline: boolean;
  hasPublications: boolean;
}) {
  // Nothing to teach once something has actually gone through the queue.
  if (hasPublications) return null;

  const steps = [
    {
      done: hasTargets,
      title: 'הוסיפו קבוצות (או חברו דף פייסבוק)',
      body: 'קבוצות מוסיפים בהדבקת הקישור שלהן. דף עסקי מתחבר דרך פייסבוק עצמה.',
      href: '/social/groups',
      cta: 'להוספת קבוצות',
    },
    {
      done: workerOnline,
      title: 'הפעילו את התוכנה במחשב',
      body: 'פרסום לקבוצות עובד רק דרך חלון Chrome אמיתי על המחשב שלכם — לפייסבוק אין דרך אחרת מאז אפריל 2024. לחצו פעמיים על start-worker.cmd והשאירו את החלון פתוח.',
      href: '#browser-status',
      cta: 'למצב החיבור',
    },
    {
      done: false,
      title: 'כתבו פוסט ובחרו לאן הוא הולך',
      body: 'בסוף כתיבת הפוסט בוחרים את הקבוצות ואת התזמון, ורואים בדיוק מה ייצא ומתי לפני שמאשרים.',
      href: '/social/posts/new',
      cta: 'לפוסט חדש',
    },
  ];

  // The first thing still undone is the only one with a button: a checklist
  // with three competing calls to action is a menu, not a sequence.
  const nextIndex = steps.findIndex((s) => !s.done);

  return (
    <section aria-label="הצעדים הראשונים" className={`${CARD} p-4`}>
      <h2 className="text-base font-extrabold leading-tight text-mist-100">שלושה צעדים לפרסום הראשון</h2>
      <p className="mt-0.5 text-xs leading-relaxed text-mist-500">
        הכרטיס הזה נעלם מעצמו ברגע שהפרסום הראשון נכנס לתור.
      </p>
      <ol className="mt-3 space-y-3">
        {steps.map((step, i) => (
          <li key={step.title} className="flex min-w-0 gap-3">
            <span
              aria-hidden
              className={`mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full text-[11px] font-extrabold ${
                step.done ? `${TONE_FILL.good} text-ink-950` : 'bg-ink-800 text-mist-500'
              }`}
            >
              {step.done ? <CheckIcon className="h-3.5 w-3.5" strokeWidth={3} /> : i + 1}
            </span>
            <div className="min-w-0 grow">
              <p className={`text-sm font-bold leading-snug ${step.done ? TONE_TEXT.good : 'text-mist-100'}`}>
                {step.title}
                {step.done && <span className="sr-only"> — הושלם</span>}
              </p>
              <p className="mt-0.5 text-xs leading-relaxed text-mist-500">{step.body}</p>
              {i === nextIndex && (
                <Link
                  href={step.href}
                  className="mt-2 inline-flex min-h-11 items-center rounded-xl bg-brand-500 px-4 text-sm font-bold text-on-brand"
                >
                  {step.cta}
                </Link>
              )}
            </div>
          </li>
        ))}
      </ol>
    </section>
  );
}
