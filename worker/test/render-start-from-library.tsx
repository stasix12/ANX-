/*
 * THE LIBRARY SHORTCUT ABOVE THE EMPTY EDITOR, AS A MEASURABLE PAGE —
 * src/components/social/StartFromLibrary.tsx.
 *
 * Written for the Russian layout sweep: of the 59 components the publishing
 * app renders, this one was reachable from no fixture, so the three sentences
 * it puts above the campaign editor had never been measured in Russian.
 *
 * ─── THE REAL COMPONENT, AND THE ONE BRANCH IT CANNOT REACH ───────────────
 *
 * Case 1 is `renderToStaticMarkup(<StartFromLibrary hidden={false} …/>)` — the
 * shipped component, with its real Card, its real `t()` calls and its real
 * Skeleton strip. That is the state the server reaches on its own and it is
 * the state the owner sees first: `posts` is `useState<Post[] | null>(null)`
 * and the only thing that fills it is `listRecentPosts()` inside a useEffect,
 * which renderToStaticMarkup never runs. Everything above the strip — the
 * title, the subtitle and the "כל הספרייה" link, which are the component's
 * only three translated strings and the only boxes in it that can break — is
 * drawn in full here, by the real component.
 *
 * Case 2 is THE LOADED STRIP, which no amount of data reaches from the server:
 * the branch is gated on `posts` being non-null. So it is drawn the way the
 * harness asks for an unreachable branch — from the REAL pieces the component
 * composes (Card, PostCover, ClipboardListIcon) with the `<ul>` / `<button>` /
 * `<span>` between them transcribed class string for class string from
 * StartFromLibrary.tsx:80-106. Reported as partially rendered, because a
 * transcription stops failing when the component changes.
 *
 * It is worth saying what that branch can and cannot break, since the
 * transcription is the weaker measurement: the only translated string in it is
 * 'ללא שם', and every thumbnail label — translated or not — sits in a
 * `truncate` inside a `w-20` button, which clips a realistic post title in
 * Hebrew just as hard as in Russian.
 *
 * THE PROPS ARE THE ROUTE'S. src/components/social/PostEditor.tsx:673 is the
 * only mount:
 *
 *   hidden  Boolean(postId) || Boolean(post.title.trim() || post.base_text.trim()
 *                                     || post.media.length)
 *   onPick  startFrom — copies the old post into the form
 *
 * `hidden` is false here, because `hidden: true` returns null and there is
 * nothing to measure; the editor opens in exactly that state on "+ קמפיין
 * חדש". The card sits in the left track of PostEditor's
 * `grid gap-5 lg:grid-cols-[1fr_380px]` under SocialShell's
 * `mx-auto max-w-6xl px-4` main, and both boxes are reproduced, because the
 * width of the box is what decides whether the Russian fits.
 *
 * ─── THE SHAPES CHOSEN, AND WHY ───────────────────────────────────────────
 *
 *   · TWELVE POSTS, which is the most the strip can hold: listRecentPosts()
 *     takes `limit = 12` and the component maps all of them. Twelve `w-20`
 *     cards plus gaps is 264px of content, so the strip overflows its own box
 *     at every width this repo measures and the `overflow-x-auto` scroller is
 *     exercised rather than assumed.
 *   · THE LONGEST POST TITLES THE LIBRARY REALLY HOLDS — a full ad headline, a
 *     Russian title inside an RTL card, an unspaced Russian compound with
 *     nowhere to wrap, and one post with no title at all, which is the only
 *     way to reach 'ללא שם'. post.title is free text and the card truncates
 *     it, so these are the shapes that decide where the label is cut.
 *   · BOTH COVER BRANCHES: posts with an image, a post whose only media is a
 *     video (PostCover draws the poster frame and the play mark, which is the
 *     taller of the two), and posts with no media at all, which draw the
 *     clipboard mark instead — a gap the owner would read as a cover that
 *     failed to load.
 *
 * NOTHING HERE touches the network: listRecentPosts is never called in case 1
 * (the effect does not run) and never called in case 2 (the rows are literals),
 * and the covers are inline SVG data URIs, as render-card.tsx does it.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { ClipboardListIcon } from '@/components/icons';
import { PostCover } from '@/components/social/PostCover';
import { StartFromLibrary } from '@/components/social/StartFromLibrary';
import { Card } from '@/components/social/ui';
import { t } from '@/lib/social/i18n';
import type { MediaItem, Post } from '@/lib/social/types';

/* Inline so the fixture never reaches the network — render-card.tsx's trick. */
const pic = (fill: string) =>
  `data:image/svg+xml;utf8,${encodeURIComponent(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 120 160"><rect width="120" height="160" fill="${fill}"/></svg>`)}`;
const img = (i: number): MediaItem[] => [{ kind: 'image', url: pic('#c4b5fd'), path: `p/${i}.png`, name: `ספה אחרי ניקוי — באר שבע.jpeg` }];
const vid = (i: number): MediaItem[] => [{ kind: 'video', url: pic('#a78bfa'), path: `v/${i}.mp4`, name: `WhatsApp Video 2026-11-14 at 21.43.07.mp4` }];

const post = (id: number, title: string, media: MediaItem[]): Post => ({
  id: `p${id}`,
  campaign_id: null,
  title,
  base_text: 'ניקוי ספות ושטיחים בבאר שבע והסביבה — ניקוי בקיטור, הסרת כתמים וריחות, מגיעים עד הבית.',
  language: 'he',
  link_url: '',
  cta_type: '',
  phone: '',
  whatsapp_url: '',
  media,
  status: 'ready',
  created_at: '2026-11-01T09:00:00Z',
  updated_at: '2026-11-14T09:00:00Z',
});

/* The twelve listRecentPosts() returns, longest and most awkward first. */
const POSTS: Post[] = [
  post(1, 'ניקוי ספות ושטיחים בבאר שבע והסביבה — מבצע נובמבר', img(1)),
  post(2, 'Чистка диванов Беэр-Шева и окрестности — объявления', vid(2)),
  post(3, 'БеэрШеваЧисткаДивановКовровМатрасовНедорогоСВыездомНаДом', img(3)),
  post(4, '', img(4)),
  post(5, 'ניקוי ריפודי רכב ומושבים בבאר שבע והסביבה', vid(5)),
  post(6, 'מחירון ניקוי ריפודים 2026', []),
  post(7, 'Наша Беэр-Шева 24 — реклама', img(7)),
  post(8, 'ניקוי מזגנים — באר שבע', []),
  post(9, 'ניקוי שטיחים בערד', img(9)),
  post(10, 'אופקים ביחד — קהילת העסקים והתושבים', img(10)),
  post(11, 'ניקוי ספות — מבצעים באר שבע', vid(11)),
  post(12, 'דרושים דרום — פרסומת', img(12)),
];

/*
 * StartFromLibrary.tsx:56-108 with `posts` filled. The Card, the PostCover and
 * the ClipboardListIcon are the real components; the strip, the button and the
 * label between them are transcribed from :80-106.
 */
function LoadedStrip() {
  return (
    <Card
      title={t('התחילו מפוסט שכבר יש לכם')}
      subtitle={t('לחיצה ממלאת את הטופס — הטקסט, התמונות, הקישור והכפתור. הפוסט המקורי לא משתנה.')}
      action={
        <a href="/social/library" className="inline-flex min-h-11 items-center px-2 text-sm font-bold text-brand-400">
          {t('כל הספרייה')}
        </a>
      }
    >
      <ul className="-mx-1 flex snap-x gap-2 overflow-x-auto px-1 pb-1 [&>*]:min-w-0">
        {POSTS.map((p) => (
          <li key={p.id} className="shrink-0 snap-start">
            <button
              type="button"
              className="block w-20 rounded-xl border border-ink-700 bg-ink-850 p-1.5 text-start transition-colors hover:border-brand-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
            >
              {p.media?.length ? (
                <PostCover media={p.media} className="h-16 w-full" />
              ) : (
                <span className="grid h-16 w-full place-items-center rounded-lg bg-ink-800 text-ink-500">
                  <ClipboardListIcon aria-hidden className="h-4 w-4" />
                </span>
              )}
              <span dir="auto" className="mt-1 block truncate text-[11px] font-bold leading-4 text-mist-100">
                {p.title || 'ללא שם'}
              </span>
            </button>
          </li>
        ))}
      </ul>
    </Card>
  );
}

const CASES = [
  {
    id: 'loading',
    what: 'the real component, in the state the editor opens with (posts === null)',
    node: createElement(StartFromLibrary, { hidden: false, onPick: () => undefined }),
  },
  {
    id: 'loaded',
    what: 'the strip with twelve posts — the branch the server cannot reach, from the pieces it composes',
    node: createElement(LoadedStrip),
  },
];

const body = CASES.map((c) =>
  createElement(
    'div',
    { key: c.id, 'data-library-case': c.id, className: 'mb-5' },
    createElement('p', { style: { color: '#9aa', font: '12px sans-serif', margin: '14px 0 4px' } }, c.what),
    c.node,
  ),
);

/*
 * SocialShell's main plus PostEditor's own two-track grid, so the card is
 * 848px at a desk and the whole width on a phone — the geometry that decides
 * this.
 */
process.stdout.write(
  `<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950">
<div class="social-theme">
  <main class="mx-auto min-w-0 max-w-6xl overflow-x-clip px-4 py-5">
    <div class="grid gap-5 lg:grid-cols-[1fr_380px] [&>*]:min-w-0">
      <div class="min-w-0 space-y-5">${renderToStaticMarkup(createElement('div', null, body))}</div>
    </div>
  </main>
</div>
</body></html>`,
);
