'use client';

import { supabase } from '@/lib/supabase';
import { signInTrouble, type Blame } from './auth-trouble';

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
 * THE SECURITY BOUNDARY IS ROW-LEVEL SECURITY, NOT THIS FILE — and this file
 * no longer assumes that boundary is switched on.
 *
 * It used to. The sentence that stood here said an anonymous visitor already
 * sees zero rows because v16 scopes every table to the caller's business. That
 * is true of v16 and it was false of this installation: v16 skips itself when
 * any row still has no business, it says so in a NOTICE nobody read, and the
 * database kept the rule it had when there was one human in it — `using
 * (true)`, everybody sees everything. The first account opened through the
 * signup page landed inside the owner's groups, posts and Facebook profile.
 *
 * So sign-up now CHECKS instead of trusting. A brand-new account that can see
 * a single group belonging to somebody else is not let into the dashboard, and
 * the check costs one HEAD request. It is a seatbelt, not the brakes: the fix
 * is supabase/social-tenant-repair.sql followed by supabase/social-latest.sql.
 * But a seatbelt that catches the one failure that already happened is worth
 * its one request.
 *
 * The session hook is the one in adminAuth.ts on purpose. It tracks the same
 * client and the same storage key, and a second copy of it here would be two
 * sources of truth for one session — the drift this codebase keeps paying for.
 */
export { useAdminSession as useSocialSession, signOut as signOutSocial } from '@/lib/adminAuth';

/*
 * A REFUSAL CARRIES WHO CAN FIX IT, not only a sentence.
 *
 * The login screen behaves differently for the two halves: a wrong password is
 * the person's to fix and needs nothing but the sentence, while everything else
 * is somebody else's and needs the technical tail and the offer of a connection
 * check. Deciding that on the screen by reading the Hebrew back would be the
 * worst possible place for it, so the classifier's own answer travels along.
 */
export type AuthOutcome =
  | { ok: true; needsEmailConfirm: boolean }
  | { ok: false; message: string; blame: Blame; detail: string };

const refuse = (blame: Blame, message: string, detail = ''): AuthOutcome => ({ ok: false, message, blame, detail });

const NO_CLIENT =
  'האתר הזה נבנה בלי הגדרות Supabase, ולכן אין לאן להתחבר. צריך להגדיר ב-Vercel את NEXT_PUBLIC_SUPABASE_URL ו-NEXT_PUBLIC_SUPABASE_ANON_KEY ואז Redeploy.';

/* Says the account was made, because it was — GoTrue created it before any of
   this ran, and a person told "we could not open an account" who then gets
   "this email is taken" has been told two contradictory things. */
const NOT_ISOLATED =
  'החשבון נוצר, אבל המערכת עדיין לא מוכנה למשתמשים נוספים — לא הכנסנו אתכם פנימה. פנו למי שהקים את המערכת ונסו להתחבר מאוחר יותר.';

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
 * ON SIGN-IN a failure here is deliberately not fatal. The person IS signed in;
 * what they are missing is a workspace, and the dashboard says so far better
 * than a login screen that refuses them for a reason they cannot act on. It
 * also matters that this stays tolerant: on a database where v19 has not run
 * the RPC does not exist, and the owner signing in to fix exactly that must
 * not be the person it locks out.
 *
 * ON SIGN-UP the caller treats the same failure as fatal, because the two
 * situations are not alike. See signUpToSocial.
 */
async function claimWorkspace(businessName: string): Promise<boolean> {
  if (!supabase) return false;
  /* The builder is thenable but not a Promise, so it has no .catch — awaited
     into one first. A missing function (v19 never ran) arrives as an error
     object rather than a throw, so both endings are read. */
  try {
    const { error } = await supabase.rpc('social_claim_workspace', { business_name: businessName });
    return !error;
  } catch {
    return false;
  }
}

/**
 * Can this brand-new account see a group that is not its own?
 *
 * Called in the one moment the answer is unambiguous: immediately after a
 * workspace was created for an account that did not exist a second ago. Such a
 * workspace has no groups in it — the RPC seeds settings and nothing else — so
 * ANY row coming back here came from somebody else's business, and the only
 * way that happens is a database whose access rules were never replaced.
 *
 * A failed query answers false, and that is not leniency. A read that errors
 * is a read that returned nothing, and a caller who cannot read cannot leak.
 * Refusing the sign-up over a dropped request would lock out the customer this
 * whole file exists to let in.
 *
 * head: true sends no rows over the wire — the count arrives in a header. The
 * question is how many, never which, and a leak check that itself downloads
 * the leaked rows would be a poor one.
 */
async function seesSomebodyElsesData(): Promise<boolean> {
  if (!supabase) return false;
  try {
    const { count, error } = await supabase
      .from('social_targets')
      .select('id', { count: 'exact', head: true });
    if (error) return false;
    return (count ?? 0) > 0;
  } catch {
    return false;
  }
}

export async function signInToSocial(email: string, password: string): Promise<AuthOutcome> {
  if (!supabase) return refuse('project', NO_CLIENT);
  const { error } = await supabase.auth.signInWithPassword({ email: email.trim(), password });
  /* The WHOLE error, not error.message: `code` and `status` are the only parts
     that are a contract, and reading the prose was how a paused project came
     out as "נסו שוב". See auth-trouble.ts. */
  if (error) {
    const t = signInTrouble(error);
    return refuse(t.blame, t.message, t.detail);
  }
  /* Result ignored on purpose — see claimWorkspace. */
  await claimWorkspace('');
  return { ok: true, needsEmailConfirm: false };
}

export async function signUpToSocial(email: string, password: string, businessName: string): Promise<AuthOutcome> {
  if (!supabase) return refuse('project', NO_CLIENT);
  const { data, error } = await supabase.auth.signUp({ email: email.trim(), password });
  if (error) {
    const t = signInTrouble(error);
    return refuse(t.blame, t.message, t.detail);
  }
  /*
   * TWO ENDINGS, and which one happens is a Supabase project setting nobody
   * here controls. With email confirmation off, signUp returns a session and
   * the person is already in. With it on, it returns a user and NO session,
   * and they have to open a link in their inbox first. Both are handled rather
   * than assumed, because guessing wrong means a customer staring at a screen
   * that says "welcome" while nothing works.
   */
  if (!data.session) return { ok: true, needsEmailConfirm: true };
  /*
   * FROM HERE THE ACCOUNT EXISTS AND IS SIGNED IN, and the only question left
   * is whether it is safe to show it a dashboard.
   *
   * Two ways it is not: the workspace could not be created (v19 missing, so
   * there is no tenancy at all), or it was created and the account can still
   * see another business's groups (v16 never took). Either one means the next
   * screen would be somebody else's data, so neither is survivable here.
   *
   * Signed back out rather than left half-in: an account holding a session it
   * must not use is worse than one holding none. The account itself is NOT
   * removed — deleting a person's account to recover from our own migration is
   * not this code's call, and they can sign in normally once the database is
   * repaired.
   */
  const claimed = await claimWorkspace(businessName.trim());
  const leaking = await seesSomebodyElsesData();
  if (!claimed || leaking) {
    await supabase.auth.signOut();
    return refuse('settings', NOT_ISOLATED);
  }
  return { ok: true, needsEmailConfirm: false };
}
