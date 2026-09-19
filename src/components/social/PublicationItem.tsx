'use client';

import { useState } from 'react';
import type { QueueRow } from '@/lib/social/client';
import { formatDayMonthHe, formatTimeHe, relativeHe, zonedDateISO } from '@/lib/social/time';
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

/** The one-line state, told in the language the owner speaks. */
export function statusLine(row: QueueRow): { text: string; cls: string } {
  const step = (row.step ?? '') as QueueStep;
  switch (row.status) {
    case 'published':
      // No "ב-" before the time: a Hebrew prefix glued to digits with a hyphen
      // is exactly the construction that flips order in a bidi run.
      return { text: row.published_at ? `פורסם ${formatTimeHe(row.published_at)}` : 'פורסם', cls: TONE_TEXT[STATUS_TONE.published] };
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
      return { text: QUEUE_STEP_LABEL[step] || 'מפרסם עכשיו', cls: TONE_TEXT[STATUS_TONE.publishing] };
    case 'manual_pending':
      return { text: 'ממתין לפרסום ידני', cls: TONE_TEXT[STATUS_TONE.manual_pending] };
    default:
      return { text: `${formatTimeHe(row.scheduled_at)} · ${relativeHe(row.scheduled_at)}`, cls: TONE_TEXT[STATUS_TONE.scheduled] };
  }
}

export function PublicationItem({
  row,
  actions = {},
  showDate = false,
  busy = false,
}: {
  row: QueueRow;
  actions?: PublicationActions;
  showDate?: boolean;
  /** A write on this row is in flight — the confirm button locks and spins. */
  busy?: boolean;
}) {
  const [open, setOpen] = useState(false);
  const line = statusLine(row);
  const running = row.status === 'publishing';
  /*
   * `showDate` replaces the status line's own clock rather than prefixing it —
   * otherwise a queued row read "18.09.2026, 15:40 · 15:40 · בעוד שעה" and
   * then truncated. Today keeps the relative phrase (it is the useful part);
   * another day shows a compact date instead.
   */
  const at = row.published_at ?? row.scheduled_at;
  const isToday = zonedDateISO(new Date(at)) === zonedDateISO(new Date());
  const when = !showDate
    ? line.text
    : row.status === 'scheduled'
      ? isToday
        ? `${formatTimeHe(at)} · ${relativeHe(at)}`
        : `${formatDayMonthHe(at)} · ${formatTimeHe(at)}`
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
    actions.onRunNow && row.status === 'scheduled' && new Date(row.scheduled_at).getTime() > Date.now() + 60_000
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
            <Detail label="מתוזמן ל"><Stamp iso={row.scheduled_at} /></Detail>
            <Detail label="פורסם ב">{row.published_at ? <Stamp iso={row.published_at} /> : '—'}</Detail>
            <Detail label="פוסט">{row.post?.title || '—'}</Detail>
            <Detail label="ניסיונות">{row.attempts}</Detail>
          </dl>
          {(row.error || row.skip_reason) && <ErrorDetail row={row} technical />}
          {row.rendered_text && (
            <div>
              <p className="mb-1 text-xs font-bold text-mist-500">הטקסט שיוצא / יצא</p>
              <p dir="auto" className="max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl border border-ink-700 bg-ink-900 p-3 text-sm leading-relaxed text-mist-100">
                {row.rendered_text}
              </p>
            </div>
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
