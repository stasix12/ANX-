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
/*
 * 4.23.0 → 4.24.0. DOES THIS HAVE TO REACH THE PC? YES — and it is the first
 * part of סבבים ביום that does, which is exactly why the question is asked
 * every time rather than answered once for a feature.
 *
 *   grep -c round_at  dist/app/worker.cjs → 1
 *   grep -c zonedHM   dist/app/worker.cjs → 3
 *   grep -c planQueue dist/app/worker.cjs → 3
 *
 * The PC's planner is the thing that CREATES queue rows, so it is the only
 * place that can record which round of the day a row belongs to. Left on
 * 4.23.0 the rounds would publish correctly and every per-round counter would
 * read zero for the second round for ever — a feature that works and a screen
 * that lies about it.
 */
/*
 * 4.24.0 → 4.25.0, AND 4.24.0 MUST NOT BE THE ONE THAT INSTALLS.
 *
 * 4.24.0's planner writes social_queue.round_at on every insert, with no
 * tolerance for the column being absent. PostgREST refuses the WHOLE write
 * when a named column is missing — so on a database that has not run
 * supabase/social-latest.sql, that planner would queue NOTHING. Not slower,
 * not partially: the round would stop publishing, silently, while the
 * dashboard went on looking alive.
 *
 * The same mistake had just blanked the owner's dashboard from the READ side,
 * an hour before this was written. 4.25.0 carries the retry, so the planner
 * drops the column the first time the database says it does not know it and
 * says so once in the activity log.
 */
/*
 * 4.25.0 → 4.26.0. DOES THIS HAVE TO REACH THE PC? YES, and the greps are the
 * answer rather than my opinion:
 *
 *   grep -c REPEAT_WHEN_UNKNOWN dist/app/worker.cjs → 2
 *   grep -c readRepeat          dist/app/worker.cjs → 3
 *   grep -c roundsWindowFix     dist/app/worker.cjs → 0   (dashboard only)
 *   grep -c saveCampaignRounds  dist/app/worker.cjs → 0   (dashboard only)
 *
 * THE OWNER ASKED FOR חזרה יומית TO BE ON BY DEFAULT, and the first way I did
 * that was to flip DEFAULT_CAMPAIGN_REPEAT to `enabled: true`. rules.ts holds
 * that same constant as the value a queue row publishes under when there is no
 * campaign to read — `let repeat = DEFAULT_CAMPAIGN_REPEAT`, chosen precisely
 * because it was OFF. One edit, and every orphan row, every failed campaign
 * read and every database without the v25 columns would have been handed a
 * permission to publish the same post to the same group again. It typechecked
 * and the suite stayed green.
 *
 * So the engine now holds REPEAT_WHEN_UNKNOWN — "never twice", whatever the
 * owner's default becomes — readRepeat() only raises the repeat from the read
 * that NAMES the two columns, and the owner's default is carried by the data
 * (v31) rather than by a loose read. All three live in the file the PC bundles,
 * so a PC left on 4.25.0 would keep deciding repeats by the old fallback.
 */
/*
 * 4.26.0 → 4.27.0. DOES THIS HAVE TO REACH THE PC? YES, and the greps answer
 * it rather than my opinion:
 *
 *   grep -c repeatFloorFrom    dist/app/worker.cjs → 3
 *   grep -c readRepeat         dist/app/worker.cjs → 3
 *   grep -c editRoundTime      dist/app/worker.cjs → 0   (the card only)
 *   grep -c nextFreeRoundStart dist/app/worker.cjs → 0   (the card only)
 *
 * THE 12-HOUR PROTECTION IS THE ACCOUNT'S SETTING NOW, not a constant:
 * "תוסיף אופציה בהגדרות לשחק עם זה". rules.ts reads it —
 * readRepeat(campaign, repeatFloorFrom(limits)) — and rules.ts is the
 * decision the PC makes before every click.
 *
 * A PC LEFT ON 4.26.0 WOULD MAKE THE SETTING DECORATIVE, and silently: it
 * reads the same settings row, does not know the key, clamps the campaign
 * back up to twelve and refuses the publication anyway. The owner would move
 * the number, watch the card say his rounds are fine, and get nothing — which
 * is exactly the failure mode the "לא לשלוח את אותו פוסט פעמיים" switch
 * already has a red banner for on the settings screen.
 */
/*
 * 4.31.0 → 4.32.0. DOES THIS HAVE TO REACH THE PC? YES, THREE TIMES OVER —
 * every line of this change executes on his machine and nowhere else.
 *
 *   • social-worker.ts, learnAccountScope(): a warning wrote itself into
 *     `state.attention`, and `attention` is what the top of tick() RETURNS
 *     on. So "N Facebook accounts exist and M groups belong to another one"
 *     — true, useful, and about SOME groups — stopped the worker publishing
 *     ANY group, in ANY campaign, and stopped every chore with it.
 *
 *     AND IT COULD NOT BE CLEARED. The five commands that blank `attention`
 *     (login, check, logout, switch, resume) each run a login check on the
 *     way, which calls recordAccount → learnAccountScope → sets it again.
 *     "המשך סבב" bought exactly one tick. That is a permanent halt reachable
 *     by a supported action — adding an account, switching identity — that
 *     reports itself as "ממתין לטיפול ידני", inviting the one manual action
 *     which cannot help. `notice` is a second field now; the gate never
 *     reads it. queueScope() is untouched, so nothing published widens.
 *
 *   • social-worker.ts, idle(): the three gates each carry a correct Hebrew
 *     sentence naming exactly why nothing is coming out, and all three went
 *     to `console.log` on a Windows box, once, latched. Nine messages in one
 *     evening — "עדיין לא מפרסם כלום" — answered by me asking him to go and
 *     photograph a terminal, for a sentence the machine had already written
 *     and thrown away. It goes to the activity log now, at 'warn', which is
 *     what clears NotificationBell's own predicate and puts it in the bell
 *     on every screen he uses.
 *
 *   • facebook/composer.ts: the wait for Facebook's post window to close
 *     after the click had been given VIDEO_UPLOAD_TIMEOUT — FIFTEEN MINUTES
 *     — for any post carrying a video. He publishes video; the worker runs
 *     one lane. So one lingering dialog froze the whole queue for a quarter
 *     of an hour, printing nothing. The upload is already finished by then
 *     (waitForUploads), so the number was wrong, not cautious: 90s for a
 *     photo, 3min for video, waited in 20-second slices that say so.
 *
 *   • social-worker.ts, getSetting(): a missing settings row returned
 *     DEFAULT_BROWSER without a word — and that default is `testMode: true`
 *     plus `requireConfirmation: true`, which stop the worker before EVERY
 *     "פרסום" click and wait fifteen minutes for an approval on screen, at
 *     eight a day, with a twenty-minute surcharge between group posts. Right
 *     for a first round; for a queue of two hundred it is a stopped queue
 *     that looks like a broken one. It announces itself now, once per key.
 *
 * A PC LEFT ON 4.31.0 GETS NONE OF IT: the gate, the reporting and the
 * composer all live inside worker.cjs, and the dashboard cannot reach past
 * them. The only part that is not the PC is BrowserStatusCard.tsx, which
 * draws the notice the heartbeat now carries — that ships with the website.
 */
/*
 * 4.32.0 → 4.33.0. DOES THIS HAVE TO REACH THE PC? YES — the treadmill runs
 * there.
 *
 *   "הוא מדלג ורושם הסבב נעצר למרות שלא עשיתי כלום"
 *
 * He reset a round, which archives it, and launched the post again. The
 * relaunch opened a fresh run and repointed the post, so his card correctly
 * read פעיל — but the rows already queued still carried the OLD run's id, and
 * rules.ts:290 reads `item.campaign_id ?? post.campaign_id`: the ROW'S label
 * wins. Three things then happened on his machine, every minute, with nobody
 * touching anything:
 *
 *   • worker/revive.ts handed each failure back for another attempt, because
 *     its note deferred the question to rules.ts — "rules.ts still holds each
 *     row to its campaign's days and hours". It does: by SKIPPING it. So every
 *     revival spent a write and one of three attempts to manufacture another
 *     skipped row. It now refuses a failure whose run is archived, and the
 *     worker reads that list and FAILS CLOSED, like the two reads beside it.
 *   • rules.ts skipped the row with a sentence that named no round at all.
 *     When the row and the post disagree it now says which, and what to do.
 *   • plan.ts:812 swept the same rows in bulk on top. Untouched — it is right
 *     about a genuinely stopped run; it was only ever finding rows that should
 *     not have been there.
 *
 * All three are inside worker.cjs: revive.ts and social-worker.ts are the
 * worker's own, and rules.ts IS the decision the PC makes before every click.
 * A machine left on 4.32.0 keeps the treadmill exactly as it is.
 *
 * The fix that actually ends it is NOT on the PC — client.ts ensureRunForPost
 * brings a stopped run's WAITING rows across on relaunch, and that runs in the
 * browser when he presses publish. So the website alone stops NEW cases and
 * the installer stops the loop on the ones already in his queue. Both halves
 * ship together for that reason.
 */
/*
 * 4.33.0 → 4.36.0, AND THE JUMP IS THE POINT.
 *
 * v4.33.0, v4.34.0 and v4.35.0 ARE ALREADY PUBLISHED — 19:30, 19:55 and 20:02
 * tonight, from the work that was then rolled back on the owner's
 * instruction. The rollback restored the TREE; it could not unpublish a
 * GitHub release. So after it the repository said 4.31.0 while 4.35.0 was out
 * in the world.
 *
 * Two commits then went out tonight numbered 4.32.0 and 4.33.0, and v4.32.0
 * had been published at 18:49. The release workflow refuses a version that is
 * already out, so BOTH of those fixes would have shipped to the website and
 * to nobody's PC — silently. That is not a hypothesis about this mechanism,
 * it is the exact failure its own note already describes: "Two correct fixes
 * to it shipped to the website and to nobody's PC, because the release
 * workflow will not publish a version number that is already out, and nothing
 * said so."
 *
 * It happened again because the fingerprint asks "does this have to reach the
 * PC?" and I answered that question honestly each time — while never asking
 * the other one: IS THIS NUMBER FREE? A rollback is the one event that can
 * make the repository's version lower than the highest release, and it is
 * exactly when the next bump is most likely to collide.
 *
 * So the next free number is 4.36.0, checked against the published list
 * rather than against this file:
 *
 *   v4.35.0  2026-11-02T20:02Z   ← highest published
 *   v4.34.0  2026-11-02T19:55Z
 *   v4.33.0  2026-11-02T19:30Z   ← 531eea0 claimed this
 *   v4.32.0  2026-11-02T18:49Z   ← 07c8d86 claimed this
 *
 * AND NOTE WHAT ELSE THIS MEANS. Those three published installers carry the
 * PRE-ROLLBACK code. A machine that auto-updated to 4.35.0 is running the
 * work that was reverted here, which is a different program from the one this
 * repository describes. 4.36.0 is the first installer since the rollback that
 * anyone can actually receive, and it carries the rollback AND everything
 * fixed after it.
 *
 * WHAT IS IN IT, all of which executes on the PC:
 *
 *   • plan.ts: a cancelled row tombstoned its own slot for ever. The slot
 *     index is unique and deliberately non-partial, so it counts a 'skipped'
 *     row — while occupiedSlots()'s docstring says terminal rows may be
 *     planned again. The upsert is ON CONFLICT DO NOTHING, so the refusal
 *     came back as no error and no row, every counter is gated on that row,
 *     and every log line is gated on the counters. One "סיים ואפס" tombstoned
 *     48 hours of occasions; the relaunch recomputed the identical minutes
 *     and was refused in silence, once a minute, for ever. The slot is
 *     recycled now, in BOTH planner branches, and the refusal it cannot
 *     repair is reported ungated.
 *   • plan.ts stoppedCampaigns(): the archived-campaign read discarded its
 *     error. An empty set disarms the sweep AND the stop-guard for a whole
 *     pass, so one dropped read lets the planner queue a round the owner has
 *     ended. Fails closed now.
 *   • revive.ts + social-worker.ts: a failure of an archived run was handed
 *     back every pass, spending an attempt to manufacture another "הסבב נעצר"
 *     skip. Refused now, fail-closed on the read.
 *   • rules.ts: the skip says WHICH round, when the row and the post disagree.
 *   • composer.ts, social-worker.ts: 4.32.0's detach wait and hold-reason
 *     reporting, which never reached a PC under their own number.
 */
/*
 * 4.36.0 → 4.37.0. DOES THIS HAVE TO REACH THE PC? YES — plan.ts's sweep is
 * one of the seven, and plan.ts runs there every sixty seconds.
 *
 *   "רשום דולג, אבל בפועל נכנסתי וראיתי שזה פרסם, זה חמור מאד"
 *
 * The composer's click sits between 'publishing' and 'verifying', so a
 * publication that broke down at or past it MAY HAVE SUCCEEDED while nothing
 * in the database says so. The worker marks exactly that: needs_attention
 * plus step='submitted', a row for a person to check against the group and
 * never for any automatic path to retry.
 *
 * But needs_attention is inside WAITING_STATUSES and therefore inside
 * CANCELLABLE_STATUSES, and every bulk cancel writes `step: ''`. So each of
 * them erased the only record that the post might be live — and both
 * duplicate guards then open at once, because rules.ts counts rows with
 * `status = 'published'` and targetsAlreadyWaiting holds a group only while
 * its row is OPEN. A cancel meant to PREVENT publications could cause a
 * second post to the same group.
 *
 * resumeNeedsAttention had the exclusion. The seven bulk cancels did not —
 * and it was a literal in that one function, which is how a rule gets fixed
 * in one place and left broken in seven. MAYBE_LIVE_STEP lives in status.ts
 * now, beside the status classification that creates the hazard, and
 * maybe-live.test.ts finds the bulk cancels BY SCANNING rather than from a
 * stored list — a stored list is exactly what was not maintained when the
 * seventh (plan.ts's sweep) was added later without one.
 *
 * ALSO IN THIS NUMBER: worker/test/stopped-run.test.ts carried a regex with a
 * bare \n, which never matches on the Windows runner that builds the
 * installer. package.test.ts caught it — for the second time tonight — and it
 * made 4.36.0's own suite red after it had already been pushed.
 */
/*
 * 4.37.0 → 4.38.0. v4.37.0 פורסם ב-23:33, ולכן המספר תפוס — זאת השאלה השנייה
 * שהקובץ הזה למד לשאול הלילה, אחרי ששני תיקונים נכונים כמעט נשלחו למספרים
 * שכבר היו בחוץ ולא היו מגיעים לאף מחשב.
 *
 *   "זה לא מפרסם, זה פשוט מדלג על הפוסטים, כמו שהיה מקודם"
 *
 * אחרי ש-v35 אפס כל רצפה — "0 מגבלה" — זה עדיין דילג, וזאת הסיבה: v35 הוריד
 * את המרווח בין שני פרסומים לאותה קבוצה ולא נגע במתג שמתיר פרסום חוזר בכלל
 * (grep -c repeat_enabled v35.sql → 0). rules.ts:629 בודק את המתג לפני
 * המרווח, אז על פוסט שכבר פורסם ל-252 הקבוצות מתג כבוי מדלג על כל 252 מיד —
 * המרווח לא נבדק אפילו פעם אחת, ולכן אפסון שלו לא יכול היה לשנות דבר.
 *
 * ולמה המתג היה כבוי: ensureRunForPost פתח קמפיין עם { name, status } בלבד,
 * ו-DEFAULT_CAMPAIGN_REPEAT — שההערה שלו אומרת "what a new campaign starts
 * as, AND WHAT GETS WRITTEN" — לא נכתב לשום מקום. כל השקה מחדש פתחה קמפיין
 * חדש שנשען על ברירת מחדל שאיש לא כתב.
 *
 * DOES THIS HAVE TO REACH THE PC? כן — rules.ts היא ההחלטה שהמחשב עושה לפני
 * כל קליק, והיא הצד שקורא את המתג. הכתיבה עצמה בדפדפן (client.ts), אבל מחשב
 * שנשאר על 4.37.0 ימשיך להחליט לפי אותו קוד — ולכן שני החצאים נשלחים יחד,
 * כפי שנשלחו ב-4.33.0.
 */
/*
 * 4.38.0 → 4.39.0. בדוק מול הרשימה שפורסמה: v4.38.0 פורסם ב-00:04 והוא הגבוה
 * ביותר, אז 4.39.0 פנוי. זאת השאלה שהקובץ הזה למד לשאול הלילה אחרי ששני
 * תיקונים נכונים נשלחו למספרים שכבר היו בחוץ, ולכן לא הגיעו לאף מחשב.
 *
 *   stuck_rows_requeued × 12   (אחרון 03:37:00)
 *
 * לוג הפעילות שלו, חצי שעה, ובאותה חצי שעה אפס `published` ואפס
 * `publish_failed`. שנים-עשר קווים שכל אחד מכריז ששורות תקועות שוחררו וחזרו
 * לתור — אחד לכל סבב של המטאטא, על אותן שבע-עשרה שורות, שנשארו ב-'publishing'
 * גם אחרי כולם.
 *
 * sweepStranded כתב את ה-UPDATE ולא הסתכל בתשובה. supabase-js לא זורק על
 * כתיבה שנכשלה — הוא נפתר עם { data: null, error }. וכתיבה שלא התאימה לאף
 * שורה נפתרת עם error: null. השורה בלוג חושבה מ-decided.requeue.length:
 * מספר השורות שהמטאטא רצה לשחרר. היא אמרה "שוחררו 17" בין אם שבע-עשרה שורות
 * השתנו ובין אם אפס, ואמרה את זה שוב כל שתי דקות, שעות.
 *
 * זה המחזור החמישי של אותה משפחת באגים בפרויקט הזה: המכונה לא עשתה כלום
 * והמסך אמר שכן. הקודמים — upsert עם ignoreDuplicates שמחזיר data: [] עם
 * error: null ומכרסם סבב בשקט; חותמת planned_until שנכתבה אחרי שכל ה-insert
 * בסבב נכשלו; ביטול המוני שחסום בפילטר סטטוס שלא התאים לכלום; ומספר בלוח
 * שחושב מהמערך שנשלח ולא מזה שחזר.
 *
 * applied(write, asked, what) מכריח את מסד הנתונים להחזיר את מה ששינה, רושם
 * אירוע שגיאה כשהכתיבה נכשלה, רושם אזהרה כשהיא נגעה בפחות שורות ממה שביקשה,
 * ומחזיר מספר נמדד. ושתי השורות בלוג יוצאות רק אם landed > 0: שנים-עשר קווים
 * עליזים על שורות שלא זזו גרועים משתיקה, כי שתיקה לפחות נכונה.
 *
 * DOES THIS HAVE TO REACH THE PC? כן. sweepStranded רץ אצלו, לא ב-Vercel — זה
 * התהליך היחיד שבוודאות רץ עבורו, והוא זה שמשחרר שורה שחוסמת קבוצה שלמה
 * מכל הסבבים הבאים. מחשב שיישאר על 4.38.0 ימשיך לדווח שחרורים שלא קרו.
 */
/*
 * 4.39.0 → 4.40.0. v4.39.0 פורסם ב-02:11 והוא הגבוה ברשימה, אז 4.40.0 פנוי.
 *
 *   "יש פוסט לפני 7 שעות עוד מתי שהכל עבד .. עכשיו זה לא מפרסם"
 *
 * הוא נכנס לקבוצה והסתכל. הפוסט היחיד שם הוא מלפני השינוי. 215 ניסיונות
 * באותו יום, אפס פרסומים, וכל אחד מהם נגמר ב"חלון הפוסט לא נסגר אחרי
 * הלחיצה על פרסום".
 *
 * זו רגרסיה שלי, והיא בשורה אחת. ב-22:18 (07c8d86) קיצרתי את ההמתנה לסגירת
 * חלון הפוסט אחרי הלחיצה, לפוסט עם וידאו, מ-15 דקות ל-3. הפוסט האחרון
 * שהצליח הוא מ-21:10 בערך — לפני השינוי. `git log --since 21:13 -- worker/`
 * מחזיר את composer.ts פעם אחת בדיוק, באותו commit, ושום דבר אחר שנוגע
 * בלחיצה.
 *
 * מה שהטיעון שלי פספס: waitForUploads מוכיח שה-BYTES הגיעו לפייסבוק. אצל
 * תמונה זו כמעט כל העבודה והחלון נסגר תוך שניות. אצל וידאו פייסבוק מחזיקה
 * את החלון פתוח לאורך ה-transcoding — עבודה שהיא עושה אחרי ההעלאה ולפני
 * שהיא מוכנה לקבל את הפוסט, דקות ארוכות, בלתי נראית ל-waitForUploads ולא
 * קשורה לרוחב פס. שתי ההמתנות לא "התמזגו בטעות לקבוע אחד". הארוכה נשאה
 * משקל.
 *
 * ולמה לא פשוט revert: כי "זה נתקע פשוט" היה אמיתי גם הוא, והחלק שבאמת
 * תיקן אותו לא היה המספר אלא הפריסה לפרוסות. 15 דקות שמדפיסות את גילן כל
 * 20 שניות הן לא מה שהוא דיווח עליו; הוא דיווח על 15 דקות של שתיקה מוחלטת.
 * הפרוסות נשארות, הקצבה חוזרת לערך שהוכח שמפרסם.
 *
 * וחצי שני לבאג, שהיה נכנס איתו: ההמתנה הארוכה ביותר בפונקציה הייתה גם
 * השקטה ביותר. הלוח מכריז על מחשב כמנותק אחרי 90 שניות שתיקה, ו-pickStranded
 * קורא את אותן 90 שניות כ"ה-worker הזה איננו". פרסום שמתקדם מצוין היה נקרא
 * "המחשב לא מחובר" 90 שניות אחרי הלחיצה, ושורה שנמצאת על מסלול חי הייתה
 * יכולה להילקח ממנו. לולאת ההמתנה פועמת עכשיו דרך onHold, בדיוק כמו לולאת
 * ה-hold שלפניה.
 *
 * DOES THIS HAVE TO REACH THE PC? זה כל כולו המחשב. composer.ts היא הלחיצה
 * עצמה. מחשב שיישאר על 4.39.0 ימשיך לוותר אחרי שלוש דקות ולא יפרסם וידאו.
 */
export const WORKER_VERSION = '4.40.0';

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
 * AND ANSWERED OUT LOUD AGAIN, 4.27.0 → 4.28.0, AND IT IS YES — v33.
 *
 *   • plan.ts no longer pre-refuses a group that has an open row. It used to
 *     read every open row in the account, whatever post it belonged to, and
 *     skip any group already spoken for — so a second campaign could never
 *     take a group a first campaign was holding. The owner's Russian-language
 *     round carries fifty groups, another campaign held an open row for every
 *     one, and the planner dropped all fifty every pass: "אף קבוצה לא נכנסה
 *     לתור", night after night. He asked for it open — "לפתוח הכל, גם אותו
 *     פוסט" — and v33 drops the database index behind it.
 *
 *     THIS ONE MUST REACH THE PC, which is exactly the hole this fingerprint
 *     exists to close. plan.ts is not under worker/, but build-app.mjs aliases
 *     `@` to src and the planner is inside worker.cjs: the machine plans its
 *     own queue every sixty seconds. Ship the database change without this and
 *     his PC goes on pre-refusing all fifty groups against an index that is no
 *     longer there — the website would be fixed and nothing would publish.
 *
 * AND ANSWERED OUT LOUD AGAIN, 4.28.0 → 4.29.0, AND IT IS YES — v34.
 *
 *   • campaign-schedule.ts: DEFAULT_CAMPAIGN_REPEAT.minHours was a hard-coded
 *     20, and readRepeat() fell back to it for any campaign row with no stored
 *     window. So every campaign the owner created was stamped with twenty
 *     hours between two publications of the same post to one group, from a
 *     constant no screen and no setting could reach — "לא הסרת את המגבלה של
 *     ה-20 שעות! תמחק את זה כבר." The constant is MIN_REPEAT_HOURS now and
 *     the fallback is the ACCOUNT'S floor, which may be zero.
 *
 *     THIS MUST REACH THE PC. rules.ts calls readRepeat(campaign,
 *     repeatFloorFrom(limits)) on every single row it decides, and rules.ts
 *     runs on the owner's machine for every group publication. An older copy
 *     would go on reading twenty for a row with no stored window and defer
 *     exactly the publications he has now told us three times to let through.
 *
 * AND 4.29.0 → 4.30.0, YES, AND THIS ONE IS A REGRESSION I SHIPPED.
 *
 *   • plan.ts: v33 removed the planner's pre-read of which groups a post is
 *     already waiting for, on the owner's instruction, and within the hour his
 *     own dashboard measured what that costs — 255 waiting at 18:51, 317 at
 *     19:00, published frozen at 190. Sixty-two new rows in nine minutes and
 *     not one publication.
 *
 *     The planner re-plans every active schedule every sixty seconds.
 *     `plannedAhead` only decides what is written to the LOG; occupiedSlots
 *     only refuses the same instant. So that read, backed by the unique index,
 *     was the only thing stopping a schedule re-queueing the same group on
 *     every tick, and I removed both halves in one commit.
 *
 *     It is back, scoped to the POST — which is not what he objected to. A
 *     different campaign is still never blocked and the account-wide index
 *     stays dropped; only "this post already has this group waiting" returns.
 *
 *     THIS MUST REACH THE PC, and urgently: the planner that is generating the
 *     rows runs on his machine every sixty seconds. The website alone cannot
 *     stop it.
 *
 * AND 4.30.0 → 4.31.0, YES — the silent skip.
 *
 *   • plan.ts: a group whose computed instant was already occupied by a row of
 *     this post was skipped with a bare `continue` — no counter, no log, no
 *     trace. Three of the four ways a group can be dropped between "selected"
 *     and "queued" name it in the activity log; this one named nothing. The
 *     owner found it the only way left: by subtracting 210 from 252 across two
 *     screens. noteOccupied() now says it, from both planner branches — the
 *     drip one matters most, because "פרסם עכשיו" with several targets goes
 *     through it.
 *
 *     It reaches the PC for the same reason the last two did: the planner runs
 *     there, so the line is only written if that copy knows to write it.
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
/*
 * 3c27cd3ae7388f90 → 6b035b4b24294a66. סבבים ביום (ריצות). DOES THIS HAVE TO REACH THE PC? NO, and
 * the measurement is the interesting part.
 *
 *   npm run build:app
 *   grep -c slotsFor      dist/app/worker.cjs  → 3   (the PC runs the planner)
 *   grep -c planQueue     dist/app/worker.cjs  → 3
 *   grep -c weeklyPlanFor dist/app/worker.cjs  → 0   (it does not BUILD the plan)
 *   grep -c roundStarts   dist/app/worker.cjs  → 0
 *   grep -c readRounds    dist/app/worker.cjs  → 0
 *
 * That split is the whole architecture of this feature. The PC's planner reads
 * social_schedules.weekly out of the database and has looped its 'HH:MM' array
 * since the beginning; the new code only decides what goes INTO that column,
 * and it runs in the browser when the owner saves. campaign-schedule.ts is in
 * the bundle because rules.ts imports readSchedule from it, and esbuild shakes
 * out the exports nothing on the PC calls — which is what the three zeroes are.
 *
 * So a machine still on 4.23.0 publishes two rounds a day correctly the moment
 * the owner sets a second one. Nothing to install.
 */
/*
 * 6b035b4b → 53c81757. The rounds WRITER (saveCampaignRounds in client.ts).
 * Still NO on the PC, measured the same way as the two re-pins above:
 *
 *   grep -c saveCampaignRounds dist/app/worker.cjs → 0
 *   grep -c roundsColumn       dist/app/worker.cjs → 0
 *   grep -c slotsFor           dist/app/worker.cjs → 3
 *
 * Three times now the fingerprint has moved for a client.ts change that the
 * installer does not carry. That is the fingerprint being WIDER than the
 * bundle, which is the safe direction — it asks the question too often rather
 * than missing one that mattered — and the greps answer it in thirty seconds.
 */
/* Re-pinned after round_at was added to the three selects that count it.
   4.24.0 is not released yet, so the version does not move again — a bump per
   edit would publish an installer per commit and teach the updater to cry
   wolf. The PC change that earns 4.24.0 is the planner write above. */
/* 54a557efe154efed → 240f061bfcece107. Re-pinned for 4.32.0 above, where the
   "does this reach the PC?" question is answered in full — and measured:

     npm run build:app
     grep -c SUBMIT_DETACH_VIDEO_MS dist/app/worker.cjs → 2
     grep -c DETACH_TICK_MS         dist/app/worker.cjs → 2
     grep -c worker_holding         dist/app/worker.cjs → 1
     grep -c account_scope_narrowed dist/app/worker.cjs → 1
     grep -c settings_defaulted     dist/app/worker.cjs → 1

   All five are the PC's own code. BrowserStatusCard.tsx moves in the same
   change and is NOT in the bundle (it is the website's card, drawing the
   sentence the heartbeat carries), which is the fingerprint being wider than
   the installer — the safe direction.

   activity.ts and activity-text.ts move too, and ride along for the reason
   they have ridden along before: the worker only WRITES the event names
   ('worker_holding', 'settings_defaulted'); the two maps that decide how a
   row is filed and what headline it gets are read by screens. A PC on 4.31.0
   cannot write those names at all, which is why the version moves for the
   writer and not for these. */
/* 240f061bfcece107 → 9b5a9489aac2f95c. Re-pinned for 4.33.0 above, and the
   split it claims is MEASURED rather than argued:

     npm run build:app
     grep -c stopped.has       dist/app/worker.cjs → 3   (revive.ts: the PC's)
     grep -c movedOn           dist/app/worker.cjs → 2   (rules.ts: the PC's)
     grep -c 'נשאר משויך'      dist/app/worker.cjs → 1   (the new sentence)
     grep -c ensureRunForPost  dist/app/worker.cjs → 0   (client.ts is NOT)

   That last zero is the whole shape of this fix. The loop runs on the PC and
   needs the installer; the thing that ENDS it runs in the browser when he
   presses publish and needs only the website. Shipping one without the other
   would either leave his existing queue on the treadmill or leave every future
   relaunch creating a new one. */
/* 9b5a9489aac2f95c → bfba5e6d4490a8fe. Re-pinned for 4.36.0 above, where the
   version question is answered twice: does this reach the PC (yes, all of it),
   and IS THE NUMBER FREE (4.32.0 and 4.33.0 were not, which is why two
   correct fixes tonight would have reached nobody). Measured:

     npm run build:app
     grep -c recycleTombstonedSlot dist/app/worker.cjs → 5   (the planner's)
     grep -c plan_slots_tombstoned dist/app/worker.cjs → 1
     grep -c stopped.has           dist/app/worker.cjs → 3   (revive.ts)
     grep -c movedOn               dist/app/worker.cjs → 2   (rules.ts)
     grep -c ensureRunForPost      dist/app/worker.cjs → 0   (client.ts is NOT)

   activity.ts and activity-text.ts move again and ride along for the reason
   they always do: the worker writes the event NAMES, the two maps that file
   them and give them headlines are read by screens. */
/* bfba5e6d4490a8fe → bf8b2e3cce48629d. Re-pinned for 4.37.0 above. Both
   questions answered: it reaches the PC (plan.ts's sweep is one of the seven
   bulk cancels and plan.ts runs there every sixty seconds), and the number is
   free — 4.36.0 is the highest this repository has claimed since the rollback,
   and the newest published tag before tonight's pushes was v4.35.0.

     npm run build:app
     grep -c MAYBE_LIVE_STEP      dist/app/worker.cjs → 7   (status.ts + plan.ts)
     grep -c stoppedCampaigns     dist/app/worker.cjs → 4   (plan.ts IS in it)
     grep -c resumeNeedsAttention dist/app/worker.cjs → 0   (client.ts is NOT)
     grep -c respaceQueue         dist/app/worker.cjs → 0
     grep -c ensureRunForPost     dist/app/worker.cjs → 0

   client.ts's six are NOT in the bundle, and those three zeroes are the
   measurement rather than the claim: the dashboard's data layer is not in the
   worker's import closure. So the PC needs this installer for the sweep, and
   the website carries the other six the moment it deploys. */
/* bf8b2e3cce48629d → 9a32515c2fa5fcb4. DOES THIS HAVE TO REACH THE PC? NO, and
   it is the clearest no in this file: the change is entirely about WHEN a
   finished row is drawn, and nothing on the PC draws anything. Measured:

     npm run build:app
     grep -c listTimelineDone dist/app/worker.cjs → 0
     grep -c doneAt           dist/app/worker.cjs → 0
     grep -c TIMELINE_SELECT  dist/app/worker.cjs → 0

   Re-pinned once more after performance.test.ts refused the half-move: adding
   updated_at to QueueItem made every LEAN feed promise a column it did not
   select, and those rows arrive through a cast — so it would have been
   undefined at runtime with nothing going red, and the history screen would
   have kept drawing a cancelled row at its planned minute while the dashboard
   rail drew it correctly. Two screens, two answers, one of them wrong, and no
   test red. QUEUE_SELECT_LITE and CAMPAIGN_FEED_SELECT select it now (one
   timestamp per row, not a post body), and the same three zeroes hold:

     grep -c QUEUE_SELECT_LITE    dist/app/worker.cjs → 0
     grep -c CAMPAIGN_FEED_SELECT dist/app/worker.cjs → 0

   So 4.37.0 stays, and this fix reaches him the moment the website deploys —
   with nothing to install. That matters here more than usual: it is the fix
   for what he can SEE, and the one that stops him concluding, correctly from
   the evidence on screen, that something is still cancelling his queue.

   (types.ts moves too, for QueueItem.updated_at. It is a type; nothing
   executes it.) */
export const WORKER_FINGERPRINT = 'e5da57724627926e';
