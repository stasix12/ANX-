import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { AUDIENCE_LABEL, audienceBlock, audienceOf, suggestAudience, suggestForAll } from '../../src/lib/social/audience';
import { DEFAULT_LIMITS, type SocialTarget } from '../../src/lib/social/types';

/**
 * "רק לקבוצות שיש בהם לקוחות פוטנציאליים" — THE MARK, THE GATE, AND THE GUESS.
 *
 * WHAT IS AT STAKE. This is the first feature in the product whose whole job is
 * to STOP publications, and the owner publishes to well over a hundred groups a
 * week. Every mistake here is expensive in one of two directions and neither one
 * announces itself:
 *
 *   TOO EAGER — an unmarked group treated as a refusal, a guess written without
 *   a person's tap, a gate that fires while the switch is off. The round comes
 *   out at a fraction of its size, every skip has a sensible-looking reason, and
 *   the owner discovers it from the phone not ringing.
 *
 *   TOO LOOSE — one path that forgot to ask. The picker hides the group, the
 *   planner skips it, and then a queue row written last week publishes to it
 *   anyway, which is exactly the thing he asked never to happen again.
 *
 * So the tests below are about the BOUNDARIES rather than the happy path: the
 * three states told apart, the switch off meaning off, and the suggestion
 * refusing to decide when it genuinely cannot.
 *
 *   npx tsx worker/test/audience.test.ts
 */

let checks = 0;
const is = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};

const group = (over: Partial<SocialTarget> = {}): SocialTarget =>
  ({
    id: 'g1',
    account_id: null,
    channel: 'facebook_group',
    external_id: '123',
    name: 'קבוצה',
    url: 'https://www.facebook.com/groups/123',
    tasks: [],
    permission_status: 'browser',
    can_api_publish: false,
    enabled: true,
    notes: '',
    last_synced_at: null,
    created_at: '2026-01-01T00:00:00.000Z',
    ...over,
  }) as SocialTarget;

const ON = { ...DEFAULT_LIMITS, customersOnly: true };
const OFF = { ...DEFAULT_LIMITS, customersOnly: false };

/* --------------------------------------------- 1. the three states are three */
{
  eq(audienceOf(group()), 'unknown', 'a group nobody has marked is "unknown"');
  eq(audienceOf(group({ audience: 'customers' })), 'customers', 'and a marked one is what it was marked');
  eq(audienceOf(group({ audience: 'none' })), 'none', 'both ways');
  /*
   * A VALUE THIS VERSION DOES NOT KNOW — an older row, a hand-typed word, the
   * column missing because the migration has not been run yet. It has to read as
   * "nobody has said", because the alternative is a hundred groups that look
   * like the owner rejected them.
   */
  eq(audienceOf({ audience: 'yes' } as unknown as SocialTarget), 'unknown', 'an unrecognised value is "not marked", never a refusal');
  eq(audienceOf(null), 'unknown', 'and neither is a missing target');
  is(AUDIENCE_LABEL.unknown !== AUDIENCE_LABEL.none, '"not marked" and "no customers" are not the same words on screen either');
}

/* ------------------------------------------- 2. the switch off means nothing */
{
  for (const mark of ['unknown', 'customers', 'none'] as const) {
    eq(audienceBlock(group({ audience: mark }), OFF), null, `with the switch off, a "${mark}" group publishes exactly as before`);
  }
  /*
   * AND A MISSING SETTINGS ROW IS OFF. This is the state of every installation
   * that has not opened the settings screen since the feature shipped, and a
   * gate that defaults to refusing would stop their publishing on update.
   */
  eq(audienceBlock(group(), null), null, 'no settings at all is "off", not "refuse everything"');
  eq(audienceBlock(group(), {} as typeof ON), null, 'and neither is a settings row written before this key existed');
  eq(DEFAULT_LIMITS.customersOnly, false, 'the shipped default is off — the owner turns it on once he has been through his list');
}

/* --------------------------------------- 3. with it on: only a marked group */
{
  eq(audienceBlock(group({ audience: 'customers' }), ON), null, 'a group marked as having customers publishes');
  const none = audienceBlock(group({ audience: 'none', name: 'דרושים ערד' }), ON);
  const unmarked = audienceBlock(group({ audience: 'unknown', name: 'יד שנייה ערד' }), ON);
  is(none && none.includes('דרושים ערד'), 'a refusal names the group, so the history line is readable on its own');
  is(unmarked, 'an unmarked group does not publish while the switch is on');
  /*
   * AND THE TWO REASONS ARE DIFFERENT SENTENCES.
   *
   * One says the owner decided this group is not worth it — the feature working.
   * The other says nobody has decided yet, which is a group waiting for him and
   * the only one of the two he can fix. One shared sentence for both would hide
   * a hundred groups quietly dropping out of his reach behind a message that
   * reads like a deliberate choice.
   */
  is(none !== unmarked, 'and "I said no" is not worded like "nobody has said yet"');
  is(unmarked?.includes('עוד לא סומנה'), 'the unmarked one says so, and says what to do about it');
}

/* ------------------------------ 4. it is a groups switch, so groups only */
{
  eq(
    audienceBlock(group({ channel: 'instagram', audience: 'unknown' }), ON),
    null,
    'a target that is not a group is untouched — the switch never mentioned it, so it must not switch it off',
  );
  is(audienceBlock(group({ channel: 'facebook_group_manual' }), ON), 'a group published by hand is still a group');
}

/* --------------------------------------------- 5. the guess, and its limits */
{
  const biz = { cities: ['ערד', 'באר שבע'] };

  const jobs = suggestAudience({ name: 'דרושים בערד – לוח עבודה' }, biz);
  eq(jobs.verdict, 'none', 'a jobs board is not a household, even in a city the owner works in');
  is(jobs.why.includes('דרושים'), 'and the reason says which kind of group it looks like');

  const far = suggestAudience({ name: 'יד שנייה תל אביב' }, biz);
  eq(far.verdict, 'none', 'a second-hand board in a city he does not work in is not his market');
  is(far.why.includes('תל אביב'), 'named, so he can disagree with a specific claim rather than with a verdict');

  const home = suggestAudience({ name: 'יד 2 ערד – קונים ומוכרים' }, biz);
  eq(home.verdict, 'customers', 'his own city plus a second-hand board is the case this feature exists for');

  /*
   * A CITY IN HIS REGION THAT HE DID NOT LIST. detectCity knows the whole Negev,
   * and he typed two cities. Whether he drives to Dimona is a fact about his
   * business that no list in this repository holds, so the answer is "you
   * decide" — not a guess in either direction.
   */
  const nearby = suggestAudience({ name: 'לוח מכירות דימונה' }, biz);
  eq(nearby.verdict, 'unknown', 'a city he did not list is his call, not ours');
  is(nearby.why.includes('דימונה'), 'and it says which city it is asking about');

  /*
   * A HOUSEHOLD GROUP WITH NO PLACE IN ITS NAME could be the next street or the
   * other end of the country. This is the one branch where the owner knows
   * something the suggestion cannot, and pretending otherwise is how a working
   * group gets crossed out.
   */
  eq(suggestAudience({ name: 'המלצות על בעלי מקצוע מומלצים' }, biz).verdict, 'none', 'a trades forum is a trades forum wherever it is');
  const noPlace = suggestAudience({ name: 'אמהות מבשלות בריא' }, biz);
  eq(noPlace.verdict, 'unknown', 'a household group with no place in its name is undecidable from here, and says so');

  eq(suggestAudience({ name: '' }, biz).verdict, 'unknown', 'a group with no name yet yields no guess');
  is(suggestAudience({ name: '' }, biz).why.length > 0, 'and even "we cannot tell" comes with a sentence — a mark with no reason cannot be checked');

  /*
   * NO CITIES IN SETTINGS, which is the state of a fresh installation: the
   * geography half of the guess switches off entirely. "We do not know where you
   * work" must never turn into "this group is in the wrong place".
   */
  const blind = suggestAudience({ name: 'יד שנייה תל אביב' }, { cities: [] });
  is(blind.verdict !== 'none' || !blind.why.includes('לא באזור שאתם עובדים בו'), 'with no cities configured, nothing is rejected for being far away');
  eq(suggestAudience({ name: 'דרושים תל אביב' }, { cities: [] }).verdict, 'none', 'the subject half still works — it needs no geography');
  eq(suggestAudience({ name: 'יד שנייה ערד' }, null).verdict, 'customers', 'and a group in the owner’s own region is still recognised with no settings at all');

  /* A group named after both his city and another is about both, and picking a
     half is not a suggestion's business. */
  const both = suggestAudience({ name: 'הובלות ערד תל אביב' }, biz);
  is(both.verdict !== 'none', 'a group naming his city as well as a distant one is not rejected for the distant one');
}

/* ------------------------- 6. the bulk suggestion never touches a decision */
{
  const rows = [
    { id: 'a', name: 'יד שנייה ערד', audience: 'unknown' as const },
    { id: 'b', name: 'דרושים ערד', audience: 'customers' as const },
    { id: 'c', name: 'אמהות מבשלות', audience: 'unknown' as const },
  ];
  const out = suggestForAll(rows, { cities: ['ערד'] });
  eq(out.map((r) => r.id), ['a'], 'only groups nobody has marked, and only the ones there is something to say about');
  /*
   * ROW b IS THE POINT. The guess disagrees with the owner — it reads "דרושים"
   * as a jobs board, he marked it as full of customers — and the guess loses.
   * Every row in this list becomes a write, so a guess that could overwrite a
   * decision would mean the button quietly un-marks groups he has already been
   * through.
   */
  is(!out.some((r) => r.id === 'b'), 'a group the owner already decided about is never in the list, even when the guess disagrees');
  is(out[0].why.length > 0, 'and each row carries its reason, because the sheet shows it before anything is written');
}

/* ------------------- 7. one decision, and every path actually asks for it */
/*
 * THE FAILURE THIS SECTION EXISTS FOR: the picker hides a group, the planner
 * leaves it out, and a queue row written before the switch was turned on
 * publishes to it anyway. Four places have to agree, none of them can see the
 * others, and the agreement is a single function call — so the calls are what
 * is checked.
 */
{
  const rules = readFileSync(new URL('../../src/lib/social/rules.ts', import.meta.url), 'utf8');
  is(/audienceBlock\(target, limits\)/.test(rules), 'the rules engine asks before every publication — the last gate, and the one that must hold');
  is(
    /if \(notCustomers\) return \{ action: 'skip', reason: notCustomers \};/.test(rules),
    'and a refused group is skipped rather than deferred: a daily cap means "not today", this means "not here"',
  );

  const plan = readFileSync(new URL('../../src/lib/social/plan.ts', import.meta.url), 'utf8');
  is(/async function offLimits\(/.test(plan) && /audienceBlock\(row, limits\)/.test(plan), 'the planner keeps these groups out of the queue in the first place');
  eq((plan.match(/await offLimits\(db, schedule\.target_ids\)/g) ?? []).length, 2, 'in BOTH planning paths — a drip campaign would otherwise go on publishing for days');
  is(/plan_not_customers/.test(plan), 'and it says how many it left out, so a round that shrank is explained rather than discovered');

  const picker = readFileSync(new URL('../../src/components/social/TargetPicker.tsx', import.meta.url), 'utf8');
  is(/audienceBlock\(t, limits\)/.test(picker), 'the picker cannot offer a group the engine is going to refuse');
  is(/!offLimitsIds\.has\(t\.id\)/.test(picker), 'and neither can its "select all in this city" buttons, which is how a round is really built');

  /* The three states have to exist in the database too, or the marks the screen
     writes are refused by a constraint nobody is looking at — which has already
     happened once in this product, to the worker commands. */
  const sql = readFileSync(new URL('../../supabase/social-latest.sql', import.meta.url), 'utf8');
  const check = sql.match(/check \(audience in \(([^)]*)\)\)/);
  is(check, 'the migration constrains the column');
  for (const value of ['unknown', 'customers', 'none']) {
    is(check?.[1].includes(`'${value}'`), `the database accepts '${value}' — a mark the app writes and the database refuses is a button that does nothing`);
  }
  is(/default 'unknown'/.test(sql), 'and every existing group starts unmarked rather than refused');
}

console.log(`audience tests OK — ${checks} assertions`);
