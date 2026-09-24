'use client';

import { useState } from 'react';
import type { MediaItem } from '@/lib/social/types';
import { MediaUploader } from './MediaUploader';
import { Button, Field, Notice, Sheet, inputClass } from './ui';

/**
 * "Comment on everything this round has published" — a decision, not a setting.
 *
 * The first version of this ran automatically, the instant each post went up,
 * configured once in ההגדרות. Both halves were wrong and the owner said so:
 * WHEN to comment is a judgement — a price list is worth adding after a post
 * has had a few hours to be seen — and the words belong to the round they are
 * about, not to a global setting that would put last month's offer under this
 * month's posts.
 *
 * So it lives here, on the round, behind a button somebody presses.
 */
export function CampaignCommentSheet({
  open,
  onClose,
  publishedCount,
  initialText,
  initialMedia,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  /** How many posts this will land on — the number that makes it a decision. */
  publishedCount: number;
  initialText: string;
  initialMedia: MediaItem[];
  busy: boolean;
  onSubmit: (text: string, media: MediaItem[]) => void;
}) {
  const [text, setText] = useState(initialText);
  const [media, setMedia] = useState<MediaItem[]>(initialMedia);
  const nothing = !text.trim() && media.length === 0;

  return (
    <Sheet open={open} onClose={onClose} title="הוסף תגובה לכל הפרסומים בסבב">
      {publishedCount === 0 ? (
        /* Nothing has gone out yet, so there is nothing to comment on. Saying
           it here beats a button that looks live and does nothing. */
        <Notice tone="warn">בסבב הזה עוד לא יצא אף פרסום, ולכן אין על מה להגיב. חזרו אחרי שהפרסומים יתחילו לצאת.</Notice>
      ) : (
        <>
          <Field label="הטקסט של התגובה" hint="אפשר להשאיר ריק ולהעלות רק תמונה.">
            <textarea
              className={inputClass}
              dir="auto"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder="מחירון מלא בתמונה 👇 לתיאום: 050-0000000"
            />
          </Field>
          <div className="mt-3">
            {/* One image, and the limit is Facebook's: a comment takes one
                attachment. Accepting more and quietly sending one would be
                worse than not accepting them. */}
            <Field label="תמונה לתגובה (לא חובה)" hint="מחירון, לפני/אחרי — תמונה אחת, זה מה שפייסבוק מאפשרת בתגובה.">
              <MediaUploader media={media} onChange={(m) => setMedia(m.filter((x) => x.kind === 'image').slice(0, 1))} />
            </Field>
          </div>

          <p className="mt-3 text-sm text-mist-400">
            התגובה תיווסף ל-{publishedCount} הפרסומים שכבר יצאו בסבב הזה, מהחשבון שלכם.
          </p>
          {/*
            Said before the button, not after: the comments arrive over a while
            and somebody watching for all of them at once would think it broke.
          */}
          <p className="mt-1.5 text-xs text-mist-500">
            הן נוספות אחת-אחת לאורך כמה דקות ולא כולן יחד, והתוכנה במחשב צריכה לפעול. אפשר לעקוב בכרטיס הסבב.
          </p>
          <p className="mt-1.5 text-xs text-mist-500">
            תגובה נוספת רק לפרסום שהמערכת מזהה בוודאות שהוא שלה. פרסום שלא הצליחה להגיב עליו מסומן בנפרד ולא נספר כאילו הצליח.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button busy={busy} disabled={nothing} onClick={() => onSubmit(text.trim(), media)}>
              {`הוסף תגובה ל-${publishedCount} פרסומים`}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              ביטול
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
