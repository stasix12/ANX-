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

/**
 * ─── WHICH LANGUAGE A CATALOG GROUP IS WRITTEN IN ──────────────────────────
 *
 * "לכל קבוצה יישמרו... שפה" — the national catalog files every group under a
 * language so a campaign can ask for "Russian-speaking groups in Be'er Sheva"
 * without anybody having read the groups one by one.
 *
 * READ OFF THE NAME, AND THE SAME TWO-LETTER RULE AS ABOVE. One Cyrillic
 * character in a Hebrew name is a keyboard slip, not a language; the same is
 * true of one Arabic character. So a run of two is the whole rule here too,
 * and isRussianName() IS the Russian branch rather than a second copy of it.
 *
 * THE ORDER IS NOT ALPHABETICAL AND IT MATTERS. A name like "Беэр-Шева — באר
 * שבע" carries both scripts, and the catalog has one language column: the
 * minority language is the useful answer, because it is what tells a campaign
 * this group is worth a Russian post. Hebrew is the country's default and is
 * decided last.
 *
 * RETURNS '' RATHER THAN GUESSING. A group named "Arad Community" is Latin
 * script and this product has no English category; an empty language means
 * "not known", shows no chip, and leaves the row out of a language filter
 * instead of filing it under a language nobody verified.
 *
 * ⚠ THE SEEDING SQL (supabase/social-schema-v48.sql) MUST AGREE WITH THIS.
 * It fills the column once, from the rows that already exist, with the same
 * three ranges and the same two-character rule — and
 * worker/test/catalog.test.ts runs both over the same names and fails if they
 * ever disagree.
 */
export type CatalogLanguage = 'ru' | 'ar' | 'he' | '';

export function catalogLanguage(name: string | null | undefined): CatalogLanguage {
  const text = name ?? '';
  if (isRussianName(text)) return 'ru';
  if (/\p{Script=Arabic}{2}/u.test(text)) return 'ar';
  if (/\p{Script=Hebrew}{2}/u.test(text)) return 'he';
  return '';
}

/**
 * The catalog's languages in the words a person uses for them.
 *
 * HERE RATHER THAN IN THE COMPONENT, because two screens draw them now — the
 * "מאגר ארצי" tab and the admin panel's breakdown — and two copies of a label
 * map is how one screen ends up saying "ru".
 */
export const CATALOG_LANGUAGE_LABEL: Record<string, string> = {
  ru: 'רוסית',
  he: 'עברית',
  ar: 'ערבית',
};
