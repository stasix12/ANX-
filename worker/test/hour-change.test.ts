/**
 * THE HOUR HE JUST SET HAS TO REACH THE ROW THAT PUBLISHES.
 *
 * "אחרי שאני מחזיר לפעילות קמפיין — אם שעה שנקבעה לו בתוך הקמפיין, ואז אני
 *  רוצה לשנות את השעה ב'ערוך מועד' מהדף הראשי, הוא לא מחליף לי את השעה
 *  לתזמון שקבעתי — הוא משאיר את אותו השעה שהיה רשום בקמפיין."
 *
 * TWO RECORDS FOR ONE THING, which is the same root as the groups that reverted
 * overnight. The campaign row holds `schedule_start`. The row the PLANNER works
 * from is a social_schedules row with its own `weekly` plan. The hour editor
 * wrote the first and re-armed the second only `if (repeat.enabled)` — the
 * CHZARA switch.
 *
 * That guard is right about one thing and wrong about another. Right: a campaign
 * that does not repeat has no weekly row to ARM, and writing one would turn a
 * change of hours into a recurrence nobody asked for. Wrong: it assumed there is
 * then no weekly row AT ALL — and SchedulePicker's scheduleDraftToInput builds
 * `mode: 'weekly'` straight from a launch, which createSchedule makes ACTIVE
 * without touching the campaign's repeat columns. In that state the campaign's
 * hour is a second, ignored record, and the planner keeps using the hour he
 * replaced, for ever, while every screen shows the one he chose.
 *
 * AND THE SECOND MECHANISM, which is why he saw nothing move at all:
 * rescheduleCampaignQueue returns immediately when the window switch is off. It
 * is deliberate — there is no window to roll rows into — but it also swallowed
 * "he SET an hour", which is a request, not a switch being turned off.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = <T>(got: T, want: T, what: string) => {
  checks += 1;
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
};

const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const code = (text: string) => text.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
const client = src('../../src/lib/social/client.ts');
const sync = client.slice(client.indexOf('export async function syncWeeklyHours'), client.indexOf('export async function setCampaignRepeat('));

/* ──────────────── 1. the sync exists and is narrow ─────────────────────── */
{
  is(sync.length > 600, 'syncWeeklyHours is missing — an active weekly row keeps publishing at the hour the owner replaced, and the campaign column he edited governs nothing');

  is(
    /\.eq\('mode', 'weekly'\)\.eq\('active', true\)/.test(sync),
    "the sync must touch only ACTIVE WEEKLY rows — a retired row is the record of what was SENT, and a 'now'/'once'/'drip' row is the owner's own one-off",
  );
  is(/\.update\(\{ weekly \}\)/.test(sync), 'it must write the hours and nothing else');
  is(!/active: true/.test(code(sync)), 'it must never ACTIVATE a row — that is how a change of hours becomes a recurrence nobody asked for');
  is(!/repeatColumns/.test(code(sync)), 'and it must never touch the repeat switch');
  is(!/\.insert\(/.test(code(sync)), 'nor create a schedule row');
}

/* ─── 2. the arithmetic cannot drift from the function it mirrors ───────── */
{
  /*
   * IT USED TO COUNT TWO IDENTICAL COPIES. That was the best available check
   * while the arithmetic was written out inline in both writers: if the two
   * expressions matched character for character they could not disagree about
   * the hour.
   *
   * They are now ONE FUNCTION, weeklyPlanFor(), which is the property that
   * guard was approximating — so this asserts the stronger thing directly:
   * both writers call it, and NEITHER builds a plan of its own. Two copies
   * that drift are two different publishing hours for one round, and with
   * סבבים ביום they would also be two different NUMBERS of rounds a day.
   */
  /* `weeklyPlanFor(schedule)` — one argument now. סבבים ביום was removed
     ("למחוק גם את הסבבים זה מסוכן"), so the builder no longer takes rounds;
     the drift this counts against is unchanged, and so is the count. */
  eq(
    (client.match(/weeklyPlanFor\(schedule\)/g) ?? []).length,
    2,
    'syncWeeklyHours and setCampaignRepeat must both build the weekly plan through weeklyPlanFor — two copies that drift are two different publishing hours for one round',
  );
  is(
    !/weekly\[String\(day\)\] = \[/.test(client),
    'a writer has gone back to building the weekly plan inline, beside the shared builder — which is exactly the drift this guard exists to prevent',
  );
  is(/one occasion per chosen day, at the window's opening hour/i.test(client), 'and the rule must stay written down beside it');
}

/* ───────── 3. it refuses to write a plan that disarms the round ────────── */
{
  is(
    /if \(!schedule\.days\.length\) return \{ rearmed: 0, skippedNoDay: true \};/.test(sync),
    'with no day chosen the plan is `{}` — an active row with no occasion, which plans nothing for ever. Writing that would silently disarm a round in the middle of a change of hours',
  );
  is(fnOrderOk(), 'the dayless check must come BEFORE any write');
  is(/const stale = rows\.filter\(\(r\) => JSON\.stringify\(r\.weekly \?\? \{\}\) !== wanted\)/.test(sync), 'a row that already holds the right hours must not be written at all');
}
function fnOrderOk(): boolean {
  return sync.indexOf('!schedule.days.length') < sync.indexOf(".update({ weekly })");
}

/* ───────── 4. both editors call it on the path that was silent ─────────── */
for (const [name, rel] of [
  ['the dashboard', '../../src/app/social/page.tsx'],
  ['/social/campaigns', '../../src/app/social/campaigns/page.tsx'],
] as const) {
  const page = code(src(rel));
  is(
    /if \(!repeat\.enabled\) \{[\s\S]{0,400}await syncWeeklyHours\(campaign\.id, next\)/.test(page),
    `${name} must sync the active weekly row when the repeat switch is OFF — that is exactly the state his bug lives in`,
  );
  /*
   * THE THIRD ARGUMENT IS GONE, AND SO IS WHAT IT PROTECTED.
   *
   * It used to be pinned here rather than skipped over with a wildcard:
   * syncWeeklyHours REPLACES social_schedules.weekly, and calling it without
   * the campaign's extra rounds deleted every סבב the owner had added on the
   * next unrelated save of the hour. There are no extra rounds any more —
   * "למחוק גם את הסבבים זה מסוכן" — so the pin inverts: a screen that goes
   * back to reading them is a screen that can put extra hours in the plan
   * again, with no control on any card to show it.
   */
  is(
    !/readRounds\(campaign\)/.test(page),
    `${name} is reading the stored rounds again — that is the path the extra publishing hours came back through`,
  );

  /* And the original guard must survive: with the switch ON, setCampaignRepeat
     does the full job, including creating a row from the launch's group list. */
  is(
    /if \(repeat\.enabled\) \{[\s\S]{0,200}await setCampaignRepeat\(campaign, repeat, next[^)]*\)/.test(page),
    `${name} must still re-arm through setCampaignRepeat when the switch is ON — it creates the row a never-repeated round has none of`,
  );
  is(
    page.indexOf('syncWeeklyHours(campaign.id, next)') < page.indexOf('setCampaignRepeat(campaign, repeat, next'),
    `${name}: the two branches must be exclusive, not both writing the same row`,
  );
}

/* ───────── 5. a stored hour that governs nothing says so ───────────────── */
for (const [name, rel] of [
  ['the dashboard', '../../src/app/social/page.tsx'],
  ['/social/campaigns', '../../src/app/social/campaigns/page.tsx'],
] as const) {
  const page = src(rel);
  is(/השעה נשמרה, אבל מתג התזמון של הסבב כבוי/.test(page), `${name}: setting an hour while the window switch is off moves nothing, and must say so rather than appear to work`);
  /* Not when the switch itself was the change — turning it off is deliberate
     and does not need the sentence. */
  is(/next\.enabled === was\.enabled && windowChanged/.test(page), `${name}: the sentence must be conditioned on the switch NOT having changed, or it fires every time the owner turns it off on purpose`);
  is(
    /next\.start !== was\.start \|\| next\.gapSeconds !== was\.gapSeconds \|\| next\.days\.join\(','\) !== was\.days\.join\(','\)/.test(page),
    `${name}: and on the window content actually having changed`,
  );
  is(/const was = readSchedule\(campaign\);/.test(page), `${name}: the comparison must be against the STORED row, which is the only thing that knows what changed`);
}

/* ───────── 6. and the early return it explains is still there ──────────── */
{
  const reschedule = client.slice(client.indexOf('export async function rescheduleCampaignQueue'), client.indexOf('export async function rescheduleCampaignQueue') + 1200);
  is(
    /if \(!schedule\.enabled\) return \{ moved: 0, waiting: 0, capped: false \};/.test(reschedule),
    'the early return must stay: re-spacing a queue because the owner turned a switch OFF is a change he did not ask for. What was missing is the sentence, not the behaviour',
  );
}

console.log(`hour-change OK — ${checks} assertions`);
