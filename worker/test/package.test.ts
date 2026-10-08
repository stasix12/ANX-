/*
 * WHAT IS IN THE THING WE HAND SOMEBODY, PINNED.
 *
 * The package is built by copying a folder. That is the right way to build it
 * — what is not in dist/app cannot ship by accident — and it is also exactly
 * how a secret gets out: one `cpSync` of the wrong directory, one `.env.local`
 * picked up by a glob, and every customer has the service-role key, which
 * bypasses every policy v16 put in place.
 *
 * It would not fail anything. The app would work perfectly.
 *
 * So the built package is searched, byte by byte, for the things that must
 * never be in it. This test builds it first and then reads it, rather than
 * reading the build script and believing it.
 */
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

let checks = 0;
const is = (cond: unknown, msg: string) => { checks += 1; assert.ok(cond, msg); };

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');
const out = path.join(root, 'dist', 'app');

/* Built here, with a marker in the environment, so the test cannot pass by
   reading a stale folder somebody built by hand last week. */
const MARKER = `probe-${Date.now()}`;
execFileSync(process.execPath, [path.join(root, 'scripts', 'build-app.mjs')], {
  cwd: root,
  env: {
    ...process.env,
    NEXT_PUBLIC_SUPABASE_URL: `https://${MARKER}.supabase.co`,
    NEXT_PUBLIC_SUPABASE_ANON_KEY: 'anon-key-for-the-test',
    /* Exactly the secrets a developer's shell is likely to be holding when
       they run a build. Not one of them may reach the output. */
    SUPABASE_SERVICE_ROLE_KEY: 'SERVICE-ROLE-MUST-NOT-SHIP',
    SOCIAL_ENCRYPTION_KEY: 'ENCRYPTION-KEY-MUST-NOT-SHIP',
    SOCIAL_CRON_SECRET: 'CRON-SECRET-MUST-NOT-SHIP',
    SOCIAL_WORKER_EMAIL: 'owner@must-not-ship.example',
    SOCIAL_WORKER_PASSWORD: 'OWNER-PASSWORD-MUST-NOT-SHIP',
    /* The token that lets CI publish a release. It is a build-time credential
       and the package must never carry it — an installed copy reads a public
       feed and needs nothing to do so. */
    UPDATES_TOKEN: 'UPDATES-TOKEN-MUST-NOT-SHIP',
    GH_TOKEN: 'GH-TOKEN-MUST-NOT-SHIP',
  },
  stdio: 'pipe',
});

/*
 * THERE MUST BE NO `app/` DIRECTORY AT THE REPOSITORY ROOT.
 *
 * This is the one that took production down, and it is invisible: Next.js
 * looks for its pages in `app/` OR `src/app/`, and when both exist the root
 * one wins. This project keeps its pages in src/app. The desktop shell was put
 * in a folder called app/, so `next build` quietly built a site whose only
 * routes were /_not-found and an icon — it SUCCEEDED, printed no warning, and
 * every page of anx-ggyo.vercel.app answered 404 for two and a half hours.
 *
 * The folder is called desktop/ now. This assertion is here because nothing
 * else in the repository would ever have said so.
 */
{
  checks += 1;
  assert.ok(
    !existsSync(path.join(root, 'app')),
    'a folder called app/ at the root silently replaces src/app as the Next.js router and empties the whole site — the desktop shell lives in desktop/',
  );
  is(existsSync(path.join(root, 'src', 'app', 'page.tsx')), 'and the real pages are still where Next.js will find them');
}

/*
 * ELECTRON MUST NOT BE IN THE WEBSITE'S MANIFEST.
 *
 * It was, for about ninety minutes, and the live site served a 404 the whole
 * time: Vercel installs from this same package.json, electron's postinstall
 * pulls a few hundred megabytes of browser binary, and the production build
 * stopped completing. Nothing the website renders needs electron — only the
 * job that packages the desktop app does, and that job installs it itself
 * with --no-save. This is the guard that stops it coming back, because the
 * symptom appears nowhere near the change.
 */
{
  const manifest = JSON.parse(readFileSync(path.join(root, 'package.json'), 'utf8')) as {
    dependencies?: Record<string, string>;
    devDependencies?: Record<string, string>;
  };
  const named = Object.keys({ ...manifest.dependencies, ...manifest.devDependencies }).filter((n) => /^electron(-|$)/.test(n));
  checks += 1;
  assert.deepEqual(named, [], `electron must not be installed by the website's build — it is installed by .github/workflows/build-app.yml instead (found: ${named.join(', ')})`);
  const lock = readFileSync(path.join(root, 'package-lock.json'), 'utf8');
  is(!/"node_modules\/electron"/.test(lock), 'and it must not be in the lockfile either, which is what Vercel actually installs from');
}

is(existsSync(path.join(out, 'worker.cjs')), 'the build must produce the worker bundle');
is(existsSync(path.join(out, 'main.cjs')), 'and the window that starts it');
is(existsSync(path.join(out, 'config.json')), 'and the two public values it needs to reach Supabase');

/* Every file in the package, read as bytes. */
function walk(dir: string): string[] {
  return readdirSync(dir).flatMap((name) => {
    const full = path.join(dir, name);
    return statSync(full).isDirectory() ? walk(full) : [full];
  });
}
const files = walk(out);
is(files.length > 50, `the package must actually contain playwright-core (found ${files.length} files)`);

const FORBIDDEN = [
  'SERVICE-ROLE-MUST-NOT-SHIP',
  'ENCRYPTION-KEY-MUST-NOT-SHIP',
  'CRON-SECRET-MUST-NOT-SHIP',
  'owner@must-not-ship.example',
  'OWNER-PASSWORD-MUST-NOT-SHIP',
];
for (const file of files) {
  const body = readFileSync(file).toString('latin1');
  for (const secret of FORBIDDEN) {
    checks += 1;
    assert.ok(!body.includes(secret), `${path.relative(out, file)} contains ${secret} — the package must identify nobody`);
  }
}

/* And the two things that SHOULD be there are, so the scan above is not
   passing simply because the build produced nothing. */
const config = JSON.parse(readFileSync(path.join(out, 'config.json'), 'utf8'));
is(config.supabaseUrl.includes(MARKER), 'the public Supabase URL is baked in, from this build');
is(config.supabaseAnonKey === 'anon-key-for-the-test', 'and the anon key, which is public by design');
is(!('serviceRoleKey' in config) && !('password' in config), 'and nothing else');

/* No TypeScript, no repository, no website. If any of these appear, the build
   copied a directory it should not have. */
for (const forbidden of ['.env', '.env.local', '.git', 'src', 'tsconfig.json', 'next.config.mjs']) {
  is(!existsSync(path.join(out, forbidden)), `${forbidden} must not be in a package handed to a customer`);
}
is(!files.some((f) => f.endsWith('.ts') && !f.includes('node_modules')), 'no TypeScript source ships — the customer has no compiler');

/* The window must not carry the owner's own login through to the child.
   Quotes are matched loosely because the bundler normalises them. */
const main = readFileSync(path.join(out, 'main.cjs'), 'utf8');
const blanked = (name: string) => new RegExp(`${name}:\\s*(''|"")`).test(main);
is(
  blanked('SOCIAL_WORKER_EMAIL') && blanked('SOCIAL_WORKER_PASSWORD'),
  'and the shell must blank those two variables, so a developer running the app from their own machine cannot leak them into a customer build by habit',
);
is(/SOCIAL_WORKER_PROMPTABLE:\s*('1'|"1")/.test(main), 'the window must tell the worker there is somebody here to answer');
is(/ELECTRON_RUN_AS_NODE/.test(main), 'the worker runs on the same binary, so nothing needs Node.js installed');

/*
 * THE ENGINE MUST LIVE OUTSIDE THE ARCHIVE.
 *
 * electron-builder packs everything into app.asar and Electron teaches its own
 * fs to read through it, so nothing looks wrong until a CHILD process is
 * asked to. `spawn` goes to the operating system, which cannot open a script
 * inside the archive or enter a working directory inside it, and the failure
 * it returns is ENOENT against the EXECUTABLE'S name:
 *
 *   Error: spawn C:\...\HaPitaron.exe ENOENT
 *
 * which names a file that plainly exists. The first installed build did
 * exactly this, on the owner's machine, the moment they finished signing in.
 * Nothing before that point could have noticed: the unpacked build runs fine,
 * and there is no asar in it at all.
 */
{
  const builder = readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  is(/asarUnpack:/.test(builder), 'the packaging config must keep something out of the archive');
  is(/^\s+- worker\.cjs$/m.test(builder), 'namely the engine, which is started as its own process');
  is(/^\s+- node_modules\/\*\*$/m.test(builder), 'and what it requires at runtime, which that process reads itself');
  const shell = readFileSync(path.join(root, 'desktop', 'main.ts'), 'utf8');
  is(
    /app\.asar\$\{path\.sep\}`,\s*`app\.asar\.unpacked\$\{path\.sep\}/.test(shell),
    'and the shell must rewrite the path to the unpacked copy before spawning',
  );
  is(/cwd: WORKER_CWD/.test(shell), 'including the working directory — a cwd inside the archive fails the same way');
  is(!/cwd: here,/.test(shell), 'never __dirname, which is inside the archive once packaged');
}

/*
 * ONE UPDATER PER PROGRAM, AND THE OTHER ONE MUST NOT RUN IN HERE.
 *
 * worker/self-update.ts is for the machine this was developed on: a git
 * checkout started by start-worker.cmd, where the launcher pulls on every
 * start and the worker's only job is to know when to stand down. A CUSTOMER
 * has none of that, so in the packaged app the check fails — and it reports
 * its failure to their own dashboard, in these words: "צריך להתקין אותה
 * מחדש מהקישור המקורי". A paying customer whose app updates itself perfectly
 * was being told, on their own screen, to go and download the installer again.
 *
 * And on a machine that HAS git, with the app installed anywhere inside a
 * repository, the same check can answer "a new version is waiting" and exit
 * with code 4 for a launcher that does not exist. The shell restarts it
 * thirty seconds later, for ever, publishing nothing.
 *
 * Both are gone behind one environment variable, and both halves of it are
 * asserted here because either half alone is the bug.
 */
{
  const shell = readFileSync(path.join(root, 'desktop', 'main.ts'), 'utf8');
  const selfUpdate = readFileSync(path.join(root, 'worker', 'self-update.ts'), 'utf8');
  is(/SOCIAL_WORKER_MANAGED: '1',/.test(shell), 'the desktop shell tells the engine that it is the one doing the updating');
  is(
    /if \(process\.env\.SOCIAL_WORKER_MANAGED === '1'\) return \{ ready: false, problem: '', detail: '' \};/.test(selfUpdate),
    'and the engine stands down when told — with no "problem", because a problem is printed on the customer’s dashboard',
  );
  /* The gate has to come BEFORE anything reaches for git, or the customer gets
     the failure anyway. */
  const gateAt = selfUpdate.indexOf("SOCIAL_WORKER_MANAGED === '1'");
  const gitAt = selfUpdate.indexOf("run('git'");
  is(gateAt > 0 && gitAt > gateAt, 'and it stands down before it reaches for git, not after');
}

/*
 * UPDATING ITSELF, AND THE TWO WAYS THAT GOES WRONG.
 *
 * The app now fetches and installs its own next version, which is what
 * replaces sending a download link after every fix. Two properties have to
 * hold, and neither is visible by reading the feature working once.
 *
 * ONE: the feed must be public. A private repository's release assets need a
 * token to download, so pointing the updater at the source repository would
 * mean shipping a credential that can read all of the source inside every
 * installer. The whole first half of this file exists to stop exactly that, so
 * it is asserted here rather than left to a code review.
 *
 * TWO: it must not restart by itself. This program's job is to be running at
 * 14:00 when a post is due. An updater that decides on its own that now is a
 * fine moment to quit and reinstall eats a publication and leaves nothing
 * behind explaining why.
 */
{
  const builder = readFileSync(path.join(root, 'electron-builder.yml'), 'utf8');
  is(/^publish:/m.test(builder), 'the package must be built with a publish feed, or app-update.yml is never written and an installed copy has nothing to check');
  const repo = builder.match(/^\s+repo:\s*(\S+)/m)?.[1];
  /*
   * THE PROPERTY, NOT THE NAME — twice over now.
   *
   * This first pinned the string "hapitaron-updates", and the feed repository
   * turned out to have been created under a different name entirely, so the
   * build failed on a package that was correct. It then asserted that the feed
   * is not the source repository, as a stand-in for "the feed is public".
   *
   * That stand-in was wrong in the direction that costs the most: it was
   * enforcing a SEPARATE repository, which can only be published to with a
   * hand-made token — and that token was issued read-only, so for days the
   * build produced a good installer and had its release refused at the last
   * step. The source repository is public and always was, so the separation
   * was protecting against nothing while breaking the thing it protected.
   *
   * What actually matters is that WHATEVER the feed is, an installed copy can
   * read it with no login. That cannot be read off a name, so it is not
   * guessed at here: build-app.yml asks GitHub anonymously, exactly as an
   * installed copy asks, and refuses to publish when the answer is not public.
   * This asserts that the refusal is still there.
   */
  const flow = readFileSync(path.join(root, '.github', 'workflows', 'build-app.yml'), 'utf8');
  is(Boolean(repo), 'the feed names a repository');
  is(
    /\.private\)\s*\{[\s\S]{0,400}?throw "\$feed is PRIVATE/.test(flow),
    'the build refuses to publish to a feed a stranger cannot read — the one property an update feed must have',
  );
  is(
    /\$anon = Invoke-WebRequest[\s\S]{0,200}?\$feed/.test(flow),
    'and it asks anonymously, the way an installed copy asks, rather than trusting a name',
  );
  /*
   * AND THE PUBLISH MUST NOT HANG ON A SECRET SOMEBODY HAS TO CREATE.
   *
   * The whole feature spent days broken on exactly that. GitHub issues every
   * workflow a token for its own repository; it cannot be forgotten, scoped
   * wrongly or left read-only, and it expires with the job — so it is the only
   * credential this build is allowed to depend on.
   */
  is(
    /GH_TOKEN: \$\{\{ secrets\.GITHUB_TOKEN \}\}/.test(flow),
    'the release is published with the token GitHub issues the run, not with one a person has to make and maintain',
  );
  is(
    /^permissions:\s*\n\s+contents: write$/m.test(flow),
    'and the workflow asks for the write permission that token needs, out loud',
  );
  is(!/UPDATES_TOKEN: \$\{\{ secrets/.test(flow), 'no hand-made token is wired into the publish any more');
  is(/^\s+releaseType:\s*release$/m.test(builder), 'and it must publish live releases — a draft is invisible to the updater');

  /*
   * HOW BIG THE DOWNLOAD IS.
   *
   * The installer reached 140 MB and nobody noticed, because nothing measured
   * it and nothing said it out loud. The app's own payload is asserted below
   * (under 40 MB, currently under 9); what the customer actually downloads is
   * that plus Electron, and the only levers over Electron are these two. They
   * are defaults that were never set, so they are the first things a future
   * change would quietly drop.
   *
   * Every locale but Hebrew and the English fallback is 43 MB of Chromium's own
   * dialogs in languages nobody using this product reads.
   */
  is(/^compression:\s*maximum$/m.test(builder), 'the installer is compressed as hard as the build can — a build minute against every customer’s download');
  is(
    /^electronLanguages:/m.test(builder) && /^\s+-\s*he$/m.test(builder),
    'and it ships Chromium’s Hebrew and English locales only, not all fifty-five',
  );
  /* And nothing else is built beside it: the zip was a second copy of the same
     program that no customer downloads and the updater never reads. */
  is(!/target:\s*zip/.test(builder), 'no second copy of the program is built beside the installer');
  /*
   * AND THE LOCALES ARE REMOVED BY SOMETHING THAT ACTUALLY RUNS ON WINDOWS.
   *
   * `electronLanguages` above is honoured on Linux and IGNORED on Windows —
   * the build accepted it, went green, and shipped all fifty-five anyway. A
   * setting that is accepted and does nothing is worse than no setting,
   * because it reads like the job is done.
   */
  is(/^afterPack:\s*scripts\/after-pack\.cjs$/m.test(builder), 'a hook removes the locales on every platform, including the one the customers are on');
  const trim = readFileSync(path.join(root, 'scripts', 'after-pack.cjs'), 'utf8');
  is(/'he\.pak', 'en-US\.pak'/.test(trim), 'and it keeps Hebrew and the English fallback Chromium cannot start without');

  /*
   * THE HALF-RELEASE, which is the worst outcome this whole feature has.
   *
   * electron-builder starts a publisher per file, each one creating the
   * release if it is missing; two of them raced, GitHub refused the loser, and
   * what was left was a release carrying the installer and NOT latest.yml —
   * at /releases/latest, where every installed copy looks. It looked complete
   * on the page and was invisible to every machine in the world.
   */
  is(
    /releases" -Headers \$auth -Body \$make/.test(flow),
    'the release is created once, up front, so two uploaders cannot both try to create it',
  );
  is(
    /if \(\$names -notcontains \$needed\)/.test(flow) && /'latest\.yml'/.test(flow),
    'and the build reads the release back and fails if latest.yml is not on it — the one file an installed copy needs',
  );
  /*
   * THE THREE WAYS A VERSION CAN BE PUBLISHED AND STILL NEVER ARRIVE.
   *
   * Each of them ends the same way — a fleet that reports itself up to date
   * for ever, with nothing anywhere saying otherwise — and none of them is
   * visible from the release page.
   */
  is(
    /\[version\]\$version -le \[version\]\$already/.test(flow),
    'a version that is not GREATER than the published one is refused — one typo would otherwise freeze every installed copy',
  );
  is(
    /if \(\$serving -ne "v\$v"\)/.test(flow),
    'and the build checks what the FEED hands out, not only what it uploaded — GitHub picks "latest" by commit date, so a build from an older commit publishes fine and reaches nobody',
  );
  const assemble = readFileSync(path.join(root, 'scripts', 'build-app.mjs'), 'utf8');
  is(
    /if \(!\/\^\\d\+\\\.\\d\+\\\.\\d\+\$\/\.test\(WORKER_VERSION\)/.test(assemble),
    'and a build that cannot read its own version number refuses to ship, instead of quietly packaging 0.0.0',
  );

  /*
   * THE DEPLOY ASKS MORE THAN ONCE, because asking once was not enough.
   *
   * Over one evening, four of eight hook calls produced no deployment at all:
   * Vercel answered 201 PENDING and production stayed on the previous build
   * for the full ten minutes, while the calls that DID land were served in
   * under a minute. The owner's fixes sat in GitHub and never reached his
   * phone, and the job that was supposed to catch that reported it and stopped.
   *
   * The cause is in a dashboard this repository cannot see. Until it is found,
   * a second and third request are what actually get the fix to him.
   */
  const deploy = readFileSync(path.join(root, '.github', 'workflows', 'vercel-deploy.yml'), 'utf8');
  is(/for round in 1 2 3; do/.test(deploy), 'a deploy that does not land is asked for again, not merely reported');
  is(
    /* `\s+` and not `\n\s*`: this file is read on the WINDOWS runner, where git
       checks it out with CRLF, so a bare `\n` after a non-space character never
       matches. Written that way it passed here and failed there — and it is the
       only test the installer build runs, so every customer update stopped. */
    /ask\s+echo "Round \$\{round\}: waiting/.test(deploy),
    'and each round ASKS before it waits — a round that only waits again is the same ten minutes twice',
  );
  is(
    /exit 0/.test(deploy.slice(deploy.indexOf('if [ "${live}" = "${short}" ]'), deploy.indexOf('::warning::'))),
    'it stops the moment production reports the commit, rather than burning all three rounds',
  );
  is(
    /Production is still on .* after three requests/.test(deploy),
    'and when all three fail it still fails loudly — a deploy that never landed must never read as success',
  );
  is(
    /api\/version/.test(deploy),
    'the check asks PRODUCTION what it is running, not Vercel what it accepted — the 201 was always the lie',
  );

  const updates = readFileSync(path.join(root, 'desktop', 'updates.ts'), 'utf8');
  is(/autoUpdater\.autoDownload = false/.test(updates), 'the download is started deliberately, so the "עדכונים אוטומטיים" toggle actually decides');
  is(/autoUpdater\.autoInstallOnAppQuit = true/.test(updates), 'a downloaded version installs on the next ordinary quit, so doing nothing still gets you there');
  /*
   * ─── ONE DOOR TO A RESTART, AND A GATE IN FRONT OF IT ──────────────────
   *
   * This used to read "nothing outside install() may restart the app — an
   * update that interrupts a publication is worse than no update", and it
   * sliced the file at `export function install`. Both halves had to change,
   * and only one of them was a rule.
   *
   * The RULE is unchanged and still pinned below: quitAndInstall appears in
   * exactly one place. What changed is who may walk through it. The app now
   * installs WITHOUT a human — "אני רוצה שזה יעבוד אצלו אוטמט בדיוק כמו אצלי"
   * — because the old rule was protecting the wrong thing: it stopped the
   * restart from being automatic, when what matters is that the restart never
   * lands on a publication. The owner's own machine has been automatic for
   * months precisely because it CHOOSES ITS MOMENT.
   *
   * So the claim is now two claims: still one door, and a safety gate in
   * front of it that no caller can skip.
   *
   * (The slice is also anchored differently. `install` became async, so a
   * pattern naming `export function install` silently matched nothing and the
   * check began reading the whole file — passing for a while, then failing for
   * a reason that had nothing to do with the rule. Anchored on the name alone
   * now, and asserted to have actually found it.)
   */
  const beforeInstallFn = updates.replace(/export async function install[\s\S]*$/, '');
  is(beforeInstallFn.length < updates.length, 'the install function was located, so the slice below is a real slice');
  is(
    !/quitAndInstall/.test(beforeInstallFn),
    'nothing outside install() may restart the app — one door, so the gate in front of it cannot be walked around',
  );
  is(/await wiring\?\.beforeInstall\(\);/.test(updates), 'installing must stop the engine first AND WAIT FOR IT — the old child outlives its parent and fights the new copy for the same rows');
  is(
    /verdict = await w\.safeToInstall\(Date\.now\(\) - readyAt\);/.test(updates),
    'AND THE GATE: an automatic install asks whether a post is going out before it takes the app down',
  );
  is(
    /if \(!verdict\.ok\)/.test(updates) && /stopWaiting\(\);\s*w\.say/.test(updates),
    'and only installs on a yes — a no keeps waiting rather than falling through',
  );

  /* The bundle must actually contain the updater. esbuild leaving it as a bare
     require would produce a package that builds, installs, and throws the
     moment somebody opens the עדכונים screen. */
  is(!/require\("electron-updater"\)/.test(main), 'electron-updater must be bundled into main.cjs, not required at runtime from a node_modules that is not there');
  is(/autoInstallOnAppQuit/.test(main), 'and its wiring must survive into the built bundle');
}

/* The two processes stay two. A window that imported the publishing engine
   instead of starting it would mean a redesign could break a publication. */
is(/\.spawn\b/.test(main) && /node:child_process/.test(main), 'the engine is started as its own process, not called inside the window');
is(existsSync(path.join(out, 'renderer', 'index.html')), 'the screens ship');
is(existsSync(path.join(out, 'renderer', 'mini.html')), 'including the small panel');
const preload = readFileSync(path.join(out, 'preload.cjs'), 'utf8');
is(!/require\('node:/.test(preload), 'the bridge must not hand the page any Node module');
is(preload.split('\n').length < 60, 'and must stay short enough to read in full');

/*
 * EVERY CHANNEL THE PAGE CALLS MUST EXIST ON THE OTHER SIDE.
 *
 * The bridge is two string literals in two different files, and nothing
 * checks that they match. A typo in either — 'updates:check' against
 * 'update:check' — compiles, packages, installs and runs. The button just
 * does nothing, or hangs forever on a promise nobody will ever settle, which
 * is the kind of failure that gets reported as "the app is stuck".
 */
{
  const invoked = [...preload.matchAll(/ipcRenderer\.invoke\('([^']+)'/g)].map((m) => m[1]);
  const sent = [...preload.matchAll(/ipcRenderer\.send\('([^']+)'/g)].map((m) => m[1]);
  const listened = [...preload.matchAll(/ipcRenderer\.on\('([^']+)'/g)].map((m) => m[1]);
  is(invoked.length > 10 && sent.length > 5 && listened.length > 5, 'the bridge was read, not just opened');

  for (const ch of invoked) is(main.includes(`ipcMain.handle("${ch}"`), `the page invokes '${ch}' — something must answer it`);
  for (const ch of sent) is(main.includes(`ipcMain.on("${ch}"`), `the page sends '${ch}' — something must receive it`);
  /* And the other direction: a channel the page listens on that nobody ever
     sends is a screen that stays on its loading state for good. */
  for (const ch of listened) is(main.includes(`"${ch}"`), `the page listens on '${ch}' — something must push it`);

  /* Named explicitly, because these four are the whole update feature and a
     silent one of them is a person who thinks they are up to date. */
  for (const ch of ['updates:state', 'updates:check', 'updates:download', 'updates:install']) {
    is(invoked.includes(ch), `the עדכונים screen must be able to call '${ch}'`);
  }
  is(listened.includes('updates'), 'and must be told about a download it did not start');
}

/* Chromium is what would make this a 200MB download instead of a 10MB one. */
is(!existsSync(path.join(out, 'node_modules', 'playwright-core', '.local-browsers')),
  'playwright’s own Chromium must not be shipped — the worker drives the Chrome the customer already has');
/*
 * NO TEST IN THIS TREE MAY DEPEND ON THE LINE ENDING IT WAS WRITTEN WITH.
 *
 * This file is the ONLY test the installer build runs, and it runs on Windows,
 * where git checks every file out with CRLF. A regex matching a bare `\n` after
 * a non-space character therefore passes on the machine it was written on and
 * fails on the machine that ships the product — and when it fails the build
 * stops before the release, so no installer is published and every customer
 * stays on an old version with nothing saying why.
 *
 * That is exactly what happened: one assertion written `/ask\n\s*echo …/`
 * blocked six consecutive installer builds while the website deployed fine, so
 * the owner's worker-side fixes — a buried publishing round among them — could
 * not reach his machine at all.
 *
 * `\s*\n` is safe: the `\s*` absorbs the `\r`. A bare `\n` is not.
 */
{
  const offenders: string[] = [];
  for (const name of readdirSync(path.join(root, 'worker', 'test'))) {
    if (!name.endsWith('.ts') && !name.endsWith('.tsx')) continue;
    /* Comments are stripped first: a regex quoted inside an explanation is not
       executed, and this file's own comment above quotes the offending one. */
    const src = readFileSync(path.join(root, 'worker', 'test', name), 'utf8')
      .replace(/\/\*[\s\S]*?\*\//g, ' ')
      .replace(/^\s*\/\/.*$/gm, ' ');
    for (const lit of src.match(/\/(?:[^/\\\n]|\\.)+\/[gimsuy]*/g) ?? []) {
      if (!lit.includes('\\n')) continue;
      /* A character class such as [^\n] says what may APPEAR, not that the
         pattern must cross a line break — those are not at risk. */
      const stripped = lit.replace(/\[\^?(?:[^\]\\]|\\.)*\]/g, '\u00b7');
      for (let at = stripped.indexOf('\\n'); at >= 0; at = stripped.indexOf('\\n', at + 2)) {
        const before = stripped.slice(Math.max(0, at - 3), at);
        if (before.endsWith('\\s*') || before.endsWith('\\s+') || before.endsWith('\\s?')) continue;
        /* `\n?\s*` is safe too: the newline is optional and the `\s*` behind it
           absorbs the CR. */
        if (/^\?\\s[*+]/.test(stripped.slice(at + 2))) continue;
        offenders.push(`${name}: ${lit.slice(0, 64)}`);
        break;
      }
    }
  }
  checks += 1;
  assert.deepEqual(
    offenders,
    [],
    `a regex here matches a bare \\n, which never matches on the Windows runner that builds the installer. Use \\s* or \\s+:\n  ${offenders.join('\n  ')}`,
  );
}

const mb = files.reduce((n, f) => n + statSync(f).size, 0) / 1024 / 1024;
is(mb < 40, `the payload beside Electron must stay small (it is ${mb.toFixed(1)} MB)`);

console.log(`package tests OK — ${checks} assertions, ${files.length} files scanned, ${mb.toFixed(1)} MB`);
