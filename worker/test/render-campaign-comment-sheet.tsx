/*
 * THE FIXTURE src/components/social/CampaignCommentSheet.tsx GETS MEASURED IN.
 *
 * ─── WHY THIS IS NOT ONE renderSnapshot(<CampaignCommentSheet/>) ────
 *
 * It was tried first, and it draws NOTHING — one `<span hidden aria-hidden>`.
 * The sheet's whole body is inside <Sheet> (src/components/social/ui.tsx:1208),
 * which holds `const [mounted, setMounted] = useState(false)` with
 * `useEffect(() => setMounted(true), [])` and returns the bare themeAnchor
 * while `!mounted`, because its panel is portalled to document.body and there
 * is no body on the server. Under renderToStaticMarkup that effect never runs,
 * so EVERY sheet in this product server-renders empty. render-queue-tuner-
 * sheet.tsx hit the same wall and this file follows the shape it settled on.
 *
 * So: the REAL presentational pieces the sheet composes are imported and
 * rendered — Notice, Field, MediaUploader, SegmentedControl, Button and
 * inputClass, all straight out of the product — and the sheet's own inline
 * JSX (it has no inner components of its own; the body is inline) is
 * transcribed class string for class string, inside a copy of <Sheet>'s panel
 * chrome. Every SENTENCE is produced by the same expression the component
 * uses — the `howLong` ternary, the `התגובה תיווסף ל-N…` template, the button
 * label, the QUICK_GAPS chip labels — so what the DOM translator matches here
 * is byte-identical to what it matches in the running app.
 *
 * WHAT IS REPRODUCED RATHER THAN IMPORTED, and therefore what a reader has to
 * keep in step with ui.tsx: SheetShell below. `position: fixed`, the portal
 * and the slide-in are dropped so the states stack down one page; every other
 * class on the panel, the drag handle, the header, the scrolling body and the
 * footer is copied from Sheet(placement='sheet', size='md') — ui.tsx:1440-1520
 * — which is the shape all three call sites open this sheet in (they pass no
 * `size`). The geometry that decides whether the Russian fits is the panel's:
 * full viewport width up to md, `md:max-w-lg` (512px) above it, `px-4` either
 * side of the content.
 *
 * HOW THE PROPS ARE BUILT. Three routes render it — src/app/social/page.tsx,
 * src/app/social/campaigns/[id]/page.tsx and src/app/social/campaigns/page.tsx
 * — and all three now pass the same two values out of ONE read, useLastRunScope:
 * `publishedCount` from the last run's own count and `runLabel` naming that
 * run, with `initialText`/`initialMedia`/`initialGapSeconds` from
 * `campaign.comment_text` / `comment_media` / `comment_gap_seconds ?? 30`.
 *
 * IT USED TO BE THE LIFETIME COUNT, and the widest case here is kept at 1,027
 * because of what that cost: the sheet showed the round's lifetime figure over
 * a write that really did touch all of them — "לא נותן להוסיף תגובה לא רק
 * לפוסט שבחרתי אלא ל-224 פרסומים". A single run no longer reaches four digits
 * on this owner's account, but the paragraph and the button must still survive
 * one that does, and the longest `howLong` branch lives up there.
 *
 * ─── THE SHAPES CHOSEN, AND WHY ──────────────────────────────────────────
 *
 *   1  1027 PUBLICATIONS AT A 60-SECOND GAP. The widest the sheet gets: four
 *      digits in the paragraph AND in the button label, and `howLong` on its
 *      hours branch with a decimal — "בערך 17.1 שעות", the longest of the
 *      three branches. The seeded text is a real price-list comment with a
 *      phone number, and one image is attached, so MediaUploader draws a
 *      filled thumbnail strip with its own footer rather than an empty box.
 *   2  THE SAME ROUND AT A 10-SECOND GAP. The only state that lights the
 *      account-safety paragraph (`gapSeconds < 15 && publishedCount > 20`),
 *      which is the longest single sentence in the file, and it moves the
 *      selected chip to the first of the four.
 *   3  TWENTY-ONE PUBLICATIONS, 30-second gap — the shipped default. 21 is
 *      the count that takes Russian's FIRST plural form (5 takes the third,
 *      2 the second, and the three differ in width), and at 21 posts
 *      `howLong` lands on the minutes branch, "בערך 11 דקות".
 *   4  ONE PUBLICATION at the floor gap of 5 seconds, which is the only way
 *      to reach `totalMinutes < 1` and the shortest branch, "פחות מדקה" —
 *      against the longest label and hint in the sheet.
 *   5  NOTHING PUBLISHED YET. publishedCount 0, which is the component's
 *      other whole branch: one Notice and no form at all.
 *
 * Nothing here touches the network, uploads anything or reads a clock.
 */
import { createElement } from 'react';
import { renderSnapshot } from './render-html';
/* The product's own label builder, so the isolate characters and the
   separator measured here are the ones the sheet really renders. */
import { runLabelOf } from '@/components/social/CampaignCommentSheet';
import { CloseIcon } from '@/components/icons';
import { MediaUploader } from '@/components/social/MediaUploader';
import { Button, Field, IconButton, Notice, SegmentedControl, inputClass } from '@/components/social/ui';
import type { MediaItem } from '@/lib/social/types';

/* CampaignCommentSheet.tsx:22, verbatim. */
const QUICK_GAPS = ['10', '20', '30', '60'];

/*
 * ui.tsx Sheet(placement='sheet', size='md') without the portal, without
 * `fixed` and without the entry animation. Classes copied from ui.tsx:1480
 * (the `sheet-in fixed inset-x-0 bottom-0 …` branch) and ui.tsx:1491-1520.
 */
function SheetShell({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div
      role="dialog"
      aria-modal="true"
      tabIndex={-1}
      className="mx-auto flex max-h-[85svh] flex-col rounded-t-sheet border border-ink-700 bg-ink-800 md:max-h-[80svh] md:rounded-card md:max-w-lg"
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
      <div className="min-h-0 grow overflow-y-auto px-4 pb-[calc(1rem+var(--safe-b))]">{children}</div>
    </div>
  );
}

/* Inline so the fixture never reaches the network: a flat tile the size of a
   real upload, which is all the thumbnail strip needs to be measured. */
const pic = `data:image/svg+xml;utf8,${encodeURIComponent(
  '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="#c4b5fd"/></svg>',
)}`;

/* The run every non-empty case is about, through the component's own helper. */
const RUN = runLabelOf({ roundAt: '16:23', fromISO: '2026-11-17T00:00:00.000Z', lastPublishedAt: '2026-11-17T14:41:00.000Z' });

/** A real price-list attachment, the shape this sheet is for. */
const priceList: MediaItem[] = [{ kind: 'image', url: pic, path: 'social-media/pricelist.png', name: 'מחירון נובמבר.png' }];

/** The sheet's body, transcribed from CampaignCommentSheet.tsx:63-154. */
function CommentBody({
  publishedCount,
  runLabel = '',
  atLeast = false,
  failed = false,
  text,
  media,
  gapSeconds,
}: {
  publishedCount: number;
  /* The count is a floor, not a total — the run was longer than the reader
     would walk. One Hebrew word in front of a four-digit number, which is the
     kind of thing that wraps a line in Russian. */
  atLeast?: boolean;
  /* The read failed. A refusal is not an emptiness, and it has its own
     Notice — the widest single sentence in the sheet after the safety one. */
  failed?: boolean;
  /* The run the number is about — "17.11 · 16:23", wrapped in the same
     isolate characters runLabelOf() produces, because they are what keeps the
     date in front of the hour inside an RTL sentence and they are part of
     what gets measured. */
  runLabel?: string;
  text: string;
  media: MediaItem[];
  gapSeconds: number;
}) {
  if (failed) {
    return <Notice tone="warn">לא הצלחנו לבדוק על אילו פרסומים התגובה תיווסף. סגרו ונסו שוב.</Notice>;
  }
  if (publishedCount === 0) {
    return (
      <Notice tone="warn">
        בסבב הזה עוד לא יצא אף פרסום, ולכן אין על מה להגיב. חזרו אחרי שהפרסומים יתחילו לצאת.
      </Notice>
    );
  }
  /* The component's own two expressions, character for character. */
  const totalMinutes = Math.round((publishedCount * gapSeconds) / 60);
  const howLong =
    totalMinutes < 1 ? 'פחות מדקה' : totalMinutes < 60 ? `בערך ${totalMinutes} דקות` : `בערך ${Math.round(totalMinutes / 6) / 10} שעות`;
  const nothing = !text.trim() && media.length === 0;

  return (
    <>
      <Field label="הטקסט של התגובה" hint="אפשר להשאיר ריק ולהעלות רק תמונה.">
        <textarea
          className={inputClass}
          dir="auto"
          rows={4}
          defaultValue={text}
          placeholder="מחירון מלא בתמונה 👇 לתיאום: 050-0000000"
        />
      </Field>
      <div className="mt-3">
        <Field label="תמונה לתגובה (לא חובה)" hint="מחירון, לפני/אחרי — תמונה אחת, זה מה שפייסבוק מאפשרת בתגובה.">
          <MediaUploader media={media} hint="תמונה אחת. זה מה שפייסבוק מאפשרת בתגובה." onChange={() => undefined} />
        </Field>
      </div>

      <div className="mt-3">
        <Field label="מרווח בין תגובה לתגובה (שניות)" hint="כמה זמן להמתין בין פרסום לפרסום.">
          <input className={inputClass} dir="ltr" type="number" min={5} max={600} inputMode="numeric" defaultValue={String(gapSeconds)} />
        </Field>
        <div className="mt-2">
          <SegmentedControl
            variant="chips"
            label="מרווח מהיר"
            value={String(gapSeconds)}
            onChange={() => undefined}
            options={QUICK_GAPS.map((v) => ({ value: v, label: `${v} שנ׳` }))}
          />
        </div>
      </div>

      <p className="mt-3 text-sm text-mist-300">
        התגובה תיווסף ל-{atLeast ? 'לפחות ' : ''}{publishedCount} הפרסומים של הריצה האחרונה{runLabel ? ` (${runLabel})` : ''}, מהחשבון שלכם — {howLong} בסך הכול.
      </p>
      <p className="mt-1.5 text-xs text-mist-500">פרסומים של ריצות קודמות באותו סבב לא ייגעו.</p>
      <p className="mt-1.5 text-xs text-mist-500">
        הן נוספות אחת-אחת ולא כולן יחד, והתוכנה במחשב צריכה לפעול לאורך כל הזמן הזה. אפשר לעקוב בכרטיס הסבב.
      </p>
      {gapSeconds < 15 && publishedCount > 20 && (
        <p className="mt-1.5 text-xs text-warning-400">
          מרווח קצר על הרבה פרסומים הוא הדפוס שפייסבוק מזהה הכי בקלות. 20 שניות ומעלה בטוח יותר לחשבון.
        </p>
      )}
      <p className="mt-1.5 text-xs text-mist-500">
        תגובה נוספת רק לפרסום שהמערכת מזהה בוודאות שהוא שלה. פרסום שלא הצליחה להגיב עליו מסומן בנפרד ולא נספר כאילו הצליח.
      </p>

      <div className="mt-4 flex flex-wrap gap-2">
        <Button disabled={nothing}>{`הוסף תגובה ל-${publishedCount} פרסומים`}</Button>
        <Button variant="secondary">ביטול</Button>
      </div>
    </>
  );
}

const CASES: { id: string; what: string; props: Parameters<typeof CommentBody>[0] }[] = [
  {
    id: 'wide-60s',
    what: '1027 publications at 60s — four digits in the paragraph and the button, "בערך 17.1 שעות"',
    props: {
      publishedCount: 1027,
      runLabel: RUN,
      /* The floor word in front of four digits, which is the widest the
         paragraph gets in either language. */
      atLeast: true,
      text: 'מחירון מלא בתמונה 👇 ניקוי ספות, שטיחים וריפודי רכב בבאר שבע והסביבה — לתיאום: 050-0000000',
      media: priceList,
      gapSeconds: 60,
    },
  },
  {
    id: 'fast-10s',
    what: 'the same round at 10s — the only state that lights the account-safety paragraph',
    props: {
      publishedCount: 1027,
      runLabel: RUN,
      text: 'מחירון מלא בתמונה 👇 ניקוי ספות, שטיחים וריפודי רכב בבאר שבע והסביבה — לתיאום: 050-0000000',
      media: priceList,
      gapSeconds: 10,
    },
  },
  {
    id: 'twentyone-30s',
    what: '21 publications at the shipped 30s default — the first Russian plural form, "בערך 11 דקות"',
    props: { publishedCount: 21, runLabel: RUN, text: 'מחירון בתמונה 👇', media: [], gapSeconds: 30 },
  },
  {
    id: 'single-5s',
    what: 'one publication at the 5s floor — the "פחות מדקה" branch, and the disabled button',
    props: { publishedCount: 1, runLabel: RUN, text: '', media: [], gapSeconds: 5 },
  },
  {
    id: 'nothing-published',
    what: 'nothing has gone out — the other whole branch, one Notice and no form',
    props: { publishedCount: 0, text: '', media: [], gapSeconds: 30 },
  },
  {
    id: 'read-failed',
    what: 'the scope read failed — a refusal, which is not an emptiness and has its own sentence',
    props: { publishedCount: 0, failed: true, text: '', media: [], gapSeconds: 30 },
  },
];

const body = CASES.map(
  (c) => `
  <p data-no-translate style="color:#9aa;font:12px sans-serif;margin:18px 0 6px" data-case="${c.id}">${c.what}</p>
  ${renderSnapshot(
    createElement(SheetShell, { title: 'הוסף תגובה לפרסומים של הריצה האחרונה', children: createElement(CommentBody, c.props) }),
  )}`,
).join('');

process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">${body}</div>
</body></html>`,
);
