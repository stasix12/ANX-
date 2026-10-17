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
export const WORKER_VERSION = '4.16.0';

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
 * ANSWERED OUT LOUD, 4.16.0 → 4.16.0: the last change to src/lib/social was
 * invariants.ts, and `grep -rn 'checkCampaignInvariants\\|campaignStates'
 * worker/ desktop/` returns nothing. Those checks run where the counts are
 * drawn — the dashboard and the round page — and the worker neither calls them
 * nor reads their output. The code is inside worker.cjs because the alias puts
 * all of src/lib/social there; nothing on the PC executes it. So the version
 * holds, and the machine is not asked to install a build that would change
 * nothing for it.
 */
export const WORKER_FINGERPRINT = 'be6de3c83cc7bbf7';
