/**
 * WHAT A CRASH IS ALLOWED TO SAY, AND WHERE IT IS WRITTEN DOWN.
 *
 * "המסך הזה נתקע — משהו השתבש בהצגת המסך." The owner sent that screenshot and
 * asked for the real cause. There was no way to answer: the boundary
 * (src/app/social/error.tsx) printed the message to a console on a phone
 * nobody can open, the screen itself named neither the route nor the line,
 * and `error.digest` — the one identifier Next.js supplies — exists only for
 * errors thrown on the SERVER. His was a client render, so the field was
 * absent and the card showed no code at all.
 *
 * So a crash now leaves a record. Three things make it useful:
 *
 *   THE ROUTE, because "it broke" and "the library screen broke" are
 *   different reports, and only the second can be acted on.
 *
 *   ONE STACK FRAME, because the top frame of a minified bundle still names
 *   the chunk and the position, which is enough to find the component when
 *   the sourcemap is to hand.
 *
 *   A SHORT CODE the owner can read out loud. The same fault always produces
 *   the same six characters, so "it did it again, 4F2A9C" is a sentence that
 *   identifies a bug, and two different codes mean two different bugs rather
 *   than one that was never fixed.
 *
 * AND NOTHING ELSE. "אסור להכניס ללוגים: Passwords, Facebook tokens,
 * Secrets, Sensitive authentication data." An exception message is the single
 * most likely place in this product for a token to turn up — a failed fetch
 * prints its URL, a Supabase error quotes its request, an auth failure quotes
 * the header it was handed. redact() below is not a nicety; it is the reason
 * this file can write to the activity log at all.
 */

/** The longest message kept. A stack is never stored; one frame is. */
const MAX_MESSAGE = 300;

/**
 * Anything that looks like a credential, replaced before it can be stored.
 *
 * Deliberately GREEDY. A false positive costs a few characters of a message;
 * a false negative writes a Facebook token into a table the owner can open on
 * his phone, and into whatever reads that table afterwards.
 */
const SECRETS: [RegExp, string][] = [
  /* JWTs — Supabase's own session, and anything else three base64 segments
     long. Matched first, because the generic run below would only eat part. */
  [/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]+/g, '[token]'],
  /* Anything NAMED like a secret, whatever its shape: access_token=…,
     "apikey": "…", password=…. The NAME is kept and only the value goes, so
     the message still says what kind of thing was missing or wrong. */
  [
    /\b(access[_-]?token|refresh[_-]?token|id[_-]?token|api[_-]?key|apikey|authorization|password|passwd|secret|session|cookie)\b(\s*[=:]\s*)"?[^\s"&,}]{4,}/gi,
    '$1$2[secret]',
  ],
  [/\bBearer\s+[A-Za-z0-9._-]{8,}/gi, 'Bearer [token]'],
  /* A long opaque run with no spaces — the shape every key in this product
     has. 24 is above any Hebrew word and any file name in the bundle. */
  [/\b[A-Za-z0-9_-]{24,}\b/g, '[long]'],
  /* A URL's query string, which is where the rest of them hide. */
  [/\?[^\s)]{4,}/g, '?[query]'],
];

/** Strip anything credential-shaped out of free text. */
export function redact(text: string): string {
  let out = String(text ?? '');
  for (const [re, by] of SECRETS) out = out.replace(re, by);
  return out;
}

/**
 * The first frame of a stack, reduced to "where" — never the whole stack.
 *
 * A full stack is tens of lines of bundle noise, and the owner's activity log
 * is a list he reads. The first frame is the one that identifies the fault.
 */
export function topFrame(stack: string | undefined): string {
  if (!stack) return '';
  const lines = stack.split('\n').map((l) => l.trim());
  /* Line 0 is usually "TypeError: x is not a function", which is the message
     again. The first line that looks like a frame is the one wanted. */
  const frame = lines.find((l) => /^at\s/.test(l)) ?? '';
  return redact(frame).slice(0, 160);
}

/**
 * SIX CHARACTERS THAT MEAN "THIS FAULT".
 *
 * FNV-1a over the stable parts — the error's class, its frame and the route —
 * and NOT over the message, which can carry an id, a count or a time and
 * would then give one bug a new code on every occurrence.
 */
export function crashCode(parts: { name: string; frame: string; route: string }): string {
  const seed = `${parts.name}|${parts.frame}|${parts.route}`;
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i += 1) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h.toString(16).toUpperCase().padStart(8, '0').slice(0, 6);
}

export interface CrashReport {
  /** The error's class — TypeError, Error, and so on. */
  name: string;
  /** Redacted and truncated. */
  message: string;
  /** One frame, redacted. */
  frame: string;
  /** The path the owner was on. */
  route: string;
  /** Next.js's own id, present only for an error thrown on the server. */
  digest: string;
  /** The six characters on screen and in the log. */
  code: string;
}

/** An unknown thrown value → the record that may be stored and shown. */
export function crashReport(error: unknown, route: string, digest?: string): CrashReport {
  const err = error as { name?: unknown; message?: unknown; stack?: unknown } | null;
  const name = typeof err?.name === 'string' && err.name ? err.name : 'Error';
  const rawMessage = typeof err?.message === 'string' ? err.message : String(error ?? '');
  const frame = topFrame(typeof err?.stack === 'string' ? err.stack : undefined);
  const safeRoute = redact(route || '/');
  return {
    name: name.slice(0, 40),
    message: redact(rawMessage).slice(0, MAX_MESSAGE),
    frame,
    route: safeRoute,
    digest: typeof digest === 'string' ? digest.slice(0, 40) : '',
    code: crashCode({ name, frame, route: safeRoute }),
  };
}

/** The one-line sentence the activity log carries. */
export function crashLine(r: CrashReport): string {
  return `המסך ${r.route} נתקע (${r.code}): ${r.name}${r.message ? ` — ${r.message}` : ''}`;
}
