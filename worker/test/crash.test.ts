/**
 * WHAT A CRASH REPORT MAY CONTAIN — and, far more important, what it may not.
 *
 * src/lib/social/crash.ts exists so the next "המסך הזה נתקע" can be looked up
 * instead of guessed at. It writes to social_activity_log, which is a table
 * the owner opens on his phone and which this product's own rules put out of
 * bounds for credentials: "אסור להכניס ללוגים: Passwords, Facebook tokens,
 * Secrets, Sensitive authentication data."
 *
 * An exception message is the likeliest place in this product for one to
 * appear — a failed fetch prints its URL, a Supabase client quotes the
 * request it made, an auth failure quotes the header it was handed. So the
 * redactor is tested the way a security control is tested: with the real
 * shapes, and with a check that it did not simply delete everything.
 */
import assert from 'node:assert/strict';
import { crashCode, crashLine, crashReport, redact, topFrame } from '../../src/lib/social/crash';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};

/* ----------------------------------------------- what must never survive */
{
  const jwt =
    'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJzdWIiOiIxMjM0NTY3ODkwIiwibmFtZSI6IkpvaG4ifQ.dBjftJeZ4CVPmB92K27uhbUJU1p1r_wW1gFWFOEjXk';
  const fbToken = 'EAAGm0PX4ZCpsBA1234567890abcdefghijklmnopqrstuvwx';

  const cases: [string, string][] = [
    [`Failed to fetch https://abcd.supabase.co/rest/v1/social_queue?apikey=${jwt}`, 'a Supabase apikey in a URL'],
    [`{"message":"JWT expired","token":"${jwt}"}`, 'a JWT in a JSON body'],
    [`Authorization: Bearer ${fbToken}`, 'a bearer header'],
    [`access_token=${fbToken}&expires_in=3600`, 'an OAuth query pair'],
    [`password=hunter2zzzz`, 'a password'],
    [`refresh_token: "${fbToken}"`, 'a refresh token'],
    [`sb-abcdefghijklmnopqrst-auth-token`, "Supabase's own cookie name"],
    [`session=${fbToken}; Path=/`, 'a session cookie'],
  ];

  for (const [raw, what] of cases) {
    const out = redact(raw);
    is(!out.includes(jwt), `THE JWT SURVIVED redaction of ${what}: ${out}`);
    is(!out.includes(fbToken), `THE FACEBOOK TOKEN SURVIVED redaction of ${what}: ${out}`);
    is(!out.includes('hunter2zzzz'), `the password survived redaction of ${what}: ${out}`);
  }

  /* The generic rule, stated on its own: any long opaque run goes, whatever
     it is called and whatever surrounds it. 24 characters is the floor. */
  is(redact('id=abcdefghijklmnopqrstuvwxyz0123').includes('[long]'), 'a 32-character opaque run was kept');
  is(!/[A-Za-z0-9_-]{24,}/.test(redact(`x ${fbToken} y`)), 'a long run survived in the middle of a sentence');
}

/* ------------------------------------- and what must survive, or it is useless */
{
  const typical = "Cannot read properties of null (reading 'media')";
  is(redact(typical) === typical, `the ordinary message was mangled: ${redact(typical)}`);
  is(redact('Failed to fetch').includes('Failed to fetch'), 'a bare fetch failure lost its words');
  is(redact('Minified React error #310').includes('#310'), 'a React error number was redacted away');
  /* Hebrew survives — every message this product writes itself is Hebrew. */
  is(redact('הפרסום נכשל: אין חיבור').includes('הפרסום נכשל'), 'a Hebrew message was redacted');
  /* The NAME of a secret stays, so the message still says what was wrong. */
  is(redact('access_token=abcdefgh').startsWith('access_token='), 'the key name went with the value');
}

/* ----------------------------------------------------------- the frame */
{
  const stack = [
    "TypeError: Cannot read properties of null (reading 'media')",
    '    at LibraryCard (/_next/static/chunks/app/social/library/page-9f2.js:12:3456)',
    '    at div',
    '    at main',
  ].join('\n');
  const frame = topFrame(stack);
  is(frame.startsWith('at LibraryCard'), `the first frame was not picked: ${frame}`);
  is(!frame.includes('at div'), 'more than one frame was kept');
  is(topFrame(undefined) === '', 'a missing stack did not produce an empty frame');
  is(topFrame('no frames here') === '', 'a stack with no frames produced something');
  is(topFrame(`Error\n    at x (https://site/a?${'t'.repeat(40)})`).includes('[') , 'a token inside a frame was not redacted');
}

/* ------------------------------------------------------------- the code */
{
  const err = Object.assign(new TypeError('boom'), { stack: 'TypeError: boom\n    at Foo (/a.js:1:2)' });
  const a = crashReport(err, '/social/library');
  const b = crashReport(err, '/social/library');
  is(a.code === b.code, 'the same fault produced two different codes');
  is(/^[0-9A-F]{6}$/.test(a.code), `the code is not six hex characters: ${a.code}`);

  /* A different ROUTE is a different report — the same TypeError on two
     screens is two bugs to look at, not one. */
  is(crashReport(err, '/social/campaigns').code !== a.code, 'the route does not take part in the code');

  /* But a different MESSAGE is not: an id or a count in the text would give
     one bug a new code on every occurrence, and the owner could never say
     "it did it again". */
  const withId = Object.assign(new TypeError('boom for 9f2c-41'), { stack: err.stack });
  is(crashReport(withId, '/social/library').code === a.code, 'the message takes part in the code, so one fault has many codes');
}

/* --------------------------------------------------- the shape that is stored */
{
  const r = crashReport('a bare string was thrown', '/social');
  is(r.name === 'Error', `a thrown string reported its class as ${r.name}`);
  is(r.message.includes('a bare string'), 'a thrown string lost its text');
  is(r.frame === '', 'a thrown string invented a stack frame');

  const r2 = crashReport(null, '/social');
  is(typeof r2.code === 'string' && r2.code.length === 6, 'a thrown null produced no code');

  const long = crashReport(new Error('x'.repeat(5000)), '/social');
  is(long.message.length <= 300, `the stored message is ${long.message.length} characters`);

  const line = crashLine(r);
  is(line.includes('/social') && line.includes(r.code), 'the activity line names neither the screen nor the code');
  is(line.length < 400, 'the activity line is too long for a list the owner reads');
}

/* ------------------------------- crashCode is pure, and used by both callers */
{
  const one = crashCode({ name: 'TypeError', frame: 'at X', route: '/a' });
  const two = crashCode({ name: 'TypeError', frame: 'at X', route: '/a' });
  is(one === two, 'crashCode is not deterministic');
  is(crashCode({ name: 'RangeError', frame: 'at X', route: '/a' }) !== one, 'the error class does not take part in the code');
}

console.log(`crash-report tests OK — ${checks} assertions`);
