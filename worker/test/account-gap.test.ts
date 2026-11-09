import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { accountGapLabel, accountGapSeconds, splitAccountGap } from '../../src/lib/social/rules';
import { DEFAULT_BROWSER, DEFAULT_LIMITS } from '../../src/lib/social/types';

/**
 * THE OTHER GAP — the account-wide one, and the reason choosing thirty
 * seconds used to change nothing at all.
 *
 * "תשנה גם את המרווח המינימלי הגלובלי ברגע שמשנים את הזמנים בקמפיין."
 *
 * worker/test/campaign-gap.test.ts proves a campaign's OWN gap survives the
 * trip from the column to the engine. That was only ever the first of FOUR
 * gates, and it is not the one that decides:
 *
 *   1. the campaign's gap               — 30s, if he picked 30s
 *   2. limits.minGap + browser.groupMinGap — 45 + 20 = 65 MINUTES by default
 *   3. the browser's real speed          — one publication's length
 *   4. plan.ts placing the ROWS apart    — staggerAt, which rounded to minutes
 *
 * The LATER instant wins, so under the shipped defaults a campaign asking for
 * thirty seconds was inert: the panel said 30s, the card counted down from
 * 30s, and the engine held every row for an hour. Gate 4 then made it
 * unreachable even with gate 2 lowered, because the rows themselves were
 * written a whole minute apart.
 *
 * So this file is about gates 2 and 4, and about the one rule that keeps them
 * honest: THE SUM. `minGap` and `groupMinGap` are two columns and one number,
 * and every reader that adds them up itself is a copy that can drift — four
 * of them had, which is how a thirty-second floor became sixty.
 *
 *   npx tsx worker/test/account-gap.test.ts
 */

let checks = 0;
const eq = (a: unknown, b: unknown, msg: string) => { checks += 1; assert.deepEqual(a, b, msg); };
const is = (c: unknown, msg: string) => { checks += 1; assert.ok(c, msg); };
/*
 * COMMENTS ARE NOT CODE, and this file has already been bitten by that — see
 * the note in §4b about three pins in this change that matched a COMMENT
 * instead of code, twice a page's own explanation of what had been removed.
 * Every file read here quotes its deleted labels and sentences at length in
 * its docblocks, and the 07.11.2026 deletion made that the rule rather than
 * the exception: four files now carry a long "WHAT WAS HERE" block holding the
 * exact strings whose absence is the point. So a pin on a Hebrew sentence, or
 * on a prop that was supposed to go, is tested against this and not the file.
 */
const codeOnly = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

/* ─────────────────────────────────────────────────────────────────────────
 * 1. accountGapSeconds — ONE function, asked by everybody.
 * ───────────────────────────────────────────────────────────────────────── */
{
  /* The shipped defaults, which is the number that was swallowing everything. */
  eq(accountGapSeconds(DEFAULT_LIMITS, DEFAULT_BROWSER, true), 65 * 60, 'out of the box a group waits 45 + 20 minutes — and this is the gate that decides, not the campaign’s');
  eq(accountGapSeconds(DEFAULT_LIMITS, DEFAULT_BROWSER, false), 45 * 60, 'a Page waits the global gap and nothing more — the surcharge is for groups');

  /*
   * SECONDS WIN WHERE THEY EXIST. The minutes beside them are written rounded
   * UP, deliberately, so a worker that has not been updated is SLOWER than
   * asked rather than faster — but on a reader that knows about both, the
   * seconds are the value the owner chose and the minutes are a derivative.
   */
  const limits = { ...DEFAULT_LIMITS, minGapMinutes: 1, minGapSeconds: 0 };
  const browser = { ...DEFAULT_BROWSER, groupMinGapMinutes: 1, groupMinGapSeconds: 30 };
  eq(accountGapSeconds(limits, browser, true), 30, 'with the seconds present the floor is thirty, not the sixty the rounded-up minutes would give');
  eq(accountGapSeconds(limits, browser, false), 0, 'and the base half is read the same way');

  /* AND A DATABASE THAT HAS NEVER SEEN THEM IS UNCHANGED. The whole point of
     the fields being optional: an account nobody has touched behaves exactly
     as it did before seconds existed. */
  eq(
    accountGapSeconds({ minGapMinutes: 45 }, { groupMinGapMinutes: 20 }, true),
    65 * 60,
    'no seconds anywhere falls back to the minutes — not to zero, which would publish 218 posts at once',
  );

  /* Garbage in storage must not become a FASTER floor. social_settings is
     key/jsonb with no constraints, so anything can be in there. */
  for (const bad of [undefined, null, NaN, -5, 'abc'] as unknown[]) {
    const n = accountGapSeconds(
      { minGapMinutes: 45, minGapSeconds: bad as number },
      { groupMinGapMinutes: 20, groupMinGapSeconds: bad as number },
      true,
    );
    is(n >= 0 && Number.isFinite(n), `a stored ${JSON.stringify(bad)} still yields a usable floor (${n})`);
    is(n !== 0 || bad === 0, `and never silently becomes "no gap at all" (${JSON.stringify(bad)} → ${n})`);
  }
  eq(accountGapSeconds({ minGapMinutes: -10 }, { groupMinGapMinutes: -10 }, true), 0, 'negative minutes clamp to zero rather than running the clock backwards');
}

/* ─────────────────────────────────────────────────────────────────────────
 * 2. accountGapLabel — the unit the owner actually chose.
 * ───────────────────────────────────────────────────────────────────────── */
{
  eq(accountGapLabel(30), '30 שניות', 'thirty seconds is said in seconds');
  eq(accountGapLabel(40), '40 שניות', 'so is forty');
  eq(accountGapLabel(50), '50 שניות', 'and fifty');
  eq(accountGapLabel(60), '1 דק׳', 'a minute is a minute');
  eq(accountGapLabel(65 * 60), '65 דק׳', 'and the shipped default reads as the hour-and-five it is');
  /*
   * "נדחה כדי לשמור מרווח של 0.6 דק׳" is a sentence nobody should have to
   * read, and it is what the old minutes-only label produced for every
   * sub-minute floor. Below a minute the unit changes; above it, a half
   * minute is allowed one decimal rather than being rounded into a lie.
   */
  is(!/\./.test(accountGapLabel(45)), 'a sub-minute floor is never described as a fraction of a minute');
  eq(accountGapLabel(90), '1.5 דק׳', 'and a minute and a half says so rather than rounding to one or two');
}

/* ─────────────────────────────────────────────────────────────────────────
 * 3. splitAccountGap — the sum, which is the only thing that matters.
 * ───────────────────────────────────────────────────────────────────────── */
{
  for (const surcharge of [0, 30, 60, 20 * 60, 45 * 60]) {
    for (const want of [0, 1, 29, 30, 40, 50, 60, 61, 300, 1800, 65 * 60]) {
      const { baseSeconds, surchargeSeconds } = splitAccountGap(want, surcharge);
      eq(baseSeconds + surchargeSeconds, want, `the two halves must add up to exactly ${want} (surcharge ${surcharge})`);
      is(baseSeconds >= 0, `the base is never negative (want ${want}, surcharge ${surcharge})`);
      is(surchargeSeconds >= 0, `nor is the surcharge (want ${want}, surcharge ${surcharge})`);
      is(surchargeSeconds <= want, `and the surcharge never exceeds the whole floor (want ${want}, surcharge ${surcharge})`);
    }
  }
  /* The two named cases from the note on the function. */
  eq(splitAccountGap(65 * 60, 20 * 60), { baseSeconds: 45 * 60, surchargeSeconds: 20 * 60 }, 'a surcharge that fits keeps its share');
  eq(splitAccountGap(30, 20 * 60), { baseSeconds: 0, surchargeSeconds: 30 }, 'a surcharge that does not fit is absorbed by the whole floor');

  /* AND THE SPLIT ROUND-TRIPS THROUGH THE READER. Written back into the two
     settings, accountGapSeconds must return the number that was asked for —
     if it does not, a row placed exactly N seconds after the last publication
     is deferred by the very setting that was supposed to release it. */
  for (const want of [30, 40, 50, 60, 90, 600, 65 * 60]) {
    const { baseSeconds, surchargeSeconds } = splitAccountGap(want, 20 * 60);
    eq(
      accountGapSeconds(
        { minGapMinutes: Math.ceil(baseSeconds / 60), minGapSeconds: baseSeconds },
        { groupMinGapMinutes: Math.ceil(surchargeSeconds / 60), groupMinGapSeconds: surchargeSeconds },
        true,
      ),
      want,
      `a floor written as ${want} reads back as ${want}`,
    );
  }
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4. matchAccountGapTo — what the panel triggers, and its three invariants.
 *
 * Not executed: it is four PostgREST round trips deep and the harness would
 * be testing the harness. What is asserted here is the three things that make
 * it safe, each one a specific way this feature could have been written and
 * been wrong.
 * ───────────────────────────────────────────────────────────────────────── */
{
  const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
  const fn = client.slice(client.indexOf('export async function matchAccountGapTo'), client.indexOf('export async function applyGapSettings'));
  is(fn.length > 400, 'matchAccountGapTo exists in client.ts');

  /*
   * (a) IT ONLY EVER LOWERS. A campaign set to ten minutes must not drag a
   * floor the owner deliberately raised to an hour back down with it — that
   * would turn one campaign's setting into a silent account-wide loosening,
   * which is the opposite of a product that says what it does.
   */
  is(
    /if \(wasSeconds <= want\) return \{ changed: false/.test(fn),
    'ONLY LOWERS — a campaign with a bigger gap than the floor leaves the floor alone, and says nothing happened',
  );

  /*
   * (b) WHOLE OBJECTS. saveSetting replaces the entire jsonb, so a partial
   * write silently erases maxPerDay, maxPerTargetPerDay and dedupeDays. This
   * exact mistake is already pinned for respaceQueue in unit.test.ts; the same
   * gun is loaded here.
   */
  is(/saveSetting\('limits', \{ \.\.\.limits,/.test(fn), 'the limits write carries the whole object, or the daily ceilings are erased');
  is(/saveSetting\('browser', \{\s*\.\.\.browser,/.test(fn), 'and so does the browser write');

  /*
   * (c) THE MINUTES ARE WRITTEN BESIDE THE SECONDS, ROUNDED UP. The customer's
   * PC runs a bundled worker that updates on its own schedule, so for a while
   * after this ships there can be a copy reading only the minutes. Rounded up,
   * that copy is SLOWER than asked; rounded down it would be faster than the
   * owner's own account settings allow, which is the one direction that is not
   * ours to choose for him.
   */
  is(/minGapMinutes: Math\.ceil\(base \/ 60\)/.test(fn), 'the legacy minutes are written beside the seconds, rounded UP so an un-updated worker errs slow');
  is(/groupMinGapMinutes: Math\.ceil\(surcharge \/ 60\)/.test(fn), 'both halves');

  /* (d) AND IT IS SAID OUT LOUD. The floor is account-wide; a change to it
     that left no trace would be the product doing something behind him. */
  is(/logClientActivity\('info', 'limits_changed'/.test(fn), 'the change is written to the activity log');
  is(/accountGapLabel\(wasSeconds\)/.test(fn) && /accountGapLabel\(want\)/.test(fn), 'naming both the old floor and the new one, in the unit each actually has');

  /*
   * ─── RE-POINTED 09.11.2026 — THE CALL SITES ARE GONE, AND THAT IS THE PIN ─
   *
   *   "לא אמור ליהנות גם 600 שניות, הפרסום צריך לצאת אחד אחרי השני לפי קצב
   *    מהיר בינוני או בטוח לפי מה שבחרתי"
   *
   * This asked both schedule screens to call matchAccountGapTo(next.gapSeconds)
   * on every save. That was right while a human typed a gap into the campaign
   * panel. The field was removed from the interface entirely on 07.11 — "יש
   * להסיר לחלוטין מהממשק את השדה הישן: הפרש בין פרסומים... ואין ליצור הגדרה
   * כפולה" — and ever since, `next.gapSeconds` is the STORED COLUMN: a number
   * nobody chose, defaulting to 600 in Postgres. The re-point lower down this
   * same file (line 224) already wrote the argument on the day the field went:
   * "There is no per-campaign gap field left to disagree with the floor, so
   * there is no moment at which one campaign's choice is about to move an
   * account-wide number." It removed the notice and left the write. This
   * removes the write.
   *
   * Live harm, measured, in the owner's own complaint shape with the sign
   * flipped: five tenants sit on the shipped 3900-second account gap, and the
   * first time one of them switched a round's window on, a stored 600 took
   * their whole account from 65 minutes to 10 — a 6.5x speed-up chosen by
   * nobody, which is the thing that gets Facebook accounts restricted.
   *
   * The account pace has exactly two writers from here on: applyGapFloor,
   * reached by picking a mode, and the queue tuner, the one control a human
   * ever typed a gap into. Both are below.
   */
  for (const [where, src] of [
    ['the dashboard', 'src/app/social/page.tsx'],
    ['the campaigns screen', 'src/app/social/campaigns/page.tsx'],
  ] as const) {
    const page = readFileSync(new URL(`../../${src}`, import.meta.url), 'utf8');
    is(
      !/matchAccountGapTo\(/.test(page),
      `${where} no longer moves the account pace from a campaign column — the per-campaign gap field was removed from the interface on 07.11, so that number is one nobody chose`,
    );
    is(
      !/זה חל על כל הסבבים/.test(page),
      `${where} no longer announces an account-wide change it no longer makes`,
    );
    /* And the one write that IS account-wide is still announced, on the one
       control that makes it: picking a mode. */
    is(/חל על כל החשבון/.test(page), `${where} still says out loud that picking a publishing mode is an account-wide act`);
  }

  /* And the panel says so BEFORE the write, where the choice is being made. */
  const panel = readFileSync(new URL('../../src/components/social/CampaignSchedulePanel.tsx', import.meta.url), 'utf8');
  const card = readFileSync(new URL('../../src/components/social/SmartPaceCard.tsx', import.meta.url), 'utf8');
  is(/accountFloorSeconds\?: number;/.test(panel), 'the panel can be told what the account floor currently is');
  /*
   * ─── RE-POINTED 07.11.2026 ───────────────────────────────────────────────
   *
   * This asked for `accountFloorSeconds > schedule.gapSeconds` — the condition
   * on a line that appeared only while the campaign's own chosen gap sat below
   * the account floor, warned that saving would take the floor down for every
   * round, and cleared itself once the write landed.
   *
   * THE CONDITION CANNOT ARISE ANY MORE, which is why the line is gone rather
   * than moved: "יש להסיר לחלוטין מהממשק את השדה הישן: הפרש בין פרסומים. אין
   * להשאיר אותו במקום אחר ואין ליצור הגדרה כפולה." There is no per-campaign
   * gap field left to disagree with the floor, so there is no moment at which
   * one campaign's choice is about to move an account-wide number. What the
   * self-clearing notice existed to prevent is now structural instead: picking
   * a mode IS an account-wide act, and מצב פרסום חכם says so permanently.
   *
   * So the pin becomes the two halves of that which still have to be true —
   * the floor the ENGINE enforces still reaches the control that states it,
   * and that control states it as a fact about the engine rather than as a
   * comparison against a number that no longer exists.
   */
  is(
    /currentGapSeconds=\{effectiveGapSeconds\}/.test(codeOnly(panel)),
    'the account floor still reaches the control that states it — the mode card is handed the same effectiveGapSeconds the deleted field used to show',
  );
  is(
    /accountGapLabel\(currentGapSeconds\)/.test(codeOnly(card)),
    'and the card prints that floor in the unit it actually has, so the number the engine is holding is never left un-named on screen',
  );
  is(
    /typeof currentGapSeconds === 'number' && Number\.isFinite\(currentGapSeconds\)/.test(codeOnly(card)),
    'guarded on the floor being KNOWN rather than on it disagreeing with a campaign — a caller that cannot read the account settings says nothing instead of guessing',
  );
  /*
   * ─── RE-POINTED 07.11.2026 ───────────────────────────────────────────────
   *
   * "in words that name the scope" was pinned on the panel because the words
   * were in the panel's deleted notice. They moved into מצב פרסום חכם's own
   * summary line, where they are now UNCONDITIONAL — "המצב חל על כל החשבון
   * ועל כל הסבבים", on every render — rather than a warning that appears and
   * disappears. The scope is said more often than it used to be, not less.
   *
   * AND IT IS TESTED AGAINST THE CODE. The panel still holds a sentence very
   * close to this one, inside the docblock where it records what it deleted
   * and where the words went; a pin that matched that would keep passing long
   * after the real sentence was gone. See codeOnly() at the top of this file.
   */
  is(
    /המצב חל על כל החשבון ועל כל הסבבים/.test(codeOnly(card)),
    'in words that name the scope, on the card that now owns the choice — and permanently, not only while something disagrees',
  );
  /*
   * AND THE FIELD IS GONE FROM THE PANEL ITSELF, which is the half of the
   * instruction that is about this file: "אין להשאיר אותו במקום אחר ואין
   * ליצור הגדרה כפולה". A deleted control that comes back next to a mode
   * picker is two definitions of one number, which is the shape of every bug
   * this whole file exists to pin.
   */
  is(!/הפרש בין פרסומים/.test(codeOnly(panel)), 'and the old per-campaign gap field is not in the panel any more — not beside the mode card, not anywhere');
  is(!/gapSeconds: Number\(/.test(codeOnly(panel)), 'nor is any control left in it that writes a gap');
}

/* ─────────────────────────────────────────────────────────────────────────
 * 4b. EVERY WRITER OF THE PAIR WRITES BOTH UNITS.
 *
 * THE SILENT NO-OP THIS WHOLE CHANGE CREATES, and the reason it needs its own
 * section. accountGapSeconds() PREFERS the `*Seconds` fields when they are
 * present — that is what lets a sub-minute floor exist at all. The cost is
 * that any control which writes only the MINUTES stops working the moment the
 * seconds have been written once: the slider moves, the toast says
 * "ההגדרות נשמרו", the number on screen changes, every row in the queue moves
 * — and the gate the engine actually consults does not. Nothing on any screen
 * disagrees with anything else. It is simply not true.
 *
 * There were three writers of this pair in the product. As of 07.11.2026 the
 * settings screen is a writer of NEITHER half, and there is a fourth that is
 * now the one that matters.
 *
 * The settings screen stopped writing the group half when "מרווח נוסף בין
 * קבוצות" was deleted at the owner's request, and stopped writing the account
 * half when "מרווח מינימלי בין פרסומים (דקות)" went the same way: "יש להסיר
 * לחלוטין מהממשק את השדה הישן: הפרש בין פרסומים. אין להשאיר אותו במקום אחר
 * ואין ליצור הגדרה כפולה." A screen with no box for a number has no business
 * writing it, and while it still did, it wrote a MOUNT-TIME copy that reverted
 * a floor the campaign panel had just lowered. The invariant this section
 * defends is now kept for BOTH halves the one way that cannot drift: by
 * removing the writer rather than by remembering to update it.
 *
 * The fourth writer is applyGapFloor(), which is what מצב פרסום חכם writes
 * through — applyPace() hands it the chosen mode's gapSeconds — so it is
 * behind every gap change the owner can still make. It is held to exactly the
 * same invariant as the other three, below.
 * ───────────────────────────────────────────────────────────────────────── */
{
  const client = readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8');
  const apply = client.slice(client.indexOf('export async function applyGapSettings'), client.indexOf('export async function respaceQueue'));
  is(apply.length > 300, 'applyGapSettings was located');
  is(/minGapSeconds: seconds\.baseSeconds/.test(apply), 'the queue tuner writes the seconds beside the minutes, or its slider stops governing anything');
  is(/groupMinGapSeconds: seconds\.surchargeSeconds/.test(apply), 'both halves of the pair');
  is(/const seconds = splitAccountGap\(gapMinutes \* 60, newSurcharge \* 60\)/.test(apply), 'derived through the one split, so the tuner and the panel cannot disagree about what a gap of N means');
  /*
   * AND THE SURCHARGE IS WRITTEN UNCONDITIONALLY. `surchargeChanged` compares
   * MINUTES: a surcharge going from 30 seconds back up to a whole minute reads
   * as "1 → 1, unchanged", so a guarded write would leave the stale 30 behind
   * to out-vote the minute.
   */
  is(
    !/if \(surchargeChanged\) await saveSetting\('browser'/.test(apply),
    'the surcharge write is not guarded on the MINUTES being different — 30s and 60s are both "1 minute", and the stale seconds would win',
  );

  /*
   * ─── THE FOURTH WRITER, AND NOW THE ONE THAT MATTERS ─────────────────────
   *
   * ADDED 07.11.2026. applyGapFloor() is the writer מצב פרסום חכם goes
   * through, so it carries the gap for every change the owner can still make
   * from a campaign card. Same invariant, asserted the same way: both units of
   * both halves, derived through the one split, onto the whole object.
   */
  const floor = client.slice(client.indexOf('export async function applyGapFloor'), client.indexOf('async function campaignWindows'));
  is(floor.length > 400, 'applyGapFloor was located');
  is(/const \{ baseSeconds, surchargeSeconds \} = splitAccountGap\(want, curSurcharge\)/.test(floor), 'derived through the one split, so the mode card cannot disagree with the tuner or the panel about what a gap of N means');
  is(
    /saveSetting\('limits', \{ \.\.\.limits, minGapMinutes: Math\.ceil\(baseSeconds \/ 60\), minGapSeconds: baseSeconds \}\)/.test(floor),
    'both units of the base, rounded UP, onto the whole limits object',
  );
  is(
    /saveSetting\('browser', \{ \.\.\.browser, groupMinGapMinutes: Math\.ceil\(surchargeSeconds \/ 60\), groupMinGapSeconds: surchargeSeconds \}\)/.test(floor),
    'and both units of the surcharge, onto the whole browser object',
  );
  /* And the mode goes THROUGH it rather than around it — a saveSetting of its
     own would be a fifth writer of the pair on the day the fourth was added. */
  const applyPace = client.slice(client.indexOf('export async function applyPace'), client.indexOf('export async function liveQueuePlan'));
  is(applyPace.length > 100, 'applyPace was located');
  is(/const gap = await applyGapFloor\(pace\.gapSeconds\)/.test(applyPace), 'picking a mode writes the account gap through that one writer, so nothing new had to learn about the pair');
  is(
    /const limits = await getLimits\(\);\s*\n\s*await saveSetting\('limits', \{ \.\.\.limits, pace: id \}\)/.test(applyPace),
    'and `pace` lands on a FRESH read of the row, after the gap write that re-read it — a stale spread is how this product has twice reverted a setting somebody had just changed elsewhere',
  );

  const settings = readFileSync(new URL('../../src/app/social/settings/page.tsx', import.meta.url), 'utf8');
  /*
   * ─── RE-POINTED 07.11.2026: THE SETTINGS SCREEN WRITES NEITHER HALF ──────
   *
   * This asked for `minGapSeconds: keepOrDerive(` and called it "the settings
   * screen writes the seconds beside its minutes box, or that box stops
   * governing". THE BOX IS GONE — "יש להסיר לחלוטין מהממשק את השדה הישן:
   * הפרש בין פרסומים" — and the write went with it, exactly as the group half
   * went when "מרווח נוסף בין קבוצות" was deleted a change earlier.
   *
   * There is nothing to re-point this at on that screen, because the right
   * answer for a writer with no control is to stop being a writer. So the
   * assertion that replaces it is the key set below, read out rather than
   * grepped for: it is the one form of this that cannot pass by accident, and
   * it says in one line that neither minGapMinutes nor minGapSeconds is in
   * the write any more. The executed round trip at the end of this section
   * then proves the property the deleted arithmetic existed for.
   */
  /*
   * AND THE GROUP HALF IS NOT WRITTEN FROM THERE AT ALL ANY MORE.
   *
   * This asked for `groupMinGapSeconds: gapFields.groupMinGapSeconds` and
   * called it "both halves there as well". That was right while the screen
   * had a box for the group surcharge. The box is gone, and the write went
   * with it — because what was left was not a control, it was a snapshot
   * taken when the screen mounted, spread over the freshly re-read row: a
   * campaign panel set to "30 שניות" came back as 20 minutes on the next
   * שמור. The invariant this section defends — every writer of the pair
   * writes both units — is kept by REMOVING a writer, which is the one way to
   * keep it that cannot drift.
   */
  is(!/saveSetting\('browser'/.test(settings), 'and it is no longer a writer of the group half in any form');
  /*
   * AND THE SAVE'S KEY SET, READ OUT RATHER THAN GREPPED FOR. Three pins in
   * this change were written as "the name must not appear" and all three
   * matched a COMMENT instead of code — including, twice, the page's own
   * explanation of what had been removed. The question is never whether a
   * name is mentioned; it is which keys the write actually carries. So this
   * lists them.
   */
  /* Hoisted out of the block below as of 07.11.2026, because the executed
     round trip further down now BUILDS the save out of this very list rather
     than out of three key names typed into it by hand. */
  let saveKeys: string[] = [];
  {
    const from = settings.indexOf("await saveSetting('limits', {");
    is(from > 0, 'the limits save was located');
    const body = settings.slice(from, settings.indexOf('});', from));
    saveKeys = [...body.matchAll(/^\s{8}([A-Za-z][A-Za-z0-9]*):/gm)].map((m) => m[1]).sort();
    eq(
      saveKeys.join(','),
      'dedupeDays,maxPerDay,maxPerTargetPerDay',
      /* RE-POINTED 07.11.2026: three boxes, not four, and NEITHER half of the
         gap. The expected list shrank because a control was deleted, which is
         the one reason a key set here is allowed to change — and listing it
         is what makes that visible rather than a regex quietly still passing
         over a line that no longer exists. */
      'the settings save carries exactly its three remaining boxes — no gap of either kind, no group half, and nothing it has no control for',
    );
    is(body.includes('...curLimits,'), 'onto the row as it is now, so every other key survives untouched');
  }

  /*
   * AND IT STILL SAYS THE NUMBER, WHICH IS THE PART THAT WAS NOT DELETED.
   *
   * RE-POINTED 07.11.2026. A floor the engine enforces and no screen states
   * is how this product has repeatedly gone wrong, and this is the screen
   * whose whole job is the truth about these settings. The <Notice> that used
   * to appear only when the box could not express the stored seconds is now
   * UNCONDITIONAL, because there is no box left for it to disagree with — and
   * it names where the number IS changed, since an instruction that cannot
   * work is worse than none.
   */
  is(/שמירה מהמסך הזה לא תיגע/.test(codeOnly(settings)), 'the read-only line promises that saving here will not touch the floor');
  is(/מצב פרסום חכם/.test(codeOnly(settings)), 'and names the control that does change it, by the name it has on screen');

  /* And the screen says the real figure, which is the part that was NOT
     deleted — it is now printed unconditionally, see above. */
  is(/accountGapLabel\(accountGapSeconds\(limits, browser, true\)\)/.test(settings), 'and it prints the floor the engine actually enforces, through the one function, rather than adding the two columns up again');

  /*
   * ─── THE ONE-WAY RATCHET, RE-POINTED 07.11.2026 ─────────────────────────
   *
   * WHAT WAS HERE. keepOrDerive() — this screen's own rule for when a minutes
   * box was a DECISION and when it was merely a rounding — pinned in four
   * assertions, then re-implemented here and executed over eight cases and a
   * three-save round trip. It existed because of a real bug, and the bug is
   * worth keeping written down:
   *
   *   the seconds are stored with the minutes beside them ROUNDED UP, on
   *   purpose, so a worker that predates the seconds reads a SLOWER number
   *   and never a faster one. A 30-second floor is therefore stored as 30
   *   seconds with the minutes reading 1. This screen loaded that box as "1",
   *   and a save that recomputed 1 x 60 wrote 60 — DOUBLING the floor the
   *   owner had just chosen in the campaign panel. Open the settings screen,
   *   press שמור, touch nothing: thirty seconds became sixty, silently,
   *   through the one screen whose job is to tell the truth about it.
   *
   * THE RULE IS GONE BECAUSE THE BOX IS. "יש להסיר לחלוטין מהממשק את השדה
   * הישן: הפרש בין פרסומים" took the minutes box with it, and arithmetic for
   * a box that does not exist is not a pin to re-point — it is dead code, and
   * re-implementing it here would be this file testing itself.
   *
   * BUT THE PROPERTY IT BOUGHT IS STILL THE THING THAT MUST BE TRUE, and it
   * is now provable rather than argued: the save spreads a FRESH read of the
   * row and names only the keys listed above, and neither of the gap's two
   * keys is among them. So what is executed below is that save — BUILT OUT OF
   * THE KEY LIST THE SOURCE ITSELF JUST GAVE US, not out of three key names
   * typed in here — run three times over a sub-minute floor. A gap key
   * creeping back into that write starts moving the floor in this loop, which
   * is the failure arriving AS a failure rather than as a regex that still
   * matches a line somebody deleted.
   */
  {
    interface LimitsRow { minGapMinutes: number; minGapSeconds: number; maxPerDay: number; maxPerTargetPerDay: number; dedupeDays: number }
    /* The save, to the letter: `{ ...curLimits, <the keys it names> }`. */
    const saveOnTheSettingsScreen = (curLimits: LimitsRow, form: Record<string, number>): LimitsRow => {
      const next: Record<string, number> = { ...curLimits };
      for (const key of saveKeys) next[key] = form[key];
      return next as unknown as LimitsRow;
    };
    /* The three boxes the screen still has, as the owner left them. EVERY key
       the save carries has to be one of these: a key in that write which is
       not a box here is either the gap coming back or a fourth control nobody
       told this file about, and both have to be looked at by a person. */
    const boxes: Record<string, number> = { maxPerDay: 41, maxPerTargetPerDay: 3, dedupeDays: 7 };
    for (const key of saveKeys) {
      is(key in boxes, `the save's key "${key}" is a box this screen actually has — anything else in that write is the gap returning, or a control this file has not been told about`);
    }

    /* The round trip that matters: pick a mode that puts the floor at thirty
       seconds, then press שמור on the settings screen three times. */
    const stored = splitAccountGap(30, 20 * 60);
    let limitsRow: LimitsRow = {
      ...DEFAULT_LIMITS,
      minGapMinutes: Math.ceil(stored.baseSeconds / 60),
      minGapSeconds: stored.baseSeconds,
    };
    const browserRow = {
      ...DEFAULT_BROWSER,
      groupMinGapMinutes: Math.ceil(stored.surchargeSeconds / 60),
      groupMinGapSeconds: stored.surchargeSeconds,
    };
    for (let save = 1; save <= 3; save += 1) {
      /* Not an empty save: the box the screen DOES have moves every time, so
         this is the real action and not a pass bought by doing nothing. */
      limitsRow = saveOnTheSettingsScreen(limitsRow, { ...boxes, maxPerDay: 40 + save });
      eq(
        accountGapSeconds(limitsRow, browserRow, true),
        30,
        `save #${save} on the settings screen leaves the floor at thirty seconds`,
      );
      eq(limitsRow.maxPerDay, 40 + save, `and save #${save} did land — the boxes it still has governed, so this is a working save rather than an inert one`);
    }
    /* AND THE HALF IT PASSES THROUGH IS UNTOUCHED, not merely summing to 30
       by luck. splitAccountGap(30, 20min) puts the whole floor in the group
       surcharge and leaves the account half at ZERO, so this is also the case
       the deleted `Number.isFinite(stored) && stored >= 0` guard was for: a
       stored floor of zero is a real setting and not a falsy value to be
       discarded. Nothing on this path can discard it now, because nothing on
       this path computes it. */
    eq(limitsRow.minGapSeconds, stored.baseSeconds, 'the account half came through the three saves byte for byte, zero included');

    /* And the whole floor at zero — the owner who wants no gap at all. */
    {
      let zeroRow: LimitsRow = { ...DEFAULT_LIMITS, minGapMinutes: 0, minGapSeconds: 0 };
      const zeroBrowser = { ...DEFAULT_BROWSER, groupMinGapMinutes: 0, groupMinGapSeconds: 0 };
      zeroRow = saveOnTheSettingsScreen(zeroRow, { ...boxes });
      eq(accountGapSeconds(zeroRow, zeroBrowser, true), 0, 'a floor of ZERO survives a save here too — it is a setting, not an absence');
    }
  }

  /* And the last writer, matchAccountGapTo, already checked above — it is the
     one that writes seconds FIRST and therefore the one that armed this trap
     for all the others. As of 07.11.2026 the writers of this pair are
     applyGapFloor (which מצב פרסום חכם goes through), applyGapSettings and
     this; the settings screen is no longer one of them. */
  const match = client.slice(client.indexOf('export async function matchAccountGapTo'), client.indexOf('export async function applyGapSettings'));
  is(/minGapSeconds: base/.test(match) && /minGapMinutes: Math\.ceil/.test(match), 'and the panel writes both units of the base');
  is(/groupMinGapSeconds: surcharge/.test(match) && /groupMinGapMinutes: Math\.ceil/.test(match), 'and both units of the surcharge');
}

/* ─────────────────────────────────────────────────────────────────────────
 * 5. GATE 4 — the rows themselves, which no amount of lowering gate 2 fixes.
 * ───────────────────────────────────────────────────────────────────────── */
{
  const plan = readFileSync(new URL('../../src/lib/social/plan.ts', import.meta.url), 'utf8');
  is(/const spacingSeconds = await enforcedSpacing\(db\)/.test(plan), 'the planner spaces rows in SECONDS');
  is(/return accountGapSeconds\(limits, browser, true\)/.test(plan), 'and takes the floor from the one function rather than adding the two columns up again');
  is(
    !/Number\(limits\.minGapMinutes\)[\s\S]{0,80}Number\(browser\.groupMinGapMinutes\)/.test(plan),
    'the old hand-rolled sum is gone — it is what rounded a thirty-second floor up to a minute and made gate 4 the one that decided',
  );

  const slots = readFileSync(new URL('../../src/lib/social/slots.ts', import.meta.url), 'utf8');
  is(/targetIndex \* gap \* 1000/.test(slots), 'staggerAt multiplies by a thousand, not by sixty thousand');
  is(!/gapMinutes/.test(slots), 'and nothing in it still talks in minutes, which is how the unit drifted the first time');
}

/* ─────────────────────────────────────────────────────────────────────────
 * 6. GATE 3 — the browser's own time, which is what "thirty seconds" is about.
 *
 * "ותעשה ככה שכל פרסום לא יקח יותר מ 30 שניות זה אפשרי בהחלט."
 *
 * Lowering gates 2 and 4 to thirty seconds only makes the thirty seconds
 * POSSIBLE. Whether it HAPPENS is gate 3: there is one browser, the rows run
 * one after another, and row N's evidence-gathering is time row N+1 does not
 * have. A tail that hunts the post across three pages for ninety seconds makes
 * the next click land ninety seconds late however small every other gate is —
 * and the owner reads that as "נדחה" on a queue he set to thirty seconds.
 *
 * WHAT THE BUDGET CAN AND CANNOT DO, because the difference is the honest part
 * of this answer. It bounds OUR time — the looking, after the post is already
 * on Facebook. It does NOT bound Facebook's own page load, the media upload or
 * how long the composer dialog takes to detach: those belong to a remote
 * machine, and a budget that cut them short would abandon a publication in
 * flight, which is the one thing that file may never do.
 * ───────────────────────────────────────────────────────────────────────── */
{
  const composer = readFileSync(new URL('../facebook/composer.ts', import.meta.url), 'utf8');
  const tail = composer.slice(composer.indexOf('const publishedAt = new Date().toISOString();'), composer.indexOf("return { outcome: 'published'"));
  is(tail.length > 1000, 'the verification tail was located');

  /* Nothing before the post is real may be cut: the budget is computed inside
     the tail and the deadline cannot predate it. */
  is(composer.indexOf('const deadline =') > composer.indexOf('await postButton.click()'), 'the budget starts after the click, never over it');
  is(!/postButton\.click\([\s\S]{0,40}timeout: Math\.min/.test(composer), 'and the click itself is never given a shortened timeout');

  /* The two expensive steps are the ones gated, each one separately: the
     budget is usually enough for one of them and not both, and stopping
     BETWEEN them keeps the first answer and the pace. */
  eq(
    (tail.match(/left\(\) < LOOKUP_MIN_MS/g) ?? []).length,
    2,
    'BOTH expensive steps are gated — the reload of the group feed, and each lookup page in the loop. One check for the loop as a whole would let a second page start with four seconds left',
  );
  is(/verifyCutShort = true;\s*\n\s*break;/.test(tail), 'and the loop BREAKS rather than continuing to the next address');
  is(/timeout: Math\.min\(60_000, left\(\)\)/.test(tail), 'a page load inside the tail cannot outlive the deadline either');

  /* And the result distinguishes the two reasons a post can be unverified. */
  is(/verifyCutShort: verifyCutShort && !verified/.test(composer), 'a post that WAS verified never reports the hunt as cut short — it finished');

  /* The one piece of dead time that was ours at any gap. */
  const adapter = readFileSync(new URL('../adapters/facebookGroupBrowser.ts', import.meta.url), 'utf8');
  is(/const DEBUG_LINGER_MS = 1_500;/.test(adapter), 'the debug-mode linger is 1.5s, not the four seconds it used to spend on every publication doing nothing');
  is(!/waitForTimeout\(4000\)/.test(adapter), 'and the old four seconds is gone');
  is(/if \(!spent\) await page\.waitForTimeout\(DEBUG_LINGER_MS\)/.test(adapter), 'and it is skipped entirely when the budget is already spent — a publication that ran long must not then stand still');
}

/* ═══════════════════════════════════════════════════════════════════════ *
 *  A GAP THAT ENFORCES NOTHING MAY NOT LOWER THE ONE THAT ENFORCES ALL
 * ═══════════════════════════════════════════════════════════════════════ */
/*
 * matchAccountGapTo() is account-wide and one-directional: it takes the floor
 * DOWN for every campaign in the account and never puts it back. Both screens
 * that edit a campaign's schedule called it on every save — including a save
 * on a campaign whose scheduling switch is OFF, where campaign-schedule.ts
 * short-circuits every function and the gap governs nothing at all.
 *
 * So tapping one day chip on an untouched campaign took the shipped
 * 65-minute account floor down to that campaign's default ten minutes, for
 * everything, permanently. The owner would see one toast about it and have no
 * way back.
 */
{
  /*
   * ─── RE-POINTED 09.11.2026, AND MADE STRONGER ────────────────────────────
   *
   * This block pinned the `next.enabled ?` GUARD on the call. The guard was
   * the right fix for the symptom and the wrong level: it narrowed when a
   * number nobody chose may move the one setting that governs every campaign,
   * instead of refusing it. The campaign gap field has not existed in the
   * interface since 07.11, so there is no longer any case in which the guard
   * should open. The call is gone; what replaces the pin is the rule it was
   * standing in for, in three parts that are each still load-bearing.
   */
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');

  /* (1) NEITHER SCREEN. Not guarded — absent. */
  for (const f of ['../../src/app/social/page.tsx', '../../src/app/social/campaigns/page.tsx']) {
    const code = strip(readFileSync(new URL(f, import.meta.url), 'utf8'));
    is(
      !code.includes('matchAccountGapTo('),
      `${f}: a campaign column may not move the account pace — the column defaults to 600 in Postgres and no screen sets it`,
    );
    is(
      !code.includes('matchAccountGapTo'),
      `${f}: and the import is gone with it, so the next person does not find it in scope and re-wire it`,
    );
  }

  /* (2) AND THE DISCIPLINE INSIDE IT IS NOT QUIETLY DELETED WITH THE CALL
         SITES. matchAccountGapTo still exists, the tuner still calls it, and
         it still refuses to RAISE — the invariant campaign-floor.test.ts:102
         also holds, re-asserted here so that removing the callers cannot be
         mistaken for removing the rule. */
  const client = strip(readFileSync(new URL('../../src/lib/social/client.ts', import.meta.url), 'utf8'));
  const floorFn = client.slice(client.indexOf('export async function matchAccountGapTo'));
  is(
    /if \(wasSeconds <= want\) return \{ changed: false/.test(floorFn.slice(0, 1200)),
    'matchAccountGapTo still only ever LOWERS the account pace, never raises it',
  );

  /* (3) AND THE ONE PLACE A HUMAN TYPES A GAP STILL MOVES THE FLOOR WITH IT.
         "תשנה גם את המרווח המינימלי הגלובלי ברגע שמשנים את הזמנים בקמפיין" —
         honoured here, where it is a choice rather than a side effect. */
  const tuner = strip(readFileSync(new URL('../../src/components/social/QueueTunerSheet.tsx', import.meta.url), 'utf8'));
  is(tuner.includes('matchAccountGapTo('), 'the tuner still matches the account floor to the gap the owner just typed');
}

console.log(`account gap tests OK — ${checks} assertions`);
