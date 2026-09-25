'use client';

import { useState } from 'react';
import { screenshotUrl } from '@/lib/social/client';

/**
 * "What did the computer see?" — one tap, on a comment that failed.
 *
 * WHY THIS EXISTS. Three rounds were spent on "לא מצאנו את הפוסט בקבוצה"
 * while the owner was looking straight at the post on his phone. Both sides
 * were right and neither could prove it, because the one thing nobody could
 * see was the page as the WORKER'S browser had it — the group, a login wall,
 * a feed that never finished loading. Every fix was a guess.
 *
 * The picture is not decoration and not a developer tool. It is the evidence
 * that turns "it does not work" into a thing anybody can look at.
 *
 * Loaded on demand: the link is signed, short-lived, and worth nothing until
 * somebody actually wants to look.
 */
export function CommentShot({ path }: { path: string }) {
  const [url, setUrl] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);

  if (url) {
    return (
      <a href={url} target="_blank" rel="noreferrer" className="mt-2 block">
        {/* eslint-disable-next-line @next/next/no-img-element */}
        <img
          src={url}
          alt="מה שהמחשב ראה כשהתגובה נכשלה"
          className="max-h-64 w-full rounded-lg border border-ink-700 object-cover object-top"
        />
        <span className="mt-1 block text-[11px] text-mist-500">לחצו לפתיחה בגודל מלא</span>
      </a>
    );
  }

  return (
    <button
      type="button"
      disabled={busy || failed}
      onClick={async () => {
        setBusy(true);
        const signed = await screenshotUrl(path).catch(() => null);
        setBusy(false);
        if (signed) setUrl(signed);
        else setFailed(true);
      }}
      className="mt-1 text-[11px] text-brand-400 underline underline-offset-2 disabled:text-mist-500 disabled:no-underline"
    >
      {failed ? 'התמונה כבר לא זמינה.' : busy ? 'טוען…' : 'ראו מה המחשב ראה באותו רגע'}
    </button>
  );
}
