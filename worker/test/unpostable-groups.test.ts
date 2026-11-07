/*
 * ───────── THE GROUPS THERE IS NO POINT PUBLISHING TO ─────────────────────
 *
 * "תוסיף קטגוריה חדשה בקבוצות של הקבוצות שלא ניתן לפרסם בהם ותציע לי בתוך
 *  הקטגוריה הזאת גם למחוק אותם." — 07.11.2026, after he went and checked:
 * "באמת לא ניתן לפרסם בקבוצות האלה זה קבוצות של מכירת פריטים".
 *
 * WHY A FILTER AND NOT A LABEL. `category` is a free-text field the owner
 * fills in himself, and a group can only carry one — writing "לא ניתן לפרסם"
 * into it would collide with "דוברי רוסית" on the 54 groups that have it, and
 * would go stale the moment a group started working. This is a derived view:
 * the rule is evaluated on every render from the two columns that reach the
 * screen, so it cannot be wrong about the present.
 *
 * THE RULE IS THE NARROW ONE, AND THAT IS THE WHOLE RISK HERE. Measured over
 * his own database: 2,446 of the product's 2,480 failures ever are the one
 * sentence "לא מצאתי את תיבת כתבו משהו… בקבוצה", spread over 143 groups —
 * which split three ways by whether the group has EVER published:
 *
 *     never published          53 groups   1,424 failures   ← the real thing
 *     published once, stopped  47 groups     929 failures   ← a different story
 *     published in 3 days      43 groups      93 failures   ← FINE, just slow
 *
 * The last row is why this file exists. Those 43 groups work; the box is
 * simply not always rendered in time. A filter that swept up "anything that
 * failed" would have offered to delete 43 working groups to address 4% of the
 * problem — and the card next to it offers DELETE, so the cost of being wide
 * is permanent.
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { cannotPublishTo } from '../../src/lib/social/status';
import type { SocialTarget } from '../../src/lib/social/types';

let checks = 0;
const is = (ok: boolean, claim: string) => {
  checks += 1;
  assert.ok(ok, claim);
};

const group = (over: Partial<SocialTarget>): SocialTarget =>
  ({
    id: 'g', account_id: 'a', channel: 'facebook_group', external_id: '1', name: 'קבוצה',
    url: 'https://www.facebook.com/groups/1', tasks: [], permission_status: 'browser',
    can_api_publish: false, enabled: true, notes: '', last_synced_at: null,
    created_at: '2026-10-01T00:00:00Z', updated_at: '2026-11-07T00:00:00Z',
    last_published_at: null, last_status: '', last_error: '', image_url: null,
    city: '', favorite: false, category: '', tenant_id: 't', audience: 'unknown',
    ...over,
  }) as unknown as SocialTarget;

/* ── 1. the three shapes the measurement found ──────────────────────────── */
is(
  cannotPublishTo(group({ last_published_at: null, last_status: 'failed' })),
  'never published and the last attempt failed — this is the selling group, and the only one that qualifies',
);
is(
  !cannotPublishTo(group({ last_published_at: '2026-11-07T10:00:00Z', last_status: 'failed' })),
  'a group that published TODAY and also fails sometimes is not in here — 43 of his 143 are exactly this, and they work',
);
is(
  !cannotPublishTo(group({ last_published_at: '2026-09-01T10:00:00Z', last_status: 'failed' })),
  'and neither is one that published two months ago and stopped — 47 of his are, and the reason is a different one',
);

/* ── 2. 'needs_attention' is a PERSON's problem, not the group's ────────── */
is(
  !cannotPublishTo(group({ last_published_at: null, last_status: 'needs_attention' })),
  'an expired login is not the group refusing — social-worker.ts:2871 writes needs_attention for a session Facebook wants a human for',
);
is(
  !cannotPublishTo(group({ last_published_at: null, last_status: 'skipped' })),
  "and 'skipped' is the Pages case (social-worker.ts:3024), which the same group may publish fine as a person",
);
/* 'left' is already switched off by the worker, with its reason written on the
   row — it needs no card to tell the owner about it. */
is(
  !cannotPublishTo(group({ last_published_at: null, last_status: 'left', enabled: false })),
  "and 'left' is already handled: the worker switched it off and said why",
);

/* ── 3. a group nothing has been tried on yet is not a verdict ──────────── */
is(
  !cannotPublishTo(group({ last_published_at: null, last_status: '' })),
  'a group just added, never attempted, is not "cannot publish" — it is "not yet tried"',
);

/* ── 4. the shape the live database actually holds ──────────────────────── */
{
  /*
   * His 600 rows, by last_status: published 372, needs_attention 126,
   * failed 97, left 4, empty 1 — and 66 that never published. Running the
   * rule over that distribution is how the 52 was arrived at, so the numbers
   * are reproduced here rather than asserted from memory.
   */
  const live = [
    ...Array.from({ length: 52 }, () => group({ last_published_at: null, last_status: 'failed' })),
    ...Array.from({ length: 12 }, () => group({ last_published_at: null, last_status: 'needs_attention' })),
    ...Array.from({ length: 1 }, () => group({ last_published_at: null, last_status: 'left', enabled: false })),
    ...Array.from({ length: 1 }, () => group({ last_published_at: null, last_status: '' })),
    ...Array.from({ length: 45 }, () => group({ last_published_at: '2026-09-01T00:00:00Z', last_status: 'failed' })),
    ...Array.from({ length: 489 }, () => group({ last_published_at: '2026-11-07T00:00:00Z', last_status: 'published' })),
  ];
  is(live.length === 600, 'the fixture is his 600 groups');
  is(live.filter(cannotPublishTo).length === 52, `the rule picks 52 of the 600 — got ${live.filter(cannotPublishTo).length}`);
  is(live.filter((g) => !g.last_published_at).length === 66, 'out of 66 that never published, so the other 14 are deliberately left out');
}

/* ── 5. THE SCREEN: the chip, the card, and what each button touches ────── */
{
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const page = strip(readFileSync('src/app/social/groups/page.tsx', 'utf8'));

  is(/type StatusFilter = .*\| 'blocked';/.test(page), 'the category is a filter value beside the others, not a new concept');
  is(/if \(status === 'blocked'\) return cannotPublishTo\(g\);/.test(page), 'and the filter asks the one function, so the chip and the card cannot disagree');
  is(/const blocked = useMemo\(\(\) => all\.filter\(cannotPublishTo\), \[all\]\)/.test(page), 'the list is computed once');
  is(/blocked: blocked\.length,/.test(page), "and the chip's count reads that same list rather than filtering again");
  is(/label: 'לא ניתן לפרסם'/.test(page), 'the chip is named in the owner’s words');
  /* A chip reading "לא ניתן לפרסם 0" is a worry with nothing behind it. */
  is(/statusCounts\.blocked > 0/.test(page), 'and it only appears when there is something in it');

  /* THE TWO BUTTONS, AND WHICH ROWS EACH ONE TOUCHES. */
  /*
   * BOTH BUTTONS ACT ON THE WHOLE LIST, and the pause one did not at first.
   * It was scoped to the groups still switched ON, which reads sensible and
   * leaves no way to repair the ones switched off BEFORE the switch learned
   * to clear the queue — the 21 rows he was looking at. pauseTargets() is
   * idempotent precisely so this button can be the repair path.
   */
  is(/pauseTargets\(blocked\.map\(\(g\) => g\.id\)\)/.test(page), 'switching off acts on the whole list, so it also clears a queue left behind by an earlier pause');
  is(!/כבר מושהות ולא ייגעו/.test(page), 'and the card no longer claims it will not touch the already-paused ones — it does, to clear their queue');
  is(/bulkDeleteTargets\(blocked\.map\(\(g\) => g\.id\)\)/.test(page), 'and delete acts on the whole list, as he asked for');
  is(!/disabled=\{blockedOn\.length === 0\}/.test(page), 'and the pause button is not disabled when they are already off — there may still be rows to cancel');

  /* DELETE GOES THROUGH THE SAME WARNING THE BULK BAR USES. It takes the
     group's whole publication history with it — which is also the only
     evidence of why it was in this category. */
  const card = page.slice(page.indexOf("busy === 'blocked-del'"));
  is(/confirm\.ask\(\{/.test(card.slice(0, 600)), 'delete asks first');
  is(/body: DELETE_GROUP_WARNING,/.test(card.slice(0, 600)), 'with the warning this screen already shows for a delete');
  is(/danger: true,/.test(card.slice(0, 600)), 'marked as destructive');
  is(/variant="danger"/.test(page.slice(page.indexOf('blocked-del') - 400, page.indexOf('blocked-del'))), 'and the button itself is the danger one, beside a secondary "השהה"');

  /* AND IT TAKES HIM TO THE LIST. He verified these by hand once; the card's
     job is to get him to the filtered list, not to be trusted instead of it. */
  /*
   * ── AND IT HAS TO MOVE SOMETHING ON SCREEN ─────────────────────────
   *
   * "שאני לוחץ כאן הצג אותן הוא לא פותח כלום" — shipped exactly like
   * that, and the filter was working the whole time. The card sits above a
   * search box and four chip rows; the list it filters is most of a phone
   * screen below. Setting state that changes something off-screen is
   * indistinguishable from a dead link.
   *
   * Two things were missing and both are pinned: the page has to scroll to
   * the results, and the chip the press selects has to be somewhere the owner
   * can see — this row scrolls sideways and SegmentedControl does not scroll
   * itself to the selected option, so a chip placed last was off the right
   * edge of the phone.
   */
  is(/const showBlocked = useCallback\(\(\) => \{/.test(page), 'the link is one function, not four setters inline');
  is(/setStatus\('blocked'\);/.test(page), 'it selects the category');
  is(/setQuery\(''\);/.test(page) && /setCityFilter\(''\);/.test(page) && /setCategoryFilter\(''\);/.test(page), 'and clears the other filters, so the list it opens is the list it counted');
  is(/resultsRef\.current\?\.scrollIntoView\(\{ behavior: 'smooth', block: 'start' \}\)/.test(page), 'AND it scrolls the results into view — without this the press did nothing the owner could see');
  is(/requestAnimationFrame\(\(\) =>/.test(page), 'after the state has landed, so there is a list at its new length to scroll to');
  is(/<div ref=\{resultsRef\}/.test(page), 'and the anchor sits at the top of the results');
  is(/onClick=\{showBlocked\}/.test(page), 'the card\u2019s link calls it');
  /* THE CHIP IS IN REACH, not past the right edge of a sideways row. */
  {
    const row = page.slice(page.indexOf("value: 'all', label:"), page.indexOf("value: 'paused', label:"));
    is(/value: 'blocked'/.test(row), 'the chip sits between "הכל" and "מושהות", not at the end of a row that scrolls off the phone');
  }
}

/* ── 6. SWITCHING A GROUP OFF HAS TO MEAN ALL THREE THINGS ─────────── */
{
  /*
   * "השהיתי עכשיו את הקבוצות האלה, למה זה לא ירד במספר ב״ממתינים היום״" ·
   * "על תציע לי פתרון חלקי — מהיום כל קבוצה שאני משהה / מסיר זה מוריד אותן
   *  אוטומטית מהספירה ומהפרסום והמספרים צריכים להתעדכן באותו הרגע."
   *
   * Measured at the moment he asked: 284 rows waiting for today, 21 of them
   * in the 21 groups he had switched off ninety seconds earlier. The switch
   * stopped the planner adding more and rules.ts:252 would refuse each row at
   * claim time — but the rows already queued stayed, were counted all day,
   * and would each have cost a claim and a "דולג" line that evening.
   *
   * THE TWO HALVES ONLY WORK TOGETHER, and that is the thing to protect:
   * cancelling a paused group's rows frees it from targetsAlreadyWaiting, so
   * without the planner also skipping it the very next pass queues it again
   * and the number bounces. Either half alone is worse than neither.
   */
  const strip = (src: string) => src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  const client = strip(readFileSync('src/lib/social/client.ts', 'utf8'));
  const plan = strip(readFileSync('src/lib/social/plan.ts', 'utf8'));
  const page = strip(readFileSync('src/app/social/groups/page.tsx', 'utf8'));

  /* ── half one: the switch clears the queue ── */
  const pause = client.slice(client.indexOf('export async function pauseTargets'));
  const body = pause.slice(0, pause.indexOf('\n}\n'));
  is(/export async function pauseTargets\(ids: string\[\]\)/.test(client), 'switching off is one function, so every path does the same thing');
  is(/\.update\(\{ enabled: false \}\)\.in\('id', ids\)/.test(body), 'it switches the groups off');
  is(/status: 'skipped', step: '', skip_reason: 'הקבוצה הושהתה'/.test(body), 'and cancels their waiting publications, with a reason a person can read');
  /* THE TWO EXCLUSIONS, the same ones removeTargetFromQueue carries. */
  is(/\.neq\('step', MAYBE_LIVE_STEP\)/.test(body), 'never a row that may already be live — cancelling it would hide a publication that happened');
  is(/\.in\('status', CANCELLABLE\)/.test(body), 'and never history or a row in flight');
  /* A PAUSE IS NOT A REMOVAL: the group stays in the round so switching it
     back on needs nothing re-added by hand. */
  is(!/unplanTarget/.test(body), 'and it does NOT take the group out of the round — that is what removing does, and a pause is reversible');

  /* ── half two: the planner stops queueing it ── */
  const live = plan.slice(plan.indexOf('export async function liveTargetIds'));
  const liveBody = live.slice(0, live.indexOf('\n}\n'));
  is(/for \(const row of rows\) if \(row\.enabled !== false\) live\.add\(row\.id\);/.test(liveBody), 'the planner leaves a switched-off group out of the plan');
  /*
   * AND IT FILTERS THE ROWS THAT CAME BACK, NOT THE QUERY. A WHERE clause
   * would make a chunk whose hundred groups are all disabled return empty —
   * indistinguishable from the read that taught nothing, whose branch adds
   * every id back as live. That is the bug this shape avoids.
   */
  is(/\.select\('id, enabled'\)\.in\('id', chunk\)/.test(liveBody), 'by reading the column, not by filtering in SQL');
  is(!/\.eq\('enabled', true\)/.test(liveBody), 'because a chunk that is entirely disabled must not look like a failed read');
  is(/if \(error \|\| rows\.length === 0\) \{/.test(liveBody), 'and the fail-open still means exactly what it meant');
  is(!/row\.enabled === true/.test(liveBody), 'a column the read did not carry is not a switch the owner turned off');

  /* ── and every path that pauses goes through it ── */
  is(!/bulkUpdateTargets\(selected, \{ enabled: false \}\)/.test(page), 'the bulk bar no longer switches off without clearing the queue');
  is(/pauseTargets\(selected\)/.test(page), 'it calls the one function');
  is(/pauseTargets\(\[g\.id\]\)/.test(page), 'so does the single-group menu');
  is(/pauseTargets\(blocked\.map\(\(g\) => g\.id\)\)/.test(page), 'and so does the card — over the WHOLE list, which is the repair path for groups switched off before this existed');
  /* Switching back ON is still the plain write: there is no queue to clear,
     and the planner brings the group back by itself. */
  is(/updateTarget\(g\.id, \{ enabled: true \}\)/.test(page), 'switching back on stays a plain write');
}

console.log(`unpostable groups OK — ${checks} assertions over the rule, his 600-row distribution and the screen`);
