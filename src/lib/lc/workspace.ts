import { DEFAULT_WORKING_HOURS } from './scheduling';
import { defaultAutomations, instantiateTemplate } from './templates';
import type { AgentSettings, Industry, LeadSource, Locale, Member, Organization, Snapshot, Subscription } from './types';
import { LEAD_SOURCE_KEYS } from './types';
import { addDays, uid } from './util';

export function defaultSettings(organizationId: string, businessName: string, locale: Locale): AgentSettings {
  return {
    organizationId,
    businessName,
    agentName: { he: 'נועה', ru: 'Алина', en: 'Maya' }[locale],
    tone: 'friendly',
    customTone: '',
    languages: ['he', 'ru', 'en'],
    greeting: {},
    description: '',
    serviceAreas: [],
    workingHours: DEFAULT_WORKING_HOURS,
    slotMinutes: 30,
    travelBufferMin: 30,
    blockedTimes: [],
    faqs: [
      {
        question: { he: 'כמה זמן לוקח לייבוש?', ru: 'Сколько сохнет мебель после чистки?', en: 'How long does drying take?' },
        answer: { he: 'הייבוש לוקח בין 4 ל-6 שעות. אנחנו עובדים עם שאיבה חזקה כך שהריפוד יוצא לח ולא רטוב.', ru: 'Сушка занимает 4–6 часов. Мы работаем с мощным экстрактором, поэтому мебель остаётся влажной, а не мокрой.', en: 'Drying takes 4–6 hours. We use strong extraction, so the fabric comes out damp, not wet.' },
      },
      {
        question: { he: 'איזה חומרים אתם משתמשים?', ru: 'Какие средства вы используете?', en: 'What products do you use?' },
        answer: { he: 'חומרים מקצועיים על בסיס מים, בטוחים לילדים ולחיות מחמד.', ru: 'Профессиональные средства на водной основе, безопасные для детей и животных.', en: 'Professional water-based products that are safe for kids and pets.' },
      },
    ],
    neverSay: ['guaranteed 100% stain removal', 'הסרה מובטחת של כל כתם', 'гарантия удаления любого пятна'],
    handoffRules: { onAngry: true, onDiscountRequest: false, onComplaint: true, keywords: [] },
    askForPhotos: true,
    autoBook: true,
    offerSlotsCount: 2,
  };
}

export function defaultLeadSources(organizationId: string): LeadSource[] {
  return LEAD_SOURCE_KEYS.map((key) => ({ id: uid('ls'), organizationId, key, adSpendMonth: 0, enabled: true }));
}

export interface NewWorkspaceInput {
  name: string;
  industry: Industry;
  locale: Locale;
  city: string;
  phone: string;
  ownerEmail: string;
  ownerName: string;
  ownerUserId: string;
  demo?: boolean;
  organizationId?: string;
}

/** A fresh, empty workspace with the industry template applied. */
export function createBlankWorkspace(input: NewWorkspaceInput, now = new Date()): Snapshot {
  const id = input.organizationId ?? uid('org');
  const organization: Organization = {
    id,
    name: input.name,
    slug: input.name.toLowerCase().replace(/[^a-z0-9א-ת]+/gi, '-').replace(/^-|-$/g, '') || id,
    industry: input.industry,
    locale: input.locale,
    currency: 'ILS',
    timezone: 'Asia/Jerusalem',
    phone: input.phone,
    city: input.city,
    onboardingStep: 0,
    active: false,
    demo: Boolean(input.demo),
    createdAt: now.toISOString(),
  };
  const members: Member[] = [{ id: uid('mem'), organizationId: id, userId: input.ownerUserId, email: input.ownerEmail, fullName: input.ownerName, role: 'owner', workerId: null }];
  const { services, rules } = instantiateTemplate(input.industry, id);
  const subscription: Subscription = { organizationId: id, plan: 'pro', status: 'trialing', periodEnd: addDays(now, 14).toISOString(), provider: 'mock', externalId: null };
  return {
    organization,
    members,
    settings: defaultSettings(id, input.name, input.locale),
    subscription,
    customers: [],
    leads: [],
    conversations: [],
    messages: [],
    services,
    pricingRules: rules,
    quotes: [],
    bookings: [],
    jobs: [],
    workers: [],
    automations: defaultAutomations(id),
    automationRuns: [],
    leadSources: defaultLeadSources(id),
    activityLogs: [],
    integrations: [],
  };
}
