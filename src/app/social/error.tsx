'use client';

import { useEffect, useState } from 'react';
import { Button } from '@/components/social/ui';
import { friendlyMessage } from '@/lib/social/errors';
import { crashLine, crashReport, type CrashReport } from '@/lib/social/crash';
import { logClientActivity } from '@/lib/social/client';

/**
 * The last net under every /social screen.
 *
 * Without this file a single bad row anywhere in the module handed the owner
 * Next's own error frame: "This page couldn't load / Reload to try again" —
 * English, left-to-right, inside a Hebrew RTL product, with no way back into
 * the app. On a phone that is a dead end.
 *
 * Deliberately NOT wrapped in SocialShell. The shell reads the session, the
 * nav and three pollers of its own; if the thing that threw was any of those,
 * rendering it here would throw again inside the boundary and take the frame
 * down with it. This file draws its own frame out of the theme tokens, which
 * the /social layout has already put on the tree above it.
 *
 * The message obeys house rule 3: friendlyMessage() never emits raw exception
 * text, and the original stays on the console for whoever is looking at one.
 *
 * AND IT LEAVES A RECORD NOW, which it did not. "אתר את הגורם האמיתי לקריסה"
 * was asked of a screenshot showing this card with no route, no line and no
 * code — because `error.digest` is set only for an error thrown on the
 * SERVER, and that one was a client render. There was nothing to look up.
 *
 * So the boundary writes one line to the activity log and prints a six
 * character code the owner can read out. Both go through crash.ts, which
 * redacts anything credential-shaped first: an exception message is the most
 * likely place in this product for a token to appear, and this table is one
 * the owner opens on his phone. "אסור להכניס ללוגים: Passwords, Facebook
 * tokens, Secrets."
 */
export default function SocialError({ error, reset }: { error: Error & { digest?: string }; reset: () => void }) {
  const [report, setReport] = useState<CrashReport | null>(null);

  useEffect(() => {
    // The only place the raw error is allowed to exist: a developer console.
    console.error('[social] render error', error);
    /* `window` rather than usePathname(): this boundary can be rendered when
       the router tree itself is what threw, and the address bar is the one
       source of the route that cannot also be broken. */
    const route = typeof window === 'undefined' ? '/' : window.location.pathname;
    const r = crashReport(error, route, error.digest);
    setReport(r);
    /* Fire and forget, and already guarded: logClientActivity swallows its
       own failures, which matters most when the thing that threw IS the
       database connection. */
    void logClientActivity('error', 'screen_crashed', crashLine(r), {
      route: r.route,
      code: r.code,
      name: r.name,
      frame: r.frame,
      digest: r.digest,
    });
  }, [error]);

  return (
    <div className="grid min-h-dvh place-items-center bg-ink-950 px-4 py-10">
      <div className="w-full max-w-md rounded-card border border-ink-700 bg-ink-850 p-6 text-center shadow-[0_2px_6px_rgba(40,20,80,0.03),0_8px_24px_rgba(40,20,80,0.06)]">
        <span aria-hidden className="mx-auto mb-3 grid h-12 w-12 place-items-center rounded-full bg-error-300/12 text-2xl font-extrabold text-error-400">
          !
        </span>
        <h1 className="text-lg font-extrabold leading-tight text-mist-100">המסך הזה נתקע</h1>
        <p className="mt-2 text-sm leading-relaxed text-mist-300">{friendlyMessage(error, 'משהו השתבש בהצגת המסך.')}</p>
        <p className="mt-2 text-xs leading-relaxed text-mist-500">
          שום פרסום לא בוטל ושום נתון לא נמחק — זו תקלת תצוגה בלבד. נסו לטעון מחדש, או חזרו ללוח הבקרה.
        </p>
        <div className="mt-5 flex flex-col gap-2 sm:flex-row sm:justify-center">
          <Button size="lg" onClick={reset} className="sm:min-w-32">
            נסו שוב
          </Button>
          {/* A plain anchor, not <Link>: a client-side navigation re-uses the
              router tree that just threw, and on a repeat failure the owner
              would tap this and watch nothing happen. A full load always
              gets them out. */}
          <a
            href="/social"
            className="inline-flex min-h-12 items-center justify-center rounded-xl border border-ink-700 bg-ink-800 px-5 text-base font-bold text-mist-100 sm:min-w-32"
          >
            ללוח הבקרה
          </a>
        </div>
        {/* ALWAYS, NOT ONLY FOR A SERVER ERROR. The same fault always prints
            the same six characters, so "זה קרה שוב, 4F2A9C" names a bug and
            two different codes are two different bugs. */}
        {report && (
          <p className="mt-4 text-[11px] leading-5 text-mist-500">
            מזהה התקלה: <span dir="ltr" className="font-mono font-bold text-mist-300">{report.code}</span>
            <span className="mt-0.5 block">
              מסך: <span dir="ltr" className="font-mono">{report.route}</span>
            </span>
            <span className="mt-1 block">התקלה נרשמה במרכז הפעילות — אפשר לשלוח לי את המזהה הזה.</span>
          </p>
        )}
      </div>
    </div>
  );
}
