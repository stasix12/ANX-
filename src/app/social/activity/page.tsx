'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { InboxIcon } from '@/components/icons';
import { ActivityDetailSheet } from '@/components/social/ActivityDetailSheet';
import { ActivityFeed } from '@/components/social/ActivityFeed';
import { SocialShell } from '@/components/social/SocialShell';
import { Button, Card, EmptyState, ErrorState, SegmentedControl, SkeletonList } from '@/components/social/ui';
import { ACTIVITY_FILTERS, filterActivity, type ActivityFilter } from '@/lib/social/activity';
import { listActivity } from '@/lib/social/client';
import { friendlyMessage } from '@/lib/social/errors';
import { startOfZonedDay } from '@/lib/social/time';
import type { ActivityEntry } from '@/lib/social/types';

/**
 * How many rows come back per read. The log is the busiest table in the
 * product — a single round of 30 groups writes 30 lines plus its own report —
 * so this is a window that grows on demand, never the whole history.
 */
const PAGE = 50;

/**
 * The same day buckets the history screen offers, for the same reason: "today"
 * and "this week" are the two questions anybody actually asks of a log. The
 * cut is made in the database on `at`, which is the only indexed column on
 * this table.
 */
const RANGES: { value: string; label: string; days: number | null }[] = [
  { value: 'all', label: 'הכל', days: null },
  { value: '1', label: 'היום', days: 0 },
  { value: '7', label: '7 ימים', days: 7 },
  { value: '30', label: '30 ימים', days: 30 },
];

/**
 * /social/activity — the whole log, and the screen the product has been
 * promising without having.
 *
 * Both "see everything" links in the module — the dashboard card's and the
 * notification bell's — used to point at /social/history, which lists
 * social_queue: publications, not events. So a worker that stopped, a round
 * that was planned, a login Facebook challenged and every invariant warning
 * the system wrote about itself were visible for as long as they fitted in a
 * six-row card, and then gone. This screen is where they live.
 *
 * It is a second VIEW, not a second source: the same social_activity_log rows,
 * the same reader, the same classification (activity.ts) the dashboard card
 * and the bell use, and no counter of its own. The bell still shows only what
 * needs a person; this shows everything, successes included, which is the
 * division the two have always had.
 */
export default function ActivityPage() {
  const [rows, setRows] = useState<ActivityEntry[] | null>(null);
  const [filter, setFilter] = useState<ActivityFilter>('');
  const [range, setRange] = useState('all');
  const [error, setError] = useState<string | null>(null);
  const [more, setMore] = useState(false);
  const [done, setDone] = useState(false);
  const [detail, setDetail] = useState<string | null>(null);

  const since = useMemo(() => {
    const days = RANGES.find((r) => r.value === range)?.days;
    if (days === null || days === undefined) return undefined;
    const from = startOfZonedDay(new Date());
    if (days > 0) from.setDate(from.getDate() - days + 1);
    return from.toISOString();
  }, [range]);

  const load = useCallback(async () => {
    try {
      const page = await listActivity(PAGE, since ? { since } : {});
      setRows(page);
      setDone(page.length < PAGE);
      setError(null);
    } catch (err) {
      setError(friendlyMessage(err, 'לא הצלחנו לטעון את הפעילות.'));
    }
  }, [since]);

  useEffect(() => {
    setRows(null);
    setDone(false);
    load();
  }, [load]);

  /*
   * The next page is asked for BY CURSOR — the `at` of the last row on screen —
   * not by an offset. A log is written while it is being read: with an offset,
   * a line arriving between two reads pushes everything down one and the owner
   * sees a row twice while another is skipped entirely.
   */
  async function loadMore() {
    if (!rows?.length || more || done) return;
    setMore(true);
    try {
      const next = await listActivity(PAGE, { before: rows[rows.length - 1].at, ...(since ? { since } : {}) });
      setRows((cur) => [...(cur ?? []), ...next]);
      if (next.length < PAGE) setDone(true);
    } catch (err) {
      setError(friendlyMessage(err, 'לא הצלחנו לטעון עוד פעילות.'));
    } finally {
      setMore(false);
    }
  }

  const all = rows ?? [];
  const visible = filterActivity(all, filter);

  return (
    <SocialShell title="מרכז פעילות" lede="כל מה שהמערכת עשתה, מהחדש לישן">
      <div className="space-y-4">
        {error && <ErrorState message={error} onRetry={load} />}

        <div className="space-y-2">
          <SegmentedControl
            variant="chips"
            label="סוג פעילות"
            value={filter}
            onChange={setFilter}
            options={ACTIVITY_FILTERS.map((f) => ({
              value: f.value,
              label: f.label,
              /* Counted over the rows that are loaded, by the same function
                 that does the filtering — so a chip cannot promise more lines
                 than tapping it shows. The window itself is named below. */
              count: filterActivity(all, f.value).length,
            }))}
          />
          <SegmentedControl
            variant="chips"
            label="טווח תאריכים"
            value={range}
            onChange={setRange}
            options={RANGES.map((r) => ({ value: r.value, label: r.label }))}
          />
        </div>

        <Card
          title="פעילות"
          /* A window, said as one. `rows` is what has been READ, never a total:
             the log has no cheap count and printing this array's length as one
             is the defect this module has a test for. */
          subtitle={rows ? `${visible.length} מוצגות מתוך ${all.length} שנטענו` : undefined}
        >
          {!rows && !error && <SkeletonList rows={6} />}
          {rows && all.length === 0 && (
            <EmptyState
              icon={<InboxIcon className="h-5 w-5" />}
              title="אין עדיין פעילות"
              description="כשתתחילו לפרסם, כל הפעולות של המערכת יופיעו כאן."
            />
          )}
          {rows && all.length > 0 && (
            <ActivityFeed
              entries={visible}
              limit={visible.length}
              onChanged={load}
              onOpen={(id) => setDetail(id)}
              emptyText="אין פעילות בסינון הזה."
            />
          )}
        </Card>

        {rows && !done && all.length > 0 && (
          <div className="flex justify-center">
            <Button variant="secondary" busy={more} onClick={loadMore}>
              הצג עוד
            </Button>
          </div>
        )}
        {rows && done && all.length > 0 && <p className="text-center text-[11px] text-mist-500">הגעתם לסוף היומן.</p>}
      </div>

      <ActivityDetailSheet queueId={detail} onClose={() => setDetail(null)} onChanged={load} />
    </SocialShell>
  );
}
