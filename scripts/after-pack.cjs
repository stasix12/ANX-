/*
 * FIFTY-THREE LANGUAGES OUT OF THE PACKAGE, ON WINDOWS.
 *
 * A BELT, NOT THE TROUSERS — and the comment that used to be here was wrong.
 *
 * It said `electronLanguages` is ignored on Windows. It is not: the published
 * installer contains exactly he.pak and en-US.pak, and did so in the build
 * BEFORE this file existed. On Windows this hook reports "removed 0" every
 * time, because the setting had already done the work.
 *
 * It is kept for one reason: it is the thing that would catch a future
 * electron-builder, or a future Electron layout, quietly shipping all
 * fifty-five again. Fifty megabytes can return without anyone noticing — this
 * project has watched it happen twice — and a hook that prints what it removed
 * makes that visible in the build log instead of in a customer's download.
 *
 * WHAT THESE FILES ARE. Chromium's own interface — the right-click menu, the
 * file picker, the spell-check entries, the certificate warnings — in every
 * language it ships with. Every string this product shows is Hebrew and
 * written by us; the only two that can ever be read here are Hebrew and the
 * English fallback Chromium requires and will crash without.
 *
 * DELETING NOTHING IS A VALID OUTCOME. A layout with no locales folder, or a
 * future Electron that names these differently, leaves the package exactly as
 * it was rather than failing a build over a size optimisation.
 */
const { existsSync, readdirSync, rmSync, statSync } = require('node:fs');
const path = require('node:path');

/*
 * AND THE CHECK THAT SHOULD HAVE EXISTED FROM THE START.
 *
 * electron-builder collects production dependencies from the PROJECT root, not
 * from `directories.app` — so this program shipped the WEBSITE's build tools to
 * customers for as long as installers have existed: the Next.js Rust compiler,
 * next itself, sharp's image libraries. 48 MB of the 132 MB download, measured
 * on the released 3.55.0.
 *
 * `files:` in electron-builder.yml now excludes them. This is the guard that
 * makes that stick: after packing, the only package allowed beside the app is
 * the one the worker actually requires. A build that reintroduces the others
 * fails here, in the log, instead of in a customer's download — which is the
 * one place this class of mistake has ever been found.
 */
const ALLOWED_PACKAGES = new Set(['playwright-core']);

/** Chromium refuses to start without en-US; the product is Hebrew. */
const KEEP = new Set(['he.pak', 'en-US.pak']);

exports.default = async function afterPack(context) {
  assertOnlyOurDependencies(context);
  const dir = path.join(context.appOutDir, 'locales');
  if (!existsSync(dir)) {
    console.log('  • locales: no such folder in this layout — nothing trimmed');
    return;
  }
  let freed = 0;
  let removed = 0;
  for (const name of readdirSync(dir)) {
    if (!name.endsWith('.pak') || KEEP.has(name)) continue;
    const file = path.join(dir, name);
    freed += statSync(file).size;
    rmSync(file);
    removed += 1;
  }
  console.log(`  • locales: removed ${removed} languages, ${(freed / 1024 / 1024).toFixed(1)} MB — kept ${[...KEEP].join(', ')}`);
};

function assertOnlyOurDependencies(context) {
  /* Where a packed app keeps what it could not put inside the archive. Nothing
     to check on a layout that has none. */
  const dir = path.join(context.appOutDir, 'resources', 'app.asar.unpacked', 'node_modules');
  if (!existsSync(dir)) return;
  const found = readdirSync(dir).filter((name) => !name.startsWith('.'));
  const extra = found.filter((name) => !ALLOWED_PACKAGES.has(name));
  if (extra.length) {
    throw new Error(
      `${extra.length} packages are being shipped that this app never requires: ${extra.join(', ')}. ` +
        'electron-builder collects dependencies from the repository root, so the website\'s own tools end up in the ' +
        "customer's download — 48 MB of the 132 MB the last release weighed. Fix the `files:` patterns in " +
        'electron-builder.yml rather than deleting them here.',
    );
  }
  console.log(`  • dependencies: ${found.join(', ') || 'none'} — nothing of the website's came along`);
}
