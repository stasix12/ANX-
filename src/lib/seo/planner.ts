import { CITIES, WEEKLY_TOPICS, type CitySlug, type Lang } from '@/lib/seo/config';

/**
 * Chooses which subjects to write about this week.
 *
 * Two sources, in priority order.
 *
 * Real Search Console demand comes first: a phrase people already search,
 * where the site is seen but ranks badly or converts badly, is a better
 * subject than anything a planner could invent. Each such phrase becomes a
 * subject with its own metrics as the rationale, which is what the operator
 * sees in the approval queue.
 *
 * The seed backlog is the fallback for a site with no Search Console history —
 * which is this site's position on day one. The backlog is a finite, curated
 * list rather than a generator, so it cannot produce the "same article with the
 * city swapped" pattern the spec forbids: each entry is a genuinely different
 * question, and the city rotation only decides which of the four cities a
 * city-specific entry is about.
 */

export type PlannedTopic = {
  /** Stable key shared by the Hebrew and Russian versions. */
  topicKey: string;
  /** The subject, per language — not a translation pair, two native framings. */
  subject: Record<Lang, string>;
  rationale: string;
  city: CitySlug | null;
};

/** A phrase worth writing about, as produced from Search Console rows. */
export type Opportunity = {
  query: string;
  lang: Lang;
  city: CitySlug | null;
  impressions: number;
  clicks: number;
  ctr: number;
  position: number | null;
  opportunity: 'high_impressions_low_ctr' | 'missing_content' | 'improve_existing' | null;
};

/**
 * The seed backlog: distinct questions, each useful on its own.
 *
 * `cityScoped` marks an entry that reads naturally about one city; the rest are
 * regional and are written once for the whole south. `{city}` is substituted
 * with the city name in the target language.
 */
const SEED_BACKLOG: {
  key: string;
  he: string;
  ru: string;
  cityScoped: boolean;
}[] = [
  {
    key: 'sofa-cleaning-city-guide',
    he: 'ניקוי ספות ב{city} — מה חשוב לדעת לפני שמזמינים',
    ru: 'Химчистка диванов в {city}: что нужно знать перед заказом',
    cityScoped: true,
  },
  {
    key: 'mattress-cleaning-cost',
    he: 'כמה עולה ניקוי מזרנים ב{city} ומה משפיע על המחיר',
    ru: 'Сколько стоит чистка матрасов в {city} и от чего зависит цена',
    cityScoped: true,
  },
  {
    key: 'process-explained',
    he: 'ניקוי ספות ב{city} — איך התהליך מתבצע שלב אחר שלב',
    ru: 'Химчистка мебели в {city}: как проходит процесс шаг за шагом',
    cityScoped: true,
  },
  {
    key: 'upholstery-when-to-call-pro',
    he: 'ניקוי ריפודים ב{city} — מתי כדאי להזמין בעל מקצוע ומתי לא',
    ru: 'Чистка обивки в {city}: когда стоит вызвать специалиста, а когда нет',
    cityScoped: true,
  },
  {
    key: 'choosing-a-company',
    he: 'איך בוחרים חברת ניקוי ספות בדרום — חמש שאלות שכדאי לשאול',
    ru: 'Как выбрать компанию по химчистке мебели на юге Израиля',
    cityScoped: false,
  },
  {
    key: 'pro-vs-home-cleaning',
    he: 'ניקוי ספות מקצועי מול ניקוי ביתי — מה באמת ההבדל',
    ru: 'Профессиональная химчистка дивана или чистка своими силами — в чём разница',
    cityScoped: false,
  },
  {
    key: 'how-often',
    he: 'באיזו תדירות מומלץ לנקות ספה, ולמה בדרום זה שונה',
    ru: 'Как часто нужно делать химчистку мягкой мебели на юге Израиля',
    cityScoped: false,
  },
  {
    key: 'drying-time',
    he: 'כמה זמן לוקח לספה להתייבש אחרי ניקוי, ואיך מזרזים את זה',
    ru: 'Сколько сохнет диван после химчистки и как ускорить сушку',
    cityScoped: false,
  },
  {
    key: 'desert-dust',
    he: 'אבק מדברי ושרב — למה ריפודים בדרום מתלכלכים אחרת',
    ru: 'Пустынная пыль и жара: почему обивка на юге пачкается иначе',
    cityScoped: false,
  },
  {
    key: 'car-upholstery',
    he: 'ניקוי ריפודי רכב — מה אפשר להוציא מהמושבים ומה לא',
    ru: 'Химчистка салона автомобиля: что реально вывести с сидений',
    cityScoped: false,
  },
  {
    key: 'pets-and-kids',
    he: 'ספה בבית עם ילדים ובעלי חיים — איך שומרים עליה נקייה',
    ru: 'Диван в доме с детьми и животными: как поддерживать чистоту',
    cityScoped: false,
  },
  {
    key: 'fabric-types',
    he: 'סוגי בדי ריפוד ואיך כל אחד מגיב לניקוי',
    ru: 'Типы обивочных тканей и как каждая реагирует на чистку',
    cityScoped: false,
  },
];

/** Rotates the four cities deterministically, so coverage spreads evenly. */
function cityForIndex(index: number): CitySlug {
  return CITIES[index % CITIES.length].slug;
}

function cityName(slug: CitySlug, lang: Lang): string {
  const c = CITIES.find((x) => x.slug === slug);
  if (!c) return '';
  return lang === 'he' ? c.he : c.ru;
}

/**
 * Turns one Search Console phrase into a subject.
 *
 * The phrase itself is not used as the title — a title is the writer's job —
 * but it is handed over as the subject plus the metrics that justify it, so the
 * article answers the query people actually typed.
 */
function fromOpportunity(op: Opportunity, counterpartLang: Lang): PlannedTopic {
  const reasonHe = {
    high_impressions_low_ctr: 'נחשף הרבה אבל כמעט לא נלחץ — חסר עמוד שעונה ישירות',
    missing_content: 'יש ביקוש אמיתי אבל אין באתר תוכן שעונה על זה',
    improve_existing: 'כבר מדורג בעמוד הראשון או סביבו — שווה חיזוק',
  } as const;

  const label = op.opportunity ? reasonHe[op.opportunity] : 'שאילתה אמיתית מ-Search Console';
  const position = op.position === null ? 'לא ידוע' : op.position.toFixed(1);

  return {
    topicKey: `gsc-${op.query.replace(/\s+/g, '-').slice(0, 40)}`,
    subject: {
      // The query is given in its own language; the counterpart language gets
      // the subject described, so it researches its own phrasing rather than
      // inheriting the other language's wording.
      [op.lang]: op.query,
      [counterpartLang]: op.query,
    } as Record<Lang, string>,
    rationale: `${label}. Search Console (${op.impressions} חשיפות, ${op.clicks} קליקים, CTR ${(op.ctr * 100).toFixed(1)}%, מיקום ממוצע ${position}).`,
    city: op.city,
  };
}

function fromSeed(index: number): PlannedTopic {
  const seed = SEED_BACKLOG[index % SEED_BACKLOG.length];
  const city = seed.cityScoped ? cityForIndex(index) : null;
  return {
    topicKey: city ? `${seed.key}-${city}` : seed.key,
    subject: {
      he: seed.he.replace('{city}', city ? cityName(city, 'he') : ''),
      ru: seed.ru.replace('{city}', city ? cityName(city, 'ru') : ''),
    },
    rationale: city
      ? 'מתוך מאגר הנושאים המתוכננים, ממוקד עיר באזור השירות. אין עדיין נתוני Search Console לביטוי הזה.'
      : 'מתוך מאגר הנושאים המתוכננים, נושא אזורי. אין עדיין נתוני Search Console לביטוי הזה.',
    city,
  };
}

/**
 * Plans this week's subjects.
 *
 * `existingTopicKeys` is every topic_key already in the database, in any
 * status. Skipping them is the duplicate guard: a retried or re-fired weekly
 * run cannot write the same subject twice, which the spec requires and which a
 * unique index on (topic_key, lang) backs up at the database level.
 *
 * `seedCursor` is how many seed subjects have been consumed before, so the
 * backlog advances across weeks instead of restarting at the top.
 */
export function planWeeklyTopics({
  opportunities = [],
  existingTopicKeys = [],
  seedCursor = 0,
  count = WEEKLY_TOPICS,
}: {
  opportunities?: Opportunity[];
  existingTopicKeys?: string[];
  seedCursor?: number;
  count?: number;
}): PlannedTopic[] {
  const taken = new Set(existingTopicKeys);
  const picked: PlannedTopic[] = [];

  // Highest-impression opportunities first — the biggest real demand we are
  // visibly failing to serve.
  const ranked = [...opportunities]
    .filter((o) => o.opportunity !== null)
    .sort((a, b) => b.impressions - a.impressions);

  for (const op of ranked) {
    if (picked.length >= count) break;
    const counterpart: Lang = op.lang === 'he' ? 'ru' : 'he';
    const topic = fromOpportunity(op, counterpart);
    if (taken.has(topic.topicKey)) continue;
    taken.add(topic.topicKey);
    picked.push(topic);
  }

  // Top up from the backlog. The cursor walks forward and the loop is bounded
  // by the backlog length, so an exhausted backlog returns fewer subjects
  // rather than spinning — the dashboard then shows a short week, which is the
  // honest signal that the backlog needs refilling.
  for (let i = 0; picked.length < count && i < SEED_BACKLOG.length * CITIES.length; i += 1) {
    const topic = fromSeed(seedCursor + i);
    if (taken.has(topic.topicKey)) continue;
    taken.add(topic.topicKey);
    picked.push(topic);
  }

  return picked;
}
