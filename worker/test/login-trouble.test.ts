/*
 * THE SCREEN THAT WAS REFUSED AND DID NOT KNOW WHY.
 *
 * A screenshot: the owner's email, his password, and
 *
 *     "לא הצלחנו להשלים את הפעולה. נסו שוב."
 *
 * That was the FALLBACK of the old authMessage() — the ending reached when six
 * substring matches all missed. So it was provably not a wrong password, not an
 * unconfirmed address and not a rate limit, because each of those had a
 * sentence of its own. It was one of the failures nobody had written a line
 * for: a paused project, a project over its quota, a key the gateway no longer
 * accepts, email logins switched off. Every one of them is somebody else's to
 * fix, and the screen's advice was "try again" — the one move that cannot work.
 *
 * What this file holds, in order of how badly each one hurt:
 *
 *   1. NOTHING IS SWALLOWED. The ending that recognises nothing still reports
 *      the code, the status and the server's own words. There is no branch that
 *      returns a sentence a person cannot act on.
 *   2. The ordering that has bitten this product twice — an unconfirmed address
 *      reported as a wrong password — stays as it is.
 *   3. `code` beats `status` beats prose. A 401 carrying 'invalid_credentials'
 *      is a wrong password, not a broken key, and a 500 is never read as one.
 *   4. The key is sent and never shown.
 *
 * These are executed, not grepped: the classifier runs against the shapes
 * supabase-js actually constructs (see node_modules/@supabase/auth-js/dist/
 * module/lib/fetch.js — handleError), and the connection check runs against a
 * fetch that records what it was handed.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { signInTrouble, type Blame } from '../../src/lib/social/auth-trouble';
import { checkConnection, projectRef, verdictText, type ConnectionVerdict } from '../../src/lib/social/connection-check';

let checks = 0;
const is = (cond: unknown, msg: string) => { checks += 1; assert.ok(cond, msg); };
const eq = (a: unknown, b: unknown, msg: string) => { checks += 1; assert.deepEqual(a, b, msg); };

const read = (p: string) => readFileSync(new URL(p, import.meta.url), 'utf8');
/* Pins run on comment-stripped source. Three guards in this suite have already
   passed by matching the prose that explains them. */
const code = (s: string) => s.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

const auth = read('../../src/lib/social/auth.ts');
const login = read('../../src/app/social/login/page.tsx');
const trouble = read('../../src/lib/social/auth-trouble.ts');
const checker = read('../../src/lib/social/connection-check.ts');

/* The sentence in the screenshot. It is the one string this whole file exists
   to make unreachable, so it is also the one string that may not come back. */
const DEAD = 'לא הצלחנו להשלים את הפעולה';

/* ======================================================= 1. nothing is swallowed */

/*
 * THE ASSERTION THAT WOULD HAVE CAUGHT IT. An error nobody wrote a rule for —
 * which is what every one of the real causes was — must still produce a
 * sentence containing what the server said. Not "try again".
 */
{
  const t = signInTrouble({ message: 'Something no rule in this file has ever seen', status: 418, code: 'teapot' });
  eq(t.blame, 'unknown', 'an unrecognised refusal is reported as unrecognised, not dressed up as anything else');
  is(t.message.includes('Something no rule in this file has ever seen'), 'and the server’s own words reach the screen — this is the line whose absence cost a morning');
  is(t.message.includes('teapot') && t.message.includes('418'), 'with the code and the status, which are the two things worth reading down a telephone');
  is(!t.message.includes(DEAD), 'and never the sentence that said nothing');
  is(t.detail.includes('teapot') && t.detail.includes('HTTP 418'), 'the technical tail carries both as well, for the screen to print on its own line');
}

/* An error object with nothing in it at all — a catch block, a rejected
   promise, a shape nobody predicted. It must still be a sentence. */
for (const empty of [{}, null, undefined, 0, '', [], new Error('')]) {
  const t = signInTrouble(empty);
  is(t.message.length > 20, `a refusal carrying ${JSON.stringify(empty)} still produces a real sentence`);
  is(!t.message.includes('undefined') && !t.message.includes('NaN'), 'and never leaks a missing value into the Hebrew');
  is(!t.message.includes(DEAD), 'and is not the dead sentence');
}
eq(signInTrouble({}).detail, '', 'an error with nothing to report reports nothing, rather than "undefined · HTTP 0"');

/* Every branch must say something a person can act on. Measured, not asserted
   by eye: a message shorter than this is a shrug. */
const EVERY: { name: string; err: unknown; blame: Blame }[] = [
  { name: 'unconfirmed address', err: { message: 'Email not confirmed', status: 400, code: 'email_not_confirmed' }, blame: 'you' },
  { name: 'wrong password', err: { message: 'Invalid login credentials', status: 400, code: 'invalid_credentials' }, blame: 'you' },
  { name: 'email already taken', err: { message: 'User already registered', status: 422, code: 'email_exists' }, blame: 'you' },
  { name: 'no such account', err: { message: 'User not found', status: 404, code: 'user_not_found' }, blame: 'you' },
  { name: 'weak password', err: { message: 'Password should be at least 6 characters', status: 422, code: 'weak_password' }, blame: 'you' },
  { name: 'rejected address', err: { message: 'Email address "x@y" is invalid', status: 400, code: 'email_address_invalid' }, blame: 'you' },
  { name: 'validation', err: { message: 'missing email or phone', status: 400, code: 'validation_failed' }, blame: 'you' },
  { name: 'rate limited', err: { message: 'Request rate limit reached', status: 429, code: 'over_request_rate_limit' }, blame: 'wait' },
  { name: 'signup disabled', err: { message: 'Signups not allowed for this instance', status: 422, code: 'signup_disabled' }, blame: 'settings' },
  { name: 'email logins off', err: { message: 'Email logins are disabled', status: 422, code: 'email_provider_disabled' }, blame: 'settings' },
  { name: 'banned account', err: { message: 'User is banned', status: 400, code: 'user_banned' }, blame: 'settings' },
  { name: 'captcha', err: { message: 'captcha protection: request disallowed', status: 400, code: 'captcha_failed' }, blame: 'settings' },
  { name: 'bad api key', err: { message: 'Invalid API key', status: 401 }, blame: 'project' },
  { name: 'bad jwt', err: { message: 'invalid claim', status: 401, code: 'bad_jwt' }, blame: 'project' },
  { name: 'auth database down', err: { message: 'Database error querying schema', status: 500, code: 'unexpected_failure' }, blame: 'project' },
  { name: 'html instead of json', err: { message: `Unexpected token '<', "<!DOCTYPE "... is not valid JSON`, status: 0 }, blame: 'project' },
  { name: 'no connection', err: { message: 'Failed to fetch', status: 0 }, blame: 'network' },
];
for (const c of EVERY) {
  const t = signInTrouble(c.err);
  eq(t.blame, c.blame, `${c.name} is blamed on "${c.blame}"`);
  is(t.message.length >= 18, `${c.name} gets a real sentence, not a shrug`);
  is(/[֐-׿]/.test(t.message), `${c.name} answers in Hebrew — the person reading this screen does not read GoTrue’s English`);
  is(!t.message.includes(DEAD), `${c.name} is not answered with the sentence that said nothing`);
}

/*
 * AND NO TWO CLASSES SHARE A SENTENCE. Distinct causes reading identically is
 * how "try again" happened in the first place: one message doing the work of
 * seven tells you which seven it cannot be.
 */
{
  const seen = new Map<string, string>();
  for (const c of EVERY) {
    const m = signInTrouble(c.err).message;
    /* 'validation' interpolates its detail, so compare the stable prefix. */
    const key = m.slice(0, 40);
    is(!seen.has(key), `"${c.name}" does not reuse the sentence already given to "${seen.get(key)}"`);
    seen.set(key, c.name);
  }
}

/* Every "not your fault" class leads with exactly that, because the owner's
   next move otherwise is to retype a password that was always correct. */
for (const c of EVERY.filter((x) => x.blame === 'settings' || x.blame === 'project')) {
  is(
    signInTrouble(c.err).message.startsWith('זה לא המייל ולא הסיסמה'),
    `${c.name} says up front that the details are not the problem`,
  );
}
/* And no class that IS the person's says it. */
for (const c of EVERY.filter((x) => x.blame === 'you')) {
  is(!signInTrouble(c.err).message.includes('זה לא המייל ולא הסיסמה'), `${c.name} does not tell somebody their correct details are fine when they are not`);
}

/* ================================================== 2. the ordering that bit twice */

/*
 * AN UNCONFIRMED ADDRESS IS NOT A WRONG PASSWORD. It arrives at the same form,
 * on the same 400, and told it is a wrong password it is retyped for ever.
 * desktop/main.ts keeps the same order; this is the web half of it.
 */
is(
  signInTrouble({ message: 'Email not confirmed', status: 400 }).message.includes('לאשר את המייל'),
  'an unconfirmed address is recognised from its prose alone, on a response carrying no code at all',
);
{
  const m = code(trouble);
  const confirm = m.indexOf("'email_not_confirmed'");
  const invalid = m.indexOf("'invalid_credentials'");
  is(confirm > -1 && invalid > -1, 'both tests still exist — an ordering assertion against a missing test passes on nothing');
  is(confirm < invalid, 'and the unconfirmed address is still checked FIRST, which is the bug this product shipped twice');
}

/* ========================================= 3. code beats status beats the prose */

/*
 * THE TRAP IN RULE 12. "Invalid API key" is a 401 with no code, so the rule
 * that catches it keys on a codeless 401 — and older GoTrue answered a wrong
 * password with 401 too. If that rule ran first, every wrong password in the
 * product would read as "our key is broken".
 */
eq(
  signInTrouble({ message: 'Invalid login credentials', status: 401, code: 'invalid_credentials' }).blame,
  'you',
  'a 401 that CARRIES invalid_credentials is a wrong password — the code decides, not the status',
);
eq(
  signInTrouble({ message: 'Invalid API key', status: 401 }).blame,
  'project',
  'and a codeless 401 is the gateway refusing the site’s key, which no password can fix',
);
/*
 * AND THE SHAPE THAT MAKES THE ORDER LOAD-BEARING. auth-js only reads `code`
 * off a response carrying an api-version header of 2024-01-01 or later
 * (handleError in auth-js/lib/fetch.js); anything older — a self-hosted GoTrue,
 * a gateway that strips the header — hands over a 401 with no code and the
 * prose alone. Read by the key rule, that is "our key is broken" printed at
 * somebody who simply mistyped their password. The credential rules run first,
 * and this is the only assertion that proves they do.
 */
for (const shape of [
  { message: 'Invalid login credentials', status: 401 },
  { message: 'Email not confirmed', status: 401 },
  { message: 'User already registered', status: 401 },
]) {
  eq(signInTrouble(shape).blame, 'you', `a codeless 401 saying "${shape.message}" is still read from its prose, not as a broken key`);
  is(!signInTrouble(shape).message.includes('NEXT_PUBLIC'), 'and is never answered with a variable to change in Vercel');
}
is(
  signInTrouble({ message: 'Invalid API key', status: 401 }).message.includes('NEXT_PUBLIC_SUPABASE_ANON_KEY'),
  'and it names the variable to change and where, because this product has already lost a night to two project references',
);

/*
 * EVERY SERVER-SIDE STATUS auth-js can hand over, including Cloudflare's. A
 * paused project, a project over quota and an unreachable auth database are
 * indistinguishable from a phone and all three are answered the same way:
 * check the project, it is not you.
 */
for (const status of [500, 501, 502, 503, 504, 520, 521, 522, 530, 540, 599]) {
  const t = signInTrouble({ message: 'Service Unavailable', status });
  eq(t.blame, 'project', `HTTP ${status} is read as the project being down`);
  is(t.message.includes('מושהה') || t.message.includes('מכסה'), `HTTP ${status} names the two causes that actually produce it`);
}
/* 'Database error querying schema' arrives on a 500 — and also, on some
   deployments, on a 400. The prose has to carry it either way. */
eq(signInTrouble({ message: 'Database error querying schema', status: 400 }).blame, 'project', 'a database error is the project’s even when it arrives on a 400');

/* A fetch that never got an answer carries status 0 — which must not read as
   "fine", and must not read as a 500 either. */
{
  const t = signInTrouble({ message: 'Failed to fetch', status: 0 });
  eq(t.blame, 'network', 'a request that never arrived is the connection, not the project');
  is(t.message.includes('אין חיבור'), 'and it reuses the one connectivity sentence this product already owns, rather than inventing a second');
}
/* …but a parse failure also carries 0, and it is NOT the network. */
eq(
  signInTrouble({ message: `Unexpected token '<', "<!DOCTYPE "... is not valid JSON` }).blame,
  'project',
  'a body that is not JSON means the address answered with a web page — a wrong URL, not a dropped connection',
);
is(
  signInTrouble({ message: 'Unexpected end of JSON input' }).message.includes('NEXT_PUBLIC_SUPABASE_URL'),
  'and it names the variable that is wrong',
);

/* An over_* code with no status, and a bare 429 with no code. Both are the
   same answer, and both have to stay reachable. */
for (const err of [{ code: 'over_email_send_rate_limit', message: 'email rate limit exceeded' }, { message: 'Too many requests', status: 429 }]) {
  eq(signInTrouble(err).blame, 'wait', `${JSON.stringify(err)} is a limit that lifts by itself`);
}

/* ================================================ 4. the key is sent, never shown */

eq(projectRef('https://atcsfvkulltkaadanplv.supabase.co'), 'atcsfvkulltkaadanplv', 'the project reference is the subdomain');
eq(projectRef('https://atcsfvkulltkaadanplv.supabase.co/'), 'atcsfvkulltkaadanplv', 'a trailing slash is not part of it');
eq(projectRef('db.example.com'), 'db.example.com', 'a custom domain is legitimate and is reported whole');
for (const nothing of ['', '   ', undefined as unknown as string]) {
  eq(projectRef(nothing), '', `an unset NEXT_PUBLIC_SUPABASE_URL (${JSON.stringify(nothing)}) reads as "not configured", not as a crash`);
}

const KEY = 'sb_publishable_THIS_MUST_NEVER_BE_RENDERED';
const URL_OK = 'https://proj1234.supabase.co';

type Call = { url: string; headers: Record<string, string> };
function fakeFetch(answer: { ok: boolean; status: number } | Error, log: Call[]) {
  return async (url: string, init?: { headers?: Record<string, string> }) => {
    log.push({ url, headers: init?.headers ?? {} });
    if (answer instanceof Error) throw answer;
    return answer;
  };
}

/* tsx compiles these tests to CJS, which has no top-level await. */
async function main() {

{
  const log: Call[] = [];
  const v = await checkConnection(URL_OK, KEY, fakeFetch({ ok: true, status: 200 }, log));
  eq(v, { kind: 'reachable', project: 'proj1234' }, 'a project that answers is reachable');
  eq(log.length, 1, 'and it costs exactly one request');
  eq(log[0].url, `${URL_OK}/auth/v1/health`, 'to the one endpoint that needs no account and still passes the gateway');
  eq(log[0].headers.apikey, KEY, 'with the key in the header, which is how the gateway gets to refuse it');
}

/* THE WHOLE POINT OF THE CHECK: these three are indistinguishable from the
   sign-in error alone, and the check tells them apart. */
for (const [status, kind] of [[401, 'bad-key'], [403, 'bad-key'], [500, 'project-down'], [503, 'project-down'], [404, 'project-down']] as const) {
  const v = await checkConnection(URL_OK, KEY, fakeFetch({ ok: false, status }, []));
  eq(v.kind, kind, `the check reads HTTP ${status} as ${kind}`);
}
eq(
  (await checkConnection(URL_OK, KEY, fakeFetch(new TypeError('Failed to fetch'), []))).kind,
  'unreachable',
  'a probe that throws answers "unreachable" — a diagnosis that can itself fail is one more thing to diagnose',
);
for (const [u, k] of [['', KEY], [URL_OK, '']] as const) {
  eq((await checkConnection(u, k, fakeFetch({ ok: true, status: 200 }, []))).kind, 'unconfigured', 'a site built without settings says so instead of probing nothing');
}

/*
 * AND NO VERDICT CARRIES THE KEY. Executed against the real key string, on
 * every ending, because "it is only in a header" is exactly the kind of claim
 * that stops being true in one edit.
 */
const ALL_VERDICTS: ConnectionVerdict[] = [
  { kind: 'unconfigured' },
  { kind: 'unreachable', project: 'proj1234' },
  { kind: 'bad-key', project: 'proj1234', status: 401 },
  { kind: 'project-down', project: 'proj1234', status: 503 },
  { kind: 'reachable', project: 'proj1234' },
];
for (const v of ALL_VERDICTS) {
  const text = verdictText(v);
  is(text.length > 30, `${v.kind} explains itself`);
  is(/[֐-׿]/.test(text), `${v.kind} answers in Hebrew`);
  is(!text.includes(KEY) && !text.includes('sb_publishable'), `${v.kind} never prints the key`);
  is(!JSON.stringify(v).includes(KEY), `${v.kind} does not carry the key in the verdict either`);
}
is(verdictText({ kind: 'bad-key', project: 'proj1234', status: 401 }).includes('הסיסמה שלכם בסדר'), 'a refused key says the password is fine, which is the one thing the person needs to hear');
is(verdictText({ kind: 'reachable', project: 'proj1234' }).includes('פרטי הכניסה'), 'and a healthy project points back at the details, because then that really is what is left');
for (const v of ALL_VERDICTS.filter((x) => x.kind !== 'unconfigured')) {
  is(verdictText(v).includes('proj1234'), `${v.kind} names which project it asked — "which database am I on" is a question this product has had to answer before`);
}

/* ===================================================== 5. the wiring, at the source */

/*
 * auth.ts MUST HAND OVER THE WHOLE ERROR. It passed error.message for a year,
 * which threw away `code` and `status` — the only two parts that are a
 * contract — and left the prose matching that produced the screenshot.
 */
{
  const a = code(auth);
  is(/signInTrouble\(error\)/.test(a), 'the classifier is given the whole error object');
  is(!/signInTrouble\(error\.message\)/.test(a), 'and not just its prose, which is where `code` and `status` used to be discarded');
  is(!/function authMessage/.test(a), 'the prose-matching mapper is gone rather than left beside its replacement');
  is(/blame: Blame; detail: string/.test(a), 'a refusal carries who can fix it and what the server said');
  /* Three refusals never reach the classifier — they are ours, raised before
     any request. They still have to carry a blame, or the screen cannot tell
     which half of its block to draw. */
  is(!/\{ ok: false, message:/.test(a), 'every refusal goes through refuse(), so none of them can forget the blame');
  is(/refuse\('project', NO_CLIENT\)/.test(a), 'a site with no Supabase settings is blamed on the project, not on the person typing');
  is(/refuse\('settings', NOT_ISOLATED\)/.test(a), 'and an unrepaired database is blamed on the settings');
}
/* Comments stripped first: this file QUOTES the dead sentence in its own
   header, and so does auth-trouble.ts, and a guard that matches its own
   explanation is the fourth time this suite has caught me writing one. */
is(
  !new RegExp(DEAD).test(code(auth) + code(login) + code(trouble) + code(checker)),
  'the sentence from the screenshot is nowhere in the sign-in path any more — only in the comments explaining why',
);
is(new RegExp(DEAD).test(trouble), 'and the story of it stays written down, because the next person to touch this will reach for prose matching again');

{
  const l = code(login);
  is(/trouble\.blame !== 'you' && trouble\.blame !== 'wait'/.test(l), 'the technical tail and the check are shown for the failures that are not the person’s, and withheld for the two that are');
  is(/\{trouble\.detail\}/.test(l), 'the server’s own words are printed, so a person can read them out without opening a console');
  is(/!error\.includes\(trouble\.detail\)/.test(l), 'and printed once: the unrecognised case already carries them inside its sentence');
  is(/dir="ltr"/.test(l.slice(l.indexOf('{trouble.detail}') - 400, l.indexOf('{trouble.detail}'))), 'and in LTR, because English in an RTL paragraph reorders its punctuation into nonsense');
  is(/onClick=\{runCheck\}/.test(l), 'the check is one press from the refusal');
  is(/checkConnection\(\s*process\.env\.NEXT_PUBLIC_SUPABASE_URL/.test(l), 'and it asks the project this build is actually configured against');
  is(!/\{process\.env\.NEXT_PUBLIC_SUPABASE_ANON_KEY\}/.test(l), 'the key is never rendered');
  is(/setTrouble\(null\)/.test(l) && /setVerdict\(''\)/.test(l), 'a new attempt clears the old diagnosis — a stale verdict beside a fresh error is worse than none');
  /* The classifier decides; the screen must not re-decide by reading Hebrew. */
  is(!/includes\('זה לא/.test(l), 'the screen never re-derives the blame by matching the Hebrew back');
}

console.log(`login trouble tests OK — ${checks} assertions`);

}

main().catch((e) => { console.error(e); process.exit(1); });
