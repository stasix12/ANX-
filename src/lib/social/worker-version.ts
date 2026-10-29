/**
 * The local browser worker's build number, shared so the dashboard can say
 * when the copy running on the owner's PC is older than the app it is talking
 * to. Bump it whenever a change to worker/ has to reach that machine before it
 * takes effect.
 *
 * This exists because a stale worker is invisible otherwise: it heartbeats,
 * reports a healthy Facebook login and publishes — just without whatever was
 * fixed. The only evidence was a version number in one line of its terminal
 * output, which nobody reads.
 */
export const WORKER_VERSION = '4.20.0';

/**
 * A FINGERPRINT OF EVERYTHING THE INSTALLER CARRIES.
 *
 * The comment above says to bump the version "whenever a change to worker/ has
 * to reach that machine", and that sentence has a hole in it that cost an
 * afternoon: the planner is not under worker/. It is src/lib/social/plan.ts,
 * next to the dashboard's own modules, and build-app.mjs aliases `@` to src —
 * so it is inside worker.cjs all the same. Two correct fixes to it shipped to
 * the website and to nobody's PC, because the release workflow will not
 * publish a version number that is already out, and nothing said so.
 *
 * worker/test/worker-release.test.ts hashes the files that really end up in
 * the package and compares them with this. When they differ it fails and names
 * the new value — which forces the one question that was missed: does this
 * have to reach the PC? If yes, bump WORKER_VERSION above. If no, paste the
 * fingerprint. Either way it is answered out loud.
 *
 * ANSWERED OUT LOUD, 4.18.0 → 4.19.0, AND IT WAS YES. One change in that run
 * executes on the PC:
 *
 *   • social-worker.ts: a publication that failed before the "פרסום" click
 *     went back on the queue at +10 minutes, then at +20, and only the third
 *     attempt was allowed to fail for good. One open row per group, so each
 *     failing group was also barred from the next round for that half hour —
 *     and the first two attempts write 'scheduled', which no screen draws, so
 *     nothing said so. The first failure is terminal now, except for the
 *     faults that are this computer's own (a closed Chromium window, a
 *     dropped line), which are handed back with the attempt unspent.
 *
 * AND ANSWERED AGAIN, TWICE, BOTH TIMES NO: the fingerprint moves, the number
 * does not.
 *
 *   • client.ts re-stamps the queue in waves of six instead of one row at a
 *     time, carries a stall guard on each write and reports progress;
 *     supabase.ts puts a sixty-second ceiling under every request the BROWSER
 *     makes, because supabase-js sets none and a connection that dies
 *     mid-flight never settles.
 *   • campaign.ts's runBadge() now also returns WHICH rows its label is about,
 *     so the dashboard's state badge can open them ("בריבוע של דורש טיפול /
 *     הסתיים עם כשלים... זה יביא אותי לעמוד של הכשלים"), and client.ts's
 *     listQueue can narrow to one round.
 *
 * All of it is read by screens, not by the worker — the PC has its own client
 * in worker/db.ts and its own loop, and none of these files is in its import
 * closure. Bumping the version for them would send the owner to reinstall for
 * a change his computer does not run.
 *
 * AND NOW 4.19.0 → 4.20.0, WHICH IS YES AGAIN. "פוסטים שנכשלו... להחזיר אותם
 * לתור אחרי שפרסם את כל הקבוצות בסבב ולנסות שוב." A failure is still final on
 * the spot — nothing waits ten minutes and no group is held — but when a round
 * has finished every group it had, its failures go back to the END of the
 * queue for exactly one more attempt. The loop that does it is the worker's
 * (social-worker.ts) and the rules it follows are worker/revive.ts, both of
 * which run on the PC and nowhere else.
 *
 * The other src/lib/social files that ride along — crash.ts, campaign.ts,
 * client.ts, activity.ts, activity-text.ts, server/sync.ts, server/worker.ts
 * — are NOT in the worker's import closure either. They are inside worker.cjs
 * because the alias puts all of src/lib/social there; nothing on the PC
 * executes them.
 */
export const WORKER_FINGERPRINT = 'fef1b1e8e77797be';
