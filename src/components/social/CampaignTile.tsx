'use client';

import Link from 'next/link';
import { campaignIdentity } from '@/components/social/CampaignCard';
import { PACE_PROFILES, paceProfile } from '@/lib/social/rules';
import type { PaceId } from '@/lib/social/types';
import type { CampaignSchedule } from '@/lib/social/campaign-schedule';
import type { CampaignState } from '@/lib/social/campaign';
import type { Campaign } from '@/lib/social/types';

/**
 * ─── THE COMPACT CAMPAIGN TILE ────────────────────────────────────────────
 *
 * "להחליף את הכרטיסיות הגדולות הקיימות בתצוגת Grid קומפקטית · שתי כרטיסיות
 *  בכל שורה · ארבעה קמפיינים מוצגים במקביל."
 *
 * WHY THIS IS A NEW COMPONENT AND NOT A REWRITE OF CampaignCard.
 *
 * His own §7 asks for both: "תצוגה קומפקטית: לניהול מהיר של מספר קמפיינים"
 * and "תצוגה מורחבת: לעריכה מלאה", and the reference image carries a
 * list/grid toggle in its corner. So the grid draws THIS, the list draws the
 * card that already exists, and §9's "אין למחוק פונקציות קיימות" is kept by
 * construction rather than by promise: CampaignCard is untouched, and the
 * twenty-one test files that pin it — including the one that measures it in
 * a browser at four widths — go on measuring exactly what they measured.
 *
 * AND IT RESOLVES A CONTRADICTION IN THE BRIEF. The reference puts
 * "חזרה לפעילות" at the BOTTOM of the card; campaign-card.test.ts requires
 * the turn-on button to sit ABOVE the scheduling panel, and its failure
 * message records why — "it was reported as unfindable there", by him. Both
 * are right about their own card: on a tall card with a scheduling panel the
 * button must come first or it is lost below the fold, and on a tile with no
 * panel the bottom is where the eye already is. The contradiction was between
 * two different cards, and this is the second one.
 *
 * EVERY NUMBER IS THE ACCOUNT'S. "אין להשתמש בנתוני דמה במערכת הפעילה" —
 * the reference's 1,420 and 250/250 and #24 are its own; what this draws is
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

const DAY_LETTER = ['א׳', 'ב׳', 'ג׳', 'ד׳', 'ה׳', 'ו׳', 'ש׳'];

/**
 * "א׳-ש׳" / "כל יום" / "א׳, ג׳, ה׳" — the reference's own three shapes.
 *
 * Read off the schedule the page handed in, never off a clock: this line is
 * a setting, not a forecast, and the card above it is the one that forecasts.
 */
function daysText(schedule: CampaignSchedule): string {
  if (!schedule.enabled) return 'כל יום';
  const days = [...(schedule.days ?? [])].sort((a, b) => a - b);
  if (days.length === 0) return 'לא נבחרו ימים';
  if (days.length === 7) return 'כל יום';
  /* A run of consecutive days reads as a range, which is what the reference
     draws for א׳-ש׳ and א׳-ו׳; anything else is listed. */
  const consecutive = days.every((d, i) => i === 0 || d === days[i - 1] + 1);
  if (consecutive && days.length > 2) return `${DAY_LETTER[days[0]]}-${DAY_LETTER[days[days.length - 1]]}`;
  return days.map((d) => DAY_LETTER[d]).join(', ');
}

/**
 * "משעה 08:00" — AND DELIBERATELY NOT THE REFERENCE'S RANGE.
 *
 * The reference draws "20:00 – 08:00", "10:00 – 18:00", "07:30 – 20:30". This
 * product has no closing hour to draw: he had it removed — "יש להסיר לחלוטין
 * את אפשרות שעת הסיום מממשק הכרטיס... להשאיר רק: שעת התחלת הפרסום, הפרש בין
 * פרסום לפרסום, ימי הפרסום שנבחרו" — and readSchedule() stopped reading the
 * schedule_end column (campaign-schedule.ts:48). A chosen day is open from
 * this hour until midnight.
 *
 * So printing a range would mean either re-introducing a setting he ordered
 * removed, or printing a second hour nothing in the engine reads. This is the
 * one place the tile does not match the reference, and it is listed as such.
 */
function hoursText(schedule: CampaignSchedule): string {
  if (!schedule.enabled) return 'בכל שעה';
  return `משעה ${schedule.start || '08:00'}`;
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
     tile could look broken. The same rule the cycle card follows. */
  const pct = total > 0 ? Math.max(0, Math.min(100, Math.round((published / total) * 100))) : 0;
  const running = status.tone === 'live';
  const profile = paceProfile(pace ?? null);
  /*
   * THE CARD'S OWN COLOUR, and the SAME one the full card uses — the
   * reference gives every card a border of its own hue (green, blue, orange,
   * purple) and campaignIdentity() is where this product already decides
   * that, by the campaign's number. Borrowing it rather than inventing a
   * second palette is what keeps the grid and the list recognisably the same
   * four campaigns.
   */
  const identity = campaignIdentity(ordinal);

  return (
    <div className="anxt-tile" data-tone={status.tone} style={{ borderColor: identity.line }}>
      {/* ── the head: picture, name, number, status, and the ⋯ ── */}
      <div className="anxt-head">
        <span className="anxt-words">
          <span className="anxt-name" dir="auto">{campaign.name}</span>
          <span className="anxt-no">
            <svg aria-hidden viewBox="0 0 24 24" fill="currentColor" style={{ color: identity.ink }}>
              <path d="M6 3h12l4 6-10 12L2 9z" />
            </svg>
            קמפיין #{ordinal}
          </span>
          <span className="anxt-pill" data-tone={status.tone}>
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              {running ? <path d="M9 7.5v9l7-4.5z" fill="currentColor" stroke="none" /> : <path d="M9.5 7.5v9M14.5 7.5v9" />}
              <circle cx="12" cy="12" r="9.2" />
            </svg>
            {status.label}
          </span>
        </span>
        {/*
          ── THE ⋯ ABOVE THE COVER, IN ONE COLUMN ────────────────────────
          Which is how the reference draws it, and it is also the only way
          the head fits: on a 360px phone two tiles to a row leaves about
          150px inside each one, and a ⋯ and a cover side by side in the
          same flex row took 110 of it — "קמפיין #24" needed 46px and had
          33, measured, at every one of the four tiles. Stacking them gives
          the name and the number the width they need.
        */}
        <span className="anxt-side">
          {onMenu && (
            <button type="button" className="anxt-more" onClick={onMenu} aria-haspopup="menu" aria-label={`עוד פעולות לקמפיין "${campaign.name}"`}>
              <svg aria-hidden viewBox="0 0 24 24" fill="currentColor">
                <circle cx="5" cy="12" r="1.9" />
                <circle cx="12" cy="12" r="1.9" />
                <circle cx="19" cy="12" r="1.9" />
              </svg>
            </button>
          )}
          <span className="anxt-pic" aria-hidden>
          {media?.kind === 'video' ? (
            <video src={media.url} muted playsInline preload="metadata" />
          ) : media ? (
            <img src={media.url} alt="" loading="lazy" />
          ) : (
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6">
                <rect x="3" y="4" width="18" height="16" rx="3" />
                <path d="m6 16 3.5-4 3 3L16 11l2 2.5" />
              </svg>
            )}
          </span>
        </span>
      </div>

      {/* ── the meter ── */}
      {/* THE REFERENCE'S OWN ORDER, which the first version mirrored: the
          fraction sits at the start of the line (the right, in Hebrew) and
          the percentage chip at the end. Caught by looking at the render
          beside the image rather than by any assertion. */}
      <div className="anxt-meter">
        <span className="anxt-of" dir="ltr">{published} / {total}</span>
        <span className="anxt-track">
          <span className="anxt-bar" data-tone={status.tone} style={{ width: `${pct}%` }} />
        </span>
        <span className="anxt-pctchip" data-tone={status.tone}>{pct}%</span>
        {/* dir="ltr" OR IT READS BACKWARDS. "170 / 250" in a right-to-left
            paragraph renders as "250 / 170" — the published count and the
            ceiling swap places, and the tile reports a round that has
            published more than it planned. Caught in the screenshot. */}
      </div>

      {/* ── the three figures, and every one of them is a stored count ── */}
      <div className="anxt-figs">
        <span className="anxt-fig">
          <b>{published}</b>
          <span>פורסמו</span>
        </span>
        <span className="anxt-fig">
          <b>{scheduled}</b>
          <span>בתור</span>
        </span>
        <span className="anxt-fig">
          <b>{groups}</b>
          <span>קבוצות</span>
        </span>
      </div>

      {/*
        ── WHEN IT PUBLISHES, AND THE WAY TO CHANGE IT ───────────────────
        "בכל כרטיס קמפיין יש להוסיף כפתור חדש בשם 'ימים ושעות'."

        The line that PRINTED the schedule becomes the button that opens it,
        rather than a second control beside it: the owner's finger is already
        going to the days and the hour when he wants to change the days and
        the hour, and a tile this size has no room for a label that only
        reads. Without a handler it stays exactly the line it was.
      */}
      {onHours ? (
        <button type="button" className="anxt-when anxt-whenbtn" onClick={onHours} disabled={busy} aria-label={`ימים ושעות לקמפיין "${campaign.name}"`}>
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          <span>{daysText(schedule)}</span>
          <span className="anxt-sep" aria-hidden>|</span>
          <span dir="ltr">{hoursText(schedule)}</span>
        </button>
      ) : (
        <p className="anxt-when">
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
            <rect x="3" y="5" width="18" height="16" rx="3" />
            <path d="M3 10h18M8 3v4M16 3v4" />
          </svg>
          <span>{daysText(schedule)}</span>
          <span className="anxt-sep" aria-hidden>|</span>
          <span dir="ltr">{hoursText(schedule)}</span>
        </p>
      )}

      {/* ── the foot: on/off, the speed, and the two buttons ── */}
      <div className="anxt-foot">
        <button
          type="button"
          role="switch"
          aria-checked={running}
          aria-label={`פרסום בקמפיין "${campaign.name}"`}
          disabled={busy || (running ? !onPause : !onResume)}
          onClick={() => (running ? onPause?.() : onResume?.())}
          className="anxt-switch"
          data-on={running ? 'yes' : 'no'}
        >
          <span aria-hidden className="anxt-swtrack">
            <span aria-hidden className="anxt-swknob" />
          </span>
        </button>

        {/* THE SPEED IS THE ACCOUNT'S, not this campaign's — one engine, one
            pace, exactly as rules.ts defines it. The reference draws a fourth
            mode ("בטוח"); the product has three, and inventing a fourth here
            would be a control that promises a setting nothing reads. */}
        {/* A <label> wrapping it is an accessible name to a browser and not to
            layout.test.ts's static walk, which reads the control's own
            attributes — so the name is on the control, where both can see it. */}
        <label className="anxt-pace">
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 21a9 9 0 1 1 9-9" />
            <path d="m12 12 4.5-3" />
          </svg>
          <select
            aria-label="מהירות פרסום"
            value={profile?.id ?? ''}
            disabled={busy || !onPaceChange}
            onChange={(e) => onPaceChange?.(e.target.value as PaceId)}
          >
            {!profile && <option value="">מהירות</option>}
            {PACE_PROFILES.map((p) => (
              <option key={p.id} value={p.id}>{p.label}</option>
            ))}
          </select>
        </label>

        <Link className="anxt-icon" href={editHref} aria-label={`עריכת הקמפיין "${campaign.name}"`}>
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M4 20h4l10-10-4-4L4 16z" />
            <path d="m13.5 6.5 4 4" />
          </svg>
        </Link>
        <Link className="anxt-icon" href={statsHref} aria-label={`סטטיסטיקה לקמפיין "${campaign.name}"`}>
          <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
            <path d="M5 19V11M12 19V5M19 19v-6" />
          </svg>
        </Link>
      </div>

      {/*
        ── AND THE WAY BACK, at the bottom, exactly as the reference draws it.
           Only for a campaign that is actually held: a running campaign has
           nothing to come back from, and drawing the button anyway is how a
           screen comes to offer an action that does nothing.
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
