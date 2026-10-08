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

  /* ...and it is called from BOTH screens that can change a campaign's gap.
     One of the two left behind is the version of this bug that is hardest to
     find: the feature works on the dashboard and silently does not on the
     campaigns screen. */
  for (const [where, src] of [
    ['the dashboard', 'src/app/social/page.tsx'],
    ['the campaigns screen', 'src/app/social/campaigns/page.tsx'],
  ] as const) {
    const page = readFileSync(new URL(`../../${src}`, import.meta.url), 'utf8');
    is(/await matchAccountGapTo\(next\.gapSeconds\)/.test(page), `${where} lowers the floor when the campaign's gap changes`);
    is(
      page.indexOf('await saveCampaign(') < page.indexOf('await matchAccountGapTo('),
      `${where} does it AFTER the campaign is saved — a failed save must not still have loosened the whole account`,
    );
    is(/זה חל על כל הסבבים/.test(page), `${where} tells the owner the change reaches every round, not only the one he was editing`);
  }

  /* And the panel says so BEFORE the write, where the choice is being made. */
  const panel = readFileSync(new URL('../../src/components/social/CampaignSchedulePanel.tsx', import.meta.url), 'utf8');
  is(/accountFloorSeconds\?: number;/.test(panel), 'the panel can be told what the account floor currently is');
  is(
    /accountFloorSeconds > schedule\.gapSeconds/.test(panel),
    'and says something only while the two genuinely disagree — so the line clears itself once the write lands instead of standing as a permanent warning about nothing',
  );
  is(/לכל הסבבים/.test(panel), 'in words that name the scope');
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
 * There are three writers of this pair in the product. All three are checked.
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

  const settings = readFileSync(new URL('../../src/app/social/settings/page.tsx', import.meta.url), 'utf8');
  is(/minGapSeconds: gapFields\.minGapSeconds/.test(settings), 'the settings screen writes the seconds too');
  is(/groupMinGapSeconds: gapFields\.groupMinGapSeconds/.test(settings), 'both halves there as well');

  /* The third writer is matchAccountGapTo, already checked above — it is the
     one that writes seconds FIRST and therefore the one that arms this trap
     for the other two. */
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

console.log(`account gap tests OK — ${checks} assertions`);
