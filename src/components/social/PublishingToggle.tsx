'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { PauseIcon, PlayIcon, SpinnerIcon } from '@/components/icons';
import { getControl, setPaused } from '@/lib/social/client';
import { friendlyMessage } from '@/lib/social/errors';
import { useToast } from './ui';

/**
 * Stop and resume all publishing, from any screen.
 *
 * This lives in the header rather than on the dashboard on purpose: the reason
 * to stop everything — a post going out wrong, an account warning, a group
 * complaining — never arrives while you happen to be looking at the dashboard.
 *
 * It pauses; it does not cancel. The queue is kept exactly as it is and
 * resuming carries on from where it stopped, so there is nothing to confirm in
 * either direction. Cancelling the queue is a separate, destructive action and
 * stays where it is, behind its own confirmation.
 *
 * While paused the control is amber on every screen, because "nothing is going
 * out" is a state the owner must never discover by accident.
 */
export function PublishingToggle({
  /**
   * The value, when the screen around this button already reads it.
   *
   * Without it the dashboard and this button each poll getControl() on their
   * own clock — 30s and 20s — so a tap here left the system card's status dot,
   * the biggest element on the screen, claiming the opposite for up to half a
   * minute. Given the value, the button renders it; given onChanged, it tells
   * the screen to re-read the moment the write lands. Screens that pass
   * neither keep the standalone behaviour and their own poll.
   */
  paused: external,
  onChanged,
  compact = false,
}: { paused?: boolean | null; onChanged?: () => void; compact?: boolean } = {}) {
  const [paused, setPausedState] = useState<boolean | null>(external ?? null);
  const [busy, setBusy] = useState(false);
  /*
   * `busy` is React state and is not set until the render AFTER the click, so
   * three taps dispatched inside one task all got through: measured, three
   * same-tick clicks on this button produced three POSTs to social_settings.
   * A ref flips synchronously, inside the handler, which is the only thing
   * that can stop the second tap.
   */
  const writing = useRef(false);
  const toast = useToast();

  const read = useCallback(() => {
    getControl()
      .then((c) => setPausedState(c.paused))
      .catch(() => undefined);
  }, []);

  /*
   * A screen that HAS the value owns it; the poll below is the fallback for
   * the screens and the moments that do not.
   *
   * `null` is not ownership: the dashboard passes null while it is loading and
   * again if its read fails, and this button is the global stop — it may not
   * vanish from the header exactly when the screen behind it is broken. So the
   * poll keeps running until a real boolean arrives, and stops once one has.
   */
  const owned = external !== undefined && external !== null;
  useEffect(() => {
    if (owned) setPausedState(external as boolean);
  }, [owned, external]);

  /*
   * The fallback poll, and it is a FALLBACK: it must not run on a screen that
   * already hands the value down.
   *
   * The `paused` prop was added so the dashboard and this button would stop
   * reading social_settings on two clocks — but the interval was left
   * unconditional, so both reads survived. Measured on an idle dashboard in
   * the harness: 4 GETs of social_settings in 50 seconds, which is the 30s
   * page poll plus this 20s one, exactly the pair the prop was meant to
   * collapse. Worse, a poll landing in the window between the optimistic flip
   * and the parent's re-read can put the stale value back under the owner's
   * thumb.
   */
  useEffect(() => {
    if (owned) return;
    read();
    // Someone may pause from another device, or the worker may report a stop.
    const id = setInterval(read, 20_000);
    return () => clearInterval(id);
  }, [read, owned]);

  async function toggle() {
    if (paused === null || busy || writing.current) return;
    writing.current = true;
    const next = !paused;
    setBusy(true);
    // Optimistic: the control is the thing being pressed, so it should move
    // at once; a failure puts it back and says why.
    setPausedState(next);
    try {
      await setPaused(next);
      toast(next ? 'הפרסום הושהה. התור נשמר.' : 'הפרסום חודש.', next ? 'info' : 'success');
      onChanged?.();
    } catch (err) {
      setPausedState(!next);
      toast(friendlyMessage(err, 'לא הצלחנו לשנות את מצב הפרסום.'), 'error');
    } finally {
      writing.current = false;
      setBusy(false);
    }
  }

  // Until the real state is known, render nothing rather than guess at it.
  if (paused === null) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      disabled={busy}
      aria-pressed={paused}
      aria-label={paused ? 'המשך את כל הפרסומים' : 'השהה את כל הפרסומים'}
      /*
       * `compact` is the same button with its label taken off, for the
       * identity bar: three 44px round controls beside a name and a status
       * line is what fits a 375px phone, where the labelled form left the
       * greeting 79px and cut it mid-word. Nothing else about the control
       * changes — same handler, same optimistic flip, same aria-label, which
       * is what a screen reader announces in both forms.
       */
      className={
        compact
          ? `grid h-11 w-11 shrink-0 place-items-center rounded-full transition-colors disabled:text-ink-600 ${
              paused ? 'bg-warning-400/12 text-warning-400' : 'text-mist-500 hover:bg-ink-800 hover:text-mist-100'
            }`
          : `inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-sm font-bold transition-colors disabled:text-ink-600 ${
              paused ? 'bg-warning-400/12 text-warning-400' : 'bg-ink-800 text-mist-500 hover:text-mist-100'
            }`
      }
    >
      {busy ? (
        <SpinnerIcon className="h-4 w-4 animate-spin" />
      ) : paused ? (
        <PlayIcon className="h-4 w-4" />
      ) : (
        <PauseIcon className="h-4 w-4" />
      )}
      {/* "הכול", not a bare "השהה". This control stops EVERY round in the
          product, and it sits in the sticky header a few hundred pixels above
          a run card whose own pause button — which stops one round — read
          exactly the same word. Two buttons on one screen, the same label,
          wildly different blast radius. */}
      {!compact && <span>{paused ? 'המשך הכול' : 'השהה הכול'}</span>}
    </button>
  );
}
