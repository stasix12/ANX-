/*
 * ─────────────────────────────────────────────────────────────────────────────
 * "תגובה מהירה אחרי פוסט" — THE AUTOMATIC COMMENT, END TO END
 *
 *   "הפעלה/כיבוי של תגובה אוטומטית · הקלדה ושמירה של טקסט התגובה · בחירת
 *    עיכוב · לאחר פרסום מוצלח, המערכת מנסה להוסיף את התגובה לפוסט המתאים, רק
 *    במקומות שבהם קיימת הרשאה ותמיכה בפלטפורמה · מניעת כפילויות באמצעות מזהה
 *    פרסום ייחודי · תיעוד הצלחה/כישלון וסיבה · כישלון בתגובה לא יגרום לפרסום
 *    חוזר של הפוסט · אין להציג תגובה כמוצלחת לפני אימות אמיתי בפלטפורמה · אם
 *    הפלטפורמה לא מאפשרת זאת, יש להציג מצב ברור ולא לדמות הצלחה."
 *   — 18.11.2026
 *
 * WHAT WAS ALREADY HERE, AND IS NOT TESTED AGAIN. The whole comment mechanism:
 * the round's text and image (v14), every publication's comment_status /
 * comment_at / comment_note / comment_shot, the chore that finds the post,
 * writes the comment, verifies it against Facebook and records the outcome.
 * comment-reach.test.ts, comment-sweep.test.ts and composer.test.ts own that.
 *
 * WHAT IS NEW IS ONE WIRE — who marks a publication "ready for its comment" —
 * and every one of the brief's promises is a property of that wire. So that is
 * what this file is about:
 *
 *   §1  the columns exist, with the defaults and the range that keep them
 *       honest, against a real Postgres built from this repository's own .sql;
 *   §2  the screen writes INTENT and never touches a publication;
 *   §3  the arming pass is in the comments' own chore, after the sweep and
 *       before the candidate read, and it never touches `status` — which is
 *       what makes "כישלון תגובה לא יגרום לפרסום חוזר" structural;
 *   §4  one publication, one automatic comment: armed only while
 *       comment_status is still '', with the condition repeated in the UPDATE,
 *       which this file then proves IS single-shot in a real Postgres;
 *   §5  the delay is measured from the post's own published_at — not from
 *       comment_gap_seconds, which is a different clock entirely;
 *   §6  only Facebook groups are armed, and the card says so;
 *   §7  nothing claims success before the platform confirms it.
 *
 *   npx tsx worker/test/auto-comment.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { applySchema, available, one, resetSchema, rows, skip } from './db/harness';
import { COMMENT_DELAY_MAX_SECONDS, COMMENT_DELAY_MIN_SECONDS, clampCommentDelay, commentArmCutoff } from '../../src/lib/social/rules';

const repoRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const src = (rel: string) => readFileSync(path.join(repoRoot, rel), 'utf8');
/* CODE, NOT PROSE. Every file in this repository explains at length what it
   no longer does, so "the string is present" has to mean present in the code
   — five pins in one day once matched a comment describing a deleted control. */
const code = (rel: string) =>
  src(rel)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/(^|[^:])\/\/.*$/gm, '$1 ');

let checks = 0;
const is = (cond: unknown, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = (a: unknown, b: unknown, what: string) => {
  checks += 1;
  assert.deepStrictEqual(a, b, what);
};

const worker = code('worker/social-worker.ts');
const client = code('src/lib/social/client.ts');
const card = code('src/components/social/QuickCommentCard.tsx');
const dash = code('src/app/social/page.tsx');
const hero = code('src/components/social/LiveCampaignHero.tsx');
const v44 = src('supabase/social-schema-v44.sql');
const rollback = src('supabase/social-schema-v44-rollback.sql');
const v45 = src('supabase/social-schema-v45.sql');
const rollback45 = src('supabase/social-schema-v45-rollback.sql');
const latest = src('supabase/social-latest.sql');

/* ══════════════ 2. THE SCREEN WRITES INTENT, NEVER A PUBLICATION ═════════ */

/* UP TO clearPendingComments AND NOT TO queueCampaignComment: the reset lives
   between the two and DOES touch social_queue — by design, it is the button
   that empties the queue. A slice that swallowed it would be asserting the
   opposite of what it means to. */
const writer = client.slice(client.indexOf('export async function setCampaignAutoComment'), client.indexOf('export async function clearPendingComments'));
is(writer.length > 300, 'setCampaignAutoComment could not be isolated — every check over it would be vacuous');
/* THROUGH updateTolerant, which names the table rather than chaining from
   db() — so the pin is on the table it is handed, not on the call shape. */
is(/updateTolerant\('social_campaigns'/.test(writer), 'it writes the ROUND');
/*
 * ─── AND IT SURVIVES A DATABASE ONE MIGRATION BEHIND — 18.11.2026 ────────
 *
 *   "למה כל פעם צריך להריץ את זה... תסדר את זה מעכשיו"
 *
 * A write that names five columns and meets a database missing one of them
 * used to refuse all five and show a wall of red. It now drops the column the
 * database named and tries again — and REPORTS what it dropped, because a
 * partial save that says "נשמר" is its own lie.
 */
{
  const tol = client.slice(client.indexOf('export async function updateTolerant'), client.indexOf('export const COMMENT_AUTO_SINCE_KEY'));
  is(tol.length > 400, 'updateTolerant could not be isolated — the checks over it would be vacuous');
  is(/Could not find the\|column/.test(tol), "it reads the column's name out of either shape PostgREST answers with");
  is(/!\(missing in value\)/.test(tol), 'and only drops a column this write actually asked for — a name it never sent would loop for ever on the same error');
  is(/if \(!Object\.keys\(value\)\.length\) throw/.test(tol), 'a write with nothing left to say is a refusal, not a partial save');
  is(/attempt <= 4/.test(tol), 'and it is bounded: five missing columns is a different database, not a missing migration');
  is(/dropped: string\[\]/.test(tol), 'what it dropped comes back to the caller');
  const card2 = code('src/components/social/QuickCommentCard.tsx');
  is(/dropped\.length/.test(card2), 'and the card says it rather than reporting a clean save');
}
is(!/social_queue/.test(writer), "and never a publication — a screen cannot arm a row, which is half of why a comment can't cause a repeat post");
is(!/status:/.test(writer), 'and nothing in it writes a publication status under any spelling');
for (const col of ['comment_auto', 'comment_text', 'comment_delay_seconds']) {
  is(writer.includes(col), `${col} is written by name`);
}
is(!/comment_gap_seconds/.test(writer), 'and comment_gap_seconds is NOT — that is the pause between one comment and the next, a different clock, and writing it here would re-pace every round that already has comments');
/*
 * CLAMPED HERE AS WELL AS IN THE INPUT. This is the last place before the
 * database: 5..3600 is the CHECK the migration puts on the column and 500 is
 * the ceiling the brief sets on the text, so a value out of range would
 * otherwise be a statement Postgres refuses with an English sentence nobody
 * can act on.
 */
/*
 * ─── ONE RANGE, READ BY THREE PLACES — 18.11.2026 ────────────────────────
 *
 *   "באופציות תשאיר רק עיכוב תגובה - לבחירה מ שעה אחת עד 12 שעות"
 *
 * The clamp was typed out here as 5..3600. The choice is hours now, the
 * column's CHECK moved with it (v45), and the numbers live in rules.ts so the
 * picker, this write and the arm on the PC cannot drift apart. A picker
 * offering twelve hours over a column that refuses anything above one is a
 * control that fails on the tap — the shape of bug this product shipped once
 * already with the publishing gap.
 */
is(/clampCommentDelay\(next\.delaySeconds\)/.test(writer), 'the delay is clamped before the write, through the one clamp');
eq(COMMENT_DELAY_MIN_SECONDS, 3600, 'the minimum is one hour');
eq(COMMENT_DELAY_MAX_SECONDS, 12 * 3600, 'and the maximum twelve');
eq(clampCommentDelay(30), 3600, 'a value from before v45 is brought up to the minimum rather than obeyed');
eq(clampCommentDelay(99999), 43200, 'and one above the ceiling is brought down');
eq(clampCommentDelay(null), 3600, 'a missing value is an hour, which is the column default');
eq(clampCommentDelay(7200), 7200, 'and a legal value is left exactly as it is');
is(/next\.text\.slice\(0, 500\)/.test(writer), 'and the text to 500 characters — the ceiling the brief sets');
is(/social-latest\.sql/.test(writer), 'and a database without the migration is told so in Hebrew, naming the file, rather than leaving a dead switch');

/* AND THE CARD ENFORCES THE SAME CEILING WHERE THE OWNER CAN SEE IT. */
is(/COMMENT_TEXT_MAX = 500/.test(card), 'the card declares the 500-character ceiling once');
is(/maxLength=\{COMMENT_TEXT_MAX\}/.test(card), 'the field cannot take more');
is(/\{draft\.length\}\/\{COMMENT_TEXT_MAX\}/.test(card), 'and the count is drawn, so the ceiling is stated rather than met by a cursor that stops moving');

/* THE THREE CONTROLS THE BRIEF ASKS FOR, AND THE TWO IT DOES NOT GET. */
is(/<Toggle/.test(card), 'the switch is the app’s own Toggle, which rolls itself back and says why when a write fails');
is(/<textarea/.test(card), 'the words are a real field');
is(/id="quick-comment-delay"/.test(card), 'and the delay is a real picker');
/*
 * ─── AND THE TWO THAT WERE REMOVED ON REQUEST ────────────────────────────
 *
 *   "סוג תגובה להסיר. תצוגה להסיר" — 18.11.2026
 *
 * Neither stored anything of its own — "תצוגה" had one supported value and
 * "סוג תגובה" only printed what comment_media already said — so neither
 * leaves a column behind. The pins invert: they must be gone from the card,
 * and the <Picker> they were drawn with must be gone with them rather than
 * left as a component nothing renders.
 */
is(!/תצוגה/.test(card), '"תצוגה" is gone from the card');
is(!/סוג תגובה/.test(card), 'and so is "סוג תגובה"');
is(!/onOpenComment/.test(card), 'with the door it opened — the comment window is still reached from "תגובות מהירות" and from the campaigns screen');
is(!/function Picker/.test(card), 'and the box they were drawn with is deleted, not orphaned');
/* THE DELAYS ARE GENERATED FROM THE RANGE, never typed — a list and a CHECK
   that are two hand-written copies of one decision is how they come apart. */
is(/COMMENT_DELAY_MAX_SECONDS \/ COMMENT_DELAY_MIN_SECONDS/.test(card), 'the twelve choices are built from the range itself');
is(!/const DELAYS = \[/.test(card), 'and not from a hand-written list beside it');
is(/שעתיים/.test(card), 'and two hours is spelled the way Hebrew spells it, not as "2 שעות"');

/* ══════════════ 3. THE ARMING PASS, AND WHERE IT RUNS ═══════════════════ */

const arm = worker.slice(worker.indexOf('async function armAutoComments'), worker.indexOf('async function sweepStuckComments'));
is(arm.length > 500, 'armAutoComments could not be isolated — every check over it would be vacuous');

/*
 * IT RUNS INSIDE THE COMMENTS' OWN CHORE, which is three guarantees at once:
 * the chore is idle-only (so the arming never runs beside a live publication),
 * it is guarded on a connected browser, and by the time it runs nothing is
 * due — so arming can never delay a post.
 */
const chore = worker.slice(worker.indexOf('async function runCampaignComments'));
is(/await armAutoComments\(db\)/.test(chore), 'the chore arms as part of its own pass');
is(chore.indexOf('await sweepStuckComments(db)') < chore.indexOf('await armAutoComments(db)'), 'after the stale-claim sweep, so a condemned row is not re-offered');
is(chore.indexOf('await armAutoComments(db)') < chore.indexOf('const pending ='), 'and before the candidate read, so a row armed in this pass can be commented in it');
is(/catch \(err\) \{\s*console\.warn\('\[comments\] arming failed/.test(chore), 'and a failure in it cannot take the chore down — the comments already pending are the ones somebody is waiting for');
/* AND NOWHERE ELSE. A hook in the publish path would put a comment column
   into the one write whose failure modes end in a repeat post. */
eq((worker.match(/armAutoComments\(/g) ?? []).length, 2, 'the arming is declared once and called once — never from a publish path');

/*
 * ─── IT TOUCHES NO PUBLICATION STATUS ───────────────────────────────────
 *
 *   "כישלון בתגובה לא יגרום לפרסום חוזר של הפוסט."
 *
 * Structural rather than promised: the only columns this function writes are
 * comment_*, and the only `status` it names is in a FILTER that requires the
 * post to be published already.
 */
is(/\.eq\('status', 'published'\)/.test(arm), 'it arms published rows only');
is(!/[^_]status:\s/.test(arm), 'and writes no publication status of any kind — there is no edge from a comment back to the publish queue (comment_status is the only `status` it sets, and that is the comment\u2019s own)');
is(!/\.update\(\{ status/.test(arm), 'under any spelling');

/* ══════════════ 4. ONE PUBLICATION, ONE AUTOMATIC COMMENT ═══════════════ */

/*
 * The "מזהה פרסום ייחודי" is the queue row's own id. Two conditions make it
 * single-shot: the row is a candidate only while its comment_status is still
 * '', and the UPDATE repeats that condition, so two workers racing cannot both
 * arm it.
 */
eq((arm.match(/\.eq\('comment_status', ''\)/g) ?? []).length, 2, "the empty comment_status is required twice — once to find the row and once in the UPDATE, which is the compare-and-set");
is(/\.in\('id', ids\)/.test(arm), 'the write is by explicit id list, so it cannot reach a row the read did not return');
is(/\.select\('id'\)/.test(arm), 'and it reads back what it really changed rather than assuming');
/* AND IT NEVER RE-ARMS AN ATTEMPT THAT HAPPENED. A person may press "נסה
   שוב"; an automatic loop that retried for ever would keep re-opening the same
   group page while the owner believed a comment was on its way. */
for (const state of ['failed', 'done', 'unverified', 'commenting']) {
  is(!arm.includes(`'${state}'`), `it never arms a '${state}' row — only one that has never had an attempt`);
}
/* A ROUND WITH THE SWITCH ON AND NO WORDS ARMS NOTHING. */
is(/comment_auto/.test(arm) && /\.eq\('comment_auto', true\)/.test(arm), 'only rounds whose switch is on');
is(/if \(!round\.comment_text \|\| !round\.comment_text\.trim\(\)\) continue;/.test(arm), 'and only rounds that actually have something to say');
is(/\.neq\('status', 'archived'\)/.test(arm), 'and never an archived round');
/* CAPPED, so switching the feature on after a month of publishing does not
   turn "from now on" into a backlog of thousands. */
is(/COMMENT_ARM_MAX/.test(arm) && /const COMMENT_ARM_MAX = \d+;/.test(worker), 'the pass is capped per round');
/*
 * ─── AND THE CAP IS ON WORK, NOT ON ROUNDS LOOKED AT ────────────────────
 *
 * The read was .limit(10) with NO ORDER BY: the same arbitrary ten rows every
 * pass, so an eleventh round could be switched on and never looked at. Worse,
 * the two `continue` guards threw those slots away before any work was done,
 * so ten rounds with no text could starve the live one indefinitely. An
 * adversarial review found it.
 */
is(/\.order\('created_at', \{ ascending: true \}\)/.test(arm), 'the rounds come back in a repeatable order, not whatever the heap answers with');
is(/\.limit\(COMMENT_ARM_CEILING\)/.test(arm), 'the read is bounded by a backstop rather than by a work budget');
is(/if \(worked >= COMMENT_ARM_CAMPAIGNS\) break;/.test(arm), 'and the work budget is counted in the loop');
is(
  arm.indexOf('worked += 1') > arm.indexOf("update({ comment_status: 'pending'"),
  'counted only AFTER a round really armed something — a round with nothing ready must not push the one behind it out of this pass',
);
is(/ascending: false/.test(arm), 'and it takes the NEWEST publications — the only end a comment can still be left at');

/* ══════════════ 5. THE DELAY IS THE POST'S OWN AGE ═════════════════════ */

/*
 * comment_gap_seconds is the pause between one comment and the NEXT, measured
 * from the previous comment's outcome. comment_delay_seconds is how old the
 * POST must be. Wiring the first to the card's "עיכוב תגובה" would re-pace
 * every round that already has comments AND still delay nothing, because that
 * clock is not anchored to the post at all.
 */
is(/comment_delay_seconds/.test(arm), 'the arming reads the delay column');
is(/clampCommentDelay\(round\.comment_delay_seconds\)/.test(arm), 'and clamps it through the same one function the screen and the client use, so a stored value no screen can express is never obeyed');
is(!/comment_gap_seconds/.test(arm), 'and not the between-comments gap, which is a different clock');
is(/commentArmCutoff\(round\.comment_delay_seconds, Date\.now\(\)\)/.test(arm), 'the cutoff comes from the one function in rules.ts, so the test below can send the arm\'s own arithmetic into a real database');
is(/\.lte\('published_at', cutoff\)/.test(arm), 'and it is applied to published_at IN THE DATABASE — the post’s own age, not a timer that a worker restart would lose');
/* AND THE CARD PROMISES A FLOOR RATHER THAN A SCHEDULE. The chore needs an
   idle window of 45 seconds (four minutes when the post's address still has to
   be hunted) and does one comment per pass, so on a dense queue the comment
   can be much later than the delay. */
is(/לא לפני/.test(card), 'the card says "not before" rather than naming a minute it cannot keep');
is(/בחלון הפנוי הראשון/.test(card), 'and names what actually decides when it goes out');

/* ══════════════ 6. ONLY WHERE THE PLATFORM CAN DO IT ══════════════════ */

/*
 *   "רק במקומות שבהם קיימת הרשאה ותמיכה בפלטפורמה... אם הפלטפורמה לא מאפשרת
 *    זאת, יש להציג מצב ברור ולא לדמות הצלחה."
 *
 * Commenting is implemented for Facebook GROUPS: the lookup builds
 * /groups/<id>/ addresses and gives up without one. A non-group target is
 * therefore left at '' rather than armed — arming it would produce a row that
 * hunts, fails, and reads as a comment that was tried and lost.
 */
is(/target:social_targets\(url\)/.test(arm), 'the arming reads each row’s target address');
is(/parseGroupUrl\(String\(r\.target\?\.url \?\? ''\)\)/.test(arm), 'and gates on it through parseGroupUrl — not by string surgery, because a stored address can be an id, a vanity name or carry a query');
is(/עובד בקבוצות פייסבוק/.test(card), 'and the card says where this works');
is(/לא יסומן כאילו קיבל/.test(card), 'and that a target it cannot work on is not marked as though it had a comment');

/* ══════════════ 7. NOTHING CLAIMS SUCCESS EARLY ═══════════════════════ */

/*
 *   "אין להציג תגובה כמוצלחת לפני אימות אמיתי בפלטפורמה."
 *
 * The card shows no outcome at all — outcomes live on the rows and are drawn
 * by the comment rail, from the verification that already exists (the comment
 * box emptying, with 'unverified' when Enter was pressed and Facebook never
 * confirmed). So the pin is that this card invents no outcome of its own.
 */
for (const word of ['הגיב', 'התגובה נוספה', 'בוצע', 'הצליח']) {
  is(!card.includes(word), `the card never reports an outcome ("${word}") — it is a switch, and the row is the record`);
}
is(!/comment_status/.test(card), 'and it reads no publication state, so it cannot draw one early');
/* THE EXISTING VERIFICATION IS UNTOUCHED, which is the other half: a new
   feature that quietly loosened it would be worse than one that promised
   nothing. Asserted where it lives rather than re-implemented here. */
is(/'unverified'/.test(worker), "the honest middle state still exists in the worker — Enter pressed, nothing confirmed");

/* ══════════════ 8. THE WIRING ON THE DASHBOARD ════════════════════════ */

is(/quickComment=\{\{/.test(dash), 'the round card is handed the round’s own three columns');
is(/auto: run\.campaign\.comment_auto === true/.test(dash), 'the switch comes from the column, with no default that would turn it on by accident');
is(/delaySeconds: clampCommentDelay\(run\.campaign\.comment_delay_seconds\)/.test(dash), 'the delay reaches the card through the one clamp, so a round written before v45 draws a legal value rather than a blank picker');
is(/onQuickCommentChange=\{\(next\) => saveAutoComment\(run\.campaign, next\)\}/.test(dash), 'with one handler behind all three fields');
is(/await setCampaignAutoComment\(campaign\.id, next\)/.test(dash), 'which writes through the one writer');
/* IT RE-THROWS. <Toggle> rolls the switch back on a rejection, so a handler
   that swallowed the error would leave a switch that looks on over a round
   that is off. */
const handler = dash.slice(dash.indexOf('const saveAutoComment'), dash.indexOf('const changeRepeat'));
is(handler.length > 150, 'saveAutoComment could not be isolated — the check below would be vacuous');
is(!/catch/.test(handler), 'and it does not swallow the failure — the switch has to learn that it did not save');
is(/<QuickCommentCard/.test(hero), 'the run card draws it');
is(/quickComment && onQuickCommentChange/.test(hero), 'and only when the screen can actually write it — a switch that does nothing is the decorative control this product forbids');

/* ══════════════ 1. THE COLUMNS, AGAINST A REAL POSTGRES ═══════════════ */

/* The migration's own text first — the parts a database cannot be asked. */
is(/add column if not exists comment_auto boolean not null default false/.test(v44), 'the switch ships OFF for every round that already exists, so the file changes no account’s behaviour');
is(/add column if not exists comment_delay_seconds integer not null default 30/.test(v44), 'and the delay has a default, so a round never has none');
is(/check \(comment_delay_seconds between 5 and 3600\)/.test(v44), 'with a sane range, guarded the same way schedule_gap_seconds is');
/*
 * ─── AND v45 MOVED THAT RANGE THE SAME DAY ───────────────────────────────
 *
 * v44 is left exactly as it shipped — a migration already run on a database
 * is not edited afterwards, or the file and the database stop describing the
 * same thing. v45 is the correction, and the ORDER inside it is the whole of
 * its safety: drop the old CHECK, lift the values that can no longer be
 * expressed, move the default, then add the new CHECK. Any other order fails
 * on existing rows and leaves the table half-migrated.
 */
is(/drop constraint if exists social_campaigns_comment_delay_seconds_check/.test(v45), 'v45 drops the old range before touching anything');
is(v45.indexOf('drop constraint') < v45.indexOf('update public.social_campaigns'), 'and lifts the stored values only once the old CHECK is out of the way');
is(v45.indexOf('update public.social_campaigns') < v45.indexOf('add constraint'), 'and adds the new range only once no row can violate it');
is(/set comment_delay_seconds = 3600\s*\n\s*where comment_delay_seconds < 3600/.test(v45), 'a value below the new minimum is raised TO the minimum — not reset to a default nobody chose');
is(/alter column comment_delay_seconds set default 3600/.test(v45), 'and a new round defaults to an hour');
is(/check \(comment_delay_seconds between 3600 and 43200\)/.test(v45), 'with the range the owner asked for — one hour to twelve');
is(/⚠/.test(rollback45), 'the rollback warns that a choice above an hour cannot survive it');
is(/where comment_delay_seconds > 3600/.test(rollback45), 'and brings such a value down to the nearest legal one rather than to a default');
is(latest.includes('between 3600 and 43200'), 'and social-latest.sql carries v45 too, so the one file the owner runs is still enough');
is(/create index if not exists social_queue_comment_arm_idx/.test(v44), 'and the arming read has an index, or it scans every publication ever made');
is(/drop column if exists comment_auto/.test(rollback) && /drop column if exists comment_delay_seconds/.test(rollback), 'the rollback drops exactly what the migration added');
is(/⚠/.test(rollback), 'and warns that the owner’s choice goes with them');
is(latest.includes('comment_auto boolean not null default false'), 'and social-latest.sql carries it, so the one file the owner is told to run is enough');

const NAME = 'automatic comment (real postgres)';
if (!available()) {
  console.log(`auto-comment OK — ${checks} assertions (database section SKIPPED — set ANX_TEST_DATABASE_URL)`);
  process.exit(0);
}

resetSchema();
applySchema(repoRoot);

is(one("select column_default from information_schema.columns where table_name='social_campaigns' and column_name='comment_auto'") === 'false', 'comment_auto really exists, and really defaults to false');
is(one("select column_default from information_schema.columns where table_name='social_campaigns' and column_name='comment_delay_seconds'") === '3600', 'comment_delay_seconds really exists, and really defaults to one hour');
is(one("select is_nullable from information_schema.columns where table_name='social_campaigns' and column_name='comment_auto'") === 'NO', 'and neither can be null, so no round is in an undecided state');
is(
  one("select count(*) from pg_indexes where tablename='social_queue' and indexname='social_queue_comment_arm_idx'") === '1',
  'the arming index really exists',
);
is(
  one("select indexdef like '%status = ''published''%' from pg_indexes where indexname='social_queue_comment_arm_idx'") === 't',
  'and it is the PARTIAL index the arming read needs — published rows with no comment attempt, not the whole table',
);

/*
 * THE RANGE IS THE DATABASE'S, NOT THE SCREEN'S. Both the card and the client
 * clamp, and this is the floor under both: a write from any future caller that
 * forgot to clamp is refused rather than stored.
 */
const tenant = '11111111-1111-1111-1111-111111111111';
one(`insert into social_tenants (id, name) values ('${tenant}', 'בדיקה') on conflict do nothing; select 1`);
const mk = (delay: string) =>
  `insert into social_campaigns (tenant_id, name, comment_delay_seconds) values ('${tenant}', 'סבב', ${delay}) returning id`;
is(one(mk('3600')) !== '', 'one hour is stored');
is(one(mk('43200')) !== '', 'and so is twelve — the two ends of the range the owner asked for');
for (const bad of ['3599', '43201', '30', '0', '-30']) {
  let refused = false;
  try {
    one(mk(bad));
  } catch {
    refused = true;
  }
  is(refused, `a delay of ${bad}s is REFUSED by the database — the clamp in the client is a convenience, not the guarantee`);
}

/*
 * ─── AND THE COMPARE-AND-SET IS REALLY SINGLE-SHOT ────────────────────────
 *
 * The arming's duplicate guard is `update … where comment_status = ''`. This
 * is that statement's shape run against a real Postgres twice over the same
 * row: the second must change NOTHING. It is the property the guard rests on,
 * asked of the database rather than taken on trust — two workers, or one
 * worker twice, cannot both arm one publication.
 */
const camp = one(`insert into social_campaigns (tenant_id, name, comment_auto, comment_text) values ('${tenant}', 'סבב תגובות', true, 'שלום') returning id`);
const target = one(`insert into social_targets (tenant_id, channel, name, url) values ('${tenant}', 'facebook_group', 'קבוצה', 'https://www.facebook.com/groups/123456') returning id`);
const post = one(`insert into social_posts (tenant_id, title, base_text, campaign_id) values ('${tenant}', 'פוסט', 'טקסט', '${camp}') returning id`);
const row = one(
  `insert into social_queue (tenant_id, post_id, campaign_id, target_id, status, scheduled_at, published_at, comment_status)
   values ('${tenant}', '${post}', '${camp}', '${target}', 'published', now() - interval '20 minutes', now() - interval '10 minutes', '') returning id`,
);
/*
 * THE COUNT, NOT THE RETURNED ID. psql prints its own command tag for an
 * UPDATE — a second pass over the same row answers the literal text
 * "UPDATE 0", which `one()` hands back as a value and which would read as a
 * row having come back. Counting the rows the statement really changed is the
 * question anyway.
 */
const armOnce = `with armed as (
    update social_queue set comment_status='pending', comment_at=null, comment_note=''
    where id='${row}' and comment_status='' returning id
  ) select count(*) from armed`;
is(one(armOnce) === '1', 'the first arming claims the row');
is(one(armOnce) === '0', 'and the second changes nothing at all — one publication, one automatic comment');
/* AND THE POST IS UNTOUCHED BY EITHER. */
is(one(`select status from social_queue where id='${row}'`) === 'published', 'the publication itself is exactly as it was — a comment write cannot move a post back into the queue');

/* ══════════ 9. "לא מיד אחרי הפוסט" — AGAINST A REAL CLOCK AND DATABASE ═══ */

/*
 *   "תאמת שהתגובה מהירה אחרי פוסט יוצאת באמת אחרי 12 שעות מרגע הפרסום ולא
 *    ישר" — 18.11.2026
 *
 * The question is not whether the code CONTAINS a delay. It is whether a post
 * published a minute ago is selected by the arm, and a post published twelve
 * hours ago is. So this sends the EXACT cutoff string the arm computes —
 * commentArmCutoff(), the same function the chore calls — into the EXACT
 * predicate the arm uses, against rows placed at known ages in a real
 * Postgres, and reads back which ones come out.
 *
 * Five rows, one round, twelve hours chosen:
 *
 *   just now        must NOT be selected
 *   6 hours old     must NOT be selected
 *   11h 59m old     must NOT be selected   ← the minute before
 *   12h 01m old     MUST be selected       ← the minute after
 *   3 days old, already commented ('done') must NOT be selected, ever
 *
 * If the delay were ignored, the first four would all come back. If the
 * cutoff were inverted, only the young ones would. Neither can pass this.
 */
{
  const tenant2 = '33333333-3333-3333-3333-333333333333';
  one(`insert into social_tenants (id, name) values ('${tenant2}', 'בדיקת עיכוב') on conflict do nothing; select 1`);
  const round = one(
    `insert into social_campaigns (tenant_id, name, comment_auto, comment_text, comment_delay_seconds)
     values ('${tenant2}', 'סבב עיכוב', true, 'שלחו הודעה', 43200) returning id`,
  );
  const post2 = one(`insert into social_posts (tenant_id, title, base_text, campaign_id) values ('${tenant2}', 'פוסט', 'טקסט', '${round}') returning id`);
  const group = one(
    `insert into social_targets (tenant_id, channel, name, url) values ('${tenant2}', 'facebook_group', 'קבוצה', 'https://www.facebook.com/groups/9988776') returning id`,
  );

  /** A published row of this round, `age` old, in the given comment state. */
  const place = (age: string, state: string) =>
    one(
      `insert into social_queue (tenant_id, post_id, campaign_id, target_id, status, scheduled_at, published_at, comment_status)
       values ('${tenant2}', '${post2}', '${round}', '${group}', 'published',
               now() - interval '${age}', now() - interval '${age}', '${state}')
       returning id`,
    );

  const justNow = place('1 minute', '');
  const sixHours = place('6 hours', '');
  const minuteBefore = place('11 hours 59 minutes', '');
  const minuteAfter = place('12 hours 1 minute', '');
  const alreadyDone = place('3 days', 'done');

  /*
   * THE ARM'S OWN ARITHMETIC. Twelve hours, through the same function the
   * chore calls, with the clock passed in — not a string typed here.
   */
  const cutoff = commentArmCutoff(43200, Date.now());
  is(/^\d{4}-\d{2}-\d{2}T/.test(cutoff), 'the cutoff is an ISO instant, which is what PostgREST sends');

  /* And the arm's own predicate, in the same order it builds it. */
  const selected = rows(
    `select id from social_queue
      where campaign_id = '${round}'
        and status = 'published'
        and comment_status = ''
        and published_at <= '${cutoff}'
      order by published_at desc`,
  ).map((r) => r[0]);

  eq(selected.includes(justNow), false, 'a post published a MINUTE ago is not armed — "ולא ישר"');
  eq(selected.includes(sixHours), false, 'nor one published six hours ago, which is half the chosen delay');
  eq(selected.includes(minuteBefore), false, 'nor one a single minute short of twelve hours');
  eq(selected.includes(minuteAfter), true, 'and one a minute PAST twelve hours is');
  eq(selected.includes(alreadyDone), false, 'while a post that already has its comment is never armed again, however old it is');
  eq(selected.length, 1, 'exactly one of the five is a candidate');

  /*
   * AND THE SAME ROWS UNDER AN HOUR, which is the other end of the range the
   * owner chose. The six-hour-old post becomes a candidate and the one-minute
   * post still does not — so the cutoff really moves with the setting rather
   * than being a constant with a number printed beside it.
   */
  const hourCutoff = commentArmCutoff(3600, Date.now());
  const underAnHour = rows(
    `select id from social_queue
      where campaign_id = '${round}'
        and status = 'published'
        and comment_status = ''
        and published_at <= '${hourCutoff}'`,
  ).map((r) => r[0]);
  eq(underAnHour.includes(justNow), false, 'at an hour, a post from a minute ago is still too young');
  eq(underAnHour.includes(sixHours), true, 'but the six-hour-old one is now a candidate — the cutoff moves with the setting');
  eq(underAnHour.length, 3, 'three of the five qualify at an hour, which is every uncommented row older than that');
}

/* ══════ 10. "12 שעות מרגע שהוא מפרסם" — ALL FOUR LINKS, NOT JUST THE LAST ═ */

/*
 *   "תוודא שאם אני מגדיר תגובה מהירה 12 שעות מרגע שהוא מפרסם את הפוסט שזה
 *    תואם להגדרה שלנו" — 18.11.2026
 *
 * Section 9 proves the cutoff selects the right rows. That is the LAST link.
 * The question above is about the whole chain, and three links come before it:
 * what instant `published_at` holds, whether anything moves it afterwards, and
 * whether a timezone gets into the arithmetic between the owner's PC and the
 * database. A fault in any one of them turns twelve hours into ten, fourteen,
 * or "whenever something last touched the row".
 */

/* ── link 1: the column holds the instant the POST went live ───────────── */
{
  const composer = code('worker/facebook/composer.ts');
  const publishWrite = worker.slice(worker.indexOf("step: 'published'"), worker.indexOf("step: 'published'") + 1200);
  is(/const publishedAt = new Date\(\)\.toISOString\(\);/.test(composer), 'the composer stamps the publish instant itself');
  /*
   * AND IT IS STAMPED BEFORE THE EVIDENCE-GATHERING, not after. Taken after,
   * the time spent hunting the post in the feed is charged to the stamp — the
   * owner met that as a "נדחה" on a queue set to one a minute, and the comment
   * above that line in composer.ts is the record of it. Asserted as an ORDER
   * so the line cannot drift down the function.
   */
  /* AGAINST THE RETURN, not against the type union of the same words at the
     top of the file — lastIndexOf finds the statement that actually returns
     the outcome, which is what the stamp must come before. */
  is(
    composer.indexOf('const publishedAt = new Date().toISOString();') < composer.lastIndexOf("return { outcome: 'published'"),
    'and stamps it BEFORE it goes looking for the post — otherwise the search time is charged to the stamp',
  );
  is(/published_at: result\.publishedAt \|\| new Date\(\)\.toISOString\(\)/.test(publishWrite), 'and the queue row takes that instant, with the clock only as a fallback for the path that has none');
}

/* ── link 2: nothing moves it afterwards ───────────────────────────────── */
{
  /*
   * THREE WRITERS IN THE WHOLE PRODUCT, and the count is the pin: a fourth
   * added without thought is how a write-once column stops being one.
   */
  /*
   * COUNTED PRECISELY, because the loose version counts the wrong things:
   * `last_published_at` is a different column on social_targets, and
   * `published_at: string | null` is a type declaration. Neither writes an
   * instant. What is counted here is an assignment of a VALUE to the queue
   * row's own column.
   */
  /* A LITERAL SPACE, not \s* — a greedy \s* backtracks to zero width and the
     negative lookahead then passes on the very declaration it was meant to
     exclude, which is how this pin first counted a type as a write. */
  const queueWrites = [...worker.matchAll(/(?<!last_)published_at: (?!string)/g)].length;
  eq(queueWrites, 2, 'the worker writes published_at in exactly two places — the publish itself and the late verification');
  const clientWrites = [...client.matchAll(/(?<!last_|first_)published_at: new Date\(\)/g)].length;
  eq(clientWrites, 1, 'and the browser in exactly one — "I posted this myself". A third writer appearing without thought is how a write-once column stops being one');
  /*
   * AND THE LATE-VERIFICATION PATH PRESERVES AN EXISTING VALUE. It promotes a
   * row that sat waiting for a moderator; if it stamped "now", a post that
   * waited eight hours for approval would have its comment clock restarted at
   * the moment we noticed. `row.published_at ||` is what stops that, and
   * claimed_at — stamped seconds before the click — is the next best instant.
   * Deliberately NOT updated_at, which a trigger moves on every sweep.
   */
  is(
    /published_at: row\.published_at \|\| row\.claimed_at/.test(worker),
    'the late-verification path keeps an existing stamp and never overwrites it',
  );
  is(!/published_at: row\.updated_at \|\|/.test(worker), 'and never falls back to updated_at first, which is the last time anything touched the row rather than a time anything went live');
}

/* ── link 3: the arm measures from that column and no other ────────────── */
{
  is(/\.lte\('published_at', cutoff\)/.test(arm), 'the arm compares published_at against the cutoff');
  /* THE WINDOW, not the whole function: the round read orders by created_at
     so its answer is repeatable, which is a different question from which
     instant a PUBLICATION is judged by. */
  const window = arm.slice(arm.indexOf("from('social_queue')"), arm.indexOf('limit(COMMENT_ARM_MAX)'));
  is(window.length > 100, 'the publication window could not be isolated — the check over it would be vacuous');
  is(!/scheduled_at|updated_at|created_at/.test(window), 'and judges a publication by no other instant — scheduled_at is rewritten on every deferral and updated_at on every touch');
}

/* ── link 4: no timezone gets into it ──────────────────────────────────── */
{
  /*
   * THE REAL HAZARD, and the only one of the four that would be invisible in
   * a code review: the owner's PC runs in Asia/Jerusalem and the database in
   * UTC. Two hours of drift would make "12 שעות" mean ten or fourteen, and
   * every row would still look correctly handled.
   *
   * It is safe because the arithmetic never leaves epoch milliseconds, which
   * carry no zone, and toISOString() is UTC by definition. So the pin is in
   * two halves: the function must not reach for this product's timezone
   * machinery, and its answer must agree with the DATABASE's own clock.
   */
  const rules = code('src/lib/social/rules.ts');
  const cut = rules.slice(rules.indexOf('export function commentArmCutoff'), rules.indexOf('export function commentArmCutoff') + 400);
  is(cut.length > 60, 'commentArmCutoff could not be isolated — the checks over it would be vacuous');
  is(!/zonedToUtc|zonedDateISO|Asia\/Jerusalem|getHours|getTimezoneOffset/.test(cut), 'the cutoff uses no timezone conversion at all — time.ts forces Asia/Jerusalem and must stay out of this arithmetic');
  is(/new Date\(nowMs - clampCommentDelay\(delaySeconds\) \* 1000\)\.toISOString\(\)/.test(cut), 'it is epoch milliseconds in and UTC out, which is what the database compares against');

  /* AND THE TWO CLOCKS REALLY AGREE. Asked of the database rather than
     reasoned about: a drift of hours here is the whole failure mode. */
  const mine = new Date(commentArmCutoff(43200, Date.now())).getTime();
  const theirs = new Date(`${one(`select to_char((now() - interval '12 hours') at time zone 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS')`)}Z`).getTime();
  const driftSeconds = Math.abs(mine - theirs) / 1000;
  is(driftSeconds < 120, `the cutoff agrees with the database's own clock — ${driftSeconds.toFixed(1)}s apart, where a timezone fault would be thousands`);
}

/* ══════ 11. THE FLOOR, AND THE BUTTON THAT EMPTIES THE QUEUE ════════════ */

/*
 *   "אז מה זה כל התגובות שצריכות לצאת כאן? תוסיף לי כפתור איפוס"
 *   — 18.11.2026, after the queue went from 25 to 166 in half an hour
 *
 * THE DEFECT: the arm had no lower bound, so the first pass after the switch
 * went on considered every publication the round had ever made. "אחרי פוסט"
 * has to mean from the moment it is switched on.
 */
{
  is(/const floor = since\[round\.id\];/.test(arm), 'the arm reads when the switch was turned on');
  is(/if \(!floor\) continue;/.test(arm), 'and a round with no such instant arms NOTHING — the safe reading, because the alternative is reaching into history again');
  is(/\.gte\('published_at', floor\)/.test(arm), 'the window has a floor as well as a ceiling, and both are asked of the database');
  /* THE STAMP IS WRITTEN ONLY ON THE WAY ON. Writing it on every save would
     move the floor under a queue already building whenever the text changed;
     writing it on the way OFF would lose where the round started. */
  /*
   * ─── THE FLOOR IS NOT A COLUMN ANY MORE — 18.11.2026 ─────────────────
   *
   * It was one for less than an hour, and that hour cost a third trip to the
   * SQL editor. It is one instant per round, read once a pass by a loop that
   * already holds ten rows, never filtered or sorted on — so it lives in the
   * settings row both sides already read, and needs no migration ever.
   */
  /*
   * ─── THE PIN THAT WAS VACUOUS, AND THE BUG IT LET THROUGH ─────────────
   *
   * This asserted the text `: { ...value }` existed and called that "a save
   * that only changes the text or the delay leaves the floor where it is".
   * That regex matched the switch-OFF branch. The text-only case was never
   * tested, and the code was wrong: the condition was `if (next.auto)` — the
   * value being SAVED — so EVERY save while the switch was on re-stamped the
   * floor. A typo fixed at 14:00 on a round switched on at 09:00 with a
   * twelve-hour delay dropped five hours of publications below the new floor,
   * permanently, with nothing logged and no row showing a failure.
   *
   * An assertion whose message describes one thing while its regex tests
   * another is worse than no assertion: it reads as covered. So the pin is
   * now on the TRANSITION, and on the order that makes a transition knowable
   * at all.
   */
  is(/const wasOn = before\[0\]\?\.comment_auto === true;/.test(writer), 'the previous state of the switch is read');
  is(
    writer.indexOf('const wasOn') < writer.indexOf('updateTolerant'),
    'BEFORE the update — after it there is no previous state left, and a check that reads it afterwards always sees what it just wrote',
  );
  is(/if \(!wasOn \|\| !floored\)/.test(writer), 'and the floor moves only when a round that was OFF is turned on, or when one is on and has no floor at all');
  is(/if \(next\.auto\) \{/.test(writer), 'never on the way off');
  is(/saveSetting\(COMMENT_AUTO_SINCE_KEY/.test(writer), 'into the settings row, not into a column');
  is(/export const COMMENT_AUTO_SINCE_KEY/.test(client), "the key is named once, because the arm on the PC reads the same one and a second spelling is a feature that silently does nothing");
  is(new RegExp("getSetting<Record<string, string>>\\('comment-auto-since'").test(worker), 'and the arm reads that very key');

  /* ─── AND THE BUTTON ─────────────────────────────────────────────────── */
  const reset = client.slice(client.indexOf('export async function clearPendingComments'), client.indexOf('export async function queueCampaignComment'));
  is(reset.length > 300, 'clearPendingComments could not be isolated — the checks over it would be vacuous');
  is(/\.eq\('comment_status', 'pending'\)/.test(reset), 'it clears only what is WAITING');
  for (const kept of ['done', 'failed', 'unverified', 'commenting']) {
    is(!reset.includes(`'${kept}'`), `and never touches a '${kept}' row — that is the record of what really happened, or a row a worker is holding this second`);
  }
  is(!/\.delete\(/.test(reset), 'it deletes nothing');
  /* A LITERAL SPACE AND A LOOKBEHIND: `comment_status:` is the only `status`
     this function sets, and it is the comment's own. A bare /status:/ matches
     that too — the same backtracking trap this file already met once. */
  is(!/(?<!comment_)status: /.test(reset), 'and writes no publication status — a reset of a comment queue may not move a post');
  is(/saveSetting\(COMMENT_AUTO_SINCE_KEY, since\)/.test(reset), 'and it raises the floor on every armed round, or it is a button that empties a bucket with the tap running');
  is(/\.limit\(100\)/.test(reset), 'in pages, because PostgREST stops returning rows at a thousand however many it changed');

  /* THE SCREEN: beside the number it zeroes, and only when there is one. */
  const rail = code('src/components/social/CommentTimeline.tsx');
  is(/onClearQueue && totals\.pending > 0/.test(rail), 'the button is drawn only when something is waiting');
  is(/disabled=\{clearing\}/.test(rail), 'and goes dead while the write is in flight');
  const dash2 = code('src/app/social/page.tsx');
  is(/async function clearComments/.test(dash2), 'the dashboard owns the write');
  is(/confirm\.ask/.test(dash2.slice(dash2.indexOf('async function clearComments'), dash2.indexOf('async function act'))), 'behind a confirmation');
  is(/לאפס את תור התגובות\? \(\$\{waiting\}\)/.test(dash2), 'that names the exact number');
}

/* ─── AND THE MIGRATION THAT CARRIES BOTH ──────────────────────────────── */
{
  const v46 = src('supabase/social-schema-v46.sql');
  const rb46 = src('supabase/social-schema-v46-rollback.sql');
  is(/where comment_status = 'pending'/.test(v46), 'v46 empties the queue the defect built');
  /*
   * AND v47 TAKES ITS COLUMN BACK OUT. v46 is left exactly as it shipped — a
   * migration that may already have run is not edited — so the correction is
   * its own file, and it is a no-op on a database that never ran v46.
   */
  const v47 = src('supabase/social-schema-v47.sql');
  is(/drop column if exists comment_auto_since/.test(v47), 'v47 removes the column the floor no longer needs');
  is(/⚠/.test(v47), 'and says out loud that a value already written to it is lost');
  is(!/comment_auto_since/.test(code('src/lib/social/types.ts').replace(/[\s\S]*WHAT WAS HERE[\s\S]*?\*\//, '')), 'and no type still declares it as a column, which is what schema-columns.test.ts would fail on');
  for (const kept of ["'done'", "'failed'", "'unverified'", "'commenting'"]) {
    is(!v46.includes(`comment_status = ${kept}`), `without touching a ${kept} row`);
  }
  is(/⚠/.test(v46), 'and it warns that a manually queued row cannot be told apart from an automatic one, so it goes too');
  is(/drop column if exists comment_auto_since/.test(rb46), 'the rollback removes exactly what it added');
  is(/⚠/.test(rb46), 'and says that the emptied queue cannot be brought back');
  is(latest.includes('comment_auto_since'), 'and social-latest.sql carries it');
}

console.log(`auto-comment OK — ${checks} assertions, the columns and the duplicate guard against a real Postgres`);
