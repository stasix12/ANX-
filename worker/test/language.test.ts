import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { RUSSIAN_CATEGORY, isRussianName, needsRussianCategory, russianNamed } from '../../src/lib/social/language';

/**
 * "תוסיף קטגוריה של קבוצות דוברי רוסית ותמיין לי אותם (כל מה שרשום בכותרת
 * קבוצה ברוסית שים שם)."
 *
 * WHAT CAN GO WRONG HERE IS NOT THE DETECTION. It is the write. The button
 * files a hundred and more groups in one press, and the owner has been
 * categorising this list by hand; a rule that is slightly too eager does not
 * show up as a wrong chip, it shows up as somebody else's filing replaced. So
 * most of what follows is about the two guards rather than about Cyrillic:
 * a group that already carries a category is never touched, and pressing the
 * button twice does nothing the second time.
 *
 * The names below are his own, off the screen he sent.
 *
 *   npx tsx worker/test/language.test.ts
 */

let checks = 0;
const is = (cond: unknown, msg: string) => {
  checks += 1;
  assert.ok(cond, msg);
};
const eq = (a: unknown, b: unknown, msg: string) => {
  checks += 1;
  assert.deepEqual(a, b, msg);
};

/* ------------------------------------------------------------------ *
 * 1. The rule, on the names that are actually on his screen.
 * ------------------------------------------------------------------ */
{
  is(isRussianName('Арад - обо всём и по существу'), 'a Russian title is Russian');
  is(isRussianName('АРАД НАШ И РЕШАЕМ МЫ'), 'and in capitals');
  is(isRussianName('📝 Работа и услуги в Араде'), 'and behind an emoji');
  is(isRussianName('Арад | Работа | Услуги'), 'and with Latin punctuation between the words');
  is(isRussianName('Наша Беэр-Шева 24'), 'and with a number on the end');
  is(isRussianName('Арад 🇮🇱 Объявления'), 'and with a flag in the middle');

  is(!isRussianName('Food Truck Arad'), 'a Latin name is not Russian — this is the one the eye gets wrong');
  is(!isRussianName('ערד ביחד'), 'nor is a Hebrew one');
  is(!isRussianName('דירות להשכרה בבאר שבע'), 'nor a longer Hebrew one');
  is(!isRussianName(''), 'nor an empty name');
  is(!isRussianName(null), 'nor a missing one — the column is nullable and a crash here would be on the groups screen');
  is(!isRussianName(undefined), 'nor an undefined one');

  /*
   * THE ONE THAT DECIDES THE RULE. A Hebrew name typed with the keyboard in
   * the wrong layout carries a single Cyrillic look-alike — А for A, е for e.
   * One letter is not a word, and filing that group under "Russian speakers"
   * is a mistake the owner would have to undo by hand.
   */
  is(!isRussianName('Аrad ערד'), 'a single Cyrillic look-alike inside a Latin word is a typo, not a language');
  is(!isRussianName('ערד - Оfficial'), 'and so is one at the start of an otherwise Latin word');
  is(isRussianName('Арад'), 'but a real Russian word, even a short one, is');

  /* A mixed title addresses both, and the owner asked for everything with
     Russian in it. */
  is(isRussianName('Беэр-Шева — באר שבע והסביבה'), 'a name in two languages is still a name in Russian');

  /* Ukrainian is Cyrillic and is a Russian-speaking group for this purpose.
     The \\u0400-\\u04FF range people write by hand would still catch these two,
     but not every letter in the script — the property escape is why. */
  is(isRussianName('Арад — наші'), 'Ukrainian letters are Cyrillic too');
}

/* ------------------------------------------------------------------ *
 * 2. Which groups the button writes to — and which it must not.
 * ------------------------------------------------------------------ */
{
  const list = [
    { id: '1', name: 'Арад - обо всём', category: '' },
    { id: '2', name: 'АРАД НАШ', category: undefined },
    { id: '3', name: 'ערד ביחד', category: '' },
    { id: '4', name: 'Food Truck Arad', category: '' },
    /* Already his: a Russian name he has filed somewhere else on purpose. */
    { id: '5', name: 'Работа в Араде', category: 'לוחות מכירה' },
    /* A category that is only spaces is not a category. */
    { id: '6', name: 'Арад Объявления', category: '   ' },
  ];

  eq(russianNamed(list).map((g) => g.id), ['1', '2', '5', '6'], 'every Russian-named group is counted, filed or not');
  eq(
    needsRussianCategory(list).map((g) => g.id),
    ['1', '2', '6'],
    'BUT ONLY THE UNFILED ONES ARE WRITTEN TO — "לוחות מכירה" on a Russian group is his decision and this is a convenience',
  );

  /*
   * PRESSING IT TWICE. The second press has to find nothing: a button that
   * keeps reporting "6 קבוצות סווגו" every time it is tapped is a button
   * nobody can tell has worked.
   */
  const after = list.map((g) => (needsRussianCategory(list).some((n) => n.id === g.id) ? { ...g, category: RUSSIAN_CATEGORY } : g));
  eq(needsRussianCategory(after), [], 'and after one press there is nothing left to file');
  eq(russianNamed(after).length, 4, 'while the count of Russian-named groups has not moved — they were filed, not changed');

  eq(needsRussianCategory([]), [], 'an empty list is not an error');
}

/* ------------------------------------------------------------------ *
 * 3. The screen writes what it counted, and only that.
 * ------------------------------------------------------------------ */
{
  const page = readFileSync(new URL('../../src/app/social/groups/page.tsx', import.meta.url), 'utf8');

  is(/needsRussianCategory\(all\)/.test(page), 'the button is sized by the same function that decides what it writes');
  /*
   * THE COUNT IN THE LABEL AND THE IDS IN THE WRITE ARE ONE LIST. The defect
   * this repo has the most tests for is a number that promises one set and a
   * press that delivers another — here it would mean a card saying "3" and a
   * write touching a hundred and twelve.
   */
  is(
    /bulkUpdateTargets\(russianToFile\.map\(\(g\) => g\.id\), \{ category: RUSSIAN_CATEGORY \}\)/.test(page),
    'and it writes exactly the groups it counted, into the one category name',
  );
  is(!/category: 'דוברי רוסית'/.test(page), 'the category name is the constant, not a second copy of the string on the screen');
  is(/russianToFile\.length > 0/.test(page), 'and the card is only on screen while there is something to file');
}

console.log(`language tests OK — ${checks} assertions`);
