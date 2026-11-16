/*
 * ─── THE LIVE BOARD, RENDERED SO A BROWSER CAN MEASURE IT ─────────────────
 *
 * LiveBoard has never been measured in Russian. The real component with the
 * real compiled Tailwind, through renderToStaticMarkup — anything
 * hand-written here would be measuring a copy, and a copy is exactly what
 * stops failing when the component changes.
 *
 * HOW THE PROPS ARE BUILT. One call site renders it in the app today:
 *
 *   src/components/social/PostEditor.tsx:927
 *     {(started || postId) && (
 *       <Card title="התקדמות הפרסום">
 *         <LiveBoard postId={savedId} compact />
 *       </Card>
 *     )}
 *
 * so: a post id and `compact`, inside a <Card> the editor owns. That pair is
 * case 1, mirrored exactly — the outer Card's own title is the editor's, not
 * the board's, and the board's header is suppressed by `compact`.
 *
 * The NON-compact shape is case 2. src/app/social/page.tsx:2321 says out loud
 * that the dashboard dropped this board, so nothing in the app passes
 * `compact={false}` right now — but the component still ships that branch,
 * and it is the branch with all three of its own captions in it: the Card
 * title ("פרסום בזמן אמת" → "Публикация в реальном времени", 14 → 29
 * characters), the subtitle ("מתעדכן לבד כל 4 שניות" → "Обновляется сам
 * каждые 4 секунды") and the header action link ("היסטוריה" → "История").
 * That header is `flex items-start justify-between gap-3` with a `truncate`
 * <h2> on the left and a `shrink-0` action on the right — the one box on this
 * component that can genuinely clip, so it is the reason this fixture exists.
 *
 * ─── WHAT THE REAL COMPONENT CAN AND CANNOT PUT ON SCREEN ────────────────
 *
 * `rows`, `error`, `updatedAt`, `gates` and `projected` are all useState, and
 * every one of them is filled from an effect (queueGates() once, then
 * listLiveQueue() on a 4s beat). renderToStaticMarkup runs no effects, so
 * cases 1 and 2 are the board's FIRST PAINT and nothing else: rows === null,
 * error === null, so <SkeletonList rows={3} /> and a <Freshness at={null} />
 * that draws nothing. That is a true and useful shape — it is what every
 * Russian customer sees for the first four seconds — but it is not the loaded
 * board.
 *
 * So case 3 renders the board's own `content` composition with the REAL
 * components it is built from, at the states the effects would reach:
 *
 *     {error && <div className="mb-3"><ErrorState message={error} onRetry={load} /></div>}
 *     {rows && <QueueSections rows={rows} … emptyAction={<ButtonLink …>} />}
 *     <Freshness at={updatedAt} className="mt-2.5" />
 *
 * ErrorState, QueueSections, ButtonLink and Freshness are all real exports —
 * no markup is hand-written, only the one `mb-3` spacer div and the two class
 * names LiveBoard itself passes. Reported as partially_rendered, because the
 * composition is this fixture's and not the component's.
 *
 * ─── THE SHAPES CHOSEN, AND WHY ──────────────────────────────────────────
 *
 * Width is what decides whether a box holds its text, so:
 *
 *   · THE THREE ERRORS `load()` CAN REALLY SHOW. It calls
 *     friendlyMessage(err, 'טעינה נכשלה.'), so the messages here are computed
 *     by the real classifier from the real raw failures rather than typed
 *     out: "Failed to fetch" (a phone between cells, by far the most common),
 *     a missing relation (the longest message in errors.ts that reaches a
 *     board — it carries the untranslatable token `supabase/social-latest.sql`
 *     in the middle of a Russian sentence, and the Russian is 8 characters
 *     longer than the Hebrew), and the bare fallback. Each one draws the
 *     "נסו שוב" → "Повторите" button under it.
 *   · THE EMPTY BOARD, which is what a brand-new account has: QueueSections'
 *     default empty title and description with LiveBoard's own
 *     emptyAction — <ButtonLink href="/social/posts/new">צרו פוסט ראשון</…>
 *     → "Создайте первый пост", a primary button 18 characters wider in
 *     Russian than in Hebrew inside a centred empty state.
 *   · FRESHNESS AT FOUR AGES, because agoHe() branches on the gap and each
 *     branch is a different length: "זה עתה" → "только что", "לפני 47
 *     שניות", "לפני שתי דקות" (the dual, the form Russian has no equivalent
 *     of) and "לפני 3 שעות". A fixed instant per case, so the markup is
 *     deterministic — the component's own 1s interval never runs here.
 *
 * Nothing here touches the network, Facebook, Supabase or a database: no
 * effect runs, and `supabase` is null without the public env vars anyway.
 */
import Link from 'next/link';
import { renderToStaticMarkup } from 'react-dom/server';
import { LiveBoard } from '@/components/social/LiveBoard';
import { QueueSections } from '@/components/social/QueueSections';
import { ButtonLink, Card, ErrorState, Freshness } from '@/components/social/ui';
import { friendlyMessage } from '@/lib/social/errors';

/* Computed by the real classifier from the real raw throws, exactly as
   LiveBoard's catch does it — not typed out. */
const ERRORS: [string, string][] = [
  ['no connection', friendlyMessage(new TypeError('Failed to fetch'), 'טעינה נכשלה.')],
  ['schema behind', friendlyMessage(new Error('relation "public.social_queue" does not exist'), 'טעינה נכשלה.')],
  ['the bare fallback', friendlyMessage(new Error('ECONN something unrecognised'), 'טעינה נכשלה.')],
];

/*
 * The four ages agoHe() has a different sentence for. Fixed OFFSETS off the
 * render instant, not fixed instants: <Freshness> seeds `now` with
 * useState(() => Date.now()) and prints the gap, so an absolute stamp would
 * read a different sentence every time this file ran. An offset reads the
 * same one for ever, which is what a snapshot needs.
 */
const NOW = Date.now();
const AGES: [string, Date][] = [
  ['just now', new Date(NOW - 2_000)],
  ['47 seconds', new Date(NOW - 47_000)],
  ['the dual — two minutes', new Date(NOW - 120_000)],
  ['three hours', new Date(NOW - 3 * 3600_000)],
];

/*
 * The board's own card header, with the same strings and the same <Link>
 * class the component passes. Copied from LiveBoard.tsx, so the header the
 * composed cases below are measured in is the header it draws.
 */
const HistoryLink = (
  <Link href="/social/history" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-400">
    היסטוריה
  </Link>
);

const block = (label: string, node: React.ReactNode) => `
  <p style="color:#9aa;font:12px sans-serif;margin:14px 0 4px">${label}</p>
  <div class="board-probe">${renderToStaticMarkup(node)}</div>`;

const body = [
  /*
   * 1 — THE POST EDITOR'S OWN SHAPE, prop for prop: compact, inside the
   * editor's Card. First paint, so three skeleton rows.
   */
  block(
    "the post editor's board (compact, inside its own Card) — first paint",
    <Card title="התקדמות הפרסום">
      <LiveBoard postId="p-0001" compact />
    </Card>,
  ),
  /*
   * 2 — THE BOARD'S OWN HEADER. The branch the dashboard dropped and the
   * component kept: the truncating title, the subtitle under it and the
   * history link beside both.
   */
  block("the board's own card header (not compact) — first paint", <LiveBoard />),
  /*
   * 3 — THE STATES THE 4s BEAT REACHES, in the board's own composition with
   * the board's own real parts. See the header comment.
   */
  ...ERRORS.map(([what, message]) =>
    block(
      `a read that failed (${what}) — ErrorState + Freshness, as the board composes them`,
      <Card title="פרסום בזמן אמת" subtitle="מתעדכן לבד כל 4 שניות" action={HistoryLink}>
        <div className="mb-3">
          <ErrorState message={message} onRetry={() => undefined} />
        </div>
        <Freshness at={AGES[1][1]} className="mt-2.5" />
      </Card>,
    ),
  ),
  /*
   * The empty board a brand-new account sees, with LiveBoard's own
   * emptyAction — the one control this component contributes to that state.
   */
  block(
    "an account with nothing in the queue — LiveBoard's own emptyAction",
    <Card title="פרסום בזמן אמת" subtitle="מתעדכן לבד כל 4 שניות" action={HistoryLink}>
      <QueueSections rows={[]} emptyAction={<ButtonLink href="/social/posts/new">צרו פוסט ראשון</ButtonLink>} />
      <Freshness at={AGES[0][1]} className="mt-2.5" />
    </Card>,
  ),
  ...AGES.map(([label, at]) => block(`the freshness line — ${label}`, <Freshness at={at} className="mt-2.5" />)),
].join('');

process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">
  <main class="mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 py-5">${body}</main>
</div>
</body></html>`,
);
