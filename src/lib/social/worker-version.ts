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
export const WORKER_VERSION = '4.18.0';

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
 * ANSWERED OUT LOUD, 4.17.0 → 4.18.0, AND AGAIN IT IS YES. v4.17.0 is
 * already published (10:41 today), so reusing the number would mean the
 * release workflow refuses it and not one installed copy ever sees this —
 * which is the exact failure this fingerprint exists to prevent.
 *
 * Four changes in this one run the PC, and every one of them is about the
 * same thing: a post that may already be live on Facebook.
 *
 *   • social-worker.ts: a post-click error that is not a PublishError was
 *     blind-retried, so the same post went to the same group twice. The step
 *     the job reached is the evidence and it now decides.
 *   • social-worker.ts: the startup sweep parked EVERY in-flight row as
 *     "may already be posted", including rows that died before the composer
 *     opened — and because one open row locks its group, those groups sat
 *     out every future round. It splits by the row's own step now.
 *   • social-worker.ts: the confirmation gate read `confirmed_at` before the
 *     status, so a cancelled publication could be resurrected; both writes
 *     are compare-and-set now.
 *   • plan.ts: a fully-blocked launch told the owner to wait for the queue
 *     while retiring itself in the same pass.
 *
 * The other src/lib/social files in this change — crash.ts, campaign.ts,
 * client.ts, activity.ts, activity-text.ts, server/sync.ts, server/worker.ts
 * — are NOT in the worker's import closure. They ride along inside worker.cjs
 * because the alias puts all of src/lib/social there; nothing on the PC
 * executes them.
 */
export const WORKER_FINGERPRINT = '3a4f37f255fa6817';
