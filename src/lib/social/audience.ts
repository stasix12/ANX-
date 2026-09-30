import { KNOWN_CITIES, OTHER_AREAS, detectCity } from './cities';
import type { LimitsSettings, SocialTarget } from './types';

/**
 * WHICH GROUPS ARE WORTH PUBLISHING TO — "תעשה שיהיה אפשר לפרסם רק לקבוצות
 * שיש בהם לקוחות פוטנציאליים, שלא אשלח לקבוצות שאין שם לקוחות שלי".
 *
 * WHY IT IS A MARK AND NOT A CLEVER FILTER. Nobody can read a Facebook group
 * and know whether the owner's customers are in it. What this product can do is
 * carry the owner's own judgement — one mark per group — and then keep it: the
 * queue, the planner, the picker and the settings switch all read the SAME
 * decision from the same function below, so a group he marked as pointless
 * cannot be reached by some path that forgot to ask.
 *
 * THREE STATES, AND THE THIRD IS NOT A SYNONYM FOR EITHER. "Marked as having
 * customers", "marked as having none", and "nobody has said yet" are three
 * different facts. A product that treats the third as "no" silently stops
 * publishing to a list somebody spent a year building; one that treats it as
 * "yes" makes the whole feature a decoration. So it stays its own state, it is
 * counted out loud on the screen wherever it matters, and the gate below names
 * it separately from a refusal.
 *
 * AND THE SUGGESTION IS A SUGGESTION. suggestAudience() reads the group's name
 * and its city and says what it would guess AND WHY, in the owner's words. It
 * is offered on screen with the reason attached and applied only when he taps.
 * Nothing in this file ever writes a mark by itself — a machine deciding which
 * of somebody's hundred groups are worth their business is precisely the guess
 * this product does not make.
 */

export type Audience = 'unknown' | 'customers' | 'none';

/** The three marks, in the owner's own words. */
export const AUDIENCE_LABEL: Record<Audience, string> = {
  customers: 'יש לקוחות פוטנציאליים',
  none: 'אין לקוחות',
  unknown: 'לא סומן',
};

/** Short enough for a chip on a group card. */
export const AUDIENCE_SHORT: Record<Audience, string> = {
  customers: 'יש לקוחות',
  none: 'אין לקוחות',
  unknown: 'לא סומן',
};

export const AUDIENCE_TONE: Record<Audience, 'good' | 'bad' | 'neutral'> = {
  customers: 'good',
  none: 'bad',
  unknown: 'neutral',
};

/**
 * The stored value, normalised.
 *
 * Anything this version does not recognise — an older row, a value typed
 * straight into the database, a column that does not exist yet because the
 * migration has not been run — reads as "nobody has said". Never as a refusal:
 * a column that is missing must not look like a hundred groups the owner
 * rejected.
 */
export function audienceOf(target: Pick<SocialTarget, 'audience'> | null | undefined): Audience {
  const value = target?.audience;
  return value === 'customers' || value === 'none' ? value : 'unknown';
}

/**
 * MAY THIS GROUP BE PUBLISHED TO? The one implementation, used by the rules
 * engine, the planner, the picker and the pre-launch review.
 *
 * Returns the reason it may NOT, in the words the owner will read in the
 * history, or null when it may. Off by default and off for anything that is
 * not a group: the switch is a promise the owner makes about his own list, so
 * until he turns it on nothing changes at all.
 */
export function audienceBlock(
  target: Pick<SocialTarget, 'name' | 'audience' | 'channel'> | null | undefined,
  limits: Pick<LimitsSettings, 'customersOnly'> | null | undefined,
): string | null {
  if (!limits?.customersOnly || !target) return null;
  /*
   * GROUPS ONLY, and that is the switch's own wording — "לפרסם רק לקבוצות עם
   * לקוחות". A target that is not a group has no such mark to make, and an
   * unmarked one must not be silently switched off by a setting that never
   * mentioned it.
   */
  if (target.channel !== 'facebook_group' && target.channel !== 'facebook_group_manual') return null;
  const mark = audienceOf(target);
  if (mark === 'customers') return null;
  const name = target.name || 'הקבוצה';
  /*
   * The two reasons are written apart on purpose. One says the owner decided
   * this group is not worth it — which is the feature working. The other says
   * nobody has decided yet, which is a group waiting for him and NOT a
   * judgement about it: told apart on the screen, they lead to two different
   * actions.
   */
  return mark === 'none'
    ? `"${name}" סומנה כקבוצה שאין בה לקוחות פוטנציאליים — דילגנו עליה.`
    : `"${name}" עוד לא סומנה כקבוצה שיש בה לקוחות פוטנציאליים. סמנו אותה במסך הקבוצות כדי שתקבל פרסומים.`;
}

/** What the suggestion thinks, and the sentence the owner reads beside it. */
export interface AudienceHint {
  verdict: Audience;
  /** Always filled, including for "unknown" — "we found nothing" is an answer too. */
  why: string;
}

/*
 * SUBJECTS THAT ARE NOT A HOUSEHOLD.
 *
 * DELIBERATELY SHORT, and every entry had to earn its place. This business
 * cleans sofas and air conditioners, so almost any group of local PEOPLE is a
 * possible customer — someone selling a car owns a sofa. Guessing "no
 * customers" from a subject is therefore the dangerous direction, and the list
 * holds only groups whose members are not being addressed as households at
 * all: boards for hiring, trades talking to trades, and subjects that gather an
 * audience from everywhere rather than from a neighbourhood.
 *
 * The label is what the owner reads in the reason, so it is a noun phrase in
 * Hebrew rather than a code.
 */
const OFF_TOPIC: [string, RegExp][] = [
  ['לוח דרושים', /דרושים|דרוש\/ה|משרות|לוח עבודה|חיפוש עבודה|\bjobs?\b|вакансии/i],
  ['בעלי מקצוע', /בעלי מקצוע|קבוצת קבלנים|פורום מקצועי|עוסקים מורשים/i],
  ['סטודנטים', /סטודנטים|אוניברסיטה|מכינה קדם|\bstudents\b/i],
  ['הכרויות', /הכרויות|שידוכים|\bdating\b|знакомства/i],
  ['מסחר בשווקים', /קריפטו|ביטקוין|מטבעות דיגיטליים|בורסה|מסחר בשוק ההון|\bforex\b|\bcrypto\b/i],
  ['גיימינג', /גיימינג|גיימרים|פורטנייט|\bgaming\b|\bfortnite\b/i],
  ['פוליטיקה', /פוליטי|מפלגת|בחירות 20/i],
  ['הומור', /בדיחות|ממים|מימים|\bmemes?\b/i],
  ['לימוד תורה', /שיעור תורה|דף יומי|הלכה יומית|לימוד גמרא/i],
];

/*
 * WORDS THAT MEAN HOUSEHOLDS. The other direction, and the useful one: these
 * are the groups where a person who owns a sofa and an air conditioner is being
 * spoken to — second-hand boards, neighbourhood pages, recommendation groups,
 * flats and moving.
 */
const HOUSEHOLD: [string, RegExp][] = [
  ['יד שנייה', /יד[\s-]?(שניה|שנייה|2)|יד2|\bsecond hand\b|барахолка/i],
  ['לוח מכירות', /לוח מכירות|מוכרים וקונים|קונים ומוכרים|מכירות|למסירה|מסירה חינם/i],
  ['קהילה מקומית', /קהילת|קהילה|תושבי|תושבות|שכונת|שכונה|שכנים|ועד בית/i],
  ['המלצות', /המלצות|ממליצים|מומלצים|ממליצות|חוות דעת/i],
  ['דירות ומעברי דירה', /דירות|נדל"?ן|להשכרה|למכירה דירה|מעבר דירה|שוכרים/i],
  ['הורים', /אמהות|אימהות|הורים|הורות|גננות/i],
];

const matchOf = (list: [string, RegExp][], text: string): string | null => {
  for (const [label, re] of list) if (re.test(text)) return label;
  return null;
};

/**
 * WHAT WE WOULD GUESS ABOUT THIS GROUP, AND WHY.
 *
 * Read from the group's NAME and the city already detected for it — the only
 * two things this product actually knows about a group it has not opened. The
 * answer is a suggestion for a person to accept or reject, which is why every
 * branch returns a sentence: a mark with no reason is a mark nobody can check,
 * and the owner is being asked to trust it with his whole group list.
 *
 * `cities` is the list of cities the owner typed into settings. When it is
 * empty this makes NO geography judgement at all — "we do not know where you
 * work" cannot become "this group is in the wrong place".
 */
export function suggestAudience(
  target: Pick<SocialTarget, 'name'> & { city?: string },
  business?: { cities?: string[] } | null,
): AudienceHint {
  const name = (target.name || '').trim();
  if (!name) return { verdict: 'unknown', why: 'לקבוצה הזאת אין עדיין שם — אין ממה לזהות.' };

  const mine = (business?.cities ?? []).map((c) => c.trim()).filter(Boolean);
  const city = target.city || detectCity(name);
  const known = city && KNOWN_CITIES.includes(city) ? city : '';
  /* A subject that is not a household beats everything else: a jobs board in
     the owner's own city is still a jobs board. */
  const offTopic = matchOf(OFF_TOPIC, name);
  if (offTopic) return { verdict: 'none', why: `נראית כמו קבוצת ${offTopic} — שם לא מדברים לבעלי בית.` };
  const elsewhere = matchOf(OTHER_AREAS, name);
  const household = matchOf(HOUSEHOLD, name);

  /*
   * A PLACE THE OWNER DOES NOT WORK IN. Only when the name says a place that is
   * not his and says none of his — a group called "ערד – תל אביב" is about
   * both, and guessing which half matters is not this function's business.
   */
  if (elsewhere && !known && !mine.some((c) => name.includes(c))) {
    return {
      verdict: 'none',
      why: `נראית כמו קבוצה של ${elsewhere}${mine.length ? ' — לא באזור שאתם עובדים בו' : ' — לא באזור שלכם'}.`,
    };
  }

  if (known) {
    /* His own list wins over ours: a Negev city he did not type is a city he
       may well not work in, and that is his call, not a suggestion's. */
    if (mine.length && !mine.includes(known)) {
      return { verdict: 'unknown', why: `קבוצה של ${known}, שלא מופיעה ברשימת הערים שלכם בהגדרות — אתם מחליטים.` };
    }
    return {
      verdict: 'customers',
      why: household ? `${known}, וקבוצת ${household} — בדיוק קהל של בעלי בית.` : `קבוצה מקומית של ${known} — האזור שאתם עובדים בו.`,
    };
  }

  /*
   * A HOUSEHOLD GROUP WITH NO PLACE IN ITS NAME is genuinely undecidable from
   * here: it could be the next street or the other end of the country. Saying
   * so is the honest answer, and it is the one case where the owner has
   * something the suggestion does not.
   */
  if (household) return { verdict: 'unknown', why: `קבוצת ${household}, אבל השם לא אומר איפה היא — אתם יודעים אם יש שם לקוחות.` };

  return { verdict: 'unknown', why: 'לא מצאנו בשם סימן מובהק לכאן או לכאן — ההחלטה שלכם.' };
}

/**
 * The suggestion for a whole list, with the groups it has nothing to say about
 * left out.
 *
 * What the screen needs in order to show "this is what the button will do"
 * BEFORE the button is pressed — a bulk action over a hundred groups that
 * cannot be previewed is a bulk action nobody should press.
 */
export function suggestForAll(
  targets: (Pick<SocialTarget, 'id' | 'name' | 'audience'> & { city?: string })[],
  business?: { cities?: string[] } | null,
): { id: string; name: string; verdict: 'customers' | 'none'; why: string }[] {
  const out: { id: string; name: string; verdict: 'customers' | 'none'; why: string }[] = [];
  for (const t of targets) {
    const hint = suggestAudience(t, business);
    if (hint.verdict === 'unknown') continue;
    /* A mark the owner already made is never overwritten by a guess, not even
       a guess that agrees with it — the list he is shown must be only the
       groups this actually changes. */
    if (audienceOf(t) !== 'unknown') continue;
    out.push({ id: t.id, name: t.name, verdict: hint.verdict, why: hint.why });
  }
  return out;
}
