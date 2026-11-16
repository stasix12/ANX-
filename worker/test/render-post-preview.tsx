/*
 * ─── "כך זה ייראה בפייסבוק", MEASURED ─────────────────────────────────────
 *
 * PostPreview has never been measured in Russian. It is reachable from three
 * places, and each gives it a different box, so each is reproduced here:
 *
 *   · the post composer's aside — PostEditor.tsx renders it inside
 *     `lg:grid-cols-[1fr_380px]`, so above 1024px it lives in a 380px track
 *     and below that it is the full column;
 *   · the content library — src/app/social/library/page.tsx puts it in a
 *     Sheet size="lg", which is `md:max-w-2xl`;
 *   · the manual-publish screen — src/app/social/manual/[id]/page.tsx, with
 *     the group's name as `pageName` and no CTA at all.
 *
 * THE REAL COMPONENT, rendered with renderToStaticMarkup. A hand-written copy
 * of this card would stop failing the day the card changes, which is the
 * whole reason this repo prints the shipped component.
 *
 * ─── THE POST'S OWN WORDS MUST NOT MOVE ──────────────────────────────────
 *
 * This card answers one question — what will Facebook show? — so the post
 * text carries data-no-translate and has to come out of the Russian run
 * byte-identical to the Hebrew run. Case 2 exists for exactly that: its text
 * is `פרסום לקבוצות פייסבוק`, which IS a key in src/lib/social/i18n.ts
 * ('Публикация в группы Facebook'). Every other realistic post body is prose
 * no dictionary holds, so it would pass that check without ever exercising
 * the guard; a one-line post whose words happen to be a sentence the app also
 * uses is the only shape that does. The CHROME around it (the "עוד" fold,
 * the empty-state line, the three reaction labels) must translate.
 *
 * ─── WHICH SHAPES, AND WHY THESE ─────────────────────────────────────────
 *
 *   · 520 CHARACTERS of real post text in case 1, because the fold at 400 is
 *     a branch of its own: past it the card prints `…` and the "עוד" control.
 *   · SIX IMAGES, which is the `+2` overlay on the fourth tile — four is the
 *     most the grid draws and the overlay only exists past it.
 *   · THE LONGEST CTA the app offers: 'שלח הודעת WhatsApp' of CTA_OPTIONS.
 *     Its row is `justify-between` with a `truncate` host beside it, and the
 *     Russian label is close to twice the Hebrew — the tightest box on the
 *     card and the reason this fixture was written.
 *   · A LONG REAL LINK, because the link card prints the URL itself under a
 *     `truncate`, and the host above it is uppercased with letter-spacing.
 *   · AN EMPTY pageName in case 4, which is the 'שם הדף' fallback — chrome,
 *     and so the one name on the card that IS translated.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { PostPreview } from '@/components/social/PostPreview';
import type { CtaType, MediaItem } from '@/lib/social/types';

const pic = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${fill}"/></svg>`)}`;

const image = (n: number): MediaItem => ({
  kind: 'image',
  url: pic(['#c4b5fd', '#a78bfa', '#ddd6fe', '#8b5cf6', '#ede9fe', '#7c3aed'][n % 6]),
  path: `2026-11-14/${n}.jpg`,
  name: `IMG_2026111${n}_214307.jpg`,
});

/*
 * 520 characters, which is past the 400-character fold. The shape is the one
 * compose.ts produces: the offer, the detail lines, then the phone and the
 * wa.me link renderPostText() appends at the end of every post.
 */
const longText = [
  'ניקוי ספות, מזרנים וריפודי רכב בבאר שבע והסביבה 🛋️',
  '',
  'עובדים עם מכונת אקסטרקציה מקצועית — שואבת את הלכלוך ואת החומר יחד עם המים, בלי להשאיר את הספה רטובה ליומיים.',
  'ניקוי יסודי בעומק הסיבים, הסרת כתמים, ריחות ואבק, חיטוי נגד קרדית האבק והאלרגנים.',
  'מגיעים עד הבית, עובדים נקי ומסודר, והספה מתייבשת תוך 3–4 שעות.',
  '',
  'ספה תלת מושבית — 250 ₪ · פינתית — מ-350 ₪ · מזרן זוגי — 180 ₪ · ריפודי רכב מלאים — 300 ₪',
  'עובדים בבאר שבע, להבים, מיתר, עומר, ערד, דימונה, אופקים ונתיבות.',
  '',
  'לתיאום ולשאלות: 050-1234567',
  'https://wa.me/972501234567',
].join('\n');

const LONG_LINK = 'https://hapitaron-hamavrik.co.il/services/upholstery-cleaning-beer-sheva?utm_source=facebook&utm_campaign=sofa-nov-2026';

/* The business name as it is really stored — the longest the settings allow
   somebody to type and still mean a business. It is user data, not chrome. */
const PAGE_NAME = 'הפתרון המבריק — ניקוי ספות וריפודים בבאר שבע';

type Case = {
  id: string;
  /* The real box this call site gives the card. */
  box: string;
  what: string;
  props: { pageName: string; text: string; media: MediaItem[]; link: string; cta: CtaType };
};

const CASES: Case[] = [
  {
    id: 'editor-aside',
    box: 'lg:max-w-[380px]',
    what: 'the composer aside: a long post, six pictures, the longest CTA',
    props: { pageName: PAGE_NAME, text: longText, media: [0, 1, 2, 3, 4, 5].map(image), link: LONG_LINK, cta: 'WHATSAPP_MESSAGE' },
  },
  {
    id: 'dictionary-text',
    box: 'md:max-w-2xl',
    what: 'a one-line post whose words ARE a dictionary key — the data-no-translate guard',
    props: { pageName: PAGE_NAME, text: 'פרסום לקבוצות פייסבוק', media: [], link: '', cta: 'GET_QUOTE' },
  },
  {
    id: 'empty-link-cta',
    box: 'lg:max-w-[380px]',
    what: 'nothing typed yet: the placeholder line, the link card and the CTA row',
    props: { pageName: PAGE_NAME, text: '', media: [], link: LONG_LINK, cta: 'WHATSAPP_MESSAGE' },
  },
  {
    id: 'video-no-page-name',
    box: 'md:max-w-2xl',
    what: 'a video post with no page name — the translated "שם הדף" fallback',
    props: {
      pageName: '',
      text: 'הנה איך זה נראה בפועל — ניקוי ספה פינתית בבאר שבע, מתחילת העבודה ועד היובש. 050-1234567',
      media: [{ kind: 'video', url: pic('#111827'), path: '2026-11-14/v.mp4', name: 'WhatsApp Video 2026-11-14 at 21.43.07.mp4' }],
      link: '',
      cta: 'CALL_NOW',
    },
  },
  {
    id: 'manual-screen',
    box: 'md:max-w-2xl',
    what: 'the manual-publish screen: the group name as the page, two pictures, no CTA',
    props: {
      pageName: 'תושבי באר שבע והסביבה — קונים, מוכרים וממליצים',
      text: longText.slice(0, 390),
      media: [0, 1].map(image),
      link: '',
      cta: '',
    },
  },
];

const page = (
  <main className="mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 py-5">
    <div className="space-y-5">
      {CASES.map((c) => (
        <div key={c.id} data-preview-case={c.id} className={`min-w-0 ${c.box}`}>
          <PostPreview {...c.props} />
        </div>
      ))}
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
