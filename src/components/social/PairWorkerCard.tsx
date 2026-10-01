'use client';

import { useState } from 'react';
import { callSocialApi } from '@/lib/social/client';
import { Button, Card } from '@/components/social/ui';

/*
 * "חיבור worker בענן" — הצד של הלקוח בזוגיות הזאת.
 *
 * The customer signs up like anybody, taps one button here, and reads out a
 * code. The operator pastes that code into the container's variables and the
 * worker becomes this customer's — no password changes hands, which is the
 * entire point: a SaaS where onboarding requires customers to share their
 * password has already failed its first security question.
 *
 * The code is single-use and dies within the hour, so showing it on screen
 * and sending it over WhatsApp is acceptable in a way a password never is:
 * by the time anybody replays it, it opens nothing.
 */
export function PairWorkerCard() {
  const [busy, setBusy] = useState(false);
  const [code, setCode] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function generate() {
    setBusy(true);
    setError(null);
    setCopied(false);
    try {
      const res = await callSocialApi<{ code: string }>('/api/social/pair');
      setCode(res.code);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  }

  async function copy() {
    if (!code) return;
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      /* Clipboard needs a secure context; the code is selectable below either way. */
    }
  }

  return (
    <Card
      title="חיבור worker בענן"
      subtitle="קוד חד-פעמי שמחבר את מנוע הפרסום לחשבון הזה — בלי למסור סיסמה לאף אחד."
    >
      <p className="text-sm text-mist-300">
        לוחצים, מעתיקים את הקוד ושולחים למי שמקים לכם את השרת. הקוד תקף לשעה, עובד פעם אחת בלבד, ואחרי
        החיבור הראשון המכונה זוכרת את החשבון בעצמה.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" busy={busy} onClick={generate}>
          {code ? 'צור קוד חדש' : 'צור קוד חיבור'}
        </Button>
        {code && (
          <Button variant="secondary" onClick={copy}>
            {copied ? '✓ הועתק' : 'העתק'}
          </Button>
        )}
      </div>
      {code && (
        <code
          dir="ltr"
          className="mt-3 block select-all break-all rounded-xl bg-ink-900/60 px-3 py-2 text-xs text-mist-200"
        >
          {code}
        </code>
      )}
      {error && <p className="mt-2 text-sm text-red-500">{error}</p>}
      <p className="mt-2 text-xs text-mist-500">
        בצד השרת מדביקים את הקוד במשתנה <code dir="ltr">SOCIAL_WORKER_PAIRING</code> ומפעילים מחדש. פג תוקף?
        פשוט יוצרים כאן קוד חדש.
      </p>
    </Card>
  );
}
