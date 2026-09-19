'use client';

import { useCallback, useEffect, useState } from 'react';
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
export function PublishingToggle() {
  const [paused, setPausedState] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);
  const toast = useToast();

  const read = useCallback(() => {
    getControl()
      .then((c) => setPausedState(c.paused))
      .catch(() => undefined);
  }, []);

  useEffect(() => {
    read();
    // Someone may pause from another device, or the worker may report a stop.
    const id = setInterval(read, 20_000);
    return () => clearInterval(id);
  }, [read]);

  async function toggle() {
    if (paused === null || busy) return;
    const next = !paused;
    setBusy(true);
    // Optimistic: the control is the thing being pressed, so it should move
    // at once; a failure puts it back and says why.
    setPausedState(next);
    try {
      await setPaused(next);
      toast(next ? 'הפרסום הושהה. התור נשמר.' : 'הפרסום חודש.', next ? 'info' : 'success');
    } catch (err) {
      setPausedState(!next);
      toast(friendlyMessage(err, 'לא הצלחנו לשנות את מצב הפרסום.'), 'error');
    } finally {
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
      className={`inline-flex min-h-10 shrink-0 items-center gap-1.5 rounded-xl px-2.5 text-sm font-bold transition-colors disabled:opacity-60 ${
        paused ? 'bg-amber-500/12 text-amber-700' : 'bg-ink-800 text-mist-500 hover:text-mist-100'
      }`}
    >
      {busy ? (
        <SpinnerIcon className="h-4 w-4 animate-spin" />
      ) : paused ? (
        <PlayIcon className="h-4 w-4" />
      ) : (
        <PauseIcon className="h-4 w-4" />
      )}
      <span>{paused ? 'המשך' : 'השהה'}</span>
    </button>
  );
}
