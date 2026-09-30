/*
 * Packs the worker into something a person can be handed.
 *
 * Today the worker is TypeScript run through tsx, out of a git checkout, with
 * node_modules beside it. Three things a customer does not have and should not
 * be asked to get. This turns all of it into ONE JavaScript file that plain
 * Node can run, which is what the desktop shell in app/ then starts.
 *
 * playwright-core stays external on purpose. It is the only dependency that is
 * not just code: it locates browsers through files of its own, and bundling it
 * breaks that in ways that only show up on the customer's machine. It ships
 * beside the bundle instead — a few megabytes, because the worker drives the
 * Chrome the customer already has rather than carrying one.
 */
import { build } from 'esbuild';
import { cpSync, existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const out = path.join(root, 'dist', 'app');

/* One version number for the repository, the worker and the package, read
   from the file the dashboard already compares against. */
const WORKER_VERSION = (readFileSync(path.join(root, 'src', 'lib', 'social', 'worker-version.ts'), 'utf8')
  .match(/WORKER_VERSION = '([^']+)'/) ?? [, '0.0.0'])[1];

/*
 * AND IT MAY NOT FAIL OPEN.
 *
 * That regex wants single quotes and one space. Change the constant to double
 * quotes, or a backtick, or close the gap — all of them ordinary edits — and
 * this silently packages version 0.0.0. The publish gate only asks whether tag
 * v0.0.0 exists, so it would go out as a release, become the newest one every
 * installed copy reads, and tell a fleet on 3.55.0 that it is current. For ever.
 *
 * A build that cannot read its own version number has nothing to ship.
 */
if (!/^\d+\.\d+\.\d+$/.test(WORKER_VERSION) || WORKER_VERSION === '0.0.0') {
  throw new Error(
    `Could not read a version out of src/lib/social/worker-version.ts (got "${WORKER_VERSION}"). ` +
      "It must read exactly: export const WORKER_VERSION = '1.2.3';",
  );
}

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const common = {
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  /* Hebrew from end to end; anything else mangles every message. */
  charset: 'utf8',
  /* `@/lib/...` is a Next.js alias and means nothing outside the repository. */
  alias: { '@': path.join(root, 'src') },
  /* Names are kept because both processes print class names in errors that a
     person is expected to read and send on. */
  keepNames: true,
  minify: false,
  sourcemap: false,
  logLevel: 'info',
  metafile: true,
};

/*
 * TWO BUNDLES, and they must stay two.
 *
 * worker.cjs is the publishing engine, unchanged, started as a child process.
 * main.cjs is the window: signing in, reading for the screen, the tray. They
 * share the vocabulary in src/lib/social (one definition of what a queue
 * status means, for the website, the worker and this window alike) and share
 * nothing else. Keeping the engine a separate process is what makes a
 * redesign of a window unable to break a publication.
 */
const result = await build({
  ...common,
  entryPoints: [path.join(root, 'worker', 'social-worker.ts')],
  outfile: path.join(out, 'worker.cjs'),
  /* playwright-core finds browsers through files of its own; bundling it
     breaks that in ways that only appear on the customer's machine. */
  external: ['playwright-core'],
});

await build({
  ...common,
  entryPoints: [path.join(root, 'desktop', 'main.ts')],
  outfile: path.join(out, 'main.cjs'),
  /* Electron is the runtime, not a dependency to carry. */
  external: ['electron'],
});

/*
 * playwright-core, copied whole beside the bundle. It is the one dependency
 * that is not only code — it finds browsers through files of its own — so it
 * is shipped rather than bundled. Its own bundled Chromium is NOT copied: the
 * worker drives the Chrome the customer already has, which is the difference
 * between a download of a few megabytes and one of a few hundred.
 */
const pw = path.join(out, 'node_modules', 'playwright-core');
mkdirSync(path.dirname(pw), { recursive: true });
cpSync(path.join(root, 'node_modules', 'playwright-core'), pw, {
  recursive: true,
  /*
   * Its bundled Chromium is not copied — the worker drives the Chrome the
   * customer already has — and neither are its TypeScript definitions. `types/`
   * is 1.6 MB of .d.ts: read by an editor, never by Node, and this package is
   * shipped to people who will not open it in one.
   */
  filter: (src) => !/[\\/](\.local-browsers|\.cache|types)([\\/]|$)/.test(src),
});

/* preload.cjs is copied rather than bundled on purpose: it is the entire
   surface the window is given, and it is worth being a file somebody can read
   in thirty seconds rather than a line inside a bundle. */
cpSync(path.join(root, 'desktop', 'preload.cjs'), path.join(out, 'preload.cjs'));
cpSync(path.join(root, 'desktop', 'renderer'), path.join(out, 'renderer'), { recursive: true });
const icon = path.join(root, 'desktop', 'icon.png');
if (existsSync(icon)) cpSync(icon, path.join(out, 'icon.png'));

/*
 * WHAT IS BAKED IN, AND WHY IT IS NOT A SECRET.
 *
 * The Supabase URL and the anon key. Both already ship inside every browser
 * bundle of the website — the anon key is designed to be public, and what it
 * can reach is decided entirely by the row-level policies behind it, which as
 * of v16 show a signed-in person only their own business's rows. A copy of
 * this package identifies nobody and can read nothing until somebody signs in
 * to it.
 *
 * The service-role key, the encryption key and the owner's own login are NOT
 * here, are not read by this script, and a build that put them here would be
 * handing every customer a master key. worker/test/package.test.ts fails the
 * build if any of them appear in the output.
 */
/*
 * `||` AND `.trim()`, AND BOTH WERE PAID FOR.
 *
 * `??` falls back only on null and undefined — and an unset GitHub repository
 * VARIABLE is passed to a step as the EMPTY STRING, not as nothing. So the
 * default below was bypassed and the shipped config carried `"siteUrl": ""`.
 * Everything it reaches is then dead: "צור חשבון חדש" on the sign-in screen,
 * "הדשבורד באתר" in the tray, the whole way to the website. A customer who
 * installs the app without already having an account has no route to make one.
 * (worker/env.ts:39 carries a comment about this exact trap; the very next step
 * of build-app.yml gets it right with `||`. This line did not.)
 *
 * `.trim()` because a secret pasted with a trailing newline stays in the value:
 * the shipped supabaseUrl really did read "https://….supabase.co\n". WHATWG URL
 * parsing happens to forgive it, so nothing is broken today — and the first
 * piece of code that concatenates the string instead of parsing it would break
 * in a way nobody could see.
 */
const url = (process.env.NEXT_PUBLIC_SUPABASE_URL || '').trim();
const anon = (process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '').trim();
const site = (process.env.SOCIAL_SITE_URL || 'https://anx-ggyo.vercel.app/social').trim();
if (!url || !anon) {
  console.warn('\n  [!] NEXT_PUBLIC_SUPABASE_URL / _ANON_KEY are not set, so config.json is a template.');
  console.warn('      The package will build, and will not connect until they are filled in.');
}
writeFileSync(
  path.join(out, 'config.json'),
  JSON.stringify({ supabaseUrl: url, supabaseAnonKey: anon, siteUrl: site }, null, 2),
);

writeFileSync(
  path.join(out, 'package.json'),
  JSON.stringify(
    {
      name: 'hapitaron-social',
      /*
       * ASCII on purpose. This becomes the name of the .exe and of the folder
       * under AppData, and a Hebrew path is the kind of thing that works on
       * the machine it was tested on and fails on somebody's. Every name a
       * PERSON sees — the window title, the shortcut, the tray tooltip — is
       * Hebrew and set separately.
       */
      productName: 'HaPitaron',
      version: WORKER_VERSION,
      description: 'פרסום מתוזמן לקבוצות פייסבוק',
      main: 'main.cjs',
      private: true,
    },
    null,
    2,
  ),
);

const bytes = Object.values(result.metafile.outputs)[0].bytes;
writeFileSync(path.join(out, 'BUILD.txt'), `bundled ${new Date().toISOString()}\nworker ${WORKER_VERSION}\n${bytes} bytes\n`);
console.log(`\n  dist/app — ${(bytes / 1024).toFixed(0)} KB of worker, plus playwright-core and the window.`);
console.log('  Run it here with:  npx electron dist/app');
