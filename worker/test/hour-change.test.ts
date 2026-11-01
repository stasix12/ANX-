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
  const build = "for (const day of schedule.days) weekly[String(day)] = [schedule.start];";
  eq(
    (client.match(new RegExp(build.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'g')) ?? []).length,
    2,
    'the weekly plan must be built by the SAME expression in syncWeeklyHours and setCampaignRepeat — two copies that drift are two different publishing hours for one round',
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
  /* And the original guard must survive: with the switch ON, setCampaignRepeat
     does the full job, including creating a row from the launch's group list. */
  is(
    /if \(repeat\.enabled\) \{[\s\S]{0,200}await setCampaignRepeat\(campaign, repeat, next\)/.test(page),
    `${name} must still re-arm through setCampaignRepeat when the switch is ON — it creates the row a never-repeated round has none of`,
  );
  is(
    page.indexOf('syncWeeklyHours(campaign.id, next)') < page.indexOf('setCampaignRepeat(campaign, repeat, next)'),
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
