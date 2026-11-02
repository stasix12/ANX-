/**
 * ─── WHO MAY SEE ACROSS BUSINESSES ─────────────────────────────────────────
 *
 * "ותוסיף רק אצלי, לא אצל הלקוחות." — the owner, 02.11.2026.
 *
 * ITS OWN FILE, AND NOT BECAUSE IT IS BIG. server/auth.ts begins with
 * `import 'server-only'`, which throws the moment anything but a server
 * component imports it — including a test. So the one predicate in this
 * product that decides whether a person may see other people's data would
 * have been the one predicate no test could call. A security gate that cannot
 * be unit-tested is a gate nobody has checked; this file exists so it can be.
 *
 * It holds no secret. It reads one environment variable, which Next replaces
 * with `undefined` in any client bundle because the name does not begin with
 * NEXT_PUBLIC_ — so even an accidental client import answers `false` rather
 * than leaking the list. Nothing imports it from a component, and the server
 * route reaches it through server/auth.ts.
 */

/**
 * Is this person an administrator OF THE PRODUCT — not of a business?
 *
 * FAIL CLOSED. An unset or empty SOCIAL_ADMIN_USERS means nobody is, including
 * the owner. An admin surface whose gate defaults to open because it was never
 * configured is not a gate, and this one stands in front of other people's
 * data.
 *
 * Entries are separated by commas or whitespace and are matched two ways:
 *
 *   · an entry containing '@' is an EMAIL, compared case-insensitively, and
 *     never matches a user who has no email at all;
 *   · anything else is a Supabase USER ID, compared exactly.
 *
 * The id form is the stronger one and is what the setup note recommends. An
 * email is a field on a row — Supabase will not move an address onto an
 * account that cannot confirm it, so it is not forgeable in practice, but an
 * id is not a claim about the world at all.
 */
export function isPlatformAdmin(user: { id: string; email?: string | null }): boolean {
  const raw = (process.env.SOCIAL_ADMIN_USERS ?? '').trim();
  if (!raw) return false;
  const email = (user.email ?? '').trim().toLowerCase();
  const id = (user.id ?? '').trim();
  return raw
    .split(/[\s,]+/)
    .map((entry) => entry.trim())
    .filter(Boolean)
    .some((entry) => (entry.includes('@') ? Boolean(email) && entry.toLowerCase() === email : Boolean(id) && entry === id));
}
