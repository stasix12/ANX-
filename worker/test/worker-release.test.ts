/*
 * A FIX THAT NEVER REACHED THE MACHINE IS NOT A FIX.
 *
 * "כל פעם ההתראה הזאת של ה-218 קבוצות שלא נכנסו לסבב קופצת לי תתקן כבר את
 *  הבאג הזה!"
 *
 * It had been fixed. Twice. 16212ca stopped the planner repeating itself on a
 * pass that planned nothing; 94f26de stopped it on a pass that only refilled
 * one row. Both were correct, both were tested, and neither ever ran on his
 * PC — because the planner runs THERE (worker/social-worker.ts:900 calls
 * planQueue), the installer bundles src/lib/social/** into worker.cjs, and the
 * release workflow refuses to publish a version number that is already out:
 *
 *     "v4.4.0 is already published. Bump WORKER_VERSION to ship a new one."
 *
 * So the build ran, said that, and stopped. The fix sat on a shelf for hours
 * while the thing it fixed kept writing a warning a minute into his activity
 * log — and nothing anywhere said so. A stale worker is invisible: it
 * heartbeats, it publishes, it reports a healthy login, just without whatever
 * was fixed.
 *
 * THE TRAP IS THAT THE CODE DOES NOT LOOK LIKE WORKER CODE. worker-version.ts
 * says "bump it whenever a change to worker/ has to reach that machine", and
 * plan.ts is not under worker/ — it is under src/lib/social/, next to the
 * dashboard's own modules, and the alias in build-app.mjs is what puts it
 * inside the installer. Reading the diff tells you nothing.
 *
 * So this computes what the installer actually carries and pins it. Change any
 * of it and this fails, naming the fingerprint to paste — which is a prompt to
 * answer the only question that matters: does this have to reach the PC? If it
 * does, bump the version. If it genuinely does not, paste the fingerprint and
 * move on. Either way the question is asked out loud instead of being missed.
 *
 *   npx tsx worker/test/worker-release.test.ts
 */
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { WORKER_VERSION, WORKER_FINGERPRINT } from '../../src/lib/social/worker-version';

const ROOT = fileURLToPath(new URL('../../', import.meta.url));

/**
 * EXACTLY WHAT ENDS UP ON THE CUSTOMER'S MACHINE, and nothing that does not.
 *
 * The three roots are the ones .github/workflows/build-app.yml triggers on,
 * minus the things that are not compiled in: the test suite (which changes on
 * every turn and reaches nobody), and worker-version.ts itself, which is the
 * stamp and cannot be part of what it stamps.
 */
const ROOTS = ['desktop', 'worker', 'src/lib/social'];
const SKIP = [path.join('worker', 'test'), path.join('worker', 'customers'), path.join('src', 'lib', 'social', 'worker-version.ts')];
const EXTRA = ['scripts/build-app.mjs', 'electron-builder.yml'];
const CODE = /\.(ts|tsx|mjs|cjs|js|json|yml)$/;

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(path.join(ROOT, dir)).sort()) {
    const rel = path.join(dir, name);
    if (SKIP.some((s) => rel === s || rel.startsWith(s + path.sep))) continue;
    const full = path.join(ROOT, rel);
    if (statSync(full).isDirectory()) walk(rel, out);
    else if (CODE.test(name)) out.push(rel);
  }
  return out;
}

const files = [...ROOTS.flatMap((r) => walk(r)), ...EXTRA].sort();
const hash = createHash('sha256');
for (const rel of files) {
  hash.update(rel.split(path.sep).join('/'));
  hash.update('\0');
  hash.update(readFileSync(path.join(ROOT, rel)));
  hash.update('\0');
}
const fingerprint = hash.digest('hex').slice(0, 16);

assert.ok(files.length > 30, `only ${files.length} files were read — the walk is looking in the wrong place, and a fingerprint of nothing matches nothing`);
assert.ok(files.includes(path.join('src', 'lib', 'social', 'plan.ts')), 'the planner is in the set — it is the file whose fix spent an afternoon undelivered');
assert.ok(files.includes(path.join('worker', 'social-worker.ts')), 'and so is the worker itself');
assert.ok(!files.some((f) => f.includes(path.join('worker', 'test'))), 'the test suite is NOT in it — it changes constantly and reaches no machine');

assert.equal(
  fingerprint,
  WORKER_FINGERPRINT,
  `\n\n  THE CODE THAT RUNS ON THE CUSTOMER'S PC HAS CHANGED, and WORKER_VERSION is still ${WORKER_VERSION}.\n` +
    `  The release workflow refuses to publish a version that is already out, so this change would\n` +
    `  never reach a single installed copy — silently, exactly as the 218-groups warning did.\n\n` +
    `  If it has to reach the PC: bump WORKER_VERSION in src/lib/social/worker-version.ts.\n` +
    `  Either way, set WORKER_FINGERPRINT to:\n\n      '${fingerprint}'\n`,
);

console.log(`worker release OK — ${files.length} bundled files fingerprinted at ${fingerprint}, shipping as ${WORKER_VERSION}`);
