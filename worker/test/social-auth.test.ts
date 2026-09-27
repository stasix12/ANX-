/*
 * THE DOOR /social NEVER HAD — and the ways a door locks the wrong person out.
 *
 * Until now the only way in was /crm/login. Same origin, same Supabase client,
 * so the CRM's session held the publishing app open. That works for the one
 * person who has a CRM and is impossible for a customer, who has no account
 * and nowhere to make one.
 *
 * Adding a gate to a dashboard somebody already depends on is the risky half,
 * and "the owner was thrown out of their own screen by a slow network" is the
 * failure most of the invariants below prevent.
 *
 * THIS FILE ONCE SAID THE OTHER FAILURE COULD NOT HAPPEN. The sentence was:
 * a stranger getting in is not the failure that matters, because row-level
 * security has decided that since v16 and decides it whether this code runs or
 * not. Every word about v16 was true. The conclusion was false, because v16
 * had never taken on the live database — it skips itself while any row has no
 * business, which was every row — and the first account opened through the
 * signup page saw the owner's groups, posts and Facebook profile.
 *
 * A test file that asserts something cannot happen is worth less than nothing
 * once it has. So section 5 now pins the check that catches it.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const is = (cond: unknown, msg: string) => { checks += 1; assert.ok(cond, msg); };

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
const gate = read('../../src/components/social/SocialGate.tsx');
const login = read('../../src/app/social/login/page.tsx');
const auth = read('../../src/lib/social/auth.ts');
const shell = read('../../src/components/social/SocialShell.tsx');
const layout = read('../../src/app/social/layout.tsx');

/* ------------------------------------------------ 1. it never throws you out */
is(
  /if \(open \|\| loading \|\| session\) return;/.test(gate),
  'the redirect fires only once the session has RESOLVED — `loading` is not "logged out", and treating it as such logs the owner out on every slow connection',
);
is(
  /if \(loading \|\| !session\)/.test(gate) && /animate-spin/.test(gate),
  'and while it resolves the screen waits, rather than flashing a dashboard it is about to take away',
);

/* ------------------------------------------------- 2. the door is never gated */
is(/pathname === '\/social\/login'/.test(gate), 'the login screen itself must be exempt, or there is nowhere to knock');
is(/if \(open\) return <>\{children\}<\/>;/.test(gate), 'and it renders without waiting for a session it is there to create');

/* ---------------------------------------------- 3. `next` cannot leave the app */
is(
  /next\.startsWith\('\/social'\)/.test(login),
  'the post-login destination must be checked — an unchecked `next` is how three lines of redirect become an open redirect',
);

/* ----------------------------------------- 4. one guard, and one door, not two */
is(
  !/crm\/login/.test(gate) && !/router\.replace\(`\/crm\/login/.test(shell),
  'nothing in the publishing module may send anybody to the CRM’s login — for a customer that is a different business entirely',
);
is(/window\.location\.href = '\/social\/login';/.test(shell), 'signing out lands on the door of the app you signed out of');
is(/<SocialGate>\{children\}<\/SocialGate>/.test(layout), 'the gate is in the layout — the one place every screen passes through');
/* Three screens (posts, posts/new, posts/[id]) render no SocialShell, which is
   exactly why the guard cannot live there. */
is(!/useSocialSession|router\.replace\(`\/social\/login/.test(shell), 'and the shell no longer keeps a second copy of it');

/* ------------------------------- 5. a workspace is claimed, and only ever one */
is(/social_claim_workspace/.test(auth), 'a new account gets its own business');
is(
  auth.indexOf('claimWorkspace') < auth.indexOf('export async function signInToSocial'),
  'claimed on SIGN-IN and not only on sign-up: with email confirmation on, signUp returns no session and there is no authenticated moment to claim in',
);
is(
  /if \(!data\.session\) return \{ ok: true, needsEmailConfirm: true \};/.test(auth),
  'and that case is handled rather than assumed — guessing wrong shows a customer "welcome" while nothing works',
);
/* v19's function is idempotent server-side (it returns the caller's existing
   tenant), which is what makes calling it on every sign-in safe for the owner. */
is(!/insert into|createTenant/.test(auth), 'the client never creates a business itself — that decision is the database’s');

/* ------------------------------------------ 6. the app still refuses to sign up */
{
  const desktop = read('../../desktop/main.ts');
  is(
    /shouldCreateUser: false/.test(desktop),
    'the desktop app still will not create accounts — signing up belongs where a person can read what they are agreeing to, and that place now exists',
  );
}

/* ------------------------- 6b. and it verifies, on the one account it can     */
/*                                                                             */
/* A brand-new workspace holds no groups. So the count of groups this account   */
/* can see, in the second after its workspace was made, is a complete answer to */
/* "are the access rules on" — and the only moment the answer is free of the    */
/* owner's own data. These four hold that check in place.                       */
is(
  /seesSomebodyElsesData/.test(auth),
  'sign-up asks whether the new account can see somebody else’s groups, instead of assuming the database is scoped',
);
is(
  /head: true/.test(auth),
  'and it asks for the COUNT — a leak check that downloads the leaked rows to count them is not much of one',
);
is(
  /if \(!claimed \|\| leaking\) \{\s*await supabase\.auth\.signOut\(\);/.test(auth),
  'a failed claim or a visible foreign row signs the account back out — a session it must not use is worse than no session',
);
is(
  /if \(error\) return false;/.test(auth),
  'a query that ERRORS answers "no leak": a read that failed returned nothing, and refusing a customer over a dropped request locks out the person this file exists to let in',
);
/* The asymmetry is the point: the owner has to be able to sign in to a database
   that has not been repaired yet, because signing in is how they repair it. */
is(
  /Result ignored on purpose/.test(auth) &&
    auth.indexOf('Result ignored on purpose') < auth.indexOf('export async function signUpToSocial'),
  'SIGN-IN stays tolerant of a missing workspace — on an unrepaired database the owner is the one person who must still get in',
);
is(
  /const NOT_ISOLATED[\s\S]{0,200}החשבון נוצר/.test(auth),
  'and the refusal says the account WAS created, because it was — otherwise the next attempt answers "this email is taken" and contradicts us',
);

/* ------------------------------------------------- 7. it says what it is not */
is(/NOT A SECURITY BOUNDARY/.test(gate), 'the gate states plainly that RLS is the boundary, so nobody later mistakes it for one');

console.log(`social auth tests OK — ${checks} assertions`);
