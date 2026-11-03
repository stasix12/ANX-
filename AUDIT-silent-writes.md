# סריקה: כל כתיבה למסד הנתונים שמדווחת על הצלחה שלא נבדקה
נוצר אוטומטית מסריקה של כל נתיב הפרסום. חמישה אזורים נסרקו במקביל, וכל ממצא עבר סוכן נפרד שתפקידו היה **להפריך** אותו. 53 ממצאים, 4 הופרכו, **49 אושרו**.

> זו אותה משפחת באגים שעלתה לנו את כל הלילה: הקוד כותב למסד הנתונים, לא קורא את התשובה,
> ומדווח הצלחה. supabase-js לא זורק שגיאה — הוא מחזיר אותה בשקט, ועדכון שלא התאים לאף שורה
> מחזיר 'בסדר'.

## חוסם פרסום — 14

### `worker/social-worker.ts:3022`

Holds (file is /home/user/ANX-/worker/social-worker.ts). Line 3020-3023 is `await db.from('social_queue').update({...}).eq('id', queueId)` with no destructuring and no .select(); postgrest-js resolves with {error} even for an aborted socket (timedWorkerFetch's 60s ceiling, worker/timed-fetch.ts:23), so nothing can notice. The loop then reads status at 3028 and 3045 returns 'declined' on anything that is not 'awaiting_confirmation' — and a failed read also returns 'declined' via `if (!data)` at 3030. composer.ts:346 maps that to cancelReason 'declined', runJobInner's 2897 test only spares 'timeout'/'stopped', so 2911 writes terminal `status: 'skipped'` and 2912 logs 'הפרסום בוטל לפני הלחיצה הסופית'. The branch is reachable by default, not an edge case: DEFAULT_BROWSER (src/lib/social/types.ts:594) ships testMode: true AND requireConfirmation: true, and 2509 ORs those into `requireConfirmation`, which installs the confirm callback at 2654. The long comment above the write defends confirmed_at: null and the two compare-and-set writes below (3047, 3060) — it never claims this park write is checked, so there is no author defense to lean on.

**התיקון**

```ts
Check it and treat a refused park as 'not a decision', so the row is handed back rather than killed:

  const { data: parked, error: parkErr } = await db
    .from('social_queue')
    .update({ status: 'awaiting_confirmation', confirmed_at: null, screenshot_path: screenshot, step: 'ready_to_publish', step_at: new Date().toISOString() })
    .eq('id', queueId)
    .select('id');
  if (parkErr || !parked?.length) {
    console.error('[worker] ✗ לא הצלחנו לבקש אישור על המסך:', parkErr?.message ?? 'השורה לא עודכנה');
    return 'stopped'; // routes to the 2897 hand-back (five minutes out), never to terminal skipped
  }
```

### `worker/social-worker.ts:4310`

Holds. `const { data: previous } = await db...` at 4310-4318 drops `error`, `since` at 4321 becomes undefined, and the gate at 4331 (`if (since && ...) continue`) is skipped entirely — fail-open. This is the same shape the author already fixed 3,500 lines earlier in spacingGate(): 719 destructures `error: lastError` and 735 returns `open: false` with the comment 'A SPACING READ THAT FAILED MEANS WAIT, NOT GO… that is how an account gets flagged, arrived at through a network blip'. The surrounding comment at 4287-4309 only explains why the clock moved from memory into `comment_at`; it never claims the read is guarded. The adjacent claim write at 4343-4348 *does* check `claimed.error` and logs 'comment_claim_failed', which proves the author's own standard and that this read was simply missed. Rate math checks out: COMMENTS_PER_TICK = 1 (4014) and env.pollMs defaults to 5000 (worker/env.ts:111), so against comment_gap_seconds = 30 the account comments ~6x too fast while the read keeps failing, with jitterFor() bypassed and no log line anywhere saying the gap was skipped.

**התיקון**

```ts
Hold instead of going, exactly as spacingGate():735 does:

  const { data: previous, error: prevErr } = await db
    .from('social_queue')
    ... .maybeSingle();
  /* A spacing read that failed means WAIT, not GO — same rule as spacingGate(). */
  if (prevErr) continue;
```

### `worker/social-worker.ts:2380`

Holds, and it is the most load-bearing of the ten. 2378-2384 keeps only `data`, so `if (!claimed?.length) return;` collapses two opposite facts into one: 'another lane won the compare-and-set' and 'the database refused this UPDATE'. Verified there is no compensating instrument: the due SELECT at 907-915 throws on its own error but a SELECT stays legal under an UPDATE-only policy denial; 1097 clears idleNoticeShown before the lanes start, so idle()'s 'worker_holding' notice cannot fire; the lane .catch at 2168 needs a throw and nothing throws; state.worked is never set, so the loop just polls. The author's own fixed counterpart is 60 lines of the comment chore away — the comment claim at 4343-4360 destructures `claimed.error` and writes 'comment_claim_failed' with 'SAID, not swallowed… Discarding it left the terminal silent, the log silent'. That is exactly this line, unfixed, on the publishing path.

**התיקון**

```ts
Tell the two apart, and say it once (mirroring the comment-claim fix at 4349):

  const { data: claimed, error: claimErr } = await db
    .from('social_queue')
    .update({ status: 'publishing', step: 'opening', step_at: now, claimed_at: now, worker_id: state.id, attempts })
    .eq('id', item.id)
    .eq('status', 'scheduled')
    .select('id');
  if (claimErr) {
    if (!state.claimNoticeShown) {
      state.claimNoticeShown = true;
      state.notice = 'לא הצלחנו לתפוס פרסומים מהתור — ייתכן שצריך להריץ את social-latest.sql ב-Supabase.';
      console.error('[worker] ✗ תפיסת פרסום נכשלה:', claimErr.message);
      await logActivity('error', 'claim_failed', 'לא הצלחנו לתפוס פרסום מהתור. התור נראה תקוע אף שהמחשב פועל.', { queueId: item.id, detail: claimErr.message });
    }
    return;
  }
  if (!claimed?.length) return;
  state.claimNoticeShown = false;

(add `claimNoticeShown?: boolean` to WorkerState beside commentNoticeShown)
```

### `worker/social-worker.ts:447`

Holds. The crash-recovery park at 445-450 takes neither {error} nor .select(), and the complementary requeue at 457-463 keeps only `data`, so its 'N פרסומים … הוחזרו לתור' line at 464-465 simply does not print and nothing takes its place. The write runs immediately after registration at 387-394 and before the pulse starts at 533, i.e. on the very first requests of the process. Consequence verified: rows stay 'publishing'/'awaiting_confirmation' with maybe-live steps, so they are absent from 'דורשים אתכם' while social_queue_one_open_per_target_idx keeps each group out of every planned round, and the only backstop is sweepStranded() — which the file's own comment at 1304-1308 says the startup sweep is supposed to cover, and which waits STRANDED_AFTER_MS = 15 min from claimed_at plus up to STRANDED_EVERY_MS = 2 min pacing (1315, 1331). The author uses applied() for exactly these two writes inside sweepStranded (1356, 1379) and not here.

**התיקון**

```ts
Destructure both and say it when the recovery itself failed (no prior count exists, so this is a plain error check rather than applied()):

  const { error: parkErr } = await db
    .from('social_queue')
    .update({ status: 'needs_attention', step: 'submitted', error: 'ה-worker הופסק באמצע העבודה. בדקו בקבוצה אם הפוסט עלה, ואז "נסה שוב" או "דלג".' })
    .eq('worker_id', state.id)
    .in('status', ['publishing', 'awaiting_confirmation'])
    .in('step', MAYBE_LIVE_STEPS);
  if (parkErr) await logActivity('error', 'write_failed', `שחזור אחרי הפעלה מחדש נכשל — פרסומים שאולי עלו לא הועברו ל"דורשים אתכם": ${parkErr.message}`, { what: 'startup_park', detail: parkErr.message });

  const { data: requeued, error: requeueErr } = await db ... .select('id');
  if (requeueErr) await logActivity('error', 'write_failed', `שחזור אחרי הפעלה מחדש נכשל — פרסומים שלא הגיעו ללחיצה לא הוחזרו לתור: ${requeueErr.message}`, { what: 'startup_requeue', detail: requeueErr.message });
  else if (requeued?.length) console.log(`[worker] ↻ ${requeued.length} פרסומים שלא הגיעו ללחיצה הוחזרו לתור אחרי ההפעלה מחדש.`);
```

### `src/lib/social/plan.ts:679`

Tried to refute and could not. Line 679 is exactly `const { data } = await db` in targetsAlreadyWaiting; the error is discarded and `data ?? []` turns a dropped read into an empty Set. I checked the downstream guard the finding claims is gone: supabase/social-latest.sql:1160-1161 and social-schema-v33.sql:66-69 BOTH `drop index if exists social_queue_one_open_per_target_idx` and `..._post_idx`, so on a migrated database no index refuses the insert and takenByAnotherPlanner() (which matches on those index names, line 644) can never fire. The only surviving per-post brake is this read, and the docstring at 648-663 says so in the author's own words, with his measured numbers. The second guard, `taken`, is checked only AFTER `waiting` (line 335 before line 352) and is instant-keyed, so it does not cover a drip (dripSlots' running floor at slots.ts:63 is `now`-derived, so drip instants drift every tick) nor any occasion whose computed instant moved. Verdict: real class-E fail-open; the brake releases on the one answer that lets the queue grow without bound against a frozen published count.

**התיקון**

```ts
async function targetsAlreadyWaiting(db: SupabaseClient, postId: string): Promise<Set<string>> {
  const { data, error } = await db
    .from('social_queue')
    .select('target_id')
    .eq('post_id', postId)
    .in('status', OPEN_STATUSES);
  /* FAIL CLOSED, for the same reason stoppedCampaigns() does: planQueue's
     caller catches and retries in 60s, and an empty set here means "nothing is
     waiting", which is the one answer that re-queues every group every tick. */
  if (error) throw new Error(error.message);
  return new Set((data ?? []).map((r) => r.target_id as string));
}
```

### `src/lib/social/client.ts:4755`

CONFIRMED, and worse than claimed — I use the blocks-publishing bucket for priority, not because the queue sticks: the real exposure is a SECOND post to a group. The premise holds exactly: liveQueuePlan:3748 reads `.in('status', PENDING)` and PENDING (3646) is AUTOMATIC_WAITING_STATUSES = ['scheduled','paused'] (status.ts:108), so the `already` set at 4738 cannot contain a group whose row is 'publishing', 'needs_attention', 'manual_pending' or 'awaiting_confirmation'; this read, with OPEN_STATUSES, is the only thing that catches them, and `const { data: openRows }` drops the error so a failed read reads as 'no open row' and the group lands in `fresh`. The database cannot refuse the twin — social-schema-v33.sql:66 and social-latest.sql:1160 drop social_queue_one_open_per_target_idx. The author's comment at 4746-4753 does defend the RACE, and its fallback is 'rules.ts refuses a post that has already gone to a target' — but rules.ts:595-601 reads only `.eq('status','published')`. A group whose sole row is needs_attention with step 'submitted' (MAYBE_LIVE_STEP — the post may already be live, status.ts:73-98) has nothing published, so the twin passes 629, passes the dedupe_hash check at 673-687 for the same reason, and publishes. That is the 'רשום דולג, אבל בפועל ראיתי שזה פרסם' class in reverse, and this read is its only guard on this path.

**התיקון**

```ts
const openRes = await db()
    .from('social_queue')
    .select('target_id')
    .eq('post_id', plan.postId)
    .in('target_id', wanted)
    .in('status', OPEN_STATUSES);
  if (openRes.error) throw friendlyError(openRes.error);
  for (const row of (openRes.data ?? []) as { target_id: string }[]) already.add(row.target_id);

Refusing the add is the right direction here: the owner can press again, and QueueTunerSheet already reports the count from the insert's own `.select('id')` at 4836.
```

### `src/lib/social/server/worker.ts:453`

CONFIRMED, and it is the worst one. The branch is live, not dead: registry.ts maps facebook_page -> facebookPageChannel, facebookPage.ts:40 sets apiPublishing:true and returns { mode:'api' } from three places, sync.ts:47 writes can_api_publish from the granted page tasks, and line 46 puts facebook_page in SERVER_CHANNELS, so the claim query at 213-220 selects exactly these rows. The UPDATE at 453-464 destructures nothing; postgrest-js never rejects (PostgrestBuilder.ts:389-456 converts a fetch failure into { data:null, error, status:0 }), so a rejected write is indistinguishable from a successful one. logActivity('published') at 466 and report.published+=1 (line 237) then both run. The owner's three readers of that number are real: src/app/social/page.tsx:883, QuickPublishSheet.tsx:465 (whose own comment says "The run's real numbers, not a summary of intent") and PostEditor.tsx:576. The row is left status='publishing' with published_at NULL, so every rule that counts status='published' (rules.ts:213, 549, 553, 562, 676, 691) cannot see the publication and the next due row goes out with no gap; 15 minutes later sweepStuck (289) rewrites it 'failed' with 'אפשר לנסות שוב' and a human retry double-posts to a live page. The PC worker guards the identical write with finishChecked (worker/social-worker.ts:2425) + persist() + publish_unrecorded (2942-2968) and its comment says why: 'the published write is the one the whole no-double-post guarantee rests on'. Two over-claims in the report, neither load-bearing: social_queue_one_open_per_target_idx was DROPPED by v33 (supabase/social-latest.sql:1160), so the group is not account-wide locked out — only this post/target pair is held, via targetsAlreadyWaiting (plan.ts:678, filtered by post_id).

**התיקון**

```ts
Mirror the PC worker. Replace the bare await with `const { error: recErr } = await db.from('social_queue').update({...}).eq('id', item.id);` and before the 'published' log: `if (recErr) { await logActivity('error','publish_unrecorded', `פורסם ל-"${tt.name}" אבל לא הצלחתי לרשום את התוצאה. הפרסום קיים בפייסבוק — סמנו את השורה ידנית.`, { queueId: item.id, permalink: result.permalink, detail: recErr.message }); return 'failed'; }` — do NOT throw (the caller's catch at 238 writes status:'failed', which invites the retry that double-posts) and do not write the 'published' line. Follow-on in the same patch: sweepStuck's 289 filter must leave such a row alone (add `.neq('step','submitted')` and write step:'submitted' here) or the 15-minute sweep re-arms a post that is live.
```

### `src/lib/social/server/worker.ts:351`

CONFIRMED. The three entity reads destructure only { data }. maybeSingle() on a dropped connection or a 503 resolves { data:null, error } (PostgrestBuilder.ts:389-456), so `t` is null and evaluateQueueItem returns { action:'skip', reason:'היעד נמחק.' } (rules.ts:250) — or 'הפוסט נמחק או הועבר לארכיון.' (rules.ts:251) for social_posts — and skip() writes a terminal row with that sentence as skip_reason. The target exists and is enabled; one dropped request destroys the publication and tells the owner his group was deleted. The contrast inside the engine is deliberate and documented: rules.ts:317/356/478/618/706 each return a one-minute attention wait rather than let a failed read decide, with the comment 'A FAILED READ IS NOT "NOTHING HAS PUBLISHED YET"'. Nothing re-arms the row automatically (only a human 'נסה שוב', since skipped is in RETRYABLE).

**התיקון**

```ts
Keep the responses and hand the row back instead of letting null decide: `const [tRes, pRes, vRes] = await Promise.all([...]); if (tRes.error || pRes.error || (vRes as {error?:unknown}).error) { await db.from('social_queue').update({ status:'scheduled', step:'pending', scheduled_at: new Date(now.getTime()+60_000).toISOString(), attempts: Math.max(0, item.attempts-1) }).eq('id', item.id); await logActivity('warn','rule_read_failed','לא הצלחנו לקרוא את פרטי היעד או הפוסט — ננסה שוב בעוד רגע.', { queueId: item.id }); return 'deferred'; }` then `const t = (tRes.data as SocialTarget|null) ?? null;` etc. Same one-minute hand-back the rules themselves use.
```

### `src/lib/social/server/worker.ts:226`

CONFIRMED — this is the 'machine did nothing, screen said it had' shape exactly. `const { data: claimed }` drops the error, so a rejected UPDATE is indistinguishable from 'another run took this row' and the loop `continue`s. With all five due rows failing, report.processed stays 0, the `if (report.processed)` guard at 250 suppresses the only worker_run log line, and the route returns { ran:true, published:0, manual:0, skipped:0, failed:0, deferred:0, reason:undefined } straight into the toast at page.tsx:883 — 'הריצה הסתיימה: 0 פורסמו, 0 דולגו, 0 נכשלו', every tick, with no reason and nothing in the activity feed or the console. One correction to the scenario: a rotated service key would also break the `due` SELECT at 213, which DOES throw (221) and surfaces as a 500 — so the honest trigger is one that hits the write only: a PostgREST 503/statement timeout on the UPDATE, or an install where a column this UPDATE writes is absent (step/step_at arrive in social-schema-v2.sql:40-41, while the SELECT uses `*` and cannot notice). That last variant is persistent, not transient: every tick for ever reports a clean, empty, successful run.

**התיקון**

```ts
`const { data: claimed, error: claimErr } = await db...select('id'); if (claimErr) { report.reason = `לא הצלחנו לתפוס שורות לפרסום: ${claimErr.message}`; await logActivity('error','claim_failed', report.reason, { queueId: item.id }); break; } if (!claimed?.length) continue;` — a run that could not claim anything must say so instead of reporting a clean zero.
```

### `src/lib/social/server/worker.ts:289`

CONFIRMED, and nothing else in the product can recover these rows. The sweep's first UPDATE has no { error }, no .select('id') and no log line, so a sweep that freed nothing is indistinguishable from one with nothing to free; sweepStuck returns normally and the run reports ran:true. The rows it targets — status='publishing', worker_id NULL — are produced only by this worker's claim at 226, and they are reachable by no other path: 'publishing' is in neither RETRYABLE nor CANCELLABLE_STATUSES (client.ts:1874, status.ts:123), and the PC worker's sweepStranded filters target.channel='facebook_group' (worker/social-worker.ts:1327), which excludes every facebook_page and facebook_group_manual row. So if this one write fails, the row is in flight for ever: counted by resolveState() as 'רץ', and that post/target pair excluded from every later plan (targetsAlreadyWaiting, plan.ts:678). The file's own comment at 136-144 calls this 'the most expensive quiet failure in the product', and the orphan branch 15 lines below (304) already shows the intended standard with .select('id') and a counted warn line. (The comment's account-wide index claim is stale — v33 dropped social_queue_one_open_per_target_idx, supabase/social-latest.sql:1160 — the per-post hold is what remains.)

**התיקון**

```ts
`const { data: stuck, error: stuckErr } = await db.from('social_queue').update({ status:'failed', error:'הריצה נקטעה באמצע הפרסום — אפשר לנסות שוב.' }).eq('status','publishing').is('worker_id', null).lt('claimed_at', stuckBefore).select('id'); if (stuckErr) await logActivity('error','write_failed', `שחרור שורות שנתקעו באמצע הפרסום נכשל: ${stuckErr.message}`, { what:'sweep_stuck' }); else if (stuck?.length) await logActivity('warn','stuck_rows_released', `${stuck.length} פרסומים שנקטעו באמצע שוחררו ואפשר לנסות אותם שוב`, { released: stuck.length });` — measured, like the orphan branch below it.
```

### `src/lib/social/server/worker.ts:297`

CONFIRMED, and the surrounding try/catch is vestigial, which makes it worse than the comment at 339-342 believes: postgrest-js resolves rather than throws for BOTH cases, so a missing social_workers table and a dropped connection arrive identically in the discarded `error`, `workers` is null, `gone` is [], and line 302 returns before anything is logged. Nothing distinguishes a failed tick from a healthy one. The rows this silently abandons are the ones no other sweep will take: worker/stranded.ts:132-135 has the PC worker explicitly stand down when it cannot tell whether another machine is alive, with the comment 'The server's own sweep is the backstop for this case' — and in the scenario the orphan branch exists for (a machine that never came back) the PC worker is not running at all. They stay 'publishing'/'awaiting_confirmation', never reach 'דורשים אתכם' for a person to check in the group, and keep resolveState() at 'רץ'. (Correction to the scenario: a merely RENAMED PC is covered — the new worker's sweepStranded does park group rows held by a gone id, worker/social-worker.ts:1317-1376.)

**התיקון**

```ts
`const { data: workers, error: workersErr } = await db.from('social_workers').select('id, last_seen_at'); if (workersErr) { const missing = workersErr.code === '42P01' || workersErr.code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(workersErr.message ?? ''); if (!missing) await logActivity('error','sweep_read_failed', `לא הצלחנו לקרוא אילו מחשבים מדווחים — שחרור פרסומים שנתקעו לא רץ: ${workersErr.message}`); return; }` — the missing-table case stays silent as intended; a failed read says so.
```

### `src/lib/social/server/worker.ts:304`

CONFIRMED, with its stated trigger corrected. The orphan-release UPDATE honestly counts what came back but discards { error }, so a rejected write yields `freed` null, `if (freed?.length)` false, and no stuck_rows_released warning at all — the one signal that was ever going to appear is suppressed by the same failure that made it necessary. Every later tick behaves identically, the rows never reach 'דורשים אתכם', and (per worker/stranded.ts:132-135) the PC worker is standing down on the understanding that this sweep is the backstop. The report's specific trigger is wrong and should not be used to justify the fix: there is no CHECK constraint on social_queue.step (social-schema-v2.sql:40 is plain `text not null default ''`), and the status CHECK that lacks 'needs_attention' only exists on a pre-v2 install, where social_workers does not exist and this branch is unreachable. An ordinary transport error or statement timeout produces the identical silence.

**התיקון**

```ts
`const { data: freed, error: freedErr } = await db...select('id'); if (freedErr) await logActivity('error','write_failed', `העברת ${gone.length ? 'שורות' : ''} פרסומים של מחשב שאינו מדווח ל"דורשים אתכם" נכשלה: ${freedErr.message}`, { what:'stuck_rows_released', asked: gone.length }); else if (freed?.length) { ...existing warn... }` — same shape as worker/social-worker.ts:1267 applied().
```

### `src/lib/social/server/worker.ts:368`

CONFIRMED. countPublished throws on any count error (rules.ts:215) and runs up to four times per row (549, 553, 562, 676), and the campaign/spacing reads can also throw nothing but return waits — so the one unguarded call at 368 turns a transient read failure into report.failed+=1, status:'failed' with the raw PostgREST string in the `error` column, and logActivity('error','publish_failed') (238-242). Nothing touched Facebook, yet the row reads 'נכשל' on the campaign screen with a database message as its explanation, the toast says '1 נכשל', and 'failed' is terminal — only a human 'נסה שוב' revives it. The PC worker handles the identical throw by handing the row back for one minute with the attempt refunded and the comment 'nothing was tried, so nothing should be spent' (worker/social-worker.ts:2454-2463, whose long note at 2431-2453 is about exactly this window). This file has no such guard.

**התיקון**

```ts
Copy the PC worker's window verbatim: `let decision: Awaited<ReturnType<typeof evaluateQueueItem>>; try { decision = await evaluateQueueItem(db, {...}); } catch (err) { await db.from('social_queue').update({ status:'scheduled', step:'pending', scheduled_at: new Date(now.getTime()+60_000).toISOString(), attempts: Math.max(0, item.attempts-1) }).eq('id', item.id); await logActivity('warn','rule_read_failed', `לא הצלחנו לבדוק את הכללים — ננסה שוב בעוד רגע. ${friendlyMessage(err,'')}`, { queueId: item.id }); return 'deferred'; }`
```

### `worker/db.ts:69`

CONFIRMED, and the auth-js behaviour is as claimed in THIS tree. node_modules/@supabase/auth-js/dist/main/GoTrueClient.js (__loadSession, ~:2545-2576): when the stored access token is past EXPIRY_MARGIN_MS it calls _callRefreshToken, and on error it preserves the session ONLY while `accessTokenStillValid` (expires_at*1000 > Date.now()); once the access token has genuinely expired it returns `{ data: { session: null }, error }`. And _callRefreshToken at :4262-4270 does NOT call _removeSession for an isAuthRetryableFetchError, so the refresh token stays in session.json — a perfectly good identity. db.ts:69 drops that error, so 'the refresh request failed' and 'nobody has ever signed in here' collapse into one branch: the misdiagnosis at :79-81 prints ('יש קובץ חיבור … אבל לא הצלחנו לקרוא ממנו חשבון' — the file read fine, the network did not), the `if (existing.session)` block at :84 is skipped, and with it the entire careful classification at :91-110 ('A FAILED CHECK IS NOT A REVOKED SESSION … A timeout, a DNS failure, a 500, a rate limit: the session is probably fine'), which is applied only to getUser()'s error. The identical distinction on getSession()'s error is never looked at — a comment contradicted by the code 20 lines above it. Reachability verified: the request is not exempt from the ceiling (timed-fetch.ts wantsCeiling exempts only /storage/v1/), there is no retry around workerDb() — main().catch at the end of social-worker.ts just prints and process.exit(1) — and forgetSession() is correctly NOT called on this path. ONE CORRECTION: the auditor says a worker launched by the desktop app throws at sign-in.ts:86-94; it does not. desktop/main.ts:372 sets SOCIAL_WORKER_PROMPTABLE: '1', so `attended` is true and the worker BLOCKS on '  המייל שלכם: ' forever (desktop/main.ts:390-397 even surfaces the prompt as a 'prompt' line). That is not better: a blocked process never reaches the 30-second restart at desktop/main.ts:427-433, so it cannot self-heal when the router comes back, whereas the throw path (start-worker.cmd / Windows at boot, no TTY, no SOCIAL_WORKER_PROMPTABLE) at least exits. Either way one dropped packet at 03:00 plus any restart stops the queue dead until a person types a six-digit code for an account the machine already had.

**התיקון**

```ts
worker/db.ts, immediately at line 69 — hold the identity instead of forgetting it, and let the next start retry the refresh:

    const { data: existing, error: sessionError } = await c.auth.getSession();
    /* A FAILED READ IS NOT AN ABSENT SESSION — the same distinction the block
       below applies to getUser(). auth-js returns { session: null, error } when
       the access token is past its window and the refresh REQUEST failed (DNS,
       429, the 60s ceiling); the refresh token is still in the file and will
       work in a minute. Falling through to signInInteractively() here asks a
       question nobody is awake to answer. */
    if (!existing.session && sessionError) {
      throw new Error(
        `לא הצלחנו לקרוא את החיבור השמור (${sessionError.message}). החיבור לא נמחק — ננסה שוב בהפעלה הבאה.`,
      );
    }

(Throw rather than prompt: under the desktop shell this hits the 30-second restart at desktop/main.ts:427 and recovers by itself once the network is back. A short in-process retry of getSession() before throwing would be strictly better still.)
```

## משקר לך על המסך — 33

### `worker/social-worker.ts:2413`

Holds, with one correction to the scenario's timing. finish() at 2412-2415 discards {data,error} and deletes the row from state.currentJobs at 2414 regardless, while every caller announces the outcome on the next line (2465 'דולג', 2693-2696 needs_attention + bell, 2721, 2781, 2860, 2911). The published path is the only one that uses finishChecked (2425-2429), and the comment at 2416-2424 explicitly licenses the gap — 'That is fine for the failure paths — a lost error message costs an error message' — which is the part that is wrong: the actual cost is a row still reading 'publishing' while the log, the bell and 'דורשים אתכם' assert needs_attention/skipped, plus the one-open-row-per-target lock holding that group out of every planned round (the file's own comment at 2446-2448 spells this out). Correction: recovery is NOT 'up to two minutes'; because 2414 clears currentJobs, pickStranded sees worker_id === selfId and not held, but only after STRANDED_AFTER_MS = 15 min from claimed_at (worker/stranded.ts:49), so the row is wedged ~15-17 minutes, not ~2. That makes it worse than the finding states, not better.

**התיקון**

```ts
Make finish() say when the row did not move (still non-throwing, so each branch keeps reporting its own outcome), and delete the false half of the comment:

  const finish = async (patch: Partial<QueueItem> & Record<string, unknown>) => {
    const { error } = await db.from('social_queue').update({ ...patch, step_at: new Date().toISOString() }).eq('id', item.id);
    if (error) {
      await logActivity('error', 'write_failed', `מצב הפרסום לא נשמר ("${t?.name ?? item.target_id}") — השורה נשארה "מפרסם": ${error.message}`, { queueId: item.id, what: 'job_finish', detail: error.message });
      console.error('[worker] ✗ כתיבת סיום העבודה נכשלה:', error.message);
    }
    state.currentJobs.delete(item.id);
  };
```

### `worker/social-worker.ts:4753`

Holds. heartbeat() at 4743-4776 awaits the social_workers UPDATE with no destructuring, and it is the only writer of last_seen_at/status/attention_message. Since postgrest-js resolves rather than rejects (including for the AbortSignal.timeout path, caught at PostgrestBuilder.ts:391-446), the pulse's write at main():522 can never reject, so onError at 523-531 — written specifically to report this once per distinct reason — is dead for every refused or timed-out write; pulse.stats().errors stays 0 too. The comment at 4744-4747 is about ordering (pulseStatus recorded before the write so the pulse repeats the transition); it does not claim the refusal is detected, and cannot: nothing reads the result. Downstream reader confirmed: listWorkers() (src/lib/social/client.ts:3200-3206) with WORKER_OFFLINE_AFTER_SECONDS = 90 (types.ts:766) turns a frozen last_seen_at into online: false, and the same write carries attention_message, so with state.attention set the gate at tick():902 closes and the dashboard shows an offline machine with no sentence on it.

**התיקון**

```ts
Let the result reach the pulse without changing the explicit callers' behaviour — return the reason, and throw it only on the pulse write:

  async function heartbeat(...): Promise<string> {
    ...
    const { error } = await db.from('social_workers').update({ ... }).eq('id', state.id);
    return error ? error.message : '';
  }

and in main():

    write: async () => {
      const why = await heartbeat(state, state.pulseStatus ?? 'online', state.pulseDebug ?? false);
      if (why) throw new Error(why);
    },
```

### `worker/social-worker.ts:2747`

Holds. The retirement write at 2745-2748 drops {data,error} and 2749 logs 'כובתה הקבוצה "<name>"' unconditionally. The branch is the non-Page arm (state.asPage returns at 2728), so the only guard above it is on identity, not on the write. The comment at 2731-2744 names the exact treadmill this write exists to stop — 'every later round queued another publication into a group the owner had left, each one skipped with the same sentence' — and asserts 'enabled: false makes rules.ts skip it before it is ever claimed', which is only true if the write landed. The author already has the right tool in this file (applied() at 1267, which logs write_failed on {error} and write_partial when fewer rows changed than asked) and does not use it here. Result on failure: enabled stays true, rules.ts keeps admitting the target, every later round burns a claim and a browser window on it, and the feed says it was switched off.

**התיקון**

```ts
Route it through the existing helper and only claim it happened when it did:

  const off = await applied(
    db.from('social_targets')
      .update({ enabled: false, last_status: 'left', last_error: `${message} הקבוצה כובתה ולא ייכנסו אליה פרסומים חדשים.` })
      .eq('id', tt.id),
    1,
    'target_disabled',
  );
  if (off) await logActivity('warn', 'target_left', `כובתה הקבוצה "${tt.name}" — ${message}`, { queueId: item.id, targetId: tt.id, detail: raw });
```

### `worker/social-worker.ts:2311`

Holds. 2311 discards {data,error} and 2312-2313 announce the result to the activity log and console. I checked every reader of the table: the worker only ever selects `.eq('status','pending')` (1913-1919, the idle wake read at 654-659, the verify-code read at 4701-4708), and nothing anywhere re-processes or sweeps a row left in 'running' — grep over worker/ and src/lib/social shows no other writer. The dashboard side matches the finding: waitForWorkerCommand (client.ts:3310-3321) returns only on status 'done'/'failed' and otherwise returns null after COMMAND_WAIT_MS = 150_000, whose documented contract (3302-3305) is 'the command is still in the queue and the machine will run it when it gets to it' — a false statement for work that is finished. Worst case is the login command, which has already been wiped at claim time (1936), so there is nothing to re-run and the screen blocks on a row that will never change.

**התיקון**

```ts
Use the counting helper so a refused or zero-row finish reaches the log and the console:

  const wrote = await applied(
    db.from('social_worker_commands')
      .update({ status: ok ? 'done' : 'failed', result, finished_at: new Date().toISOString() })
      .eq('id', cmd.id),
    1,
    `command_${cmd.command}_finished`,
  );
  if (!wrote) console.error(`[worker] ✗ ${cmd.command}: הפעולה בוצעה אבל לא הצלחנו לסמן אותה כגמורה — המסך ימשיך להמתין.`);
  await logActivity(ok ? 'info' : 'error', `worker_${cmd.command}`, result, raw ? { detail: raw } : {});
```

### `worker/social-worker.ts:1484`

Holds. At 1483-1486 ANY `error` increments `taken`, and `taken` is published to the owner twice: meta.blocked at 1494 and the console line '(N קבוצות כבר תפוסות)' at 1496. The comment at 1477-1480 is true only of the one-open-row-per-target unique-index rejection (23505); a token refresh, an RLS denial on social_queue UPDATE, or a dropped socket lands in the same branch and is rendered as a routine scheduling fact — textbook class D. The second half is real too: `if (!back) return;` at 1489 means an all-fail pass writes no activity line and no console line, so the 'failures come back once at the end of the round' feature does nothing every REVIVE_EVERY_MS (1399, 2 min) with zero trace. Note the pass as a whole does fail closed on its three READS (1418, 1434, 1450 all throw), which makes the unguarded per-row writes the only soft spot — and shows the author's intent was the opposite of what this branch does.

**התיקון**

```ts
Separate the index rejection from a refused write, and never return silent:

  let back = 0;
  let taken = 0;
  let refused = 0;
  ...
    if (error) {
      /* 23505 is social_queue_one_open_per_target_idx: that one really does mean the group is busy. */
      if ((error as { code?: string }).code === '23505') taken += 1;
      else refused += 1;
      continue;
    }
  ...
  if (refused) {
    await logActivity('error', 'write_failed', `${refused} החזרות לתור נדחו על ידי מסד הנתונים — הפרסומים האלה נשארו "נכשל".`, { what: 'revive_failed_rows', asked: revivals.length, landed: back, refused });
  }
  if (!back) return;
  await logActivity('info', 'retry', `...`, { revived: back, blocked: taken, refused });
```

### `worker/social-worker.ts:3616`

Holds, with one factual trim. 3616 drops {error}, has no .select() and filters only on `.eq('external_id', …)`, while 3628 writes 'הצטרפנו לקבוצה' for every outcome in `said` — so a refusal and a zero-row match are both announced as a recorded membership. Reachability confirmed: the join branch at 2232-2237 accepts any payload URL that parseGroupUrl() accepts, discovered or not, and onEach at 2251-2255 counts `joined` from the browser result, not from this write, so 2277's 'הצטרפנו ל-40' is independent of whether a single row changed. The comment at 3604-3608 names `membership` as the column the groups screen reads and the gate for the publishing list, which is precisely the value this write is failing to set. Trim: for a URL with no social_discovery_groups row the card does not show it 'as not-a-member' — it does not show it at all; and the joined-groups sweep (readMyGroups → recordDiscovered(JOINED_QUERY, …) at 2078) can later raise membership for groups actually joined, so this is not always permanent. The false log line and the unusable card until that sweep runs are the real harm.

**התיקון**

```ts
Count the write and let the sentence depend on it:

  let recorded = true;
  if (group && (r.outcome === 'joined' || r.outcome === 'already')) {
    recorded = (await applied(
      db.from('social_discovery_groups').update({ membership: 'member' }).eq('external_id', group.externalId),
      1,
      'discovery_membership',
    )) > 0;
  }
  ...
  await logActivity(level, 'group_join', `${said[r.outcome]}${recorded ? '' : ' — הקבוצה לא נמצאת ברשימת החיפוש, לכן היא לא תופיע בכרטיס "הקבוצות שלך בפייסבוק" עד הסריקה הבאה'}${r.detail ? ` — ${r.detail}` : ''}`, { url: r.url, outcome: r.outcome, recorded });
```

### `src/lib/social/plan.ts:533`

Confirmed. Line 533 is the bare `await db.from('social_schedules').update({ planned_until: ... }).eq('id', schedule.id);` — no destructure, no `.select('id')`, nothing logged on failure. The `failed` guard directly above (524-532) protects the stamp from being written after a FAILED pass, which is what the 517-523 comment defends; it does nothing about the stamp itself not landing. The consequence chain holds as written for a recurring schedule (which stays active): pass N+1 reads planned_until null -> `plannedAhead` false -> every target now in `waiting` -> made===0 && dropped.length -> line 513 fires noteAllBlocked, the WARN that says the round will not go out, 60s after it was queued perfectly, then every minute. And line 516 `if (!plannedAhead) built += made` un-silences the `planned` headline for one-row refills — the documented "מה זה הסבב פרסום שיצא עכשיו?" incident at 147-165. Realistic trigger: a transport blip on this one request (the file's own standard of evidence throughout); the RLS variant is also live, since social-latest.sql:630-643 creates separate per-verb admin policies, so SELECT-yes/UPDATE-no is a reachable install state.

**התיקון**

```ts
const { data: stamped, error: stampErr } = await db
      .from('social_schedules')
      .update({ planned_until: until.toISOString() })
      .eq('id', schedule.id)
      .select('id');
    if (stampErr || !stamped?.length) {
      /* The stamp is what every report in the next pass is built on. If it did
         not land, say so and leave the schedule alone — the upsert is
         idempotent, so the next pass costs nothing. */
      await note('error', 'plan_stamp_failed', 'הסבב נכתב לתור אבל לא סומן כמתוכנן — ננסה שוב בבדיקה הבאה.', {
        schedule: schedule.id,
        detail: stampErr?.message ?? 'no row updated',
      });
      continue;
    }
```

### `src/lib/social/plan.ts:1153`

Confirmed, and I verified the drift the scenario depends on. Line 1153 writes `{ planned_until, active: false }` unchecked. planDrip's retirement guard is line 1002 (`if (schedule.planned_until)`), so an unlanded write means the whole drip re-runs on the next tick. dripSlots (slots.ts:63-76) seeds `let floor = now.getTime() + gapSec * 1000` and takes `Math.max(planned, floor)`, so once run_at is in the past every instant moves with `now` — the instants differ, `taken` cannot catch them, and all 40 targets are in `waiting` -> dropped=40, made=0 -> line 1138 fires noteAllBlocked with retiring:true, i.e. 'נסו שוב' once a minute for a launch that is sitting in the queue working. Following that advice makes a second drip over the same 40 groups. The comment at 1036-1038 proves the author knows the stamp is the point of no return and guards only the `failed` path. One correction to the finding: 'פרסם עכשיו' with >1 target is a drip per the comment at 1124-1125, so this is indeed the path every manual multi-group launch takes — that part stands.

**התיקון**

```ts
const { data: retired, error: retireErr } = await db
    .from('social_schedules')
    .update({ planned_until: last.toISOString(), active: false })
    .eq('id', schedule.id)
    .select('id');
  if (retireErr || !retired?.length) {
    await note('error', 'drip_retire_failed', 'ההפצה ההדרגתית נכתבה לתור אבל לא נסגרה — ננסה לסגור אותה בבדיקה הבאה. אין צורך להפעיל שוב.', {
      schedule: schedule.id,
      detail: retireErr?.message ?? 'no row updated',
    });
    return created;
  }
```

### `src/lib/social/plan.ts:979`

Confirmed. The read above it was deliberately hardened to throw (974-975 with the 20-line FAIL CLOSED comment) and the UPDATE below it drops its error: `const { data: stale } = await db...update(...).select('id')`, and the only report is gated on `stale?.length` (989-991), so a failed sweep and an empty sweep are byte-identical on screen and in the log. I checked whether the rows could actually publish — rules.ts:397 skips a row whose campaign is archived, so they cannot — which is why this grades as a lie rather than a publishing failure, and it is exactly the harm plan.ts:944-950 names: "the stopped campaign comes back with a queue and a countdown to a publication that rules.ts will only skip". The `return new Set(ids)` is fine (ids came from a checked read), so the stop-guard keeps working and the discrepancy never self-heals or re-reports. worker/social-worker.ts:1267-1294 (`applied()`) logs 'write_failed' for precisely this shape; this write has no equivalent.

**התיקון**

```ts
const { data: stale, error: sweepErr } = await db
    .from('social_queue')
    .update({ status: 'skipped', step: '', skip_reason: 'הסבב נעצר' })
    .neq('step', MAYBE_LIVE_STEP)
    .in('campaign_id', ids)
    .in('status', CANCELLABLE_STATUSES)
    .select('id');
  if (sweepErr) {
    await note('error', 'stopped_campaign_sweep_failed', `ביטול הפרסומים של סבב שנעצר נכשל — השורות נשארו בתור עם ספירה לאחור: ${sweepErr.message}`, {
      campaigns: ids.length,
      detail: sweepErr.message,
    });
  }
```

### `src/lib/social/plan.ts:76`

Confirmed, and it is the cleanest case in the set: line 76 is an unchecked UPDATE and line 77 is a WARN whose entire content asserts the result of that UPDATE ('הפרסומים שלו ייכנסו לתור עכשיו'). The count announced comes from intent only. I checked the repeat claim: the `dead` query (38-42) selects on active=false AND planned_until NOT NULL, so an update that did not land leaves all four conditions matching — off, stamped, zero queue rows, post alive — and the same reassurance is re-written every pass for the full one-week plan_failed window, while planQueue (which reads `active = true` at line 144) never sees the schedule. I also confirmed the ordering the function depends on is right (revive at 142 runs before the schedules read at 144), so a landed revive really is planned in the same pass — which is precisely why a silent non-landing is indistinguishable from success.

**התיקון**

```ts
const { data: revived, error: reviveErr } = await db
      .from('social_schedules')
      .update({ active: true, planned_until: null })
      .eq('id', row.id)
      .select('id');
    if (reviveErr || !revived?.length) {
      await note('error', 'plan_revive_failed', `לא הצלחתי להחזיר לתכנון סבב שנכשל — הוא נשאר מכובה: ${reviveErr?.message ?? 'לא עודכנה שורה'}`, {
        schedule: row.id,
      });
      continue;
    }
    await note('warn', 'plan_revived', 'סבב שנכשל בגלל תקלת רשת הוחזר לתכנון — הפרסומים שלו ייכנסו לתור עכשיו.', {
      schedule: row.id,
    });
```

### `src/lib/social/plan.ts:68`

Real, though narrower than claimed. `{ count: 'exact', head: true }` resolves as { count: null, error } on a dropped read, the error is never destructured, and `if (count) continue` reads null as 'zero rows', so the guard the docstring calls the third of four conditions AND the loop-breaker (lines 31-35: "It cannot loop: the moment a retry writes one queue row the third condition stops matching") releases on failure. I traced the loop the docstring promises is impossible: revive clears planned_until, so the schedule leaves `dead`; it re-enters only when a later pass stamps planned_until and retires it (lines 533+535, i.e. a 'now'/'once' schedule with a future run_at), and then only this count read stands between it and another revive — so a persistently failing count read does re-revive it every pass for the rest of the week, each time writing a false 'plan_revived' WARN and clearing planned_until (which then feeds the line-533 noteAllBlocked spam). A single-tick failure costs one spurious revive: it can also flip a schedule the stopped-campaign guard (line 189) retired back on, though line 188 re-retires it on the same pass. Not blocks-publishing, but a documented guard that fails in the permissive direction.

**התיקון**

```ts
const { count, error: countErr } = await db
      .from('social_queue')
      .select('id', { count: 'exact', head: true })
      .eq('schedule_id', row.id);
    /* "I could not prove it has no queue rows" is not "it has none" — and this
       condition is also the loop-breaker. Hold, and try again next pass. */
    if (countErr || count === null || count) continue;
```

### `src/lib/social/plan.ts:192`

Confirmed and the chain checks out end to end. Line 192 discards the error; `approved = (variants ?? []) as Variant[]`. variants.ts:23 `if (strategy === 'fixed' || approved.length === 0) return null` and variants.ts:21 `approved.find(v => v.id === mapped) ?? null` — so an empty list returns null for EVERY strategy including an explicit variant_map, exactly as claimed. compose.ts:24 then falls back to `post.base_text`. The row is written with variant_id:null, rendered_text = base text and dedupe_hash computed over it (lines 383, 407-408), and nothing recomputes a queue row, so one timed-out read permanently writes byte-identical text for every group of the round with no error anywhere. The author's own handling two lines earlier (line 186-187: a failed post read holds the schedule via `continue`) and in stoppedCampaigns (throw) shows the intended direction is to hold; nothing in the comments defends this read. The drip copy at line 1012 has the identical shape and needs the same fix.

**התיקון**

```ts
const { data: variants, error: variantsErr } = await db
      .from('social_variants')
      .select('*')
      .eq('post_id', schedule.post_id)
      .eq('approval', 'approved')
      .order('sort')
      .order('created_at');
    /* An empty list is not "no variants": it is the base text, baked into
       rendered_text for ever. Hold this schedule for one pass, like the post
       read above. */
    if (variantsErr) {
      await note('warn', 'plan_variants_unreadable', 'דחיתי את תכנון הסבב בבדיקה אחת — לא הצלחתי לקרוא את הנוסחים המאושרים.', {
        schedule: schedule.id,
        detail: variantsErr.message,
      });
      continue;
    }
    const approved = (variants ?? []) as Variant[];

/* planDrip, line 1012 — same read, same fix, with `return 0` instead of `continue`. */
```

### `src/lib/social/plan.ts:421`

Confirmed on both halves. (a) The note at 421-426 sits inside the retry branch with no reference to the retry's outcome: `({ error: insErr, data } = await write())` on 420 is followed unconditionally by a WARN asserting 'התור נכתב בלי שיוך לסבב ... הפרסום עצמו ממשיך כרגיל', and only then does line 428 `if (insErr)` increment `failed` and log plan_failed — so the reassurance is written beside the error, for every row of the round. It is equally false in the ordinary ON CONFLICT DO NOTHING case ({ data: [], error: null }), where no row was written either. (b) The mis-triggering the finding describes is real and the guard's own docstring (628-635: "'That column is not here' — and ONLY that ... it fires for one cause and never hides another") contradicts the code: line 638 returns true on `error.code === '42703' || error.code === 'PGRST204'` with no column-name test, and the name test only appears in the message fallback on 639. I verified the install state it fires for: social_queue.require_confirmation is added by `alter table ... add column if not exists` in supabase/social-schema-v2.sql:44, so a database that ran social-schema.sql but not v2 answers PGRST204 about require_confirmation, `delete row.round_at` fixes nothing, the retry fails identically, and the owner is pointed at the wrong migration.

**התיקון**

```ts
function isMissingRoundColumn(error: { code?: string; message?: string } | null): boolean {
  if (!error) return false;
  const names = /round_at/.test(error.message ?? '');
  if ((error.code === '42703' || error.code === 'PGRST204') && names) return true;
  return names && /column|schema cache/i.test(error.message ?? '');
}

/* and at 420-427 — claim nothing until the retry has answered: */
          ({ error: insErr, data } = await write());
          if (!insErr) {
            await note(
              'warn',
              'rounds_column_missing',
              'התור נכתב בלי שיוך לסבב — צריך להריץ פעם אחת את supabase/social-latest.sql ב-Supabase. הפרסום עצמו ממשיך כרגיל.',
              { schedule: schedule.id },
            );
          }
```

### `src/lib/social/plan.ts:850`

Confirmed: nothing in the tombstoned path ever reads the holder row's status. `tombstoned` fills only when the upsert returned data:[] and recycleTombstonedSlot's `.eq('status','skipped').is('published_at', null)` (804-805) matched nothing — i.e. 'the holder is not a cancelled row' — and the ERROR at 847-854 then states as fact that it is 'פרסום קודם שנכשל' and prescribes changing the round's start time. I verified the race is reachable: both planners plan the same schedule, so planner B's rows collide on social_queue_slot_idx (schedule_id, target_id, scheduled_at — still present per social-latest.sql:1158), ignoreDuplicates makes that { data: [], error: null }, A's rows are status 'scheduled' so the recycle refuses them, and all of B's targets land in `tombstoned`. The takenByAnotherPlanner comment at 610-626 states two planners at once is "ordinary, not exotic". The prescribed action then creates a second set of rows at new instants. The 'skipped'-with-published_at holder (the "רשום דולג אבל בפועל פרסם" row the recycle deliberately excludes) is misreported the same way.

**התיקון**

```ts
/* in noteTombstoned, before composing the sentence — ask the database who holds the slot: */
  const { data: holders } = await db
    .from('social_queue')
    .select('status')
    .eq('schedule_id', scheduleId)
    .in('target_id', unique);
  const statuses = new Set(((holders ?? []) as { status: string }[]).map((h) => h.status));
  const live = statuses.has('scheduled') || statuses.has('publishing') || statuses.has('manual_pending');
  const cause = live
    ? 'השעה שחושבה להן כבר תפוסה על ידי שורה קיימת של הסבב הזה — הפרסומים האלה בתור ויצאו'
    : 'השעה שחושבה להן תפוסה על ידי פרסום קודם שנכשל';
  await note(
    recycled || live ? 'warn' : 'error',
    'plan_slots_tombstoned',
    `${unique.length} קבוצות לא קיבלו שורה בתור: ${cause}${list}.${
      recycled ? ` (${recycled} שעות אחרות כן שוחררו.)` : live ? '' : ' שנו את שעת ההתחלה של הסבב ב"ערוך מועד" כדי לחשב שעות אחרות.'
    }`,
    { scheduleId, refused: unique.length, targetIds: unique, recycled, holders: [...statuses] },
  );
```

### `src/lib/social/plan.ts:603`

Real as a class, but the finding's own arithmetic is wrong and I am correcting it. The read does discard its error, so a failed read leaves `byKey` empty and the pass stamps every row of every schedule with DEFAULT_LIMITS/DEFAULT_BROWSER; the comment at 132-137 defends only the missing-settings case ("never to zero"), not a failed read. BUT the defaults are types.ts:691 minGapMinutes 45 + types.ts:600 groupMinGapMinutes 20, and accountGapSeconds(…, true) sums them (rules.ts:135-143) = exactly 65 minutes — the very number the scenario says the owner configured, so that specific example is a no-op. The defect holds for any setting that is not 65 minutes: the file itself discusses a floor brought down to thirty seconds, which would be stamped 65 minutes apart, and a raised floor would be stamped far tighter than the gate rules.ts re-reads and enforces. Either direction makes `scheduled_at` a promise the engine will not keep, permanently (rows are not re-stamped), for every schedule in the pass — the contradiction the comment at 262-272 names — with nothing logged. One read, once per pass, so failing closed costs one pass.

**התיקון**

```ts
async function enforcedSpacing(db: SupabaseClient): Promise<number> {
  const { data, error } = await db.from('social_settings').select('key, value').in('key', ['limits', 'browser']);
  /* The defaults are not the owner's settings, and every row of this pass is
     stamped with whatever comes back here. Fail closed — the caller retries in
     60s, exactly as it does for stoppedCampaigns(). */
  if (error) throw new Error(error.message);
  const byKey = new Map((data ?? []).map((r) => [r.key as string, (r.value ?? {}) as Record<string, unknown>]));
```

### `src/lib/social/plan.ts:339`

Confirmed mechanically, and the harm is larger than the finding states. The error is discarded and `count ?? 0` makes a failed count read indistinguishable from 'this group has never been queued'; `rotation` is pickVariant's cursor (variants.ts:24-25 `approved[(offset + rotation) % approved.length]`), so the group is handed variant #1 again and that choice is frozen into rendered_text and dedupe_hash (lines 357-358, 407-408), which nothing recomputes. Beyond the collapsed rotation, re-issuing a text already published to that group makes the row's dedupe_hash match history: rules.ts:673-686 then DEFERS it on a repeating round and SKIPS it outright on a non-repeating one, with the reason 'אותו תוכן כבר פורסם ליעד הזה ב-14 הימים האחרונים' — a lost publication whose stated cause describes a repeat the owner never asked for. Nothing is logged. Correct direction is to hold the group for one pass, as the finding says.

**התיקון**

```ts
const { count, error: countErr } = await db
        .from('social_queue')
        .select('id', { count: 'exact', head: true })
        .eq('schedule_id', schedule.id)
        .eq('target_id', targetId);
      /* The cursor decides which נוסח this group gets, and the choice is frozen
         into rendered_text and dedupe_hash. "I could not read it" is not zero. */
      if (countErr || count === null) {
        await note('warn', 'plan_rotation_unreadable', 'קבוצה אחת נשארה לבדיקה הבאה — לא הצלחתי לקרוא איזה נוסח תורה.', {
          schedule: schedule.id,
          target: targetId,
          detail: countErr?.message ?? 'no count',
        });
        continue;
      }
      let rotation = count;
```

### `src/lib/social/plan.ts:896`

Confirmed. noteAllBlocked is handed `dropped` only (call sites 514 and 1142) and prints `targetIds.length` inside a sentence that quantifies the whole round and attributes all of it to one cause. The firing condition at 513 and 1138 is `made === 0 && dropped.length` with no reference to `occupied` or `tombstoned`, so a pass that lost 12 targets to the planner race (-> tombstoned, via the ignoreDuplicates data:[] path) and 18 to open rows from the previous round prints 'לכל 18 הקבוצות' for a 30-group launch, while noteTombstoned — ungated on `made` by design (811-823) — prints a different count with a different (and per finding #850 false) cause on the next line. That is exactly the two-screens subtraction quoted at line 292 that this family of messages was written to spare him. The honest denominator is in the caller's scope (`schedule.target_ids.length`), as is the residue.

**התיקון**

```ts
/* call sites: pass the denominator and the residue */
      await noteAllBlocked(db, note, schedule.id, dropped, schedule.mode === 'now' || schedule.mode === 'once', schedule.target_ids.length, occupied.length + tombstoned.length);
/* drip, line 1142 */
    await noteAllBlocked(db, note, schedule.id, dropped, true, schedule.target_ids.length, occupied.length + tombstoned.length);

/* signature + sentence */
  retiring: boolean,
  total: number,
  otherCauses: number,
): Promise<void> {
  ...
  await note(
    'warn',
    'plan_all_blocked',
    `אף קבוצה לא נכנסה לתור. ${targetIds.length} מתוך ${total} הקבוצות — כבר ממתין להן פרסום מסבב אחר${list}.${
      otherCauses ? ` ${otherCauses} קבוצות נוספות נחסמו מסיבה אחרת — ראו את השורות הנוספות ביומן.` : ''
    } ${whatNext}`,
    { scheduleId, blocked: targetIds.length, total, otherCauses, targetIds, retiring },
  );
```

### `src/lib/social/client.ts:1486`

CONFIRMED in structure, DOWNGRADED in consequence. setCampaignRepeat (1425-1540) has no `schedule.days.length` guard anywhere — I read every line from 1447 to 1513. weeklyPlanFor (campaign-schedule.ts:504-509) is literally `for (const day of schedule.days) weekly[String(day)] = [...starts]`, so days=[] gives {}, and its own doc comment (500-502) says callers must refuse that case; syncWeeklyHours does refuse it at 1268, this caller does not. page.tsx:1136 and 1161 are two separate ifs, so the repeat path never reaches the skippedNoDay reporting. `armed += 1` at 1487 is loop progress, and page.tsx:1168 / 1404 only branch on `armed`, so the toast says "יחזור על עצמו בכל יום פרסום" and client.ts:1533 logs campaign_repeat_on over a plan with no occasion. BUT the finding's permanence claim is wrong on three counts: (a) the card is not silent — CampaignSchedulePanel:477-483 flips the summary strip to warning-400 and daysLabel (campaign-schedule.ts:1060) prints "ימי פרסום: לא נבחר אף יום"; (b) with zero days rules.ts holds every publication anyway, so overwriting weekly with {} changes no publishing outcome while that state lasts; (c) it self-heals — re-picking a day runs changeSchedule → setCampaignRepeat again and line 1486 rewrites weekly from the campaign's own columns, so nothing is lost "for ever". What is real is the report: a toast and an activity-log line asserting an armed daily repeat over an empty plan, contradicting the card beside it.

**התיקון**

```ts
Add the refusal syncWeeklyHours already makes, immediately after the `if (!repeat.enabled)` block at 1465 and before weeklyPlanFor at 1479 — it covers both 1486 and 1510:

  /* NO DAY, NO PLAN — the same refusal syncWeeklyHours makes at :1268.
     weeklyPlanFor() builds one occasion per chosen day, so with none chosen it
     is {}, and an active weekly row with no occasion plans nothing while the
     card promises a daily round. */
  if (!schedule.days.length) return { armed: 0, needsLaunch: 0, skippedNoDay: true };

Add `skippedNoDay?: boolean` to RepeatResult, and in src/app/social/page.tsx:1400-1407 and src/app/social/campaigns/page.tsx changeRepeat print the sentence page.tsx:1156 already owns ('לא נבחר אף יום פרסום — עד שתבחרו יום, לא ייכנסו פרסומים לתור') instead of the 'עוד לא יצא אף פעם' branch when the flag is set.
```

### `src/lib/social/client.ts:1510`

CONFIRMED, same missing guard, DOWNGRADED. The targetIds path is as described: 1496-1499 reads the newest schedule row for the post with no mode filter, so a retired mode 'now' launch row supplies a non-empty list and the 1503 guard does not fire; 1510 then INSERTs mode 'weekly' with weekly={}, active: true, and 1512 counts armed from the loop. plan.ts:177-184 confirms an occasion-less weekly row produces no slots, is never retired there (only 'once'/'now' are), and never reaches the planned_until stamp at 533 — so hasPendingQueue's second count (1640-1645: active true AND planned_until is null) does return 1 for that post. But the finding overstates two things: PostEditor.tsx:544-557 and library.ts:947 are a `confirm.ask` the owner can answer 'הוסף סבב' to, not a block; and the row stops being a phantom the moment a day is chosen, because 1486 rewrites its weekly and the planner then stamps planned_until. Real harm: 'יחזור על עצמו בכל יום פרסום' in a toast and in the campaign_repeat_on log over a row that cannot produce a publication, plus a false 'הפוסט הזה כבר בדרך החוצה' prompt on every later launch of that post.

**התיקון**

```ts
Covered entirely by the one guard patched in at 1465-1479 (see the 1486 verdict) — with it, the loop is never reached with an empty `weekly`, so no dead active row is inserted and `armed` is not incremented for one.
```

### `src/lib/social/client.ts:1382`

CONFIRMED. Line 1382 and the retry at 1393 both end at `.eq('id', campaign.id)` with no `.select()`, and 1395 tests only `res.error`. A filter matching nothing is not an error in PostgREST, so `windowLoweredTo` keeps the value computed by roundsWindowFix, 1400-1407 writes the campaign_repeat_window activity line, and 1422 hands roundsSavedMessage a number it turns into the tone:'success' line at campaign-schedule.ts:679-684. I verified the claimed asymmetry: saveCampaignSchedule:559 is `.update(patch).eq('id', id).select('id').single()` and saveCampaign:564 is `.select('*').single()` — both raise PGRST116 on zero rows; these two statements do not. Reachability holds: deleteCampaign exists and is wired to the campaigns page (767-791), the dashboard redraws from a poll, and campaigns/page.tsx:588-594 merges `written` into local state so the card draws three rounds that were never written. I did check whether RLS could make a visible row un-updatable — it cannot: social-schema-v23.sql:172-188 gives select and update the identical tenant predicate — so the zero-row case is specifically a campaign deleted or moved out of the tenant between the read and the write.

**התיקון**

```ts
let res = await db().from('social_campaigns').update(patch).eq('id', campaign.id).select('id');
  …
    res = await db().from('social_campaigns').update(written).eq('id', campaign.id).select('id');
  …
  if (res.error) { /* unchanged */ }
+ if (!res.data?.length) throw new Error('הסבב הזה לא קיים יותר — רעננו את המסך.');

The error branch must stay first so isMissingColumnNamed still drives the repeat_min_hours retry.
```

### `src/lib/social/client.ts:1279`

CONFIRMED. Lines 1272, 1279 and 1289 return the identical { rearmed: 0, skippedNoDay: false }, and 1289 ('everything already correct') is a success while 1272 ('this campaign has no posts') and 1279 ('no active weekly row to arm') are not. I grepped `rearmed` across src/: it is read only at page.tsx:1157-1158 and campaigns/page.tsx:407-408, both on the DIRECT syncWeeklyHours call — never on saveCampaignRounds' result. roundsSavedMessage (campaign-schedule.ts:622-686) reads skippedNoDay, armedExtraRounds, reason, repeatOff, windowLoweredTo and nothing else, and `armedExtraRounds` is computed by the callers from their own input (page.tsx:1374 and campaigns/page.tsx:597: `written.schedule_rounds.filter((r) => r.enabled).length`) — intent, not result. So the flat tone:'success' line 'יפרסם 2 סבבים בכל יום פרסום' is printed for a campaign with no active schedule row, and plan.ts:144 confirms the planner walks only `.eq('active', true)` rows, so nothing publishes tomorrow or the day after. Verified the retirement premise too: plan.ts:534-535 and 1003 set 'now'/'once'/'drip' rows inactive once planned, and revivePlanFailures (plan.ts:37-81) only revives rows that are inactive WITH a planned_until, so it never brings one back.

**התיקון**

```ts
Distinguish the two no-op shapes and say the second one out loud:

-  if (!postIds.length) return { rearmed: 0, skippedNoDay: false };
+  if (!postIds.length) return { rearmed: 0, skippedNoDay: false, noActivePlan: true };
-  if (!rows.length) return { rearmed: 0, skippedNoDay: false };
+  if (!rows.length) return { rearmed: 0, skippedNoDay: false, noActivePlan: true };

(add `noActivePlan: false` to the 1289 and 1297 returns and to the two Promise types at 1267/1333), then in roundsSavedMessage, directly after the skippedNoDay branch at 637:

+  if (result.noActivePlan) {
+    return { text: `השעות נשמרו, אבל ל"${name}" אין תזמון פעיל שהמערכת עובדת לפיו — השיקו אותו פעם אחת ומשם הסבבים ייכנסו לתור לבד.`, tone: 'info' };
+  }
```

### `src/lib/social/client.ts:1448`

CONFIRMED, both halves. (1) Ordering: 1448 commits repeat_enabled before any arming, and nothing re-reads or rolls it back. If 1486 or 1510 throws mid-loop, page.tsx:1408-1409 prints 'שמירת החזרה נכשלה' and skips `load()` — but the 30-second poll then returns the row with repeat_enabled true and readRepeat draws the switch ON, so the toast and the database disagree. (2) Zero-row mirror: no `.select()`, so an UPDATE whose filter matches nothing resolves { data: null, error: null } and unwrap() returns, reporting the switch as set when it was not. One consequence the finding misses and which raises the stakes: rules.ts:674 picks its dedupe window as `repeat.enabled ? repeat.minHours * 3_600_000 : limits.dedupeDays * 86_400_000`, so a half-committed `repeat_enabled = true` also narrows the same-content guard from days to hours for every post in the campaign — including the two the owner now believes are unarmed. No comment in 1425-1448 defends the ordering; they are about floorHours only.

**התיקון**

```ts
Two changes. Make the write prove it landed:

-  unwrap(await db().from('social_campaigns').update(repeatColumns(repeat, floorHours)).eq('id', campaign.id));
+  unwrap(await db().from('social_campaigns').update(repeatColumns(repeat, floorHours)).eq('id', campaign.id).select('id').single());

and, for the enabled path, move that statement below the arming loop (after line 1513) so the switch is stamped only once at least one weekly row is armed — keeping it before the deactivation in the `if (!repeat.enabled)` branch at 1461-1465, which is the one case where the column and the work point the same way.
```

### `src/lib/social/client.ts:2002`

CONFIRMED on the write, PARTLY REFUTED on the consequence. The statement really is `unwrap(...update({ status, archived_at: null }).eq('id', id))` with no `.select()`, the function returns void so no caller can test it, and 2003-2008 logs campaign_paused unconditionally — with `campaign?.name ?? ''` from a read at 2001 that also discards its error, so the log line can read 'הסבב "" הושהה'. act() at page.tsx:1927 and campaigns/[id]/page.tsx:570 print 'הסבב הושהה' purely because the promise resolved. But 'publishing continues to every group in the queue' does not follow: RLS is symmetric (social-schema-v23.sql:172-188), so the only zero-row case is a campaign that has been deleted or moved out of the tenant — and deleteCampaign (767-791) already deactivates the schedules and skips every CANCELLABLE row before deleting, so there is normally nothing left to keep publishing. The defect that stands is the false confirmation and the nameless activity line on a brake the owner pressed in an emergency.

**התיקון**

```ts
export async function pauseCampaign(id: string, paused: boolean): Promise<void> {
   const { data: campaign } = await db().from('social_campaigns').select('name').eq('id', id).maybeSingle();
-  unwrap(await db().from('social_campaigns').update({ status: paused ? 'paused' : 'active', archived_at: null }).eq('id', id));
+  const rows = unwrap<{ id: string }[]>(
+    await db().from('social_campaigns').update({ status: paused ? 'paused' : 'active', archived_at: null }).eq('id', id).select('id'),
+  );
+  if (!rows.length) throw new Error('הסבב הזה לא קיים יותר — רעננו את המסך.');

Throwing is what the two act() callers already handle, so the toast becomes the error instead of 'הסבב הושהה'.
```

### `src/lib/social/client.ts:465`

CONFIRMED on the count, PARTLY REFUTED on 'stays disabled'. The write is `.in('id', ids)` with no `.select()` and the function returns void, so the screen has nothing but the input array: groups/page.tsx:886 and :914 print `${ids.length} קבוצות שויכו ל${c}` and :565 prints `${russianToFile.length} קבוצות סווגו`, all from the selection; :429-431, :928 and :950 are flat strings asserting the action happened. A filter matching fewer rows than it names is not an error in PostgREST, so unwrap() returns and '40 קבוצות שויכו לאשדוד' is printed over 34. But the finding's worse half does not hold: RLS select and update carry the identical tenant predicate (social-schema-v23.sql:172-188), so a row this screen can see is a row this write can change — the shortfall means the rows were DELETED, not that a group the owner was told is live quietly stayed disabled. So the defect is the number and the unconditional confirmation, not a silently disabled group.

**התיקון**

```ts
-): Promise<void> {
-  if (!ids.length) return;
-  unwrap(await db().from('social_targets').update(patch).in('id', ids));
+): Promise<number> {
+  if (!ids.length) return 0;
+  const rows = unwrap<{ id: string }[]>(await db().from('social_targets').update(patch).in('id', ids).select('id'));
+  return rows.length;
 }

Then have the two counted toasts (groups/page.tsx:886, :914 and the Russian-filing one at :565) take their number from the resolved value instead of ids.length — the same shape deleteCampaign:775-783 and stopCampaign:2022-2033 already use.
```

### `src/lib/social/server/worker.ts:363`

CONFIRMED. `await db...update({ status:'skipped', step:'', skip_reason: reason }).eq('id', item.id)` discards { error }; skip() then unconditionally writes logActivity('warn','skipped',reason) and returns 'skipped', which becomes report.skipped (237) and is read in the toast (page.tsx:883) and in the worker_run summary (251). skip() is reached from five places (369, 433, 473 and the rules' own skips), so on a rejected write the feed says 'דולג' for a row that is still 'publishing'. No double-post risk here (every skip reason either never touched Facebook or was Facebook's own duplicate refusal), and the row is not stranded for ever — sweepStuck (289) flips it to 'failed' after 15 minutes — but the owner's history then shows the same row both skipped and failed, and the skip count he was shown describes nothing in the database. That is the recorded incident 'a row reads דולג but the post is live' in a new place. Note the report's claim that 'skipped is not re-claimable' overstates it: skipped IS in RETRYABLE (client.ts:1874), so a person can retry it by hand; nothing automatic does.

**התיקון**

```ts
`const { error } = await db.from('social_queue').update({ status: 'skipped', step: '', skip_reason: reason }).eq('id', item.id); if (error) throw new Error(error.message);` — the caller's catch (238-242) then records the row 'failed' with the real message and counts it honestly, and a retry of a skip cannot double-post.
```

### `src/lib/social/server/worker.ts:394`

CONFIRMED. The defer write-back (394-397) discards { error }, then logActivity('info','deferred', decision.reason, { until: decision.until }) at 402 and report.deferred+=1 run regardless. The reason strings are the owner's own sentences ('מחוץ לשעות הפרסום של הקמפיין (...) — הפרסום ימתין', rules.ts:514), and the bell carries the `until` stamp the comment at 398-401 was written to make readable — a promise about the future, asserted from a write nobody looked at. On a rejected write the row is still 'publishing': neither claim can retake it (both filter status='scheduled', status.ts:114), and sweepStuck turns it into 'failed' with 'הריצה נקטעה באמצע הפרסום' 15 minutes later, so the deferral the owner was promised ends as a dead row needing a manual retry, with no line connecting the two.

**התיקון**

```ts
`const { error } = await db.from('social_queue').update({...}).eq('id', item.id); if (error) { await logActivity('error','write_failed', `דחיית הפרסום לא נשמרה: ${error.message}`, { queueId: item.id }); return 'failed'; }` before the 'deferred' log line — the promise is written only once the parking landed.
```

### `src/lib/social/server/worker.ts:116`

CONFIRMED as a conflation, with a smaller blast radius than claimed. `if (error) return false` is the author's deliberate allowance for the pre-tenant world (comment 112-113), but it is written as 'any failed read', so one 503 on social_tenants makes moreThanOneBusiness() report a single-owner install and the refusal at 155 does not fire. The documented consequence is accurate: getSetting() uses .maybeSingle() over social_settings (server/db.ts:69) and the two-tenant case errors with PGRST116 (postgrest-js mints that for maybeSingle with >1 rows, PostgrestBuilder.ts:519-531) — and the first such call is getSetting('run_lock') at line 168, BEFORE any publishing, so 'פרסם עכשיו' answers a bare 500 instead of the Hebrew sentence at 156. That sentence matters: the comment at 51-70 is entirely about an owner mis-reading a refusal and pressing a dead button. The recovery sweep is unaffected (it runs above the refusal, 153). rules.ts:74 isMissingColumn is the in-file precedent for telling a schema gap apart from a dropped connection, for the same reason.

**התיקון**

```ts
Tell the two apart, the way rules.ts:74 does: `if (error) { const missing = error.code === '42P01' || error.code === 'PGRST205' || /relation .* does not exist|could not find the table/i.test(error.message ?? ''); return !missing; }` — an unknown table is the old single-owner world (false), anything else refuses loudly, which is what the comment at 107-110 says this function is for.
```

### `src/lib/social/server/worker.ts:448`

CONFIRMED. This is the normal outcome for the manual channel (manualGroup.ts returns mode:'manual' unconditionally), so it runs on most rows this worker touches. The UPDATE discards { error } and logActivity('info','manual_pending', `"${tt.name}": ${result.instructions}`) plus report.manual+=1 follow regardless, feeding the 'N ידניים' figure in the worker_run line at 251 — the owner's to-do list of posts to paste by hand. On a rejected write the row is still 'publishing', so it never appears in the manual-pending list the instruction sends him to, and sweepStuck rewrites it 'failed' with 'הריצה נקטעה באמצע הפרסום' 15 minutes later. The instruction points at a row that is not in that state.

**התיקון**

```ts
`const { error } = await db.from('social_queue').update({ status:'manual_pending', step:'', rendered_text: text, error: null }).eq('id', item.id); if (error) { await logActivity('error','write_failed', `העברת "${tt.name}" לפרסום ידני לא נשמרה: ${error.message}`, { queueId: item.id }); return 'failed'; }` before the manual_pending log line.
```

### `src/lib/social/server/worker.ts:488`

CONFIRMED, and the comment two lines below is the proof of who reads it: 'This line is what the owner reads in the notification bell, days after it was written' (489-495). The reschedule discards { error }; logActivity('warn','retry', '... המערכת תנסה שוב ב-<stampText(retryAt)>') and `return 'deferred'` run either way, so the bell carries a dated promise for a retry nothing wrote down. The row is left 'publishing', no claim can retake it (both filter status='scheduled'), and sweepStuck marks it 'failed' 15 minutes later — the owner reads the promise long after the row died. Line 477 (the rate-limit cooldown) is the same statement with no log line; same patch.

**התיקון**

```ts
`const { error } = await db.from('social_queue').update({ status:'scheduled', step:'pending', scheduled_at: retryAt, error: err.message }).eq('id', item.id); if (error) { await logActivity('error','write_failed', `תזמון הניסיון הבא לא נשמר: ${error.message}`, { queueId: item.id }); return 'failed'; }` — and the same two lines at 477, so a cooldown that was not written is not counted as a deferral.
```

### `src/lib/social/rules.ts:216`

CONFIRMED, and it is the last fail-open in the file — with a narrower trigger than the others, which the finding admits. res.error is checked correctly at 215, but `res.count ?? 0` turns an absent count into 'nothing published', which releases every gate that uses it: todayAll (549), todayTarget (553), todayCampaign (562) all compare 0 to the owner's ceilings and let the row through, and the dedupe check at 677 reads `dupes > 0` as false and publishes content it was meant to hold. Verified in postgrest-js: `count` is initialised null and only assigned when the content-range header exists AND splits on '/' (PostgrestBuilder.ts:512-516), so a gateway that strips or rewrites it yields count:null with error:null — and a `*/*` range yields parseInt('*') = NaN, which `??` also passes through and which fails every `>=` and `> 0` comparison the same releasing way. No wait, no attention log and nothing on any screen: the row publishes successfully past a cap the owner set, which is the setting standing between him and a restricted account.

**התיקון**

```ts
Treat an unreadable count exactly like the error branch above it: `if (res.error) throw new Error(res.error.message); if (typeof res.count !== 'number' || !Number.isFinite(res.count)) throw new Error('לא הצלחנו לקרוא את מספר הפרסומים.'); return res.count;` — the throw already reaches both workers' rule-failure paths (and will reach the server worker's once the guard at line 368 exists).
```

### `src/lib/social/server/worker.ts:420`

CONFIRMED, and the ordering makes it sharper than the report says: the warning at 419 is written BEFORE the parking write, so the sentence 'לא הצלחנו לקרוא מתי בוצע הפרסום האחרון — ננסה שוב בעוד רגע.' (rules.ts:706-713) reaches the activity feed and the write that was supposed to arrange that retry is then fired with its error discarded. The comment at 409-418 states the purpose of that line — 'a database that cannot be read is a queue that quietly stops moving with nothing anywhere saying why' — and the attention branch is precisely the state in which the next write is most likely to fail too. On a rejected write the row stays 'publishing' instead of 'scheduled', so the one-minute retry never happens, 'deferred' is still counted in the toast, and sweepStuck records the row as a failed run 15 minutes later. The notBefore branch at 383-386 is the same statement with the same gap (and no log line).

**התיקון**

```ts
Check the write and log after it: `const { error } = await db.from('social_queue').update({ status:'scheduled', step:'pending', scheduled_at: decision.until, attempts: Math.max(0, item.attempts-1) }).eq('id', item.id); if (error) { await logActivity('error','write_failed', `החזרת הפרסום לתור לא נשמרה: ${error.message}`, { queueId: item.id }); return 'failed'; } if (decision.attention) await logActivity('warn','rule_read_failed', decision.reason, { queueId: item.id, until: decision.until });` — i.e. move line 419 below the write, and apply the same check at 383-386.
```

### `worker/db.ts:191`

CONFIRMED, with one correction to the scenario. Line 191 is verbatim as claimed: the INSERT's result is discarded. The throw-behaviour claim checks out in this tree — node_modules/@supabase/postgrest-js/src/PostgrestBuilder.ts:80 has `protected shouldThrowOnError = false`, and :390 wraps the fetch in `if (!this.shouldThrowOnError) res = res.catch(fetchError => ... return { success: false, error: {...}, data: null, status: 0 })`, so even a dead socket (timedWorkerFetch's 60s ceiling, which does NOT exempt /rest or /auth — only /storage/v1/, timed-fetch.ts wantsCeiling) resolves instead of rejecting. The catch at :192-193 therefore only ever fires for workerDb() itself throwing, exactly as claimed: dead code for every write failure. The reader claim is accurate (src/lib/social/client.ts:3576 listActivity), and so is the reporting-channel claim: applied() (worker/social-worker.ts:1267-1294) reports 'write_failed'/'write_partial' ONLY through logActivity and never touches the console, and the post-click 'step_write_lost' at :2643 — the one durable record that a post may be live — goes through logActivity too (it does also print a console line at :2641, so that one is not quite 'only a console line', it is 'only a console line'). CORRECTION TO THE AUDITOR'S SCENARIO: it is v16, not v17, that makes social_activity_log.tenant_id NOT NULL and gives it the tenant-scoped `admin insert` policy (supabase/social-schema-v16.sql:134 table list, :190 `alter column tenant_id set not null`, :215-218 `with check (tenant_id in (select unnest(public.social_tenant_ids())))`), and the two-businesses case does make social_default_tenant() return NULL by design ('A member of several … NULL, and the insert then fails on the NOT NULL rather than guessing wrong', v16:63-72). But the auditor's narrative of a worker publishing all night past a refused log does NOT reach through startup: the social_workers registration upsert at social-worker.ts:368-378 inserts without tenant_id too, so in that same state it dies on the same NOT NULL and :380-392 throws loudly in Hebrew — the worker never starts. The finding survives on a reachable variant instead: a worker ALREADY RUNNING (days of uptime, registration long done) when the owner is added to a second business — the pending admin panel in task #20 is exactly that act. From that second on, heartbeat and every queue UPDATE keep working (the UPDATE policy passes, the row's tenant_id is in the member's list) while every logActivity INSERT is refused 23502/42501, silently. The activity feed simply stops, with a worker whose light is green; a sweep that asked to free 17 rows and freed 0 calls applied → logActivity('error','write_failed') → refused → the screen is identical to a sweep that found nothing. The same hole swallows every transient 503/429/timeout on the one instrument the owner debugs 'it is not publishing' with. Not blocks-publishing: nothing here stalls the queue.

**התיקון**

```ts
worker/db.ts:191 — measure the write and fall back to the console, which is the only channel left when this one is refused:

    const { error } = await db.from('social_activity_log').insert({ level, event, message: scrub(message) as string, meta: scrub(meta) as Record<string, unknown> });
    /* supabase-js RESOLVES a refused write, so the catch below never sees one.
       Without this line a refused INSERT is byte-identical to a successful one
       — and this is the channel applied() and 'step_write_lost' report through. */
    if (error) console.error(`[worker] ✗ שורה לא נרשמה ביומן הפעילות (${event}): ${error.message} | ${message}`);
```

### `worker/social-worker.ts:4751`

CONFIRMED. Line 4751 is the `await db` of heartbeat()'s UPDATE (function opens at :4743); there is no destructuring, no .select(), no unwrap(), no applied(). The pulse chain is as described: :522 `write: () => heartbeat(state, state.pulseStatus ?? 'online', state.pulseDebug ?? false)`, and worker/pulse.ts:120-121 is `await opts.write(); writes += 1;` inside a try whose catch is the only path to `errors += 1` and `opts.onError`. Since the UPDATE resolves with { error } instead of rejecting (postgrest-js shouldThrowOnError=false, verified above), a refused heartbeat is booked as a successful write, `errors` stays 0, and the onError console line at social-worker.ts:523-531 ('אות החיים למסד הנתונים נכשל…') is unreachable for every database-side refusal. The author's own test asserts the property this breaks — worker/test/pulse.test.ts:198 'a failing write must be counted, not swallowed silently' — and it passes only because the test's write is a stub that rejects; the real one cannot. The comment at :4744-4747 does reason explicitly about 'a transition the database refused' and the code beneath it has no way to learn of one: a comment contradicted by the code under it. Readers verified: src/lib/social/client.ts:3205 computes `online` from last_seen_at against a cutoff AND status, and heartbeat is the ONLY writer of last_seen_at after startup (the sole other write is the registration upsert at :371), so a persistently refused UPDATE (PGRST204/42703 on a column a build added before the SQL was pasted — tenant.ts:15-21 documents that deploy order — or a 429/503/60s-ceiling abort) freezes that column and the dashboard reads the PC as disconnected for ever while it publishes: verbatim the complaint pulse.ts:4 was written to close. Status transitions are affected too: the heartbeat(state,'needs_attention',…,'needs_auth') at :2695 can be refused with nothing anywhere knowing (the logActivity('error','needs_attention') on the next line is a second channel, so the ACTIVITY FEED would still carry it — the auditor's 'nothing anywhere will know' is slightly overstated; the card and the light are what lie). Escalation worth noting: worker/stranded.ts:98-107 decides 'who is alive' from last_seen_at, so a frozen stamp lets another machine's sweep take over rows this worker is genuinely publishing — and a maybe-live row is parked with step 'submitted', which resumeNeedsAttention deliberately skips, i.e. a row that never publishes again. That path needs a second worker row, so I grade the certain harm (a false status read by a person) rather than the contingent one.

**התיקון**

```ts
worker/social-worker.ts:4751 — destructure and throw, which is what makes pulse's `errors`/onError real (the explicit call sites already treat heartbeat as throwable: the note and try/catch at :2387-2399, the `.catch(() => undefined)` at :4449):

    const { error } = await db
      .from('social_workers')
      .update({ /* unchanged */ })
      .eq('id', state.id);
    /* THROWN, not swallowed: pulse.ts books a resolved { error } as a successful
       write, so this is the only thing that makes `errors` and onError real —
       and a frozen last_seen_at is read by the dashboard AND by pickStranded. */
    if (error) throw new Error(`כתיבת אות החיים (${status}) נכשלה: ${error.message}`);

If any bare call site must not propagate (e.g. :598 / :4577 on the way out), append `.catch(() => undefined)` there rather than weakening this.
```

## קוסמטי — 2

### `src/lib/social/client.ts:500`

CONFIRMED. `const { data } = await db().from('social_targets').select('id, external_id').in('id', ids);` discards the error, 501 turns a null into [], and 507's `if (externalIds.length)` then skips the external_id dismissal entirely — and bulkDeleteTargets:518-519 runs the delete immediately after, so with target_id ON DELETE SET NULL the link is gone and the read can never be redone. The comments (487-496) defend the ORDER of the two writes and explicitly say a failed dismissal UPDATE is acceptable; they say nothing about the read, and the read is the one step that is not retryable. Scope is narrower than the finding implies: the first update, `.in('target_id', ids)`, does not depend on the read, so discovery rows that still carry their link are dismissed anyway. Only groups matched solely on external_id — the hand-added ones the comment names — are re-offered by listJoined()'s 'עוד לא ברשימת הפרסום' card, for good. No number or publishing outcome is wrong, hence cosmetic, though it is the owner's own named complaint.

**התיקון**

```ts
-  const { data } = await db().from('social_targets').select('id, external_id').in('id', ids);
+  const { data, error } = await db().from('social_targets').select('id, external_id').in('id', ids);
+  if (error) throw friendlyError(error);

Note the trade-off against the author's stated preference at 493-496: throwing here aborts the removal, which is retryable, instead of losing the dismissal permanently. If the removal must never be blocked, the alternative is to keep going and log a warn ('הקבוצה הוסרה, אבל לא הצלחנו לסמן אותה כמוסתרת בגילוי — היא עשויה להופיע שוב') so the loop is at least visible.
```

### `src/lib/social/server/worker.ts:378`

CONFIRMED: the comment contradicts the code in the same file. 'SERVER_CHANNELS is manual-only' is false — line 46 is `['facebook_page','facebook_group_manual']`; 'its only adapter parks the row for a human' is false — registry.ts:11-14 registers two, and facebookPage.ts:40 sets apiPublishing:true with `{ mode:'api' }` returned from three places (58, 69, and the multi-photo feed post). So neither the notBefore branch at 382 nor the api-publish path at 453-470 is unreachable; sync.ts:47 creates exactly the rows that reach them and the claim query at 217 selects them by design. Graded cosmetic because no number on a screen is wrong — but it is the sentence that licensed leaving the most dangerous write in this file (453) unchecked while the PC worker's equivalent got finishChecked, which is why it is worth correcting in the same patch.

**התיקון**

```ts
Replace the last paragraph with the truth: 'Reachable: facebook_page is in SERVER_CHANNELS and its adapter publishes through the Graph API (channels/facebookPage.ts), so a page target with can_api_publish takes this branch and the api-publish path below. facebook_group_manual is the other adapter and parks the row for a human.'
```
