/**
 * WHICH GROUPS ARE WRITTEN IN RUSSIAN — "תוסיף קטגוריה של קבוצות דוברי רוסית
 * ותמיין לי אותם (כל מה שרשום בכותרת קבוצה ברוסית שים שם)".
 *
 * READ OFF THE NAME, NEVER STORED AS A LANGUAGE. A group's name is the one
 * thing about it this product actually has, and a name in Cyrillic is a group
 * addressing Russian speakers — "Арад - обо всём", "АРАД НАШ И РЕШАЕМ МЫ",
 * "Работа и услуги в Араде". There is no language column and this file does not
 * ask for one: what the owner asked for is a CATEGORY, which the product
 * already has, and this is only the rule that decides which groups go into it.
 *
 * TWO LETTERS IN A ROW, NOT ONE. A single Cyrillic character in an otherwise
 * Hebrew name is almost always a look-alike — А for A, е for e, о for o — typed
 * by somebody whose keyboard was in the wrong layout. Treating that as "this
 * group is Russian" would file a Hebrew group under the wrong heading and the
 * owner would have to undo it by hand. A real Russian word is never one letter,
 * so a run of two is the whole rule, and a mixed name like "Беэр-Шева — באר
 * שבע" is still Russian, which is right: it is addressing both.
 */

/** The category name the owner's Russian-language groups are filed under. */
export const RUSSIAN_CATEGORY = 'דוברי רוסית';

/**
 * Whether this name carries a Russian word.
 *
 * The Unicode property escape rather than a hand-written Ѐ-ӿ range:
 * the range misses the Cyrillic Supplement and the historic block, and a group
 * named in Ukrainian ("Арад — наші") is a Russian-speaking group for the
 * owner's purposes and must not fall out on a letter.
 */
export function isRussianName(name: string | null | undefined): boolean {
  return /\p{Script=Cyrillic}{2}/u.test(name ?? '');
}

/** What a group needs to be filed, in one place so the count and the write agree. */
interface Filed {
  name: string;
  category?: string;
}

/**
 * The groups this action would file, and ONLY those.
 *
 * A group that already carries a category is left alone, whatever its name is.
 * The owner's own filing is a decision; this is a convenience, and a
 * convenience that overwrites a decision is a bug. It also makes the action
 * safe to press twice — the second press finds nothing and says so.
 */
export function needsRussianCategory<T extends Filed>(groups: T[]): T[] {
  return groups.filter((g) => isRussianName(g.name) && !(g.category ?? '').trim());
}

/**
 * Every Russian-named group, filed or not — the number the owner is told, so
 * "12 כבר מסווגות" and "3 חדשות" are two different sentences rather than one
 * confusing one.
 */
export function russianNamed<T extends Filed>(groups: T[]): T[] {
  return groups.filter((g) => isRussianName(g.name));
}
