import 'server-only';
import type { User } from '@supabase/supabase-js';
import { serviceDb } from './db';
import { isPlatformAdmin } from '../admin-allowlist';
import { friendlyMessage } from '@/lib/social/errors';

/**
 * Route-handler guards.
 *
 * requireAdmin: THE NAME IS OLDER THAN THE PRODUCT AND IT PROMISES TOO MUCH.
 * What it does is verify that the caller is SIGNED IN: the browser sends a
 * Supabase access token as a Bearer header and Supabase validates it
 * server-side. It does not, and never did, check that the signed-in person is
 * an administrator of anything. That was true enough when there was one
 * account; with customers in the database it means every one of them passes
 * this guard. It is still the right guard for the routes that use it — they
 * act on the caller's OWN business, and RLS decides which rows that is — but
 * anything whose answer spans businesses must not stop here.
 *
 * requirePlatformAdmin: the real one, for exactly that case. See below.
 *
 * requireCron: scheduled runs (GitHub Actions / Vercel Cron) carry
 * SOCIAL_CRON_SECRET instead — no user session exists for them.
 */

export class HttpError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

export async function requireAdmin(request: Request): Promise<User> {
  const header = request.headers.get('authorization') ?? '';
  const token = header.replace(/^Bearer\s+/i, '').trim();
  if (!token) throw new HttpError(401, 'נדרשת התחברות.');
  const { data, error } = await serviceDb().auth.getUser(token);
  if (error || !data.user) throw new HttpError(401, 'ההתחברות פגה — היכנסו שוב.');
  return data.user;
}

/**
 * ─── IS THIS THE PERSON WHO OWNS THE PRODUCT? ───────────────────────────────
 *
 * "ותוסיף רק אצלי, לא אצל הלקוחות." — the owner, 02.11.2026, asking for a
 * panel that shows who is connected and under which user.
 *
 * That answer spans every business in the database, so requireAdmin() is not
 * enough for it: that guard says "signed in", and every customer is signed in.
 * A panel built behind it would have handed each customer the presence of all
 * the others — the exact boundary social_tenant_members exists to hold.
 *
 * THE PREDICATE ITSELF LIVES IN ../admin-allowlist, which this file re-exports
 * so routes keep one import. It is out here because this module starts with
 * `import 'server-only'` and therefore cannot be loaded by a test — and the
 * one function that decides who may see other people's data is the last one
 * that should be untested. The allowlist is an environment variable for the
 * same reason the schema gives social_tenant_members no INSERT policy: what
 * decides who may see across businesses may not be writable from inside one.
 */
export { isPlatformAdmin };

/** The signed-in caller, or 403 — for routes whose answer spans businesses. */
export async function requirePlatformAdmin(request: Request): Promise<User> {
  const user = await requireAdmin(request);
  if (!isPlatformAdmin(user)) throw new HttpError(403, 'אין לכם הרשאה לפאנל הניהול.');
  return user;
}

export function requireCron(request: Request): void {
  const secret = process.env.SOCIAL_CRON_SECRET;
  if (!secret) throw new HttpError(500, 'SOCIAL_CRON_SECRET לא מוגדר.');
  const header = request.headers.get('authorization') ?? '';
  const given = request.headers.get('x-cron-secret') ?? header.replace(/^Bearer\s+/i, '').trim();
  if (given !== secret) throw new HttpError(401, 'cron secret שגוי.');
}

/** Accepts either identity — used by the worker endpoint. */
export async function requireAdminOrCron(request: Request): Promise<void> {
  try {
    requireCron(request);
    return;
  } catch {
    await requireAdmin(request);
  }
}

/**
 * The browser gets a sentence the owner can act on; the server log keeps the
 * real error. An unexpected failure must never send its raw text — a stack
 * trace or an SQL constraint name in a toast is a leak, not a message.
 */
export function errorResponse(err: unknown): Response {
  if (err instanceof HttpError) return Response.json({ error: err.message }, { status: err.status });
  console.error('[social]', err);
  return Response.json({ error: friendlyMessage(err, 'שגיאה לא צפויה.') }, { status: 500 });
}
