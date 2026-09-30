/*
 * WHAT A PERSON IS TOLD WHEN THE UPDATE CHECK FAILS.
 *
 * This looks like the least important test in the repository and it exists
 * because of a real bug that shipped past a typecheck, a build and a manual
 * read of the code.
 *
 * The first version of this mapping matched node's error codes — ECONNREFUSED
 * and friends. Electron does not use node's network stack. It uses Chromium's,
 * which reports net::ERR_CONNECTION_REFUSED: a different string that the node
 * pattern does not match at all. So a machine with no internet, which is the
 * single most common reason this ever fails, was told:
 *
 *   לא הצלחנו לבדוק עדכונים (net::ERR_CONNECTION_REFUSED)
 *
 * — frightening, in English, and describing a problem the person cannot act
 * on. It was found by running the real module against a dead port, and nothing
 * short of that would have found it. This is the cheap version of that.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { readable } from '../../desktop/update-messages';

let checks = 0;
const is = (cond: unknown, msg: string) => { checks += 1; assert.ok(cond, msg); };

const OFFLINE = 'אין חיבור לאינטרנט כרגע. נבדוק שוב מאוחר יותר.';
const NO_RELEASE = 'עוד לא פורסמה גרסה להורדה. הכל תקין — פשוט אין מה לעדכן.';

/* Chromium's family. This is the one that was missing. */
for (const code of [
  'net::ERR_CONNECTION_REFUSED',
  'net::ERR_NAME_NOT_RESOLVED',
  'net::ERR_INTERNET_DISCONNECTED',
  'net::ERR_CONNECTION_TIMED_OUT',
  'net::ERR_NETWORK_CHANGED',
  'net::ERR_PROXY_CONNECTION_FAILED',
]) {
  is(readable(new Error(code)) === OFFLINE, `${code} is a person with no internet, and must read like one`);
}

/* Node's family, for the paths that do not go through Chromium. */
for (const code of ['ENOTFOUND', 'EAI_AGAIN', 'ENETUNREACH', 'EHOSTUNREACH', 'ETIMEDOUT', 'ECONNREFUSED', 'ECONNRESET']) {
  is(readable(new Error(`request to https://github.com failed, reason: ${code}`)) === OFFLINE, `${code} too`);
}

/* Before any release has been published there is no feed to read, and that is
   not a fault — it must not be dressed up as one. */
is(readable(new Error('HttpError: 404 Not Found')) === NO_RELEASE, 'a missing feed is "nothing to update to", not a failure');
is(
  readable(new Error('Cannot download "http://x/latest.yml", status 404: Not Found, net::ERR_HTTP_RESPONSE_CODE_FAILURE')) === NO_RELEASE,
  'and a 404 wrapped in a net:: error is still a 404 — telling somebody with a working connection that they have none is the wrong answer',
);

/* A build run out of a checkout. Normal during development, and the honest
   answer is the reason, not a red error. */
is(
  readable(new Error('Skip checkForUpdates because application is not packed and dev update config is not forced')).includes('הורצה מתוך הקוד'),
  'a development run says so plainly',
);
is(readable(new Error('ENOENT: no such file, open app-update.yml')).includes('הורצה מתוך הקוד'), 'so does a package with no feed baked in');

/* Everything else keeps the original text rather than inventing a diagnosis —
   an unrecognised failure the person can forward is worth more than a
   confident guess. */
const odd = readable(new Error('sha512 checksum mismatch'));
is(odd.includes('sha512 checksum mismatch'), 'an unfamiliar failure is passed through, not guessed at');
is(odd.startsWith('לא הצלחנו'), 'wrapped in Hebrew, so the screen is never half English');

/* It is handed whatever the library throws, which is not always an Error. */
is(typeof readable('net::ERR_CONNECTION_REFUSED') === 'string', 'a thrown string must not crash the screen');
is(readable('net::ERR_CONNECTION_REFUSED') === OFFLINE, 'and is read the same way');
is(typeof readable(undefined) === 'string', 'nor must nothing at all');


/*
 * THE FEED'S ADDRESS, NAMED THE SAME IN BOTH PLACES.
 *
 * electron-builder.yml decides what gets baked into every installed copy as
 * app-update.yml — the address a customer's PC will ask for the rest of its
 * life. build-app.yml decides where the release is uploaded, and whether the
 * build even bothers. Two files, one fact, and nothing in either one notices
 * when they stop agreeing.
 *
 * That is not hypothetical: the first feed repository was created by pasting a
 * URL into GitHub's name field, so what exists is called "https-github.com-new"
 * while both files said "hapitaron-updates". The build uploaded nothing, said
 * so in a warning nobody was watching for, and every installed copy went on
 * asking an address that does not exist — silently, for ever, which is the one
 * failure mode an update feed cannot have.
 *
 * So the two are compared rather than trusted. Renaming the repository stays a
 * one-line change; making it a one-line change in ONE of the two files fails
 * here instead of in three months.
 */
{
  const builder = readFileSync(new URL('../../electron-builder.yml', import.meta.url), 'utf8');
  const flow = readFileSync(new URL('../../.github/workflows/build-app.yml', import.meta.url), 'utf8');
  const owner = builder.match(/^\s*owner:\s*(\S+)\s*$/m)?.[1] ?? '';
  const repo = builder.match(/^\s*repo:\s*(\S+)\s*$/m)?.[1] ?? '';
  is(Boolean(owner && repo), 'electron-builder names the repository every installed copy will ask for updates');
  is(
    flow.includes(`${owner}/${repo}`),
    `the build publishes to the SAME place the package asks (${owner}/${repo}) — two files holding one fact must not drift`,
  );
  /* And no stale name left behind anywhere, which is how the drift starts. */
  is(
    !/hapitaron-updates/.test(builder + flow),
    'and no earlier name survives in either file — a leftover is the next silent mismatch',
  );
}

console.log(`update message tests OK — ${checks} assertions`);
