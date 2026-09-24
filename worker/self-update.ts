import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);

/**
 * Is there a newer version of this worker waiting in the repository?
 *
 * WHY THIS EXISTS. Every fix that lives in worker/ has to reach the machine
 * that publishes, and until now reaching it meant a person walking to that
 * machine, closing a window, and opening it again. The owner asked for this
 * while away from the computer, which is exactly the situation it has to
 * survive: the fix was already pushed, the machine was already running, and
 * the two could not meet.
 *
 * The launcher already pulls and installs on every start — so the worker does
 * not need to know how to update itself at all. It only needs to know WHEN to
 * stand down and let the launcher do its job, which makes this the smallest
 * possible piece of machinery for the problem: one comparison, one exit code.
 *
 * Read-only and offline-tolerant. A fetch that fails — no internet, a laptop
 * on a phone hotspot, a repository that has moved — returns false and the
 * worker goes on publishing with the code it has. Not publishing is worse than
 * publishing yesterday's build.
 */
export async function updateAvailable(): Promise<boolean> {
  const cwd = path.resolve(__dirname, '..');
  const git = (args: string[]) => run('git', args, { cwd, timeout: 60_000, windowsHide: true });
  try {
    /*
     * The upstream ref must exist. A checkout with no tracking branch — a
     * detached HEAD, a clone somebody made by hand — has nothing to compare
     * against, and guessing a branch name here would restart the worker into
     * somebody else's code.
     */
    const upstream = (await git(['rev-parse', '--abbrev-ref', '@{u}'])).stdout.trim();
    if (!upstream) return false;
    await git(['fetch', '--quiet']);
    const here = (await git(['rev-parse', 'HEAD'])).stdout.trim();
    const there = (await git(['rev-parse', '@{u}'])).stdout.trim();
    if (!here || !there || here === there) return false;
    /*
     * BEHIND, not merely different. A machine whose checkout has drifted
     * ahead — somebody edited a file on it, a stash that did not come back —
     * would otherwise restart in a loop, every time finding a hash that does
     * not match and never being able to fix it. `merge-base --is-ancestor` asks
     * the only question that matters: is what we are running contained in what
     * is upstream?
     */
    await git(['merge-base', '--is-ancestor', here, there]);
    return true;
  } catch {
    return false;
  }
}
