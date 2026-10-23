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
export const WORKER_VERSION = '4.17.0';

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
 * ANSWERED OUT LOUD, 4.16.0 → 4.17.0, AND THIS TIME IT IS YES.
 *
 * src/lib/social/plan.ts changed, and plan.ts is the planner the PC worker
 * runs every sixty seconds — the one file this comment was written about.
 * planDrip() retired a fully-blocked launch without writing a word: every
 * "פרסם עכשיו" over groups that already hold a row from another round queued
 * nothing, logged nothing, and left the post reading "טרם פורסם" in the
 * library for ever. The loop beside it has said so since it was written; this
 * one never did. The fix only works where the planner actually runs, so the
 * machine has to take it.
 *
 * The other src/lib/social files in this change — crash.ts, campaign.ts,
 * client.ts, activity.ts, activity-text.ts — are NOT in the worker's import
 * closure (account-scope, cities, compose, discovery, errors, plan, rules,
 * tenant, time, types, and through plan: slots, projection,
 * campaign-schedule, status, variants). They ride along inside worker.cjs
 * because the alias puts all of src/lib/social there; nothing on the PC
 * executes them.
 */
export const WORKER_FINGERPRINT = '083870f0ca62df0a';
