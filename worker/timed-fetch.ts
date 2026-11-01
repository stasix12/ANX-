/**
 * ─── NO REQUEST FROM THE MACHINE THAT PUBLISHES WAITS FOR EVER ───────────────
 *
 * The second instance of a fault already fixed once.
 *
 * src/lib/supabase.ts puts a sixty-second ceiling under every request the
 * BROWSER makes, because supabase-js sets no timeout on anything and a
 * connection that dies mid-flight never settles — not an error, not a result,
 * just a promise that stays pending. On a phone that was "טוען בלי סוף".
 *
 * worker/db.ts created its client with no such ceiling, and the worker is
 * worse off than the browser was: it has no user to close a screen. A hung
 * UPDATE there freezes the publishing loop behind one socket, with the machine
 * up, the program running and nothing on screen to say why. It is also the one
 * thing that can still silence the pulse timer (see worker/pulse.ts), because
 * a write that never settles holds its in-flight flag for ever.
 *
 * SAME NUMBER, SAME EXEMPTION. Sixty seconds is longer than any query this
 * product legitimately makes and short enough to be an answer; storage moves
 * whole photographs, and cutting an upload at sixty seconds would break
 * publishing in order to fix a freeze.
 */
export const REQUEST_TIMEOUT_MS = 60_000;

/** Storage is exempt: a post's images over a slow uplink honestly take minutes. */
export function wantsCeiling(href: string): boolean {
  return !href.includes('/storage/v1/');
}

export function timedWorkerFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const canTime = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';
  if (!canTime || !wantsCeiling(href)) return fetch(input, init);

  const ceiling = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const caller = init?.signal;
  /* A caller's own abort is a decision; where the two cannot be combined it wins. */
  const signal = caller ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([caller, ceiling]) : caller) : ceiling;
  return fetch(input, { ...init, signal });
}
