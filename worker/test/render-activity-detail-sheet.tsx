/*
 * "פרטי הפרסום", AS A MEASURABLE PAGE — src/components/social/ActivityDetailSheet.tsx.
 *
 * ─── WHY THIS IS NOT ONE renderSnapshot(<ActivityDetailSheet/>) ──────
 *
 * It was tried first, and it draws `<span hidden aria-hidden></span>` and
 * nothing else. Two gates, both of them a client effect:
 *
 *   1. <Sheet> (ui.tsx:1208) holds `const [mounted, setMounted] = useState(false)`
 *      with `useEffect(() => setMounted(true), [])` and returns the bare
 *      themeAnchor while `!mounted`, because its panel is portalled to
 *      document.body, which does not exist on the server. renderToStaticMarkup
 *      runs no effect, so EVERY sheet in this product renders as that one span.
 *      render-queue-tuner-sheet.tsx hit the same wall and documents it.
 *   2. ActivityDetailSheet itself holds `const [row, setRow] = useState(null)`
 *      and fills it from getQueueItem(queueId) inside useEffect (line 123). So
 *      even with the portal solved, the body is `<SkeletonList rows={2}/>` and
 *      nothing else — the window has no prop that carries a row.
 *
 * The real component IS mounted at the foot of this page all the same, in both
 * of its states (queueId null and queueId set), so this fixture fails the day
 * its export changes shape and so the one thing it CAN draw is on screen.
 *
 * WHAT IS REPRODUCED RATHER THAN IMPORTED, and therefore what a reader has to
 * keep in step with the component:
 *
 *   · SheetShell — Sheet(placement='center'), class string for class string
 *     from ui.tsx:1461 (`w-[90%] max-w-[480px] rounded-[24px] max-h-[75dvh]`,
 *     the `px-4 pt-4 pb-2` header, the `min-h-0 grow overflow-y-auto px-4 pb-4`
 *     body). `position: fixed`, the overlay button and the portal are dropped
 *     so the states stack down one page; the geometry that decides whether the
 *     Russian fits — 90% of the viewport capped at 480px, `px-4` either side —
 *     is kept exactly. The close button is the REAL IconButton + CloseIcon.
 *   · Fact (line 93) and FacebookMark (line 86), which are local to that file
 *     and cannot be imported.
 *   · the card body (lines 232-480), because it is inline JSX with no inner
 *     component to import.
 *
 * EVERYTHING ELSE IS THE REAL CODE: TargetAvatar, StatusPill, Button,
 * SkeletonList, IconButton, the real icons, and — the part that matters most
 * for a translation measurement — every SENTENCE is produced by the same
 * expression the component uses, through the same helpers: t(), counted(),
 * formatTimeHe(), ltr(), toLocaleDateString('he-IL'), and explainFailure()
 * from ErrorDetail.tsx, which is where the longest reason on this window
 * actually comes from.
 *
 * ─── THE SHAPES CHOSEN, AND WHY ───────────────────────────────────────────
 *
 * Width decides whether a box holds its text, so each case is the widest the
 * window can really produce:
 *
 *   1  THE RATE-LIMIT FAILURE — explainFailure()'s `rate_limited` branch
 *      (ErrorDetail.tsx:141) is the longest advice in that file at 290
 *      characters, and it is a real row: the worker writes
 *      `error: 'rate_limited: …'` on a publication Facebook stopped mid-way.
 *      Both links, both actions (canRetry true AND status !== published), the
 *      longest Hebrew group name, and a 56px avatar.
 *   2  THE REFERENCE'S OWN WINDOW — a published row: the green
 *      "פורסם בהצלחה" pill, the hour-and-date line, and the duration line
 *      through counted(), which is the only place "משך: שתי שניות" appears.
 *      Three facts, two links, no action.
 *   3  THE LONGEST STATUS THE PILL ITSELF DRAWS. `published`, `failed` and
 *      `needs_attention` never reach StatusPill here — they take the two
 *      reference pills — so the widest `long` label this window can show is
 *      `scheduled`'s "Scheduled · מתוזמן" (types.ts:853), on a row that is
 *      still waiting and therefore still offers "בטל פרסום".
 *   4  A GROUP THAT WAS DELETED: the title falls back to
 *      "הקבוצה נמחקה מהרשימה", the "קבוצה" column reads "נמחקה" and no group
 *      link is drawn. The longest title fallback and the shortest value in the
 *      same window.
 *   5  A CYRILLIC GROUP NAME in an RTL window, which is the shape
 *      render-card.tsx names: "Город Арад , глазами жителей", with
 *      awaiting_confirmation ("ממתין לאישור סופי") beside it.
 *   6  THE ACTIVITY LOG, both ways. Closed is what the window opens as
 *      (`logOpen` is useState(false)); open is one tap away and carries the
 *      worker's own messages verbatim, which is the one place this window
 *      shows an untranslated composed sentence at full length. Both are drawn
 *      and both are labelled.
 *   7  THE TWO STATES WITH NO ROW: the loading skeleton and the error line,
 *      both of which the real component does draw once its portal exists.
 *
 * NOTHING HERE TOUCHES THE NETWORK, publishes anything or reads a clock: the
 * instants are literals, so the window is the same on every run.
 */
import { createElement as h } from 'react';
import { renderSnapshot } from './render-html';
import { ActivityDetailSheet } from '@/components/social/ActivityDetailSheet';
import { explainFailure, TONE_CLASS } from '@/components/social/ErrorDetail';
import { TargetAvatar } from '@/components/social/TargetAvatar';
import { Button, IconButton, SkeletonList, StatusPill } from '@/components/social/ui';
import {
  AlarmClockIcon,
  CalendarIcon,
  CheckCircleIcon,
  ChevronDownIcon,
  ClipboardListIcon,
  ClockIcon,
  CloseIcon,
  ExternalLinkIcon,
  ImageIcon,
  LayersIcon,
  TextIcon,
  UsersIcon,
  VideoIcon,
  XCircleIcon,
} from '@/components/icons';
import { t } from '@/lib/social/i18n';
import { counted, formatTimeHe, ltr } from '@/lib/social/time';
import type { QueueStatus } from '@/lib/social/types';

/* ── Sheet(placement='center'), without the portal and the fixed position ── */
function SheetShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="mx-auto flex w-[90%] max-w-[480px] flex-col overflow-hidden rounded-[24px] border border-brand-500/10 bg-ink-850 shadow-[0_8px_24px_-8px_rgba(13,38,76,0.14),0_24px_60px_-20px_rgba(13,38,76,0.28)]">
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 pt-4 pb-2">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-extrabold leading-tight text-mist-100">
          <LayersIcon aria-hidden className="h-5 w-5 shrink-0 text-brand-500" />
          <span dir="auto" className="min-w-0 truncate">
            {title}
          </span>
        </h2>
        <IconButton label="סגור" onClick={() => undefined} className="shrink-0 rounded-full bg-brand-500/10 text-brand-500">
          <CloseIcon className="h-5 w-5" />
        </IconButton>
      </header>
      <div className="min-h-0 grow overflow-y-auto px-4 pb-4">{children}</div>
    </div>
  );
}

/* ── ActivityDetailSheet.tsx:93, which is local to that file ── */
function Fact({ icon, label, children }: { icon: React.ReactNode; label: string; children: React.ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col items-center gap-1 px-1 text-center">
      <span className="text-brand-500">{icon}</span>
      <span className="text-[11px] font-extrabold leading-4 text-mist-100">{label}</span>
      <span dir="auto" className="min-w-0 max-w-full truncate text-[11px] font-bold leading-4 text-mist-300">
        {children}
      </span>
    </div>
  );
}

/* ── ActivityDetailSheet.tsx:86 ── */
function FacebookMark({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="currentColor" aria-hidden className={className}>
      <path d="M13.5 21v-8h2.7l.4-3.1h-3.1V7.9c0-.9.25-1.5 1.55-1.5H16.7V3.6c-.29-.04-1.27-.12-2.4-.12-2.38 0-4 1.45-4 4.11V9.9H7.6V13h2.7v8z" />
    </svg>
  );
}

/* The three content kinds contentKind() can answer (line 72). */
const KIND = {
  video: { label: 'וידאו', Icon: VideoIcon },
  image: { label: 'תמונה', Icon: ImageIcon },
  text: { label: 'טקסט', Icon: TextIcon },
} as const;

const HE_GROUP = 'בעלי עסקים וממתבים בבאר שבע והסביבה — קנייה, מכירה והמלצות';
const RU_GROUP = 'Город Арад , глазами жителей';

type Row = {
  status: QueueStatus;
  error?: string | null;
  skip_reason?: string | null;
  permalink?: string | null;
  claimed_at?: string | null;
  published_at?: string | null;
  scheduled_at?: string | null;
  postTitle?: string | null;
  kind: keyof typeof KIND;
  target: { name: string; url?: string | null } | null;
};

/* The window's own body, as ActivityDetailSheet.tsx:232-480 draws it. */
function Detail({ row, log }: { row: Row; log: { id: number; level: string; message: string; at: string }[] }) {
  const failure = explainFailure({ status: row.status, error: row.error ?? null, skip_reason: row.skip_reason ?? null } as never);
  const postUrl = row.permalink ?? null;
  const groupUrl = row.target?.url ?? null;
  const when = row.published_at ?? row.scheduled_at ?? null;
  const kind = KIND[row.kind];
  const seconds =
    row.claimed_at && row.published_at
      ? Math.round((new Date(row.published_at).getTime() - new Date(row.claimed_at).getTime()) / 1000)
      : null;
  const ok = row.status === 'published';
  const bad = row.status === 'failed' || row.status === 'needs_attention';
  return (
    <div className="pb-1">
      <div className="rounded-[18px] border border-brand-500/15 bg-ink-850 p-3 shadow-[0_2px_10px_-6px_rgba(13,38,76,0.25)]">
        <div className="flex min-w-0 items-start gap-3">
          <TargetAvatar name={row.target?.name ?? 'קבוצה'} size={56} />
          <div className="min-w-0 grow">
            <p dir="auto" className="truncate text-[15px] font-extrabold leading-5 text-mist-100">
              {row.postTitle || row.target?.name || 'הקבוצה נמחקה מהרשימה'}
            </p>
            <div className="mt-1 flex min-w-0 flex-wrap items-center justify-between gap-x-2 gap-y-1">
              {ok ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-success-500/10 px-2 py-1 text-[11px] font-extrabold whitespace-nowrap text-success-400">
                  <CheckCircleIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  פורסם בהצלחה
                </span>
              ) : bad ? (
                <span className="inline-flex shrink-0 items-center gap-1 rounded-full bg-error-500/10 px-2 py-1 text-[11px] font-extrabold whitespace-nowrap text-error-400">
                  <XCircleIcon aria-hidden className="h-3.5 w-3.5 shrink-0" />
                  פרסום נכשל
                </span>
              ) : (
                <span className="shrink-0">
                  <StatusPill status={row.status} long />
                </span>
              )}
              <div className="order-first flex min-w-0 grow flex-col items-end gap-0.5 text-[11px] font-bold leading-4 text-mist-300">
                {when && (
                  <p className="flex min-w-0 items-center gap-x-1 whitespace-nowrap">
                    <ClockIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                    {ltr(formatTimeHe(when))}
                    <span aria-hidden className="px-0.5 text-ink-600">
                      |
                    </span>
                    <CalendarIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                    {ltr(new Date(when).toLocaleDateString('he-IL', { day: '2-digit', month: '2-digit', year: 'numeric' }))}
                  </p>
                )}
                {seconds !== null && seconds > 0 && seconds < 3600 && (
                  <p className="flex min-w-0 items-center gap-x-1 whitespace-nowrap">
                    <AlarmClockIcon aria-hidden className="h-3.5 w-3.5 shrink-0 text-brand-500" />
                    משך: {counted(seconds, 'שנייה אחת', 'שניות', 'שתי שניות')}
                  </p>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="mt-3 grid grid-cols-3 divide-x divide-x-reverse divide-ink-700 border-t border-ink-700 pt-3 [&>*]:min-w-0">
          <Fact icon={<FacebookMark className="h-[18px] w-[18px]" />} label={t('פלטפורמה')}>
            Facebook
          </Fact>
          <Fact icon={<kind.Icon aria-hidden className="h-[18px] w-[18px]" />} label={t('סוג תוכן')}>
            {kind.label}
          </Fact>
          <Fact icon={<UsersIcon aria-hidden className="h-[18px] w-[18px]" />} label={t('קבוצה')}>
            {row.target ? (
              <a href="/social/groups/1" className="truncate hover:text-brand-500">
                {row.target.name}
              </a>
            ) : (
              'נמחקה'
            )}
          </Fact>
        </div>
      </div>

      {failure && (failure.headline || failure.advice) && (row.error || row.skip_reason) && (
        <div className="mt-2.5 rounded-[18px] border border-ink-700 bg-ink-800 p-3">
          <p className={`text-xs font-bold ${TONE_CLASS[failure.tone]}`}>{failure.headline}</p>
          <p className="mt-0.5 text-xs leading-relaxed text-mist-300">{failure.advice}</p>
        </div>
      )}

      {(postUrl || groupUrl) && (
        <div className="mt-2.5 grid grid-cols-1 gap-2 min-[360px]:grid-cols-2 [&>*]:min-w-0">
          {postUrl && (
            <a
              href={postUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-full bg-brand-500 px-2 text-[12px] font-extrabold text-on-brand"
            >
              <FacebookMark className="h-4 w-4 shrink-0" />
              <span className="truncate">{t('פתח את הפוסט')}</span>
              <ExternalLinkIcon aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-80" />
            </a>
          )}
          {groupUrl && (
            <a
              href={groupUrl}
              target="_blank"
              rel="noopener noreferrer"
              className={`inline-flex min-h-11 min-w-0 items-center justify-center gap-1 rounded-full border border-brand-500/40 bg-ink-850 px-2 text-[12px] font-extrabold text-brand-500 ${
                postUrl ? '' : 'min-[360px]:col-span-2'
              }`}
            >
              <UsersIcon aria-hidden className="h-4 w-4 shrink-0" />
              <span className="truncate">{t('פתח את הקבוצה')}</span>
              <ExternalLinkIcon aria-hidden className="h-3.5 w-3.5 shrink-0 opacity-80" />
            </a>
          )}
        </div>
      )}

      {(failure?.canRetry || row.status !== 'published') && (
        <div className="mt-2.5 flex flex-wrap items-center gap-2">
          {failure?.canRetry && (
            <Button size="sm" onClick={() => undefined}>
              {t('נסה שוב')}
            </Button>
          )}
          {row.status !== 'published' && (
            <Button size="sm" variant="secondary" onClick={() => undefined}>
              {t('בטל פרסום')}
            </Button>
          )}
        </div>
      )}

      {log.length > 0 && (
        <div className="mt-2.5 overflow-hidden rounded-[18px] border border-brand-500/15 bg-ink-850">
          <button type="button" aria-expanded={false} className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-start">
            <span className="inline-flex min-w-0 items-center gap-2 text-[13px] font-extrabold text-mist-100">
              <ClipboardListIcon aria-hidden className="h-[18px] w-[18px] shrink-0 text-brand-500" />
              <span className="truncate">יומן פעילות ({log.length})</span>
            </span>
            <ChevronDownIcon aria-hidden className="h-5 w-5 shrink-0 text-brand-500 transition-transform" />
          </button>
        </div>
      )}
    </div>
  );
}

/* The same log panel with `logOpen` true — one tap from the state above. */
function LogOpen({ log }: { log: { id: number; level: string; message: string; at: string }[] }) {
  return (
    <div className="mt-2.5 overflow-hidden rounded-[18px] border border-brand-500/15 bg-ink-850">
      <button type="button" aria-expanded className="flex min-h-11 w-full items-center justify-between gap-2 px-3 text-start">
        <span className="inline-flex min-w-0 items-center gap-2 text-[13px] font-extrabold text-mist-100">
          <ClipboardListIcon aria-hidden className="h-[18px] w-[18px] shrink-0 text-brand-500" />
          <span className="truncate">יומן פעילות ({log.length})</span>
        </span>
        <ChevronDownIcon aria-hidden className="h-5 w-5 shrink-0 rotate-180 text-brand-500 transition-transform" />
      </button>
      <ul className="border-t border-ink-700 px-3 py-2">
        {log.map((e) => (
          <li key={e.id} className="flex min-w-0 items-start gap-2 py-1.5">
            <span
              aria-hidden
              className={`mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full ${
                e.level === 'error' ? 'bg-error-400' : e.level === 'warn' ? 'bg-warning-400' : 'bg-brand-500'
              }`}
            />
            <span className="min-w-0 grow">
              <span dir="auto" className="block text-[12px] font-bold leading-4 text-mist-100">
                {e.message}
              </span>
              <span className="block text-[11px] leading-4 text-mist-500">{ltr(formatTimeHe(e.at))}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}

/*
 * The log for one row, as listQueueActivity returns it. Every message here is
 * a real writer's real format string with its placeholders filled — the file
 * and line are named beside each — because the whole point of this surface is
 * that its sentences are composed at run time and exist in no file.
 */
const LOG = [
  /* rules.ts:896, through accountGapLabel(600). */
  { id: 1, level: 'info', message: 'נדחה כדי לשמור מרווח של 10 דק׳ בין פרסומים', at: '2026-11-16T08:05:00Z' },
  /* rules.ts:781 — the campaign's own repeat floor. */
  { id: 2, level: 'info', message: 'פורסם לקבוצה הזו לאחרונה — החזרה הבאה בעוד כ-12 שעות.', at: '2026-11-16T08:15:00Z' },
  /* worker.ts:500 — the retry line, the longest the worker writes per row. */
  {
    id: 3,
    level: 'warn',
    message: 'ניסיון 2 לפרסום נכשל. לא מצאתי את תיבת "כתבו משהו…" בקבוצה. ייתכן שאין הרשאת פרסום או ש-Facebook שינתה את הממשק.',
    at: '2026-11-16T08:17:00Z',
  },
  /* graph.ts:151 — `${reason} — הפרסום מושהה ויתחדש ב-${stampText(until)}.` */
  { id: 4, level: 'error', message: 'פייסבוק ביקשה להאט את קצב הפרסום — הפרסום מושהה ויתחדש ב-16.11.2026, 11:20.', at: '2026-11-16T08:18:00Z' },
  /* rules.ts:762 — the duplicate guard. */
  { id: 5, level: 'info', message: `הפוסט הזה כבר פורסם ל-"${HE_GROUP}".`, at: '2026-11-16T11:20:00Z' },
  /* worker.ts:470. */
  { id: 6, level: 'info', message: `פורסם ל-"${HE_GROUP}" (גרסה ב׳)`, at: '2026-11-16T11:22:00Z' },
];

const CASES: { id: string; what: string; row: Row; log: typeof LOG }[] = [
  {
    id: 'rate-limited',
    what: 'the longest advice in ErrorDetail.tsx (207 chars), both actions, the group link',
    /*
     * needs_attention, not failed, and that is the real row: social-worker.ts
     * writes needs_attention for a rate-limited publication EXACTLY when the
     * post may already be live, and ErrorDetail.tsx:141 answers it with its
     * longest advice. A `failed` rate limit falls through to the four-word
     * note at line 205 instead, which is the shortest.
     */
    row: {
      status: 'needs_attention',
      error: 'פייסבוק הגביל את קצב הפרסום. הטקסט כבר לא היה בחלון, ולכן אי אפשר לדעת אם הפוסט עלה.',
      permalink: null,
      scheduled_at: '2026-11-16T08:15:00Z',
      kind: 'image',
      postTitle: null,
      target: { name: HE_GROUP, url: 'https://www.facebook.com/groups/1234567890' },
    },
    log: LOG,
  },
  {
    id: 'no-compose-box',
    what: "the owner's own failure — ErrorDetail.tsx:198, the second-longest advice",
    row: {
      status: 'failed',
      error: 'לא מצאתי את תיבת "כתבו משהו…" בקבוצה.',
      permalink: null,
      scheduled_at: '2026-11-16T08:40:00Z',
      kind: 'image',
      postTitle: null,
      target: { name: RU_GROUP, url: 'https://www.facebook.com/groups/2234567890' },
    },
    log: LOG.slice(0, 4),
  },
  {
    id: 'published',
    what: "the reference's own window — green pill, hour, date and duration",
    row: {
      status: 'published',
      error: null,
      permalink: 'https://www.facebook.com/groups/1234567890/posts/999',
      claimed_at: '2026-11-16T11:21:58Z',
      published_at: '2026-11-16T11:22:00Z',
      kind: 'video',
      postTitle: 'מבצע ניקוי ספות וריפודים — נובמבר, כולל איסוף והחזרה עד הבית',
      target: { name: HE_GROUP, url: 'https://www.facebook.com/groups/1234567890' },
    },
    log: LOG,
  },
  {
    id: 'scheduled',
    what: 'the widest `long` status the pill itself draws, and "בטל פרסום"',
    row: {
      status: 'scheduled',
      error: null,
      scheduled_at: '2026-11-17T06:30:00Z',
      kind: 'text',
      postTitle: null,
      target: { name: HE_GROUP, url: 'https://www.facebook.com/groups/1234567890' },
    },
    log: [],
  },
  {
    id: 'group-deleted',
    what: 'no group row left: the title fallback and "נמחקה"',
    row: {
      status: 'skipped',
      skip_reason: 'היעד "בעלי עסקים וממתבים בבאר שבע והסביבה" כבוי.',
      scheduled_at: '2026-11-16T09:00:00Z',
      kind: 'image',
      postTitle: null,
      target: null,
    },
    log: [],
  },
  {
    id: 'cyrillic',
    what: 'a Cyrillic group name in an RTL window, awaiting_confirmation beside it',
    row: {
      status: 'awaiting_confirmation',
      error: null,
      scheduled_at: '2026-11-16T10:40:00Z',
      kind: 'image',
      postTitle: null,
      target: { name: RU_GROUP, url: 'https://www.facebook.com/groups/2234567890' },
    },
    log: LOG.slice(0, 3),
  },
];

const label = (text: string) => h('p', { className: 'mx-auto mb-1 mt-5 max-w-[480px] px-2 text-[11px] text-mist-500' }, text);

const body = renderSnapshot(
  h(
    'div',
    null,
    ...CASES.flatMap((c) => [
      label(`${c.id} — ${c.what}`),
      h('div', { key: c.id, 'data-sheet-case': c.id }, h(SheetShell, { title: t('פרטי הפרסום'), children: h(Detail, { row: c.row, log: c.log }) })),
    ]),
    label('log-open — the same panel one tap later, with the worker’s own messages'),
    h(
      'div',
      { 'data-sheet-case': 'log-open' },
      h(SheetShell, { title: t('פרטי הפרסום'), children: h('div', { className: 'pb-1' }, h(LogOpen, { log: LOG })) }),
    ),
    label('loading — the state the real component DOES render once its portal exists'),
    h(
      'div',
      { 'data-sheet-case': 'loading' },
      h(SheetShell, { title: t('פרטי הפרסום'), children: h('div', { className: 'pb-1' }, h(SkeletonList, { rows: 2 })) }),
    ),
    label('error — the read failed'),
    h(
      'div',
      { 'data-sheet-case': 'error' },
      h(SheetShell, { title: t('פרטי הפרסום'), children: h('div', { className: 'pb-1' }, h('p', { className: 'py-4 text-sm text-error-400' }, 'לא הצלחנו לטעון את פרטי הפרסום.')) }),
    ),
    /* THE REAL COMPONENT, both states. It draws its themeAnchor and nothing
       else — see this file's header — and it is here so the fixture breaks if
       its export does. */
    label('the real <ActivityDetailSheet>, closed and open — draws only its theme anchor on the server'),
    h(
      'div',
      { 'data-sheet-case': 'real-component' },
      h(ActivityDetailSheet, { queueId: null, onClose: () => undefined }),
      h(ActivityDetailSheet, { queueId: 'q-1', onClose: () => undefined, onChanged: () => undefined }),
    ),
  ),
);

process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">
  <main class="crm-page mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 py-5">${body}</main>
</div>
</body></html>`,
);
