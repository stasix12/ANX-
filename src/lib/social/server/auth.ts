import 'server-only';
import type { User } from '@supabase/supabase-js';
import { serviceDb } from './db';
import { friendlyMessage } from '@/lib/social/errors';

/**
 * Route-handler guards.
 *
 * requireAdmin: the browser sends the signed-in admin's Supabase access
 * token as a Bearer header; Supabase validates it server-side. This is the
 * same identity that RLS already trusts for the CRM.
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
