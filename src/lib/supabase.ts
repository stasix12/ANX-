import { createClient } from '@supabase/supabase-js';

const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

/**
 * ─── NO REQUEST FROM A BROWSER WAITS FOR EVER ──────────────────────────────
 *
 * "אני רוצה אחרי שאני לוחץ שינוי בקמפיין זה מייד שומר ולא טוען מסך בלי סוף."
 *
 * supabase-js sets no timeout on anything. A request whose connection dies
 * mid-flight — an ordinary event on a phone moving between cells, which is
 * where this product is used — never settles: not an error, not a result. The
 * promise simply stays pending, and every button that awaits it spins until
 * the app is closed. That is the "טוען בלי סוף" exactly, and no amount of
 * try/finally in a screen can fix it, because the `finally` never runs either.
 *
 * So the ceiling goes here, once, under every call this app makes — reads,
 * writes, counts, the lot. An aborted request surfaces as an ordinary error,
 * which every screen already knows how to show.
 *
 * SIXTY SECONDS. Longer than any query in this product legitimately takes
 * (the heaviest is a few hundred rows), short enough to be an answer.
 *
 * EXCEPT STORAGE, which moves whole photographs: a post's images over a slow
 * uplink can honestly take minutes, and cutting an upload at sixty seconds
 * would break publishing to fix a spinner.
 *
 * And it defers to a caller's own signal where the browser can combine the
 * two (AbortSignal.any). Where it cannot, the caller's signal wins — a
 * deliberate abort is a decision, and losing the ceiling for that one request
 * is better than ignoring it.
 */
const REQUEST_TIMEOUT_MS = 60_000;

export function timedFetch(input: RequestInfo | URL, init?: RequestInit): Promise<Response> {
  const href = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url;
  const canTime = typeof AbortSignal !== 'undefined' && typeof AbortSignal.timeout === 'function';
  if (!canTime || href.includes('/storage/v1/')) return fetch(input, init);

  const ceiling = AbortSignal.timeout(REQUEST_TIMEOUT_MS);
  const caller = init?.signal;
  const signal = caller ? (typeof AbortSignal.any === 'function' ? AbortSignal.any([caller, ceiling]) : caller) : ceiling;
  return fetch(input, { ...init, signal });
}

/**
 * `null` until NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are
 * set, so the public storefront (which never needs this) keeps building even
 * before the admin panel's project exists.
 */
export const supabase = url && anonKey ? createClient(url, anonKey, { global: { fetch: timedFetch } }) : null;
