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
import { applySchema, available, one, resetSchema, skip } from './db/harness';

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
const latest = src('supabase/social-latest.sql');

/* ══════════════ 2. THE SCREEN WRITES INTENT, NEVER A PUBLICATION ═════════ */

const writer = client.slice(client.indexOf('export async function setCampaignAutoComment'), client.indexOf('export async function queueCampaignComment'));
is(writer.length > 300, 'setCampaignAutoComment could not be isolated — every check over it would be vacuous');
is(/\.from\('social_campaigns'\)/.test(writer), 'it writes the ROUND');
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
is(/Math\.max\(5, Math\.min\(3600, Math\.round\(next\.delaySeconds\)\)\)/.test(writer), 'the delay is clamped to the column’s own CHECK range before the write');
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
is(/תצוגה/.test(card) && /הערך היחיד הנתמך/.test(card), '"תצוגה" states its one supported value rather than offering a choice that does not exist');
is(/onClick=\{onOpenComment\}/.test(card), 'and "סוג תגובה" opens the app’s existing comment window, where the image is chosen — not a second uploader');

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
is(/COMMENT_ARM_CAMPAIGNS/.test(arm), 'and per round-count, so one pass cannot run long');
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
is(!/comment_gap_seconds/.test(arm), 'and not the between-comments gap, which is a different clock');
is(/Date\.now\(\) - delay \* 1000/.test(arm), 'the cutoff is now minus the delay');
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
is(/delaySeconds: run\.campaign\.comment_delay_seconds \?\? 30/.test(dash), 'the delay falls back to the column’s own default');
is(/hasMedia: \(run\.campaign\.comment_media\?\.length \?\? 0\) > 0/.test(dash), 'and the comment TYPE is derived from comment_media rather than stored a second time');
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
is(one("select column_default from information_schema.columns where table_name='social_campaigns' and column_name='comment_delay_seconds'") === '30', 'comment_delay_seconds really exists, and really defaults to 30');
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
is(one(mk('30')) !== '', 'a delay inside the range is stored');
for (const bad of ['4', '3601', '0', '-30']) {
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

console.log(`auto-comment OK — ${checks} assertions, the columns and the duplicate guard against a real Postgres`);
