'use client';

import { useEffect, useRef, useState } from 'react';
import { t } from '@/lib/social/i18n';
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
 * The delays the picker offers, in seconds. Whole, round amounts a person
 * would actually mean — and the stored value is added to the list when it is
 * not one of them, so a round set from elsewhere never renders as a blank
 * picker or silently snaps to a number nobody chose.
 */
const DELAYS = [10, 30, 60, 120, 300, 900, 3600];

/** "30 שניות" / "2 דקות" / "שעה" — the one spelling, for one list. */
function delayWords(seconds: number): string {
  if (seconds < 60) return `${seconds} שניות`;
  if (seconds === 60) return 'דקה';
  if (seconds === 3600) return 'שעה';
  const m = seconds / 60;
  return `${Number.isInteger(m) ? m : m.toFixed(1)} דקות`;
}

export function QuickCommentCard({
  campaignName,
  auto,
  text,
  delaySeconds,
  hasMedia,
  onSave,
  onOpenComment,
  disabled = false,
  className = '',
}: {
  /** Whose round this is — the card is per round, like the words it edits. */
  campaignName: string;
  auto: boolean;
  text: string;
  delaySeconds: number;
  /** Whether the round already carries an image for its comment. */
  hasMedia: boolean;
  /** One writer for all three fields — see setCampaignAutoComment. */
  onSave: (next: { auto: boolean; text: string; delaySeconds: number }) => Promise<unknown> | void;
  /** The existing comment window, which is where an image is chosen. */
  onOpenComment?: () => void;
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
      await onSave(next);
      if (!quiet) toast('נשמר.');
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

      {/* ─── 3. the three pickers along the foot ───────────────────────────── */}
      {/*
        grid-cols-3 with `[&>*]:min-w-0`, which is this product's standing rule
        for every multi-column grid: the three narrow together on a 320px phone
        instead of overflowing the card.

        TWO OF THE THREE STATE A FACT AND DO NOT OFFER A CHOICE, and that is
        the brief's own discipline applied twice:

          · תצוגה has exactly one supported value — after every post. A picker
            with one option is a decoration, and inventing a second (after the
            first post only? after a round?) would be a setting nothing reads.
          · סוג תגובה is DERIVED from whether the round carries an image, which
            is already stored in comment_media. A second column saying the same
            thing would be a second source of truth for one fact — so this one
            PRINTS the type and opens the comment window, where the image is
            chosen and removed. That is the pattern the schedule board already
            uses: a readout box that is also the door to its own editor.

        Only עיכוב תגובה writes, because only it has a column of its own.
      */}
      <div className="mt-3 grid grid-cols-3 gap-2 [&>*]:min-w-0">
        <Picker label={t('תצוגה')} value={t('אחרי כל פוסט')} note={t('הערך היחיד הנתמך')} />
        <Picker
          label={t('סוג תגובה')}
          value={hasMedia ? t('טקסט ותמונה') : t('טקסט')}
          onClick={onOpenComment}
          note={onOpenComment ? t('נבחר בחלון התגובה') : undefined}
        />
        <div className="min-w-0">
          <label className="block truncate text-[11px] font-bold text-mist-500" htmlFor="quick-comment-delay">
            {t('עיכוב תגובה')}
          </label>
          <select
            id="quick-comment-delay"
            aria-label={t('עיכוב תגובה')}
            disabled={off}
            value={String(delaySeconds)}
            onChange={(e) => void write({ auto, text, delaySeconds: Number(e.target.value) }).catch(() => undefined)}
            className="mt-1 h-11 w-full min-w-0 rounded-2xl border border-brand-500/25 bg-ink-900 px-2 text-[12.5px] font-extrabold text-mist-100 outline-none focus:border-brand-500 disabled:opacity-60"
          >
            {(DELAYS.includes(delaySeconds) ? DELAYS : [...DELAYS, delaySeconds].sort((a, b) => a - b)).map((s) => (
              <option key={s} value={s}>
                {delayWords(s)}
              </option>
            ))}
          </select>
        </div>
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

/**
 * One of the two foot boxes that STATE something. Drawn exactly like the live
 * picker beside them — same height, same radius, same hairline — because the
 * reference draws three identical boxes; what differs is that these two have
 * nothing to choose, and a box that opens its own editor says so by being a
 * button.
 */
function Picker({
  label,
  value,
  note,
  onClick,
}: {
  label: string;
  value: string;
  note?: string;
  onClick?: () => void;
}) {
  const body = (
    <span className="flex h-11 w-full min-w-0 items-center justify-center rounded-2xl border border-brand-500/25 bg-ink-900 px-2 text-[12.5px] font-extrabold text-mist-100">
      <span dir="auto" className="min-w-0 truncate">
        {value}
      </span>
    </span>
  );
  return (
    <div className="min-w-0">
      {/* dir="auto" on a truncating box, always: layout.test.ts walks these
          statically and cannot tell one of our own words from a group name — and
          the rule it is enforcing (a label clipped at the wrong end) is right
          either way. */}
      <span dir="auto" className="block truncate text-[11px] font-bold text-mist-500">{label}</span>
      <span className="mt-1 block" title={note}>
        {onClick ? (
          <button type="button" onClick={onClick} aria-label={`${label}: ${value}${note ? ` — ${note}` : ''}`} className="block w-full min-w-0">
            {body}
          </button>
        ) : (
          <span aria-label={`${label}: ${value}${note ? ` — ${note}` : ''}`} role="note" className="block w-full min-w-0">
            {body}
          </span>
        )}
      </span>
    </div>
  );
}
