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
    !/setCampaigns\(before\.map\(\(c\) => \(c\.id === campaign\.id \? \{ \.\.\.c, \.\.\.columns \} : c\)\)\)/.test(page),
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
  is(/\[toast, load\]/.test(fn.slice(fn.length - 400)) || /\[toast, load\],/.test(page), 'changeSchedule must declare load() among its dependencies now that the settle path depends on the read');
}

console.log(`settings stick OK — ${checks} assertions over both screens`);
