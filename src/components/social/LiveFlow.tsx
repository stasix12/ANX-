'use client';

import { useEffect, useRef, useState } from 'react';
import { ANX_FACES, POSE_H, POSE_W } from './anxPoses';
import type { SceneMode } from './sceneState';
import { QUEUE_STEP_LABEL, type QueueStep } from '@/lib/social/types';

/**
 * ─── ANX LIVE FLOW ────────────────────────────────────────────────────────
 *
 * "התמונה המצורפת היא מפרט העיצוב הסופי והמחייב. אני דורש להעתיק את העיצוב
 *  שבתמונה בצורה מדויקת ככל האפשר, ולא ליצור עיצוב בהשראתה."
 *
 * Top to bottom, in his order: a banner carrying the character, the count
 * and the live-system pill; four stations joined by a thin line; the card for
 * the publication going out right now; the queue, in a card of its own with
 * a way into the full list; and four figures.
 *
 * REVISED AGAINST A SECOND REFERENCE. The first put every part inside one
 * white card and carried an "ANX Live Flow" lockup; this one stands the parts
 * on the page as separate blocks, puts the character on a deep blue banner,
 * joins the stations with a line instead of arrows, and says in as many
 * words: "אין להוסיף את הכיתוב Live Flow". The lockup is gone.
 *
 * ─── WHAT EVERY NUMBER ON IT IS ───────────────────────────────────────────
 *
 * "המידע חייב להגיע ממערכת הפרסום האמיתית. אין להציג נתוני דוגמה."
 *
 * Nothing here is computed from a clock, a timer or an animation. The station
 * that is lit is the stage the WORKER wrote on the row it is holding; the
 * green ticks behind it are the stages that row has genuinely passed; the
 * queue is the queue; and the four figures are counted in the database by the
 * screen above this one. This component receives facts and draws them — it
 * cannot manufacture one.
 *
 * ─── AND THE PERCENTAGE, WHICH IS THE ONE THAT NEEDED A RULE ──────────────
 *
 * "אחוז התקדמות יוצג רק אם קיימים נתוני התקדמות אמיתיים. אחרת יש להציג
 *  אנימציית פעילות ללא אחוז מומצא."
 *
 * There IS real progress data and it is not a clock: every publication walks
 * a fixed ladder of stages — pending, opening, composer_opened,
 * uploading_media, ready_to_publish, publishing, verifying — and the worker
 * writes the one it has reached onto the row. The bar is that position in
 * that ladder and nothing else. A row whose stage is unknown gets the moving
 * bar with NO number, because then there is nothing to be a number about.
 */

/* ── the character ─────────────────────────────────────────────────────── */

const FRAMES = 9;
const SRC = (i: number) => `/social/anx/pose-${i}.webp`;

type Beat = 'breathe' | 'work' | 'cheer' | 'still' | 'off';

/**
 * Which pose each state sits in. Fewer than the stage this replaces played,
 * deliberately: "אין להוסיף רובוט מונפש גדול מעבר למה שמופיע בתמונה" — the
 * reference has him at his laptop beside the headline, a quarter of the width
 * he used to have, so the celebration and the walk back have nowhere to
 * happen and are not pretended.
 */
const POSES: Record<SceneMode, { frames: readonly number[]; hold: number; beat: Beat }> = {
  waiting: { frames: [0, 1], hold: 5200, beat: 'breathe' },
  preparing: { frames: [1], hold: 0, beat: 'work' },
  /* AT THE LAPTOP, TYPING — the pose the reference draws over the lit
     "מפרסם עכשיו" station. The poses where he holds a card up and away from
     the desk belong to a stage that is four times this size; at a third of
     the card's width they read as a different character. */
  sending: { frames: [1], hold: 0, beat: 'work' },
  done: { frames: [5], hold: 0, beat: 'cheer' },
  paused: { frames: [7], hold: 0, beat: 'still' },
  idle: { frames: [7], hold: 0, beat: 'still' },
  error: { frames: [7], hold: 0, beat: 'breathe' },
  offline: { frames: [7], hold: 0, beat: 'off' },
};

function AnxRobot({ mode }: { mode: SceneMode }) {
  const pose = POSES[mode];
  const [step, setStep] = useState(0);
  useEffect(() => {
    setStep(0);
    if (pose.frames.length < 2 || pose.hold <= 0) return;
    const t = setInterval(() => setStep((s) => (s + 1) % pose.frames.length), pose.hold);
    return () => clearInterval(t);
  }, [pose]);
  const frame = pose.frames[Math.min(step, pose.frames.length - 1)];
  const face = ANX_FACES[frame];

  return (
    <div className={`anxf-robot anx-beat-${pose.beat}`} data-figure aria-hidden>
      <span className="anx-ambient" />
      <span className="anx-contact" />
      <div className="anx-poses">
        {Array.from({ length: FRAMES }, (_, i) => (
          <img
            key={i}
            data-frame={i}
            src={SRC(i)}
            alt=""
            decoding="async"
            loading="eager"
            className={i === frame ? 'anx-on' : undefined}
          />
        ))}
        {face?.eyes.map((e, i) => {
          const w = e.w * 1.34;
          const h = e.h * 1.5;
          return (
            <span
              key={i}
              data-lid
              className="anx-lid"
              style={{
                left: `${((e.x + e.w / 2 - w / 2) / POSE_W) * 100}%`,
                top: `${((e.y + e.h / 2 - h / 2) / POSE_H) * 100}%`,
                width: `${(w / POSE_W) * 100}%`,
                height: `${(h / POSE_H) * 100}%`,
                background: face.visor,
              }}
            />
          );
        })}
      </div>
    </div>
  );
}

/* ── the four stations ─────────────────────────────────────────────────── */

type Station = 'waiting' | 'preparing' | 'publishing' | 'done';

const STATIONS: { k: Station; label: string }[] = [
  { k: 'waiting', label: 'ממתין' },
  { k: 'preparing', label: 'מכין' },
  { k: 'publishing', label: 'מפרסם עכשיו' },
  { k: 'done', label: 'בוצע' },
];

/** Which station a state stands on. The only reading of `mode` on this card. */
const STATION_OF: Record<SceneMode, number> = {
  waiting: 0,
  idle: 0,
  paused: 0,
  error: 0,
  offline: 0,
  preparing: 1,
  sending: 2,
  done: 3,
};

/**
 * THE LADDER A PUBLICATION REALLY WALKS, in the worker's own order, and the
 * only thing the bar is ever filled from. `published` is not on it: a row
 * that reached it is off this card and into the done list.
 */
const PIPELINE: readonly QueueStep[] = [
  'pending',
  'opening',
  'composer_opened',
  'uploading_media',
  'ready_to_publish',
  'publishing',
  'verifying',
];

/** The stage's own position in that ladder, or null when it is not on it. */
export function progressOfStep(step: QueueStep | null | undefined): number | null {
  const i = PIPELINE.indexOf((step ?? '') as QueueStep);
  if (i < 0) return null;
  return Math.round(((i + 1) / (PIPELINE.length + 1)) * 100);
}

/* ── the marks ─────────────────────────────────────────────────────────── */

function FacebookMark({ className }: { className?: string }) {
  return (
    <span aria-hidden className={`anxf-fb ${className ?? ''}`.trim()}>
      <svg viewBox="0 0 24 24" fill="currentColor">
        <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5H16.7V3.6c-.29-.04-1.27-.12-2.4-.12-2.38 0-4 1.45-4 4.11V9.9H7.6V13h2.7v8z" />
      </svg>
    </span>
  );
}

/**
 * The group's picture where the Facebook mark used to be, and the mark itself
 * when the group has no picture stored. `loading="lazy"` for the same reason
 * TargetAvatar carries it: these are unresized crops of a Facebook cover.
 */
function GroupPic({ src, className = '' }: { src?: string | null; className?: string }) {
  if (!src) return <FacebookMark className={className} />;
  // eslint-disable-next-line @next/next/no-img-element
  return <img className={`anxf-pic ${className}`} src={src} alt="" loading="lazy" decoding="async" data-pic="group" />;
}

function PeopleMark() {
  return (
    <svg aria-hidden className="anxf-ppl" viewBox="0 0 24 24" fill="currentColor">
      <circle cx="9" cy="8" r="3.4" />
      <path d="M2.5 19a6.5 6.5 0 0 1 13 0z" />
      <circle cx="17.5" cy="9.5" r="2.7" />
      <path d="M13.5 19a4.8 4.8 0 0 1 9.3 0z" opacity=".8" />
    </svg>
  );
}

const ICON: Record<Station, React.ReactNode> = {
  waiting: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.6" />
      <path d="M12 7.4V12l3 1.8" />
    </svg>
  ),
  preparing: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M14.5 3.5H6.3A1.8 1.8 0 0 0 4.5 5.3v13.4a1.8 1.8 0 0 0 1.8 1.8h8.4" />
      <path d="M8.3 8.2h6M8.3 12h4.2" />
      <path d="m18.1 12.6 2.4 2.4-4.6 4.6-2.8.4.4-2.8z" />
    </svg>
  ),
  publishing: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <path d="M21 3.6 10.9 13.8" />
      <path d="M21 3.6 14.6 21l-3.7-7.2L3.7 10z" />
    </svg>
  ),
  done: (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
      <circle cx="12" cy="12" r="8.6" />
      <path d="m8.4 12.3 2.6 2.6 4.6-5.2" />
    </svg>
  ),
};

/* ── the queue ─────────────────────────────────────────────────────────── */

export type FlowRow = {
  id: string;
  /** The group this publication is for. */
  name: string;
  /**
   * THE GROUP'S OWN PICTURE, when Facebook has given us one.
   *
   * "בצד ימין ליד השם של הקבוצה בריבוע הריק להוסיף גם את התמונה של הקבוצות."
   * It is `social_targets.image_url`, which every screen that lists groups
   * already draws — nothing new is fetched for this. A group with no picture
   * stored keeps the Facebook mark that was there before, because an invented
   * placeholder would say less than the mark does.
   */
  image?: string | null;
  state: 'done' | 'live' | 'next' | 'failed';
  /** For a finished one: when it finished, already formatted as HH:MM. */
  at?: string | null;
  /** For the live one: the stage, in the worker's words. */
  note?: string | null;
};

const TONE: Record<SceneMode, { line: string; tone: 'good' | 'warn' | 'bad' | 'mute' }> = {
  waiting: { line: 'מערכת הפרסום פעילה', tone: 'good' },
  preparing: { line: 'מערכת הפרסום פעילה', tone: 'good' },
  sending: { line: 'מערכת הפרסום פעילה', tone: 'good' },
  done: { line: 'הרובוט סיים לפרסם היום', tone: 'good' },
  idle: { line: 'אין פרסום מתוזמן', tone: 'mute' },
  paused: { line: 'הפרסום מושהה', tone: 'warn' },
  error: { line: 'נדרשת פעולה שלכם', tone: 'warn' },
  offline: { line: 'המחשב לא מחובר', tone: 'bad' },
};

export function LiveFlow({
  mode,
  headline,
  now,
  rows,
}: {
  mode: SceneMode;
  /** "פרסום אחד ממתין לכם" — counted off the real queue by the screen. */
  headline: string;
  /** The publication going out right now, or null when none is. */
  now: { name: string; step: QueueStep | null; cover: string | null; image?: string | null } | null;
  rows: readonly FlowRow[];
}) {
  const at = STATION_OF[mode];
  const state = TONE[mode];
  const percent = now ? progressOfStep(now.step) : null;
  const stepLabel = now ? QUEUE_STEP_LABEL[(now.step ?? '') as QueueStep] || 'שולח פוסט לקבוצה' : '';

  /* The percentage may only ever go up for one row, so a re-read that lands
     mid-publication cannot walk the bar backwards on screen. */
  const seen = useRef<{ id: string; pct: number } | null>(null);
  const rowId = now?.name ?? '';
  let shown = percent;
  if (percent !== null) {
    if (seen.current && seen.current.id === rowId) shown = Math.max(seen.current.pct, percent);
    seen.current = { id: rowId, pct: shown ?? percent };
  } else if (!now) {
    seen.current = null;
  }

  return (
    <section className="anxf" data-flow={mode} aria-label="מצב הפרסום">
      {/* ── 1: the banner — the character, the count, the live pill ────── */}
      {/*
        THE ROBOT'S BACKGROUND IS THIS BANNER, and that is the whole reason
        the poses were cut out of their room: a transparent character takes
        the colour of whatever it is put on. The first reference wanted him on
        a white card and he sat on a white card; this one wants him on deep
        blue and the same nine files do it with no second set of assets.
      */}
      <div className="anxf-banner" data-banner>
        <svg aria-hidden className="anxf-waves" viewBox="0 0 400 120" preserveAspectRatio="none">
          <path d="M0 96 C 70 72, 140 112, 210 88 S 340 60, 400 84 L400 120 L0 120 Z" />
          <path d="M0 108 C 90 90, 150 122, 240 102 S 350 84, 400 100 L400 120 L0 120 Z" opacity=".5" />
        </svg>
        <AnxRobot mode={mode} />
        <div className="anxf-words">
          <h2 data-flow-title dir="auto">{headline}</h2>
          <p className="anxf-state" data-tone={state.tone}>
            <i aria-hidden />
            {state.line}
          </p>
        </div>
        <FacebookMark className="anxf-fb-xl" />
      </div>

      {/* ── 4: the four stations ──────────────────────────────────────── */}
      <ol className="anxf-stations" data-station={STATIONS[at].k}>
        {STATIONS.map(({ k, label }, i) => (
          <li key={k} data-step={k} data-state={i < at ? 'past' : i === at ? 'live' : 'next'}>
            {/* "התחנות מחוברות בקו כחול דק" — a line, not an arrow glyph. */}
            {i > 0 && <span aria-hidden className="anxf-link" />}
            <span className="anxf-box">
              <span className="anxf-ic">{ICON[k]}</span>
              <span className="anxf-lb">
                {label}
                {/* The green tick is a claim that this stage is BEHIND the row
                    in flight, which is why nothing is ticked while the queue
                    is merely waiting: nothing has been passed. */}
                {i < at && (
                  <span data-passed className="anxf-pass" aria-label="הושלם">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3.6" strokeLinecap="round" strokeLinejoin="round">
                      <path d="M5 12.5 9.5 17 19 7.5" />
                    </svg>
                  </span>
                )}
              </span>
            </span>
          </li>
        ))}
      </ol>

      {/* ── 5: the publication going out right now ────────────────────── */}
      {now && (
        <div className="anxf-now" data-now>
          {/* THE REFERENCE'S OWN ORDER: in RTL the first child sits on the
              right, so the post's picture leads and the Facebook mark closes
              the row on the left — which is where the reference has them. */}
          <div className="anxf-now-top">
            {/*
              THE SQUARE BESIDE THE NAME, AND WHAT GOES IN IT.

              "בצד ימין ליד השם של הקבוצה בריבוע הריק להוסיף גם את התמונה של
               הקבוצות" — it was a grey placeholder on every publication whose
              post carries no picture, which is most of them.

              In order, and the order is the point: the POST's own picture if
              it has one, because that is what is going out; otherwise the
              GROUP's picture, because that is where it is going; and only
              with neither does the outline stay. Nothing is invented and
              nothing is fetched that the screen did not already have.
            */}
            <span className="anxf-now-cover" data-pic={now.cover ? 'post' : now.image ? 'group' : 'none'} aria-hidden>
              {now.cover ? (
                <img src={now.cover} alt="" decoding="async" />
              ) : now.image ? (
                <img src={now.image} alt="" loading="lazy" decoding="async" />
              ) : (
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="4.5" width="18" height="15" rx="2.6" />
                  <circle cx="8.3" cy="9.6" r="1.6" />
                  <path d="m3.6 16.6 4.6-4 4.2 3.6 3.2-2.8 4.4 3.8" />
                </svg>
              )}
            </span>
            <div className="anxf-now-words">
              <p className="anxf-now-kicker">פרסום נוכחי</p>
              <p className="anxf-now-name" dir="auto">
                <PeopleMark />
                <span>{now.name}</span>
              </p>
              <p className="anxf-now-step">{stepLabel}…</p>
            </div>
            <FacebookMark className="anxf-fb-lg" />
          </div>
          <div className="anxf-bar" data-bar={shown === null ? 'live' : String(shown)}>
            {/* NO NUMBER WHEN THERE IS NO STAGE TO MAKE ONE FROM — and it
                leads the row, which is where the reference puts it. */}
            {shown !== null && <span className="anxf-pct">{shown}%</span>}
            <div className="anxf-track">
              <span className={`anxf-fill${shown === null ? ' anxf-fill-live' : ''}`} style={shown === null ? undefined : { width: `${shown}%` }} />
            </div>
          </div>
        </div>
      )}

      {/* ── 6: the queue ──────────────────────────────────────────────── */}
      {rows.length > 0 && (
        <div className="anxf-qcard">
          <div className="anxf-qtop">
            <h3 className="anxf-qhead">
              <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                <path d="m12 3 9 4.6-9 4.6-9-4.6z" />
                <path d="m3 12.4 9 4.6 9-4.6" />
                <path d="m3 16.9 9 4.6 9-4.6" />
              </svg>
              תור פרסומים ({rows.length})
            </h3>
            {/* A WAY INTO THE WHOLE LIST, and it goes to the screen that
                already is that list — no new route, no new mechanism. */}
            <a className="anxf-all" href="/social/history">
              הצג הכול
              <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                <path d="m14 6-6 6 6 6" />
              </svg>
            </a>
          </div>
          <ul className="anxf-queue">
            {rows.map((r, i) => {
              /* "בתור הבא" is a claim that nothing is in front of it, so only
                 the first waiting row may wear it; the ones behind it are in
                 the queue, which is a different and smaller statement. */
              const firstNext = rows.findIndex((o) => o.state === 'next');
              return (
              <li key={r.id} data-row={r.state}>
                <a className="anxf-row" href="/social/history">
                {/* The group's picture where the mark was — same box, same
                    place, and the mark stays for a group with no picture. */}
                <GroupPic src={r.image} />
                <PeopleMark />
                <span className="anxf-row-words">
                  <span className="anxf-row-name" dir="auto">{r.name}</span>
                  {r.state === 'live' && r.note && <span className="anxf-row-note">{r.note}…</span>}
                  {/* THE REASON, WHEN THERE IS ONE. A failed row that only
                      said "נכשל" sent the owner hunting through the history
                      for what went wrong; the row carries the worker's own
                      words for it, so it says them. */}
                  {r.state === 'failed' && (
                    <span className="anxf-row-why">
                      <b>נכשל</b>
                      {r.note ? ` · ${r.note}` : ''}
                    </span>
                  )}
                </span>
                {r.state === 'done' && r.at && <span className="anxf-row-at">{r.at} · בוצע</span>}
                {r.state === 'next' && <span className="anxf-row-at">{i === firstNext ? 'בתור הבא' : 'בתור'}</span>}
                <span className="anxf-row-mark" aria-hidden>
                  {r.state === 'done' ? (
                    <svg className="anxf-mark-done" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="11" />
                      <path d="m6.6 12.4 3.6 3.6 7.2-8" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  ) : r.state === 'failed' ? (
                    <svg className="anxf-mark-failed" viewBox="0 0 24 24" fill="currentColor">
                      <circle cx="12" cy="12" r="11" />
                      <path d="M8.6 8.6 15.4 15.4M15.4 8.6 8.6 15.4" fill="none" stroke="#fff" strokeWidth="2.4" strokeLinecap="round" />
                    </svg>
                  ) : r.state === 'live' ? (
                    <svg className="anxf-mark-live anx-spin" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.6" strokeLinecap="round">
                      <circle cx="12" cy="12" r="9" opacity=".25" />
                      <path d="M21 12a9 9 0 0 0-9-9" />
                    </svg>
                  ) : (
                    <svg className="anxf-mark-next" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
                      <circle cx="12" cy="12" r="8.6" />
                      <path d="M12 7.4V12l3 1.8" />
                    </svg>
                  )}
                </span>
                <svg aria-hidden className="anxf-row-go" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.4" strokeLinecap="round" strokeLinejoin="round">
                  <path d="m14 6-6 6 6 6" />
                </svg>
                </a>
                </li>
              );
            })}
          </ul>
        </div>
      )}

      {/*
        ── 7: THE FOUR FIGURES, AND WHY THEY ARE NOT HERE ────────────────
        "כאן למחוק את הריבועים מתחת עם המספרים."

        They were a second copy. This screen already carries a row of four
        stat tiles a little further down — "פורסמו היום" with the daily
        ceiling and the week under it, "נכשלו היום" with "טפל עכשיו" and the
        skipped count, the comments and the queue — and every one of those
        opens the history filtered to itself. The four here opened nothing
        and said less, directly above them.

        Nothing was lost with them: the three numbers they printed are the
        same three the row below prints, from the same reads.
      */}
    </section>
  );
}
