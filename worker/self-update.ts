import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import path from 'node:path';

const run = promisify(execFile);

/**
 * What the update check found.
 *
 * A boolean was not enough, and the owner paid for that twice: the check
 * failing and there being nothing to install look identical from a boolean,
 * so a machine that could not reach the repository went on running last
 * week's code with nothing anywhere saying so. The dashboard showed "גרסה
 * ישנה" and the honest answer to "why" — we cannot ask — existed nowhere.
 */
export interface UpdateCheck {
  /** A newer version is waiting: stand down and let the launcher install it. */
  ready: boolean;
  /** Why we could not tell, as a Hebrew sentence. Empty when the check ran. */
  problem: string;
  /** The original error, for whoever reads the terminal. */
  detail: string;
}

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
 * Read-only and offline-tolerant: a fetch that fails leaves the worker
 * publishing with the code it has, because not publishing is worse than
 * publishing yesterday's build. But it SAYS SO now, rather than returning the
 * same answer as a machine that is already up to date.
 */
export async function updateAvailable(): Promise<UpdateCheck> {
  const cwd = path.resolve(__dirname, '..');
  const git = (args: string[]) => run('git', args, { cwd, timeout: 60_000, windowsHide: true });
  const why = (err: unknown) => (err instanceof Error ? err.message.split('\n')[0] : String(err));

  /*
   * The upstream ref must exist. A checkout with no tracking branch — a
   * detached HEAD, a clone somebody made by hand — has nothing to compare
   * against, and guessing a branch name here would restart the worker into
   * somebody else's code.
   */
  let upstream = '';
  try {
    upstream = (await git(['rev-parse', '--abbrev-ref', '@{u}'])).stdout.trim();
  } catch (err) {
    return {
      ready: false,
      problem: 'התיקייה במחשב לא מחוברת לענף מרוחק, ולכן התוכנה לא יכולה להתעדכן לבד. צריך להתקין אותה מחדש מהקישור המקורי.',
      detail: why(err),
    };
  }
  if (!upstream) return { ready: false, problem: 'התיקייה במחשב לא מחוברת לענף מרוחק, ולכן התוכנה לא יכולה להתעדכן לבד.', detail: '' };

  try {
    await git(['fetch', '--quiet']);
  } catch (err) {
    /*
     * The likeliest cause on a private repository is credentials that have
     * expired, and it is invisible from the machine: publishing keeps working,
     * the terminal keeps scrolling, and updates simply stop arriving forever.
     */
    return {
      ready: false,
      problem: 'לא הצלחנו לבדוק אם ירדה גרסה חדשה — המחשב לא הצליח להתחבר ל-GitHub. ייתכן שההרשאה פגה.',
      detail: why(err),
    };
  }

  let here = '';
  let there = '';
  try {
    here = (await git(['rev-parse', 'HEAD'])).stdout.trim();
    there = (await git(['rev-parse', '@{u}'])).stdout.trim();
  } catch (err) {
    return { ready: false, problem: 'לא הצלחנו להשוות בין הגרסה במחשב לגרסה שבענן.', detail: why(err) };
  }
  if (!here || !there || here === there) return { ready: false, problem: '', detail: '' };

  /*
   * BEHIND, not merely different. A machine whose checkout has drifted ahead —
   * somebody edited a file on it, a stash that did not come back — would
   * otherwise restart in a loop, every time finding a hash that does not match
   * and never being able to fix it. `merge-base --is-ancestor` asks the only
   * question that matters: is what we are running contained in what is
   * upstream? And when it is not, that is worth saying: such a checkout will
   * never update again on its own.
   */
  try {
    await git(['merge-base', '--is-ancestor', here, there]);
  } catch (err) {
    return {
      ready: false,
      problem: 'יש גרסה חדשה בענן, אבל התיקייה במחשב שונתה ידנית ולכן העדכון האוטומטי לא יכול לרוץ. צריך להתקין מחדש.',
      detail: why(err),
    };
  }
  return { ready: true, problem: '', detail: '' };
}
