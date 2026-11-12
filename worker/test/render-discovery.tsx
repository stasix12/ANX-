/*
 * THE FIXTURE discovery-row.test.ts MEASURES.
 *
 * A .tsx rather than a string inside the test, for the reason render-card.tsx
 * gives: anything hand-written here would measure a copy of the component, and
 * a copy is exactly what stops failing when the component changes.
 *
 * SEVEN ROWS, AND EVERY ONE OF THEM IS A SHAPE THAT BREAKS A ROW IN AN RTL
 * PAGE. The owner asked for exactly this — "תבדוק שהפיצ'ר עובד טוב גם בעברית
 * RTL וגם בשמות קבוצות ברוסית" — and his own group list really does hold all
 * three scripts:
 *
 *   • Hebrew, which is the page's own direction and the easy case.
 *   • Cyrillic, which is LEFT to right inside a RIGHT-to-left row. Without
 *     dir="auto" on the name its trailing punctuation and any digits are
 *     thrown to the wrong end, so "Беэр-Шева 24" renders as "24 Беэр-Шева".
 *   • A name that MIXES them, which is the worst case and the commonest: a
 *     Russian-language group for an Israeli city usually carries the Hebrew
 *     name too.
 *   • A Latin name, for the same reason as Cyrillic.
 *   • A very long Hebrew name with every badge on the row, which is where a
 *     row either truncates or pushes its buttons off the screen.
 *   • A group with no picture, no member count and no privacy — all three
 *     unknown, which is what a card that had not finished rendering gives us.
 *   • A group already in the publishing list, which carries one badge more
 *     than any other row.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { GroupRow, MyGroupsCard } from '@/components/social/Discovery';
import { joinCardView } from '@/lib/social/join-run';
import type { DiscoveredGroupRow } from '@/lib/social/types';

/* A 1x1 PNG as a data URI: this measures whether an <img> is rendered at all,
   and a fixture must not reach the network to answer that. */
const BORROWED =
  'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==';

const row = (over: Partial<DiscoveredGroupRow>): DiscoveredGroupRow => ({
  id: over.external_id ?? 'x',
  external_id: over.external_id ?? 'x',
  name: 'קבוצה',
  url: 'https://www.facebook.com/groups/x',
  image_url: '',
  members: 54_300,
  privacy: 'public',
  membership: 'none',
  queries: ['באר שבע'],
  first_seen_at: '2026-09-30T10:00:00Z',
  last_seen_at: '2026-09-30T10:00:00Z',
  target_id: null,
  hidden: false,
  ...over,
});

/*
 * AND ONE MORE COLUMN: `exact`.
 *
 * "להראות הכל, לסמן מה מדויק" — the search stopped deleting the results whose
 * name does not carry the phrase, and marks the ones that do instead. That
 * mark is another chip on a row that already truncates, in an RTL page, beside
 * names in three scripts — the exact shape that has pushed controls off a
 * 360px screen once in this feature. So the worst row here carries it: the
 * longest Hebrew name with every other badge already on it.
 *
 *   [label, row, already, picked, exact]
 */
const cases: [string, DiscoveredGroupRow, boolean, boolean, boolean][] = [
  ['Hebrew, not a member', row({ external_id: '1', name: 'באר שבע ביחד' }), false, false, true],
  ['Cyrillic in an RTL row', row({ external_id: '2', name: 'Наша Беэр-Шева 24', members: 12_000, privacy: 'private', membership: 'member' }), false, false, false],
  ['mixed Hebrew and Cyrillic', row({ external_id: '3', name: 'Беэр-Шева — באר שבע והסביבה', members: 8_400, membership: 'requested' }), false, false, true],
  ['Latin', row({ external_id: '4', name: 'Beer Sheva Community Board', members: 1_234_567 }), false, false, false],
  [
    'a very long Hebrew name with every badge',
    row({ external_id: '5', name: 'קבוצת תושבי שכונת נווה זאב ורמות באר שבע — קניה, מכירה, המלצות ועסקים מקומיים', members: 98_700, privacy: 'private', membership: 'member' }),
    true,
    true,
    true,
  ],
  ['nothing known about it', row({ external_id: '6', name: 'דרושים דרום', members: null, privacy: 'unknown', membership: 'unknown' }), false, false, false],
  ['already in the publishing list', row({ external_id: '7', name: 'עסקים בבאר שבע', membership: 'member' }), true, false, true],
  /*
   * A ROW WITH NO PICTURE OF ITS OWN, BESIDE ONE THE PUBLISHING LIST HAS.
   *
   * "בקוביה הסגולה איפה שהאות תכניס לשם את התמונה." The fallback is a prop,
   * and a prop that is threaded but never read renders exactly the letter it
   * was meant to replace — which is the shape of the two button skins that
   * were written and never painted. So it is rendered and looked at.
   */
  ['no picture of its own — the publishing list has one', row({ external_id: '8', name: 'קבוצה עם תמונה מושאלת', membership: 'member' }), true, false, false],
  /*
   * ─── THE JOIN LOG, ON THE TWO CARDS THAT ACTUALLY HAPPEN ─────────────
   *
   * APPENDED, never inserted: the `מדויק` expectations below are keyed on
   * row INDEX, so putting these in the middle would silently re-target them.
   *
   * Row 9 is the live card the reference draws — inside a group, waiting for
   * Facebook's answer, three of four steps lit. Row 10 is the case the live
   * database says is far commoner: a group with no join button at all, which
   * returns before anything is pressed, so the two middle steps were never
   * taken and must not be drawn as though they were. 46 of this owner's 88
   * real outcomes are that one.
   *
   * Both carry the longest realistic name, because the band sits in the same
   * column the name wraps in and the worst case is both at once.
   */
];

const liveRow = row({ external_id: '9', name: 'אופקים ביחד — קהילת העסקים והתושבים', members: 34_000, membership: 'none' });
const endedRow = row({ external_id: '10', name: 'קבוצת תושבי שכונת נווה זאב ורמות באר שבע — קניה, מכירה והמלצות', members: 98_700, membership: 'none' });

/* The two states handed in exactly as the page hands them: computed by
   joinCardView from a progress blob, never hand-written here — a fixture that
   drew its own idea of the stepper would measure a copy. */
const liveView = joinCardView({
  v: 1, total: 6, done: 2, joined: 1, pending: 1,
  index: 2, url: liveRow.url, stage: 'waiting', clicked: true, outcome: '',
  gapUntil: null, at: '2026-11-12T20:55:00Z', startedAt: '2026-11-12T20:40:00Z',
});
const endedView = joinCardView({
  v: 1, total: 6, done: 3, joined: 1, pending: 1,
  index: 3, url: endedRow.url, stage: 'done', clicked: false, outcome: 'no-button',
  gapUntil: null, at: '2026-11-12T20:57:00Z', startedAt: '2026-11-12T20:40:00Z',
});

const runs = `
  <p style="color:#9aa;font:12px sans-serif;margin:14px 0 4px">join log — live, waiting for the answer</p>
  <div class="row-probe">${renderToStaticMarkup(
    GroupRow({ row: liveRow, picked: true, already: false, busy: false, exact: false, run: liveView, fallbackImage: null, onToggle: () => {}, onAdopt: () => {}, onHide: () => {} }) as never,
  )}</div>
  <p style="color:#9aa;font:12px sans-serif;margin:14px 0 4px">join log — ended with no join button, middle steps never taken</p>
  <div class="row-probe">${renderToStaticMarkup(
    GroupRow({ row: endedRow, picked: true, already: false, busy: false, exact: false, run: endedView, fallbackImage: null, onToggle: () => {}, onAdopt: () => {}, onHide: () => {} }) as never,
  )}</div>`;

const body = cases
  .map(
    ([label, r, already, picked, exact]) => `
  <p style="color:#9aa;font:12px sans-serif;margin:14px 0 4px">${label}</p>
  <div class="row-probe">${renderToStaticMarkup(
    GroupRow({
      row: r,
      picked,
      already,
      busy: false,
      exact,
      /* Only the borrowed-picture fixture gets one, so the test can prove the
         letter is replaced for it and kept for every other row. */
      fallbackImage: r.external_id === '8' ? BORROWED : null,
      onToggle: () => {},
      onAdopt: () => {},
      onHide: () => {},
    }) as never,
  )}</div>`,
  )
  .join('');

/*
 * AND THE CARD, WHICH WAS NEVER MEASURED UNTIL IT HAD A BUG IN IT.
 *
 * "מה זה הקבוצות האלה??? אני לא הוספתי אותם" — the card filled with
 * ninety-three groups he had never joined. Four locks now stop that, all of
 * them rules, and the card got the one thing a rule cannot give it: a ✕ beside
 * every name, so a wrong one goes in a tap instead of in a release.
 *
 * That ✕ is a 44px control dropped into a row whose middle item truncates, in
 * an RTL page, next to names in three scripts — which is the exact shape that
 * has already pushed controls off a 360px screen once in this feature. The
 * comment in page.tsx claimed this fixture measured the card. It did not. It
 * does now, with the same four scripts and the same long name, because an
 * unmeasured touch target on a phone is the thing the owner reports.
 */
const cardRows = [
  row({ external_id: 'c1', name: 'באר שבע ביחד', membership: 'member' }),
  row({ external_id: 'c2', name: 'Наша Беэр-Шева 24', members: 12_000, privacy: 'private', membership: 'member' }),
  row({ external_id: 'c3', name: 'Беэр-Шева — באר שבע והסביבה', membership: 'member' }),
  row({
    external_id: 'c4',
    name: 'קבוצת תושבי שכונת נווה זאב ורמות באר שבע — קניה, מכירה, המלצות ועסקים מקומיים',
    membership: 'member',
  }),
  /*
   * A NAME WITH NOWHERE TO BREAK, which is the only shape that actually tests
   * the truncation. Every other name here has spaces, so it wraps and the
   * line stays inside the card whether or not it truncates at all — deleting
   * `min-w-0 truncate` from the name passed the measurement, which made the
   * guard worthless. Russian group names really are written this way, as one
   * closed compound, and one of them is enough to push the ✕ off a 360px
   * screen.
   */
  row({
    external_id: 'c5',
    name: 'БеэрШеваОбъявленияКуплюПродамОтдамБесплатноБарахолкаЮгИзраиля',
    members: 3_100,
    membership: 'member',
  }),
];

const card = `
  <p style="color:#9aa;font:12px sans-serif;margin:22px 0 4px">the "my groups" card</p>
  <div class="card-probe">${renderToStaticMarkup(
    MyGroupsCard({
      /*
       * TWO DIFFERENT SETS, because the difference between them IS the card.
       * Passing one array for both made the headline render "5 … 5", so
       * swapping the two counts was invisible, and rendering `joined` where
       * `missing` belongs was pixel-identical — the exact mismatch that let
       * "מתוך 164 … 1 עוד לא ברשימת הפרסום" be true of 163.
       */
      joined: [...cardRows, row({ external_id: 'c6', name: 'כבר ברשימת הפרסום', membership: 'member' })],
      missing: cardRows,
      scanning: false,
      busy: false,
      onScan: () => {},
      onAdopt: () => {},
      onHide: () => {},
      busyId: null,
    }) as never,
  )}</div>`;

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div class="social-theme" style="padding:16px">${body}${runs}${card}</div></body></html>`);
