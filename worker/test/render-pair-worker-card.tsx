/*
 * ─── THE CLOUD-WORKER PAIRING CARD, MEASURED IN RUSSIAN ───────────────────
 *
 * PairWorkerCard has never been measured in Russian. It is one of the two
 * cards a brand-new customer meets on /social/account before any data
 * exists, so its EMPTY state (no code minted yet) and its FAILURE state are
 * the states that matter — the full one is reached only after a tap.
 *
 * The real component with the real compiled Tailwind, through
 * renderToStaticMarkup. Anything hand-written would be measuring a copy, and
 * a copy is what stops failing when the component changes.
 *
 * HOW THE PROPS ARE BUILT. There are none:
 *
 *   src/app/social/account/page.tsx:638
 *     <div className="mt-3">
 *       <PairWorkerCard />
 *     </div>
 *
 * The card takes no props at all, so case 1 is the whole of the call site,
 * mirrored including the `mt-3` wrapper the page puts it in.
 *
 * ─── WHAT THE REAL COMPONENT CAN AND CANNOT PUT ON SCREEN ────────────────
 *
 * `busy`, `code`, `copied` and `error` are all useState, and all four are
 * written only inside generate() / copy() — which run on a click.
 * renderToStaticMarkup never clicks, so case 1 is the card exactly as a new
 * Russian customer first sees it: the title, the subtitle, the instruction
 * paragraph, ONE button ("צור קוד חיבור" → "Создать код подключения", 14 →
 * 23 characters, +64%), and the SOCIAL_WORKER_PAIRING footnote. No code
 * block, no copy button, no error line.
 *
 * Those three are the rest of the card's width, so case 2 onwards compose
 * them from the REAL `Card` and `Button` exports, in the same row and with
 * the same class strings the component passes — copied from
 * PairWorkerCard.tsx, not invented. Reported as partially_rendered, because
 * the composition is this fixture's and not the component's: if the card
 * rearranges that row, these cases keep measuring the old arrangement while
 * case 1 follows the component.
 *
 * ─── THE SHAPES CHOSEN, AND WHY ──────────────────────────────────────────
 *
 * Width is what decides whether a box holds its text, so:
 *
 *   · THE TWO-BUTTON ROW, which is the tightest box here. Once a code
 *     exists the row holds "צור קוד חדש" → "Создать новый код" AND "העתק" →
 *     "Копировать" (6 → 10 characters), both `min-h-11 px-4 text-sm`
 *     secondary buttons in a `flex flex-wrap items-center gap-2` inside a
 *     p-4 card on a 320px phone. The copied state is the longer of the two
 *     labels — "✓ הועתק" → "✓ Скопировано" (7 → 13) — so both are rendered.
 *   · THE REAL CODE SHAPE. /api/social/pair returns
 *     `data.properties.hashed_token` from Supabase's generateLink — a
 *     64-character lowercase hex digest. It is rendered at that exact length
 *     inside the card's `select-all break-all` <code>, which is the one box
 *     in this card with a genuinely unbreakable payload. <code> is in
 *     dom-translate's SKIP_TAGS, so this string is byte-identical in both
 *     languages and anything it does, it does in Hebrew too.
 *   · THE FOUR FAILURES generate() CAN REALLY SHOW, computed by the real
 *     classifier from the real raw throws rather than typed out. callSocialApi
 *     is what throws: no session ("נדרשת התחברות."), a dead transport
 *     ("Failed to fetch"), a captive portal (the longest sentence any failure
 *     on this card can print — 97 Hebrew characters against 137 Russian), and
 *     an HTTP status with no body, which falls back to the card's own
 *     "יצירת קוד החיבור נכשלה." The error line is a plain wrapping <p>, so
 *     what is being measured in it is whether a long Russian word pushes past
 *     the card's edge.
 *
 * Nothing here touches the network, Facebook, Supabase or a database: no
 * handler runs, and `supabase` is null without the public env vars anyway.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { PairWorkerCard } from '@/components/social/PairWorkerCard';
import { Button, Card } from '@/components/social/ui';
import { friendlyMessage } from '@/lib/social/errors';

/* A Supabase hashed_token is a 64-char hex digest — the exact shape
   /api/social/pair hands back. */
const CODE = '7f3c1a9be42d05867c1b4ea2f90d3c58ab61742e0d9f5c3b8a27e641b0d9c35e';

/* Computed by the real classifier from the real raw throws, exactly as
   PairWorkerCard's catch does it — not typed out. callSocialApi is what
   throws each of these. */
const ERRORS: [string, string][] = [
  ['no session', friendlyMessage(new Error('נדרשת התחברות.'), 'יצירת קוד החיבור נכשלה.')],
  ['no connection', friendlyMessage(new TypeError('Failed to fetch'), 'יצירת קוד החיבור נכשלה.')],
  [
    'a captive portal — the longest failure this card can print',
    friendlyMessage(
      new Error('החיבור לאינטרנט מחזיר דף אחר במקום את המערכת. בדקו את הרשת (רשת אורחים / הזדהות ב-WiFi) ונסו שוב.'),
      'יצירת קוד החיבור נכשלה.',
    ),
  ],
  ['an HTTP status with no body — the card’s own fallback', friendlyMessage(new Error('HTTP 500'), 'יצירת קוד החיבור נכשלה.')],
];

/*
 * The card's own title and subtitle, so the composed cases below sit in the
 * same box as the real one. Copied from PairWorkerCard.tsx.
 */
const TITLE = 'חיבור worker בענן';
const SUBTITLE = 'קוד חד-פעמי שמחבר את מנוע הפרסום לחשבון הזה — בלי למסור סיסמה לאף אחד.';

/* The card's code block, with the same classes the component gives it. */
const CodeBlock = (
  <code dir="ltr" className="mt-3 block select-all break-all rounded-xl bg-ink-900/60 px-3 py-2 text-xs text-mist-200">
    {CODE}
  </code>
);

const block = (label: string, node: React.ReactNode) => `
  <p style="color:#9aa;font:12px sans-serif;margin:14px 0 4px">${label}</p>
  <div class="pair-probe mt-3">${renderToStaticMarkup(node)}</div>`;

const body = [
  /* 1 — THE CALL SITE, prop for prop. No code, no error, not busy: the card
     as a brand-new Russian account first sees it. */
  block('the account screen’s own card — nothing minted yet', <PairWorkerCard />),

  /* 2 — a code on screen, fresh. Two buttons in the row plus the digest. */
  block(
    'a code minted — two buttons in the row, and the 64-char digest',
    <Card title={TITLE} subtitle={SUBTITLE}>
      <p className="text-sm text-mist-300">
        לוחצים, מעתיקים את הקוד ושולחים למי שמקים לכם את השרת. הקוד תקף לשעה, עובד פעם אחת בלבד, ואחרי החיבור הראשון
        המכונה זוכרת את החשבון בעצמה.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary">צור קוד חדש</Button>
        <Button variant="secondary">העתק</Button>
      </div>
      {CodeBlock}
    </Card>,
  ),

  /* 3 — the same, after a successful copy: the longer of the two labels. */
  block(
    'after a copy — "✓ Скопировано", the longest label in the row',
    <Card title={TITLE} subtitle={SUBTITLE}>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary">צור קוד חדש</Button>
        <Button variant="secondary">✓ הועתק</Button>
      </div>
      {CodeBlock}
    </Card>,
  ),

  /* 4 — the mint in flight: Button's own `busy` spinner beside the label,
     which is the only state that adds width to the button itself. */
  block(
    'the mint in flight — the spinner takes width from the label',
    <Card title={TITLE} subtitle={SUBTITLE}>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button variant="secondary" busy>
          צור קוד חיבור
        </Button>
      </div>
    </Card>,
  ),

  /* 5..8 — every failure the card can print, under the button row. */
  ...ERRORS.map(([what, message]) =>
    block(
      `a mint that failed (${what})`,
      <Card title={TITLE} subtitle={SUBTITLE}>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button variant="secondary">צור קוד חיבור</Button>
        </div>
        <p className="mt-2 text-sm text-red-500">{message}</p>
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
