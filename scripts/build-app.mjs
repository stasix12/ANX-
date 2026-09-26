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

rmSync(out, { recursive: true, force: true });
mkdirSync(out, { recursive: true });

const result = await build({
  entryPoints: [path.join(root, 'worker', 'social-worker.ts')],
  outfile: path.join(out, 'worker.cjs'),
  bundle: true,
  platform: 'node',
  target: 'node20',
  format: 'cjs',
  /* The worker is Hebrew from end to end; anything else mangles every message. */
  charset: 'utf8',
  /* `@/lib/...` is a Next.js alias and means nothing outside the repository. */
  alias: { '@': path.join(root, 'src') },
  external: ['playwright-core'],
  /* Keep names: the worker prints class names in errors the owner reads. */
  keepNames: true,
  minify: false,
  sourcemap: false,
  logLevel: 'info',
  metafile: true,
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
  filter: (src) => !/[\\/](\.local-browsers|\.cache)([\\/]|$)/.test(src),
});

/* The desktop shell: the window, the tray, and the thing that starts the
   bundle above. Copied rather than bundled — three small files that are
   easier to audit as themselves. */
for (const file of ['main.cjs', 'preload.cjs', 'index.html']) {
  cpSync(path.join(root, 'app', file), path.join(out, file));
}
const icon = path.join(root, 'app', 'icon.png');
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
const url = process.env.NEXT_PUBLIC_SUPABASE_URL ?? '';
const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ?? '';
const site = process.env.SOCIAL_SITE_URL ?? 'https://anx-ggyo.vercel.app/social';
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
