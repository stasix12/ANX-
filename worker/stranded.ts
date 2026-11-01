/**
 * ─── A ROW STUCK ON "PUBLISHING" RETIRES ITS GROUP FOR EVER ──────────────────
 *
 * This is the worst finding in the audit, and it is quiet.
 *
 * social_queue_one_open_per_target_idx allows ONE open row per group. A row
 * left in 'publishing' is open. So a group whose row wedged there is not
 * "delayed" — it is excluded from every future round the planner builds, for
 * as long as the row sits there, and nothing anywhere says so. The campaign
 * card goes on reading רץ below 100% because the row never finishes, and the
 * owner's own words for it are both of these at once: "פוסטים לא מתפרסמים
 * בשעות שהגדרתי" and "קמפיינים מתבלבלים עם תורים של קמפיינים אחרים" — the lock
 * is per GROUP and account-wide, so one wedged row shortens the next round of
 * a DIFFERENT campaign.
 *
 * THERE WERE TWO RECOVERIES AND NEITHER REACHES IT.
 *
 *   1. src/lib/social/server/worker.ts sweepStuck() handles exactly this, and
 *      its only call site sits inside runWorkerLocked() — BELOW the refusal
 *      that returns early when there is more than one business in
 *      social_tenants. There are two businesses now. So the one sweep that
 *      frees a row nobody is holding has been switched off since the customer
 *      was added, by a guard added above it for an unrelated reason. (Moved
 *      above the refusal in the same change as this file: recovering a wedged
 *      row is bookkeeping, not publishing, and the code's own comment already
 *      argued for it running before the pause checks for that very reason.)
 *   2. The worker's startup sweep (worker/social-worker.ts) is scoped
 *      `.eq('worker_id', state.id)` and runs only at startup. It covers a
 *      crash-and-restart of this machine and nothing else: not a row with no
 *      worker_id at all, not one claimed by a worker that has since gone, and
 *      not one this process claimed and then lost to a lane that died without
 *      finishing — a worker up for days never looks again.
 *
 * So the local worker — the one process that certainly runs for this owner,
 * whatever Vercel's cron is doing — gets a periodic sweep of its own, and the
 * decision lives here where it can be tested without a database.
 *
 * THE ONE RULE THAT MATTERS MORE THAN RECOVERY: a row whose post may already
 * be on Facebook is NEVER put back in the queue. It goes to the owner with the
 * same word the startup sweep uses ('submitted'), which the bulk "המשך סבב"
 * deliberately skips. Only a row that never reached the Post button is
 * re-queued, because nothing was published and there is nothing for a person
 * to check. Getting that backwards is a second post in the same group, which
 * is the one fault this product cannot afford.
 */

/** How long a claim may sit before nobody holding it counts as stranded. */
export const STRANDED_AFTER_MS = 15 * 60_000;

/** How long since a worker last spoke before it is treated as gone. */
export const WORKER_GONE_AFTER_MS = 90_000;

/**
 * The steps at which the Post button may already have been pressed.
 *
 * Identical to MAYBE_LIVE_STEPS in worker/social-worker.ts, on purpose and
 * tested against it: two lists that must agree, in two files, is how a row
 * that is live gets re-queued.
 */
export const MAYBE_LIVE_STEPS: string[] = ['publishing', 'verifying', 'submitted'];

export interface StrandedRow {
  id: string;
  status: string;
  step: string | null;
  worker_id: string | null;
  claimed_at: string | null;
}

export interface WorkerSeen {
  id: string;
  last_seen_at: string | null;
  status?: string | null;
}

export interface Stranded {
  /** Never reached the click: back to the queue, nothing to confirm. */
  requeue: string[];
  /** May be live: to the owner, marked 'submitted' so no bulk action re-arms it. */
  park: string[];
}

export function pickStranded(input: {
  rows: StrandedRow[];
  workers: WorkerSeen[];
  /** False when the workers read failed — then "who is alive" is unknown. */
  workersKnown: boolean;
  /** This process's own worker id. */
  selfId: string;
  /** The rows this process's lanes are genuinely holding right now. */
  held: Iterable<string>;
  nowMs: number;
}): Stranded {
  const { rows, workers, workersKnown, selfId, nowMs } = input;
  const held = new Set(input.held);

  const alive = new Set<string>();
  for (const w of workers) {
    const seen = w.last_seen_at ? Date.parse(w.last_seen_at) : NaN;
    /*
     * A worker's own last word counts, exactly as listWorkers() now does it: a
     * process that reported 'offline' is gone whatever its stamp says, and a
     * fresh stamp without a goodbye is alive.
     */
    if (w.status === 'offline') continue;
    if (Number.isFinite(seen) && nowMs - seen < WORKER_GONE_AFTER_MS) alive.add(w.id);
  }

  const out: Stranded = { requeue: [], park: [] };
  for (const row of rows) {
    /* A row this process is publishing right now is not stranded, whatever
       its claim time says — the lane is holding it and will finish it. */
    if (held.has(row.id)) continue;

    const claimed = row.claimed_at ? Date.parse(row.claimed_at) : NaN;
    /*
     * NO TIMESTAMP IS NOT PERMISSION. An unparseable or missing claimed_at is
     * a corrupt row, and the cost of being wrong here is either a double post
     * or a row taken out of a publication that is in flight. It is left for a
     * person, the same way the rest of this file errs.
     */
    if (!Number.isFinite(claimed)) continue;
    if (nowMs - claimed < STRANDED_AFTER_MS) continue;

    const owner = row.worker_id;
    if (owner === null) {
      /* Nobody claimed it, or the claim's worker write never landed. */
    } else if (owner === selfId) {
      /* This process's own claim, and no lane is holding it: the lane died
         without finishing. The startup sweep would have caught a restart;
         a worker that has been up for days never looks again. */
    } else if (!workersKnown) {
      /* Cannot tell whether that worker is alive, so leave it alone. The
         server's own sweep is the backstop for this case. */
      continue;
    } else if (alive.has(owner)) {
      /* Another machine is working it. Not ours to take. */
      continue;
    }

    if (MAYBE_LIVE_STEPS.includes(row.step ?? '')) out.park.push(row.id);
    else out.requeue.push(row.id);
  }
  return out;
}
