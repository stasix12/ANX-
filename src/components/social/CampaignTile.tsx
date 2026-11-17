'use client';

import Link from 'next/link';
import { t, keep } from '@/lib/social/i18n';
import { campaignIdentity } from '@/components/social/CampaignCard';
import { PACE_PROFILES, paceProfile } from '@/lib/social/rules';
import type { PaceId } from '@/lib/social/types';
import type { CampaignSchedule } from '@/lib/social/campaign-schedule';
import type { CampaignState } from '@/lib/social/campaign';
import type { Campaign } from '@/lib/social/types';

/**
 * ─── THE COMPACT CAMPAIGN CARD ────────────────────────────────────────────
 *
 * "לצמצם את גובה הכרטיס ולשחזר את הפריסה האופקית שבתמונה: תמונת הקמפיין בצד
 *  שמאל. שם הקמפיין, מספרו והסטטוס בצד ימין … שורת פעולות תחתונה אחת."
 *
 * THE SHAPE IS THE REFERENCE'S, and it is a LANDSCAPE card, one to a row —
 * not the two-up portrait tile this file drew before. What changed and why
 * each one is the image rather than an opinion:
 *
 *   THE PICTURE MOVED TO THE LEFT AND GREW. It was a 54px thumbnail stacked
 *   under the ⋯ in the head's side column; the reference gives it its own
 *   column down the whole card, about a third of the width, and that is the
 *   only element in the card that carries the campaign's own face.
 *
 *   THE THREE FIGURES KEEP THEIR ORDER — פורסמו · בתור · קבוצות, right to
 *   left — and gain the icons the reference draws over them: a speech bubble
 *   with a clock, a paper plane, two people, inside one bordered box with a
 *   hairline between each pair. Measured off the image rather than read off
 *   it: the people glyph sits at x433-732 and the bubble at x1030-1328 of a
 *   card that starts at x30, so the bubble is the right-hand column. Same
 *   three numbers, same source — `state.progress` and the page's target
 *   count.
 *
 *   ONE ACTION ROW instead of three. The reference draws, right to left:
 *   edit · days-and-hour · speed · on/off · statistics. Every one of them is
 *   a control this tile already had; what changed is that they sit on one
 *   line, which is where the height went.
 *
 *   THE HOUR LOST ITS WORD. "משעה 08:00" became a clock and "08:00", which
 *   is how the reference draws it and the only way five controls fit a phone
 *   row. The days keep their letters, comma-joined without spaces — "א,ב,ג"
 *   — for the same reason and in the reference's own spelling.
 *
 * NO HANDLER, href OR CONDITION BELOW IS NEW. onPause, onResume, onPaceChange,
 * onMenu, onHours, editHref and statsHref are the props this tile already had
 * and the page already wired; the ⋯, the switch, the speed select, the days
 * button, the pencil and the chart all call exactly what they called before.
 * "100% שימור פונקציונליות."
 *
 * EVERY NUMBER IS THE ACCOUNT'S. "אין להשתמש בנתוני דמה במערכת הפעילה" — the
 * reference's 45 and 0/45 and #24 are its own; what this draws is
 * `state.progress` and the campaign's real ordinal. Nothing here computes a
 * publishing instant, counts a queue, or decides a schedule: it is handed
 * what the page already read and prints it.
 */

export interface CampaignTileProps {
  campaign: Campaign;
  /** Its number in the account — "קמפיין #24". Stable across filters. */
  ordinal: number;
  state: CampaignState;
  /** The cover already read for this campaign's post, or null. */
  media: { url: string; kind: 'image' | 'video' } | null;
  /** How many groups this campaign publishes to. */
  groups: number;
  schedule: CampaignSchedule;
  /** The account's publishing speed. One account, one pace — see rules.ts. */
  pace?: PaceId | null;
  onPaceChange?: (id: PaceId) => void;
  /** Running → pause, paused/stopped/completed → back to publishing. */
  onPause?: () => void;
  onResume?: () => void;
  /** Where the pencil goes: the campaign's full settings. */
  editHref: string;
  /** Where the chart goes: the campaign's own screen, with its queue. */
  statsHref: string;
  /** The ⋯ — the page owns the menu, the tile owns the button. */
  onMenu?: () => void;
  /** "ימים ושעות" — opens the sheet the page owns. */
  onHours?: () => void;
  /** Non-empty while a write for THIS campaign is in flight. */
  busy?: boolean;
  /** The whole account is paused — a tile may not claim to be running. */
  globalPaused?: boolean;
}

/** פעיל / מושהה / הסתיים — the three the reference draws, from the real state. */
function statusOf(state: CampaignState, globalPaused: boolean): { label: string; tone: 'live' | 'held' | 'done' } {
  if (state.state === 'completed') return { label: 'הסתיים', tone: 'done' };
  if (state.state === 'stopped') return { label: 'נעצר', tone: 'held' };
  if (globalPaused || state.state === 'paused') return { label: 'מושהה', tone: 'held' };
  if (state.state === 'needs_attention') return { label: 'דורש טיפול', tone: 'held' };
  if (state.state === 'not_started') return { label: 'טרם התחיל', tone: 'held' };
  return { label: 'פעיל', tone: 'live' };
}

/*
 * JOINED WITHOUT A SPACE — "א׳,ב׳,ג׳" rather than "א׳, ב׳, ג׳" — which is the
 * reference's own spelling and also the only one that fits: the day chip
 * shares one row with four other controls now.
 *
 * THE GERESH STAYS, and that is not a style choice. Each letter is a
 * dictionary key of its own ('א׳' → 'Вс'), so a Russian screen gets
 * "Вс,Пн,Вт" by translating the letters as they are joined. Dropping the mark
 * made the keys miss and the chip came out "א-ו" in a Russian card — caught by
 * russian-rendered, which reads what is painted rather than what is written.
 */
const DAY_LETTER = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/**
 * "א׳-ש׳" / "כל יום" / "א׳,ג׳,ה׳" — the reference’s own three shapes.
 *
 * Read off the schedule the page handed in, never off a clock: this line is
 * a setting, not a forecast, and the card beside it is the one that forecasts.
 */
function daysText(schedule: CampaignSchedule): string {
  if (!schedule.enabled) return 'כל יום';
  const days = [...(schedule.days ?? [])].sort((a, b) => a - b);
  if (days.length === 0) return 'לא נבחרו ימים';
  if (days.length === 7) return 'כל יום';
  /* A run of consecutive days reads as a range, which is what the reference
     draws for א׳-ש׳ and א׳-ו׳; anything else is listed. */
  const consecutive = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  /* t() PER LETTER, so any set of days reads in the chosen language. A whole
     combination could never be a dictionary key — there are 127 of them — and
     the letters are keys already. */
  if (consecutive && days.length > 2) return `${t(DAY_LETTER[days[0]])}-${t(DAY_LETTER[days[days.length - 1]])}`;
  return days.map((d) => t(DAY_LETTER[d])).join(',');
}

/**
 * THE HOUR, AND DELIBERATELY NOT A RANGE.
 *
 * The reference draws a clock and "11:00". This product has no closing hour
 * to draw: he had it removed — "יש להסיר לחלוטין את אפשרות שעת הסיום מממשק
 * הכרטיס" — and readSchedule() stopped reading the schedule_end column
 * (campaign-schedule.ts:48). A chosen day is open from this hour to midnight.
 */
function hoursText(schedule: CampaignSchedule): string {
  if (!schedule.enabled) return 'בכל שעה';
  return schedule.start || '08:00';
}

export function CampaignTile({
  campaign,
  ordinal,
  state,
  media,
  groups,
  schedule,
  pace,
  onPaceChange,
  onPause,
  onResume,
  editHref,
  statsHref,
  onMenu,
  onHours,
  busy,
  globalPaused,
}: CampaignTileProps) {
  const status = statusOf(state, Boolean(globalPaused));
  const { published, total, scheduled } = {
    published: state.progress.published,
    total: state.progress.total,
    scheduled: state.progress.scheduled,
  };
  /* CLAMPED, because a truncated read can put published above the total it
     was counted against and a bar wider than its track is the one way this
     card could look broken. The same rule the cycle card follows. */
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((published / total) * 100))) : 0;
  const running = status.tone === 'live';
  const profile = paceProfile(pace ?? null);
  /*
   * THE CARD'S OWN COLOUR, and the SAME one the full card uses — the
   * reference draws a ring of its own hue around the card and
   * campaignIdentity() is where this product already decides that, by the
   * campaign's number. Borrowing it rather than inventing a second palette is
   * what keeps the compact view and the list recognisably the same campaigns.
   */
  const identity = campaignIdentity(ordinal);

  return (
    <div className="anxt-tile" data-tone={status.tone} style={{ borderColor: identity.line }}>
      {/* ── the body and the picture beside it ───────────────────────────
          IN THIS ORDER BECAUSE THE PAGE IS RTL: the first child is the one
          on the RIGHT, which is where the reference puts the words, and the
          picture that follows lands on the left. */}
      <div className="anxt-top">
        <div className="anxt-body">
          {/* ── the name, the number, the status — and the ⋯ beside them ── */}
          <div className="anxt-head">
            {/* THE ⋯ IS IN THE CARD'S TOP CORNER — measured off the reference:
                its dots sit at x1259-1301 of a card whose inner edge is 1352,
                hard against the start corner, with the name ending to its
                left. FIRST in the row, because in a right-to-left card the
                first child is the right-hand one. */}
            {onMenu && (
              <button type="button" className="anxt-more" onClick={onMenu} aria-haspopup="menu" aria-label={`עוד פעולות לקמפיין "${keep(campaign.name)}"`}>
                <svg aria-hidden viewBox="0 0 24 24" fill="currentColor">
                  <circle cx="5" cy="12" r="1.9" />
                  <circle cx="12" cy="12" r="1.9" />
                  <circle cx="19" cy="12" r="1.9" />
                </svg>
              </button>
            )}
            <span className="anxt-words">
              <span className="anxt-name" dir="auto" data-no-translate>{campaign.name}</span>
              <span className="anxt-no">
                <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" style={{ color: identity.ink }}>
                  <path d="M6 3h12l4 6-10 12L2 9z" />
                </svg>
                קמפיין #{ordinal}
              </span>
            </span>
          </div>

          {/* THE STATUS IS ITS OWN LINE, not a third line inside the words:
              the reference right-aligns it to the body's edge — past where the
              name and the number stop, which is where the ⋯ reserves its
              corner — and that is only possible outside that row. */}
          <span className="anxt-pill" data-tone={status.tone}>
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {running ? <path d="M9 7.5v9l7-4.5z" fill="currentColor" stroke="none" /> : <path d="M9.5 7.5v9M14.5 7.5v9" />}
              <circle cx="12" cy="12" r="9.2" />
            </svg>
            {status.label}
          </span>

          {/* ── the meter ──
              THE REFERENCE'S OWN ORDER: the fraction at the start of the line
              (the right, in Hebrew), the track across the middle, the
              percentage chip at the end.

              dir="ltr" OR IT READS BACKWARDS. "170 / 250" in a right-to-left
              paragraph renders as "250 / 170" — the published count and the
              ceiling swap places, and the card reports a round that has
              published more than it planned. Caught in a screenshot. */}
          <div className="anxt-meter">
            <span className="anxt-of" dir="ltr">{published} / {total}</span>
            <span className="anxt-track">
              <span className="anxt-bar" data-tone={status.tone} style={{ width: `${pct}%` }} />
            </span>
            <span className="anxt-pctchip" data-tone={status.tone}>{pct}%</span>
          </div>

          {/* ── the three figures, and every one of them is a stored count ──
              פורסמו · בתור · קבוצות, right to left, which is the reference's
              order and the order this file already drew: measured off the
              image, the people glyph is its left-hand column (x433–732) and
              the speech bubble its right-hand one (x1030–1328). The icons
              above them are what this pass added; the sequence was not
              touched. (The brief's own sentence lists them the other way —
              "שורת נתונים: קבוצות, בתור, פורסמו" — and the image wins:
              "התמונה היא מקור האמת הוויזואלי".) */}
          <div className="anxt-figs">
            <span className="anxt-fig">
              {/* A SPEECH BUBBLE WITH A CLOCK IN IT, which is the glyph the
                  reference draws over "פורסמו": a post that has gone out, and
                  the hour it went. */}
              <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M13 3.6a7.9 7.9 0 1 1-6.3 12.7l-3 .9 1.1-2.9A7.9 7.9 0 0 1 13 3.6z" />
                <path d="M13 7.9v3.6l2.4 1.4" />
              </svg>
              <b>{published}</b>
              <span>{t('פורסמו')}</span>
            </span>
            <span className="anxt-fig">
              <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <path d="M21 4 3 11l7 2.6L12.6 21z" />
                <path d="m10 13.6 4.4-4.4" />
              </svg>
              <b>{scheduled}</b>
              <span>{t('בתור')}</span>
            </span>
            <span className="anxt-fig">
              <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="9" cy="8" r="3.2" />
                <path d="M3.5 19c0-3 2.5-4.6 5.5-4.6s5.5 1.6 5.5 4.6" />
                <path d="M16 5.4a3 3 0 0 1 0 5.2M17.6 14.8c2 .6 3.4 2 3.4 4.2" />
              </svg>
              <b>{groups}</b>
              <span>{t('קבוצות')}</span>
            </span>
          </div>
        </div>

        {/* THE COVER, down the left of the card. Decorative: the campaign is
            already named in words beside it, so a screen reader gains nothing
            from a second mention and the picture carries no alt text. */}
        <span className="anxt-pic" aria-hidden>
          {media?.kind === 'video' ? (
            <video src={media.url} muted playsInline preload="metadata" />
          ) : media ? (
            // eslint-disable-next-line @next/next/no-img-element
            <img src={media.url} alt="" loading="lazy" />
          ) : (
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
              <rect x="3" y="4" width="18" height="16" rx="3" />
              <path d="m6 16 3.5-4 3 3L16 11l2 2.5" />
            </svg>
          )}
        </span>
      </div>

      {/* ── ONE ACTION ROW: edit · days and hour · speed · on/off · stats ──
          Right to left, in the reference's order. Every control here is the
          one this tile already carried. */}
      <div className="anxt-foot">
        <Link className="anxt-icon" href={editHref} aria-label={`עריכת הקמפיין "${keep(campaign.name)}"`}>
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20h4l10-10-4-4L4 16z" />
            <path d="m13.5 6.5 4 4" />
          </svg>
        </Link>

        {/*
          ── WHEN IT PUBLISHES, AND THE WAY TO CHANGE IT ───────────────────
          "בכל כרטיס קמפיין יש להוסיף כפתור חדש בשם 'ימים ושעות'."

          The line that PRINTS the schedule IS the button that opens it,
          rather than a second control beside it: the owner's finger is
          already going to the days and the hour when he wants to change the
          days and the hour. Without a handler it stays the line it was.
        */}
        {onHours ? (
          <button type="button" className="anxt-when anxt-whenbtn" onClick={onHours} disabled={busy} aria-label={`ימים ושעות לקמפיין "${keep(campaign.name)}"`}>
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <rect x="3" y="5" width="18" height="16" rx="3" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            {/* `title` BECAUSE THIS ONE CAN STILL CLIP. Up to 520 the chip
                has a line to itself and nothing is cut; above it the row is
                the reference's single line, and a custom week of six separate
                days can still end in an ellipsis there. The hour never
                shrinks, so what a cut costs is the days, and the title hands
                them back on hover and on a long press. */}
            <span className="anxt-days" title={daysText(schedule)}>{daysText(schedule)}</span>
            <span className="anxt-sep" aria-hidden />
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="8.6" />
              <path d="M12 7.6V12l3 1.8" />
            </svg>
            <span className="anxt-hour" dir="ltr">{hoursText(schedule)}</span>
          </button>
        ) : (
          <p className="anxt-when">
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <rect x="3" y="5" width="18" height="16" rx="3" />
              <path d="M3 10h18M8 3v4M16 3v4" />
            </svg>
            <span className="anxt-days" title={daysText(schedule)}>{daysText(schedule)}</span>
            <span className="anxt-sep" aria-hidden />
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="12" cy="12" r="8.6" />
              <path d="M12 7.6V12l3 1.8" />
            </svg>
            <span className="anxt-hour" dir="ltr">{hoursText(schedule)}</span>
          </p>
        )}

        {/* THE SPEED IS THE ACCOUNT'S, not this campaign's — one engine, one
            pace, exactly as rules.ts defines it. The reference draws a fourth
            mode; the product has three, and inventing a fourth here would be
            a control that promises a setting nothing reads. */}
        {/* A <label> wrapping it is an accessible name to a browser and not to
            layout.test.ts's static walk, which reads the control's own
            attributes — so the name is on the control, where both can see it. */}
        <label className="anxt-pace">
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21a9 9 0 1 1 9-9" />
            <path d="m12 12 4.5-3" />
          </svg>
          <select
            aria-label={t('מהירות פרסום')}
            value={profile?.id ?? ''}
            disabled={busy || !onPaceChange}
            onChange={(e) => onPaceChange?.(e.target.value as PaceId)}
          >
            {!profile && <option value="">{t('מהירות')}</option>}
            {PACE_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
          {/* THE CHEVRON THE REFERENCE DRAWS, and the reason it can be here
              now: the control has a whole row to itself rather than a third
              of a 155px tile, which is why the two-up version left it out. */}
          <svg aria-hidden className="anxt-chev" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="m6 9.5 6 6 6-6" />
          </svg>
        </label>

        <button
          type="button"
          role="switch"
          aria-checked={running}
          aria-label={`פרסום בקמפיין "${keep(campaign.name)}"`}
          disabled={busy || (running ? !onPause : !onResume)}
          onClick={() => (running ? onPause?.() : onResume?.())}
          className="anxt-switch"
          data-on={running ? 'yes' : 'no'}
        >
          <span aria-hidden className="anxt-swtrack">
            <span aria-hidden className="anxt-swknob" />
          </span>
        </button>

        <Link className="anxt-icon" href={statsHref} aria-label={`סטטיסטיקה לקמפיין "${keep(campaign.name)}"`}>
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 19V11M12 19V5M19 19v-6" />
          </svg>
        </Link>
      </div>

      {/*
        ── AND THE WAY BACK, for a campaign that is actually held.
           The reference's card is running and so draws no such button; this
           one appears only where there is something to come back from, which
           is the answer to "למה במסך קמפיינים אין כפתור להדלקת קמפיינים" and
           leaves a running card exactly as the reference draws it.
      */}
      {!running && onResume && (
        <button type="button" className="anxt-back" onClick={() => onResume()} disabled={busy}>
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinejoin="round">
            <circle cx="12" cy="12" r="9.2" />
            <path d="M10 8.3v7.4l6-3.7z" fill="currentColor" stroke="none" />
          </svg>
          חזרה לפעילות
        </button>
      )}
    </div>
  );
}
