/*
 * FIFTY-THREE LANGUAGES OUT OF THE PACKAGE, ON WINDOWS.
 *
 * electron-builder has `electronLanguages`, and it is the obvious way to do
 * this — it is also, on Windows, ignored. The first attempt set it, the build
 * went green, and the installer came back 132.9 MB instead of the ~120 the
 * locales alone should have accounted for. A setting that is accepted and does
 * nothing is worse than no setting: it reads like the job is done.
 *
 * So the files are removed here, in the one hook that runs after Electron has
 * been unpacked and before anything is compressed, for every platform alike.
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

/** Chromium refuses to start without en-US; the product is Hebrew. */
const KEEP = new Set(['he.pak', 'en-US.pak']);

exports.default = async function trimLocales(context) {
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
