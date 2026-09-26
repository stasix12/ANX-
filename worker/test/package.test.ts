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

/* The two processes stay two. A window that imported the publishing engine
   instead of starting it would mean a redesign could break a publication. */
is(/\.spawn\b/.test(main) && /node:child_process/.test(main), 'the engine is started as its own process, not called inside the window');
is(existsSync(path.join(out, 'renderer', 'index.html')), 'the screens ship');
is(existsSync(path.join(out, 'renderer', 'mini.html')), 'including the small panel');
const preload = readFileSync(path.join(out, 'preload.cjs'), 'utf8');
is(!/require\('node:/.test(preload), 'the bridge must not hand the page any Node module');
is(preload.split('\n').length < 60, 'and must stay short enough to read in full');

/* Chromium is what would make this a 200MB download instead of a 10MB one. */
is(!existsSync(path.join(out, 'node_modules', 'playwright-core', '.local-browsers')),
  'playwright’s own Chromium must not be shipped — the worker drives the Chrome the customer already has');
const mb = files.reduce((n, f) => n + statSync(f).size, 0) / 1024 / 1024;
is(mb < 40, `the payload beside Electron must stay small (it is ${mb.toFixed(1)} MB)`);

console.log(`package tests OK — ${checks} assertions, ${files.length} files scanned, ${mb.toFixed(1)} MB`);
