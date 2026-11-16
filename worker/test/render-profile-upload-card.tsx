/*
 * ─── THE PROFILE-UPLOAD CARD, MEASURED IN RUSSIAN ─────────────────────────
 *
 * ProfileUploadCard has never been measured in Russian. It is the second of
 * the two cards a brand-new customer meets on /social/account, and it is the
 * only card in the product that puts a Windows path on screen — a
 * 44-character token with nowhere to wrap, sitting in a <code> that
 * dom-translate refuses to touch (CODE is in its SKIP_TAGS), inside a numbered
 * list whose surrounding sentence grows by a third in Russian.
 *
 * The real component with the real compiled Tailwind, through
 * renderToStaticMarkup. Anything hand-written would be measuring a copy, and
 * a copy is what stops failing when the component changes.
 *
 * HOW THE PROPS ARE BUILT. There are none:
 *
 *   src/app/social/account/page.tsx:642
 *     <div className="mt-3">
 *       <ProfileUploadCard />
 *     </div>
 *
 * so case 1 is the whole of the call site, including the `mt-3` wrapper.
 *
 * ─── WHAT THE REAL COMPONENT CAN AND CANNOT PUT ON SCREEN ────────────────
 *
 * `busy` and `note` are useState and both are written only inside upload(),
 * which runs when a file is chosen. renderToStaticMarkup chooses no file, so
 * case 1 is the card exactly as a new Russian customer first sees it: the
 * title ("העברת הפרופיל ל-worker בענן" → "Перенос профиля в облачный
 * worker"), the subtitle, the three numbered steps with the %USERPROFILE%
 * path, one button ("בחר קובץ ZIP להעלאה" → "Выберите ZIP-файл для
 * загрузки", 19 → 31 characters, +63%) and the privacy footnote. No note
 * line.
 *
 * The note is the rest of the card's width, so cases 2 onwards compose it
 * from the REAL `Card` and `Button` exports with the same class strings the
 * component passes — copied from ProfileUploadCard.tsx, not invented.
 * Reported as partially_rendered, because the composition is this fixture's
 * and not the component's.
 *
 * ─── THE SHAPES CHOSEN, AND WHY ──────────────────────────────────────────
 *
 * Width is what decides whether a box holds its text, so:
 *
 *   · THE WINDOWS PATH AT ITS REAL LENGTH. The component hard-codes
 *     `%USERPROFILE%\.hapitaron-social\facebook-profile`, so there is no
 *     shorter or longer shape to choose — it is whatever the card draws, and
 *     it is drawn here by the card itself in case 1.
 *   · EVERY NOTE upload() CAN REALLY SET, all five of them, at the exact
 *     text the component writes:
 *       · the success sentence (111 Hebrew characters against 148 Russian) —
 *         the longest thing this card ever prints, and the only one in
 *         `text-green-600`;
 *       · the Supabase 50MB cap, which carries the untranslatable English
 *         setting name "Upload file size limit" in the middle of a Russian
 *         sentence;
 *       · the missing-bucket sentence, which carries the unbreakable token
 *         `supabase/social-profiles-bucket.sql` (35 characters) in a plain
 *         <p> with no break-all — the one note with a genuinely unwrappable
 *         payload;
 *       · "לא מחוברים — התחברו מחדש ונסו שוב.", the signed-out case, which
 *         upload() throws itself and friendlyMessage passes through;
 *       · and the card's own fallback, "העלאת הפרופיל נכשלה."
 *     All five are run through the real friendlyMessage, exactly as the
 *     component's catch does, rather than typed out.
 *   · THE BUTTON IN FLIGHT, because `busy` puts a 16px spinner and a gap-2
 *     beside the longest button label on the account screen.
 *
 * Nothing here touches the network, Facebook, Supabase or a database: no
 * handler runs, and `supabase` is null without the public env vars anyway.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { ProfileUploadCard } from '@/components/social/ProfileUploadCard';
import { Button, Card } from '@/components/social/ui';
import { friendlyMessage } from '@/lib/social/errors';

/* The card's own title and subtitle, so the composed cases below sit in the
   same box as the real one. Copied from ProfileUploadCard.tsx. */
const TITLE = 'העברת הפרופיל ל-worker בענן';
const SUBTITLE = 'כשמעבירים את מנוע הפרסום לשרת — הפרופיל המחובר עובר איתו, במקום התחברות חדשה שמקפיצה אימות.';

/* The exact sentence the component sets on success. */
const OK_TEXT =
  'הפרופיל הועלה. ה-worker בענן ייקח אותו בהפעלה הבאה שלו, ימחק אותו מהענן וימשיך מהסשן הקיים — בלי התחברות מחדש.';

/*
 * The four failures, through the real classifier. The first three are
 * sentences upload() builds itself and re-throws; friendlyMessage passes them
 * through untouched because they are already Hebrew (isOurs).
 */
const ERRORS: [string, string][] = [
  [
    "the project's 50MB cap",
    friendlyMessage(
      new Error(
        'הקובץ גדול ממגבלת ההעלאה של הפרויקט ב-Supabase. הגדילו את Upload file size limit בהגדרות ה-Storage ונסו שוב.',
      ),
      'העלאת הפרופיל נכשלה.',
    ),
  ],
  [
    'the bucket does not exist yet',
    friendlyMessage(
      new Error('דלי האחסון עדיין לא קיים — הריצו את supabase/social-profiles-bucket.sql ונסו שוב.'),
      'העלאת הפרופיל נכשלה.',
    ),
  ],
  ['signed out mid-upload', friendlyMessage(new Error('לא מחוברים — התחברו מחדש ונסו שוב.'), 'העלאת הפרופיל נכשלה.')],
  ['a raw transport failure — the card’s own fallback', friendlyMessage(new TypeError('Load failed'), 'העלאת הפרופיל נכשלה.')],
];

/** The card's button row, with the same classes the component gives it. */
const row = (busy: boolean) => (
  <div className="mt-3 flex flex-wrap items-center gap-2">
    <Button variant="secondary" busy={busy}>
      בחר קובץ ZIP להעלאה
    </Button>
  </div>
);

const block = (label: string, node: React.ReactNode) => `
  <p style="color:#9aa;font:12px sans-serif;margin:14px 0 4px">${label}</p>
  <div class="profile-probe mt-3">${renderToStaticMarkup(node)}</div>`;

const body = [
  /* 1 — THE CALL SITE, prop for prop: the card a new Russian account sees,
     with the real numbered steps and the real Windows path in it. */
  block('the account screen’s own card — nothing chosen yet', <ProfileUploadCard />),

  /* 2 — the upload in flight. */
  block(
    'the upload in flight — the spinner takes width from the longest label on the screen',
    <Card title={TITLE} subtitle={SUBTITLE}>
      {row(true)}
    </Card>,
  ),

  /* 3 — the success note, the longest sentence this card prints. */
  block(
    'the upload succeeded — the longest note the card can set',
    <Card title={TITLE} subtitle={SUBTITLE}>
      {row(false)}
      <p className="mt-2 text-sm text-green-600">{OK_TEXT}</p>
    </Card>,
  ),

  /* 4..7 — every failure note upload() can set. */
  ...ERRORS.map(([what, text]) =>
    block(
      `the upload failed (${what})`,
      <Card title={TITLE} subtitle={SUBTITLE}>
        {row(false)}
        <p className="mt-2 text-sm text-red-500">{text}</p>
      </Card>,
    ),
  ),
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
