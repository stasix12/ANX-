'use client';

import { useState } from 'react';
import type { MediaItem } from '@/lib/social/types';
import { MediaUploader } from './MediaUploader';
import { Button, Field, Notice, SegmentedControl, Sheet, inputClass } from './ui';

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
/* The pace most rounds want, one tap away. Anything else is typed. */
const QUICK_GAPS = ['10', '20', '30', '60'];

export function CampaignCommentSheet({
  open,
  onClose,
  publishedCount,
  initialText,
  initialMedia,
  initialGapSeconds,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  /** How many posts this will land on — the number that makes it a decision. */
  publishedCount: number;
  initialText: string;
  initialMedia: MediaItem[];
  initialGapSeconds: number;
  busy: boolean;
  onSubmit: (text: string, media: MediaItem[], gapSeconds: number) => void;
}) {
  const [text, setText] = useState(initialText);
  const [media, setMedia] = useState<MediaItem[]>(initialMedia);
  /*
   * Held as text, committed on blur. A number input clamped on every keystroke
   * cannot be cleared to type a new value — the same correction the interval
   * field on the run editor needed, for the same reason.
   */
  const [gap, setGap] = useState(String(initialGapSeconds));
  const gapSeconds = Math.max(5, Math.min(600, Number(gap) || initialGapSeconds));
  const nothing = !text.trim() && media.length === 0;

  /* What the choice actually costs, in the unit a person thinks in. 117 posts
     at ten seconds is twenty minutes; at sixty it is nearly two hours, and
     nobody works that out in their head while choosing. */
  const totalMinutes = Math.round((publishedCount * gapSeconds) / 60);
  const howLong = totalMinutes < 1 ? 'פחות מדקה' : totalMinutes < 60 ? `בערך ${totalMinutes} דקות` : `בערך ${Math.round(totalMinutes / 6) / 10} שעות`;

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
              {/* The uploader prints its own footer, and its default one says
                  "תמונות (כמה שתרצו) או סרטון אחד" — the opposite of the rule
                  above it, three centimetres away, inside the one sheet where
                  the limit is one. */}
              <MediaUploader
                media={media}
                hint="תמונה אחת. זה מה שפייסבוק מאפשרת בתגובה."
                onChange={(m) => setMedia(m.filter((x) => x.kind === 'image').slice(0, 1))}
              />
            </Field>
          </div>

          <div className="mt-3">
            <Field label="מרווח בין תגובה לתגובה (שניות)" hint="כמה זמן להמתין בין פרסום לפרסום.">
              <input
                className={inputClass}
                dir="ltr"
                type="number"
                min={5}
                max={600}
                inputMode="numeric"
                value={gap}
                onChange={(e) => setGap(e.target.value)}
                onBlur={() => setGap(String(gapSeconds))}
              />
            </Field>
            {/* The primitive, not eleven lines of bespoke markup: it brings
                the 44px floor, aria-pressed, the focus ring and sideways
                scrolling with it, and it was already being reinvented here
                with a colour token that does not exist. */}
            <div className="mt-2">
              <SegmentedControl
                variant="chips"
                label="מרווח מהיר"
                value={String(gapSeconds)}
                onChange={setGap}
                options={QUICK_GAPS.map((v) => ({ value: v, label: `${v} שנ׳` }))}
              />
            </div>
          </div>

          <p className="mt-3 text-sm text-mist-300">
            התגובה תיווסף ל-{publishedCount} הפרסומים שכבר יצאו בסבב הזה, מהחשבון שלכם — {howLong} בסך הכול.
          </p>
          {/*
            Said before the button, not after: the comments arrive over a while
            and somebody watching for all of them at once would think it broke.
          */}
          <p className="mt-1.5 text-xs text-mist-500">
            הן נוספות אחת-אחת ולא כולן יחד, והתוכנה במחשב צריכה לפעול לאורך כל הזמן הזה. אפשר לעקוב בכרטיס הסבב.
          </p>
          {/* Said once, plainly, and only when it applies. It is his account
              and his call — but a choice this fast is worth knowing about
              before it is made, not after. */}
          {gapSeconds < 15 && publishedCount > 20 && (
            <p className="mt-1.5 text-xs text-warning-400">
              מרווח קצר על הרבה פרסומים הוא הדפוס שפייסבוק מזהה הכי בקלות. 20 שניות ומעלה בטוח יותר לחשבון.
            </p>
          )}
          <p className="mt-1.5 text-xs text-mist-500">
            תגובה נוספת רק לפרסום שהמערכת מזהה בוודאות שהוא שלה. פרסום שלא הצליחה להגיב עליו מסומן בנפרד ולא נספר כאילו הצליח.
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button busy={busy} disabled={nothing} onClick={() => onSubmit(text.trim(), media, gapSeconds)}>
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
