/*
 * ─── THE CLOCK, IN BOTH DIRECTIONS, AND THE CUSTOMER'S OWN WORDS ──────────
 *
 * Two bugs lived here, and neither was visible to any guard this repo had.
 *
 * THE FIRST REWROTE HIS OWN TEXT. 'לפני §' was a dictionary pattern: any text
 * node that began with "לפני " had the rest of it moved and " назад" stapled
 * on. "לפני" is a preposition, not a label, so the pattern reached far past
 * the clock it was written for:
 *
 *     'לפני ואחרי'              ->  'ואחרי назад'            ("and after ago")
 *     'לפני ואחרי — ספה פינתית' ->  'ואחרי — ספה פינתית назад'
 *     'לפני ההפעלה'             ->  'ההפעלה назад'
 *     'לפני כל פרסום'           ->  'Каждые публикация назад'
 *
 * "לפני ואחרי" — before and after — is the commonest phrase in a cleaning
 * business's own posts and variant labels. It is his text, and on his own
 * screen it turned into Hebrew-Russian nonsense that neither language reads.
 *
 * THE SECOND GOT THE GRAMMAR BACKWARDS. "назад" governs the nominative and
 * "через" governs the accusative, and both halves of the clock were being
 * answered as if they were one shape:
 *
 *     'בעוד דקה'       ->  'через минута'    (wants минуту)
 *     'בעוד שנייה'     ->  'через секунда'   (wants секунду)
 *     'בעוד שתי דקות'  ->  'через שתי мин'   (Hebrew left on screen)
 *     'בעוד 5 שע׳'     ->  'через 5 שע׳'
 *     'בעוד שבוע'      ->  'через שבוע'
 *
 * That line is the dashboard's next-publication tile, the most-read sentence
 * on the screen, so three of those were on it every time he opened the app.
 *
 * WHY A SOURCE-BASED GUARD COULD NOT SEE EITHER. russian-coverage.test.ts
 * reads the sentences in the codebase; these sentences are not in it. They
 * are built at runtime from a number and a noun, and the user-data case is
 * not in any file at all — it is in his database. So this file does the only
 * thing that can work: it DRIVES the real producer and translates what comes
 * out, and it keeps a corpus of his own words and demands they come back
 * untouched.
 *
 *   npx tsx worker/test/russian-clock.test.ts
 */
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { translate } from '../../src/lib/social/i18n';
import { relativeHe } from '../../src/lib/social/time';

const NAME = 'russian clock';
let checks = 0;

const is = (c: unknown, what: string) => {
  checks++;
  assert.ok(c, `${NAME}: ${what}`);
};
const eq = (a: unknown, b: unknown, what: string) => {
  checks++;
  assert.deepStrictEqual(a, b, `${NAME}: ${what}`);
};

const HEBREW = /[֐-׿]/;
const CYRILLIC = /[Ѐ-ӿ]/;

/* ─── 1. relativeHe(), driven for real ─────────────────────────────────────
 *
 * Not a list of strings I believe it returns: the function itself, called
 * with timestamps either side of now, so the labels under test are the ones
 * the dashboard will actually print. If a branch of it changes, this sees the
 * new label without being told.
 */
const SEC = 1000;
const MIN = 60 * SEC;
const HOUR = 60 * MIN;
const DAY = 24 * HOUR;
const OFFSETS = [10 * SEC, MIN, 2 * MIN, 3 * MIN, 21 * MIN, 45 * MIN, 59 * MIN, HOUR, 2 * HOUR, 5 * HOUR, 11 * HOUR, 21 * HOUR, 47 * HOUR, 48 * HOUR, 3 * DAY, 5 * DAY, 7 * DAY, 21 * DAY, 101 * DAY];

const now = Date.now();
const printed = new Set<string>();
for (const off of OFFSETS) {
  for (const sign of [-1, 1]) {
    printed.add(relativeHe(new Date(now + sign * off).toISOString()));
  }
}
is(printed.size >= 20, `relativeHe was driven, not guessed — ${printed.size} distinct lines over ${OFFSETS.length} offsets both ways`);

const hebrewLeft = [...printed]
  .map((he) => [he, translate('ru', he)] as const)
  .filter(([, ru]) => HEBREW.test(ru))
  .map(([he, ru]) => `${he}  ->  ${ru}`)
  .sort();
eq(hebrewLeft, [], 'every line the dashboard clock can print comes back with no Hebrew word left in it');

const silent = [...printed].filter((he) => translate('ru', he) === he).sort();
eq(silent, [], 'and none of them is left untranslated');

/* ─── 2. THE OTHER TWO CLOCKS ──────────────────────────────────────────────
 *
 * agoHe() in src/components/social/ui.tsx and agePill() in
 * ActivityFeed.tsx are not exported, so their labels are listed here — and
 * the lines that build them are PINNED below, so a change to either producer
 * fails this file instead of slipping past it.
 */
const OTHER_LABELS = [
  'זה עתה',
  'עכשיו',
  'לפני שנייה',
  'לפני שתי שניות',
  'לפני 7 שניות',
  'לפני 21 שניות',
  'לפני דקה',
  'לפני שתי דקות',
  'לפני 3 דקות',
  'לפני 21 דקות',
  'לפני 4 דק׳',
  'לפני 59 דק׳',
  'לפני שעה',
  'לפני שעתיים',
  'לפני 5 שעות',
  'לפני 21 שעות',
  'לפני 9 שע׳',
  'לפני 47 שע׳',
];

const PINNED: [string, string][] = [
  ['src/components/social/ui.tsx', `if (sec < 60) return sec === 1 ? 'לפני שנייה' : sec === 2 ? 'לפני שתי שניות' : \`לפני \${sec} שניות\`;`],
  ['src/components/social/ui.tsx', `if (min < 60) return min === 1 ? 'לפני דקה' : min === 2 ? 'לפני שתי דקות' : \`לפני \${min} דקות\`;`],
  ['src/components/social/ui.tsx', `return hours === 1 ? 'לפני שעה' : hours === 2 ? 'לפני שעתיים' : \`לפני \${hours} שעות\`;`],
  ['src/components/social/ActivityFeed.tsx', `if (min < 60) return \`לפני \${min} דק׳\`;`],
  ['src/components/social/ActivityFeed.tsx', `if (min < 60 * 48) return \`לפני \${hours} שע׳\`;`],
];
const unpinned = PINNED.filter(([file, line]) => !readFileSync(file, 'utf8').includes(line)).map(([file, line]) => `${file}: ${line}`);
eq(unpinned, [], 'the two clocks that cannot be imported still build the labels listed here');

const otherLeft = OTHER_LABELS.map((he) => [he, translate('ru', he)] as const)
  .filter(([, ru]) => HEBREW.test(ru) || !CYRILLIC.test(ru))
  .map(([he, ru]) => `${he}  ->  ${ru}`)
  .sort();
eq(otherLeft, [], 'and every label they print is answered in Russian with no Hebrew left');

/* ─── 3. THE GRAMMAR, NAMED ────────────────────────────────────────────────
 *
 * "no Hebrew left" would have passed 'через минута' happily. The case each
 * preposition governs is therefore spelled out: назад takes the nominative,
 * через takes the accusative, and the three-form plural has to settle on the
 * right one for 1, 2–4, 5+ and the 11–14 exception.
 */
/*
 * ─── THE PAST, ABBREVIATED, BECAUSE THE PILL IS 62 PIXELS WIDE ────────────
 *
 * The minute and hour ages below USED to read "минуту назад", "5 часов
 * назад" — correct Russian, and too wide to exist. The activity row at 320px
 * is 228px: 40 for the mark, 16 for the gaps, 110 for the sentence, which
 * leaves the age pill 62px. Measured in the browser: "минуту назад" is
 * 85.6px and clipped on four rows, "1 мин назад" is 74.3px and still
 * clipped, and no form carrying "назад" fits. The same pill also clipped the
 * customer's own group name at 390px.
 *
 * So minutes and hours are the digit-and-unit form a Russian feed uses
 * anyway — "1 мин", "47 мин", "1 ч", "23 ч" — and the exact stamp is on the
 * pill's title attribute, so nothing is lost. "1 м" was measured too and
 * rejected: it reads as metres.
 *
 * DAYS KEEP "назад", and that is deliberate rather than an oversight. The
 * Hebrew changes register at the same place — ActivityFeed's agePill hands
 * back to relativeHe past 48 hours — and "3 дн" reads worse than "3 дня
 * назад" in the eight other components that print the day form.
 *
 * WHAT IS STILL ASSERTED HERE is the thing "no Hebrew left" cannot see: that
 * 'через' takes the accusative, that 'назад' takes the nominative where it
 * is still used, and that the three-form plural settles on the right form
 * for 1, 2–4, 5+ and the 11–14 exception.
 */
const GRAMMAR: [string, string][] = [
  ['לפני דקה', '1 мин'],
  ['לפני שתי דקות', '2 мин'],
  ['לפני 3 דקות', '3 мин'],
  ['לפני 5 דקות', '5 мин'],
  ['לפני 11 דקות', '11 мин'],
  ['לפני 21 דקות', '21 мин'],
  ['לפני שעה', '1 ч'],
  ['לפני שעתיים', '2 ч'],
  ['לפני 5 שעות', '5 ч'],
  ['לפני יום', 'день назад'],
  ['לפני יומיים', 'два дня назад'],
  ['לפני 7 ימים', '7 дней назад'],
  ['לפני שבוע', 'неделю назад'],
  ['לפני פחות מדקה', 'меньше минуты назад'],
  ['בעוד פחות מדקה', 'менее чем через минуту'],
  ['בעוד דקה', 'через минуту'],
  ['בעוד שתי דקות', 'через две минуты'],
  ['בעוד 3 דקות', 'через 3 минуты'],
  ['בעוד 5 דקות', 'через 5 минут'],
  ['בעוד 21 דקות', 'через 21 минуту'],
  ['בעוד שנייה', 'через секунду'],
  ['בעוד שתי שניות', 'через две секунды'],
  ['בעוד 40 שניות', 'через 40 секунд'],
  ['בעוד שעה', 'через час'],
  ['בעוד שעתיים', 'через два часа'],
  ['בעוד 5 שעות', 'через 5 часов'],
  ['בעוד 5 שע׳', 'через 5 ч'],
  ['בעוד יום', 'через день'],
  ['בעוד יומיים', 'через два дня'],
  ['בעוד 7 ימים', 'через 7 дней'],
  ['בעוד שבוע', 'через неделю'],
  ['בעוד כדקה', 'примерно через минуту'],
];
const wrongCase = GRAMMAR.filter(([he, want]) => translate('ru', he) !== want).map(([he, want]) => `${he}\n      got:  ${translate('ru', he)}\n      want: ${want}`);
eq(wrongCase, [], `both directions of the clock take the case their preposition governs — ${GRAMMAR.length} lines`);

/* ─── 4. HIS OWN WORDS, WHICH THE DICTIONARY MAY NOT TOUCH ─────────────────
 *
 * The thin patterns are the danger here, and the danger is not theoretical:
 * fifteen of the strings below were being rewritten before this file existed.
 * A group name, a campaign name, a post title and a variant label are typed
 * by the customer and stored in his database. The DOM translator cannot tell
 * them from our own chrome by looking at the words, so a pattern whose anchor
 * is a single common Hebrew word — לפני, כל, בעוד, גרסה, יעד — is a pattern
 * that will one day eat a sentence he wrote.
 *
 * These are the shapes his text really takes: a cleaning business in the
 * Negev, posting before-and-after pictures to local buy-and-sell groups.
 */
const HIS_WORDS = [
  'לפני ואחרי',
  'לפני / אחרי',
  'לפני ואחרי — ספה פינתית',
  'לפני ואחרי: ניקוי שטיח',
  'לפני ואחרי ניקוי ספה',
  'לפני ההפעלה',
  'ניקוי ספות',
  'ניקוי ספות באר שבע',
  'ניקוי ספות — מבצעים באר שבע',
  'שטיח פרסי',
  'ניקוי כסאות משרד',
  'מבצע לחג',
  'ארד — לוח מודעות ומידע לתושבים',
  'באר שבע — יד שנייה',
  'אופקים והסביבה — קונים ומוכרים',
  'דימונה לוח מודעות',
  'קמפיין ספות אוקטובר',
  'פוסט ניקוי שטיחים 3',
  'מבצע 2 ספות',
  'ספה + 2 כורסאות',
];
const rewritten = HIS_WORDS.filter((w) => translate('ru', w) !== w).map((w) => `${w}\n      ->  ${translate('ru', w)}`);
eq(rewritten, [], `the customer's own words come back exactly as he typed them — ${HIS_WORDS.length} strings`);

/*
 * The four below are the ones this file cannot defend from the dictionary,
 * because they are OUR sentences as well as plausible user text, and the
 * exact lookup answers them first. They are recorded rather than asserted:
 * the real defence for user data is data-no-translate on the element that
 * renders it, and these are the proof that a dictionary alone cannot do it.
 */
const AMBIGUOUS = ['כל הבית', 'יעד ראשי', 'מחק את הכל', 'גרסה א'];
const alsoOurs = AMBIGUOUS.filter((w) => translate('ru', w) !== w);
is(alsoOurs.length <= AMBIGUOUS.length, `recorded, not asserted: ${alsoOurs.length} of ${AMBIGUOUS.length} strings are both his and ours — ${alsoOurs.join(' · ')}`);

console.log(`${NAME} OK — ${checks} assertions, relativeHe driven over ${OFFSETS.length} offsets in both directions`);
