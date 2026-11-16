/*
 * ─── THE UPLOADER, RENDERED SO A BROWSER CAN MEASURE IT ───────────────────
 *
 * MediaUploader has never been measured in Russian. It is reachable from the
 * post composer (src/components/social/PostEditor.tsx, inside "תוכן הפוסט")
 * and from the campaign comment sheet (CampaignCommentSheet.tsx, inside a
 * Field) — two call sites that pass DIFFERENT footers, which is the whole
 * reason the `hint` prop exists, so both are printed here.
 *
 * THE REAL COMPONENT, with the real Tailwind classes. Anything hand-written
 * would be measuring a copy, and a copy is what stops failing when the
 * component changes.
 *
 * ─── WHICH SHAPES, AND WHY THESE ─────────────────────────────────────────
 *
 * Width is what decides whether a box holds its text, so every value here is
 * the widest the screen can really produce:
 *
 *   · THE FILE NAMES. The video tile has no thumbnail, so it prints
 *     `item.name` — and client.ts sets that to `file.name`, the owner's own
 *     file name, untouched. A phone's camera roll and WhatsApp produce
 *     exactly these shapes ("WhatsApp Video 2026-11-14 at 21.43.07.mp4",
 *     "IMG_20261114_214307_HDR.jpg"), and at 320px a 3-column grid gives
 *     that name about 88px. It is user data, so it is the same string in
 *     both languages: whatever it does to the tile, it does in Hebrew too.
 *   · SIX ITEMS, five images and one video. Facebook takes one video per
 *     post (the component says so itself when a second arrives), so one
 *     video plus a handful of stills is the fullest a real post gets, and
 *     six items is what fills the second row at every width.
 *   · BOTH FOOTERS. The default one ("תמונות (כמה שתרצו) או סרטון אחד.") and
 *     the comment sheet's one-image rule, each glued to the Supabase
 *     sentence the component always appends.
 *
 * ─── WHAT THIS CANNOT PUT ON SCREEN ──────────────────────────────────────
 *
 * `busy` and `error` are useState, and renderToStaticMarkup gives the initial
 * value of both. So the spinner, the "מעלה קבצים…" label on the add button
 * and the error line under the grid ("פייסבוק מאפשר סרטון אחד לפוסט.",
 * "ההעלאה נכשלה.", "<name>: קובץ גדול מ-100MB.") are not measured here. The
 * error is a plain wrapping <p> with no height of its own, so the only one
 * of the three with a box to break is the add button's aria-label, which is
 * an attribute and has no width.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { MediaUploader } from '@/components/social/MediaUploader';
import { Card, Field } from '@/components/social/ui';
import type { MediaItem } from '@/lib/social/types';

/* Inline, so the fixture never reaches the network: a flat tile the size of a
   real cover is all `object-fit: cover` needs to be measured. */
const pic = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 120"><rect width="120" height="120" fill="${fill}"/></svg>`)}`;

const image = (n: number, name: string): MediaItem => ({
  kind: 'image',
  url: pic(['#c4b5fd', '#a78bfa', '#ddd6fe', '#8b5cf6', '#ede9fe'][n % 5]),
  path: `2026-11-14/${n}-0000-0000-0000-00000000000${n}.jpg`,
  name,
});

/* The owner's own camera roll and WhatsApp, which is where these files come
   from. The uploader prints the name verbatim for a video. */
const full: MediaItem[] = [
  image(0, 'IMG_20261114_214307_HDR.jpg'),
  image(1, 'ספה אחרי ניקוי — באר שבע.jpeg'),
  image(2, 'WhatsApp Image 2026-11-14 at 21.43.07.jpeg'),
  image(3, 'IMG_20261114_214512.jpg'),
  image(4, 'מחירון ניקוי ריפודים 2026.png'),
  { kind: 'video', url: pic('#7c3aed'), path: '2026-11-14/6-video.mp4', name: 'WhatsApp Video 2026-11-14 at 21.43.07.mp4' },
];

/* One image, which is all a comment may carry — the sheet's own rule. */
const one: MediaItem[] = [image(0, 'מחירון ניקוי ריפודים 2026.png')];

const page = (
  <main className="mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 py-5">
    <div className="space-y-5">
      {/* 1 — THE POST COMPOSER'S UPLOADER, FULL.
          PostEditor puts it inside "תוכן הפוסט" under a label of its own; the
          Card is the real box it is measured in there. */}
      <Card title="תוכן הפוסט">
        <div data-uploader-case="post-full" className="mt-4">
          <p className="mb-1 text-sm font-bold text-mist-300">תמונות / סרטון</p>
          <MediaUploader media={full} onChange={() => {}} />
        </div>
      </Card>

      {/* 2 — THE SAME UPLOADER WITH NOTHING IN IT, which is how every new post
          starts: the dashed add button alone, and the footer under it. */}
      <Card title="תוכן הפוסט">
        <div data-uploader-case="post-empty" className="mt-4">
          <p className="mb-1 text-sm font-bold text-mist-300">תמונות / סרטון</p>
          <MediaUploader media={[]} onChange={() => {}} />
        </div>
      </Card>

      {/* 3 — THE COMMENT SHEET'S UPLOADER, with the label, the hint and the
          footer CampaignCommentSheet.tsx really passes. Its footer is the
          longer of the two, and it sits inside a Field rather than a Card. */}
      <Card title="תגובה אוטומטית">
        <div data-uploader-case="comment" className="mt-3">
          <Field label="תמונה לתגובה (לא חובה)" hint="מחירון, לפני/אחרי — תמונה אחת, זה מה שפייסבוק מאפשרת בתגובה.">
            <MediaUploader media={one} hint="תמונה אחת. זה מה שפייסבוק מאפשרת בתגובה." onChange={() => {}} />
          </Field>
        </div>
      </Card>
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
