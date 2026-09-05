import type { Booking, PlatformSettings, Service } from './types';

/**
 * The service catalogue + pricing questionnaires. Adding a service here is
 * all it takes for it to appear in the customer flow, pro onboarding, SEO
 * pages and matching. Launch scope: sofas, mattresses, A/C; the rest ship as
 * "בקרוב" cards so the breadth is visible without stretching supply.
 */
export const DEFAULT_SERVICES: Service[] = [
  {
    id: 'sofa-cleaning',
    category: 'upholstery',
    name: 'ניקוי ספה',
    shortName: 'ספה',
    description: 'ניקוי עומק לספות בד ועור בשיטת שאיבה — כולל כתמים וריחות.',
    icon: '🛋️',
    basePriceAgorot: 29900,
    durationMinutes: 75,
    active: true,
    comingSoon: false,
    questions: [
      { id: 'seats', label: 'כמה מושבים?', type: 'count', min: 2, max: 10, included: 3, perUnitAgorot: 6000 },
      {
        id: 'shape',
        label: 'סוג הספה',
        type: 'choice',
        options: [
          { id: 'regular', label: 'ספה רגילה', deltaAgorot: 0 },
          { id: 'corner', label: 'ספה פינתית', deltaAgorot: 8000 },
        ],
      },
      { id: 'stains', label: 'יש כתמים קשים?', type: 'bool', deltaAgorot: 5000 },
      { id: 'odor', label: 'יש ריח לא נעים?', type: 'bool', deltaAgorot: 4000 },
      { id: 'pets', label: 'יש בעלי חיים בבית?', type: 'bool', deltaAgorot: 3000 },
    ],
  },
  {
    id: 'mattress-cleaning',
    category: 'upholstery',
    name: 'ניקוי מזרן',
    shortName: 'מזרן',
    description: 'חיטוי וניקוי עומק למזרנים — קרדית האבק, כתמים ורעננות.',
    icon: '🛏️',
    basePriceAgorot: 19900,
    durationMinutes: 45,
    active: true,
    comingSoon: false,
    questions: [
      {
        id: 'size',
        label: 'גודל המזרן',
        type: 'choice',
        options: [
          { id: 'single', label: 'יחיד', deltaAgorot: 0 },
          { id: 'double', label: 'זוגי', deltaAgorot: 6000 },
          { id: 'king', label: 'קינג', deltaAgorot: 10000 },
        ],
      },
      { id: 'count', label: 'כמה מזרנים?', type: 'count', min: 1, max: 6, included: 1, perUnitAgorot: 12000 },
      { id: 'stains', label: 'יש כתמים?', type: 'bool', deltaAgorot: 4000 },
    ],
  },
  {
    id: 'ac-cleaning',
    category: 'hvac',
    name: 'ניקוי מזגן',
    shortName: 'מזגן',
    description: 'ניקוי מסננים ומאייד, חיטוי והדברת ריחות — עילי או מיני-מרכזי.',
    icon: '❄️',
    basePriceAgorot: 24900,
    durationMinutes: 60,
    active: true,
    comingSoon: false,
    questions: [
      { id: 'units', label: 'כמה יחידות?', type: 'count', min: 1, max: 8, included: 1, perUnitAgorot: 15000 },
      {
        id: 'type',
        label: 'סוג המזגן',
        type: 'choice',
        options: [
          { id: 'wall', label: 'עילי', deltaAgorot: 0 },
          { id: 'central', label: 'מיני מרכזי', deltaAgorot: 10000 },
        ],
      },
    ],
  },
  {
    id: 'carpet-cleaning',
    category: 'upholstery',
    name: 'ניקוי שטיח',
    shortName: 'שטיח',
    description: 'ניקוי שטיחים בבית הלקוח — צמר, סינתטי ושאגי.',
    icon: '🧶',
    basePriceAgorot: 14900,
    durationMinutes: 40,
    active: true,
    comingSoon: true,
    questions: [
      { id: 'count', label: 'כמה שטיחים?', type: 'count', min: 1, max: 6, included: 1, perUnitAgorot: 9000 },
    ],
  },
  {
    id: 'car-upholstery',
    category: 'vehicle',
    name: 'ניקוי ריפודי רכב',
    shortName: 'רכב',
    description: 'ניקוי פנים הרכב — מושבים, ריפודים ותקרה.',
    icon: '🚗',
    basePriceAgorot: 24900,
    durationMinutes: 90,
    active: true,
    comingSoon: true,
    questions: [
      {
        id: 'size',
        label: 'סוג הרכב',
        type: 'choice',
        options: [
          { id: 'private', label: 'פרטי', deltaAgorot: 0 },
          { id: 'suv', label: 'ג׳יפ / SUV', deltaAgorot: 6000 },
          { id: 'van', label: 'מסחרי / 7 מקומות', deltaAgorot: 10000 },
        ],
      },
    ],
  },
  {
    id: 'chairs-cleaning',
    category: 'upholstery',
    name: 'ניקוי כיסאות',
    shortName: 'כיסאות',
    description: 'כיסאות אוכל, כיסאות משרד וכורסאות.',
    icon: '🪑',
    basePriceAgorot: 3900,
    durationMinutes: 30,
    active: true,
    comingSoon: true,
    questions: [
      { id: 'count', label: 'כמה כיסאות?', type: 'count', min: 1, max: 20, included: 1, perUnitAgorot: 3500 },
    ],
  },
  {
    id: 'curtains-cleaning',
    category: 'upholstery',
    name: 'ניקוי וילונות',
    shortName: 'וילונות',
    description: 'ניקוי וילונות בבית הלקוח ללא פירוק.',
    icon: '🪟',
    basePriceAgorot: 19900,
    durationMinutes: 60,
    active: true,
    comingSoon: true,
    questions: [],
  },
];

export interface Quote {
  lowAgorot: number;
  highAgorot: number;
  breakdown: { label: string; amountAgorot: number }[];
}

/**
 * Price a questionnaire. Returns a range (±10%) because the platform quotes
 * an estimate; the pro confirms the final price on completion.
 */
export function computeQuote(
  service: Service,
  answers: Record<string, number | boolean | string>,
  settings?: Pick<PlatformSettings, 'dynamicPricing'>,
  context?: { scheduledFor: string | null; availablePros?: number },
): Quote {
  const breakdown: Quote['breakdown'] = [
    { label: `${service.name} — מחיר בסיס`, amountAgorot: service.basePriceAgorot },
  ];
  let total = service.basePriceAgorot;

  for (const q of service.questions) {
    const answer = answers[q.id];
    if (answer === undefined) continue;
    if (q.type === 'count' && typeof answer === 'number') {
      const extra = Math.max(0, answer - (q.included ?? 1)) * (q.perUnitAgorot ?? 0);
      if (extra > 0) {
        total += extra;
        breakdown.push({ label: q.label.replace('?', ''), amountAgorot: extra });
      }
    } else if (q.type === 'bool' && answer === true && q.deltaAgorot) {
      total += q.deltaAgorot;
      breakdown.push({ label: q.label.replace('?', ''), amountAgorot: q.deltaAgorot });
    } else if (q.type === 'choice' && typeof answer === 'string') {
      const opt = q.options?.find((o) => o.id === answer);
      if (opt && opt.deltaAgorot) {
        total += opt.deltaAgorot;
        breakdown.push({ label: opt.label, amountAgorot: opt.deltaAgorot });
      }
    }
  }

  // Dynamic pricing hooks — wired but disabled by default (admin toggle).
  const dp = settings?.dynamicPricing;
  if (dp?.enabled && context) {
    let multiplier = 1;
    const when = context.scheduledFor ? new Date(context.scheduledFor) : new Date();
    const day = when.getDay();
    if (!context.scheduledFor) multiplier *= dp.rushMultiplier; // "now" = rush
    if (day === 5 || day === 6) multiplier *= dp.weekendMultiplier;
    if ((context.availablePros ?? 99) <= 1) multiplier *= dp.lowSupplyMultiplier;
    if (multiplier !== 1) {
      const surge = Math.round(total * (multiplier - 1));
      total += surge;
      breakdown.push({ label: 'תמחור דינמי', amountAgorot: surge });
    }
  }

  const round = (n: number) => Math.round(n / 100) * 100;
  return { lowAgorot: round(total * 0.95), highAgorot: round(total * 1.12), breakdown };
}

/** Human summary of a booking's questionnaire, for cards and the pro popup. */
export function answersSummary(service: Service, booking: Pick<Booking, 'answers'>): string {
  const parts: string[] = [];
  for (const q of service.questions) {
    const a = booking.answers[q.id];
    if (a === undefined) continue;
    if (q.type === 'count' && typeof a === 'number') parts.push(`${a} ${q.label.replace('כמה ', '').replace('?', '')}`);
    else if (q.type === 'bool' && a === true) parts.push(q.label.replace('יש ', '').replace('?', ''));
    else if (q.type === 'choice') {
      const opt = q.options?.find((o) => o.id === a);
      if (opt && opt.deltaAgorot !== 0) parts.push(opt.label);
    }
  }
  return parts.join(' · ');
}
