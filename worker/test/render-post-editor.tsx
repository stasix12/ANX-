/*
 * ─── THE POST COMPOSER, AS MUCH OF IT AS A SNAPSHOT CAN HOLD ──────────────
 *
 * PostEditor is the biggest unmeasured screen in /social — 986 lines, and the
 * screen the owner writes every post on — and nothing in this repo has ever
 * measured it in Russian.
 *
 * ─── WHY THIS IS NOT `renderToStaticMarkup(<PostEditor/>)` ───────────────
 *
 * Two separate reasons, both verified rather than assumed:
 *
 *   1  It calls useRouter() and useSearchParams() in its body. Rendered
 *      without the app router mounted it throws outright:
 *      "invariant expected app router to be mounted".
 *   2  Even WITH the router contexts provided, nothing useful comes out. The
 *      form is behind `const [loading, setLoading] = useState(true)` and
 *      `setLoading(false)` is reached only from the useEffect that loads the
 *      post — and renderToStaticMarkup runs no effects. What renders is
 *      `<SocialShell title="פוסט"><Loading /></SocialShell>`: 14.7KB of shell
 *      chrome and a skeleton. Not one of the screen's own 113 sentences.
 *
 * So this file does what render-dash.tsx does for the dashboard: the real
 * chrome and the real blocks, in the real order, with the real classNames
 * around them. Every COMPONENT below is the shipped component — Card, Field,
 * Notice, Button, inputClass, and the real MediaUploader and PostPreview the
 * editor nests. Every STRING below is PostEditor's own, copied from nowhere
 * but src/components/social/PostEditor.tsx. The plain-element wrappers (the
 * `<main>`, SocialShell's title row, the `lg:grid-cols-[1fr_380px]` tracks,
 * the `sm:grid-cols-2` field grid, the aside) are reproduced, because they
 * are the boxes that decide how wide the text gets to be and a measurement
 * without them is a measurement of nothing.
 *
 * ─── WHAT IS DELIBERATELY NOT HERE ───────────────────────────────────────
 *
 * PostEditor's own interactive rows are NOT reproduced, because a
 * hand-written copy of them would stop failing the day the screen changes:
 *
 *   · the variant row (the label input, the language select, "תצוגה מקדימה",
 *     "אשר"/"מאושר", "דחה"/"בטל דחייה", the delete button and the textarea);
 *   · the "חלוקת גרסאות" segmented control;
 *   · the active/previous schedule rows and their "בטל תזמון";
 *   · the "בקש אישור לפני כל פרסום" checkbox row;
 *   · the aside's "גרסה לתצוגה מקדימה" select.
 *
 * And four composed components that are screens of their own and carry their
 * own fixtures or none: TargetPicker (worker/test/mount-picker.tsx),
 * SchedulePicker, LiveBoard, StartFromLibrary, PreLaunchReview.
 *
 * ─── WHICH SHAPES, AND WHY THESE ─────────────────────────────────────────
 *
 * Width decides whether a box holds its text, so every value is the widest
 * the screen can really produce, taken from what the app can really hold:
 *
 *   · 252 TARGETS SELECTED. The repo's own sample account publishes to 252
 *     groups ("פורסם ל-204 מתוך 252 קבוצות היום"), so `counted()` prints
 *     "252 יעדים נבחרו" into a Card title that is `truncate`, and
 *     targetsLabel() prints "252 יעדים" inside the size="lg" launch button.
 *   · 12 VARIANTS, ALL APPROVED. generate() adds four at a time and the owner
 *     adds more by hand, so "גרסאות (12/12 מאושרות)" is a real title — and it
 *     shares its header with two action buttons that are `shrink-0`.
 *   · THE LONGEST CTA of CTA_OPTIONS ('שלח הודעת WhatsApp') selected, and a
 *     real campaign URL with its UTM tail in the link field.
 *   · THE LONGEST POST TITLE the owner's own campaigns use, which is what
 *     SocialShell's `truncate` h1 has to hold beside the "שמור" button.
 *   · THE SAVE MESSAGE WITH THE QUEUE IN IT, which is the longest `message`
 *     this screen sets: 292 waiting publications rewritten plus the
 *     truncation tail.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import Link from 'next/link';
import { SparklesIcon } from '@/components/icons';
import { MediaUploader } from '@/components/social/MediaUploader';
import { PostPreview } from '@/components/social/PostPreview';
import { Button, Card, Field, Notice, inputClass } from '@/components/social/ui';
import { CTA_OPTIONS, type MediaItem } from '@/lib/social/types';
import { counted } from '@/lib/social/time';
import { targetsLabel } from '@/components/social/SchedulePicker';

const pic = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${fill}"/></svg>`)}`;

const media: MediaItem[] = [
  { kind: 'image', url: pic('#c4b5fd'), path: '2026-11-14/1.jpg', name: 'IMG_20261114_214307_HDR.jpg' },
  { kind: 'image', url: pic('#a78bfa'), path: '2026-11-14/2.jpg', name: 'ספה אחרי ניקוי — באר שבע.jpeg' },
  { kind: 'image', url: pic('#ddd6fe'), path: '2026-11-14/3.jpg', name: 'מחירון ניקוי ריפודים 2026.png' },
  { kind: 'video', url: pic('#7c3aed'), path: '2026-11-14/4.mp4', name: 'WhatsApp Video 2026-11-14 at 21.43.07.mp4' },
];

const TITLE = 'ניקוי ריפודי רכב ומושבים בבאר שבע והסביבה — נובמבר';
const LINK = 'https://hapitaron-hamavrik.co.il/services/upholstery-cleaning-beer-sheva?utm_source=facebook&utm_campaign=sofa-nov-2026';
const BASE_TEXT = [
  'ניקוי ספות, מזרנים וריפודי רכב בבאר שבע והסביבה 🛋️',
  '',
  'עובדים עם מכונת אקסטרקציה מקצועית — שואבת את הלכלוך ואת החומר יחד עם המים, בלי להשאיר את הספה רטובה ליומיים.',
  'מגיעים עד הבית, עובדים נקי ומסודר, והספה מתייבשת תוך 3–4 שעות.',
  '',
  'לתיאום ולשאלות: 050-1234567',
].join('\n');

/* The longest message this screen sets — onSave(), with the queue rewritten. */
const SAVE_MESSAGE = `הפוסט נשמר, ו${counted(292, 'פרסום אחד שממתין בתור עודכן', 'פרסומים שממתינים בתור עודכנו', 'שני פרסומים שממתינים בתור עודכנו')} לנוסח החדש. (עודכנו 500 הפרסומים הקרובים בתור)`;

const TARGETS = 252;

/** "תוכן הפוסט" — every field, with the widest value each one can hold. */
const contentCard = (
  <Card title="תוכן הפוסט">
    <Field label="שם פנימי" hint="לזיהוי בלוח הבקרה, לא מתפרסם">
      <input className={inputClass} defaultValue={TITLE} placeholder="למשל: ניקוי ספות באר שבע — ספטמבר" />
    </Field>
    <div className="mt-4">
      <Field label="טקסט בסיסי" hint="הטקסט שיתפרסם כשאין גרסאות. הטלפון וקישור ה-WhatsApp מצורפים אוטומטית בסוף.">
        <textarea className={`${inputClass} min-h-36`} defaultValue={BASE_TEXT} dir="auto" />
      </Field>
    </div>
    <div className="mt-4 grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
      <Field label="שפה">
        <select className={inputClass} defaultValue="he">
          <option value="he">עברית</option>
          <option value="ru">Русский</option>
        </select>
      </Field>
      <Field label="קישור" hint="כרטיס קישור וכפתור CTA מופיעים רק בפוסט ללא תמונות">
        <input className={inputClass} dir="ltr" defaultValue={LINK} placeholder="https://" />
      </Field>
      <Field label="כפתור (CTA)">
        <select className={inputClass} defaultValue="WHATSAPP_MESSAGE">
          {CTA_OPTIONS.map((c) => (
            <option key={c.value} value={c.value}>
              {c.label}
            </option>
          ))}
        </select>
      </Field>
      <Field label="טלפון">
        <input className={inputClass} dir="ltr" defaultValue="050-1234567" />
      </Field>
      <Field label="קישור WhatsApp" hint="wa.me — נבנה אוטומטית מהטלפון בהגדרות">
        <input className={inputClass} dir="ltr" defaultValue="https://wa.me/972501234567" />
      </Field>
    </div>
    <div className="mt-4">
      <p className="mb-1 text-sm font-bold text-mist-300">תמונות / סרטון</p>
      <MediaUploader media={media} onChange={() => {}} />
    </div>
  </Card>
);

/*
 * THE VARIANTS CARD, TWICE, because its header and its body belong to two
 * different states and the header is the tight one.
 *
 *   · `variants-empty` is the real 0-variant screen: the title the count
 *     prints then, and the long paragraph that explains the rotation.
 *   · `variants-full` is the SAME card with the title 12 approved variants
 *     print, beside the same two `shrink-0` action buttons. Its body is the
 *     0-variant paragraph on purpose — the rows themselves are PostEditor's
 *     own markup and are not copied here (see the note at the top) — because
 *     what this case exists to measure is the header.
 */
const variantsAction = (
  <div className="flex gap-2">
    <Button variant="ghost">
      <SparklesIcon className="h-4 w-4" /> צור 4 גרסאות
    </Button>
    <Button variant="secondary">+ גרסה</Button>
  </div>
);
const variantsBody = (
  <p className="text-sm text-mist-500">
    בלי גרסאות מתפרסם הטקסט הבסיסי. עם גרסאות, המערכת מסובבת ביניהן (A→B→C→D) כך שאותו נוסח לא חוזר ברצף — ורק גרסה שאישרתם ידנית יוצאת החוצה.
  </p>
);

/** "יעדי פרסום · 252 יעדים נבחרו" — the title, the Link action, the warning. */
const targetsCard = (
  <Card
    id="post-targets"
    title={`יעדי פרסום${TARGETS ? ` · ${counted(TARGETS, 'יעד אחד נבחר', 'יעדים נבחרו', 'שני יעדים נבחרו')}` : ''}`}
    action={
      <Link href="/social/groups" className="inline-flex min-h-11 items-center text-sm font-bold text-brand-400">
        ניהול קבוצות
      </Link>
    }
  >
    <div className="mb-3">
      <Notice tone="warn">בחרו לפחות יעד אחד — בלי זה אין לאן לפרסם.</Notice>
    </div>
    <Notice tone="warn">אין יעדים עדיין. חברו את פייסבוק במסך הדפים או הוסיפו קבוצות.</Notice>
  </Card>
);

/** "תזמון" — the three controls under the picker, at their longest labels. */
const scheduleCard = (
  <Card title="תזמון">
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button size="lg">{`בדוק והתחל (${targetsLabel(TARGETS)})`}</Button>
      <Button variant="secondary">שמור כטיוטה</Button>
      <Button variant="ghost" className="ms-auto text-error-400">
        ארכיון
      </Button>
    </div>
  </Card>
);

/** The same row in the two other states its primary button can be in. */
const scheduleCardFresh = (
  <Card title="תזמון">
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button size="lg">בחרו יעדים כדי להתחיל</Button>
      <Button variant="secondary">שמור כטיוטה</Button>
    </div>
  </Card>
);
const scheduleCardDated = (
  <Card title="תזמון">
    <div className="mt-4 flex flex-wrap items-center gap-2">
      <Button size="lg">בדוק ושמור תזמון</Button>
      <Button variant="secondary">שמור כטיוטה</Button>
      <Button variant="ghost" className="ms-auto text-error-400">
        ארכיון
      </Button>
    </div>
  </Card>
);

/* The aside: the heading, the real preview, the footnote under it. The 380px
   track is the editor's own, and it is the narrowest box PostPreview ever
   gets on a desk. */
const aside = (
  <aside className="min-w-0 space-y-3 lg:sticky lg:top-28 lg:self-start">
    <div className="flex items-center justify-between">
      <h2 className="text-base font-extrabold text-mist-100">תצוגה מקדימה</h2>
    </div>
    <PostPreview pageName="הפתרון המבריק — ניקוי ספות וריפודים בבאר שבע" text={BASE_TEXT} media={media} link={LINK} cta="WHATSAPP_MESSAGE" />
    <p className="text-xs text-mist-500">התצוגה משוערת; פייסבוק עשויה להציג תמונות וקישורים מעט אחרת.</p>
  </aside>
);

const page = (
  /* SocialShell's own <main> for a screen that shows its title. */
  <main className="crm-page mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 py-5">
    {/* SocialShell's title row, with PostEditor's headerAction in it. */}
    <div className="mb-4 flex items-start justify-between gap-3">
      <div className="min-w-0">
        <h1 dir="auto" className="truncate text-2xl font-extrabold leading-tight tracking-tight text-mist-100">
          {TITLE}
        </h1>
      </div>
      <div className="shrink-0">
        <Button variant="secondary">שמור</Button>
      </div>
    </div>

    <div className="mb-4">
      <Notice tone="success">{SAVE_MESSAGE}</Notice>
    </div>

    <div className="grid gap-5 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
      <div className="min-w-0 space-y-5">
        <div data-editor-case="content">{contentCard}</div>
        <div data-editor-case="variants-full">
          <Card title="גרסאות (12/12 מאושרות)" action={variantsAction}>
            {variantsBody}
          </Card>
        </div>
        <div data-editor-case="variants-empty">
          <Card title="גרסאות (0/0 מאושרות)" action={variantsAction}>
            {variantsBody}
          </Card>
        </div>
        <div data-editor-case="targets">{targetsCard}</div>
        <div data-editor-case="schedule">{scheduleCard}</div>
        <div data-editor-case="schedule-fresh">{scheduleCardFresh}</div>
        <div data-editor-case="schedule-dated">{scheduleCardDated}</div>
        <div data-editor-case="progress">
          <Card title="התקדמות הפרסום">
            <p className="text-sm text-mist-500">התצוגה משוערת; פייסבוק עשויה להציג תמונות וקישורים מעט אחרת.</p>
          </Card>
        </div>
      </div>
      {aside}
    </div>
  </main>
);

process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">${renderToStaticMarkup(page)}</div>
</body></html>`,
);
