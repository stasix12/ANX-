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
import { cancelQueueItem, listCampaigns, listQueue, retryQueueItem, screenshotUrl, type QueueRow } from '@/lib/social/client';
import { startOfZonedDay, zonedToUtc } from '@/lib/social/time';
import { AUTOMATIC_WAITING_STATUSES, IN_FLIGHT_STATUSES, NEEDS_HUMAN_STATUSES } from '@/lib/social/status';
import { type PublishMethod, type QueueStatus } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';
import { InboxIcon } from '@/components/icons';

/**
 * Coarse buckets people actually filter by, built from the single
 * classification (status.ts) so that a dashboard tile showing N opens a list
 * of exactly those N rows. "ממתינים" is what moves on its own; "ידניים" is
 * what waits for a person — awaiting_confirmation belongs to the second, which
 * is where the queue list has always put it.
 */
const STATUS_GROUPS: { value: string; label: string; statuses: QueueStatus[] }[] = [
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
  { value: 'stuck', label: 'תקועים', statuses: ['paused'] },
  { value: 'pending', label: 'ממתינים', statuses: [...AUTOMATIC_WAITING_STATUSES, ...IN_FLIGHT_STATUSES] },
  { value: 'failed', label: 'נכשלו', statuses: ['failed'] },
  { value: 'skipped', label: 'דולגו', statuses: ['skipped'] },
  { value: 'manual', label: 'ידניים', statuses: NEEDS_HUMAN_STATUSES },
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
 * History as a working tool: filter by outcome, method and date, search by
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
  const [group, setGroup] = useState<string>(mapIncomingStatus(params.get('status')));
  const [method, setMethod] = useState<PublishMethod | ''>('');
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
      setRows(await listQueue({ status: statuses.length ? statuses : undefined, since: fromISO, until: toISO, limit: 500 }));
      setError(null);
    } catch (err) {
      setError(friendlyMessage(err, 'טעינה נכשלה.'));
    }
  }, [group, range, since, until]);

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
    return (rows ?? []).filter((r) => {
      if (method && (r.method ?? '') !== method) return false;
      if (!q) return true;
      const campaignName = r.campaign_id ? campaigns[r.campaign_id] ?? '' : '';
      return [r.target?.name, r.post?.title, campaignName, r.rendered_text].some((v) => v?.toLowerCase().includes(q));
    });
  }, [rows, query, method, campaigns]);

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

  const actions = {
    onRetry: (r: QueueRow) => act(() => retryQueueItem(r.id), 'הוחזר לתור.'),
    onCancel: (r: QueueRow) => act(() => cancelQueueItem(r.id), 'בוטל.'),
    onScreenshot: (r: QueueRow) => r.screenshot_path && screenshotUrl(r.screenshot_path).then((u) => u && window.open(u, '_blank', 'noreferrer')),
  };

  return (
    <SocialShell title="היסטוריה" lede="כל מה שיצא, ומה שנכשל">
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
              options={STATUS_GROUPS.map((g) => ({ value: g.value, label: g.label }))}
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
              <SegmentedControl
                size="sm"
                label="שיטה"
                value={method}
                onChange={setMethod}
                options={[
                  { value: '', label: 'כל השיטות' },
                  { value: 'api', label: 'API רשמי' },
                  { value: 'browser', label: 'בסיוע דפדפן' },
                  { value: 'manual', label: 'ידני' },
                ]}
                className="min-w-max"
              />
            </div>
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
                : `${filtered.length} רשומות${filtered.length > page.length ? ` · מוצגות ${page.length}` : ''}`
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
                    setMethod('');
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
                  <PublicationItem key={r.id} row={r} actions={actions} showDate />
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
