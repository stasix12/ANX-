/**
 * THE ADMISSION SECTION — the only thing two publishing lanes may not do at
 * once, and the cursor that keeps them a gap apart.
 *
 * WHY THIS EXISTS. worker/social-worker.ts published strictly one row at a
 * time, and the twenty-line note above that loop says why: every limit in
 * src/lib/social/rules.ts is a COUNT or a read taken BEFORE any of the batch
 * has written its outcome. Two rows running together read the same "published
 * today", the same last `published_at`, and then — since the composer now
 * holds the final click for an instant derived from that same reading — hold
 * for the SAME instant and click together. worker/facebook/composer.ts:309-317
 * states the hazard in its own words. Measured on the harness: two naive
 * lanes on a 30-second floor published at a mean of 14.85s with 99 of 99
 * intervals UNDER the floor, minimum 0.25s.
 *
 * SO THE LANES ARE SPLIT IN TWO HALVES. The half that reads a count and
 * decides — the claim, the rules, the slot — runs inside `run()`, one lane at
 * a time, in claim order. The half that is slow and belongs to a remote
 * machine — the page load, the typing, the upload — runs outside it, in
 * parallel. That is the whole of the parallelism, and it is enough: the gap
 * stays the gap, and the publication's own 30-60 seconds stops being added to
 * it.
 *
 * TWO CURSORS, NOT ONE, and the second one is what makes the floor
 * unconditional.
 *
 *   `issuedMs` is the PLANNING cursor. It is advanced when a row is claimed,
 *   so lane k aims at an instant k gaps past lane 0's instead of at the same
 *   one, and the hold inside the composer absorbs that lane's preparation.
 *
 *   `clickMs` is the COMMIT cursor. It is advanced at the moment a lane has
 *   finished preparing and is about to click. A planning cursor alone is only
 *   as good as the estimate it was seeded with: measured, a 10-second estimate
 *   against a real 45-second publication still broke the floor 2 times in 99,
 *   once by a full 30 seconds, because both lanes finished preparing before
 *   either had published and each read the same stale `published_at`. Taking
 *   the commit cursor under the same mutex makes two consecutive CLICKS a gap
 *   apart by construction, whatever the estimate was. With it: 0 of 99, in
 *   every configuration measured.
 *
 * ONE PROCESS ONLY. Both cursors live in this process's memory, so this is
 * sound only while exactly one worker is live — which worker/social-worker.ts
 * already enforces by name at startup, and which composer.ts:309 already
 * states as a precondition of the hold. A second copy signed into the same
 * account is a way to publish twice at once, and that was true before this
 * file existed.
 *
 * NOTHING HERE TOUCHES FACEBOOK. It paces the owner's own queue against the
 * owner's own configured floor. It does not retry a refusal, hide a request,
 * or publish faster than the number on his settings screen.
 */

export interface SlotRequest {
  /** The account floor for this row, in milliseconds. */
  gapMs: number;
  /** The instant rules.ts already decided this row may not precede. */
  notBeforeMs: number;
  /** The account's last real publication, 0 when there has never been one. */
  lastPublishedMs: number;
  nowMs: number;
}

export class Admission {
  private tail: Promise<unknown> = Promise.resolve();
  private issuedMs = 0;
  private clickMs = 0;

  /**
   * Runs `fn` with no other lane's admission work interleaved, in call order.
   *
   * `.then(fn, fn)` rather than `.then(fn)`: a lane that threw must not wedge
   * the queue behind it for the life of the process.
   */
  run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.then(
      () => undefined,
      () => undefined,
    );
    return next;
  }

  /** The instant this lane should AIM at. Call inside run(), after the claim. */
  issue(req: SlotRequest): number {
    const fromLast = req.lastPublishedMs > 0 ? req.lastPublishedMs + req.gapMs : 0;
    const fromIssued = this.issuedMs > 0 ? this.issuedMs + req.gapMs : 0;
    const at = Math.max(req.notBeforeMs, req.nowMs, fromLast, fromIssued);
    this.issuedMs = at;
    return at;
  }

  /**
   * The instant this lane may CLICK. Call inside run(), after the prep and
   * before the hold — this is the line that makes the floor unconditional.
   */
  commit(req: { gapMs: number; slotMs: number; nowMs: number; lastPublishedMs: number }): number {
    const fromClick = this.clickMs > 0 ? this.clickMs + req.gapMs : 0;
    const fromLast = req.lastPublishedMs > 0 ? req.lastPublishedMs + req.gapMs : 0;
    const at = Math.max(req.slotMs, req.nowMs, fromClick, fromLast);
    this.clickMs = at;
    return at;
  }

  get lastIssuedMs(): number {
    return this.issuedMs;
  }

  get lastClickMs(): number {
    return this.clickMs;
  }
}

/**
 * HOW MANY LANES MAY ACTUALLY RUN, which is not the same as how many the owner
 * asked for.
 *
 * Lane k is held for k gaps past lane 0, and worker/facebook/composer.ts:168
 * caps any single hold at PREP_HOLD_CAP_MS — three minutes. On the shipped
 * 65-minute floor lane 1's slot is sixty-five minutes out, the cap truncates
 * it to three, and the lane clicks 62 minutes early: a second lane would turn
 * a 65-minute floor into a 3-minute one. So the lane count is bounded by how
 * many whole gaps fit inside that cap — at 30 seconds that is seven, so three
 * stand; at 65 minutes it is one, and the engine is serial exactly as it is
 * today without anyone having to remember to switch it back.
 *
 * `serial` collapses it to one lane for the cases where a second lane is
 * meaningless or harmful: confirmation mode parks a publication on a question
 * to a person for up to fifteen minutes (CONFIRM_TIMEOUT_MS), and two
 * questions at once is two fifteen-minute holds for one answer.
 */
export function laneCountFor(opts: { want: number; gapMs: number; holdCapMs: number; serial: boolean }): number {
  if (opts.serial) return 1;
  const want = Math.max(1, Math.min(3, Math.round(opts.want) || 1));
  if (opts.gapMs <= 0) return 1;
  const fits = 1 + Math.floor(opts.holdCapMs / opts.gapMs);
  return Math.max(1, Math.min(want, fits));
}

