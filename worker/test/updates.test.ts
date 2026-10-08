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


/* ====================================================================== *
 * AUTOMATIC ON THE CUSTOMER'S MACHINE, THE WAY IT ALWAYS WAS ON THE
 * OWNER'S.
 *
 * "כל פעם שאני עושה עדכון תוכנה , זה מנתקת את הלקוח - לא מתאים אני רוצה
 *  שזה יעבוד אצלו אוטמט בדיוק כמו אצלי !"
 *
 * Two different things were wrong and they compounded into one complaint.
 *
 * NOTHING INSTALLED WITHOUT A HUMAN. updates.ts downloaded by itself and then
 * waited for a button. Its advertised fallback — autoInstallOnAppQuit — is
 * unreachable in this app, which is built not to quit: closing the window
 * hides it to the tray and window-all-closed does not quit while keepRunning
 * is on. So a finished download could sit for days.
 *
 * AND THE INSTALL LOOKED LIKE A BREAKDOWN. The engine was killed and the
 * process replaced with nothing written anywhere, and the dashboard calls a
 * machine offline after ninety seconds of silence — so the owner watched a
 * customer's PC "disconnect", on a card whose only advice was to go and run a
 * file that does not exist on that machine.
 *
 * The owner's own machine has never had either problem, and not by luck: the
 * engine picks a clear moment, marks itself offline, and says so in the log.
 * These assertions are that the packaged path now does the same.
 * ====================================================================== */
{
  const updates = readFileSync(new URL('../../desktop/updates.ts', import.meta.url), 'utf8');
  const main = readFileSync(new URL('../../desktop/main.ts', import.meta.url), 'utf8');

  /* ---- 1. it installs itself, and only when told it is clear ---------- */
  is(/safeToInstall: \(waitedMs: number\) => Promise<\{ ok: boolean; why: string \}>/.test(updates), 'the updater asks whether now is a clear moment');
  is(/function waitForAClearMoment\(\)/.test(updates), 'and a finished download keeps asking rather than waiting for a press');
  is(/autoUpdater\.on\('update-downloaded'[\s\S]{0,900}waitForAClearMoment\(\);/.test(updates), 'the asking starts the moment the download finishes');
  is(/verdict = \{ ok: false, why: `לא הצלחתי לבדוק/.test(updates), 'A FAILED CHECK IS NOT PERMISSION — a machine that cannot say whether a post is going out is assumed to be sending one');
  is(/if \(!w\.autoEnabled\(\)\) return;/.test(updates), 'and "עדכונים אוטומטיים" off still means it waits to be asked — the one place a person can say "not by yourself"');

  /* ---- 2. the two rules, and only one of them ever relaxes ----------- */
  is(/\['publishing', 'awaiting_confirmation'\]/.test(main), 'THE HARD RULE: nothing in flight. A half-typed post costs a human a trip to Facebook to find out whether it went');
  is(/const busy = \(machines\.data \?\? \[\]\)\.some\(\(m\) => \(m as \{ current_job_id: string \| null \}\)\.current_job_id\);/.test(main), 'including a job claimed a moment ago whose row is not stamped yet — the engine’s own word for it');
  is(/const patient = waitedMs >= PATIENCE_MS;/.test(main), 'THE SOFT RULE relaxes with patience, because a thirty-second queue may never go quiet');
  const atFlight = main.indexOf('if ((flight.count ?? 0) > 0) return { ok: false');
  const atPatient = main.indexOf('const patient = waitedMs >= PATIENCE_MS;');
  is(atFlight >= 0 && atPatient >= 0, 'both the in-flight test and the patience line exist');
  is(atFlight < atPatient, 'and the hard rule is decided BEFORE patience is consulted, so no amount of waiting can override it');
  is(!/patient[\s\S]{0,400}publishing/.test(main), 'patience must never appear in the in-flight test at all');

  /* ---- 3. a restart that says it is a restart ------------------------- */
  is(/async function announceRestart\(\)/.test(main), 'the install announces itself before the process goes');
  is(/אין צורך לגעת במחשב/.test(main), 'in the same words the owner’s own machine already logs');
  is(/event: 'worker_self_update'/.test(main), 'under the same activity event, so the feed renders it with the icon it already has');
  is(/status: 'offline', attention_message: message/.test(main), 'and marks the engine offline WITH A REASON, so ninety seconds of silence is not read as a breakdown');
  /* Both offsets proved present FIRST. `indexOf` answers -1 for a line that
     is not there at all, and -1 is less than everything — so an ordering
     check on its own passes loudest exactly when the call it is about has
     been deleted. Same trap as in account-gap.test.ts, same fix. */
  const atAnnounce = main.indexOf('await announceRestart();');
  const atStop = main.indexOf('await stopWorkerAndWait();');
  is(atAnnounce >= 0, 'the install announces itself at all');
  is(atStop >= 0, 'and waits for the engine at all');
  is(atAnnounce < atStop, 'ANNOUNCED BEFORE THE KILL — afterwards there is no engine left to explain the gap');

  /* ---- 4. the installer does not race the engine out the door -------- */
  is(/function stopWorkerAndWait\(graceMs = 8_000\)/.test(main), 'the engine is waited for, not merely signalled');
  is(/child\.once\('exit', done\);/.test(main), 'on its real exit');
  is(/ממשיך בהתקנה בכל זאת/.test(main), 'but bounded — an install that never happens is worse than one that starts a second early');
  is(/await wiring\?\.beforeInstall\(\);/.test(updates), 'and the installer waits for all of that');
  is(/stopWaiting\(\);\s*set\(\{ message: 'מתקין/.test(updates), 'the poll is stopped first, so the button and the timer cannot both fire quitAndInstall');

  /* ---- 5. the owner's own machine is untouched ------------------------ */
  is(/SOCIAL_WORKER_MANAGED: '1',/.test(main), 'the engine is still told to leave updating alone inside the packaged shell');
  const selfUpdate = readFileSync(new URL('../self-update.ts', import.meta.url), 'utf8');
  is(
    /if \(process\.env\.SOCIAL_WORKER_MANAGED === '1'\) return \{ ready: false, problem: '', detail: '' \};/.test(selfUpdate),
    'and the git-checkout self-update is unchanged — one updater per program, and this change touched only the other one',
  );

  /* ---- 6. the hour, and why it is not six ---------------------------- */
  is(/const CHECK_EVERY = 60 \* 60 \* 1000;/.test(updates), 'it checks hourly — six hours was six hours of a customer looking stale on the owner’s screen');
  is(!/SIX_HOURS/.test(updates), 'and the old figure is gone rather than left beside the new one');

  /* ---- 7. nothing on screen tells a customer to run a file they have
   *         not got. The packaged app ships no .cmd at all. ------------- */
  const card = readFileSync(new URL('../../src/components/social/BrowserStatusCard.tsx', import.meta.url), 'utf8');
  const notice = card.slice(card.indexOf('{stale && ('), card.indexOf('{needsHuman && ('));
  is(notice.length > 100, 'the stale-version notice was located');
  is(!/start-worker\.cmd/.test(notice), 'THE STALE NOTICE NAMES NO FILE — on a customer’s machine there is none, and the same mistake is already recorded in self-update.ts');
  is(!/כל עשר דקות/.test(notice), 'and does not promise a ten-minute check, which is the git path’s figure and was never the packaged one');
  is(/ברגע שלא יוצא פרסום/.test(notice), 'it says what actually happens: it installs when no post is going out');
}

console.log(`update tests OK — ${checks} assertions`);
