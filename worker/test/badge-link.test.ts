/**
 * THE BADGE IS A DOOR NOW, AND IT OPENS ON THE ROWS IT NAMED.
 *
 * "בריבוע של דורש טיפול / הסתיים עם כשלים אני רוצה שיהיה ניתן ללחוץ על זה
 *  וזה יביא אותי לעמוד של הכשלים."
 *
 * The badge was the only place in the product that knew a round had ended
 * badly, and it was a dead label: the owner read "הסתיים עם כשלים · 11 נכשלו"
 * and then went hunting for those eleven rows through a history list of every
 * round he has ever run, with the range filter in his way.
 *
 * TWO THINGS HAVE TO HOLD, and the second is the one worth a test file.
 *
 *   1. The link has to lead where the WORDS say. runBadge() chose the
 *      sentence from `progress.failed`; if a screen re-derived the filter
 *      from somewhere else, a badge reading "הסתיים עם כשלים" could open a
 *      list of skipped rows. So the bucket is returned by the same function
 *      that chose the label, and the branches are exercised here.
 *
 *   2. A badge that leads NOWHERE must stay a label. A paused account, a
 *      disconnected PC, a partial count — pressing any of those would open an
 *      empty list, which is worse than a label, because an empty list reads
 *      as "nothing failed".
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { runBadge, runBadgeHref } from '../../src/lib/social/campaign';
import { EMPTY_PROGRESS, type CampaignProgress } from '../../src/lib/social/types';

let checks = 0;
const is = (cond: boolean, what: string) => {
  checks += 1;
  assert.ok(cond, what);
};
const eq = <T>(got: T, want: T, what: string) => {
  checks += 1;
  assert.deepEqual(got, want, `${what} — got ${JSON.stringify(got)}`);
};

const progress = (p: Partial<CampaignProgress>): CampaignProgress => ({ ...EMPTY_PROGRESS, ...p });
const src = (rel: string) => readFileSync(new URL(rel, import.meta.url), 'utf8');
const history = src('../../src/app/social/history/page.tsx');

/* ───────────────── 1. the label and the bucket agree, branch by branch ──── */
{
  /* The owner's first screenshot: 53 rows, 11 of them failed, run over. */
  const endedBadly = runBadge({ state: 'completed', progress: progress({ total: 53, published: 41, skipped: 1, failed: 11, finished: 53 }) });
  eq(endedBadly.label, 'הסתיים עם כשלים', 'the ended-with-failures label changed');
  eq(endedBadly.rows, 'failed', 'and it must open the failures, not the one skipped row beside them');

  /* His second: a running round with rows waiting on him. */
  const needsHim = runBadge({ state: 'needs_attention', progress: progress({ total: 205, published: 169, skipped: 2, failed: 33, manual: 1 }) });
  eq(needsHim.label, 'דורש טיפול', 'the needs-a-person label changed');
  eq(needsHim.rows, 'manual', 'דורש טיפול names the rows waiting on HIM — not the failures, which are not what it is asking for');

  /* Skips with no failures say so, and open the skips. */
  const skipped = runBadge({ state: 'completed', progress: progress({ total: 10, published: 7, skipped: 3, finished: 10 }) });
  eq(skipped.label, 'הסתיים — חלק דולגו', 'the some-skipped label changed');
  eq(skipped.rows, 'skipped', 'and it must open the skipped rows');

  const nothingOut = runBadge({ state: 'completed', progress: progress({ total: 4, skipped: 4, finished: 4 }) });
  eq(nothingOut.label, 'הסתיים בלי פרסומים', 'the nothing-published label changed');
  eq(nothingOut.rows, 'skipped', 'a round that published nothing opens whatever stopped it');

  /* Decided before it ever published: whichever decided it. */
  const stillborn = runBadge({ state: 'not_started', progress: progress({ total: 28, failed: 5, finished: 5 }) });
  eq(stillborn.label, 'התחיל — טרם פורסם', 'the started-but-nothing-out label changed');
  eq(stillborn.rows, 'failed', 'five failures are what there is to look at');

  /* ── and the three that must NOT be pressable ── */
  const clean = runBadge({ state: 'completed', progress: progress({ total: 9, published: 9, finished: 9 }) });
  eq(clean.label, 'הושלם', 'a clean finish changed its label');
  eq(clean.rows, null, 'a round that published everything must not offer a list of nothing');

  eq(runBadge({ state: 'running', progress: progress({ total: 9, published: 2, running: 1 }) }).rows, null, 'a running round is about the run, not about a set of rows');

  const held = runBadge({ state: 'running', progress: progress({ total: 9 }) }, { globalPaused: true });
  eq(held.rows, null, 'everything is held — there is no list of rows that explains it');

  const noPc = runBadge({ state: 'running', progress: progress({ total: 9, failed: 2 }) }, { workerOnline: false });
  eq(noPc.label, 'לא רץ — המחשב לא מחובר', 'the offline-PC label changed');
  eq(noPc.rows, null, 'the PC being off is not a row anyone can open');

  const partial = runBadge({ state: 'completed', truncated: true, progress: progress({ total: 500, published: 500, finished: 500 }) });
  eq(partial.label, 'ספירה חלקית', 'the partial-count label changed');
  eq(partial.rows, null, 'a count that is of a SLICE may not promise a list of what it counted');
}

/* ───────────────────────── 2. the address it builds ────────────────────── */
{
  const badge = runBadge({ state: 'completed', progress: progress({ total: 53, published: 41, failed: 11, skipped: 1, finished: 53 }) });
  eq(
    runBadgeHref(badge, 'c-123'),
    '/social/history?status=failed&campaign=c-123',
    'the badge no longer leads to this run’s failures on the history screen',
  );
  eq(runBadgeHref(runBadge({ state: 'running', progress: progress({ total: 2 }) }), 'c-123'), null, 'a badge with no rows must produce no address at all');

  /* An id is a uuid today, but the address must survive one that is not. */
  is(runBadgeHref(badge, 'a b&c')?.includes('campaign=a%20b%26c') === true, 'the campaign id is no longer escaped into the query string');

  /* Every bucket it can name has to be one the history screen really offers. */
  for (const bucket of ['failed', 'skipped', 'manual']) {
    is(new RegExp(`value: '${bucket}'`).test(history), `/social/history has no '${bucket}' filter any more — the badge would open an unfiltered list`);
  }
}

/* ─────────────────── 3. the screens, where the wiring lives ─────────────── */
{
  const hero = src('../../src/components/social/LiveCampaignHero.tsx');
  is(/href=\{runBadgeHref\(badge, campaign\.id\)\}/.test(hero), 'the dashboard badge no longer asks runBadgeHref where it leads');
  is(/if \(!href\) return pill;/.test(hero), 'a badge with nowhere to go must render exactly as it always did');
  is(
    /<Link href=\{href\}[\s\S]{0,160}className="flex min-h-11 shrink-0 items-center">/.test(hero),
    'the badge link lost its 44px row — the measured suite fails any control under the product’s 40px floor',
  );
  /* The pill's own box is untouched: this was a behaviour change, not a
     design one, and the owner's rule on that is explicit. */
  is(
    /inline-flex shrink-0 items-center gap-1\.5 rounded-full px-3 py-1 text-xs font-bold/.test(hero),
    'the pill’s own styling changed — making it pressable may not restyle it',
  );

  const client = src('../../src/lib/social/client.ts');
  const listQueue = client.slice(client.indexOf('export async function listQueue'), client.indexOf('export async function listQueue') + 2200);
  is(/campaignId\?: string;/.test(listQueue), 'listQueue cannot narrow to one round any more');
  is(/if \(opts\.campaignId\) q = q\.eq\('campaign_id', opts\.campaignId\);/.test(listQueue), 'and the filter is not applied to the query');

  is(/useState<string>\(params\.get\('campaign'\) \?\? ''\)/.test(history), 'the history screen ignores the campaign the badge sent it to');
  is(/campaignId: onlyCampaign \|\| undefined/.test(history), 'and does not pass it to the read');
  is(/מוצג רק הסבב/.test(history), 'a filter the owner cannot see is a screen that lies about what it is showing');
  is(/onClick=\{\(\) => setOnlyCampaign\(''\)\}/.test(history), 'and he must be able to clear it without going back');
  is(/\[group, range, since, until, onlyCampaign\]/.test(history), 'the read is not re-run when the round filter changes');
}

console.log(`badge-link OK — ${checks} assertions`);
