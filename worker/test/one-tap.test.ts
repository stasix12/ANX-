/**
 * ONE TAP MAKES ONE ROUND.
 *
 * `setBusy(...)` is React state: it is not true until a render lands. Two taps
 * inside that window both pass the check and both run the whole handler. On a
 * launch that means:
 *
 *   · ensureRunForPost() is read-then-create, so the account gets TWO runs for
 *     one post — two cards, two progress bars, each correct on its own;
 *   · createSchedule() is called twice, so the post gets two ACTIVE schedules,
 *     and from tomorrow every group in the round is published to twice a day.
 *
 * The confirmation that asks "this post is already going out, add another
 * round?" does not close it: it reads the queue, and on an immediate launch
 * there are no rows yet — the planner on the PC writes them later. It catches a
 * second launch minutes later, not a double tap.
 *
 * A REF IS THE ONLY THING THAT IS TRUE IMMEDIATELY. Most write paths in this
 * product already had one; PostEditor's launch — the main one, the screen the
 * product is used from — did not.
 *
 * SO THIS FILE PINS THE WHOLE CLASS, not the one site. Each path is named with
 * its ref, and each is checked for the three things that make a ref guard real:
 * it is read BEFORE any await, it is set in the same synchronous breath, and it
 * is released in a `finally` — a ref released only on the success path locks
 * the button for the rest of the session the first time the network says no.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
/* Comments in this codebase deliberately quote the code they replaced, so a
   negative assertion must not read them. See settings-stick.test.ts. */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

/** Every path that writes something the owner cannot un-write with one tap. */
const PATHS: { file: string; what: string; ref: string; handler: string; ends: string }[] = [
  {
    file: '../../src/components/social/PostEditor.tsx',
    what: 'launching a post from the editor',
    ref: 'launching',
    handler: 'async function onSchedule()',
    ends: 'async function onArchive()',
  },
  {
    file: '../../src/components/social/QuickPublishSheet.tsx',
    what: 'quick publish',
    ref: 'publishing',
    handler: 'async function onConfirm()',
    ends: 'How many CALENDAR DAYS',
  },
];

for (const path of PATHS) {
  const file = src(path.file);
  const body = code(file.slice(file.indexOf(path.handler), file.indexOf(path.ends)));
  is(body.length > 200, `${path.what}: the handler is found`);

  is(new RegExp(`const ${path.ref} = useRef\\(false\\)`).test(file), `${path.what} has no synchronous guard — setBusy is React state and is not true until a render lands, so two taps both get through`);
  is(
    new RegExp(`if \\(${path.ref}\\.current\\) return;\\s*${path.ref}\\.current = true;`).test(body),
    `${path.what}: the guard must be read and set in one synchronous breath, with nothing awaited between them`,
  );

  /* Before any await. A guard set after the first await is not a guard. */
  const guardAt = body.indexOf(`${path.ref}.current = true`);
  const firstAwait = body.indexOf('await ');
  is(guardAt >= 0 && firstAwait >= 0 && guardAt < firstAwait, `${path.what}: the guard must be set BEFORE the first await, or the second tap is already inside the handler by the time it is set`);

  /* Released in a finally, so a failure does not lock the control for good. */
  is(
    new RegExp(`finally \\{[\\s\\S]{0,400}${path.ref}\\.current = false;`).test(body),
    `${path.what}: the guard must be released in a \`finally\` — released only on success, the first network failure locks the button for the rest of the session`,
  );
}

/* ───────── and the two writes a double tap actually duplicated ─────────── */
{
  const client = src('../../src/lib/social/client.ts');
  /*
   * Both of these are read-then-create, which is WHY the ref matters: they
   * cannot defend themselves. Pinned here so that if either ever becomes
   * atomic, whoever does it finds this file and can relax the rule knowingly
   * rather than by accident.
   */
  is(/export async function ensureRunForPost/.test(client), 'ensureRunForPost is gone — this test names it as one of the two writes a double tap duplicated');
  is(/export async function createSchedule/.test(client), 'createSchedule is gone — same');

  /*
   * STILL READ-THEN-CREATE, asserted as the SHAPE rather than as the two
   * function names it used to be.
   *
   * The create half was `saveCampaign({ name: post.title … })` and is now
   * `createRunWithRepeat(…)`, which writes repeat_enabled and repeat_min_hours
   * explicitly instead of leaving them to the database's default. That was the
   * whole of "זה פשוט מדלג על הפוסטים": rules.ts checks the repeat SWITCH
   * before the repeat WINDOW, so a campaign created with two fields skipped
   * every group the post had already reached, and v35's zeroing of the window
   * could not reach it. See worker/test/repeat-switch.test.ts.
   *
   * Nothing about atomicity changed — it is still a read, then a separate
   * write, with only the ref between a double tap and two runs — so this rule
   * stands. Pinning the callee's NAME made a rename look like a relaxation,
   * which is the opposite of what this file is for.
   */
  /* נחתך עד ה-export הבא ולא לפי ספירת תווים: חלון קבוע הפסיק להגיע לקריאה
     ברגע שנוספה מעליה הערה, והבדיקה "נכשלה" על קוד תקין. שלישית הלילה. */
  const ensureAt = client.indexOf('export async function ensureRunForPost');
  const ensureEnd = client.indexOf('\nexport ', ensureAt + 10);
  const ensure = client.slice(ensureAt, ensureEnd === -1 ? client.length : ensureEnd);
  is(/const existing = await getCampaign\(post\.campaign_id\);/.test(ensure), 'ensureRunForPost still READS first — getCampaign');
  is(
    /const run = await createRunWithRepeat\(/.test(ensure),
    'and then CREATES in a separate write, so the launch path has nothing but the ref between a double tap and two runs',
  );
  /* And the create half is not secretly atomic: an upsert or an ON CONFLICT
     would make the ref unnecessary, and that is the change this rule wants
     made knowingly. */
  const createFn = client.slice(client.indexOf('async function createRunWithRepeat'), client.indexOf('export async function ensureRunForPost'));
  is(
    !/upsert\(|onConflict/.test(createFn),
    'createRunWithRepeat is a plain insert, not an upsert — if it ever becomes atomic, relax this rule knowingly rather than by accident',
  );
}

console.log(`one-tap OK — ${checks} assertions over ${PATHS.length} write paths`);
