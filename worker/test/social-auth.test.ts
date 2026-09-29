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

/* ------------------- 6c. and when it refuses somebody, it says why in Hebrew  */
/*                                                                             */
/* THE FIRST CUSTOMER WHO EVER USED THAT SCREEN WAS TOLD THE WRONG THING. He    */
/* had an account, he typed it correctly, and the app answered that his email   */
/* or password were wrong. Two separate failures reach that field and neither   */
/* is a typing mistake:                                                        */
/*                                                                             */
/*   * an address that was never confirmed — GoTrue answers "Email not          */
/*     confirmed", which went out as that English sentence behind a Hebrew      */
/*     prefix, to somebody who reads Hebrew;                                   */
/*   * a package built against a different Supabase project than the website —  */
/*     the account genuinely does not exist there, so the answer really IS      */
/*     "invalid login credentials", and the person retypes a correct password   */
/*     for ever.                                                               */
/*                                                                             */
/* Both now say what they are and what to do next, and the build below can no   */
/* longer produce the second one at all.                                       */
{
  const desktop = read('../../desktop/main.ts');
  const code = desktop.replace(/\/\*[\s\S]*?\*\//g, '');

  is(/function authTrouble\(/.test(code), 'one place maps a rejected sign-in to a sentence, rather than three handlers each guessing');
  for (const handler of ["auth:password", "auth:otp-send", "auth:otp-verify"]) {
    /*
     * Cut at the NEXT handler, not at a fixed number of characters. A 900-byte
     * window from 'auth:otp-send' reached into 'auth:otp-verify' and found ITS
     * call, so this loop passed while otp-send was printing English again. A
     * guard that reads its neighbour's homework is worse than none.
     */
    const from = code.indexOf(`'${handler}'`);
    const next = code.indexOf('ipcMain.handle(', from + 1);
    const body = code.slice(from, next === -1 ? undefined : next);
    is(from !== -1 && body.length < 1500, `${handler} is still a handler of its own — this slice has to be one handler, or it proves nothing`);
    is(/authTrouble\(error\)/.test(body), `${handler} must go through it — the route a customer happens to try must not decide how clearly they are told`);
  }
  is(
    !/ההתחברות נכשלה: \$\{error\.message\}/.test(code.slice(0, code.indexOf('function authTrouble'))),
    'and no handler may still print GoTrue\u2019s English as its own answer',
  );

  const map = code.slice(code.indexOf('function authTrouble'), code.indexOf('ipcMain.handle(\'auth:password\''));
  /* Both orderings below compare indexOf against indexOf, and a string that is
     not there answers -1 — which is smaller than everything and would pass
     them on a file that had lost the check entirely. So the four are proved to
     exist first. */
  for (const needle of ["includes('not confirmed')", "includes('invalid login')", "includes('expired')", 'status === 401']) {
    is(map.includes(needle), `the mapping still tests ${needle} — an ordering assertion against a missing test passes on nothing`);
  }
  is(
    map.indexOf("includes('not confirmed')") < map.indexOf("includes('invalid login')"),
    'the unconfirmed address is checked FIRST, because it is the one that was being reported as a wrong password',
  );
  is(
    /CONFIRM_FIRST[\s\S]{0,400}קוד למייל/.test(desktop),
    'and its sentence names the way in that actually works — verifying a code by email confirms the address on the way through',
  );
  is(
    map.indexOf("includes('expired')") < map.indexOf('status === 401'),
    'a code that has run out is a 401 too, and calling THAT our fault leaves somebody waiting for us instead of asking for a new code',
  );
  is(
    /const OUR_FAULT[\s\S]{0,200}לא טעות שלכם/.test(desktop),
    'a key or an address this build carries that is not accepted must not be worded as a typing mistake',
  );
  is(
    /NO_ACCOUNT[\s\S]{0,300}צור חשבון חדש/.test(desktop),
    'and "there is no such account" points at the website, which is the only place one can be opened',
  );
  /* The raw text is worth keeping — it is the one thing worth having when a
     customer telephones — and it belongs in the technical log, which nobody is
     shown by accident. GoTrue's messages carry no password and no token. */
  is(/say\(`ההתחברות נדחתה: \$\{error\.message\}/.test(desktop), 'the English original is logged rather than lost');
}

/* --------------- 6d. the installer cannot point at another database at all    */
/*                                                                             */
/* An account is made on the website. If the package were assembled against a   */
/* different Supabase project, that account would not exist in the one the      */
/* program asks — and every customer would be told their details are wrong      */
/* while typing them perfectly. That is not a hypothetical: it is what a        */
/* customer sat in front of, signing in to the website successfully on one      */
/* screen and being refused by the program on the other.                        */
/*                                                                             */
/* THE FIRST VERSION OF THIS CHECK COMPARED AGAINST THE WRONG THING. It read    */
/* the literal in deploy.yml — which publishes to GitHub Pages. The site        */
/* customers use is built by Vercel from variables kept in Vercel, which        */
/* nothing in this repository can see, so the comparison could pass while the   */
/* two were on different databases. A guard that answers a question nobody      */
/* asked is worse than none, because its green tick gets believed.              */
/*                                                                             */
/* So the build asks PRODUCTION, and production is able to answer.              */
{
  const flow = readFileSync(new URL('../../.github/workflows/build-app.yml', import.meta.url), 'utf8');
  const version = readFileSync(new URL('../../src/app/api/version/route.ts', import.meta.url), 'utf8');

  is(
    /db: project/.test(version) && /NEXT_PUBLIC_SUPABASE_URL/.test(version),
    'the live site reports which database it is on, so the question can be asked from outside a browser',
  );
  /* Comments stripped first. The prose in that file says "never the key", and
     a search that matches its own explanation is the third time this suite has
     caught me doing that. */
  is(
    !/ANON|KEY/i.test(version.replace(/\/\*[\s\S]*?\*\//g, '').replace(/NEXT_PUBLIC_SUPABASE_URL/g, '')),
    'and it reports the project reference ONLY — the anon key is public by design and still has no business in an endpoint whose job is diagnosis',
  );
  is(/api\/version/.test(flow), 'the installer build asks the live site rather than a file in this repository');
  /*
   * AND IT CARRIES NO DEFAULT OF ITS OWN. For an hour it fell back to the
   * literals in deploy.yml when the secrets were unset — pointing every
   * installer at a project where no customer's account exists, which is the
   * exact bug. A wrong default turns "not configured" into "configured
   * incorrectly", and only one of those announces itself.
   */
  is(
    !/kadiiszpmuboawssdhfy|sb_publishable_/.test(flow),
    'and it hardcodes no database of its own — the only correct values are the ones Vercel holds, which this repository cannot see',
  );
  /*
   * AND NEITHER DOES ANY OTHER WORKFLOW. The literal the installer build
   * trusted was not its own: it was copied from deploy.yml, where it had sat
   * unnoticed while the live site moved to a different project. One stale
   * string in a file nobody reads became a package that refused a paying
   * customer's correct password. There is now exactly one place in this
   * repository that says which database is in use, and it is the secrets.
   */
  for (const name of ['deploy.yml', 'setup-adsignal.yml']) {
    const other = readFileSync(new URL(`../../.github/workflows/${name}`, import.meta.url), 'utf8');
    is(
      !/[a-z]{20}\.supabase\.co/.test(other.replace(/#[^\n]*/g, '')) && !/sb_publishable_[A-Za-z0-9_-]+/.test(other),
      `${name} names no database of its own either — a second answer to "which project" is how the first one went stale unnoticed`,
    );
  }
  is(
    /throw "This installer asks a DIFFERENT database than the live dashboard/.test(flow),
    'and a package that would ask a different database fails the build — an installer that reaches a customer and refuses their correct password is the worst of the endings',
  );
  is(
    /::warning::could not reach/.test(flow),
    'a site that did not answer is a WARNING and not a pass: a run that skipped the check must not read like a run that passed it',
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
