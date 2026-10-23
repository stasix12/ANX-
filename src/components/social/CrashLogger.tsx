'use client';

import { useEffect } from 'react';
import { crashLine, crashReport } from '@/lib/social/crash';
import { logClientActivity } from '@/lib/social/client';

/**
 * THE CRASHES THE ERROR BOUNDARY NEVER SEES.
 *
 * src/app/social/error.tsx catches what React throws while RENDERING. That is
 * not most of them. An exception inside a click handler, a promise nobody
 * awaited, a failed image decode, a timer that threw — none of those reach a
 * boundary. They stop the thing the owner just pressed, leave the screen
 * looking fine, and vanish.
 *
 * "בדוק: שגיאות JavaScript... Race Conditions... בקשות API שנכשלות" — all
 * three of those land here rather than in the boundary, which is why the
 * boundary alone could never have answered the question.
 *
 * ONE LINE PER FAULT, NOT PER OCCURRENCE. A render loop that throws sixty
 * times a second would otherwise fill the activity log the owner reads, and
 * the sixtieth line says nothing the first did not. The code from crash.ts is
 * stable for one fault, so it is also the key for "already reported".
 *
 * EVERYTHING IS REDACTED BEFORE IT IS WRITTEN, and nothing is thrown from
 * here: a logger that can itself fail is a second bug on top of the first.
 */
export function CrashLogger() {
  useEffect(() => {
    const seen = new Set<string>();

    const record = (value: unknown, kind: string) => {
      try {
        const route = window.location.pathname;
        const r = crashReport(value, route);
        /* A fault is reported once per screen-load. Keyed on the code AND
           the route, so the same TypeError on two screens is two reports. */
        const key = `${r.code}|${kind}`;
        if (seen.has(key)) return;
        seen.add(key);
        console.error(`[social] ${kind}`, value);
        void logClientActivity('error', 'client_error', crashLine(r), {
          route: r.route,
          code: r.code,
          name: r.name,
          frame: r.frame,
          kind,
        });
      } catch {
        /* Reporting a crash may not cause one. */
      }
    };

    const onError = (e: ErrorEvent) => record(e.error ?? e.message, 'error');
    const onRejection = (e: PromiseRejectionEvent) => record(e.reason, 'unhandledrejection');

    window.addEventListener('error', onError);
    window.addEventListener('unhandledrejection', onRejection);
    return () => {
      window.removeEventListener('error', onError);
      window.removeEventListener('unhandledrejection', onRejection);
    };
  }, []);

  return null;
}
