'use client';

import { useEffect, useState } from 'react';
import { getQueueItem, type QueueRow } from '@/lib/social/client';
import { formatDayMonthHe, formatInstantHe, relativeHe, zonedDateISO } from '@/lib/social/time';
import { CANCELLABLE_STATUSES } from '@/lib/social/status';
import { QUEUE_STEP_LABEL, type QueueStep } from '@/lib/social/types';
import { CalendarIcon, ClipboardListIcon, EyeIcon, RepeatIcon, SendIcon, UsersIcon, XCircleIcon } from '@/components/icons';
import { Stamp } from './DateTime';
import { ErrorDetail } from './ErrorDetail';
import { TargetAvatar } from './TargetAvatar';
import { Badge, Button, MethodBadge, OverflowMenu, Sheet, StatusPill, STATUS_TONE, TONE_TEXT, TONE_TINT } from './ui';

/**
 * One publication, everywhere it appears: the live queue, a campaign's
 * timeline, a group's history. The row itself carries only what a person
 * scans for — who, when, what state — and everything else (the text that
 * will go out, the failure explanation, the links) opens in a detail sheet.
 *
 * Actions are real operations on the queue row. A row that cannot be acted
 * on simply has no button rather than a disabled one that implies otherwise.
 */

export interface PublicationActions {
  onRetry?: (row: QueueRow) => void;
  onCancel?: (row: QueueRow) => void;
  onConfirm?: (row: QueueRow) => void;
  onRunNow?: (row: QueueRow) => void;
  onScreenshot?: (row: QueueRow) => void;
}

/**
 * The one-line state, told in the language the owner speaks.
 *
 * `projectedAt` is when the engine will actually take this row — see
 * PublicationItem's own prop. Absent, the stored instant stands, which is what
 * every caller got before projection.ts existed and is still right for a
 * caller with no account settings to hand.
 */
/**
 * ─── AND HOW LONG IT HAS BEEN ON THAT STAGE ──────────────────────────────
 *
 * "שזה מחפש / טוען / מפרסם זה נראה כאילו זה נתקע."
 *
 * This is the one place in the product that names the stage — "מעלה מדיה",
 * "מאמת" — and the words alone cannot tell a publication that reached that
 * stage two seconds ago from one that has been on it for four minutes. The
 * worker stamps `step_at` on every stage change (social-worker.ts), and
 * nothing drew it.
 *
 * `now` is passed ONLY by a host that re-reads the row — see the `live` prop
 * below. A frozen list must never grow a counter: a number climbing on a row
 * nobody is refreshing says the publication is still going when the screen
 * has no idea whether it is.
 */
export function stageElapsed(row: QueueRow, now: number | undefined): string {
  if (now === undefined || !row.step_at) return '';
  const secs = Math.round((now - Date.parse(row.step_at)) / 1000);
  /* The clamp travels with the arithmetic, exactly as it does for a finished
     row in ActivityDetailSheet: a PC clock minutes off its phone's would
     otherwise print a negative age or an hour-long one. Above the hour there
     is nothing honest left to say — and an hour clears the longest upload
     the composer allows. */
  if (!Number.isFinite(secs) || secs <= 0 || secs >= 3600) return '';
  if (secs < 60) return ` · ${secs === 1 ? 'שנייה אחת' : secs === 2 ? 'שתי שניות' : `${secs} שניות`}`;
  const min = Math.floor(secs / 60);
  return ` · ${min === 1 ? 'דקה' : min === 2 ? 'שתי דקות' : `${min} דקות`}`;
}

export function statusLine(row: QueueRow, projectedAt?: string | null, now?: number): { text: string; cls: string } {
  const step = (row.step ?? '') as QueueStep;
  /*
   * NULL AND UNDEFINED ARE TWO DIFFERENT ANSWERS, and `??` read them as one.
   *
   * projectQueue() returns `null` for exactly one state — the campaign's
   * schedule is on and no day is lit — and its header says what that means:
   * "the row is held indefinitely… the caller may not print the stored
   * instant over it." `undefined` is the other thing entirely: a caller with
   * no account settings to hand, for which the stored instant IS the best
   * answer. Collapsing them printed "08:01 · בעוד 3 שעות" over a row
   * rules.ts defers twenty-four hours at a time, for ever.
   */
  const held = projectedAt === null && row.status === 'scheduled';
  const at = projectedAt === undefined || projectedAt === null ? row.scheduled_at : projectedAt;
  if (held) return { text: 'מוחזק — לא נבחר יום פרסום בתזמון', cls: TONE_TEXT[STATUS_TONE.needs_attention] };
  switch (row.status) {
    case 'published':
      // No "ב-" before the time: a Hebrew prefix glued to digits with a hyphen
      // is exactly the construction that flips order in a bidi run.
      return { text: row.published_at ? `פורסם ${formatInstantHe(row.published_at)}` : 'פורסם', cls: TONE_TEXT[STATUS_TONE.published] };
    case 'failed':
      return { text: 'נכשל', cls: TONE_TEXT[STATUS_TONE.failed] };
    case 'skipped':
      return { text: row.skip_reason || 'דולג', cls: TONE_TEXT[STATUS_TONE.skipped] };
    case 'needs_attention':
      return { text: 'דורש טיפול שלכם', cls: TONE_TEXT[STATUS_TONE.needs_attention] };
    case 'awaiting_confirmation':
      return { text: 'מוכן — ממתין לאישור שלכם', cls: TONE_TEXT[STATUS_TONE.awaiting_confirmation] };
    case 'paused':
      return { text: 'מושהה', cls: TONE_TEXT[STATUS_TONE.paused] };
    case 'publishing':
      return { text: `${QUEUE_STEP_LABEL[step] || 'מפרסם עכשיו'}${stageElapsed(row, now)}`, cls: TONE_TEXT[STATUS_TONE.publishing] };
    case 'manual_pending':
      return { text: 'ממתין לפרסום ידני', cls: TONE_TEXT[STATUS_TONE.manual_pending] };
    default:
      /*
       * THE INSTANT THE ENGINE WILL USE, not the stored column.
       *
       * "למה יש כל פעם את האיחור הזה" — this line is where he reads it. A row
       * re-spaced at 06:25 under a window that opens at 08:00 printed
       * "06:25 · לפני שעתיים" here while the card one screen up said 08:00,
       * because rules.ts holds every claimed row behind four gates and this
       * formatted the column none of them had been applied to.
       *
       * `at` is projectQueue()'s answer when the caller supplied one, and the
       * stored instant when it did not — see the prop on PublicationItem.
       */
      return { text: `${formatInstantHe(at)} · ${relativeHe(at)}`, cls: TONE_TEXT[STATUS_TONE.scheduled] };
  }
}

export function PublicationItem({
  row,
  projectedAt,
  actions = {},
  showDate = false,
  busy = false,
  live = false,
}: {
  row: QueueRow;
  /**
   * WHEN THIS ROW WILL ACTUALLY GO OUT — from projectQueue() in
   * lib/social/projection.ts, where the four publish gates are composed.
   *
   * This component is the row renderer for the campaign screen's DEFAULT tab,
   * the history screen and a group's own page, and it printed
   * `row.scheduled_at` raw. So the fix that taught the dashboard's timeline and
   * the campaign card to agree left the list the owner actually opens still
   * saying 06:25 under a window that opens at 08:00.
   *
   * Absent: the stored instant, exactly as before. A caller that has no
   * account settings to project with must not invent them.
   */
  projectedAt?: string | null;
  actions?: PublicationActions;
  showDate?: boolean;
  /** A write on this row is in flight — the confirm button locks and spins. */
  busy?: boolean;
  /**
   * THIS HOST RE-READS THE ROW, so a publishing row may count.
   *
   * Opt-in, and default off, because the counter is only honest where the
   * data behind it is moving: the campaign run and the post editor poll every
   * four to five seconds, while the history screen and a group's own page
   * read once. A row frozen at "מעלה מדיה" whose seconds keep climbing is a
   * screen asserting something it cannot know.
   */
  live?: boolean;
}) {
  const [open, setOpen] = useState(false);
  /*
   * One second, and only while this row is actually publishing — the same
   * beat and the same visibility guard every other counter in the product
   * uses. A row in any other status starts no interval at all.
   */
  const ticking = live && row.status === 'publishing' && Boolean(row.step_at);
  const [now, setNow] = useState<number | undefined>(() => (ticking ? Date.now() : undefined));
  useEffect(() => {
    if (!ticking) {
      setNow(undefined);
      return;
    }
    setNow(Date.now());
    const id = setInterval(() => {
      if (document.visibilityState === 'hidden') return;
      setNow(Date.now());
    }, 1000);
    return () => clearInterval(id);
  }, [ticking]);
  /*
   * The body text on demand. Lists fetch rows WITHOUT rendered_text now
   * (QUEUE_SELECT_LITE — it was two hundred full post bodies polled every four
   * seconds), so when a row is opened and its body was not already loaded, this
   * pulls that one row's text. A row that arrived WITH the text (the history
   * screen, which searches it) shows it immediately and never fetches.
   */
  const [fetchedText, setFetchedText] = useState<string | null>(null);
  const bodyText = row.rendered_text ?? fetchedText;
  useEffect(() => {
    if (!open || row.rendered_text || fetchedText !== null) return;
    let alive = true;
    getQueueItem(row.id)
      .then((full) => {
        if (alive && full) setFetchedText(full.rendered_text ?? '');
      })
      .catch(() => alive && setFetchedText(''));
    return () => {
      alive = false;
    };
  }, [open, row.id, row.rendered_text, fetchedText]);
  const line = statusLine(row, projectedAt, now);
  const running = row.status === 'publishing';
  /*
   * `showDate` replaces the status line's own clock rather than prefixing it —
   * otherwise a queued row read "18.09.2026, 15:40 · 15:40 · בעוד שעה" and
   * then truncated. Today keeps the relative phrase (it is the useful part);
   * another day shows a compact date instead.
   */
  /* The row's own instant for the collapsed line: when it published, or when
     it is going to — projected, never the raw column. */
  const at = row.published_at ?? (projectedAt === undefined || projectedAt === null ? row.scheduled_at : projectedAt);
  const isToday = zonedDateISO(new Date(at)) === zonedDateISO(new Date());
  /* Same rule as statusLine's: a held row has no instant to put a date on,
     so the collapsed line keeps the words instead of inventing a clock. */
  const heldRow = projectedAt === null && !row.published_at && row.status === 'scheduled';
  const when = !showDate || heldRow
    ? line.text
    : row.status === 'scheduled'
      ? isToday
        ? `${formatInstantHe(at)} · ${relativeHe(at)}`
        : `${formatDayMonthHe(at)} · ${formatInstantHe(at)}`
      : isToday
        ? line.text
        : `${formatDayMonthHe(at)} · ${line.text}`;

  /*
   * The menu's marks are SVG, from the product's own set.
   *
   * They were 🔁 ↗ 🔗 🖼 ℹ️ 🚫 — one hairline arrow beside five full-colour
   * Apple glyphs, optically larger and heavier than every other icon on the
   * screen and in nobody's palette. ui.tsx's own docstring says it: "Emoji
   * read as placeholder art in a product this size."
   */
  const icon = 'h-4.5 w-4.5';
  const menu = [
    actions.onRetry && (row.status === 'failed' || row.status === 'skipped' || row.status === 'needs_attention')
      ? { label: 'נסה שוב', icon: <RepeatIcon className={icon} />, onSelect: () => actions.onRetry?.(row) }
      : null,
    /*
     * "הרץ עכשיו" is offered when the row is more than a minute away — which
     * has to be measured on the instant it will REALLY go out. On the raw
     * column it is false for every row whose stamp has passed but whose
     * publication is still hours off, which is precisely the case the owner
     * is in: the action vanished from exactly the rows that are waiting on a
     * window and could most use it.
     */
    actions.onRunNow && row.status === 'scheduled' && new Date(projectedAt ?? row.scheduled_at).getTime() > Date.now() + 60_000
      ? { label: 'הרץ עכשיו', icon: <SendIcon className={icon} />, onSelect: () => actions.onRunNow?.(row) }
      : null,
    row.target?.url ? { label: 'פתח את הקבוצה', icon: <UsersIcon className={icon} />, onSelect: () => window.open(row.target?.url, '_blank', 'noreferrer') } : null,
    row.permalink ? { label: 'פתח את הפוסט שפורסם', icon: <ClipboardListIcon className={icon} />, onSelect: () => window.open(row.permalink as string, '_blank', 'noreferrer') } : null,
    actions.onScreenshot && row.screenshot_path ? { label: 'צילום מסך של התקלה', icon: <EyeIcon className={icon} />, onSelect: () => actions.onScreenshot?.(row) } : null,
    { label: 'פרטי הפרסום', icon: <CalendarIcon className={icon} />, onSelect: () => setOpen(true) },
    actions.onCancel && CANCELLABLE_STATUSES.includes(row.status)
      ? { label: 'בטל פרסום', icon: <XCircleIcon className={icon} />, onSelect: () => actions.onCancel?.(row), danger: true }
      : null,
  ].filter(Boolean) as { label: string; icon?: React.ReactNode; onSelect: () => void; danger?: boolean }[];

  return (
    <li className={`flex min-w-0 items-center gap-2 py-2.5 ${running ? `rounded-xl px-2 ${TONE_TINT.brand}` : ''}`}>
      <TargetAvatar name={row.target?.name ?? '?'} imageUrl={row.target?.image_url} channel={row.target?.channel} size={38} />
      <button type="button" onClick={() => setOpen(true)} className="min-h-11 min-w-0 grow text-start">
        <p dir="auto" className="truncate text-sm font-bold text-mist-100">{row.target?.name ?? 'יעד'}</p>
        <p dir="auto" className={`truncate text-xs font-semibold ${line.cls}`}>{when}</p>
      </button>

      {row.status === 'awaiting_confirmation' && actions.onConfirm ? (
        /* `busy` is the whole point: this button releases a publication to a
           real Facebook group, and it was the one control in the flow with
           neither busy nor disabled. size="md" for the 44px floor — it was
           measuring 48x40 in a dense row beside a 44px overflow menu. */
        <Button busy={busy} onClick={() => actions.onConfirm?.(row)}>
          אשר
        </Button>
      ) : (
        <StatusPill status={row.status} />
      )}
      <OverflowMenu label={`פעולות עבור ${row.target?.name ?? 'הפרסום'}`} actions={menu} />

      <Sheet open={open} onClose={() => setOpen(false)} title={row.target?.name ?? 'פרסום'}>
        <div className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <StatusPill status={row.status} long />
            <MethodBadge method={row.method} channel={row.target?.channel} />
            {row.variant && <Badge tone="brand">גרסה {row.variant.label}</Badge>}
          </div>
          <dl className="grid grid-cols-2 gap-x-3 gap-y-2 text-sm [&>*]:min-w-0">
            {/* BOTH, when they differ — and they differ exactly when something
                is holding the row. "מתוזמן ל" is the slot it was given;
                "ייצא ב" is when the engine will take it, after the window, the
                campaign's gap and the account floor. Printing only the first
                is what made the list disagree with the card; printing only the
                second would hide that the row was moved at all. */}
            <Detail label="מתוזמן ל"><Stamp iso={row.scheduled_at} /></Detail>
            {projectedAt && projectedAt !== row.scheduled_at && row.status === 'scheduled' && (
              <Detail label="ייצא ב"><Stamp iso={projectedAt} /></Detail>
            )}
            <Detail label="פורסם ב">{row.published_at ? <Stamp iso={row.published_at} /> : '—'}</Detail>
            <Detail label="פוסט">{row.post?.title || '—'}</Detail>
            <Detail label="ניסיונות">{row.attempts}</Detail>
          </dl>
          {(row.error || row.skip_reason) && <ErrorDetail row={row} technical />}
          {bodyText !== null && bodyText !== '' && (
            <div>
              <p className="mb-1 text-xs font-bold text-mist-500">הטקסט שיוצא / יצא</p>
              <p dir="auto" className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-ink-700 bg-ink-900 p-3 text-sm leading-relaxed text-mist-100">
                {bodyText}
              </p>
            </div>
          )}
          {open && bodyText === null && (
            <p className="text-xs text-mist-500">טוען את הטקסט…</p>
          )}
          <div className="flex flex-wrap gap-2 pt-1">
            {row.permalink && (
              <a href={row.permalink} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-ink-800 px-4 text-sm font-bold text-brand-400">
                פתח את הפוסט ↗
              </a>
            )}
            {row.target?.url && (
              <a href={row.target.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-ink-800 px-4 text-sm font-bold text-mist-100">
                פתח את הקבוצה ↗
              </a>
            )}
          </div>
        </div>
      </Sheet>
    </li>
  );
}

function Detail({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <dt className="text-[11px] font-bold text-mist-500">{label}</dt>
      <dd className="text-mist-100">{children}</dd>
    </div>
  );
}
