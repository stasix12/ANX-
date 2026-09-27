/*
 * THE DOOR /social NEVER HAD — and the ways a door locks the wrong person out.
 *
 * Until now the only way in was /crm/login. Same origin, same Supabase client,
 * so the CRM's session held the publishing app open. That works for the one
 * person who has a CRM and is impossible for a customer, who has no account
 * and nowhere to make one.
 *
 * Adding a gate to a dashboard somebody already depends on is the risky half.
 * The failure that matters is not "a stranger got in" — row-level security has
 * decided that since v16 and decides it whether this code runs or not. It is
 * "the owner was thrown out of their own screen by a slow network", and these
 * are the invariants that prevent it.
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

/* ------------------------------------------------- 7. it says what it is not */
is(/NOT A SECURITY BOUNDARY/.test(gate), 'the gate states plainly that RLS is the boundary, so nobody later mistakes it for one');

console.log(`social auth tests OK — ${checks} assertions`);
