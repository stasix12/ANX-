/*
 * THE QUEUE TUNER, AS A MEASURABLE PAGE — src/components/social/QueueTunerSheet.tsx.
 *
 * ─── WHY THIS FIXTURE IS NOT ONE `renderToStaticMarkup(<QueueTunerSheet/>)` ──
 *
 * It was tried first, and it draws NOTHING. Two gates, both of them a client
 * effect:
 *
 *   1. <Sheet> (ui.tsx:1208) holds `const [mounted, setMounted] = useState(false)`
 *      with `useEffect(() => setMounted(true), [])`, and returns the bare
 *      `themeAnchor` span while `!mounted` — because its panel is portalled to
 *      document.body, which does not exist on the server. Under
 *      renderToStaticMarkup the effect never runs, so EVERY sheet in this
 *      product renders as `<span hidden aria-hidden></span>`. That is why no
 *      existing render-*.tsx mounts a Sheet.
 *   2. QueueTunerSheet itself opens with `loading = true` and fills `snap`
 *      from liveQueuePlan() / getLimits() / getBrowserSettings() /
 *      countPublishedSince() / lastPublishedAt() / getCampaign() inside
 *      useEffect → load(). Server-rendered, that effect never fires, so even
 *      with the portal solved the body is <Loading/> and nothing else.
 *
 * So this fixture does what the harness asks for in that case: it renders the
 * REAL presentational pieces the sheet composes — Loading, EmptyState, Notice,
 * Field, Button, IconButton, TargetAvatar, inputClass, the real CloseIcon /
 * ClockIcon / SearchIcon / TrashIcon / SpinnerIcon — and transcribes the
 * sheet's own inline JSX (it has no inner components to import: Stat, Clock
 * and Num are local to that file and the four sections are inline) class
 * string for class string, together with the <Sheet> panel chrome it is drawn
 * inside. Every SENTENCE is produced by the same expression the component
 * uses, through the same helpers — counted(), agree(), gapChoiceLabel(),
 * formatInstantHe(), formatDayMonthHe() — so what the DOM translator matches
 * here is byte-identical to what it matches in the running app.
 *
 * WHAT IS REPRODUCED RATHER THAN IMPORTED, and therefore what a reader has to
 * keep in step with ui.tsx: SheetShell below. `position: fixed` and the
 * portal are dropped so the states can be stacked down one page; every other
 * class on the panel, the drag handle, the header, the scrolling body and the
 * footer is copied from Sheet(placement='sheet', size='lg'), which is how the
 * library screen, the dashboard and the campaigns screen all open this sheet.
 * The geometry that decides whether the Russian fits is the panel's: full
 * viewport width up to md, `md:max-w-2xl` (672px) above it, `px-4` either side
 * of the content.
 *
 * ─── THE SHAPES CHOSEN, AND WHY ──────────────────────────────────────────
 *
 * Width is what decides whether a box holds its text, so every figure here is
 * the widest the screen can really produce:
 *
 *   · 500 waiting rows with `truncated` on. LIVE_QUEUE_LIMIT in client.ts is
 *     500, so that is the largest number "ממתינים בתור" can ever print, and
 *     `truncated` also swaps its label to the longer "הקרובים בתור".
 *   · 292 groups in the queue. The owner's own screenshot, quoted in
 *     QuickPublishSheet's notes ("292 groups at 'a minute' is five hours") —
 *     three digits in the heading, in the add-list cap line, and in the
 *     per-group chips.
 *   · a 10-minute gap (the shipped default) against a 20-minute group
 *     surcharge, which is the pair that lights GAP_SPLIT_NOTE — the longest
 *     single explanatory line in the file after `slowerThanSettings`.
 *   · a queue stamped 30 minutes apart while the chosen mode is 10, which is
 *     the state `slowerThanSettings` exists for: 69 words, the longest line
 *     this sheet can show, and it carries a quoted control name inside it.
 *   · all three `ceilings` lines at once, each with four-digit counts.
 *   · group names of the three shapes that break a row: the longest realistic
 *     Hebrew board name, the same in Cyrillic inside an RTL list, and one
 *     unspaced Russian compound (the shape render-discovery.tsx uses) which
 *     cannot wrap at all.
 *   · four-digit `pending` per group (1 240 rows waiting for one group is
 *     reachable on a repeating round).
 *   · the deadline sentence from withDeadline() in the error Notice — the
 *     longest error this sheet can raise — and the counting footer label.
 *
 * NOTHING HERE TOUCHES THE NETWORK, writes anything, or reads a clock: NOW is
 * pinned, so the instants are the same on every run.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { ClockIcon, CloseIcon, SearchIcon, SpinnerIcon, TrashIcon } from '@/components/icons';
import { TargetAvatar } from '@/components/social/TargetAvatar';
import { Button, EmptyState, Field, IconButton, Loading, Notice, inputClass } from '@/components/social/ui';
import { gapChoiceLabel } from '@/lib/social/campaign-schedule';
import { agree, counted, formatDayMonthHe, formatInstantHe } from '@/lib/social/time';
import type { SocialTarget } from '@/lib/social/types';

/* The instant every stamp below is computed from: 08:00 in Israel. */
const NOW = Date.parse('2026-11-16T06:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

/* ── QueueTunerSheet's own three helpers, verbatim (they are local to it) ── */

function Clock({ iso: at, withDay = false }: { iso: string; withDay?: boolean }) {
  return (
    <span dir="ltr" className="inline-block tabular-nums font-bold">
      {withDay ? `${formatDayMonthHe(at)} ${formatInstantHe(at)}` : formatInstantHe(at)}
    </span>
  );
}

function Num({ children }: { children: number }) {
  return (
    <span dir="ltr" className="inline-block tabular-nums font-bold">
      {children}
    </span>
  );
}

function Stat({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="rounded-xl bg-ink-900 px-3 py-2.5">
      <p className="text-[11px] font-bold text-mist-500">{label}</p>
      <p className="mt-0.5 text-base font-extrabold leading-tight text-mist-100">{children}</p>
    </div>
  );
}

/** The sheet's own counted noun. */
const posts = (n: number) => counted(n, 'פרסום אחד', 'פרסומים', 'שני פרסומים');

/*
 * ui.tsx Sheet(placement='sheet', size='lg') without the portal and without
 * `fixed`, so several states can be measured on one page. Classes copied from
 * ui.tsx:1440-1525.
 */
function SheetShell({ title, footer, children }: { title: string; footer?: React.ReactNode; children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className="mx-auto flex max-h-[85svh] flex-col rounded-t-sheet border border-ink-700 bg-ink-800 md:max-h-[80svh] md:rounded-card md:max-w-2xl"
    >
      <div aria-hidden className="mx-auto mt-2 h-1 w-10 shrink-0 rounded-full bg-ink-600 md:hidden" />
      <header className="flex shrink-0 items-center justify-between gap-3 px-4 py-3.5">
        <h2 className="flex min-w-0 items-center gap-2 text-base font-extrabold leading-tight text-mist-100">
          <span dir="auto" className="min-w-0 truncate">
            {title}
          </span>
        </h2>
        <IconButton label="סגור" className="-me-2">
          <CloseIcon className="h-5 w-5" />
        </IconButton>
      </header>
      <div className={`min-h-0 grow overflow-y-auto px-4 ${footer ? 'pb-4' : 'pb-[calc(1rem+var(--safe-b))]'}`}>{children}</div>
      {footer && (
        <footer className="shrink-0 border-t border-ink-700 bg-ink-800 px-4 pt-3 pb-[calc(0.75rem+var(--safe-b))]">{footer}</footer>
      )}
    </div>
  );
}

/* ── the groups in the queue ───────────────────────────────────────────── */

const target = (id: string, name: string, extra: Partial<SocialTarget> = {}): SocialTarget =>
  ({
    id,
    account_id: null,
    channel: 'facebook_group',
    external_id: id,
    name,
    url: '',
    tasks: [],
    permission_status: 'ok',
    can_api_publish: false,
    enabled: true,
    notes: '',
    last_synced_at: null,
    city: 'באר שבע',
    ...extra,
  }) as SocialTarget;

/** Three names and three counts: the longest Hebrew board name the owner
    really has, the same thing in Cyrillic inside an RTL list, and an unspaced
    Russian compound that has nowhere to wrap. */
const inQueue: { target: SocialTarget; pending: number; nextAt: string }[] = [
  {
    target: target('g1', 'קבוצת תושבי שכונת נווה זאב ורמות באר שבע — קניה, מכירה, המלצות ועסקים מקומיים'),
    pending: 1240,
    nextAt: iso(NOW + 10 * 60_000),
  },
  { target: target('g2', 'Беэр-Шева объявления, барахолка и советы жителей'), pending: 318, nextAt: iso(NOW + 24 * 3600_000) },
  { target: target('g3', 'БеэрШеваОбъявленияКуплюПродамОтдамБесплатноБарахолкаЮгИзраиля'), pending: 7, nextAt: iso(NOW + 95 * 60_000) },
];

/** The ones offered for adding — the add list is capped at ADD_LIST_LIMIT. */
const offered: SocialTarget[] = [
  target('a1', 'אופקים ביחד — קהילת העסקים והתושבים, המלצות וקניה מכירה'),
  target('a2', 'Арад и окрестности — объявления, барахолка, советы и помощь'),
  target('a3', 'דרושים דרום'),
  target('a4', 'Город Арад , глазами жителей'),
];

/* ── the numbers the sentences are computed from ───────────────────────── */

const ROWS = 500;
const GROUPS = 292;
const GAP = 600; /* 10 דק׳ — the shipped default */
const SURCHARGE = 1200; /* browser.groupMinGapSeconds, the shipped 20 דק׳ */
const STAMPED = 1800; /* what the rows are really stamped at: 30 דק׳ */
const ADD_LIST_LIMIT = 30;
const PICKED = 12;
const ADD_GAP = STAMPED;

const firstISO = iso(NOW + 60_000);
const naturalISO = iso(NOW + 37 * 60_000);
const lastNowISO = iso(NOW + 4 * 24 * 3600_000 + 15 * 60_000);
const lastNextISO = iso(NOW + 3 * 24 * 3600_000 + 2 * 3600_000);
const addFirstISO = iso(NOW + 4 * 24 * 3600_000 + 45 * 60_000);
const addLastISO = iso(NOW + 4 * 24 * 3600_000 + 6 * 3600_000 + 45 * 60_000);

/** `ceilings`, all three branches, exactly as the component builds them. */
const ceilings = [
  `בתקרה היומית שהגדרתם (${120} פרסומים ליום) נשארו היום ${14}, ובמרווח הזה ${146} מהתור אמורים לצאת היום. מה שמעבר לתקרה יידחה למחר.`,
  `${counted(38, 'פרסום אחד בתור יגיע', 'פרסומים בתור יגיעו', 'שני פרסומים בתור יגיעו')} לאותה קבוצה באותו יום מעבר לתקרה שהגדרתם ליעד (${2} ליום), ולכן ${agree(38, 'יידחה', 'יידחו')} למחר.`,
  `לסבב הזה הגדרתם תקרה של ${40} פרסומים ביום, ובמרווח הזה ${146} מהם אמורים לצאת היום. העודף יידחה למחר.`,
];

const splitNote = `המרווח שביקשתם קטן מהתוספת לקבוצות שמוגדרת אצלכם (${gapChoiceLabel(SURCHARGE)}). כדי שהמרווח בפועל יהיה ${gapChoiceLabel(GAP)}, התוספת לקבוצות תשתנה ל-${gapChoiceLabel(GAP)} והמרווח הכללי יתאפס.`;

const slowerThanSettings = `הפרסומים בתור חתומים במרווח של ${gapChoiceLabel(STAMPED)}, רחב יותר מהמרווח שבחרתם (${gapChoiceLabel(GAP)}). השורות שכבר בתור ימשיכו לצאת במרווח הרחב — שינוי המרווח לבדו לא מקדים חותמת שנכתבה. "הזיזו את התור" כאן למטה הוא מה שמצמיד אותן למרווח החדש.`;

const mismatch = `הפרסומים בתור מרווחים כרגע ב-${gapChoiceLabel(60)}, אבל ההגדרות דורשות ${gapChoiceLabel(GAP)} — לכן כל פרסום שמגיע מוקדם מדי נדחה שוב ושוב במקום לצאת. עדכון המרווח כאן מיישר בין השניים.`;

/** withDeadline()'s middle sentence: the longest error this sheet can raise. */
const deadlineError = `עודכנו ${47} מתוך ${218} פרסומים והחיבור איטי מדי להספיק את השאר. מה שעודכן נשמר — אפשר ללחוץ שוב כדי להמשיך מהנקודה הזו.`;

/* ── the four sections, as the sheet draws them ────────────────────────── */

function LiveSummary({ truncated }: { truncated: boolean }) {
  return (
    <section aria-label="מצב התור">
      {truncated && (
        <div className="mb-2">
          <Notice tone="warn">
            התור ארוך מדי בשביל מסך אחד, ולכן מוצגים כאן <Num>{ROWS}</Num> הפרסומים הקרובים בלבד — ויש בו יותר. שינוי המרווח יחול עליהם
            בלבד; מה שמעבר להם יישאר בזמנים שלו.
          </Notice>
        </div>
      )}
      <div className="grid grid-cols-3 gap-2 [&>*]:min-w-0">
        <Stat label={truncated ? 'הקרובים בתור' : 'ממתינים בתור'}>
          <Num>{ROWS}</Num>
        </Stat>
        <Stat label="הפרסום הבא">
          <Clock iso={firstISO} />
        </Stat>
        <Stat label="האחרון בתור">
          <Clock iso={lastNowISO} withDay />
        </Stat>
      </div>
    </section>
  );
}

function StartSection({ dirty }: { dirty: boolean }) {
  return (
    <section aria-label="מועד ההתחלה" className="space-y-2">
      <h3 className="text-sm font-extrabold uppercase tracking-wide text-mist-500">מתי מתחיל</h3>
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className="min-h-11 rounded-xl bg-ink-900 px-3 text-sm font-bold text-mist-100 transition-colors hover:bg-ink-800 disabled:opacity-40"
        >
          התחל עכשיו
        </button>
        {[15, 60].map((m) => (
          <button
            key={m}
            type="button"
            className="min-h-11 rounded-xl bg-ink-900 px-3 text-sm font-bold text-mist-100 transition-colors hover:bg-ink-800 disabled:opacity-40"
          >
            בעוד <span dir="ltr">{m}</span> דק׳
          </button>
        ))}
        {dirty && (
          <button
            type="button"
            className="min-h-11 rounded-xl px-3 text-sm font-bold text-mist-500 underline transition-colors hover:text-mist-300 disabled:opacity-40"
          >
            בטל שינוי
          </button>
        )}
      </div>
      <p className="text-xs text-mist-500">
        {dirty ? 'הפרסום הראשון יצא ב-' : 'הפרסום הראשון יוצא ב-'}
        <Clock iso={firstISO} />
        {dirty && (
          <>
            {' במקום ב-'}
            <Clock iso={naturalISO} />
          </>
        )}
        . כל השאר זזים איתו, באותו מרווח.
      </p>
    </section>
  );
}

function PaceSection({
  notices,
  dirty,
}: {
  notices: { mismatch?: boolean; slower?: boolean; split?: boolean; others?: number; ceilings?: boolean };
  dirty: boolean;
}) {
  return (
    <section aria-label="קצב הפרסום הנוכחי" className="space-y-3">
      <h3 className="text-sm font-extrabold uppercase tracking-wide text-mist-500">קצב הפרסום הנוכחי</h3>

      <div className="rounded-xl bg-ink-900 px-3 py-4 text-center">
        <p dir="auto" className="text-[32px] font-extrabold leading-none text-mist-100">
          {gapChoiceLabel(GAP)}
        </p>
        <p className="mt-1.5 text-xs font-bold text-mist-500">בין פרסום לפרסום</p>
        <p className="mt-2 text-[11px] font-bold leading-4 text-brand-400">
          נקבע לפי מצב הפרסום שנבחר בכרטיס הקמפיין (״מצב פרסום חכם״), ושם גם משנים אותו.
        </p>
      </div>

      <p className="text-xs leading-relaxed text-mist-500">
        זה המרווח שאתם קובעים, ותו לא. הוא לא הופך שום דבר ל״בטוח״ מול פייסבוק ולא מונע הגבלות — לפייסבוק אין מספר רשמי ומפורסם, ואף כלי לא
        יכול להבטיח שמספר מסוים לא יוביל להגבלה. המערכת תדחה פרסום שמגיע מוקדם מדי כדי לשמור מרווח של{' '}
        <span dir="auto" className="font-bold">
          {gapChoiceLabel(GAP)}
        </span>{' '}
        בין פרסומים. שינוי המרווח מתזמן מחדש כל פרסום שעדיין ממתין בתור.
      </p>

      {notices.mismatch && <Notice tone="warn">{mismatch}</Notice>}
      {notices.slower && <Notice tone="warn">{slowerThanSettings}</Notice>}
      {notices.split && <Notice tone="info">{splitNote}</Notice>}
      {notices.others ? (
        <Notice tone="warn">
          {notices.others === 1 ? (
            'בתור ממתין גם יעד אחד שאינו קבוצת פייסבוק רגילה.'
          ) : (
            <>
              בתור ממתינים גם <Num>{notices.others}</Num> יעדים שאינם קבוצת פייסבוק רגילה.
            </>
          )}{' '}
          המספר למעלה הוא המרווח שנאכף בין פרסומים לקבוצות; ליעדים האחרים ההגדרות ידרשו{' '}
          <span dir="auto" className="font-bold">
            {gapChoiceLabel(300)}
          </span>{' '}
          בלבד.
        </Notice>
      ) : null}

      {dirty && (
        <Notice tone="info">
          אחרי השינוי: הפרסום האחרון בתור יצא ב-
          <Clock iso={lastNextISO} withDay /> במקום ב-
          <Clock iso={lastNowISO} withDay />. הפרסום הראשון בתור יֵצֵא ב-
          <Clock iso={firstISO} />, וכל אחד אחריו{' '}
          <span dir="auto" className="font-bold">
            {gapChoiceLabel(GAP)}
          </span>{' '}
          אחרי הקודם.
        </Notice>
      )}

      {notices.ceilings && (
        <Notice tone="warn">
          <ul className="list-disc space-y-1 ps-4">
            {ceilings.map((line) => (
              <li key={line}>{line}</li>
            ))}
          </ul>
        </Notice>
      )}
    </section>
  );
}

function GroupsSection() {
  return (
    <section aria-label="קבוצות בתור" className="space-y-2">
      <h3 className="text-sm font-extrabold uppercase tracking-wide text-mist-500">
        קבוצות בתור (<Num>{GROUPS}</Num>)
      </h3>
      <ul className="divide-y divide-ink-700">
        {inQueue.map((t, i) => (
          <li key={t.target.id} className="flex items-center gap-2.5 py-2">
            <TargetAvatar name={t.target.name} imageUrl={t.target.image_url} channel={t.target.channel} size={36} />
            <div className="min-w-0 grow">
              <p dir="auto" className="truncate text-sm font-bold text-mist-100">
                {t.target.name}
              </p>
              <p className="mt-0.5 text-xs text-mist-500">
                <Num>{t.pending}</Num> ממתינים
                {t.nextAt && (
                  <>
                    {' · הבא ב-'}
                    <Clock iso={t.nextAt} />
                  </>
                )}
              </p>
            </div>
            <IconButton label={`הסר את ${t.target.name} מהתור`} className="text-error-400">
              {i === 1 ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : <TrashIcon className="h-5 w-5" />}
            </IconButton>
          </li>
        ))}
      </ul>
    </section>
  );
}

function AddSection({ picked, noResults }: { picked: number; noResults?: 'query' | 'all' }) {
  return (
    <section aria-label="הוספת קבוצות לתור" className="space-y-2">
      <h3 className="text-sm font-extrabold uppercase tracking-wide text-mist-500">הוספת קבוצות לתור</h3>
      <Field label="חיפוש קבוצה" hint="מוצגות רק קבוצות פעילות שעדיין לא בתור.">
        <div className="relative">
          <SearchIcon aria-hidden className="pointer-events-none absolute top-1/2 h-5 w-5 -translate-y-1/2 text-mist-500 start-3" />
          <input className={`${inputClass} ps-10`} aria-label="חיפוש קבוצה להוספה לתור" placeholder="שם קבוצה או עיר…" />
        </div>
      </Field>

      {noResults ? (
        <p className="py-2 text-sm text-mist-500">
          {noResults === 'query' ? 'אין קבוצות פעילות שתואמות לחיפוש.' : 'כל הקבוצות הפעילות כבר נמצאות בתור.'}
        </p>
      ) : (
        <>
          <ul className="max-h-72 space-y-1.5 overflow-y-auto">
            {offered.map((t, i) => (
              <li key={t.id}>
                <label
                  className={`flex min-h-11 min-w-0 cursor-pointer items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${
                    i < 2 ? 'border-brand-300 bg-brand-300/8' : 'border-ink-600'
                  }`}
                >
                  <input type="checkbox" className="h-5 w-5 shrink-0 accent-brand-300" defaultChecked={i < 2} aria-label={t.name} />
                  <TargetAvatar name={t.name} imageUrl={t.image_url} channel={t.channel} size={32} />
                  <span dir="auto" className="min-w-0 grow truncate text-sm font-bold text-mist-100">
                    {t.name}
                  </span>
                </label>
              </li>
            ))}
          </ul>
          <p className="text-xs text-mist-500">
            מוצגות <Num>{ADD_LIST_LIMIT}</Num> קבוצות מתוך <Num>{GROUPS}</Num> — חדדו את החיפוש כדי למצוא קבוצה מסוימת.
          </p>
        </>
      )}

      {picked > 0 && (
        <Notice tone="info">
          {picked === 1 ? (
            <>
              פרסום אחד חדש ייכנס אחרי האחרון שבתור, ב-
              <Clock iso={addFirstISO} withDay />.
            </>
          ) : (
            <>
              <Num>{picked}</Num> פרסומים חדשים ייכנסו אחרי האחרון שבתור, אחד כל{' '}
              <span dir="auto" className="font-bold">
                {gapChoiceLabel(ADD_GAP)}
              </span>
              : הראשון ב-
              <Clock iso={addFirstISO} withDay /> והאחרון ב-
              <Clock iso={addLastISO} withDay />.
            </>
          )}
        </Notice>
      )}

      <Button size="lg" className="w-full" disabled={picked === 0}>
        {picked > 0 ? `הוסף ${counted(picked, 'קבוצה אחת', 'קבוצות', 'שתי קבוצות')} לתור` : 'בחרו קבוצות להוספה'}
      </Button>
    </section>
  );
}

/* ── the states ───────────────────────────────────────────────────────── */

const CASES: { id: string; what: string; body: React.ReactNode }[] = [
  {
    id: 'opening',
    what: 'opening — the state renderToStaticMarkup reaches on its own',
    body: (
      <SheetShell title="ניהול התור הפעיל">
        <Loading />
      </SheetShell>
    ),
  },
  {
    id: 'empty',
    what: 'nothing waiting',
    body: (
      <SheetShell title="ניהול התור הפעיל">
        <div className="py-2">
          <EmptyState
            icon={<ClockIcon className="h-5 w-5" />}
            title="אין פרסומים שממתינים בתור"
            description="כשיהיו פרסומים ממתינים אפשר יהיה לשנות מכאן את המרווח ביניהם, להוסיף קבוצות או להוריד."
          />
        </div>
      </SheetShell>
    ),
  },
  {
    id: 'full',
    what: '500 rows, 292 groups, the start moved, and every warning that can co-occur',
    body: (
      <SheetShell
        title="ניהול התור הפעיל"
        footer={
          <Button size="lg" className="w-full">
            {`הזז את התור למועד החדש, במרווח של ${gapChoiceLabel(GAP)}`}
          </Button>
        }
      >
        <div className="space-y-6 pb-2">
          <LiveSummary truncated />
          <StartSection dirty />
          <PaceSection dirty notices={{ slower: true, split: true, ceilings: true }} />
          <GroupsSection />
          <AddSection picked={PICKED} />
        </div>
      </SheetShell>
    ),
  },
  {
    id: 'other-branches',
    what: 'the deadline error, the mismatch line, pages in the queue, one pick, and the counting footer',
    body: (
      <SheetShell
        title="ניהול התור הפעיל"
        footer={
          <Button size="lg" className="w-full" busy>
            {`מעדכן… ${47} מתוך ${218}`}
          </Button>
        }
      >
        <div className="mb-3">
          <Notice tone="error">
            {deadlineError}{' '}
            <button type="button" className="min-h-11 font-bold underline">
              נסו שוב
            </button>
          </Notice>
        </div>
        <div className="space-y-6 pb-2">
          <LiveSummary truncated={false} />
          <StartSection dirty={false} />
          <PaceSection dirty={false} notices={{ mismatch: true, others: 3 }} />
          <AddSection picked={1} />
        </div>
      </SheetShell>
    ),
  },
  {
    id: 'mixed-posts',
    what: 'the queue holds more than one post, so groups cannot be added from here',
    body: (
      <SheetShell title="ניהול התור הפעיל">
        <div className="space-y-6 pb-2">
          <section aria-label="הוספת קבוצות לתור" className="space-y-2">
            <h3 className="text-sm font-extrabold uppercase tracking-wide text-mist-500">הוספת קבוצות לתור</h3>
            <Notice tone="info">
              בתור ממתינים פרסומים של יותר מפוסט אחד, ולכן אי אפשר לדעת מכאן איזה פוסט הקבוצה החדשה אמורה לקבל. הוסיפו את הקבוצה מתוך מסך
              הסבב או הפוסט עצמו.
            </Notice>
          </section>
          <AddSection picked={0} noResults="query" />
          <p className="py-2 text-sm text-mist-500">כל הקבוצות הפעילות כבר נמצאות בתור.</p>
          <p className="text-xs text-mist-500">{`${posts(218)} ${agree(218, 'תוזמן', 'תוזמנו')} מחדש, מרווח של ${gapChoiceLabel(GAP)} ביניהם.`}</p>
        </div>
      </SheetShell>
    ),
  },
];

const body = CASES.map(
  (c) => `
  <p style="color:#9aa;font:12px sans-serif;margin:18px 0 6px" data-case="${c.id}">${c.what}</p>
  ${renderToStaticMarkup(c.body)}`,
).join('');

process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">${body}</div>
</body></html>`,
);
