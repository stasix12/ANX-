/*
 * PUBLISH-NOW, AS A MEASURABLE PAGE — src/components/social/QuickPublishSheet.tsx.
 *
 * ─── WHY THIS IS NOT ONE `renderSnapshot(<QuickPublishSheet/>)` ──────
 *
 * It was tried first and it draws NOTHING at all. Two gates, both of them a
 * client effect:
 *
 *   1. <Sheet> (ui.tsx:1208) keeps `const [mounted, setMounted] = useState(false)`
 *      with `useEffect(() => setMounted(true), [])` and returns only its
 *      hidden `themeAnchor` span while `!mounted` — its panel is portalled to
 *      document.body, which does not exist on the server. Under
 *      renderToStaticMarkup that effect never runs, so every sheet in this
 *      product renders as `<span hidden aria-hidden></span>`. It is why no
 *      existing render-*.tsx mounts a Sheet.
 *   2. The sheet's whole body is gated on `ctx`, which is filled by
 *      quickPublishContext() / listSchedules() / listVariants() /
 *      listWorkers() inside useEffect → load(). Server-rendered, `ctx` stays
 *      null and the body is the post header plus <SkeletonList rows={4}/>.
 *
 * So this fixture does what the harness asks for in that case. It renders the
 * REAL components the sheet composes — TargetPicker (the same one the editor
 * uses), SchedulePlanPreview, Stamp, Notice, Badge, Button, ButtonLink,
 * IconButton, SkeletonList, inputClass — and transcribes the sheet's own
 * inline JSX (it composes no inner component for the post header, the
 * three-up forecast, the mode switch or the per-row list; all four are inline)
 * class string for class string, inside the <Sheet> chrome it is drawn in.
 * Every SENTENCE is built by the same expression the component uses, through
 * the same helpers — counted(), agree(), accountGapLabel(), gapChoiceLabel(),
 * formatInstantHe(), formatDayMonthHe() — so what the DOM translator matches
 * here is byte-identical to what it matches in the running app.
 *
 * WHAT IS REPRODUCED RATHER THAN IMPORTED: SheetShell below. `position: fixed`
 * and the portal are dropped so the states stack down one page; every other
 * class on the panel, the drag handle, the header, the scrolling body and the
 * footer is copied from Sheet(placement='sheet', size='lg') — which is how
 * src/app/social/library/page.tsx opens this sheet. The geometry that decides
 * whether the Russian fits is the panel's: full viewport width up to md,
 * `md:max-w-2xl` (672px) above it, `px-4` either side of the content.
 *
 * ─── THE SHAPES CHOSEN, AND WHY ───────────────────────────────────────────
 *
 * Width decides whether a box holds its text, so every figure is the widest
 * this screen can really produce, and each is a number the app can hold:
 *
 *   · 292 groups selected, 292 publications planned over 5 days. 292 is the
 *     owner's own queue, quoted in this file's notes ("292 groups at 'a
 *     minute' is five hours"), and 5 days is what that spreads to at the
 *     shipped 30-minute account gap — which is also the only way the
 *     "הפרסום יתפרש על N ימים" line is reachable.
 *   · a 30-minute effective gap (limits.minGapSeconds 600 + the shipped
 *     20-minute group surcharge), so accountGapLabel() prints its longest
 *     realistic reading in all four places this sheet repeats it.
 *   · the longest post title the library can show (post.title is free text
 *     and the card truncates it) beside a four-digit "בתור" badge.
 *   · test mode ON, which is how the product ships, so the longest of the
 *     three notices that name TEST_MODE_PATH is on screen.
 *   · 37 of the chosen groups already hold this post — both branches of that
 *     warning, because limits.blockRepeatToSameTarget is the owner's switch
 *     and the two sentences are completely different lengths.
 *   · every ceiling line at once: 106 over the campaign's 40-a-day and 172 of
 *     292 over the account's 120-a-day with 106 already out today.
 *   · the launch report with surchargeChanged on and the worker DOWN, which
 *     is the tallest the report can get, and the `ran: false` branches, which
 *     are the three longest sentences in the file.
 *   · group names of the three shapes that break a row: the longest realistic
 *     Hebrew board name, Cyrillic inside an RTL list, and an unspaced Russian
 *     compound with nowhere to wrap.
 *
 * NOTHING HERE touches the network, publishes, or reads a clock: NOW is
 * pinned, so every instant is identical on every run.
 */
import { renderSnapshot } from './render-html';
import { CloseIcon } from '@/components/icons';
import { Stamp } from '@/components/social/DateTime';
import { SchedulePlanPreview, type SchedulePlan } from '@/components/social/SchedulePicker';
import { TargetPicker } from '@/components/social/TargetPicker';
import { Badge, Button, ButtonLink, IconButton, Notice, SkeletonList, inputClass } from '@/components/social/ui';
import { gapChoiceLabel } from '@/lib/social/campaign-schedule';
import { accountGapLabel } from '@/lib/social/rules';
import { agree, counted, formatDayMonthHe, formatInstantHe } from '@/lib/social/time';
import type { SocialTarget } from '@/lib/social/types';

/* 08:00 in Israel, pinned. */
const NOW = Date.parse('2026-11-16T06:00:00Z');
const iso = (ms: number) => new Date(ms).toISOString();

/** The sheet's own constant, verbatim. */
const TEST_MODE_PATH = 'הגדרות ← פרסום בקבוצות ← "מצב בדיקה"';

/** `variantProblem`, exactly as load() sets it. */
const VARIANT_PROBLEM =
  'יש גרסאות אך אף אחת לא אושרה. אשרו לפחות גרסה אחת (או מחקו את כולן כדי לפרסם את הטקסט הבסיסי).';

/** `result.reason`, which is absent on the shipped pause. */
const PAUSED_REASON = 'הפרסום מושהה.';

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

/* ── the data ──────────────────────────────────────────────────────────── */

const POST_TITLE = 'ניקוי ספות, שטיחים וריפודי רכב בבאר שבע והסביבה — מבצע נובמבר עם הגעה עד הבית';
/*
 * THE POST'S OWN TEXT, as src/lib/social/compose.ts:115 writes it — newlines
 * and all. Not decoration: that template is a dictionary PATTERN
 * (i18n.ts:2311), the DOM translator tidies whitespace before it looks a node
 * up, and this line is painted on screen inside the sheet's header. So the
 * owner's post text is a thing this screen can translate, and measuring with
 * a hand-written sentence instead would have hidden it.
 */
const POST_TEXT =
  '✨ ניקוי ספות עד הבית — באר שבע והסביבה!\n\n✅ ציוד מקצועי\n✅ ייבוש מהיר\n✅ מחיר הוגן וברור מראש\n\nהשבוע מבצע להזמנה ראשונה. התורים מתמלאים — שריינו מקום עכשיו.';

/* `number`, not the literal 292: the component branches on `=== 1` and a
   literal-typed constant makes tsc call that comparison impossible. */
const PENDING: number = 292;
const SELECTED = 292;
const OVERLAP = 37;
const PLANNED = 292;
const DAYS: number = 5;
const GAP = 1800; /* limits.minGapSeconds 600 + the shipped 1200 group surcharge */
const MIN_GAP = 600;
const SURCHARGE = 1200;

const names = [
  'קבוצת תושבי שכונת נווה זאב ורמות באר שבע — קניה, מכירה, המלצות ועסקים מקומיים',
  'Беэр-Шева объявления, барахолка и советы жителей',
  'БеэрШеваОбъявленияКуплюПродамОтдамБесплатноБарахолкаЮгИзраиля',
  'אופקים ביחד — קהילת העסקים והתושבים, המלצות וקניה מכירה',
  'Город Арад , глазами жителей',
  'דרושים דרום',
];

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

/** The picker's own list: the long shapes plus one page, so its channel filter
    and its "דפים" row are both on screen. */
const targets: SocialTarget[] = [
  ...names.map((n, i) => target(`t${i}`, n, i === 2 ? { favorite: true } : {})),
  target('p1', 'ניקוי ספות באר שבע — הדף הרשמי', { channel: 'facebook_page' as SocialTarget['channel'], can_api_publish: true }),
];

/** The rows the plan produces, as planQuickPublish() lays them out. */
const rows = Array.from({ length: PLANNED }, (_, i) => ({
  targetId: `t${i % names.length}`,
  name: names[i % names.length],
  at: iso(NOW + 25 * 60_000 + i * GAP * 1000),
}));

const startAt = rows[0].at;
const endAt = rows[rows.length - 1].at;

/** The same shape the sheet hands <SchedulePlanPreview>. */
const previewPlan: SchedulePlan = {
  slots: rows.map((r) => new Date(r.at)),
  simultaneous: false,
  summary: `${PLANNED} פרסומים, אחד כל ${gapChoiceLabel(GAP)}${DAYS > 1 ? `, על פני ${DAYS} ימים` : ''}`,
  firstAt: new Date(startAt),
  lastAt: new Date(endAt),
  days: DAYS,
};

/* ── the sections, as the sheet draws them ─────────────────────────────── */

function PostHeader() {
  return (
    <div className="flex min-w-0 items-center gap-3 rounded-xl border border-ink-700 bg-ink-900 p-2.5">
      <div className="h-14 w-14 shrink-0 overflow-hidden rounded-xl bg-ink-800" />
      <div className="min-w-0 grow">
        <p dir="auto" className="truncate text-sm font-bold text-mist-100">
          {POST_TITLE}
        </p>
        <p dir="auto" className="truncate text-[11px] text-mist-500">
          {POST_TEXT}
        </p>
      </div>
      <Badge tone="info">{PENDING === 1 ? 'אחד בתור' : `${PENDING} בתור`}</Badge>
    </div>
  );
}

function Form({ blocked }: { blocked: boolean }) {
  return (
    <div className="mt-4 min-w-0 space-y-5">
      {blocked && <Notice tone="error">{`מצב בדיקה פעיל — אפשר לבחור קבוצה אחת בלבד. כדי לכבות: ${TEST_MODE_PATH}.`}</Notice>}

      {/* `{variantProblem}` is an EXPRESSION in the component, so the stored
          sentence and the literal after it are two text nodes and the
          dictionary is asked two questions. Kept that way here: merging them
          would ask it one question it has no answer for, and this fixture
          would report a translation gap the app does not have. */}
      <Notice tone="warn">
        {VARIANT_PROBLEM} פרסום של גרסה שלא אושרה מדולג אוטומטית, ולכן הפרסום המהיר חסום עד שתאשרו אחת בעורך.
      </Notice>

      <Notice tone="warn">
        התוכנה שמפרסמת לקבוצות לא רצה כרגע. במחשב שבו מותקנת המערכת, לחצו פעמיים על{' '}
        <code dir="ltr" className="break-all">
          start-worker.cmd
        </code>{' '}
        והשאירו את החלון פתוח.
      </Notice>

      <Notice tone="info">
        מצב בדיקה פעיל — אפשר לבחור קבוצה אחת בלבד, והפרסום יעצור לאישור לפני הלחיצה האחרונה. כדי לכבות: {TEST_MODE_PATH}.
      </Notice>

      <section className="min-w-0">
        <div className="mb-2 flex items-center justify-between gap-2">
          <h3 className="text-sm font-extrabold text-mist-100">לאן מפרסמים</h3>
          <Badge tone="brand">{counted(SELECTED, 'נבחר יעד אחד', 'נבחרו', 'נבחרו שניים')}</Badge>
        </div>
        {/* The real picker, with the real filter row and the real rows. */}
        <TargetPicker targets={targets} selected={targets.slice(0, 3).map((t) => t.id)} onChange={() => undefined} />
        {/* Both branches of the repeat warning. The second sentence is a
            conditional EXPRESSION in the component, so it is its own text
            node and its own dictionary question — kept that way. */}
        <div className="mt-2">
          <Notice tone="warn">
            {OVERLAP} {agree(OVERLAP, 'מהיעדים שבחרתם כבר קיבל', 'מהיעדים שבחרתם כבר קיבלו')} את הפוסט הזה.{' '}
            {'המערכת לא שולחת את אותו פוסט פעמיים לאותה קבוצה, ולכן הפרסומים האלה ידולגו. בחרו קבוצות אחרות, שכפלו את הפוסט לנוסח חדש, או כבו את הכלל בהגדרות.'}
          </Notice>
        </div>
        <div className="mt-2">
          <Notice tone="info">
            {OVERLAP} {agree(OVERLAP, 'מהיעדים שבחרתם כבר קיבל', 'מהיעדים שבחרתם כבר קיבלו')} את הפוסט הזה.{' '}
            {'כיביתם בהגדרות את מניעת הפרסום החוזר, ולכן הפוסט יצא אליהם שוב. שקלו לשנות את הנוסח — תוכן זהה שחוזר לאותה קבוצה הוא מה שפייסבוק מזהה כספאם.'}
          </Notice>
        </div>
      </section>

      <section className="min-w-0 space-y-3">
        <h3 className="text-sm font-extrabold text-mist-100">מתי</h3>
        <div role="group" aria-label="מתי לפרסם" className="flex min-w-0 gap-1.5 rounded-xl bg-ink-900 p-1">
          {(
            [
              { value: 'now', label: 'פרסם עכשיו' },
              { value: 'schedule', label: 'תזמן' },
            ] as const
          ).map((m) => (
            <button
              key={m.value}
              type="button"
              aria-pressed={m.value === 'schedule'}
              className={`min-h-11 grow rounded-lg px-3.5 text-sm font-bold transition-colors ${
                m.value === 'schedule' ? 'bg-brand-500 text-on-brand' : 'text-mist-300'
              }`}
            >
              {m.label}
            </button>
          ))}
        </div>

        <div className="grid min-w-0 grid-cols-2 gap-3 [&>*]:min-w-0">
          <label className="text-sm">
            <span className="mb-1 block font-bold text-mist-300">מתאריך</span>
            <input type="date" aria-label="תאריך התחלה" className={inputClass} defaultValue="2026-11-16" />
          </label>
          <label className="text-sm">
            <span className="mb-1 block font-bold text-mist-300">בשעה</span>
            <input type="time" aria-label="שעת התחלה" className={inputClass} defaultValue="09:00" />
          </label>
        </div>

        <p className="text-xs text-mist-500">
          הפרסומים ייצאו במרווח שההגדרות דורשות כרגע — {accountGapLabel(GAP)} בין שני פרסומים לקבוצות. המרווח נקבע לפי מצב הפרסום שנבחר
          בכרטיס הקמפיין (״מצב פרסום חכם״), והוא חל על כל החשבון — לא על הפרסום הזה בלבד.
        </p>
        <p className="text-xs text-mist-500">
          המרווח הוא הגדרה שלכם בלבד. אין מרווח שמבטיח שלא תיחסם ואין לפייסבוק מספר רשמי שאפשר להסתמך עליו — המערכת פשוט תעשה מה שביקשתם.
        </p>
      </section>

      <section className="min-w-0">
        <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-mist-500">מה יקרה בפועל</p>
        <div className="min-w-0 space-y-2">
          <SchedulePlanPreview plan={previewPlan} names={rows.map((r) => r.name)} />

          <button type="button" className="min-h-11 px-1 text-xs font-bold text-brand-400">
            {`הצג את כל ${PLANNED} הפרסומים`}
          </button>

          <ul className="max-h-64 min-w-0 space-y-1 overflow-y-auto rounded-xl border border-ink-700 p-2">
            {rows.slice(0, 8).map((r, i) => (
              <li key={`${r.targetId}-${i}`} className="flex items-center gap-2 text-xs">
                <span className="w-12 shrink-0 font-extrabold tabular-nums text-brand-400">{formatInstantHe(r.at)}</span>
                <span dir="auto" className="min-w-0 truncate text-mist-300">
                  {r.name}
                </span>
                <span className="ms-auto shrink-0 text-[11px] font-bold tabular-nums text-mist-500">{formatDayMonthHe(r.at)}</span>
              </li>
            ))}
          </ul>

          <p className="text-xs text-mist-500">
            הפרסום הראשון לא יוצא מיד: המרווח שבחרתם חל גם עליו, ולכן הוא נקבע ל-{formatInstantHe(startAt)}.
          </p>
          <p className="text-xs text-mist-500">
            מה שלא נכנס היום ממשיך מחר באותה שעה. ההפצה נמשכת על פני {DAYS} ימים ומסתיימת ב-<Stamp iso={endAt} />.
          </p>

          <Notice tone="warn">
            לסבב של הפוסט הזה הגדרתם תקרה של {counted(40, 'פרסום אחד', 'פרסומים', 'שני פרסומים')} ביום, ולפי התוכנית{' '}
            {106} {agree(106, 'מהפרסומים של היום חורג', 'מהפרסומים של היום חורגים')} ממנה. גם הם יידחו למחר.
          </Notice>

          <Notice tone="warn">
            {172} מתוך {PLANNED} הפרסומים חורגים מהתקרה היומית שהגדרתם ({120} ביום; היום כבר יצאו {106}). מה שמעבר לתקרה יידחה ליום הראשון
            שיש בו מקום. אפשר להעלות את התקרה בהגדרות, לבחור פחות יעדים, או להתחיל מחר.
          </Notice>

          <p className="text-[11px] text-mist-500">
            אלה המועדים המתוכננים נכון לעכשיו, מחושבים באותה פונקציה שהמתזמן עצמו מריץ. אם תאשרו בעוד כמה דקות הכל יזוז קדימה באותה מידה —
            זו התוכנית, לא הבטחה לדקה מדויקת.
          </p>
        </div>
      </section>
    </div>
  );
}

function Report({ queued }: { queued: boolean }) {
  const spanDays = DAYS;
  return (
    <div className="mt-4 space-y-3">
      {queued ? (
        <Notice tone="success">
          {`${counted(PLANNED, 'פרסום אחד נכנס', 'פרסומים נכנסו', 'שני פרסומים נכנסו')} לתור עבור ${counted(SELECTED, 'יעד אחד', 'יעדים', 'שני יעדים')}.`}
        </Notice>
      ) : (
        <>
          <Notice tone="warn">
            התזמון נשמר, אבל התור עדיין לא נבנה כי הריצה לא יצאה לדרך. הוא ייבנה ברגע שהיא תשוחרר, או בסבב הבא של התוכנה שעל המחשב.
          </Notice>
          <Notice tone="warn">
            לא נוצרו פרסומים חדשים, כי הפוסט הזה כבר ממתין בתור לאותן הקבוצות. המערכת לא מכניסה אותו פעמיים לאותה קבוצה — בדקו בתור לפני
            שתנסו שוב.
          </Notice>
          <Notice tone="warn">לא נוצרו פרסומים חדשים. בדקו בתור מה כבר ממתין לקבוצות האלה לפני שתנסו שוב.</Notice>
        </>
      )}

      <p className="text-[11px] font-bold text-mist-500">{queued ? 'מה נקבע לפרסום הזה' : 'צפי — התור עוד לא נבנה'}</p>
      <dl className="grid grid-cols-3 gap-2 text-center [&>*]:min-w-0">
        <div className="rounded-lg bg-ink-900 py-2">
          <dt className="text-[10px] font-bold text-mist-500">מתחיל</dt>
          <dd className="text-sm font-extrabold tabular-nums text-mist-100">{formatInstantHe(startAt)}</dd>
          <p className="text-[10px] font-bold tabular-nums text-brand-400">{formatDayMonthHe(startAt)}</p>
        </div>
        <div className="rounded-lg bg-ink-900 py-2">
          <dt className="text-[10px] font-bold text-mist-500">צפוי להסתיים</dt>
          <dd className="text-sm font-extrabold tabular-nums text-mist-100">{formatInstantHe(endAt)}</dd>
          <p className="text-[10px] font-bold tabular-nums text-brand-400">{formatDayMonthHe(endAt)}</p>
        </div>
        <div className="rounded-lg bg-ink-900 py-2">
          <dt className="text-[10px] font-bold text-mist-500">יעדים שנבחרו</dt>
          <dd className="text-sm font-extrabold tabular-nums text-mist-100">{SELECTED}</dd>
        </div>
      </dl>

      <Notice tone="warn">
        {spanDays === 2
          ? 'הפרסום לא כולו יוצא היום — חלק ממנו ימשיך מחר, לפי המרווח שנקבע.'
          : `הפרסום יתפרש על ${spanDays} ימים, לפי המרווח שנקבע. לקיצור — הגדילו את מספר הפרסומים ליום או הקטינו את המרווח בכוונון התור.`}
      </Notice>

      {queued ? (
        <Notice tone="info">
          דפים: {12} {agree(12, 'פורסם', 'פורסמו')}, {4} {agree(4, 'דולג', 'דולגו')}, {2} {agree(2, 'נדחה', 'נדחו')}, {1}{' '}
          {agree(1, 'נכשל', 'נכשלו')}. קבוצות מתפרסמות דרך התוכנה שעל המחשב שלכם.
        </Notice>
      ) : (
        <>
          <Notice tone="warn">הפרסום עצמו לא רץ — {PAUSED_REASON} לחצו "המשך" בראש הדף כדי לשחרר את התור.</Notice>
          <Notice tone="info">
            הפרסום לדפים לא רץ הפעם{` — ${PAUSED_REASON}`} הקבוצות לא תלויות בזה: התוכנה שעל המחשב בונה את התור ומפרסמת אותו כרגיל, בדרך
            כלל תוך דקה.
          </Notice>
        </>
      )}

      <Notice tone="info">
        המרווח הנוסף לקבוצות עודכן ל-{accountGapLabel(SURCHARGE)} והמרווח הכללי ל-{accountGapLabel(MIN_GAP)}.
      </Notice>

      <p className="text-xs text-mist-500">
        ההגדרות דורשות כעת {accountGapLabel(MIN_GAP + SURCHARGE)} בין שני פרסומים לקבוצות. זו הגדרה אחת לכל החשבון, לא לפרסום הזה בלבד.
      </p>

      <Notice tone="warn">
        התוכנה שמפרסמת לקבוצות לא רצה כרגע. במחשב שבו מותקנת המערכת, לחצו פעמיים על{' '}
        <code dir="ltr" className="break-all">
          start-worker.cmd
        </code>{' '}
        והשאירו את החלון פתוח.
      </Notice>

      <div className="flex flex-wrap gap-2">
        <ButtonLink href="/social" size="lg">
          צפה בתור
        </ButtonLink>
        <Button size="lg" variant="secondary">
          כוונון התור
        </Button>
      </div>
      <p className="text-xs text-mist-500">
        לשינוי המרווח או להוספת קבוצות אחרי שהתור נבנה — כוונון התור. אל תריצו פרסום מהיר שוב על אותו פוסט כדי לתקן מרווח.
      </p>
    </div>
  );
}

/* ── the states ───────────────────────────────────────────────────────── */

const CASES: { id: string; what: string; body: React.ReactNode }[] = [
  {
    id: 'opening',
    what: 'opening — the state renderToStaticMarkup reaches on its own',
    body: (
      <SheetShell
        title="פרסום מהיר"
        footer={
          <Button size="lg" className="w-full" disabled>
            תזמן פרסום
          </Button>
        }
      >
        <PostHeader />
        <div className="mt-4">
          <SkeletonList rows={4} />
        </div>
      </SheetShell>
    ),
  },
  {
    id: 'load-failed',
    what: 'the snapshot would not load',
    body: (
      <SheetShell title="פרסום מהיר">
        <PostHeader />
        <div className="mt-3 space-y-2">
          <Notice tone="error">טעינה נכשלה.</Notice>
          <Button variant="secondary">נסו שוב</Button>
        </div>
      </SheetShell>
    ),
  },
  {
    id: 'form',
    what: '292 groups chosen over 5 days, test mode on, every warning the form can show',
    body: (
      <SheetShell
        title="פרסום מהיר"
        footer={
          <Button size="lg" className="w-full">
            תזמן פרסום
          </Button>
        }
      >
        <PostHeader />
        <Form blocked />
      </SheetShell>
    ),
  },
  {
    id: 'report',
    what: 'the launch report — 292 queued, the surcharge moved, the worker down',
    body: (
      <SheetShell
        title="מה קרה עכשיו"
        footer={
          <Button size="lg" className="w-full">
            סגור
          </Button>
        }
      >
        <PostHeader />
        <Report queued />
      </SheetShell>
    ),
  },
  {
    id: 'report-nothing-queued',
    what: 'the report when the run never happened and nothing was written',
    body: (
      <SheetShell
        title="מה קרה עכשיו"
        footer={
          <Button size="lg" className="w-full">
            סגור
          </Button>
        }
      >
        <PostHeader />
        <Report queued={false} />
      </SheetShell>
    ),
  },
];

const body = CASES.map(
  (c) => `
  <p style="color:#9aa;font:12px sans-serif;margin:18px 0 6px" data-case="${c.id}">${c.what}</p>
  ${renderSnapshot(c.body)}`,
).join('');

process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">${body}</div>
</body></html>`,
);
