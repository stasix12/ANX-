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
/*
 * 4.40.0 → 4.41.0. v4.40.0 פורסם ב-02:29 והוא הגבוה ברשימה.
 *
 * סריקה אדוורסרית של כל נתיב הפרסום — חמישה קוראים במקביל, וכל ממצא נמסר
 * לסוכן נפרד שתפקידו היה להפריך אותו — החזירה 53 ממצאים, 4 הופרכו, 49 אושרו,
 * כולם מאותה משפחה אחת. AUDIT-silent-writes.md מחזיק את כולם. זה שבעת
 * הממצאים שדורגו "חוסם פרסום" ושרצים על המחשב של הבעלים.
 *
 * האנטומיה זהה בכולם: supabase-js לא זורק. כתיבה שהמסד סירב לה וכתיבה שלא
 * התאימה לאף שורה — שתיהן נפתרות. אז `const { data } = await …` זורק את הדבר
 * היחיד שמבדיל בין תקלה לעובדה, והקוד שמתחת קורא היעדר נתונים כתשובה. בדרך
 * כלל התשובה המתירנית ביותר.
 *
 *   1. התפיסה (runJobInner). `if (!claimed?.length) return;` ענה אותה תשובה
 *      על "מסלול אחר ניצח במירוץ" ועל "המסד סירב ל-UPDATE". שום דבר אחר
 *      במוצר לא היה אומר מילה: ה-SELECT של "מה הגיע זמנו" זורק על שגיאה
 *      משלו אבל נשאר חוקי תחת מדיניות שחוסמת רק UPDATE; idleNoticeShown
 *      מאופס לפני שהמסלולים מתחילים, אז worker_holding לא יכול לצאת; ה-catch
 *      של המסלול צריך throw ואין. תור שאי אפשר לתפוס נראה בדיוק כמו תור
 *      שאין בו מה לפרסם — המשפט שהוסבר כאן הלילה יותר מכל אחר.
 *   2-3. מטאטא ההפעלה מחדש. שתי כתיבות חשופות, על הבקשות הראשונות שהתהליך
 *      שולח. חניה שנדחתה משאירה שורות ב-'publishing' עם שלב "אולי עלה":
 *      בלתי נראות ב"דורשים אתכם", ומחזיקות את הקבוצה שלהן מחוץ לכל סבב
 *      שהמתכנן בונה, כשה-sweepStranded במרחק חמש-עשרה דקות.
 *   4. חניית האישור. כתיבה חשופה, והלולאה מתחתיה קוראת כל סטטוס שאינו
 *      'awaiting_confirmation' כ-'declined' — שהקורא הופך ל'skipped' סופי
 *      שכתוב בו "הפרסום בוטל לפני הלחיצה הסופית". כתיבה שנדחתה אמרה לבעלים
 *      שהוא ביטל פרסום שמעולם לא ראה.
 *   5. מרווח התגובות. `since` יוצא undefined, והמגבלה מתחתיו חסומה על
 *      `since` — כלומר פשוט לא חלה. spacingGate אומר את הכלל לפרסומים
 *      במילים האלה ממש, שלושת אלפים שורות מעל.
 *   6. targetsAlreadyWaiting (plan.ts). קבוצה ריקה פירושה "שום דבר לא ממתין
 *      לפוסט הזה", וזה מכניס כל קבוצה לתור בכל מעבר. האינדקס שתפס את
 *      הכפילות מתחת נמחק ב-social-latest.sql, אז הקריאה הזו היא הבלם
 *      היחיד שנשאר.
 *   7. קריאת השורות הפתוחות (client.ts). הקבוצה שנבנית מ-liveQueuePlan
 *      מחזיקה רק 'scheduled' ו-'paused'; קבוצה ששורתה 'publishing',
 *      'needs_attention', 'manual_pending' או 'awaiting_confirmation'
 *      נתפסת כאן ובשום מקום אחר. קריאה שנכשלה הוסיפה שורה שנייה לקבוצה
 *      שכבר יש לה אחת באוויר.
 *
 * ובנוסף worker/db.ts: קריאת session שנכשלה נקראה כ"אין חיבור". auth-js
 * מחזיר { session: null, error } כשה-token פג וה-REQUEST לרענון נכשל, והוא
 * במכוון לא מוחק את ה-refresh token. ליפול משם ל-signInInteractively פותח
 * חלון שמבקש תשובה מאדם שישן, בארבע לפנות בוקר, על מכונה שכל תפקידה להמשיך
 * לפרסם.
 *
 * DOES THIS HAVE TO REACH THE PC? כן, כולו. התפיסה, מטאטא ההפעלה מחדש,
 * חניית האישור, מרווח התגובות וקריאת ה-session רצים שם בלבד.
 */
/*
 * 4.41.0 → 4.42.0. v4.41.0 פורסם ב-02:51 והוא הגבוה ברשימה.
 *
 *   "בשעת ההתחלה אני רוצה לבחור בדיוק איזה זמן שבא לי ולא בקפיצות של 30 דק"
 *
 * שעת ההתחלה בכרטיס הקמפיין הייתה <select> מעל TIME_CHOICES: 48 אפשרויות,
 * כל חצי שעה. שום דבר מתחת לא נזקק לרשת הזו — העמודה היא טקסט 'HH:MM' פשוט,
 * normaliseTime מקבלת כל דקה, ועורך הסבבים בתוך אותו פאנל עצמו משתמש
 * ב-<input type="time"> מהיום שנכתב. הרשימה הייתה הדבר היחיד שעיגל אותו,
 * והיא עיגלה לחצי שעה הקרובה בדיוק בשדה שקובע מתי היום שלו מתחיל.
 *
 * DOES THIS HAVE TO REACH THE PC? לא, ואני אומר את זה במפורש כי השומר דרש
 * מספר חדש והוא צודק בכך שאינו יודע להבדיל. השינוי כולו ב-TSX שנשלח עם
 * האתר. טביעת האצבע זזה בגלל הערה אחת ב-campaign-schedule.ts — קובץ שנארז
 * גם ל-worker — ולא בגלל שורת קוד שרצה שם. התנהגות ה-worker ב-4.42.0 זהה
 * לחלוטין ל-4.41.0. לא הזזתי את ההערה כדי לעקוף את השומר: לשחק עם מה שהוא
 * מודד הוא בדיוק איך שומר מפסיק לשמור.
 */
/*
 * 4.42.0 → 4.43.0.
 *
 *   "תבדוק אם ה supbase למה הכל דולג עכשיו, לא צריך לנחש נפתור הכל פעם אחת"
 *
 * מסד הנתונים שלו ענה בשתי שורות:
 *
 *   הקמפיין של השורה        הקמפיין של הפוסט        כמה
 *   טסט חדש · archived      טסט חדש · archived      679
 *   סבב פרסום · archived    סבב פרסום · archived    406
 *
 * 1,085 פרסומים שדולגו עם "הסבב נעצר", והשורה וגם הפוסט מצביעים על קמפיין
 * שהסתיים. שלוש דקות קודם הפעמון שלו הראה "חזרה יומית הופעלה", שוב ושוב.
 *
 * הלולאה, ושלושת השלבים שלה כולם שלנו:
 *
 *   1. stopCampaign מארכב את הסבב ומכבה את התזמונים של הפוסטים שלו. הוא
 *      משאיר במתכוון את post.campaign_id מצביע על הסבב המאורכב — השורה הזו
 *      היא ההיסטוריה של הסבב, ושכתוב שלה היה מאבד איזה סבב פרסם מה.
 *   2. setCampaignRepeat חיפש את אותם פוסטים לפי אותו campaign_id וכתב
 *      active: true בחזרה על התזמונים השבועיים שלהם — בלי לשאול אפילו פעם
 *      אחת אם הקמפיין עדיין חי. סבב מת, מפרסם שוב.
 *   3. planQueue מחתים כל שורה חדשה ב-campaign_id של הפוסט — עדיין המאורכב
 *      — ו-rules.ts מסרב לכל אחת מהן ברגע שהוא מסתכל עליה: "הסבב נעצר".
 *      הכרטיס קורא "פעיל" כל הזמן הזה, כי הוא מצייר שורת קמפיין אחרת
 *      שבמקרה חולקת את אותו שם.
 *
 * אז המנוע צדק כל הלילה והנתונים הם ששיקרו, ושלב 2 הוא השורה שעשתה אותם
 * שקריים. חימוש של סבב שהסתיים לא יכול לייצר פרסום — רק שורות שמדולגות
 * ברגע שקוראים אותן. הוא מסרב עכשיו, נכשל סגור כשהקריאה לא יכלה לענות,
 * ורושם campaign_repeat_refused ברמת error.
 *
 * ושלוש העובדות הופרדו בטקסט: "armed === 0" אמר משפט אחד — "עוד לא יצא אף
 * פעם" — על שלושה מצבים שונים. על סבב שהסתיים זה שולח את הבעלים להשיק מה
 * שכבר מושק.
 *
 * DOES THIS HAVE TO REACH THE PC? לא. client.ts לא נארז ל-worker
 * (grep -c ensureRunForPost dist/app/worker.cjs → 0). טביעת האצבע זזה בגלל
 * activity.ts ו-activity-text.ts, שכן נארזים — האירוע החדש חייב להיות מסווג
 * שם או שהוא נופל לפי הרמה שלו תחת כותרת שאיש לא פותח. התנהגות הפרסום
 * ב-4.43.0 זהה ל-4.42.0.
 */
/*
 * ─────────────────────────── 4.44.0 ────────────────────────────────────────
 *
 * "הפסיק לפרסם אחרי השינוי האחרון , לא לנחש הפעם למשוך נתונים מ sup base"
 *
 * מהנתונים שלו, 03/11: worker@stas פרסם 136 פוסטים ונעצר ב-09:22. אחרי זה —
 * 139 שורות ב-needs_attention / step 'submitted', כולן עם אותה שגיאה: החלון
 * לא נסגר אחרי הלחיצה על "פרסום". זה לא היה השינוי האחרון: הוא נדחף ב-15:26,
 * שש שעות אחרי. 4.43.0 יצאה ב-07:57 והיא עדיין השחרור האחרון, כלומר מאז
 * 07:57 שום קוד חדש לא הגיע למחשב שלו. גם worker@דור, על 4.32.0, נפל — שתי
 * גרסאות קוד שונות, שני חשבונות, אותו כישלון.
 *
 * החניה עצמה נכונה ולא נגעתי בה: אחרי שנלחץ "פרסום" המערכת לא מנסה שוב, כי
 * הפוסט עלול להיות חי ופרסום חוזר מייצר כפילות בקבוצה אמיתית תחת החשבון של
 * הבעלים, בלי ביטול. מה שנוסף הוא בדיקה: ה-worker פותח את
 * /groups/<id>/user/<us>/ — דף שמכיל רק את הפוסטים שלנו — ומסמן כ"פורסם" כל
 * שורה שהוא מאתר שם טקסטואלית.
 *
 * ─────────────── מה שהגרסה הזאת בכוונה אינה עושה, ולמה ───────────────────
 *
 * הניסיון הראשון כלל הכרעה שלישית, 'absent', שהחזירה שורה לתור. ביקורת
 * נגדית מצאה שישה מסלולים נפרדים שבהם פוסט חי לחלוטין היה מוכרז כחסר
 * ומתפרסם שוב, והגרוע בהם אינו מקרה קצה אלא ודאות:
 *
 *   • ok:true מ-readOurPostsInGroup אומר ש-goto הצליח ו-classifyPage לא ראה
 *     טופס התחברות. הוא אינו אומר שהפיד רונדר. פרופיל קר, תגובה איטית או
 *     מסך ביניים שהוגש אחרי הסיווג מחזירים {ok:true, posts:[]}.
 *   • matchPosts מסרב להכריע כששני פוסטים שלנו מתאימים לאותו טקסט. קמפיין
 *     עם חזרה יומית מייצר בדיוק את זה — ואז אף שורה לא תתאים לעולם.
 *   • פוסט הממתין לאישור מנהל הקבוצה אינו מופיע בדף המחבר כלל, ואישור מנהל
 *     הוא אחת הסיבות הסבירות ביותר לכך שהחלון לא נסגר מלכתחילה.
 *   • פרסום כ-Page לא מופיע תחת /user/<המזהה האישי>/.
 *   • וכל עוד התקלה חיה, park → absent → פרסום חוזר → park הוא לולאה בלי
 *     סוף: עותק חי נוסף בכל סיבוב.
 *
 * "חי" שגוי מפסיד פוסט אחד; "לא קיים" שגוי מפרסם את אותו פוסט פעמיים לנצח.
 * ההכרעה נמחקה. מה שנשאר מחליט דבר אחד — האם הפוסט שלנו נמצא על הדף — וכל
 * מקרה אחר לא כותב כלום ומשאיר את השורה בדיוק כפי שהיא.
 *
 * וזה עדיין שווה: שורה שאומתה הופכת ל-published אמיתית, וזאת הצורה היחידה
 * ששני שומרי הכפילות ב-rules.ts יודעים לראות — כך שאימות הוא בעצמו הגנה
 * מפני פרסום כפול.
 *
 * DOES THIS HAVE TO REACH THE PC? כן, הסריקה רצה על המחשב. התזמון, סדר
 * התור, חישוב זמני הפרסום, חלון הפרסום והתורים הקיימים לא נגעו.
 */
/*
 * ─────────────────────────── 4.45.0 ────────────────────────────────────────
 *
 * "כל מה שקשור לבטיחות הרצה גם תמחק והחלון דפדפן שיהיה תמיד סגור כברירת מחדל
 *  לא צריך שזה יפתח לי חלונות במחשב וגם לא ללקוחות"
 *
 * שלושת המתגים — מצב בדיקה, אישור לפני כל פרסום, וחלון דפדפן גלוי — ירדו
 * ממסך ההגדרות. אבל מחיקת מתג אינה כיבוי שלו: הערכים יושבים בשורה שמורה,
 * ובכל מכונה שאי פעם הריצה את המוצר כתוב debugMode: true — וזה מה שפותח חלון
 * Chromium בכל סבב, אצלו ואצל כל לקוח. לקוח שבשורה שלו כתוב גם
 * requireConfirmation היה נשאר ממתין לאישור בלי מתג שייתן אותו.
 *
 * לכן browserSettings() ב-social-worker.ts מכריח את שלושתם בכל קריאה, והוא
 * הקריאה היחידה — אין מסלול שני. בלי SQL, בלי מיגרציה, ובלי להחמיץ שורה:
 * לקוח שלא נגע בלוח הבקרה מכוסה ברגע שה-worker שלו מתעדכן.
 * DEFAULT_BROWSER שונה גם הוא, כדי שמכונה חדשה לא תפתח חלון מלכתחילה.
 *
 * SOCIAL_BROWSER_HEADED=1 נשאר הדרך היחידה לחלון גלוי, והיא משתנה סביבה של
 * מפתח ולא מסך של לקוח.
 *
 * וההתחברות לא נפגעת ואסור שתיפגע: interactiveLogin פותח חלון גלוי משלו
 * בכל מקרה (session.ts, newPage(false, 'התחברות ידנית')), כך ש"התחבר
 * לפייסבוק" עדיין מראה לאדם את הדף שהוא צריך להקליד בו. יש על זה קיבוע.
 *
 * DOES THIS HAVE TO REACH THE PC? כן, זה כל העניין — החלון נפתח שם.
 */
/*
 * ─────────────────────────── 4.50.0 ────────────────────────────────────────
 *
 * "לא מפרסם שוב תבדוק" → "יכול ליהיות בגלל שהסרתי 6 קבוצות?"
 *
 * כן. וזה נמדד מהמסד החי שלו, אחרי שניחשתי פעמיים וטעיתי:
 *
 *   plan_failed  insert or update on table "social_queue"
 *                violates foreign key constraint "social_queue_target_id_fkey"
 *   plan_retry   failed=14  schedule=d4a226ec   ← 7 קבוצות מחוקות × 2 מועדים
 *   plan_retry   failed=6   schedule=38dec06a   ← 3 קבוצות מחוקות × 2 מועדים
 *
 * כל דקה, לנצח. עשרה מזהי קבוצות היו רשומים בשני סבבים פעילים ולא היו קיימים
 * באף טבלה.
 *
 * למה: social_schedules.target_ids הוא uuid[] רגיל בלי מפתח זר, ולכן מחיקת
 * קבוצה משאירה את המזהה שלה בכל סבב שכלל אותה. ל-social_queue.target_id יש
 * מפתח זר עם ON DELETE CASCADE — השורות בתור נמחקות, וכל ניסיון לכתוב חדשה
 * נדחה על ידי המסד.
 *
 * מה שמשתנה כאן, ובגללו הגרסה הזאת חייבת להגיע למחשב:
 *   • liveTargetIds — קריאה אחת לכל מעבר, מחולקת למנות, ועם שני מעצורים.
 *     קריאה שנכשלה לא תדווח על קבוצה כמחוקה — וגם קריאה שהחזירה אפס שורות
 *     בלי שגיאה כלל. "אף אחת מהמאה האלה לא קיימת" היא טענה חזקה הרבה יותר
 *     מ-RLS שלא תואם, עמודת לקוח שהבקשה לא נשאה, או מטמון סכימה ישן.
 *     הסוויטה תפסה בדיוק את זה: plan-noise.test.ts מריץ את המתכנן האמיתי
 *     מול מסד מדומה שעונה [], והגרסה הראשונה של הסינון ביטלה סבב שלם בשקט.
 *   • ומעצור שני, לכל סבב: סינון שרוצה להסיר יותר מחמישית מהרשימה לא מצא
 *     מחיקות אלא קריאה שאסור לסמוך עליה. במקרה כזה הרשימה השמורה נשארת
 *     כמות שהיא, שגיאות המפתח הזר חוזרות, והיומן אומר למה. רעש אפשר
 *     לתקן; סבב שמפרסם בשקט לאף אחד — לא.
 *   • המתכנן מסנן את הרשימה לפני חישוב המשבצות, כך שסבב של 252 קבוצות עם 7
 *     מחוקות מתכנן 245 משבצות במקום לתכנן 252 ולאבד 7 לשגיאה. גם המסלול
 *     ההדרגתי, שהיה לו אותו באג.
 *   • planErrorText — ההודעה שנכתבת ליומן היא משפט שאפשר לפעול לפיו. היא
 *     הייתה הודעת Postgres באנגלית, ו-ActivityFeed מחליף כל הודעה בלי עברית
 *     ב"תקלה טכנית" — כך שהשורה היחידה שידעה מה קרה הייתה היחידה שאי אפשר
 *     היה לקרוא. שגיאה שאינה מוכרת עוברת כמו שהיא ולא מתורגמת לניחוש.
 *   • ושורת הספירה הפסיקה לטעון "לא הייתה גישה למסד הנתונים" על כל כישלון
 *     כתיבה. המסד היה זמין לחלוטין; המשפט הזה שלח אותו ואותי לחפש תקלת
 *     חיבור במשך שעה.
 *
 * ─── ועוד שינוי במנוע, לבקשתו המפורשת ──────────────────────────────────
 *
 * "אני רוצה שהמתכנן יספור רק את של אותו היום הנוכחי בלבד לא 48 שעות."
 *
 * אופק התכנון היה 48 שעות, וזה מה ששם את אותו פוסט מול אותה קבוצה פעמיים
 * באותו אחר צהריים. נמדד על המסד החי ב-06/11: מעבר אחד ב-20:50 תכנן גם את
 * ההופעה של 12:00 היום וגם את זו של מחר, 232 קבוצות כל אחת; כששעת ההתחלה
 * שונתה ב-23:48 התור קיבל חותמות מחדש, והמפל הניח את הסבב של מחר בהמשך
 * ישיר לזה של היום — 464 שורות, 12:00 עד 15:51, כל קבוצה פעמיים בהפרש
 * שעה וחמישים ושש. רצפת החזרה לאותה קבוצה בחשבון שלו היא 0, אז שום דבר
 * לא עמד בדרך.
 *
 * אופק של יום מוציא את זה מכלל אפשרות במבנה ולא בשומר: ההופעה של מחר לא
 * נכתבת עד מחר, ואין מה לגרור קדימה.
 *
 * מה זה עולה, וזה עולה: 48 השעות שימשו גם כרזרבה — סבב שהשעה שלו עברה
 * בזמן שהמחשב היה כבוי עדיין החזיק שורות ופרסם אותן באיחור. בתכנון ליום
 * בלבד, חלון שהוחמץ בזמן שהמחשב כבוי הוחמץ סופית. זה הטרייד שהתבקש, והוא
 * רשום כאן כדי שאיש לא ירחיב את האופק בלי לפגוש אותו.
 *
 * הגבול הוא חצות מקומית ולא now+24h, אחרת האופק נודד עם הדקה שבה המעבר
 * רץ ושני מעברי השעון בישראל היו מתכננים סבב פעמיים או בכלל לא.
 *
 * DOES THIS HAVE TO REACH THE PC? כן, והפעם בלי ספק: המתכנן רץ שם
 * (worker/social-worker.ts קורא ל-planQueue).
 *
 * התזמון, סדר התור, חישוב זמני הפרסום, חלון הפרסום והתורים הקיימים לא נגעו.
 */
/*
 * 4.51.0 → 4.52.0, AND THE ANSWER IS YES.
 *
 * worker/facebook/account.ts — reading the owner's Facebook account for the
 * dashboard — fetches their avatar through `context.request`, which shares
 * the browser's cookie jar by design. On CI's Chromium 131 that jar ends up
 * EMPTY after three such fetches to an address that does not resolve;
 * measured, printed by the assertion itself: `cookies now: []`. On the
 * Chromium here it does not happen, which is why the account test has passed
 * locally and never once in CI.
 *
 * Whether that build empties it from exactly there is NOT established. What
 * is established is the consequence, and the consequence is the owner's
 * session: an empty jar on facebook.com is a signed-out worker, which stops
 * publishing until somebody signs in again. So the fetch now puts the jar
 * back if it finds it emptied, and a decoration can no longer end a session.
 *
 * This runs on the PC — account.ts is called by the worker — so it has to
 * reach it.
 *
 * התזמון, סדר התור, מנגנון הפרסום וחישוב זמני הפרסום לא נגעו.
 */
/*
 * ─── 4.56.0 → 4.57.0 — DOES THIS HAVE TO REACH THE PC? YES, AND IT IS THE
 *     CLEAREST YES SINCE THE PLANNER ───────────────────────────────────────
 *
 * The gate that decides whether anything publishes at all lives in
 * worker/social-worker.ts and runs THERE. Measured on his account on
 * 09.11.2026 at 17:21: the freeze cleared from the dashboard at 17:14, the
 * row reading `rateLimitedUntil = null`, the worker alive five seconds ago
 * with Facebook connected and no job running, 46 rows waiting and five of
 * them already past their minute — and nothing going out, because
 * `state.attention` could only ever be cleared inside the branch that the
 * cleared row had just made unreachable.
 *
 * It is in MEMORY, so the only cure was closing the app. Left on 4.56.0 the
 * dashboard would keep offering a "נקה" button whose effect is to lock the
 * machine it is supposed to free. There is no server-side half of this fix.
 *
 * AND THE NUMBER WAS CHECKED AGAINST THE RELEASE LIST, not against this
 * file: v4.56.0 was published today at 05:59, so 4.57.0 is free.
 */
/*
 * ─── 4.57.0 → 4.58.0 — DOES THIS HAVE TO REACH THE PC? YES. SAME GATE,
 *     AND THIS TIME THE RULE INSTEAD OF THE CASE ─────────────────────
 *
 * 4.57.0 freed ONE notice: the one the rate-limit branch had raised. The
 * owner's answer to that fix was that he does not want to turn the program
 * off and on again — ever, for any of them — and he is right, because there
 * are six places in worker/social-worker.ts that write `state.attention` and
 * 4.57.0 cleared exactly one of them. One of the other five, the idle-window
 * circuit breaker, was literally printing הפעילו מחדש את התוכנה במחשב.
 *
 * So the notice now carries a clock, kept at the GATE and not at the six
 * writers: ten minutes of holding the queue and it is cleared, whoever wrote
 * it, including code written next month by somebody who never reads this
 * file. The stamp moves when the TEXT changes, so a loop re-writing the same
 * sentence every tick cannot renew its own lease.
 *
 * NOTHING IS SWEPT UNDER THE CARPET. The three real gates — paused,
 * rate-limited, disconnected — are separate reads of saved state and still
 * stand ahead of this; a cause that is still there raises its notice again on
 * the very next attempt, at a cost of one attempt every ten minutes. What is
 * gone is the case where the CAUSE ended and the SENTENCE outlived it: that
 * is what cost five and a half hours on 09.11, and it is in memory, so there
 * is no server-side half of this fix either.
 *
 * AND THE NUMBER WAS CHECKED AGAINST THE RELEASE LIST: v4.57.0 was published
 * today at 15:45, so 4.58.0 is free.
 *
 * התזמון, סדר התור, מנגנון הפרסום, חישוב זמני הפרסום וההגדרות הקיימות לא נגעו.
 */
/*
 * ─── 4.58.0 → 4.59.0 — DOES THIS HAVE TO REACH THE PC? YES. THE FIX FOR
 *     4.57.0'S OWN BUG, FOUND BY 4.57.0'S OWN LOG LINE ──────────────────
 *
 * b70bd67 taught the worker to take the freeze banner down when the row had
 * been cleared from outside. It compares two facts that are read at different
 * instants, and on his live log the gap between them is visible to the second:
 *
 *   17:11:26  rate_limited        פייסבוק הגביל … (Бээр-Шева и юг Израиля)
 *   17:11:27  rate_limit_cleared  ההגבלה כבר לא בתוקף   ← one second later, and false
 *   17:11:36  worker_holding      … (עוד 180 דק׳)         ← so it very much was
 *   17:13:15  rate_limited        פייסבוק הגביל … (Бээр-Шева на ладони)
 *
 * `control` is read once at the top of the tick; a lane still publishing
 * writes the freeze after that read and sets `freezeHold` in the same breath.
 * So the release saw "no freeze" from before it existed and "mine" from after,
 * believed both, took the notice down — and the notice was the only thing
 * still closing the gate, because the freeze gate itself had already been
 * passed with the stale value. The 17:13 line is the cost: a publication
 * pushed into an account Facebook was in the middle of limiting.
 *
 * It now re-reads before it believes the answer, and holds when the freeze
 * turns out to be standing. The re-read cannot miss: the rate-limit branch
 * awaits its write BEFORE setting `freezeHold`, so wherever the flag is true
 * the row is already there. A real clear from the dashboard is minutes old
 * and behaves exactly as it did.
 *
 * This is the publishing gate and it runs on the PC, so it has to reach it.
 * CHECKED AGAINST THE RELEASE LIST: v4.58.0 was published 09.11 at 16:34 and
 * both machines are already running it, so 4.59.0 is free.
 *
 * התזמון, סדר התור, מנגנון הפרסום וההגדרות הקיימות לא נגעו.
 */
/*
 * ─── 4.59.0 → 4.60.0 — DOES THIS HAVE TO REACH THE PC? YES, AND IT IS THE
 *     FIRST COMMAND IN THIS PRODUCT THAT TAKES SOMETHING AWAY ────────────
 *
 * "תוסיף כאן אופציה מהירה לצאת מהקבוצות שכשלו ולא ניתן לפרסם בהן."
 *
 * Measured on his account on 10.11: fifteen failures in one day, fourteen of
 * them the same "לא מצאתי את תיבת כתבו משהו…", and ALL FIFTEEN
 * groups still switched on — composer.ts throws PublishError('composer') and
 * only `cannot_post` retires a target, so tomorrow's attempts were going to
 * the same fifteen.
 *
 * The in-app half of his answer — "הפסק לנסות בקבוצה הזו" — is
 * pauseTargets() and needs no release. THIS half is a browser on his machine
 * pressing Facebook's own "עזיבת הקבוצה", so it cannot be anywhere else.
 *
 * WHAT MAKES IT SAFE, because leaving cannot be undone from the app and
 * plenty of these groups re-admit only through an admin:
 *   • the dashboard ASKS first, naming that cost, and the menu item only
 *     opens the question — one tap can never end a membership;
 *   • the worker re-parses the ADDRESS and finds the row itself, inside its
 *     own tenant. No id from the dashboard decides which group is left;
 *   • a press is not an outcome. The page is loaded again and "left" is
 *     claimed only where Facebook then offers the way back in;
 *   • and the group is switched off only on an answer the page gave — never
 *     on a click nobody confirmed.
 *
 * worker/test/leave.test.ts drives all of it in a real browser, including the
 * case that found a genuine bug while it was being written: Facebook keeps
 * the menu's items in the DOM and merely hidden, so reading labels without a
 * visibility filter clicks a hidden control and reports a failure on a group
 * it never tried to leave.
 *
 * CHECKED AGAINST THE RELEASE LIST: v4.59.0 was published today at 06:48 and
 * both machines are already running it, so 4.60.0 is free.
 *
 * התזמון, סדר התור, מנגנון הפרסום וההגדרות הקיימות לא נגעו.
 */
/*
 * ─── 4.60.0 → 4.61.0 — THE LEAVE BUTTON, FIXED BY THE FIRST PERSON WHO
 *     PRESSED IT ────────────────────────────────────────────────
 *
 * He pressed it on 11.11, on "דירות להשכרה שכונות טובות באר שבע",
 * and got back: "לא נמצא כפתור יציאה בעמוד הקבוצה. הקבוצה לא שונתה."
 *
 * THE SAFETY HALF WORKED EXACTLY AS BUILT — no control found, nothing
 * pressed, nothing claimed, and the group left switched ON. That sentence is
 * the design holding.
 *
 * THE FINDING HALF DID NOT. 4.60.0 looked for the overflow "…", and on a
 * group you have JOINED Facebook does not draw one: the header carries a
 * button that says הצטרפת / Joined / Вы участник, and THAT opens the menu
 * holding "עזיבת הקבוצה". So on every group this feature exists for, the
 * menu was never opened at all. Three changes, and the third is the one that
 * matters most for next time:
 *
 *   1. the joined button is an OPENER (never a verdict — `not-member` is
 *      still decided by JOIN_LABEL alone);
 *   2. EVERY opener is tried, not the first that matches, with Escape between
 *      them, because one wrong guess used to end the attempt and a menu left
 *      open covers the next control;
 *   3. A DEAD END NOW SAYS WHAT IT SAW. The labels the page really offered
 *      come back with the refusal, and a screenshot is filed with it. Working
 *      out this bug took a round trip through the owner, and that is the part
 *      that must not repeat: the next layout Facebook ships should be
 *      diagnosable from his log without asking him what was on his screen.
 *
 * worker/test/leave.test.ts reproduces his page — no "…" anywhere, a decoy
 * opener before the real one, an overlay that covers the page until Escape.
 * Four mutations, four failures, and the first of them is literally 4.60.0.
 *
 * CHECKED AGAINST THE RELEASE LIST: v4.60.0 was published today, so 4.61.0
 * is free.
 *
 * התזמון, סדר התור, מנגנון הפרסום וההגדרות הקיימות לא נגעו.
 */
/*
 * 4.63.0 → 4.64.0. DOES THIS HAVE TO REACH THE PC? YES — IT IS ENTIRELY ON IT.
 *
 *   "המנגנון חיפוש קבוצות עובד לאט ולא מוצא את כל הקבוצות שיש"
 *
 * Group discovery does not run on the server at all. The signed-in browser on
 * his Windows machine opens Facebook's own search, scrolls it and reads the
 * cards; the hosted app only stores what comes back. Every one of the four
 * fixes is in that code:
 *
 *   worker/facebook/discover.ts  — the phrase filter loses its veto and
 *     becomes a mark plus a sort key (it was deleting 37 of 56 results on his
 *     own account); PASSES 6 → 12; the scroll stops on two barren passes AT
 *     THE BOTTOM instead of on the first pass that adds nothing, which was
 *     ending the read on Facebook's own render delay; a 25-second ceiling on
 *     the picture pass.
 *   worker/facebook/mygroups.ts  — the section heading above a card is now
 *     the NEAREST one, not every heading at the level joined together. On the
 *     layout Facebook ships once there are suggestions, that join matched
 *     "קבוצות מומלצות" and dropped his own groups with it; worker/test/
 *     discovery-complete.test.ts reproduces it in a browser and the list came
 *     back EMPTY.
 *   worker/social-worker.ts      — the search is now told which rows the
 *     database can already answer for (a stored member count, privacy word
 *     and picture), so the second pass stops only on cards it could learn
 *     something from. Showing everything tripled that pass's work: measured
 *     on the 56-result fixture, 18.0s became 37.3s, and a re-run of a saved
 *     phrase — the common case — now costs 17.1s instead of 37.4s. And the
 *     sentence he reads no longer claims results were filtered out, because
 *     they are not.
 *
 * Left on 4.63.0 the dashboard would show the new "מדויק" chip and the new
 * filter over a result set the PC still truncated and still filtered: the UI
 * of the fix without the fix.
 */
/*
 * 4.64.0 → 4.65.0. DOES THIS HAVE TO REACH THE PC? YES — IT IS THE SESSION.
 *
 * captureAvatar fetched the profile picture by the address the PAGE gave it,
 * using `page.context().request` — which shares the browser's cookie jar in
 * BOTH directions. Measured 12.11:
 *
 *   · it sends `c_user; xs; datr` to any facebook.com address it is handed,
 *     and sends nothing at all to the *.fbcdn.net hosts avatars really live
 *     on — so the sharing bought the avatar nothing;
 *   · Playwright writes every reply's Set-Cookie back into that jar and
 *     follows up to twenty redirects, recomputing the cookie header per hop;
 *   · `addCookies` with a past expiry DELETES;
 *   · and the guard beside it only restored when the jar came back
 *     COMPLETELY empty, so a partial deletion passed in silence.
 *
 * The byUrl proof accepts any src containing the account's numeric id with no
 * restriction on the host, so a page can name one on facebook.com itself.
 * That is a path by which reading a decoration signs the owner out — and a
 * signed-out worker is "עדיין לא מפרסם כלום", a complaint already in the log.
 *
 * It now fetches from a context of its own, with no session in it and no
 * redirect followed. Left on 4.64.0 the PC keeps the shared jar, so this is
 * exactly the kind of fix that is worthless on the dashboard alone.
 *
 * worker/test/account.test.ts proves it behaviourally: a cookie is planted on
 * the avatar's own host, and the fetch must not carry it. Reverted to the old
 * shared jar, that assertion fails with
 * ["probe_session=must-not-travel"].
 *
 * MEASURED against a bundle built from this tree (node scripts/build-app.mjs,
 * then grep -oF … | wc -l over dist/app/worker.cjs):
 *
 *   request.newContext      1      page.context().request  0
 *   maxRedirects: 0         1      captureAvatar           6  (the control)
 */
export const WORKER_VERSION = '4.65.0';

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
   executes it.)

   ─── RE-PINNED AGAIN, and 4.49.0 stays, for the same reason and with the
   same proof. ──────────────────────────────────────────────────────────────

   "שיספור רק את הקבוצות שאליהם אמור לצאת הפרסום וכמה פורסם מתוכם" — the
   cards now lead with groups instead of publications. That moved
   campaign.ts (the state and a new groupProgress) and client.ts (the counts
   read asks the groups view for `*` and parses two new columns).

   DOES THIS HAVE TO REACH THE PC? No, and it cannot: the worker imports
   account-scope, cities, compose, discovery, errors, plan, rules, status,
   tenant, time, types and this file — and neither campaign.ts nor client.ts
   is among them. Asked of the build rather than of the import list:

     npm run build:app
     grep -c groupProgress        dist/app/worker.cjs → 0
     grep -c publishedTargetCount dist/app/worker.cjs → 0
     grep -c targets_published    dist/app/worker.cjs → 0
     grep -c campaignState        dist/app/worker.cjs → 0
     grep -c campaign_targets     dist/app/worker.cjs → 0

   So this reaches him when the website deploys, with nothing to install, and
   a release number is not burned on a change no installed copy carries. The
   publishing engine, the queue order, the publish instants, the publishing
   window and every existing queue were not touched.

   The two SQL columns behind it are a VIEW — public.social_campaign_targets,
   in supabase/social-latest.sql — and a view reads. Until that file is run
   the card draws the publications ratio it always drew and one line names the
   file, which is what worker/test/group-count.test.ts §4 and §6 hold it to.

   ─── RE-PINNED ONCE MORE: the corrections an adversarial review found in the
   above, plus the hour field. 4.49.0 still stays. ─────────────────────────

   The review of that change reported a regression I had shipped and it
   reproduced: with v27's counting views present and v38's columns absent, the
   published-group figure was counted off the preview rows, and for a round
   whose publications are older than that preview the card rendered "פורסם
   לפחות ל-0 מתוך 252 קבוצות היום" over a round that had reached 204. The
   figure is now ABSENT in that case rather than a floor of zero. Four more
   from the same pass: the round screen no longer draws a group ring at all
   (its feed is a different scope and it contradicted the dashboard), 100% may
   not be printed while publications are still queued, a clamped disagreement
   between two reads is hedged rather than asserted, and a groups read that
   fails for any reason other than a missing view no longer passes as exact.

   And the hour field — "אני עוד לא מספיק לבחור וזה זורק אותי מהבחירה" — now
   keeps its draft on the panel and writes once, when the picker closes,
   instead of once per notch of the iOS wheel.

   DOES THIS HAVE TO REACH THE PC? Still no, and asked of the build again:

     npm run build:app
     grep -c groupProgress        dist/app/worker.cjs → 0
     grep -c publishedTargetCount dist/app/worker.cjs → 0
     grep -c targets_published    dist/app/worker.cjs → 0
     grep -c campaignState        dist/app/worker.cjs → 0
     grep -c campaign_targets     dist/app/worker.cjs → 0
     grep -c startDraft           dist/app/worker.cjs → 0
     grep -c TimePick             dist/app/worker.cjs → 0

   ─── RE-PINNED: a round that left a day now comes back to it. 4.52.0 stays.

   "אני מפעיל את הקמפיין גם ביום שבת בשעה 18:45, למה הוא מתכוון לפרסם רק
   מחרתיים?" · "תתקן את זה שלא יחזור." — 07.11.2026.

   roundAnchor() built the window's opening from the date of the FIRST ROW IN
   THE QUEUE, and nextAllowedAt() only moves forward, so a round pushed off
   Saturday — correctly, while Saturday was unchosen — could not return when
   Saturday was re-chosen. It now also asks whether the first instant the
   window permits FROM NOW falls on today's calendar date, and takes it when
   it does and the day is unspent.

   DOES THIS HAVE TO REACH THE PC? No, and the build was asked rather than
   reasoned at:

     npm run build:app
     grep -c roundAnchor             dist/app/worker.cjs → 0
     grep -c dayIsUnspent            dist/app/worker.cjs → 0
     grep -c todayIsFree             dist/app/worker.cjs → 0
     grep -c rescheduleCampaignQueue dist/app/worker.cjs → 0
     grep -c roundMovedTo            dist/app/worker.cjs → 0

   The controls in the same build show the walk is not blind: planQueue 3,
   targetsAlreadyWaiting 4, nextAllowedAt 5, windowedCascade 3.

   AND ONE CORRECTION TO THE FIRST ATTEMPT AT THIS NOTE, because it had the
   wrong answer written out with evidence beside it. The first draft of the
   fix added an exported helper named startOfNextZonedDay to
   campaign-schedule.ts; this note then recorded 'grep -c startOfNextZonedDay
   → 3' and explained the three hits as campaign-schedule.ts shipping whole.
   They were nothing of the kind. rules.ts has had a PRIVATE function of that
   exact name since long before (rules.ts:203, used by the daily ceilings at
   :547), and those were its three hits. The helper was removed with the
   second draft, the count is still 3, and it never had anything to do with
   this change — a reminder that a grep over a bundle answers "is this string
   present", not "is this code mine".

   AND THE FIX DOES NOT NEED THE MACHINE ANYWAY. The re-stamp lives in
   client.ts, which carries 'use client' and runs on the owner's phone when he
   saves the schedule. It takes effect the moment Vercel finishes — a PC still
   on an older build publishes exactly as it did, from a queue whose instants
   the dashboard has corrected. Bumping the version would make every
   customer's machine download and restart for code it cannot reach.

   ─── AND AGAIN, for the groups screen's new category. 4.52.0 still stays.

   "תוסיף קטגוריה חדשה בקבוצות של הקבוצות שלא ניתן לפרסם בהם" — 07.11.2026.

   status.ts gained cannotPublishTo(), a pure predicate over two columns of a
   social_targets row, and the groups screen filters and counts by it. The
   file is bundled, so the function rides along; nothing in worker/ or
   desktop/ calls it:

     grep -rn 'cannotPublishTo' worker/ desktop/ --include=*.ts → (none)

   DOES THIS HAVE TO REACH THE PC? No. The category is a view over data the
   worker already writes (last_status, last_published_at) and the actions
   behind it are the screen's own existing writes — bulkUpdateTargets and
   bulkDeleteTargets, both browser-side. A machine that never updates keeps
   publishing exactly as it does now.

   IT WILL, THOUGH, AND DELIBERATELY. The predicate was put in status.ts
   rather than in the page because the quarantine this is the manual version
   of belongs in the worker, and two copies of the rule would drift towards
   deleting a working group. When that lands, the version bumps with it.

   ─── AND IT LANDED, SO THE VERSION BUMPS: 4.52.0 → 4.53.0.

   "על תציע לי פתרון חלקי — מהיום כל קבוצה שאני משהה / מסיר זה מוריד אותן
   אוטומטית מהספירה ומהפרסום והמספרים צריכים להתעדכן באותו הרגע." — 07.11.2026.

   liveTargetIds() in plan.ts now leaves a switched-off group out of the
   plan, and THIS ONE RUNS ON THE PC. Asked of the build rather than reasoned
   at, which is what this guard is for:

     npm run build:app
     grep -c liveTargetIds  dist/app/worker.cjs → 4
     grep -c planQueue      dist/app/worker.cjs → 3
     grep -c pauseTargets   dist/app/worker.cjs → 0

   The planner and the function it calls are both in there; the browser half
   is not, as it should not be. A machine that does not update keeps queueing
   publications into groups its owner switched off.

   The browser half — pauseTargets(), which cancels the waiting rows —
   reaches him the moment Vercel finishes and is correct on its own. But the
   two are designed as a PAIR, and only the pair stops the number bouncing:
   cancelling a paused group's rows frees it from targetsAlreadyWaiting, and
   an un-updated planner queues it straight back on its next pass. Shipping
   the browser half alone would have been the partial fix he refused.

   AND THE NUMBER WAS CHECKED AGAINST THE RELEASE LIST, not against this
   file. The workflow refuses a version that is already published; on
   07.11.2026 GitHub's newest published tag was v4.52.0, so 4.53.0 is free.
   This file cannot answer that question and must not be trusted to. */
/*
 * ─── 07.11.2026 — THE AI POST GENERATOR CAME AND WENT ────────────────────
 *
 * An AI post generator was added to the new-post screen and then deleted the
 * same evening at the owner's word: "תמחק את כל העניין עם ה-AI בפוסטים."
 * Both moves touched src/lib/social (ai-post.ts arrived, then left), so this
 * fingerprint moved twice and is back to covering the same file set as before
 * the feature existed.
 *
 * WORKER_VERSION NEVER MOVED, through either change, and the bundle was asked
 * rather than reasoned at with each one. `npm run build:app` needs
 * electron-updater, which package.test.ts explains is deliberately absent from
 * package.json and prints the install command for; with it installed for the
 * run, the bundle answered: every AI symbol 0, against dedupeKey 4 as a
 * control. The generator ran on Vercel and in a browser, never on a
 * customer's PC, so there was never anything for an installed copy to
 * download — and nothing to un-download now.
 *
 * WHAT SURVIVED THE DELETION, on purpose: prefixed() in compose.ts. The
 * personal variant template wrote `אני מ${business.name}`, which is right for
 * a Hebrew name and produced "אני מANX" for a Latin one — in text that
 * publishes to fifty groups. It was found by running the generator and
 * reading its output, it has nothing to do with AI, and the four-variants
 * button that has always been on this screen still emits that sentence.
 * Reverting it would have put the broken form back.
 */
/*
 * ─── 08.11.2026 — 4.54.0 → 4.55.0. THE THREE MODES CHANGED AND THE REST WENT ─
 *
 * "סבב מהיר יוצא כל 40 שניות לקבוצה, בינוני כל דקה וחצי, ואיטי כל 2 דקות.
 *  תבטל את הדקות המתנה בין 10 פוסטים זה לא רלוונטי"
 *
 * DOES THIS HAVE TO REACH THE PC? YES, twice over, and both halves are in
 * code the PC runs before every click:
 *
 *   · rules.ts no longer has a rest gate at all. Until an installed copy
 *     downloads this, it keeps deferring rows with "הפסקה אחרי 10 פרסומים
 *     רצופים" — a hold the dashboard no longer explains, because every screen
 *     that drew the countdown is gone. A half-updated estate is the worst of
 *     the three states: the engine holding and the UI silent.
 *   · worker/social-worker.ts's own pre-claim gate dropped `restMs` and reads
 *     one row again instead of ten.
 *
 * The gaps themselves (40 / 90 / 120) are DATA the PC reads from
 * social_settings through applyGapFloor(), so those reach an old copy on
 * their own — but an old copy would then run the new gap AND the old rest.
 *
 * AND THE NUMBER WAS CHECKED AGAINST THE RELEASE LIST, not against this file.
 * GitHub's newest published tag on 08.11.2026 was v4.54.0 (published 07.11 at
 * 22:17), so 4.55.0 is free. This file cannot answer that question and must
 * not be trusted to.
 */
/*
 * ─── 08.11.2026 — 4.55.0 → 4.56.0. THE SECOND PASS IS GONE ───────────────
 *
 * "פרסום שנכשל לדלג ולא להחזיר לתור"
 *
 * worker/revive.ts is DELETED and reviveFailedRows() with it. A publication
 * that fails is finished: the row stays `failed`, the group is free the same
 * second, and nothing hands it back to the end of the queue for a second
 * attempt. The owner can still retry one by hand from the activity sheet.
 *
 * DOES THIS HAVE TO REACH THE PC? YES, and it is the clearest kind of yes: the
 * loop being removed RUNS ON THE PC. Until an installed copy downloads this it
 * keeps doing the thing he asked to stop, every two minutes, and the dashboard
 * keeps writing "N פרסומים שנכשלו הוחזרו לסוף התור" — the line he pointed at.
 *
 * WHAT IT COST, measured before removing it rather than assumed: 711 rows were
 * tried a second time; 381 published and 330 did not, a 53.6% success rate.
 * This was not dead weight, and he is giving up roughly 7 publications a day
 * for it. Of the 330 that still failed, 239 were "לא מצאתי את תיבת כתבו משהו"
 * — groups the account cannot post in, where a second attempt never could have
 * helped. The arithmetic is in worker/test/revive.test.ts so the next reader
 * does not have to take it on trust.
 *
 * AND THE NUMBER WAS CHECKED AGAINST THE RELEASE LIST, not against this file:
 * v4.55.0 was published on 08.11, so 4.56.0 is free.
 *
 * ─── 09.11.2026 — THE FINGERPRINT MOVED AND THE VERSION DELIBERATELY DID NOT ─
 *
 *   "לא אמור ליהנות גם 600 שניות, הפרסום צריך לצאת אחד אחרי השני לפי קצב
 *    מהיר בינוני או בטוח לפי מה שבחרתי"
 *
 * Two files under src/lib/social changed, so the fingerprint changed with
 * them, and the gate asked its question. The answer is measured, not reasoned,
 * against the bundle that is actually installed (dist/app/worker.cjs):
 *
 *   createRunWithRepeat  0      duplicateCampaign  0      applyPace  0
 *   bornGapSeconds       0      effectiveGroupGapSeconds  0
 *   ensureRunForPost     0      liveQueuePlan      0      logClientActivity 0
 *   scheduleColumns      0
 *   planQueue            3      evaluateQueueItem  3      (the control)
 *
 * client.ts is browser-only and is not compiled in at all — every symbol
 * unique to it answers zero while the engine's own answer three. The one
 * change in campaign-schedule.ts is inside scheduleColumns(), a write-side
 * helper no worker code calls, and it is tree-shaken out of the bundle.
 *
 * SO THIS IS THE CASE THE GATE'S OWN MESSAGE DESCRIBES: it genuinely does not
 * have to reach the PC, so the fingerprint is pasted and the version stays.
 * And the shape of the fix is what makes that true — what actually paces his
 * publishing is `social_campaigns.schedule_gap_seconds`, which the worker
 * READS FROM THE DATABASE at claim time (schedule_gap_seconds appears 3 times
 * in the bundle, nextPublishAt 3). Lowering that column is therefore obeyed
 * by the copy already on his machine, on its next claim, with no update and
 * no version collision.
 */
/*
 * ─── 09.11.2026 — AGAIN THE FINGERPRINT MOVED AND THE VERSION DID NOT ──────
 *
 *   "יומן פעילות (N)… יש להציג רק אירועים אמיתיים שנשמרו במערכת"
 *
 * The redesigned "פרטי הפרסום" window needs the log lines of ONE publication,
 * so client.ts gained listQueueActivity() and the queueIdOf import it uses.
 * client.ts is under src/lib/social, so the gate asked its question again.
 *
 * MEASURED AGAINST A BUNDLE BUILT FROM THIS EXACT TREE (node scripts/build-app.mjs,
 * then grep -o … | wc -l over dist/app/worker.cjs):
 *
 *   listQueueActivity  0      queueIdOf          0
 *   planQueue          4      evaluateQueueItem  4      (the control)
 *
 * Zero against four: the new function is not compiled in, and neither is the
 * helper it imports. It is read-only display code — the window's own log — and
 * the only caller is src/components/social/ActivityDetailSheet.tsx, which runs
 * in the browser and nowhere else. The built worker.cjs came out byte for byte
 * the size of the one built before the change (1,187,080 bytes).
 *
 * So this is the case the gate's own message describes: it genuinely does not
 * have to reach the PC. The fingerprint is pasted, 4.56.0 stands, and nobody
 * is asked to update anything for a window that only draws what is already in
 * social_activity_log.
 */
/*
 * ─── 12.11.2026 — 4.64.0: THE FINGERPRINT AND THE VERSION MOVED TOGETHER ───
 *
 * As they should: the whole of this change is worker/facebook/discover.ts and
 * worker/facebook/mygroups.ts, which exist only to drive the browser on his
 * PC. There is no question to answer here, and it was measured anyway, against
 * a bundle built from this exact tree (node scripts/build-app.mjs, then
 * grep -oF … | wc -l over dist/app/worker.cjs):
 *
 *   barren                   8      b.exact                 1
 *   atBottom                 5      notMine.test(head       1
 *   PASSES = 12              1      known.has               1
 *   PICTURE_FETCH_BUDGET_MS  2      haveFacts               2
 *   readMyGroups             4   (the control)
 *
 * Every one of the five fixes is compiled into the file that runs on his
 * machine. countExact, the count under the heading, answers 0 — it is drawn by
 * the dashboard and tree-shaken out of the worker, which is correct.
 */
/*
 * ─── 12.11.2026 — 4.65.0: the avatar fetch stops carrying the session ─────
 * Fingerprint and version move together, as they should: the change is in
 * worker/facebook/account.ts, which runs only on his PC. Numbers under
 * WORKER_VERSION above.
 */
export const WORKER_FINGERPRINT = '5eb1dbe78a516cc5';
