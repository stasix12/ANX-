/*
 * WHOSE MACHINE IS THIS, PINNED.
 *
 * Until now the worker knew who it was from two lines in .env.local: the
 * owner's own Supabase email and password — the same login that opens /crm
 * and every lead in it. That is the single reason a copy of this folder could
 * not be handed to anybody: however well it were packaged, what is inside it
 * is the owner's account.
 *
 * So the worker now holds a session it obtained itself, from a six-digit code
 * sent to the customer's own email. This file holds that to the promises it
 * has to keep, because every one of them fails silently:
 *
 *   * the owner's machine must behave EXACTLY as before — the env pair still
 *     wins, and nothing prompts;
 *   * no password is ever asked for here;
 *   * the session never lands inside the repository;
 *   * a session file that is corrupt, half-written or unreadable must mean
 *     "not signed in", never a crash and never a silent loss;
 *   * a worker started with no terminal — Windows at boot — must say so
 *     rather than hang on a prompt nobody can see.
 */
import assert from 'node:assert/strict';
import { existsSync, mkdtempSync, readFileSync, writeFileSync, statSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileSessionStorage, forgetSession } from '../session-store';
import { signInInteractively, tokenFrom, type Prompter } from '../sign-in';

let checks = 0;
const is = (cond: unknown, msg: string) => { checks += 1; assert.ok(cond, msg); };
const eq = (a: unknown, b: unknown, msg: string) => { checks += 1; assert.deepEqual(a, b, msg); };

const dir = mkdtempSync(path.join(tmpdir(), 'hapitaron-session-'));
const file = path.join(dir, 'session.json');

/* ---------------------------------------------------------------- storage */

const store = fileSessionStorage(file);
eq(store.getItem('anything'), null, 'a machine that has never signed in holds nothing');

store.setItem('sb-auth-token', JSON.stringify({ refresh_token: 'r1' }));
eq(JSON.parse(store.getItem('sb-auth-token')!).refresh_token, 'r1', 'what was written comes back');
is(existsSync(file), 'and it lands in the file it was given');

/* Not world-readable. On Windows this is close to a no-op and the test says
   so rather than asserting something that platform cannot promise. */
if (process.platform !== 'win32') {
  eq(statSync(file).mode & 0o077, 0, 'a refresh token must not be readable by other users on the machine');
}

/* A second key must not wipe the first — supabase-js writes more than one. */
store.setItem('sb-auth-token-code-verifier', 'v');
eq(JSON.parse(store.getItem('sb-auth-token')!).refresh_token, 'r1', 'writing a second key keeps the first');

store.removeItem('sb-auth-token-code-verifier');
is(store.getItem('sb-auth-token') !== null, 'and removing one keeps the other');
store.removeItem('sb-auth-token');
is(!existsSync(file), 'removing the last key takes the file with it, rather than leaving an empty husk');

/*
 * THE CORRUPT FILE. Half a write, a disk that filled up, a file somebody
 * opened in Notepad. It must read as "not signed in" — which sends the worker
 * to ask for a code — and never throw, because the throw would happen inside
 * createClient on a machine with nobody in front of it.
 */
for (const junk of ['', '{', 'null', '[]', '"a string"', '\u0000\u0000']) {
  writeFileSync(file, junk);
  eq(store.getItem('sb-auth-token'), null, `a session file containing ${JSON.stringify(junk)} means "not signed in"`);
}
/* And it is recoverable: the next successful sign-in simply overwrites it. */
writeFileSync(file, '{');
store.setItem('sb-auth-token', JSON.stringify({ refresh_token: 'r2' }));
eq(JSON.parse(store.getItem('sb-auth-token')!).refresh_token, 'r2', 'a corrupt file is replaced by the next sign-in, not treated as fatal');

forgetSession(file);
is(!existsSync(file), 'and "נתק את המחשב הזה" leaves nothing behind');

/* ------------------------------------------------- a code, or the whole link */
/*
 * Which of the two arrives is decided by one line in a Supabase email
 * template, and the DEFAULT is the link. Rejecting the link would stop the
 * very first customer with "the code is 6 digits" while they hold an email
 * containing no digits at all.
 */
eq(tokenFrom('123456'), { token: '123456' }, 'six digits are a code');
eq(tokenFrom('  12 34 56 '), { token: '123456' }, 'and spaces from a copy-paste do not break it');
eq(
  tokenFrom('https://abc.supabase.co/auth/v1/verify?token_hash=pkce_9f8e&type=email&redirect_to=https://x.y'),
  { tokenHash: 'pkce_9f8e' },
  'a pasted link gives up its token_hash',
);
eq(
  tokenFrom('https://x.y/welcome#token_hash=abc%2Bdef&type=email'),
  { tokenHash: 'abc+def' },
  'including from the fragment, and percent-decoded',
);
eq(tokenFrom('12345'), null, 'five digits are not a code');
eq(tokenFrom('1234567'), null, 'and neither are seven');
eq(tokenFrom('https://x.y/verify?type=email'), null, 'a link with no token in it is not a token');
eq(tokenFrom(''), null, 'and neither is nothing');

/* --------------------------------------------------------------- the flow */

function fakeClient(script: {
  send?: { error: { message: string } | null };
  verify?: ({ error: { message: string } | null; data: { session: unknown } })[];
}) {
  const sent: string[] = [];
  const tried: string[] = [];
  let n = 0;
  return {
    sent,
    tried,
    auth: {
      signInWithOtp: async ({ email, options }: any) => {
        sent.push(`${email}|shouldCreateUser=${options?.shouldCreateUser}`);
        return script.send ?? { error: null };
      },
      verifyOtp: async ({ token, token_hash, type }: any) => {
        tried.push(`${token ?? token_hash}|${type}`);
        return script.verify?.[n++] ?? { error: null, data: { session: {} } };
      },
    },
  } as any;
}

function scripted(answers: string[]): Prompter & { asked: string[] } {
  const asked: string[] = [];
  let i = 0;
  return {
    asked,
    question: async (text: string) => { asked.push(text); return answers[i++] ?? ''; },
    close: () => {},
  };
}

const realTTY = process.stdin.isTTY;
const quiet = console.log;
async function run(fn: () => Promise<void>) {
  (process.stdin as { isTTY?: boolean }).isTTY = true;
  console.log = () => {};
  try { await fn(); } finally { console.log = quiet; (process.stdin as { isTTY?: boolean }).isTTY = realTTY; }
}

void (async () => {
  /* The happy path, and the two things it must never do. */
  await run(async () => {
    const client = fakeClient({});
    const prompt = scripted(['customer@example.com', '123456']);
    await signInInteractively(client, prompt);
    eq(client.sent, ['customer@example.com|shouldCreateUser=false'],
      'signing in must not be able to CREATE an account — a typo would make a second empty one and say nothing');
    eq(client.tried, ['123456|email'], 'and the code goes straight through as an email OTP');
    is(!prompt.asked.some((q) => /סיסמ/.test(q)), 'no question here may ask for a password');
    is(prompt.asked.length === 2, 'two questions, asked once: an address and a code');
  });

  /* A wrong code is survivable, and the email is not asked for again. */
  await run(async () => {
    const client = fakeClient({ verify: [{ error: { message: 'Token has expired' }, data: { session: null } }, { error: null, data: { session: {} } }] });
    const prompt = scripted(['customer@example.com', '111111', '222222']);
    await signInInteractively(client, prompt);
    eq(client.tried, ['111111|email', '222222|email'], 'a mistyped code is retried without starting over');
    eq(client.sent.length, 1, 'and without sending a second email');
  });

  /* Malformed input never reaches the server. */
  await run(async () => {
    const client = fakeClient({});
    await signInInteractively(client, scripted(['not-an-email', 'customer@example.com', 'abc', '123456']));
    eq(client.sent.length, 1, 'a string with no @ is caught here, not sent to Supabase');
    eq(client.tried, ['123456|email'], 'and a code that is not six digits never becomes a request');
  });

  /* The default Supabase email: a link, pasted whole. */
  await run(async () => {
    const client = fakeClient({});
    await signInInteractively(client, scripted([
      'customer@example.com',
      'https://abc.supabase.co/auth/v1/verify?token_hash=pkce_77&type=email',
    ]));
    eq(client.tried, ['pkce_77|email'], 'a pasted link signs the machine in exactly as a code does');
  });

  /* Not signed up yet: the reason reaches the screen, and it does not loop for ever. */
  await run(async () => {
    const client = fakeClient({ send: { error: { message: 'Signups not allowed for otp' } } });
    await assert.rejects(
      () => signInInteractively(client, scripted(['a@b.com', 'a@b.com', 'a@b.com'])),
      /לא הצלחנו לחבר את המחשב/,
      'three refusals must end in an error, not an endless prompt',
    );
    eq(client.sent.length, 3, 'each attempt was a real attempt');
    checks += 1;
  });

  /* Started by Windows at boot, with no console: a prompt would look like a hang. */
  (process.stdin as { isTTY?: boolean }).isTTY = false;
  delete process.env.SOCIAL_WORKER_PROMPTABLE;
  await assert.rejects(
    () => signInInteractively(fakeClient({}), scripted([])),
    /אין חלון לשאול בו/,
    'a worker with no terminal must say it cannot ask, rather than wait for ever',
  );
  checks += 1;

  /*
   * The desktop app has no TTY either — it pipes the worker's input — but it
   * DOES have a person in front of a window. It says so, and only it can.
   */
  process.env.SOCIAL_WORKER_PROMPTABLE = '1';
  {
    const client = fakeClient({});
    console.log = () => {};
    await signInInteractively(client, scripted(['customer@example.com', '123456']));
    console.log = quiet;
    eq(client.tried, ['123456|email'], 'a window without a TTY must still be able to sign the machine in');
  }
  delete process.env.SOCIAL_WORKER_PROMPTABLE;
  (process.stdin as { isTTY?: boolean }).isTTY = realTTY;

  /* ------------------------------------------------- the owner is untouched */
  const db = readFileSync(new URL('../db.ts', import.meta.url), 'utf8');
  is(
    /if \(email && password\) \{[\s\S]{0,300}?signInWithPassword/.test(db),
    'the env pair must still win, so the machine that publishes today does not change at all',
  );
  /* Compared inside the function, not the file: the import of sign-in.ts sits
     at the top and would make any whole-file comparison say the opposite. */
  const body = db.slice(db.indexOf('export async function workerDb'));
  is(
    body.indexOf('signInWithPassword') < body.indexOf('await signInInteractively'),
    'and it must be tried FIRST — an owner who is already configured must never see a prompt',
  );
  is(/forgetSession\(\)/.test(db), 'a revoked session must be cleared, not retried for ever');
  is(/getUser\(\)/.test(db), 'and a stored session must be checked against the server, not merely parsed');

  /*
   * A FAILED CHECK IS NOT A REVOKED SESSION. The first installed build signed
   * in through the window, started the engine, and the engine asked for the
   * email again — because any getUser() failure at all wiped the session. A
   * dropped connection at 3am must not log out a machine that published all
   * week, on a machine with nobody in front of it.
   */
  is(
    /status >= 400 && status < 500/.test(db),
    'only the server refusing the session ends it — a 4xx, and not a timeout or a 500',
  );
  is(/status !== 429/.test(db), 'a rate limit is the server asking us to wait, not to sign out');
  is(
    /if \(!rejected\) \{[\s\S]{0,260}client = c;[\s\S]{0,40}return c;/.test(db),
    'and anything unclear keeps the session and carries on publishing',
  );
  is(
    /לא הצלחנו לאמת את החיבור מול השרת/.test(db) && /נדחה על ידי השרת/.test(db),
    'the two outcomes must read differently, because on screen they are the same silence',
  );
  is(
    /existsSync\(sessionFile\(\)\)/.test(db),
    'and "there is a file here but no account came out of it" must be said out loud — it is a bug in how the window and the engine share it, not a machine nobody has signed in on',
  );

  const envSrc = readFileSync(new URL('../env.ts', import.meta.url), 'utf8');
  is(!/required\('SOCIAL_WORKER_EMAIL'\)/.test(envSrc), 'the owner’s email may no longer be a hard requirement to start');
  is(/SOCIAL_WORKER_STATE_DIR/.test(envSrc) && /homedir\(\)/.test(envSrc),
    'and everything this machine remembers must live outside the repository, so a folder that gets copied carries no identity');

  const store2 = readFileSync(new URL('../session-store.ts', import.meta.url), 'utf8');
  is(/mode: 0o600/.test(store2), 'the session file is a credential and is written as one');
  is(/renameSync/.test(store2), 'and written through a rename, so a half-written file cannot sign the machine out');

  console.log(`sign-in tests OK — ${checks} assertions`);
})().catch((e) => { console.error(e); process.exit(1); });
