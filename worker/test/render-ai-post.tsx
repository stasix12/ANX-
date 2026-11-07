/*
 * THE FIXTURE ai-post.test.ts MEASURES.
 *
 * The REAL AiPostComposer, rendered with the app's real stylesheet — not a
 * hand-written replica. A replica is exactly the thing that stops failing when
 * the component changes, and the whole point of this measurement is that the
 * owner sent a screenshot as a binding specification: the gradient button at
 * full width, three selects that do not crush their Hebrew labels on a phone,
 * a result card whose three actions are all thumb-sized.
 *
 * TWO STATES IN ONE PAGE, because the second is the one the reference shows
 * and the one with the most to go wrong:
 *
 *   #idle   — the form as it opens: robot card, three selects, topic, button.
 *   #result — the same form with a generated post under it, which is three
 *             more buttons, a version chooser and the handoff.
 *
 * `renderToStaticMarkup` draws the component in whatever state its props and
 * initial useState give it, so the result state is produced by handing the
 * component a seeded history through its own props — see the note there.
 */
import { createElement } from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import { AiPostComposer } from '@/components/social/AiPostComposer';

const block = (id: string, seed?: string) =>
  `<section id="${id}" style="max-width:520px">${renderToStaticMarkup(
    createElement(AiPostComposer, {
      onAccept: () => {},
      hasText: false,
      /* Test-only seed: the component opens showing this as its result, which
         is the state a successful generation leaves it in. Nothing in the app
         passes it — see the prop's own comment in the component. */
      initialResult: seed,
    } as never),
  )}</section>`;

const post = [
  '🛋️ מבצע מיוחד בבאר שבע והסביבה!',
  'ניקוי ספות מקצועי אצלכם בבית – רק 299₪ במקום 450₪!',
  '',
  '✅ שאיבה מוגברת להסרת לכלוך עמוק',
  '✅ התזה מקצועית ובטוחה לבד',
  '✅ ייבוש מהיר במקום',
  '✅ בטוח לילדים ובעלי חיים',
  '',
  '🗓️ מומלץ לשריין מראש – התאריכים מתמלאים במהירות!',
].join('\n');

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div class="social-theme" style="padding:16px">
${block('idle')}
${block('result', post)}
</div></body></html>`);
