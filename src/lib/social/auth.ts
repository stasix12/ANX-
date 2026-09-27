'use client';

import { supabase } from '@/lib/supabase';
import { friendlyMessage } from './errors';

/**
 * Signing in to the publishing module, and — new — signing UP for it.
 *
 * WHY THIS EXISTS AT ALL. /social has never had a door. The owner reaches it
 * because they signed in once at /crm/login, and both screens are served from
 * the same origin against the same Supabase client (@/lib/supabase), so the
 * session in localStorage is shared. That works, and it works by accident: it
 * is the CRM's login holding the publishing app open. A customer has no CRM,
 * no account, and nowhere to make one, so they would open the dashboard, see
 * nothing, and have no way to fix that.
 *
 * NOTHING HERE IS THE SECURITY BOUNDARY. That is row-level security — v16
 * scopes every table to the businesses the signed-in user belongs to, so an
 * anonymous visitor already sees zero rows. This module decides what the
 * SCREEN does about that: send them to a door instead of an empty dashboard.
 * Losing this file could render a screen it should not; it could never let a
 * read or a write through.
 *
 * The session hook is the one in adminAuth.ts on purpose. It tracks the same
 * client and the same storage key, and a second copy of it here would be two
 * sources of truth for one session — the drift this codebase keeps paying for.
 */
export { useAdminSession as useSocialSession, signOut as signOutSocial } from '@/lib/adminAuth';

export type AuthOutcome =
  | { ok: true; needsEmailConfirm: boolean }
  | { ok: false; message: string };

const NO_CLIENT = 'המערכת אינה מחוברת ל-Supabase.';

/**
 * Give the signed-in person their own business, if they do not have one.
 *
 * social_claim_workspace (v19) is idempotent BY DESIGN and the check is
 * server-side: it looks for a row in social_tenant_members for auth.uid() and
 * returns that tenant if there is one. So calling it on every successful sign
 * -in is safe — for the owner it is a no-op that returns the business they
 * already belong to, and it can never create a second one.
 *
 * It runs on SIGN-IN and not only on sign-up, because a project with email
 * confirmation switched on gives signUp() no session at all. There is no
 * authenticated moment during sign-up in that case, and auth.uid() is what the
 * function needs. First sign-in is the first moment it can work, and it is
 * also the moment it is needed.
 *
 * A failure here is deliberately not fatal to the sign-in. The person IS
 * signed in; what they are missing is a workspace, and the dashboard says so
 * far better than a login screen that refuses them for a reason they cannot
 * act on.
 */
async function claimWorkspace(businessName: string): Promise<void> {
  if (!supabase) return;
  /* The builder is thenable but not a Promise, so it has no .catch — awaited
     into one first. RPC failures are swallowed on purpose; see above. */
  try {
    await supabase.rpc('social_claim_workspace', { business_name: businessName });
  } catch {
    /* Signed in without a workspace. The dashboard explains that far better
       than a login screen refusing them for a reason they cannot act on. */
  }
}

export async function signInToSocial(email: string, password: string): Promise<AuthOutcome> {
  if (!supabase) return { ok: false, message: NO_CLIENT };
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  if (error) return { ok: false, message: authMessage(error.message) };
  await claimWorkspace('');
  return { ok: true, needsEmailConfirm: false };
}

export async function signUpToSocial(email: string, password: string, businessName: string): Promise<AuthOutcome> {
  if (!supabase) return { ok: false, message: NO_CLIENT };
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) return { ok: false, message: authMessage(error.message) };
  /*
   * TWO ENDINGS, and which one happens is a Supabase project setting nobody
   * here controls. With email confirmation off, signUp returns a session and
   * the person is already in. With it on, it returns a user and NO session,
   * and they have to open a link in their inbox first. Both are handled rather
   * than assumed, because guessing wrong means a customer staring at a screen
   * that says "welcome" while nothing works.
   */
  if (!data.session) return { ok: true, needsEmailConfirm: true };
  await claimWorkspace(businessName.trim());
  return { ok: true, needsEmailConfirm: false };
}

/**
 * Supabase's auth errors, in the language of the person reading them.
 *
 * Kept apart from friendlyError() in errors.ts, which maps DATABASE failures:
 * these strings come from GoTrue, they are short, and there are only a handful
 * that a person can actually hit on a login form.
 */
function authMessage(raw: string): string {
  const text = raw.toLowerCase();
  if (text.includes('invalid login credentials')) return 'המייל או הסיסמה לא נכונים.';
  if (text.includes('email not confirmed')) return 'צריך לאשר את המייל קודם — חפשו הודעה מאיתנו בתיבה.';
  if (text.includes('already registered') || text.includes('already been registered')) {
    return 'כבר קיים חשבון עם המייל הזה. אפשר להיכנס איתו.';
  }
  if (text.includes('password') && text.includes('6')) return 'הסיסמה קצרה מדי — לפחות 6 תווים.';
  if (text.includes('rate limit') || text.includes('too many')) return 'יותר מדי ניסיונות. נסו שוב בעוד דקה.';
  if (text.includes('signups not allowed') || text.includes('signup is disabled')) {
    return 'פתיחת חשבונות חדשים כבויה כרגע בהגדרות. פנו למי שהקים את המערכת.';
  }
  return friendlyMessage(new Error(raw), 'לא הצלחנו להשלים את הפעולה. נסו שוב.');
}
