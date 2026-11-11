'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { PublicationItem } from '@/components/social/PublicationItem';
import { SocialShell } from '@/components/social/SocialShell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorState,
  Loading,
  SegmentedControl,
  SkeletonList,
  inputClass,
  useToast,
} from '@/components/social/ui';
import {
  cancelQueueItem,
  leaveGroupOnFacebook,
  listCampaigns,
  listQueue,
  listWorkers,
  pauseTargets,
  queueGates,
  retryQueueItem,
  screenshotUrl,
  waitForWorkerCommand,
  type QueueRow,
} from '@/lib/social/client';
import { projectQueue } from '@/lib/social/projection';
import { counted, startOfZonedDay, zonedToUtc } from '@/lib/social/time';
import { AUTOMATIC_WAITING_STATUSES, IN_FLIGHT_STATUSES, NEEDS_HUMAN_STATUSES } from '@/lib/social/status';
import { type QueueStatus } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';
import { InboxIcon } from '@/components/icons';

/**
 * Coarse buckets people actually filter by, built from the single
 * classification (status.ts) so that a dashboard tile showing N opens a list
 * of exactly those N rows. "ממתינים" is what moves on its own; "ידניים" is
 * what waits for a person — awaiting_confirmation belongs to the second, which
 * is where the queue list has always put it.
 */
const STATUS_GROUPS: { value: string; label: string; statuses: QueueStatus[]; hidden?: true }[] = [
  { value: '', label: 'הכל', statuses: [] },
  { value: 'published', label: 'פורסמו', statuses: ['published'] },
  /*
   * 'תקועים' before 'ממתינים', and that order is the whole point:
   * mapIncomingStatus() takes the FIRST group whose list contains the incoming
   * status, so the dashboard's "N פרסומים תקועים" intervention — which links
   * here with ?status=paused — used to land on 'ממתינים', a bucket dominated
   * by perfectly healthy scheduled rows, with no way to find the stuck ones.
   * 'paused' is the status no worker claims (CLAIMABLE_STATUSES is
   * ['scheduled'] alone), so on its own it is exactly that intervention's list.
   */
  /*
   * HIDDEN, NOT DELETED — and the difference is two links on the dashboard.
   *
   * "בהיסטוריה למחוק קטגוריות: תקועים, ידניים" — so neither is offered in the
   * bar any more. But the dashboard's own intervention cards link straight in
   * here with ?status=paused and ?status=needs_attention, and those links are
   * pressed at the one moment something is wrong. Delete the buckets and the
   * mapping below finds nothing, the link lands on an unfiltered list, and
   * "N פרסומים תקועים" opens five hundred rows — the exact fault the comment
   * that used to sit here was written about.
   *
   * So they keep working as a destination and stop existing as a button. A
   * hidden bucket that IS the current filter re-appears in the bar, because a
   * list filtered for a reason the screen does not show is worse than either.
   */
  { value: 'stuck', label: 'תקועים', statuses: ['paused'], hidden: true },
  { value: 'pending', label: 'ממתינים', statuses: [...AUTOMATIC_WAITING_STATUSES, ...IN_FLIGHT_STATUSES] },
  { value: 'failed', label: 'נכשלו', statuses: ['failed'] },
  { value: 'skipped', label: 'דולגו', statuses: ['skipped'] },
  { value: 'manual', label: 'ידניים', statuses: NEEDS_HUMAN_STATUSES, hidden: true },
];

const RANGES: { value: string; label: string; days: number | null }[] = [
  { value: '1', label: 'היום', days: 0 },
  { value: '7', label: '7 ימים', days: 7 },
  { value: '30', label: '30 ימים', days: 30 },
  { value: 'custom', label: 'טווח', days: null },
  { value: 'all', label: 'הכל', days: null },
];

const PAGE_SIZE = 40;

export default function HistoryPage() {
  return (
    <Suspense
      fallback={
        <SocialShell title="היסטוריה" lede="כל מה שיצא, ומה שנכשל">
          <Loading />
        </SocialShell>
      }
    >
      <HistoryScreen />
    </Suspense>
  );
}

/**
 * History as a working tool: filter by outcome and date, search by
 * group / campaign / post, and open any publication for its full detail
 * (including the plain-language reason it failed).
 *
 * The list pages locally in blocks of 40 — a season of publishing is
 * thousands of rows, and rendering them all is what turns a phone's scroll
 * into a stutter.
 */
function HistoryScreen() {
  const params = useSearchParams();
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  /* Row id → the instant the engine will use. Empty until the first read
     lands, and a row absent from it falls back to its stored stamp — which is
     exactly what this screen drew before. See the note in load(). */
  const [projected, setProjected] = useState<Map<string, string | null>>(new Map());
  const [group, setGroup] = useState<string>(mapIncomingStatus(params.get('status')));
  /*
   * ONE RUN'S ROWS, when the owner arrived by pressing its badge.
   *
   * "בריבוע של דורש טיפול / הסתיים עם כשלים אני רוצה שיהיה ניתן ללחוץ על זה
   *  וזה יביא אותי לעמוד של הכשלים."
   *
   * Held in state rather than read from the URL on every render, because the
   * chip below clears it — the owner who arrived at one round's failures is
   * one tap from everyone's, without going back and losing the outcome filter
   * he came in with.
   */
  const [onlyCampaign, setOnlyCampaign] = useState<string>(params.get('campaign') ?? '');
  /*
   * NO METHOD FILTER ANY MORE. "הכל מתפרסם מאותו המקום אצלי ואצל הלקוחות ככה
   * שזה לא רלוונטי" — every publication on this product goes out through the
   * browser on a PC, so a filter offering "API רשמי" and "בסיוע דפדפן" split
   * one real category into three imaginary ones. The column is untouched and
   * every row still carries its method; only the filter is gone.
   */
  /*
   * "All" when the owner arrived from a dashboard tile, 30 days otherwise.
   *
   * Every tile on the dashboard is an ALL-TIME head count (countByStatus) and
   * every one of them links here with ?status=. This screen then defaulted to
   * a 30-day window filtered on scheduled_at, so "נכשלו 47" opened a list of
   * 12, and the "N פרסומים ממתינים לכם" alert bar opened EMPTY whenever the
   * rows in question belonged to a run launched more than a month ago — which
   * is exactly the case where rows sit in needs_attention.
   *
   * The count is not clamped to match the list; the list is widened to hold
   * the count. The range chips are still right there to narrow it again.
   *
   * ...unless the link names its own window. "פורסמו היום" is the one tile
   * that is NOT an all-time count, and it arrives with &range=1, so the list
   * it opens holds exactly the rows behind the number the owner tapped.
   */
  const [range, setRange] = useState(() => {
    const asked = params.get('range');
    if (asked && RANGES.some((r) => r.value === asked)) return asked;
    return params.get('status') ? 'all' : '30';
  });
  const [since, setSince] = useState('');
  const [until, setUntil] = useState('');
  const [query, setQuery] = useState('');
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [campaigns, setCampaigns] = useState<Record<string, string>>({});
  const [error, setError] = useState<string | null>(null);
  /* The row whose leave is in flight — the machine can take half a minute. */
  const [busyLeave, setBusyLeave] = useState<string | null>(null);
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const statuses = STATUS_GROUPS.find((g) => g.value === group)?.statuses ?? [];
      const days = RANGES.find((r) => r.value === range)?.days;
      // The window is computed from the range chips unless a custom one is set.
      let fromISO: string | undefined;
      let toISO: string | undefined;
      if (range === 'custom') {
        fromISO = since ? zonedToUtc(since, '00:00').toISOString() : undefined;
        toISO = until ? zonedToUtc(until, '23:59').toISOString() : undefined;
      } else if (range === '1') {
        /* "היום" is the calendar day in the app's timezone, not the last 24
           hours: the dashboard's "פורסמו היום" tile counts from
           startOfZonedDay and links here, and a rolling window would list
           last night's publications beside a number that excludes them. */
        fromISO = startOfZonedDay(new Date()).toISOString();
      } else if (days !== null && days !== undefined) {
        fromISO = new Date(Date.now() - Math.max(days, 1) * 86_400_000).toISOString();
      }
      const page = await listQueue({
        status: statuses.length ? statuses : undefined,
        campaignId: onlyCampaign || undefined,
        since: fromISO,
        until: toISO,
        limit: 500,
        withText: true,
      });
      setRows(page);
      /*
       * ───────── AND WHEN EACH WAITING ROW WILL ACTUALLY GO OUT ─────────
       *
       * "עדיין מופיעים פוסטים המתוזמנים ל-08:00 … שיניתי את תחילת הפרסום
       *  ל-10:00, אבל התור ממשיך להציג שעות ישנות."
       *
       * This is the screen he photographed. It drew `row.scheduled_at` with
       * none of the four gates applied, so a row the engine will hold until
       * 10:00 read "12.10 · 08:00" — the hours he had just replaced, under a
       * panel one tap away showing the new ones.
       *
       * ROWS SPANNING EVERY CAMPAIGN, so the gates are loaded for all of them
       * and projectQueue keys the cascade by campaign_id — one round's
       * interval can never push another round's rows.
       *
       * ASCENDING, which projectQueue needs because one row's instant is the
       * next one's floor. `listQueue` here is ordered descending (newest
       * first, which is what a history list wants), so the projection is run
       * over a sorted copy and the list keeps its own order.
       */
      const ids = [...new Set(page.map((r) => r.campaign_id).filter((id): id is string => Boolean(id)))];
      const { gates, spacing } = await queueGates(ids);
      const ordered = [...page].sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at));
      setProjected(projectQueue(ordered, { now: new Date(), gates, spacing }));
      setError(null);
    } catch (err) {
      setError(friendlyMessage(err, 'טעינה נכשלה.'));
    }
  }, [group, range, since, until, onlyCampaign]);

  useEffect(() => {
    load();
    setLimit(PAGE_SIZE);
  }, [load]);

  useEffect(() => {
    listCampaigns()
      .then((list) => setCampaigns(Object.fromEntries(list.map((c) => [c.id, c.name]))))
      .catch(() => undefined);
  }, []);

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const kept = (rows ?? []).filter((r) => {
      if (!q) return true;
      const campaignName = r.campaign_id ? campaigns[r.campaign_id] ?? '' : '';
      return [r.target?.name, r.post?.title, campaignName, r.rendered_text].some((v) => v?.toLowerCase().includes(q));
    });
    /*
     * ORDERED BY THE INSTANT EACH ROW PRINTS, newest first.
     *
     * The read is ordered by the stored column, and every row now prints the
     * projected one — so a row held until 10:00 sat where its 08:00 stamp put
     * it, above a row that will go out before it. A list sorted on one clock
     * and labelled with another is in the wrong order on screen, which is the
     * same fault as printing the wrong clock and harder to notice.
     *
     * A finished row keeps `published_at`, which is what the list is really
     * about for everything but the waiting rows.
     */
    /* `updated_at` לפני התחזית — ראו doneAt ב-Timeline.tsx. שורה שהסתיימה
       מוצבת ברגע שבו היא הסתיימה, לא בשעה שתוכננה לה ולא בתחזית. */
    const when = (r: QueueRow) => r.published_at ?? r.updated_at ?? projected.get(r.id) ?? r.scheduled_at;
    return kept.sort((a, b) => String(when(b)).localeCompare(String(when(a))));
  }, [rows, query, campaigns, projected]);

  const page = filtered.slice(0, limit);

  async function act(fn: () => Promise<boolean>, ok: string) {
    try {
      const changed = await fn();
      toast(changed ? ok : 'הפריט כבר השתנה — המסך רוענן.', changed ? 'success' : 'info');
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    }
    await load();
  }

  /*
   * ─── THE GROUP, NOT THE ROW ────────────────────────────────────
   *
   * "תוסיף כאן אופציה מהירה לצאת מהקבוצות שכשלו ולא ניתן לפרסם בהן."
   *
   * `pauseTargets` is the whole of the first one and it already existed: it
   * switches the group off AND cancels the publications already waiting for
   * it, which is the difference between "stop trying" and "stop trying after
   * the fourteen already in the queue have each burned an attempt".
   */
  const stopTarget = (r: QueueRow) => {
    const id = r.target?.id;
    if (!id) return;
    void act(async () => {
      await pauseTargets([id]);
      return true;
    }, `הקבוצה "${r.target?.name ?? ''}" כובתה — לא ייכנסו אליה פרסומים חדשים.`);
  };

  /*
   * AND THE SECOND ONE HAPPENS ON HIS PC, SO THE SCREEN WAITS FOR THE ANSWER.
   *
   * The command only queues work; the leaving is a browser on his machine
   * pressing Facebook's own button. Announcing success on the insert would be
   * a toast about something that has not happened yet — and on THIS action,
   * which ends a membership, the gap between "asked" and "done" is the whole
   * question. So it waits, and reports what the machine said, including when
   * the machine said it could not.
   *
   * A null answer is "not finished", never "failed": the command is still in
   * the queue and the computer will run it when it gets to it.
   */
  const leaveGroup = (r: QueueRow) => {
    const url = r.target?.url;
    if (!url) return;
    void (async () => {
      setBusyLeave(r.id);
      try {
        const workers = await listWorkers().catch(() => []);
        const online = workers.find((w) => w.online) ?? workers[0] ?? null;
        const { id } = await leaveGroupOnFacebook(online?.id ?? null, url);
        toast('הבקשה נשלחה למחשב — מחכים שיצא מהקבוצה…', 'info');
        const done = await waitForWorkerCommand(id);
        if (!done) toast('הבקשה עדיין בתור במחשב. כשהיא תרוץ הקבוצה תכובה לבד.', 'info');
        else toast(done.result || (done.status === 'done' ? 'יצאנו מהקבוצה.' : 'היציאה לא התבצעה.'), done.status === 'done' ? 'success' : 'error');
      } catch (err) {
        toast(friendlyMessage(err, 'לא הצלחנו לשלוח את הבקשה למחשב.'), 'error');
      } finally {
        setBusyLeave(null);
        await load();
      }
    })();
  };

  const actions = {
    onRetry: (r: QueueRow) => act(() => retryQueueItem(r.id), 'הוחזר לתור.'),
    onCancel: (r: QueueRow) => act(() => cancelQueueItem(r.id), 'בוטל.'),
    onScreenshot: (r: QueueRow) => r.screenshot_path && screenshotUrl(r.screenshot_path).then((u) => u && window.open(u, '_blank', 'noreferrer')),
    onStopTarget: stopTarget,
    onLeaveGroup: leaveGroup,
  };

  return (
    <SocialShell title="היסטוריה" lede="כל מה שיצא, ומה שנכשל" onRefresh={load}>
      <div className="space-y-4">
        {/* A failed first read used to leave `rows` null for ever: the banner
            sat above a skeleton that shimmered indefinitely, and the only way
            out on a phone was a browser reload. */}
        {error && <ErrorState message={error} onRetry={load} />}

        <Card padded={false} className="p-3">
          <input
            type="search"
            className={inputClass}
            placeholder="חיפוש לפי קבוצה, סבב, פוסט או טקסט…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="חיפוש בהיסטוריה"
          />
          <div className="mt-2.5 min-w-0 space-y-2 overflow-x-auto scrollbar-none">
            <SegmentedControl
              size="sm"
              label="תוצאה"
              value={group}
              onChange={setGroup}
              options={STATUS_GROUPS.filter((g) => !g.hidden || g.value === group).map((g) => ({ value: g.value, label: g.label }))}
              className="min-w-max"
            />
            <div className="flex flex-wrap items-center gap-2">
              <SegmentedControl
                size="sm"
                label="טווח"
                value={range}
                onChange={setRange}
                options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
                className="min-w-max"
              />
            </div>
            {/*
              THE ROUND IT CAME FROM, NAMED AND REMOVABLE.
              A filter the owner cannot see is a screen that lies about what
              it is showing — he pressed a badge two screens ago and would
              otherwise read this list as the whole history.
            */}
            {onlyCampaign && (
              <div className="flex min-w-0 items-center gap-2 rounded-xl bg-ink-850 px-3 py-2">
                <span dir="auto" className="min-w-0 truncate text-xs font-bold text-mist-300">
                  מוצג רק הסבב: <span className="text-mist-100">{campaigns[onlyCampaign] ?? 'סבב'}</span>
                </span>
                <button
                  type="button"
                  onClick={() => setOnlyCampaign('')}
                  className="ms-auto min-h-11 shrink-0 px-1 text-xs font-extrabold text-brand-400 underline"
                >
                  הצג את כל הסבבים
                </button>
              </div>
            )}
            {range === 'custom' && (
              <div className="grid grid-cols-2 gap-2 [&>*]:min-w-0">
                <label className="text-xs font-bold text-mist-500">
                  מתאריך
                  <input type="date" className={inputClass} value={since} onChange={(e) => setSince(e.target.value)} />
                </label>
                <label className="text-xs font-bold text-mist-500">
                  עד תאריך
                  <input type="date" className={inputClass} value={until} onChange={(e) => setUntil(e.target.value)} />
                </label>
              </div>
            )}
          </div>
        </Card>

        <Card
          title="פרסומים"
          /* The read is capped at 500 (load()), so `filtered.length` is a
             ceiling, not a total — and the badge beside it already said "500+".
             One header cannot carry two numbers about the same rows that
             disagree, so at the cap the subtitle stops claiming a total too. */
          subtitle={
            rows
              ? rows.length >= 500
                ? `מוצגות ${page.length} מתוך 500 הרשומות האחרונות בטווח`
                : `${counted(filtered.length, 'רשומה אחת', 'רשומות', 'שתי רשומות')}${filtered.length > page.length ? ` · מוצגות ${page.length}` : ''}`
              : undefined
          }
          action={rows ? <Badge tone="neutral">{rows.length >= 500 ? '500+ אחרונים' : `${rows.length} בטווח`}</Badge> : undefined}
        >
          {!rows && !error && <SkeletonList rows={6} />}
          {rows && filtered.length === 0 && (
            <EmptyState
              icon={<InboxIcon className="h-5 w-5" />}
              title="אין רשומות בסינון הזה"
              description="נסו טווח תאריכים רחב יותר, או נקו את החיפוש."
              action={
                <Button
                  variant="secondary"
                  onClick={() => {
                    setQuery('');
                    setGroup('');
                    setRange('all');
                  }}
                >
                  נקה סינון
                </Button>
              }
            />
          )}
          {rows && page.length > 0 && (
            <>
              <ul className="divide-y divide-ink-700">
                {page.map((r) => (
                  <PublicationItem key={r.id} row={r} projectedAt={projected.get(r.id)} actions={actions} busy={busyLeave === r.id} showDate />
                ))}
              </ul>
              {filtered.length > page.length && (
                <div className="mt-3 flex justify-center">
                  <Button variant="secondary" onClick={() => setLimit((n) => n + PAGE_SIZE)}>
                    טען עוד {Math.min(PAGE_SIZE, filtered.length - page.length)}
                  </Button>
                </div>
              )}
            </>
          )}
        </Card>
      </div>
    </SocialShell>
  );
}

/** Links from the dashboard still arrive with a raw status; map it onto a bucket. */
function mapIncomingStatus(raw: string | null): string {
  if (!raw) return '';
  const hit = STATUS_GROUPS.find((g) => g.statuses.includes(raw as QueueStatus));
  return hit?.value ?? '';
}
