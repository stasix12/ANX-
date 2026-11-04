/**
 * AN EDIT THE OWNER MADE MAY NOT BE FORGOTTEN BY A REFRESH.
 *
 * "שינויים בהגדרות לא מתעדכנים מיידית."
 * "אני רוצה אחרי שאני לוחץ שינוי בקמפיין זה מייד שומר ולא טוען מסך בלי סוף."
 *
 * /social/campaigns patched the edit straight into its `campaigns` list, and a
 * read lands on top of that list every five seconds. Between the tap and the
 * write settling — 600ms of debounce, then a campaign save, a repeat re-arm, a
 * floor write and a queue respace, which is several seconds on a phone — any
 * refresh put the STORED row back. The owner taps a day chip, watches it light
 * up, and watches it go out again.
 *
 * And the cleanup only cleared the timer, so leaving the screen inside 600ms
 * DROPPED the write entirely — with the card having already shown the change as
 * made.
 *
 * The dashboard had already been fixed three ways and none of them reached this
 * screen. That is the shape of "תיקון של באג אחד גורם לעיתים לבאג אחר": one
 * record, two screens, two policies. So the three mechanisms are pinned here
 * for BOTH screens, by name, in one file — which is the only thing that stops
 * the next fix landing on one of them again.
 *
 *   1. the pending edit lives in its own record, so a refresh cannot wipe it;
 *   2. the pending write is a FUNCTION the unmount runs instead of dropping;
 *   3. the patch is dropped only once the stored row agrees — or when the write
 *      fails, because a card showing a window the engine never heard of is the
 *      screen promising something the machine will not do.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
/**
 * The file with its comments removed.
 *
 * Every negative assertion here needs this: the comments in this codebase
 * QUOTE the code they replaced, on purpose, so "the old call must be gone"
 * matches the explanation of why it is gone and passes for ever after.
 */
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');

const SCREENS: [string, string][] = [
  ['/social/campaigns', src('../../src/app/social/campaigns/page.tsx')],
  ['the dashboard', src('../../src/app/social/page.tsx')],
];

/* ───────── 1. the pending edit is its own record, on both screens ───────── */
for (const [name, page] of SCREENS) {
  is(
    /const \[schedulePatch, setSchedulePatch\] = useState<Record<string,/.test(page),
    `${name} no longer holds the owner's un-written schedule edit apart from the list a refresh replaces — so the five-second read puts the stored row back and the chip goes out under his thumb`,
  );
  /* Keyed by id. One patch means setting A's hours, moving to B, tapping a
     chip, and A's edit silently replaced — and this screen shows every round
     at once. */
  is(/schedulePatch\[campaign\.id\]/.test(page), `${name} must key the patch by campaign, or two rounds edited together overwrite each other`);
  is(
    /setSchedulePatch\(\(all\) => \(\{ \.\.\.all, \[campaign\.id\]: columns \}\)\)/.test(page),
    `${name} must ADD to the record rather than replace it`,
  );
  /* And the edit must never be written into the list the read owns. */
  is(
    !/setCampaigns\(before\.map\(\(c\) => \(c\.id === campaign\.id \? \{ \.\.\.c, \.\.\.columns \} : c\)\)\)/.test(code(page)),
    `${name} must not patch the schedule into the campaigns list — that list belongs to the refresh`,
  );
}

/* ───────── 2. the unmount flushes the write, it does not drop it ────────── */
for (const [name, page] of SCREENS) {
  is(/const schedulePending = useRef<Record<string, \(\) => Promise<void>>>\(\{\}\)/.test(page), `${name} does not keep the pending write as something it could run`);
  is(
    /for \(const \[id, timer\] of Object\.entries\(scheduleTimers\.current\)\) \{\s*clearTimeout\(timer\);\s*void schedulePending\.current\[id\]\?\.\(\);/.test(page),
    `${name} must FLUSH the pending save on unmount, not only clear the timer — a tap followed by a swipe inside 600ms otherwise loses the change silently`,
  );
  is(/schedulePending\.current\[campaign\.id\] = run;/.test(page), `${name} must register the write before arming the timer, or there is nothing for the cleanup to flush`);
  is(/scheduleTimers\.current\[campaign\.id\] = setTimeout\(run, 600\)/.test(page), `${name} must debounce the same named write it registered — a second inline closure is a second truth`);
}

/* ───────── 3. the patch clears on agreement, and on failure ─────────────── */
for (const [name, page] of SCREENS) {
  is(/live\.schedule_gap_seconds === want\.schedule_gap_seconds/.test(page), `${name} must settle the patch on the SECONDS — the minutes beside them are derived and coarser, so they would call 30→40 seconds "no change"`);
  is(/live\.schedule_days\.join\(','\) === want\.schedule_days\.join\(','\)/.test(page), `${name} must compare the chosen days too`);
  is(/const live = scheduleColumns\(readSchedule\(row\)\);/.test(page), `${name} must compare what the row RESOLVES to — a database without the migration returns no columns at all, and the defaults are the honest answer to "what is this set to"`);
  is(
    /setSchedulePatch\(\(all\) => \{[\s\S]{0,260}delete [a-z]+\[(?:id|campaign\.id)\][\s\S]{0,120}return [a-z]+;/.test(page),
    `${name} must be able to drop a patch — one that is never dropped is a card that can never show what the database refused`,
  );
}

/* A failed write on the campaigns screen drops the patch rather than reverting
   a list it no longer writes to. */
{
  const page = src('../../src/app/social/campaigns/page.tsx');
  const fn = page.slice(page.indexOf('const changeSchedule = useCallback('), page.indexOf('AND THE PATCH IS DROPPED ONLY ONCE'));
  is(fn.length > 1500, 'changeSchedule is found');
  is(
    /catch \(err\) \{[\s\S]{0,700}setSchedulePatch\(\(all\) => \{[\s\S]{0,200}delete rest\[campaign\.id\];/.test(fn),
    'a write that fails must drop the patch, rather than leaving the card showing a window the engine never heard of',
  );
  is(
    !/before\.find\(\(o\) => o\.id === c\.id\)/.test(fn),
    'and it must not still be reverting the campaigns list — that list is refilled by load() and reverting it fights the read',
  );
  is(/\[toast, load[,\]]/.test(fn.slice(fn.length - 400)) || /\[toast, load[,\]]/.test(page), 'changeSchedule must declare load() among its dependencies now that the settle path depends on the read');
}

/* ───────── 4. the queue tuner writes what it edits, and no more ────────── */
{
  const tuner = src('../../src/components/social/QueueTunerSheet.tsx');
  const fn = tuner.slice(tuner.indexOf('const commitGap = ()'), tuner.indexOf('const removeTarget ='));
  is(fn.length > 800, 'commitGap is found');

  /*
   * The write-back itself must STAY. The long note above it is why: without it
   * this sheet wrote only the account floor and the round's own column kept a
   * number the engine does not use — two editors, two records, each undoing
   * the other. What was wrong is its WIDTH.
   */
  is(/await saveCampaignSchedule\(snap\.campaign\.id, \{/.test(fn), "the round's own gap column must still be written from here — writing only the account floor is the two-editors bug this replaced");
  is(/schedule_gap_seconds: kept,/.test(fn), 'and it must write the seconds the owner chose');
  is(/schedule_gap_minutes: gapMinutesFor\(kept\),/.test(fn), 'with the rounded-up minutes beside them, or an un-updated worker reads nothing and falls back to a default — a change to how fast the account posts made by a deployment rather than by the owner');

  /*
   * AND NOTHING ELSE. It rebuilt the entire window from `snap.window`, a
   * snapshot taken when the sheet OPENED, and carried that snapshot's name. So
   * choosing a gap restored the start hour, the chosen days, the on/off switch
   * and the name to their open-time values — and then re-spaced the queue to
   * the restored window.
   */
  is(
    !/scheduleColumns\(\{ \.\.\.snap\.window, gapSeconds: kept \}\)/.test(code(fn)),
    'the tuner must not rebuild the whole window from its open-time snapshot: a start hour or a day chosen on the card in between is silently restored, and the queue is then re-spaced to the restored window',
  );
  is(!/name: snap\.campaign\.name/.test(code(fn)), "nor carry the snapshot's name — a rename made while the sheet was open would be rolled back by a control about spacing");
  is(!/scheduleColumns/.test(code(tuner)), 'and the whole-window writer must not come back anywhere in this sheet');

  /* The narrow writer must be narrow by construction, not by its callers. */
  const client = src('../../src/lib/social/client.ts');
  const writer = client.slice(client.indexOf('export async function saveCampaignSchedule'), client.indexOf('export async function saveCampaign('));
  is(writer.length > 100, 'saveCampaignSchedule is found');
  is(/patch: Partial<ScheduleFields>/.test(writer), 'it must take a PARTIAL — a required full shape puts every caller back to supplying fields it is not editing');
  is(/\.update\(patch\)/.test(writer), 'and send exactly that patch, so anything absent keeps whatever is stored');
  is(/if \(!id \|\| !Object\.keys\(patch\)\.length\) return;/.test(writer), 'an empty patch must write nothing at all rather than issue a no-op UPDATE');
}

/* ───── 6. the repeat floor reaches the WRITE, not just the drawing ─────── */
{
  /*
   * ─── A SETTING THAT STICKS ON SCREEN AND NOT IN THE DATABASE ────────────
   *
   * Caught in adversarial review before it reached the owner, and it would
   * have been the worst version of this bug: the card READS the floor from
   * fresh `data` on every render, so it correctly offered
   * "הורידו את החזרה ל-2 שעות" — and the callback behind that button wrote
   * repeatColumns(…, 12), clamping his 2 straight back up. Press, nothing
   * changes, press again.
   *
   * The cause is structural rather than arithmetic. Every writer on the
   * dashboard lives in a useCallback whose dependencies never change —
   * changeRepeat's are [toast] with the exhaustive-deps lint suppressed,
   * changeSchedule's are [toast, load], and both `load` and `toast` are
   * themselves useCallback(…, []). So the callbacks are built once, on the
   * first render, where `data` is the cold snapshot and carries no limits at
   * all. Anything they read from `data` is frozen there for the life of the
   * screen.
   *
   * No existing test could see it: the arithmetic is right, the prop is right,
   * the typecheck is clean, and the rendered card shows the correct number.
   * Only the value that reaches the database is wrong. So the guard is about
   * SHAPE — the writers must not read `data` at all.
   */
  const page = src('../../src/app/social/page.tsx');

  is(/const floorRef = useRef\(MIN_REPEAT_HOURS\)/.test(page), 'the dashboard keeps the account floor in a ref, because its writers are built once and never see a later `data`');
  is(
    /floorRef\.current = repeatFloorFrom\(data\?\.limits\)/.test(page),
    'and that ref is refreshed from the settings the screen actually loaded',
  );
  is(/\}, \[data\?\.limits\]\);/.test(page), 'in an effect keyed on those settings, so it follows a change rather than a render');

  /*
   * THE WRITER TAKES IT FROM THE REF. It writes repeat_min_hours through
   * repeatColumns, which CLAMPS UP to whatever floor it is handed, so a stale
   * twelve here is not a wrong label, it is a wrong row.
   *
   * ONE WRITER NOW, NOT TWO. saveCampaignRounds was the other, and it is gone
   * with סבבים ביום — "למחוק גם את הסבבים זה מסוכן". The list is kept as a
   * loop rather than flattened to a single check, so the day a second writer
   * of this column appears it is added here instead of being forgotten.
   */
  for (const call of ['setCampaignRepeat']) {
    const re = new RegExp(`await ${call}\\([^;]*floorRef\\.current`);
    is(re.test(page), `${call} on the dashboard takes the floor from the ref, read at the moment of the tap`);
  }

  /*
   * AND NOTHING INSIDE A CALLBACK READS IT FROM `data` ANY MORE. Exactly one
   * `data?.limits` read is allowed on this screen — the effect above. The
   * card's own prop uses `data.limits` without the `?`, because by then the
   * screen has rendered and `data` is not null; that is a different string and
   * is deliberately not matched here.
   */
  const inlineReads = page.split('repeatFloorFrom(data?.limits)').length - 1;
  is(inlineReads === 1, `the only \`data?.limits\` read left on the dashboard must be the effect that feeds the ref — found ${inlineReads}; a writer that reads it inline is frozen at the first render`);
}

console.log(`settings stick OK — ${checks} assertions over both screens and the queue tuner`);
