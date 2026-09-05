import type { I18nText, PlanKey } from './types';

export interface Plan {
  key: PlanKey;
  name: string;
  price: number; // ₪ / month
  tagline: I18nText;
  limits: { leadsPerMonth: number | null; workers: number | null; languages: number; automations: number | null; analytics: 'basic' | 'full'; followUps: boolean; api: boolean };
  features: I18nText[];
  popular?: boolean;
}

export const PLANS: Plan[] = [
  {
    key: 'starter',
    name: 'Starter',
    price: 199,
    tagline: { he: 'לעסק אחד שרוצה להפסיק לפספס לידים', ru: 'Для одного бизнеса, который устал терять лиды', en: 'For a solo business that stops missing leads' },
    limits: { leadsPerMonth: 100, workers: 1, languages: 1, automations: 3, analytics: 'basic', followUps: false, api: false },
    features: [
      { he: 'עד 100 לידים בחודש', ru: 'До 100 лидов в месяц', en: 'Up to 100 leads / month' },
      { he: 'סוכן AI בשפה אחת', ru: 'AI-агент на одном языке', en: 'AI agent in one language' },
      { he: 'מחירון חכם ויומן', ru: 'Умный прайс и календарь', en: 'Smart pricing & calendar' },
      { he: '3 אוטומציות', ru: '3 автоматизации', en: '3 automations' },
    ],
  },
  {
    key: 'pro',
    name: 'Pro',
    price: 399,
    popular: true,
    tagline: { he: 'לעסק שרוצה לסגור יותר בלי להעסיק מוקדנית', ru: 'Для бизнеса, который хочет закрывать больше без оператора', en: 'For a business that closes more without hiring a receptionist' },
    limits: { leadsPerMonth: 500, workers: 5, languages: 3, automations: null, analytics: 'full', followUps: true, api: false },
    features: [
      { he: 'עד 500 לידים בחודש', ru: 'До 500 лидов в месяц', en: 'Up to 500 leads / month' },
      { he: 'עברית, רוסית ואנגלית', ru: 'Иврит, русский и английский', en: 'Hebrew, Russian & English' },
      { he: 'מעקב אוטומטי אחרי הצעות מחיר', ru: 'Автоматический фоллоу-ап', en: 'Automatic quote follow-ups' },
      { he: 'עד 5 עובדים והסתרת מחירים', ru: 'До 5 сотрудников, скрытие цен', en: 'Up to 5 workers, hidden prices' },
      { he: 'אנליטיקה מלאה', ru: 'Полная аналитика', en: 'Full analytics' },
    ],
  },
  {
    key: 'business',
    name: 'Business',
    price: 699,
    tagline: { he: 'לעסקים עם צוות, כמה ערים והרבה פרסום', ru: 'Для команд, нескольких городов и большой рекламы', en: 'For teams, multiple cities and heavy advertising' },
    limits: { leadsPerMonth: null, workers: null, languages: 3, automations: null, analytics: 'full', followUps: true, api: true },
    features: [
      { he: 'לידים ללא הגבלה', ru: 'Безлимит лидов', en: 'Unlimited leads' },
      { he: 'עובדים ללא הגבלה', ru: 'Безлимит сотрудников', en: 'Unlimited workers' },
      { he: 'חישוב ROAS לפי מקור פרסום', ru: 'ROAS по источникам рекламы', en: 'ROAS per ad source' },
      { he: 'API ו-Webhooks', ru: 'API и вебхуки', en: 'API & webhooks' },
      { he: 'תמיכה בעדיפות', ru: 'Приоритетная поддержка', en: 'Priority support' },
    ],
  },
];

export const planByKey = (key: PlanKey): Plan => PLANS.find((p) => p.key === key) ?? PLANS[1];
