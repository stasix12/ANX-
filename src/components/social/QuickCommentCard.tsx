'use client';

import { useEffect, useRef, useState } from 'react';
import { t } from '@/lib/social/i18n';
import { COMMENT_DELAY_MAX_SECONDS, COMMENT_DELAY_MIN_SECONDS } from '@/lib/social/rules';
import { MessageIcon } from '@/components/icons';
import { friendlyMessage } from '@/lib/social/errors';
import { Button, Toggle, useToast } from './ui';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * "תגובה מהירה אחרי פוסט" — the card that replaced מצב פרסום חכם on the round.
 *
 *   "יש להסיר מלוח הבקרה את הכרטיס הקיים ״מצב פרסום חכם״ ולהחליפו בכרטיס
 *    החדש: ״תגובה מהירה אחרי פוסט״... לאחר פרסום מוצלח, המערכת מנסה להוסיף את
 *    התגובה לפוסט המתאים, רק במקומות שבהם קיימת הרשאה ותמיכה בפלטפורמה."
 *    — 18.11.2026, with a binding reference image.
 *
 * ─── WHAT IS NEW HERE IS THE SWITCH, AND ONLY THE SWITCH ──────────────────
 *
 * The whole comment mechanism already existed and none of it was rebuilt: the
 * round keeps `comment_text` and `comment_media` (v14), every publication
 * keeps `comment_status` / `comment_at` / `comment_note` / `comment_shot`, and
 * the arm on the owner's PC already finds the post, writes the comment,
 * verifies it against Facebook and records what happened. The one thing that
 * did not exist was anybody marking a publication "ready for its comment"
 * except a person pressing a button. This card is that switch, plus the words
 * and how long to wait; the marking itself is the worker's, in
 * runCampaignComments, which is the only place that can see what has actually
 * gone out.
 *
 * ─── THE FOUR PROMISES THIS CARD MAY NOT BREAK ────────────────────────────
 *
 * 1. "כישלון בתגובה לא יגרום לפרסום חוזר של הפוסט." Nothing on this path
 *    touches `status`. The worker writes comment columns only, on a row whose
 *    post is already published, so a comment that fails cannot re-enter the
 *    publish queue — there is no edge from one to the other.
 * 2. "מניעת כפילויות באמצעות מזהה פרסום ייחודי." The id is the publication's
 *    own queue row. The worker arms a row only while its comment_status is
 *    still '' and claims it with a compare-and-set before commenting, so one
 *    post gets at most one automatic comment however many ticks pass.
 * 3. "אין להציג תגובה כמוצלחת לפני אימות אמיתי בפלטפורמה." The card shows no
 *    outcome at all. Outcomes are on the rows, in the comment rail below, and
 *    come from the existing verification — which answers 'unverified' when
 *    Enter was pressed and Facebook never confirmed, rather than calling it
 *    done.
 * 4. "אם הפלטפורמה לא מאפשרת זאת, יש להציג מצב ברור ולא לדמות הצלחה."
 *    Commenting is implemented for Facebook GROUPS and nothing else, so the
 *    worker arms group targets only and the line under the switch says so.
 *    A target that cannot be commented is left alone rather than armed and
 *    failed.
 *
 * ─── THE DELAY IS A FLOOR AND THE CARD SAYS SO ────────────────────────────
 *
 * "עיכוב תגובה" is the minimum AGE of the post — not a promise of when the
 * comment lands. The comment chore runs only in an idle window, needs 45
 * seconds of clear room (four minutes when the post's address still has to be
 * hunted), and does one comment per pass. On a dense queue that window comes
 * later, sometimes much later. A card that printed "30 שניות" as a schedule
 * would be making a promise this product cannot keep, so it says "לא לפני".
 *
 * ─── THE WORDS ARE THE ROUND'S, IN ONE COLUMN ─────────────────────────────
 *
 * The textarea writes the same `comment_text` the manual comment window writes.
 * That is deliberate — two columns for one sentence is the thing v14 exists to
 * prevent — and it has a consequence worth stating out loud, which the card
 * does: the arm reads the words at the moment it comments, so editing them
 * changes what the comments still to come will say.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The ceiling the brief sets on the text, enforced here and again before the write. */
export const COMMENT_TEXT_MAX = 500;

/**
 * ─── THE DELAYS, IN WHOLE HOURS ──────────────────────────────────────────
 *
 *   "באופציות תשאיר רק עיכוב תגובה - לבחירה מ שעה אחת עד 12 שעות"
 *   — 18.11.2026
 *
 * It was seconds-to-an-hour, because the first reference image drew
 * "30 שניות". The choice is hours now, and the column's own range moved with
 * it (v45: 3600..43200) so the two cannot disagree — a picker offering twelve
 * hours over a database that refuses anything above one is a control that
 * fails on the tap.
 *
 * STORED IN SECONDS STILL. The column did not change meaning or unit; only
 * what may be put in it. Twelve entries, one per hour, generated rather than
 * typed so the list and the range cannot drift apart.
 */
const DELAYS = Array.from(
  { length: COMMENT_DELAY_MAX_SECONDS / COMMENT_DELAY_MIN_SECONDS },
  (_, i) => (i + 1) * COMMENT_DELAY_MIN_SECONDS,
);

/**
 * "שעה" / "שעתיים" / "5 שעות" — Hebrew counts two of something with its own
 * word, and "2 שעות" is the kind of wrong that makes a screen read as
 * machine-made. Anything that is not a whole number of hours (a value stored
 * before v45, or one a future version adds) is spelled in minutes rather than
 * rendered as a bare number.
 */
function delayWords(seconds: number): string {
  const h = seconds / 3600;
  if (Number.isInteger(h)) {
    if (h === 1) return 'שעה';
    if (h === 2) return 'שעתיים';
    return `${h} שעות`;
  }
  const m = Math.round(seconds / 60);
  return `${m} דקות`;
}

export function QuickCommentCard({
  campaignName,
  auto,
  text,
  delaySeconds,
  onSave,
  disabled = false,
  className = '',
}: {
  /** Whose round this is — the card is per round, like the words it edits. */
  campaignName: string;
  auto: boolean;
  text: string;
  delaySeconds: number;
  /** One writer for all three stored values — see setCampaignAutoComment. */
  /**
   * One writer for all three stored values — see setCampaignAutoComment. It
   * may answer with the columns the database could not take, and the card
   * says them rather than reporting a clean save.
   */
  onSave: (next: { auto: boolean; text: string; delaySeconds: number }) => Promise<unknown> | void;
  disabled?: boolean;
  className?: string;
}) {
  /*
   * THE TEXTAREA IS LOCAL UNTIL IT IS SAVED, and the prop is the truth.
   *
   * The dashboard reloads on a 30-second poll, so a textarea bound straight to
   * the prop loses whatever is half-typed in it every time the poll lands. It
   * re-seeds when the round's stored text really changes — which is also what
   * happens after this card's own save, so the button stops offering to save
   * what is already saved.
   */
  const [draft, setDraft] = useState(text);
  const seeded = useRef(text);
  useEffect(() => {
    if (seeded.current !== text) {
      seeded.current = text;
      setDraft(text);
    }
  }, [text]);

  const [busy, setBusy] = useState(false);
  const writing = useRef(false);
  const dirty = draft !== text;
  const toast = useToast();

  /*
   * A REF, BECAUSE `busy` IS A RENDER TOO LATE — the same guard, for the same
   * measured reason, as `saving` on the settings screen: two taps dispatched
   * inside one task both run before the state flips.
   *
   * `quiet` IS FOR THE SWITCH AND ONLY THE SWITCH. <Toggle> handles its own
   * rejection — it rolls the switch back and says why — so a toast from here
   * as well would be the same failure announced twice. The rejection is still
   * re-thrown either way, because that is what tells the switch it did not
   * save.
   */
  const write = async (next: { auto: boolean; text: string; delaySeconds: number }, quiet = false) => {
    if (writing.current) return;
    writing.current = true;
    setBusy(true);
    try {
      /*
       * WHAT COULD NOT BE SAVED IS SAID, EVEN WHEN THE SAVE SUCCEEDED.
       *
       * The write survives a database one migration behind by dropping the
       * column it does not have and trying again — but a partial save that
       * reports "נשמר" is its own lie, and not a smaller one than the red
       * wall it replaced. So the names come back and the card says them.
       */
      const answer = (await onSave(next)) as { dropped?: string[] } | void;
      const dropped = answer && Array.isArray(answer.dropped) ? answer.dropped : [];
      if (dropped.length) toast(`נשמר, אבל ${dropped.length === 1 ? 'הגדרה אחת לא נשמרה' : `${dropped.length} הגדרות לא נשמרו`} — המסד עדיין לא מעודכן.`, 'error');
      else if (!quiet) toast('נשמר.');
    } catch (err) {
      if (!quiet) toast(friendlyMessage(err, 'השמירה נכשלה.'), 'error');
      throw err;
    } finally {
      writing.current = false;
      setBusy(false);
    }
  };

  const off = disabled || busy;

  return (
    <section
      dir="rtl"
      data-quick-comment
      aria-label={t('תגובה מהירה אחרי פוסט')}
      /*
       * THE SHELL — white, a soft blue hairline, the product's own radius and
       * one soft shadow: "כרטיס לבן עם מסגרת כחולה עדינה... אותם רדיוסים,
       * הצללות, ריווח וטיפוגרפיה". ink-850 is this product's card white and
       * ink-900 is the page, which is why the shell is the first and not the
       * second.
       */
      className={`rounded-3xl border border-brand-500/25 bg-ink-850 p-3 shadow-[0_4px_16px_-10px_rgba(2,124,187,0.45)] ${className}`}
    >
      {/* ─── 1. the heading row: round blue glyph at the start, switch at the end ── */}
      <div className="flex items-center gap-2.5">
        <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-brand-500 text-on-brand">
          <MessageIcon className="h-[18px] w-[18px]" />
        </span>
        <div className="min-w-0 flex-1">
          <p dir="auto" className="truncate text-[15px] font-extrabold leading-5 text-mist-100">
            {t('תגובה מהירה אחרי פוסט')}
          </p>
          {/* WHOSE ROUND, because the words are the round's and this screen
              shows more than one. Never translated: it is his own name for it. */}
          <p dir="auto" data-no-translate className="truncate text-[11px] font-bold leading-4 text-mist-500">
            {campaignName}
          </p>
        </div>
        {/*
          THE SWITCH, at the end of the row — which in RTL is the left edge,
          where the reference draws it. Toggle owns the optimistic state and
          rolls itself back with a toast when the write fails, so a switch that
          could not be saved does not sit there looking saved.
        */}
        <Toggle
          checked={auto}
          disabled={off}
          label={t('תגובה אוטומטית')}
          onChange={(v) => write({ auto: v, text, delaySeconds }, true)}
        />
      </div>

      {/* ─── 2. the words ──────────────────────────────────────────────────── */}
      <div className="mt-3">
        <label className="block text-[12px] font-bold text-mist-300" htmlFor="quick-comment-text">
          {t('טקסט התגובה')}
        </label>
        <textarea
          id="quick-comment-text"
          dir="auto"
          rows={3}
          maxLength={COMMENT_TEXT_MAX}
          disabled={off}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          placeholder={t('מה לכתוב מתחת לכל פוסט שיוצא')}
          className="mt-1 w-full rounded-2xl border border-brand-500/25 bg-ink-900 px-3 py-2 text-[14px] font-medium leading-5 text-mist-100 outline-none placeholder:text-mist-500 focus:border-brand-500 disabled:opacity-60"
        />
        <div className="mt-1 flex items-center justify-between gap-2">
          {/* The ceiling is stated rather than discovered by a cursor that
              stops moving — the same reason the daily target names its own. */}
          <span className="text-[11px] tabular-nums text-mist-500" dir="ltr">
            {draft.length}/{COMMENT_TEXT_MAX}
          </span>
          {/*
            THE SAVE IS ITS OWN PRESS, AND ONLY WHEN THERE IS SOMETHING TO
            SAVE. A textarea that writes on every keystroke would be a write per
            character to a column the worker reads while it comments.
          */}
          {dirty && (
            <Button
              variant="secondary"
              busy={busy}
              disabled={off}
              onClick={() => void write({ auto, text: draft.slice(0, COMMENT_TEXT_MAX), delaySeconds }).catch(() => undefined)}
              className="!min-h-9 !rounded-xl px-3 !text-[12px]"
            >
              {t('שמור טקסט')}
            </Button>
          )}
        </div>
      </div>

      {/* ─── 3. the one picker along the foot ─────────────────────────────── */}
      {/*
        ─── IT WAS THREE, AND TWO WERE REMOVED ON REQUEST ──────────────────
        *
        *   "סוג תגובה להסיר. תצוגה להסיר" — 18.11.2026
        *
        * "תצוגה" had one supported value (after every post) and "סוג תגובה"
        * only ever PRINTED what comment_media already said, with a tap that
        * opened the existing comment window. Neither stored anything of its
        * own, so neither leaves anything behind: no column was added for them
        * and none is dropped now. The image for a comment is still chosen
        * where it always was — the round's own comment window, on the
        * campaigns screen and from "תגובות מהירות" below this card.
        *
        * What is left is the one control that writes a column, at the width
        * the three shared, so the card keeps its proportions.
      */}
      <div className="mt-3">
        <label className="block truncate text-[11px] font-bold text-mist-500" htmlFor="quick-comment-delay">
          {t('עיכוב תגובה')}
        </label>
        <select
          id="quick-comment-delay"
          aria-label={t('עיכוב תגובה')}
          disabled={off}
          value={String(delaySeconds)}
          onChange={(e) => void write({ auto, text, delaySeconds: Number(e.target.value) }).catch(() => undefined)}
          className="mt-1 h-11 w-full min-w-0 rounded-2xl border border-brand-500/25 bg-ink-900 px-3 text-[13px] font-extrabold text-mist-100 outline-none focus:border-brand-500 disabled:opacity-60"
        >
          {/*
            THE STORED VALUE IS ALWAYS IN THE LIST. A round written before v45
            — or by a future version with a finer step — would otherwise render
            as a blank picker, and the first touch of it would silently snap to
            an hour nobody chose.
          */}
          {(DELAYS.includes(delaySeconds) ? DELAYS : [...DELAYS, delaySeconds].sort((x, y) => x - y)).map((sec) => (
            <option key={sec} value={sec}>
              {delayWords(sec)}
            </option>
          ))}
        </select>
      </div>

      {/*
        ─── WHAT IT WILL AND WILL NOT DO, IN TWO SENTENCES ──────────────────

        "לא לפני" and not "אחרי": the delay is the minimum age of the post. The
        comment goes out in the first idle window after that, and on a dense
        queue that window can be a good deal later — the product already has an
        hourly notice for exactly that backlog. Promising the minute would be
        promising something this product cannot keep.

        And the platform, named rather than implied: commenting is built for
        Facebook groups, so a target that is not one is left alone instead of
        being armed and failed.
      */}
      <p className="mt-2.5 text-[11px] leading-4 text-mist-500">
        {t('התגובה נוספת לפוסט שיצא בהצלחה, לא לפני')} <strong dir="auto">{delayWords(delaySeconds)}</strong>{' '}
        {t('מרגע הפרסום, בחלון הפנוי הראשון אחרי זה. כל פרסום מקבל תגובה אחת לכל היותר. עובד בקבוצות פייסבוק; יעד שאינו קבוצה לא יקבל תגובה ולא יסומן כאילו קיבל.')}
      </p>
    </section>
  );
}

/*
 * ─── WHAT WAS HERE: <Picker> ─────────────────────────────────────────────
 *
 * The box the two removed controls were drawn with — a label over a bordered
 * value, either inert or a doorway to its own editor. It had exactly two
 * callers, both of them "תצוגה" and "סוג תגובה", and it went out with them on
 * 18.11.2026 rather than being left as a component nothing renders.
 */
