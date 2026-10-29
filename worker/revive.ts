/**
 * ─── THE ROUND'S SECOND PASS, AS ARITHMETIC ──────────────────────────────
 *
 * "פוסטים שנכשלו להעביר, לא להתעקב עליהם כמו שאמרנו — להחזיר אותם לתור אחרי
 *  שפרסם את כל הקבוצות בסבב ולנסות שוב."
 *
 * Both halves of that, and they only look contradictory if the first is read
 * as "give up". A publication that fails is finished ON THE SPOT — nothing
 * waits ten minutes, nothing waits thirty, and the group is free the same
 * second, which is what stopped one bad group costing the round half an hour.
 * What was missing is the other end: the commonest pre-submit failures (a page
 * that would not load, an upload that stalled, a composer that was not there
 * yet) are exactly the kind that pass a few minutes later, and a group that
 * failed once got nothing more that day.
 *
 * So when a round has finished every group it had, its failures go back to the
 * END of the queue, one gap apart, and are tried one more time.
 *
 * THE DECISION LIVES HERE, AWAY FROM THE DATABASE, because every rule in it is
 * a rule about rows and each one has a way of being wrong that no amount of
 * reading catches — "still working" that includes a row waiting on a person
 * never fires at all; "once more" without a ceiling loops a dead group for
 * ever; a group whose next round already queued it gets a unique-index
 * rejection instead of a publication. worker/test/revive.test.ts runs all of
 * them.
 */

/** A second pass, and only one: the claim's own counter is the record of it. */
export const REVIVE_ATTEMPT_CEILING = 2;
/** How old a failure may be and still belong to the round that is ending. */
export const REVIVE_WINDOW_MS = 24 * 60 * 60_000;
/** A row stamped for this instant could be claimed before the write settles. */
export const REVIVE_CUSHION_MS = 5_000;

/**
 * The statuses that mean a round is STILL WORKING.
 *
 * Deliberately not every open status. A row waiting on a person
 * (needs_attention, manual_pending, awaiting_confirmation) can sit for days,
 * and the owner asked for this to happen when the machine has run out of
 * groups to publish to — which is what "סיים את כל הקבוצות" means. Holding the
 * second pass behind a human would mean it never ran on exactly the rounds
 * that need it most.
 */
export const STILL_WORKING: string[] = ['scheduled', 'paused', 'publishing'];

export interface OpenRow {
  status: string;
  campaign_id: string | null;
  target_id: string;
  scheduled_at: string;
}

export interface FailedRow {
  id: string;
  campaign_id: string | null;
  target_id: string;
  attempts: number;
}

export interface Revival {
  id: string;
  /** The instant to stamp on it, ISO. */
  at: string;
}

/**
 * Which failures may come back, and when each one goes.
 *
 * `open` is every row in an OPEN status for this account — waiting, in flight
 * and waiting-on-a-person alike. It answers three questions at once: which
 * rounds are still working, which groups are already spoken for, and where the
 * end of the queue is.
 */
export function pickRevivable(input: {
  open: OpenRow[];
  failed: FailedRow[];
  nowMs: number;
  /** The account's own floor between publications, in milliseconds. */
  gapMs: number;
}): Revival[] {
  const { open, failed, nowMs } = input;
  const gapMs = Math.max(1000, Math.floor(input.gapMs) || 1000);

  const busyCampaigns = new Set(open.filter((r) => STILL_WORKING.includes(r.status)).map((r) => r.campaign_id ?? ''));
  /*
   * SPOKEN FOR: every open status, because social_queue_one_open_per_target_idx
   * counts them all. A failure whose group has meanwhile been queued again —
   * by the next round, or by a quick publish — is left exactly where it is;
   * trying to revive it would be a unique-index rejection, not a publication.
   */
  const busyTargets = new Set(open.map((r) => r.target_id));
  const tailMs = open.reduce((t, r) => Math.max(t, Date.parse(r.scheduled_at) || 0), 0);

  const ready = failed.filter(
    (r) =>
      r.attempts < REVIVE_ATTEMPT_CEILING &&
      !busyCampaigns.has(r.campaign_id ?? '') &&
      !busyTargets.has(r.target_id),
  );
  if (!ready.length) return [];

  /*
   * AFTER EVERYTHING ELSE. The account's own floor is the spacing — the same
   * number the publish gate enforces — so the second pass cannot go out faster
   * than the first did, and rules.ts still holds each row to its campaign's
   * days and hours exactly as it does for a row the planner wrote.
   */
  const start = Math.max(nowMs + REVIVE_CUSHION_MS, tailMs ? tailMs + gapMs : 0);
  /*
   * ONE ROW PER GROUP IN THIS PASS TOO. Two failures for the same group — one
   * per post — would both be revived into open rows, and the second write
   * would be rejected by the same unique index. The first one goes; the other
   * is left for the pass after it.
   */
  const seen = new Set<string>();
  const out: Revival[] = [];
  for (const row of ready) {
    if (seen.has(row.target_id)) continue;
    seen.add(row.target_id);
    out.push({ id: row.id, at: new Date(start + out.length * gapMs).toISOString() });
  }
  return out;
}
