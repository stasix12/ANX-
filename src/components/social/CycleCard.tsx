'use client';

import { useEffect, useState } from 'react';
import { CYCLE_REST_HOURS, CYCLE_ROUNDS_PER_WINDOW, cycleCountdown, cycleRestLeftMs, cycleResting, type PublishCycle } from '@/lib/social/publish-cycle';

/*
 * ─── WHY THIS CARD HAS ITS OWN FILE ───────────────────────────────────────
 *
 * It was written inside LiveFlow.tsx and the gate threw it out, correctly.
 * That file carries a hard guard — scene-states.test.ts: ONE setInterval, and
 * nothing on it may read a clock — because every number on the flow is a fact
 * the worker wrote and a card that read a clock would be advancing a
 * publication by itself. This card's countdown has to read a clock: digits
 * that move once a second have no other way to move.
 *
 * So it lives here, where its own guard applies instead (cycle.test.ts):
 * the clock may move DIGITS and nothing else. The decision to hold is the
 * database's `resting`, taken in the same lock that wrote the instant; the
 * count, the ceiling and the instant are all handed in. Splitting the file
 * keeps both guards strict rather than widening either one.
 */

/**
 * ─── "הפסקה אוטומטית אחרי 100 פרסומים" ───────────────────────────────────
 *
 * EVERY NUMBER ON THIS CARD IS THE DATABASE'S. The count, the ceiling, the
 * instant publishing resumes — all of them arrive in one `cycle` object read
 * from social_publish_cycle, and none of them is computed here. The brief is
 * explicit about why: "הספירה חייבת להתבסס על נתונים אמיתיים ממסד הנתונים,
 * ולא על מספרים מדומים", and a card that did its own arithmetic would be a
 * second opinion about the thing that decides whether his account is limited.
 *
 * THE COUNTDOWN IS THE ONE THING THAT MOVES, and it is a DISPLAY of a stored
 * instant rather than a timer anybody is running: every second it re-reads
 * `restUntil` and subtracts the browser's clock. Close the tab, refresh,
 * change the system clock — the digits are recomputed from the row and the
 * engine resumes off the same stored instant on its own machine. That is what
 * "זמן ההפסקה חייב להישמר בצד השרת ובמסד הנתונים, ולא להסתמך על טיימר מקומי
 * בדפדפן" asks for, and the only honest way to show a clock at all.
 */
export function CycleCard({
  cycle,
  publishedToday = null,
  onToggle,
  busy,
}: {
  cycle: PublishCycle;
  /**
   * ─── WHAT THE METER SHOWS WHEN THERE IS NO ROUND TO SHOW ────────────────
   *
   * "המחזור פרסום קבוצות תקוע על 76 כבר יומיים, אני רוצה שזה יתעדכן כל יום."
   *
   * HE WAS RIGHT AND IT WAS NOT STUCK — it was DEAD. With the switch off,
   * social_publish_cycle_tick() returns before it counts anything and leaves
   * the row exactly as it was (v41, "Off: nothing is counted and nothing is
   * held"), so `cycle_count` freezes at whatever it held the moment the
   * switch was thrown. His row: 76, written 13.11 at 15:40, unchanged for two
   * days while the account published 252, 250 and 59 times on the days after.
   *
   * The card drew that 76 as a big number over a 76%-full bar, with the words
   * "המנגנון כבוי" underneath — and the words lost, as words beside a big
   * number do. A dormant round is not a small print problem; it is a figure
   * that must not be on screen at all.
   *
   * SO WITH THE MECHANISM OFF THE METER COUNTS THE DAY instead: an exact head
   * count of what this account published since local midnight, which is the
   * number that answers "יתעדכן כל יום" literally — it moves with every
   * publication and starts again at midnight, on its own, with no mechanism
   * to switch on.
   *
   * Null means the caller does not know (the campaign screen, the test that
   * mounts this card alone), and then the meter says so rather than inventing
   * a figure.
   */
  publishedToday?: number | null;
  onToggle?: (on: boolean) => void;
  busy?: boolean;
}) {
  /*
   * ONE TICK A SECOND, AND ONLY WHILE SOMETHING IS HOLDING. A card that is
   * not counting down must not keep a timer alive: this screen re-renders on
   * every poll already, and an idle interval here is a wake-up a minute for
   * nothing on a phone the owner leaves open all day.
   */
  const [now, setNow] = useState(() => Date.now());
  const resting = cycleResting(cycle, now);
  useEffect(() => {
    if (!cycleResting(cycle, Date.now())) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [cycle]);

  const left = cycleRestLeftMs(cycle, now);
  /* CLAMPED AT THE CEILING, because a count and a limit that arrive from two
     reads a second apart can briefly disagree, and a bar wider than its track
     is the one way this card could look broken. */
  const pct = Math.max(0, Math.min(100, Math.round((cycle.count / Math.max(1, cycle.limit)) * 100)));
  const resumeAt = cycle.restUntil ? new Date(cycle.restUntil) : null;
  /* The day's figure is only drawn when the caller really has it — see the
     prop's note. A dash is a better answer than a zero nobody counted. */
  const dayKnown = cycle.enabled || typeof publishedToday === 'number';

  return (
    <>
      {/*
        THE CARD IS HORIZONTAL, which is what the brief asks for in so many
        words ("כרטיסייה אופקית חדשה") and what the reference draws:
        the shield, then the meter, then the title and its switch, divided
        rather than stacked. It wraps at the narrowest widths instead of
        overflowing — a row that scrolls sideways on a phone is the one
        failure this screen's own layout guard exists to catch.
      */}
      <div className="anxc-card" data-resting={resting ? 'yes' : 'no'}>
        <span aria-hidden className="anxc-badge">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
            <path d="M12 3 4 6.2v5.1c0 4.7 3.3 8.5 8 9.7 4.7-1.2 8-5 8-9.7V6.2z" />
            <path d="M12 8.4v3.8l2.4 1.4" />
          </svg>
        </span>

        {/* ── the meter ── */}
        <div className="anxc-meter">
          {/*
            THE TITLE NAMES WHICHEVER NUMBER IS UNDER IT. A heading that says
            "מחזור פרסום קבוצות" over a figure that is not a round was half of
            why the dead 76 read as a live one.
          */}
          <p className="anxc-mtitle">{cycle.enabled ? 'מחזור פרסום קבוצות' : 'פרסומים היום בקבוצות'}</p>
          <p className="anxc-count">
            {cycle.enabled ? (
              <>
                {cycle.count} / {cycle.limit}
              </>
            ) : (
              /* NO CEILING BESIDE IT. The day's limit on this account is 2000
                 — a bar against it would sit at 12% on a full day's work and
                 say nothing — and "/ 100" would be the round again, which is
                 exactly what is not running. */
              <>{dayKnown ? publishedToday : '—'}</>
            )}
          </p>
          {/*
            AND THE STATE IN WORDS UNDER IT, both ways round: what the number
            counts while the mechanism runs, and that nothing is being held
            while it does not.
          */}
          {cycle.enabled ? (
            <p className="anxc-label">פרסומים במחזור הנוכחי</p>
          ) : (
            <p className="anxc-label anxc-off">המנגנון כבוי — אין הפסקות אוטומטיות</p>
          )}
          {/*
            THE BAR IS THE ROUND'S, so it goes with the round. Left drawn at
            76% under a day's figure it would be the frozen number's last
            footprint on the card.
          */}
          {cycle.enabled && (
            <span className="anxc-track">
              <span className="anxc-bar" style={{ width: `${pct}%` }} />
            </span>
          )}
        </div>

        <span aria-hidden className="anxc-div" />

        {/* ── what it is, and the switch that decides whether it runs ── */}
        <div className="anxc-words">
          <h3 className="anxc-head">
            <svg aria-hidden viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.9" strokeLinecap="round" strokeLinejoin="round">
              <path d="M7 3h10M7 21h10M8 3v3.2c0 2 1.6 3.1 2.9 4 .7.5.7 1.1 0 1.6C9.6 12.7 8 13.8 8 15.8V21M16 3v3.2c0 2-1.6 3.1-2.9 4-.7.5-.7 1.1 0 1.6 1.3.9 2.9 2 2.9 4V21" />
            </svg>
            הפסקה אוטומטית אחרי {cycle.limit} פרסומים
          </h3>
          {/*
            AND THE DAY'S OWN NUMBER, because that is the one he asked for:
            "הגבלה לעשות ל 220 קבוצות". The round is half of it by design — two
            stretches with a rest between them rather than one long burst — so
            the card states both, and states the day's figure as the PRODUCT
            of the two the engine uses. A literal 220 typed here would be a
            number that could drift away from what the engine enforces.

            `roundsPerWindow` comes from the database's own answer when it has
            one, and from the constant the engine passes it when it does not;
            they are the same number by construction, and reading the row's
            first is what makes this sentence true on a day somebody changes
            it in one place.
          */}
          <p className="anxc-sub">
            לאחר {cycle.limit} פרסומים בקבוצות, המערכת תיכנס להפסקה של {CYCLE_REST_HOURS} שעות — עד{' '}
            {cycle.limit * (cycle.roundsPerWindow || CYCLE_ROUNDS_PER_WINDOW)} פרסומים ביממה.
          </p>
        </div>

        {onToggle && (
          <div className="anxc-swwrap">
            <button
              type="button"
              role="switch"
              aria-checked={cycle.enabled}
              aria-label="מנגנון המתנה"
              disabled={busy}
              onClick={() => onToggle(!cycle.enabled)}
              className="anxc-switch"
              data-on={cycle.enabled ? 'yes' : 'no'}
            >
              {/* THE BUTTON IS THE TAP TARGET AND THE TRACK IS DRAWN INSIDE IT.
                  The first version made the 52×30 track itself the button and
                  grew the hit area with an `::after` inset — which works for a
                  thumb and is invisible to every measurement in this suite,
                  including the one that measured it at 30px and was right to. */}
              <span aria-hidden className="anxc-track-sw">
                <span aria-hidden className="anxc-knob" />
              </span>
            </button>
            <span className="anxc-swlabel">מנגנון המתנה {cycle.enabled ? 'פעיל' : 'כבוי'}</span>
          </div>
        )}
      </div>

      {/*
        AND THE HOLD IS ITS OWN BAR, as the reference draws it: a dark band
        under the card, not a line inside it. It exists only while something
        is actually holding — an empty bar reserving its own height would be
        the card claiming a state it is not in, on a screen whose height the
        owner has twice asked to cut.
      */}
      {resting && resumeAt && (
        <div className="anxc-rest" role="status">
          <span aria-hidden className="anxc-pause">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
              <path d="M9.5 6.5v11M14.5 6.5v11" />
            </svg>
          </span>
          <span className="anxc-restwords">
            <strong>המערכת בהפסקה</strong>
            <span className="anxc-dot" aria-hidden />
            <span>
              תתחדש אוטומטית ב-{String(resumeAt.getHours()).padStart(2, '0')}:{String(resumeAt.getMinutes()).padStart(2, '0')}{' '}
              ({String(resumeAt.getDate()).padStart(2, '0')}.{String(resumeAt.getMonth() + 1).padStart(2, '0')}.{resumeAt.getFullYear()})
            </span>
          </span>
          <span className="anxc-clock">{cycleCountdown(left)}</span>
        </div>
      )}
    </>
  );
}
