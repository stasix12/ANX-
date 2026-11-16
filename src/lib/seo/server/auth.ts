import { supabaseAdmin } from '@/lib/seo/server/supabaseAdmin';

/**
 * Who is allowed to call /api/seo/*.
 *
 * Two callers exist and they authenticate differently, so both paths are
 * checked explicitly rather than collapsed into one permissive rule:
 *
 *   - the scheduler, which has no user and presents CRON_SECRET;
 *   - an admin in the dashboard, who presents their own Supabase access token,
 *     verified against Supabase rather than merely decoded here.
 *
 * Anything else is rejected. In particular an unset CRON_SECRET does NOT make
 * the cron path open: a missing secret fails closed.
 */

if (typeof window !== 'undefined') {
  throw new Error('seo/server/auth is server-only');
}

export type Caller =
  | { kind: 'cron' }
  | { kind: 'admin'; userId: string }
  | { kind: 'denied'; reason: string; status: 401 | 403 | 503 };

function bearer(request: Request): string | null {
  const header = request.headers.get('authorization');
  if (!header?.startsWith('Bearer ')) return null;
  const token = header.slice(7).trim();
  return token.length > 0 ? token : null;
}

/** Constant-time-ish compare, so a wrong secret leaks no length information. */
function secretsMatch(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

export async function authenticate(request: Request): Promise<Caller> {
  const token = bearer(request);
  if (!token) return { kind: 'denied', reason: 'חסר טוקן הרשאה', status: 401 };

  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && secretsMatch(token, cronSecret)) return { kind: 'cron' };

  if (!supabaseAdmin) {
    return {
      kind: 'denied',
      reason: 'SUPABASE_SERVICE_ROLE_KEY לא מוגדר בשרת',
      status: 503,
    };
  }

  // A Supabase access token is only trusted after Supabase itself confirms it.
  const { data, error } = await supabaseAdmin.auth.getUser(token);
  if (error || !data.user) {
    return { kind: 'denied', reason: 'טוקן לא תקף', status: 403 };
  }
  return { kind: 'admin', userId: data.user.id };
}

/** Uniform JSON error, so the dashboard can render the reason verbatim. */
export function deny(caller: Extract<Caller, { kind: 'denied' }>): Response {
  return Response.json({ ok: false, error: caller.reason }, { status: caller.status });
}
