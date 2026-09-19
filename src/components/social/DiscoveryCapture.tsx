'use client';

import { useMemo, useState } from 'react';
import { InboxIcon } from '@/components/icons';
import { Button, Notice, inputClass } from '@/components/social/ui';
import { extractGroupUrls } from '@/lib/social/discovery';

export interface CaptureResult {
  added: number;
  duplicates: number;
  alreadyTargets: number;
  repeats: number;
  unreadable: number;
}

/**
 * Step 2: the one part of discovery that is genuinely manual, made as small
 * as it can be. The owner pastes anything — a link, twenty links, or a slab
 * of copied text with links buried inside it — and the system pulls the group
 * URLs out of it, de-duplicates them and reports exactly what happened.
 *
 * The count shown before submitting is what extractGroupUrls() actually found
 * in the box, not a guess; the count shown after is what the database actually
 * wrote.
 */
export function DiscoveryCapture({
  busy,
  onCapture,
}: {
  busy: boolean;
  /** Returns the real counts from the database, or null when it failed. */
  onCapture: (text: string) => Promise<CaptureResult | null>;
}) {
  const [text, setText] = useState('');
  const [result, setResult] = useState<CaptureResult | null>(null);
  const found = useMemo(() => extractGroupUrls(text), [text]);

  async function submit() {
    const res = await onCapture(text);
    if (res) {
      setResult(res);
      // Only clear the box on a real write, so nothing the owner pasted is
      // lost when the save failed.
      setText('');
    }
  }

  return (
    <div className="space-y-2.5">
      <p className="text-sm leading-relaxed text-mist-300">
        הדביקו כאן קישורים לקבוצות. אפשר קישור אחד, רשימה שלמה, או פשוט להעתיק קטע טקסט מפייסבוק — המערכת תשלוף מתוכו את כל הקישורים לקבוצות.
      </p>
      <label className="block">
        <span className="sr-only">קישורים לקבוצות</span>
        <textarea
          className={`${inputClass} min-h-32 font-mono text-sm`}
          dir="ltr"
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={'https://www.facebook.com/groups/…\nhttps://www.facebook.com/groups/…'}
          aria-label="קישורים לקבוצות"
        />
      </label>
      <div className="flex flex-wrap items-center gap-2">
        <Button size="lg" className="grow" busy={busy} disabled={found.length === 0} onClick={submit}>
          <InboxIcon className="h-4 w-4" />
          {/* `found` is DISTINCT groups, not links: a paste with the same group
              three times shows 1 here, and the word must match the number. */}
          קלוט {found.length > 0 ? `${found.length} קבוצות` : 'קבוצות'}
        </Button>
      </div>
      {text.trim().length > 0 && found.length === 0 && (
        <p className="text-xs text-mist-500">לא זוהה בטקסט אף קישור לקבוצה. קישור לקבוצה נראה כך: facebook.com/groups/…</p>
      )}
      {/* Every line is one count from the database, and each one says exactly
          what it counted. An in-paste repeat is NOT "already in the list", and a
          Facebook link that simply is not a group is not reported at all. */}
      {result && (
        <Notice tone={result.added > 0 ? 'success' : 'info'}>
          <span className="block">נוספו {result.added} קבוצות חדשות לרשימת הגילוי.</span>
          {result.duplicates > 0 && <span className="block">{result.duplicates} כבר היו ברשימת הגילוי מקודם.</span>}
          {result.alreadyTargets > 0 && <span className="block">{result.alreadyTargets} כבר נמצאות במאגר הפרסום שלכם.</span>}
          {result.repeats > 0 && (
            <span className="block">{result.repeats} קישורים הופיעו יותר מפעם אחת בטקסט שהדבקתם, והמערכת איחדה אותם.</span>
          )}
          {result.unreadable > 0 && (
            <span className="block">{result.unreadable} קישורים נראו כמו קישור לקבוצה אבל לא היה אפשר לחלץ מהם מזהה קבוצה.</span>
          )}
        </Notice>
      )}
    </div>
  );
}
