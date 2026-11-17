'use client';

import { useEffect, useState } from 'react';
import { t } from '@/lib/social/i18n';
import { formatDayMonthHe, formatTimeHe, ltr } from '@/lib/social/time';
import { lastRunScope, type LastRunScope } from '@/lib/social/client';
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

/**
 * "17.11 · 16:23" — the run the number is about, said the way the card says it.
 *
 * HERE RATHER THAN ON EACH SCREEN, because three screens open this sheet and
 * three spellings of the same run is how a number stops being checkable
 * against the card it was pressed from.
 *
 * THE ROUND'S OWN HOUR WHEN THERE IS ONE, the last publication's otherwise.
 * `round_at` is the occasion the planner wrote down; the publication time is
 * when pacing actually got to the last group, which on a long run is an hour
 * later and is not what the card shows.
 *
 * ltr(), not dir="ltr": this goes into a Hebrew sentence as a plain string, and
 * two European number runs around neutral separators resolve to RTL inside it
 * — "16:23 · 17.11", the hour in front of the date. The same correction
 * ShortStamp documents at length for the strip on the dashboard.
 */
/**
 * WHICH RUN THIS SHEET IS ABOUT, read when it opens.
 *
 * `undefined` while the read is in flight, `null` when the round has never
 * published. The sheet draws those two differently and so must everything
 * that feeds it — see publishedCount.
 *
 * ONE HOOK FOR ALL THREE SCREENS. The dashboard, the rounds list and the round
 * itself all open this sheet, each computing the number it showed in its own
 * way — everPublished, everPublished again, and `published.length`. Three
 * answers to one question is how the sheet came to promise one set of posts
 * and write to another.
 *
 * It does not re-read while the sheet is open. The scope is the thing the
 * number described, and a run that starts behind the open sheet must not move
 * the target under the person deciding.
 */
export function useLastRunScope(campaignId: string | null): LastRunScope | null | undefined {
  const [scope, setScope] = useState<LastRunScope | null | undefined>(undefined);
  useEffect(() => {
    if (!campaignId) {
      setScope(undefined);
      return;
    }
    let alive = true;
    setScope(undefined);
    lastRunScope(campaignId)
      .then((s) => {
        if (alive) setScope(s);
      })
      /* A failed read is "we could not tell", and the sheet's empty case says
         so in words. Throwing here would take the whole screen down over a
         sheet nobody has typed into yet. */
      .catch(() => {
        if (alive) setScope(null);
      });
    return () => {
      alive = false;
    };
  }, [campaignId]);
  return scope;
}

export function runLabelOf(scope: Pick<LastRunScope, 'roundAt' | 'fromISO' | 'lastPublishedAt'> | null | undefined): string {
  if (!scope) return '';
  const day = formatDayMonthHe(scope.lastPublishedAt ?? scope.fromISO);
  const hour = scope.roundAt || (scope.lastPublishedAt ? formatTimeHe(scope.lastPublishedAt) : '');
  return ltr(hour ? `${day} · ${hour}` : day);
}

export function CampaignCommentSheet({
  open,
  onClose,
  publishedCount,
  runLabel = '',
  initialText,
  initialMedia,
  initialGapSeconds,
  busy,
  onSubmit,
}: {
  open: boolean;
  onClose: () => void;
  /**
   * How many posts this will land on — the number that makes it a decision.
   *
   * `null` while the screen is still reading which run that is. It is NOT 0:
   * zero means "this round has never published", which this sheet answers with
   * a notice and no form at all, and showing that for the half second before
   * the answer arrives reads as "there is nothing here" on a round that has
   * published all morning.
   */
  publishedCount: number | null;
  /**
   * WHICH RUN THE NUMBER IS ABOUT — "17.11 · 16:23".
   *
   * "שאני רוצה להוסיף תגובה מהירה הוא לא נותן להוסיף תגובה לא רק לפוסט
   *  שבחרתי אלא ל-224 פרסומים." The sheet used to act on everything the round
   * had published since the day it was created and said only "בסבב הזה", which
   * is true of all 224 of them. Naming the run is what makes the number
   * checkable against the card he pressed.
   */
  runLabel?: string;
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
  /* Read once into a local: every line below asks "how many", and a `?? 0`
     repeated nine times is nine chances to forget one. */
  const count = publishedCount ?? 0;

  /* What the choice actually costs, in the unit a person thinks in. 117 posts
     at ten seconds is twenty minutes; at sixty it is nearly two hours, and
     nobody works that out in their head while choosing. */
  const totalMinutes = Math.round((count * gapSeconds) / 60);
  const howLong = totalMinutes < 1 ? 'פחות מדקה' : totalMinutes < 60 ? `בערך ${totalMinutes} דקות` : `בערך ${Math.round(totalMinutes / 6) / 10} שעות`;

  return (
    <Sheet open={open} onClose={onClose} title={t('הוסף תגובה לפרסומים של הריצה האחרונה')}>
      {publishedCount === null ? (
        /* Still reading which run this is. See the prop's note for why this is
           not drawn as the empty case. */
        <p className="text-sm text-mist-500">{t('בודק על אילו פרסומים התגובה תיווסף…')}</p>
      ) : publishedCount === 0 ? (
        /* Nothing has gone out yet, so there is nothing to comment on. Saying
           it here beats a button that looks live and does nothing. */
        <Notice tone="warn">{t('בסבב הזה עוד לא יצא אף פרסום, ולכן אין על מה להגיב. חזרו אחרי שהפרסומים יתחילו לצאת.')}</Notice>
      ) : (
        <>
          <Field label={t('הטקסט של התגובה')} hint={t('אפשר להשאיר ריק ולהעלות רק תמונה.')}>
            <textarea
              className={inputClass}
              dir="auto"
              rows={4}
              value={text}
              onChange={(e) => setText(e.target.value)}
              placeholder={t('מחירון מלא בתמונה 👇 לתיאום: 050-0000000')}
            />
          </Field>
          <div className="mt-3">
            {/* One image, and the limit is Facebook's: a comment takes one
                attachment. Accepting more and quietly sending one would be
                worse than not accepting them. */}
            <Field label={t('תמונה לתגובה (לא חובה)')} hint={t('מחירון, לפני/אחרי — תמונה אחת, זה מה שפייסבוק מאפשרת בתגובה.')}>
              {/* The uploader prints its own footer, and its default one says
                  "תמונות (כמה שתרצו) או סרטון אחד" — the opposite of the rule
                  above it, three centimetres away, inside the one sheet where
                  the limit is one. */}
              <MediaUploader
                media={media}
                hint={t('תמונה אחת. זה מה שפייסבוק מאפשרת בתגובה.')}
                onChange={(m) => setMedia(m.filter((x) => x.kind === 'image').slice(0, 1))}
              />
            </Field>
          </div>

          <div className="mt-3">
            <Field label={t('מרווח בין תגובה לתגובה (שניות)')} hint={t('כמה זמן להמתין בין פרסום לפרסום.')}>
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
                label={t('מרווח מהיר')}
                value={String(gapSeconds)}
                onChange={setGap}
                options={QUICK_GAPS.map((v) => ({ value: v, label: `${v} שנ׳` }))}
              />
            </div>
          </div>

          {/* THE RUN IS NAMED, and the number is of that run alone. Both
              halves matter: "בסבב הזה" was true of 224 posts going back weeks,
              and a number with no run beside it cannot be checked against the
              card it was pressed from. */}
          <p className="mt-3 text-sm text-mist-300">
            התגובה תיווסף ל-{count} הפרסומים של הריצה האחרונה{runLabel ? ` (${runLabel})` : ''}, מהחשבון שלכם — {howLong} בסך הכול.
          </p>
          <p className="mt-1.5 text-xs text-mist-500">
            {t('פרסומים של ריצות קודמות באותו סבב לא ייגעו.')}
          </p>
          {/*
            Said before the button, not after: the comments arrive over a while
            and somebody watching for all of them at once would think it broke.
          */}
          <p className="mt-1.5 text-xs text-mist-500">
            {t('הן נוספות אחת-אחת ולא כולן יחד, והתוכנה במחשב צריכה לפעול לאורך כל הזמן הזה. אפשר לעקוב בכרטיס הסבב.')}
          </p>
          {/* Said once, plainly, and only when it applies. It is his account
              and his call — but a choice this fast is worth knowing about
              before it is made, not after. */}
          {gapSeconds < 15 && count > 20 && (
            <p className="mt-1.5 text-xs text-warning-400">
              {t('מרווח קצר על הרבה פרסומים הוא הדפוס שפייסבוק מזהה הכי בקלות. 20 שניות ומעלה בטוח יותר לחשבון.')}
            </p>
          )}
          <p className="mt-1.5 text-xs text-mist-500">
            {t('תגובה נוספת רק לפרסום שהמערכת מזהה בוודאות שהוא שלה. פרסום שלא הצליחה להגיב עליו מסומן בנפרד ולא נספר כאילו הצליח.')}
          </p>

          <div className="mt-4 flex flex-wrap gap-2">
            <Button busy={busy} disabled={nothing} onClick={() => onSubmit(text.trim(), media, gapSeconds)}>
              {`הוסף תגובה ל-${count} פרסומים`}
            </Button>
            <Button variant="secondary" onClick={onClose}>
              {t('ביטול')}
            </Button>
          </div>
        </>
      )}
    </Sheet>
  );
}
