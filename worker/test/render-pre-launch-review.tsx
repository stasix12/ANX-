/*
 * THE LAST SCREEN BEFORE A CAMPAIGN GOES OUT, AS A MEASURABLE PAGE —
 * src/components/social/PreLaunchReview.tsx.
 *
 * Written for the Russian layout sweep: of the 59 components the publishing
 * app renders, this one was reachable from no fixture, so the screen the owner
 * confirms a hundred-group launch on had never been measured in Russian.
 *
 * ─── WHY THIS IS NOT ONE `renderToStaticMarkup(<PreLaunchReview/>)` ────────
 *
 * It was tried first and it draws NOTHING — a single `<span hidden
 * aria-hidden></span>`. PreLaunchReview's whole body is the children of
 * <Sheet> (ui.tsx:1208), which keeps `const [mounted, setMounted] =
 * useState(false)` with `useEffect(() => setMounted(true), [])` and returns
 * only its hidden themeAnchor while `!mounted`, because its panel is portalled
 * to document.body and there is no document on the server. Under
 * renderToStaticMarkup that effect never runs. It is why no render-*.tsx in
 * this repo mounts a Sheet, and why render-quick-publish-sheet.tsx — the one
 * other sheet measured here — does exactly what this file does.
 *
 * So this follows that precedent. REAL COMPONENTS for everything the review
 * composes: SchedulePlanPreview (the same one the picker and the quick-publish
 * sheet draw), TargetAvatar, Badge, MethodBadge, Button, Notice, Stamp. The
 * two pieces of inline JSX PreLaunchReview composes no component for — its
 * local `Row` and the target chip list — are transcribed class string for
 * class string from PreLaunchReview.tsx:114-122 and :153-161, and SheetShell
 * below is ui.tsx Sheet(placement='sheet', size='lg') with the portal and
 * `fixed` dropped so two states stack down one page. Every SENTENCE is built
 * by the same expression the component uses, through the same helper
 * (counted()), so what the DOM translator matches here is byte-identical to
 * what it matches in the running app.
 *
 * The geometry that decides whether the Russian fits is the panel's: full
 * viewport width up to md, `md:max-w-2xl` (672px) above it, `px-4` either side
 * of the content. That is reproduced exactly.
 *
 * THE PROPS ARE THE ROUTE'S — src/components/social/PostEditor.tsx:949, the
 * only place this component is mounted:
 *
 *   campaignName       campaign?.name ?? ''
 *   postTitle          post.title || post.base_text.split('\n')[0].slice(0, 60)
 *   text               previewText (the rendered post text)
 *   media              post.media
 *   targets            selectedObjects
 *   plan               planFor(schedule, selectedObjects.length, new Date(),
 *                              spacingSeconds, publishWindow)
 *   requireConfirmation requireConfirmation || browser.testMode
 *   warnings           the test-mode line, the no-approved-variant line, capWarning
 *
 * ─── THE SHAPES CHOSEN, AND WHY ───────────────────────────────────────────
 *
 * Width decides whether a box holds its text, so every figure is the widest
 * this screen can really produce, and each is a shape the app can really hold:
 *
 *   · 292 TARGETS — 280 groups and 12 pages. 292 is the owner's own queue
 *     (quoted in render-quick-publish-sheet's notes). It is what puts four
 *     figures in the "ועוד 280" tail under the chips, both channel badges on
 *     screen at once, and "יעדים (292)" in the section heading.
 *   · THE LONGEST GROUP NAMES THE QUEUE HOLDS, in the twelve slots the chip
 *     list actually draws (`targets.slice(0, 12)`) and the first six of the
 *     plan's rows (`plan.slots.slice(0, 6)`): the longest realistic Hebrew
 *     board name, Cyrillic inside an RTL list, and an unspaced Russian
 *     compound with nowhere to wrap. The chip name is `max-w-32 truncate` and
 *     the plan's name column is `min-w-0 truncate`, so both are places a name
 *     can be cut — and both are cut in Hebrew too, which is the point of
 *     measuring against it.
 *   · THE LONGEST CAMPAIGN AND POST NAMES. `Row`'s value is `min-w-0 truncate`
 *     beside a label that grows in Russian, so this is the one box on the
 *     screen where a longer LABEL eats the value's width. The post title is
 *     the 60-character slice of a first line, which is the longest postTitle
 *     the route can hand over.
 *   · ALL THREE WARNINGS AT ONCE, which is reachable: test mode is how the
 *     product ships, an unapproved variant set is the common state of a post
 *     with variants, and capWarning fires whenever the plan exceeds the daily
 *     ceiling — 292 publications against a 120-a-day cap does. capWarning is
 *     the longest sentence in PostEditor.tsx and is reproduced from :346-358
 *     with the same template.
 *   · requireConfirmation ON, so the extra sentence inside the closing Notice
 *     renders — it only exists in that state, and it is what makes that notice
 *     the tallest block on the screen.
 *   · THE SHIPPED SPACING, 45 + 20 MINUTES (types.ts:822 plus the group
 *     surcharge), so the plan spans enough days for "אחרון" to carry a date
 *     hint and the three-up stat row to be at its tallest.
 *   · AND A SECOND, THIN STATE: no warnings, pages only, no media, and an
 *     EMPTY post text — the only way to reach '(ריק — ייצא רק מדיה)', and the
 *     only state in which the review has no campaign name ('ללא סבב') and no
 *     post title ('ללא כותרת'), which are two translated strings that exist
 *     nowhere else.
 *
 * THE POST TEXT CARRIES data-no-translate, as the component writes it, so the
 * owner's own words stay in the language they were written in. That attribute
 * is reproduced on the same <span>; whether it holds is one of the things this
 * page is here to check.
 *
 * NOTHING HERE touches the network or publishes: the media are inline SVG data
 * URIs, as render-card.tsx does it, and `plan` is computed by the real planner.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { CloseIcon } from '@/components/icons';
import { Stamp } from '@/components/social/DateTime';
import { SchedulePlanPreview, planFor, type ScheduleDraft } from '@/components/social/SchedulePicker';
import { TargetAvatar } from '@/components/social/TargetAvatar';
import { Badge, Button, IconButton, MethodBadge, Notice } from '@/components/social/ui';
import { readSchedule } from '@/lib/social/campaign-schedule';
import { accountGapSeconds } from '@/lib/social/rules';
import { counted } from '@/lib/social/time';
import type { Channel, MediaItem, SocialTarget } from '@/lib/social/types';

/* ────────────────────────────────────────────────────────────── the chrome */

/*
 * ui.tsx Sheet(placement='sheet', size='lg') without the portal and without
 * `fixed`, so both states can be measured on one page. Classes copied from
 * ui.tsx:1440-1525; PostEditor opens this review with size="lg".
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
      <div className="min-h-0 grow overflow-y-auto px-4 pb-4">{children}</div>
      {footer && <footer className="shrink-0 border-t border-ink-700 bg-ink-800 px-4 pt-3 pb-[calc(0.75rem+var(--safe-b))]">{footer}</footer>}
    </div>
  );
}

/** PreLaunchReview.tsx:153-161, verbatim. */
function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-700 pb-2">
      <span className="text-xs font-bold text-mist-500">{label}</span>
      <span dir="auto" className="min-w-0 truncate text-sm font-bold text-mist-100">
        {children}
      </span>
    </div>
  );
}

/* ──────────────────────────────────────────────────────────────── the data */

/* Inline so the fixture never reaches the network — render-card.tsx's trick. */
const pic = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160"><rect width="120" height="160" fill="${fill}"/></svg>`)}`;

const MEDIA: MediaItem[] = [
  ...Array.from({ length: 12 }, (_, i) => ({ kind: 'image' as const, url: pic('#c4b5fd'), path: `p/${i}.png`, name: `ספה אחרי ניקוי — באר שבע ${i}.jpeg` })),
  ...Array.from({ length: 3 }, (_, i) => ({ kind: 'video' as const, url: pic('#a78bfa'), path: `v/${i}.mp4`, name: `WhatsApp Video 2026-11-14 at 21.43.0${i}.mp4` })),
];

const target = (id: number, name: string, channel: Channel): SocialTarget => ({
  id: `t${id}`,
  account_id: channel === 'facebook_page' ? 'a1' : null,
  channel,
  external_id: String(100000000 + id),
  name,
  url: `https://facebook.com/groups/${100000000 + id}`,
  tasks: [],
  permission_status: channel === 'facebook_page' ? 'ok' : 'browser',
  can_api_publish: channel === 'facebook_page',
  enabled: true,
  notes: '',
  last_synced_at: null,
  created_at: '2026-09-18T09:00:00Z',
});

/*
 * The twelve the chip list draws, with the three row-breaking shapes at the
 * front; pages among them so both channel badges and both avatar shapes are on
 * screen.
 */
const HEAD: [string, Channel][] = [
  ['לוח מודעות דרום - באר שבע, אופקים, נתיבות, רהט והסביבה', 'facebook_group'],
  ['БеэрШеваОбъявленияКуплюПродамОтдамБесплатноБарахолкаЮгИзраиля', 'facebook_group'],
  ['Чистка диванов Беэр-Шева и окрестности — объявления', 'facebook_group'],
  ['Беэр-Шева — באר שבע והסביבה', 'facebook_group'],
  ['אופקים ביחד — קהילת העסקים והתושבים', 'facebook_group'],
  ['ארד — לוח מודעות ומידע לתושבים', 'facebook_group'],
  ['ניקוי ריפודי רכב ומושבים בבאר שבע', 'facebook_page'],
  ['לוח באר שבע — מודעות ועסקים', 'facebook_group'],
  ['Наша Беэр-Шева 24', 'facebook_group'],
  ['АРАД НАШ И РЕШАЕМ МЫ', 'facebook_group'],
  ['ניקוי מזגנים — באר שבע', 'facebook_page'],
  ['באר שבע והסביבה ביחד', 'facebook_group'],
];
const FILL: [string, Channel][] = [
  ['עסקים בבאר שבע', 'facebook_group'],
  ['ניקוי ספות — מבצעים באר שבע', 'facebook_group'],
  ['דרושים דרום', 'facebook_group'],
  ['Арад - обо всём', 'facebook_group'],
  ['ניקוי שטיחים בערד', 'facebook_group'],
];
/* 292 targets: the twelve above, ten more pages, and the rest groups. */
const TARGETS: SocialTarget[] = [
  ...HEAD.map(([name, channel], i) => target(i, name, channel)),
  ...Array.from({ length: 10 }, (_, i) => target(100 + i, `ניקוי ריפודים ${i + 1} — דף העסק`, 'facebook_page' as Channel)),
  ...Array.from({ length: 292 - 22 }, (_, i) => target(200 + i, FILL[i % FILL.length][0], FILL[i % FILL.length][1])),
];

/* The editor's initial draft (PostEditor.tsx:158), in the mode behind the
   launch button. */
const DRAFT: ScheduleDraft = {
  mode: 'now', date: '', time: '09:00', weekly: {}, intervalDays: 2, intervalTime: '09:00',
  dripPerDay: 0, dripGapMinutes: 20, dripStart: '09:00', dripEnd: '20:00',
};
const SPACING = accountGapSeconds({ minGapMinutes: 45, minGapSeconds: 2700 }, { groupMinGapMinutes: 20, groupMinGapSeconds: 1200 }, true);
const WINDOW = readSchedule({ schedule_enabled: true, schedule_days: [0, 1, 2, 3, 4], schedule_start: '08:00', schedule_gap_seconds: 600 });

/** PostEditor.tsx:93, verbatim. */
const TEST_MODE_PATH = 'הגדרות ← פרסום בקבוצות ← "מצב בדיקה"';

/** PostEditor.tsx:346-358, the same template with the same numbers. */
function capWarning(slots: number, overflow: number, maxPerDay: number): string {
  const howMany =
    slots === 1
      ? 'צפוי שהפרסום הזה יידחה למחר'
      : overflow === 1
        ? `צפוי שפרסום אחד מתוך ${slots} יידחה למחר`
        : `צפויים ${overflow} מתוך ${slots} הפרסומים להידחות למחר`;
  return `לפי המכסה היומית שהגדרתם (${maxPerDay} ליום), וכולל מה שכבר יצא היום ומה שכבר ממתין בתור לאותם ימים, ${howMany}. פרסום שנדחה אינו אובד — הוא ממתין ליום הראשון שיש בו מקום. כדי שזה יצא מוקדם יותר: העלו את המכסה בהגדרות, פרסו את הפרסום על פני יותר ימים, או בחרו פחות יעדים.`;
}

/* The post text the owner is about to publish — the real thing, long enough to
   reach the `max-h-40` scroller the component puts it in. */
const POST_TEXT = `ניקוי ספות ושטיחים בבאר שבע והסביבה 🛋️

✅ ניקוי בקיטור בעומק, ללא כימיקלים
✅ הסרת כתמים, ריחות ואבק
✅ מגיעים עד הבית — אופקים, נתיבות, רהט, ערד, דימונה
✅ אחריות מלאה על כל עבודה

מחיר מיוחד לחודש נובמבר: ספה תלת מושבית 180 ₪ בלבד.
לתיאום: 050-0000000 או בוואטסאפ.`;

/* ─────────────────────────────────────────────────────────────── the cases */

type Case = {
  id: string;
  what: string;
  campaignName: string;
  postTitle: string;
  text: string;
  media: MediaItem[];
  targets: SocialTarget[];
  warnings: string[];
  requireConfirmation: boolean;
  spacing: number;
};

const CASES: Case[] = [
  {
    id: 'full',
    what: 'the launch the owner actually presses: 292 targets, every warning, test mode on',
    campaignName: 'ניקוי ריפודי רכב ומושבים בבאר שבע והסביבה',
    /* post.base_text.split('\n')[0].slice(0, 60) — the longest the route gives. */
    postTitle: POST_TEXT.split('\n')[0].slice(0, 60),
    text: POST_TEXT,
    media: MEDIA,
    targets: TARGETS,
    warnings: [
      `מצב בדיקה פעיל: קבוצה אחת בלבד, עם אישור ידני לפני הפרסום. כדי לכבות: ${TEST_MODE_PATH}.`,
      'אין גרסה מאושרת — יצא הטקסט הבסיסי.',
      capWarning(292, 172, 120),
    ],
    requireConfirmation: true,
    spacing: SPACING,
  },
  {
    /* The thin end: no run, no title, no text, no media, pages only. */
    id: 'bare',
    what: 'media only, no run, no title — the one state that prints the three empty strings',
    campaignName: '',
    postTitle: '',
    text: '',
    media: [],
    targets: TARGETS.filter((t) => t.channel === 'facebook_page').slice(0, 2),
    warnings: [],
    requireConfirmation: false,
    spacing: SPACING,
  },
];

/* PreLaunchReview.tsx:50-150, transcribed around the real components. */
function Review(c: Case) {
  const plan = planFor(DRAFT, c.targets.length, new Date(), c.spacing, WINDOW);
  const pages = c.targets.filter((t) => t.channel === 'facebook_page');
  const groups = c.targets.filter((t) => t.channel !== 'facebook_page');
  const cover = c.media.find((m) => m.kind === 'image');

  return (
    <SheetShell
      title="לפני שמתחילים"
      footer={
        <div className="flex gap-2">
          <Button size="lg" className="grow" disabled={!c.targets.length}>
            התחל פרסום
          </Button>
          <Button size="lg" variant="secondary">
            חזור
          </Button>
        </div>
      }
    >
      <div className="space-y-4">
        {c.warnings.map((w) => (
          <Notice key={w} tone="warn">
            {w}
          </Notice>
        ))}

        <Row label="סבב">{c.campaignName || 'ללא סבב'}</Row>
        <Row label="פוסט">{c.postTitle || 'ללא כותרת'}</Row>

        <section>
          <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-mist-500">הטקסט שיוצא</p>
          <div className="flex gap-2.5 rounded-xl border border-ink-700 bg-ink-900 p-3">
            {cover && <img src={cover.url} alt="" className="h-16 w-16 shrink-0 rounded-lg object-cover" />}
            <p dir="auto" className="max-h-40 min-w-0 overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed text-mist-100">
              {c.text ? <span data-no-translate>{c.text}</span> : '(ריק — ייצא רק מדיה)'}
            </p>
          </div>
          {c.media.length > 0 && (
            <p className="mt-1 text-[11px] text-mist-500">
              {c.media.filter((m) => m.kind === 'image').length} תמונות · {c.media.filter((m) => m.kind === 'video').length} סרטונים
            </p>
          )}
        </section>

        <section>
          <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-mist-500">יעדים ({c.targets.length})</p>
          <div className="mb-2 flex flex-wrap gap-1.5">
            {pages.length > 0 && (
              <Badge tone="good">
                {counted(pages.length, 'דף אחד', 'דפים', 'שני דפים')} · <MethodBadge method="api" />
              </Badge>
            )}
            {groups.length > 0 && (
              <Badge tone="info">
                {counted(groups.length, 'קבוצה אחת', 'קבוצות', 'שתי קבוצות')} · <MethodBadge method="browser" />
              </Badge>
            )}
          </div>
          <ul className="flex flex-wrap gap-1.5">
            {c.targets.slice(0, 12).map((t) => (
              <li key={t.id} className="flex items-center gap-1.5 rounded-full bg-ink-800 py-1 pe-2.5 ps-1">
                <TargetAvatar name={t.name} imageUrl={t.image_url} channel={t.channel} size={22} />
                <span dir="auto" className="max-w-32 truncate text-xs font-bold text-mist-100">
                  {t.name}
                </span>
              </li>
            ))}
            {c.targets.length > 12 && <li className="self-center text-xs font-bold text-mist-500">ועוד {c.targets.length - 12}</li>}
          </ul>
        </section>

        <section>
          <p className="mb-1.5 text-xs font-extrabold uppercase tracking-wide text-mist-500">התזמון</p>
          <SchedulePlanPreview plan={plan} names={c.targets.map((t) => t.name)} />
          {plan.lastAt && (
            <p className="mt-1.5 text-xs text-mist-500">
              סיום משוער: <strong className="text-mist-300"><Stamp iso={plan.lastAt} /></strong> — לפי המרווח שהגדרתם. המרווח בין
              פרסומים עשוי לדחות פרסומים ולהאריך את הטווח; חריגה מהמכסות שהגדרתם בהגדרות נדחית ליום הראשון שיש בו מקום.
            </p>
          )}
        </section>

        <Notice tone="info">
          דפים מתפרסמים דרך Graph API הרשמי של Meta. קבוצות מתפרסמות דרך חלון Chrome אמיתי על המחשב שלכם — זו אינה אינטגרציה רשמית של
          פייסבוק, והשימוש בה באחריותכם.
          {c.requireConfirmation && ' לפני כל לחיצת "פרסום" בקבוצה, המערכת תעצור ותחכה לאישור שלכם.'}
        </Notice>
      </div>
    </SheetShell>
  );
}

const body = CASES.map((c) =>
  createElement(
    'div',
    { key: c.id, 'data-review-case': c.id, className: 'mb-6' },
    createElement('p', { style: { color: '#9aa', font: '12px sans-serif', margin: '14px 0 4px' } }, c.what),
    createElement(Review, c),
  ),
);

process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">${renderToStaticMarkup(createElement('div', null, body))}</div>
</body></html>`,
);
