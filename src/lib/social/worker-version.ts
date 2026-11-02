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
/*
 * 4.23.0 — DOES THIS HAVE TO REACH THE PC? YES, and it is the clearest yes so
 * far: rules.ts IS the decision the PC makes before every single click.
 *
 * Four reads in it discarded their error and read the empty result that came
 * back as a fact — so one dropped connection between his Windows machine and
 * Supabase did not delay a publication, it removed a rule: a paused campaign
 * published, the campaign's own interval was not applied, the minimum gap
 * protecting his Facebook account was not enforced, and the same post
 * published twice to the same group. Left on the dashboard alone this fix
 * would protect the hosted worker and change nothing at all about the machine
 * that actually publishes his posts.
 */
export const WORKER_VERSION = '4.23.0';

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
 * AND ONCE MORE, NO: library.ts. "פרסם עכשיו" was giving every launch a daily
 * publishing window that STARTS at the minute it was pressed — so a launch at
 * 23:40 got nineteen minutes a night, and 292 groups at a 30-second gap
 * finished seven days later. It is the whole clock now. The function that
 * computes it (draftFor) runs in the BROWSER and writes the window onto the
 * schedule row; the PC reads that row and plans from it, so the fix reaches
 * the owner's customer the moment they launch, with nothing to reinstall.
 *
 * AND AGAIN, NO: campaign.ts and client.ts. A round that has been launched
 * but whose rows the planner has not written yet now says so and counts, in
 * place of "הסבב עוד לא הושק" — a denial of the thing the owner had just
 * done, and the whole of "וזה נראה כמו באג". Both files are read by screens.
 *
 * AND 4.20.0 → 4.21.0, WHICH IS YES, AND IT IS THE PC'S OWN CLOCK.
 * "המערכת מציגה לפעמים שהמחשב מנותק למרות שהוא מחובר."
 *
 * The dashboard decides the computer is connected from social_workers
 * .last_seen_at against a ninety-second cutoff, and that column was written by
 * heartbeat() — A STEP IN THE PUBLISHING LOOP. So every slow thing the worker
 * did pushed the next write out by exactly that long: group discovery runs 2-6
 * minutes with no write at all, a Facebook login challenge waits up to SIX
 * minutes for the code, and on an idle tick all four chores plus the update
 * check run back to back with at most one write between them. The machine was
 * up and publishing every time.
 *
 *   • worker/pulse.ts (new) puts the write on its own timer, re-armed BEFORE
 *     each write rather than after, so the interval cannot be stretched by
 *     anything the loop or the database is doing. It repeats whatever status
 *     the last transition recorded, so it can never promote a worker that is
 *     asking for help back to "online".
 *   • worker/timed-fetch.ts (new) + worker/db.ts put the same sixty-second
 *     ceiling under the worker's requests that supabase.ts already puts under
 *     the browser's. Without it a dead socket holds one write in flight for
 *     ever and the timer, correct as it is, never writes again.
 *   • worker/social-worker.ts starts the pulse before the first login check
 *     and stops it on both ways out.
 *
 * All four run on the PC and nowhere else.
 *
 * AND IN THE SAME 4.21.0, THE WORST FINDING IN THE AUDIT, WHICH IS ALSO THE
 * QUIETEST. social_queue_one_open_per_target_idx allows ONE OPEN ROW PER
 * GROUP, and a row left in 'publishing' is open — so that group is absent from
 * every round the planner builds afterwards, the campaign card reads רץ below
 * 100% for ever because the row never finishes, and because the lock is per
 * group and account-wide, one wedged row shortens the next round of a
 * DIFFERENT campaign.
 *
 * Both recoveries missed it. server/worker.ts's sweepStuck() sat BELOW the
 * refusal that returns early when social_tenants holds more than one business
 * — so it has not run since the customer was added, switched off by a guard
 * put above it for an unrelated reason. And the worker's startup sweep is
 * scoped `.eq('worker_id', state.id)` and runs only at startup: it covers a
 * crash-and-restart and nothing else.
 *
 *   • worker/stranded.ts (new) holds the decision, with its own test: which
 *     claims count as abandoned, and the rule that outranks recovery itself —
 *     a row whose post MAY ALREADY BE LIVE is never re-queued, only parked for
 *     the owner with step 'submitted'. Inverting that is a second post in the
 *     same group.
 *   • worker/social-worker.ts sweeps on its own clock, before anything is
 *     claimed and not behind the pause, because a wedged row is what blocks
 *     the queue.
 *   • src/lib/social/server/worker.ts moves its sweep above the refusal. That
 *     file runs on Vercel, not here, so it rides along in the fingerprint
 *     without needing the version.
 *
 * The version was already going to 4.21.0 for the pulse, and this ships in the
 * same install rather than asking the owner to update twice.
 *
 * AND ONE MORE, NO: client.ts. listWorkers() computed `online` from
 * last_seen_at alone, so a worker that had just reported status 'offline' was
 * drawn as a healthy green computer for another ninety seconds — the same
 * fault pointing the other way, and the more expensive direction, because a
 * round launched inside that window shows a connected PC and then nothing
 * moves. Read by screens.
 *
 * (activity.ts and activity-text.ts move in the same change, to name the new
 *  stuck_rows_requeued event. Those two maps are read by screens; the worker
 *  only writes the event name, so they need the fingerprint and not the
 *  version.)
 *
 * AND AGAIN, NO: client.ts and library.ts. A campaign-scoped re-space was
 * writing the ACCOUNT-WIDE spacing floor in both directions, so widening one
 * round in the queue tuner slowed every other round in the account — the
 * product refuses exactly this three lines up the same handler
 * (matchAccountGapTo "only ever LOWERS"), and applyGapFloor had the authority
 * to undo the refusal. It is scoped now, and the respace report says so when
 * the floor is higher than the round asked for. Both functions run in the
 * BROWSER; the PC reads the settings they write, so the fix reaches the owner
 * with nothing to reinstall.
 *
 * AND ONCE MORE, NO: client.ts. Removing a group from a running round took it
 * off the round's active schedules; ADDING one never did, and the weekly
 * re-arm writes only mode/hours/active. So an added group published today and
 * the round reverted to the old list tomorrow — the strongest single
 * explanation for "פוסטים לא מתפרסמים בשעות שהגדרתי" on groups he is certain he
 * added. planTargets() is the mirror that was never written. Browser-side.
 *
 * AND AGAIN, NO: client.ts gains refreshQueuedText(). The planner freezes the
 * rendered text onto each queue row and the worker publishes that snapshot, so
 * editing a post changed only FUTURE rows while the editor said "הפוסט נשמר."
 * It now re-renders the rows that have not started, writing rendered_text and
 * dedupe_hash together. Browser-side; the PC reads the rows it is given.
 *
 * AND ONE MORE, NO: client.ts gains syncWeeklyHours(). The hour the owner sets
 * in "ערוך מועד" is written to the campaign row, but the row the PLANNER works
 * from is a social_schedules weekly row with its own hours — and it was
 * re-armed only when the CHZARA switch was on, while a launch from the editor
 * creates an ACTIVE weekly row without touching that switch. Browser-side.
 *
 * AND 4.21.0 → 4.22.0, WHICH IS YES — AND IT CLOSES A DOOR 4.21.0 OPENED.
 *
 * The stranded-row sweep in 4.21.0 reads the ROW's `step` to decide whether a
 * publication reached the Post button. The step write in onStep had its error
 * DISCARDED — supabase-js resolves with { data, error } rather than throwing —
 * so a failed UPDATE was a no-op nobody noticed, while `lastStep` still moved
 * in memory and this process's own answer stayed right.
 *
 * Put together: the write of 'publishing' fails, the click lands, the post is
 * on Facebook, the write of 'verifying' fails too (one blip, two writes), the
 * row is later stranded — and fifteen minutes later the sweep reads a pre-click
 * step and publishes the same post to the same group A SECOND TIME. Before the
 * sweep only a restart could do that; the sweep made it reachable every fifteen
 * minutes, so closing it belongs to the same release.
 *
 *   • social-worker.ts captures the step write's error. composer.ts awaits
 *     onStep, and the click sits between 'publishing' (:367) and 'verifying'
 *     (:372) — so a PRE-CLICK failure throws, the click never happens, nothing
 *     is published, and the row goes back to the queue in a minute with its
 *     attempt unspent through LOCAL_FAULT_RE. After the click there is nothing
 *     safe to throw about: the row stays on 'publishing', which both sweeps
 *     already read as maybe-live, and the loss is logged instead.
 *
 * It runs on the PC and nowhere else.
 *
 * AND ONE MORE, NO: client.ts widens RESTAMP_LANES from 6 to 24. A 218-row
 * re-space was 37 waves plus six round trips of overhead, which on a phone on
 * 4G is past the tuner's ninety-second deadline — so the owner was told the
 * change had not been confirmed over a queue that was in fact re-spaced
 * correctly. Browser-side; the PC reads the rows it is given.
 *
 * The other src/lib/social files that ride along — crash.ts, campaign.ts,
 * client.ts, library.ts, activity.ts, activity-text.ts, server/sync.ts,
 * server/worker.ts — are NOT in the worker's import closure either. They are
 * inside worker.cjs because the alias puts all of src/lib/social there;
 * nothing on the PC executes them.
 */
/*
 * c3b546e1 → 3c27cd3ae7388f90. DOES THIS HAVE TO REACH THE PC? NO, and this time the
 * answer was MEASURED rather than argued.
 *
 * The change is in src/lib/social/client.ts (the browser data layer) and in
 * worker/test/. The fingerprint covers all of src/lib/social, but only part of
 * that directory is actually compiled into the installer — so the honest way
 * to answer this question is to build and look:
 *
 *   npm run build:app
 *   grep -c evaluateQueueItem dist/app/worker.cjs   → 3   (rules.ts IS in it)
 *   grep -c respaceQueue      dist/app/worker.cjs   → 0   (client.ts is NOT)
 *   grep -c QUEUE_SELECT_LITE dist/app/worker.cjs   → 0
 *
 * scripts/build-app.mjs has exactly two entry points, worker/social-worker.ts
 * and desktop/main.ts, and client.ts is reachable from neither: the dashboard
 * the app window shows is served from Vercel, not bundled. So WORKER_VERSION
 * stays at 4.23.0 — which is already released — and the next installer build
 * will correctly decline to publish a version that is already out.
 *
 * The fingerprint being wider than the bundle is the SAFE direction: it asks
 * the question too often rather than missing a change that mattered. The three
 * greps above are how to answer it in thirty seconds instead of guessing.
 */
export const WORKER_FINGERPRINT = '3c27cd3ae7388f90';
