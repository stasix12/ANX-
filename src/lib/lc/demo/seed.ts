import { agentGreeting, runAgentTurn, type AgentContext } from '../agent/engine';
import { bookingVars, renderMessage } from '../automations';
import { buildQuote } from '../pricing';
import { availableSlots, pickWorker } from '../scheduling';
import type { ActivityLog, Attachment, AutomationRun, Booking, Conversation, Customer, Job, Lead, LeadSourceKey, Locale, LostReason, Message, Quote, Snapshot, Worker } from '../types';
import { emptyAgentState, emptyQualification } from '../types';
import { addDays, addMinutes, rng, toDateKey, toTimeKey, uid } from '../util';
import { createBlankWorkspace } from '../workspace';

/**
 * Demo workspace: "הפתרון המבריק" — an upholstery & mattress cleaning company
 * in Gush Dan. Every conversation is produced by running the REAL agent
 * engine against scripted customer messages, so prices, slots, bookings and
 * jobs are consistent with the pricing and scheduling engines — and the seed
 * doubles as an end-to-end test of the core flow.
 */

export const DEMO_ORG_ID = 'org_demo_sparkle';
export const DEMO_USER_ID = 'demo-owner';

const HE_NAMES = ['רונית לוי', 'דניאל כהן', 'שירה מזרחי', 'אורן פרץ', 'מיכל ברק', 'יוסי אברהם', 'נועה שפירא', 'עידו רוזן', 'תמר גולן', 'אבי דהן', 'הילה נחום', 'עומר בן דוד', 'ליאור חדד', 'מאיה אלון', 'גיא ישראלי', 'רותם סגל', 'איתי מלכה', 'ענת ביטון', 'אלון עמר', 'שני קדוש', 'יעל אוחיון', 'ניר גבאי', 'דנה זוהר', 'אסף ברוך'];
const RU_NAMES = ['Наталья Иванова', 'Дмитрий Козлов', 'Елена Соколова', 'Игорь Фридман', 'Ольга Новикова', 'Сергей Мельник', 'Анна Гуревич', 'Марина Левина', 'Виктор Шапиро', 'Юлия Абрамова', 'Алексей Кац', 'Светлана Роз', 'Михаил Берг', 'Ирина Вайс', 'Павел Гринберг', 'Татьяна Лурье', 'Роман Заславский', 'Евгения Штерн'];
const EN_NAMES = ['Sarah Klein', 'David Miller', 'Rachel Stern', 'Jonathan Weiss'];
const CITIES_W: [string, number][] = [['תל אביב', 22], ['רמת גן', 10], ['פתח תקווה', 12], ['ראשון לציון', 11], ['חולון', 9], ['בת ים', 7], ['גבעתיים', 5], ['הרצליה', 5], ['בני ברק', 4], ['נתניה', 4], ['כפר סבא', 3], ['רעננה', 3], ['חיפה', 2], ['אשדוד', 3]];
const STREETS_HE = ['הרצל', 'ויצמן', 'רוטשילד', 'ז׳בוטינסקי', 'בן גוריון', 'סוקולוב', 'ביאליק', 'הנשיא', 'אחד העם', 'ארלוזורוב', 'דיזנגוף', 'בורוכוב'];
const SOURCES_W: [LeadSourceKey, number][] = [['google', 34], ['facebook', 22], ['instagram', 10], ['whatsapp', 16], ['website', 10], ['organic', 5], ['other', 3]];
const LOST_W: [LostReason, number][] = [['no_response', 45], ['price', 25], ['competitor', 12], ['timing', 10], ['not_relevant', 5], ['other', 3]];

type Step = string | { photo: number } | { pickSlot: 0 | 1 } | { silence: true } | { recover: string };
type Scenario = { lang: Locale; steps: Step[]; outcome: 'booked' | 'lost' | 'human' | 'human_booked' | 'recovered' | 'open' };

const SCENARIOS: Scenario[] = [
  { lang: 'he', outcome: 'booked', steps: ['היי, כמה עולה לנקות ספה פינתית?', { photo: 1 }, 'אני מ{city}', { pickSlot: 0 }] },
  { lang: 'he', outcome: 'booked', steps: ['שלום, יש לי מזרן זוגי ושתי כורסאות עם כתמים של הכלב, מה המחיר?', 'אין לי תמונה כרגע', '{city}', { pickSlot: 1 }] },
  { lang: 'he', outcome: 'booked', steps: ['כמה עולה ניקוי 6 כיסאות אוכל וספה 3 מושבים?', { photo: 5 }, 'אנחנו ב{city}', 'קצת יקר לי…', { pickSlot: 0 }] },
  { lang: 'he', outcome: 'booked', steps: ['היי, זה בוט?', 'צריכה ניקוי לספה תלת ושטיח', { photo: 2 }, '{city}', { pickSlot: 1 }] },
  { lang: 'he', outcome: 'booked', steps: ['היי, כמה עולה לנקות מזרן זוגי?', { photo: 3 }, '{city}', { pickSlot: 0 }] },
  { lang: 'he', outcome: 'booked', steps: ['מחיר לניקוי ספה 3 מושבים?', 'בלי תמונה', '{city}', { pickSlot: 1 }] },
  { lang: 'he', outcome: 'lost', steps: ['מחיר לספה 3 מושבים?', { photo: 2 }, '{city}', { silence: true }] },
  { lang: 'he', outcome: 'lost', steps: ['כמה עולה מזרן?', 'בלי תמונה', '{city}', { silence: true }] },
  { lang: 'he', outcome: 'human', steps: ['שלום, ניקיתם לנו ספה בפעם הקודמת ונשאר כתם'] },
  { lang: 'he', outcome: 'human', steps: ['אני רוצה לדבר עם מנהל בבקשה'] },
  { lang: 'he', outcome: 'human_booked', steps: ['כמה עולה ספה פינתית?', { photo: 1 }, '{city}', 'יש אפשרות להנחה? אני רוצה לדבר עם מנהל'] },
  { lang: 'he', outcome: 'recovered', steps: ['ספה פינתית + מזרן, כמה?', 'בלי תמונה', '{city}', { silence: true }, { recover: 'בסדר, בואו נקבע' }, { pickSlot: 0 }] },
  { lang: 'he', outcome: 'open', steps: ['היי, כמה עולה ניקוי ספה פינתית?'] },
  { lang: 'he', outcome: 'open', steps: ['שלום, יש לכם זמן השבוע לניקוי שני מזרנים?', { photo: 3 }] },
  { lang: 'ru', outcome: 'booked', steps: ['Здравствуйте! Сколько стоит почистить угловой диван?', { photo: 1 }, '{city}', { pickSlot: 0 }] },
  { lang: 'ru', outcome: 'booked', steps: ['Добрый день, нужно почистить матрас и 2 кресла, есть пятна от кота', 'Нет фото, к сожалению', 'Мы в {city}', { pickSlot: 1 }] },
  { lang: 'ru', outcome: 'booked', steps: ['Сколько стоит чистка трехместного дивана?', { photo: 2 }, '{city}', 'Дорого… а скидка есть?', { pickSlot: 0 }] },
  { lang: 'ru', outcome: 'booked', steps: ['Это бот или человек?', 'Нужна чистка углового дивана и ковра', { photo: 6 }, '{city}', { pickSlot: 1 }] },
  { lang: 'ru', outcome: 'booked', steps: ['Здравствуйте, почистить 4 стула и диван, сколько?', { photo: 5 }, '{city}', { pickSlot: 0 }] },
  { lang: 'ru', outcome: 'booked', steps: ['Добрый день! Почистить матрас, сколько стоит?', { photo: 3 }, '{city}', { pickSlot: 0 }] },
  { lang: 'ru', outcome: 'booked', steps: ['Сколько стоит чистка кресла и двух стульев?', 'Фото нет', '{city}', { pickSlot: 1 }] },
  { lang: 'ru', outcome: 'lost', steps: ['Сколько стоит почистить матрас?', { photo: 3 }, '{city}', { silence: true }] },
  { lang: 'ru', outcome: 'lost', steps: ['Цена на угловой диван?', 'Без фото', '{city}', { silence: true }] },
  { lang: 'ru', outcome: 'human', steps: ['Хочу поговорить с менеджером'] },
  { lang: 'ru', outcome: 'human_booked', steps: ['Сколько стоит угловой диван и матрас?', { photo: 1 }, '{city}', 'А скидка будет? Хочу поговорить с менеджером'] },
  { lang: 'ru', outcome: 'recovered', steps: ['Диван и матрас, сколько будет?', 'Без фото', '{city}', { silence: true }, { recover: 'Давайте, записывайте' }, { pickSlot: 1 }] },
  { lang: 'ru', outcome: 'open', steps: ['Здравствуйте, сколько стоит почистить угловой диван?'] },
  { lang: 'en', outcome: 'booked', steps: ['Hi, how much to clean a corner sofa and a mattress?', { photo: 1 }, "I'm in {city}", { pickSlot: 0 }] },
  { lang: 'en', outcome: 'lost', steps: ['Price for a 3-seat sofa?', { photo: 2 }, '{city}', { silence: true }] },
];

const CITY_LABEL: Record<string, { ru: string; en: string }> = {
  'תל אביב': { ru: 'Тель-Авив', en: 'Tel Aviv' }, 'רמת גן': { ru: 'Рамат-Ган', en: 'Ramat Gan' }, 'פתח תקווה': { ru: 'Петах-Тиква', en: 'Petah Tikva' }, 'ראשון לציון': { ru: 'Ришон-ле-Цион', en: 'Rishon LeZion' }, 'חולון': { ru: 'Холон', en: 'Holon' }, 'בת ים': { ru: 'Бат-Ям', en: 'Bat Yam' }, 'גבעתיים': { ru: 'Гиватаим', en: 'Givatayim' }, 'הרצליה': { ru: 'Герцлия', en: 'Herzliya' }, 'בני ברק': { ru: 'Бней-Брак', en: 'Bnei Brak' }, 'נתניה': { ru: 'Нетания', en: 'Netanya' }, 'כפר סבא': { ru: 'Кфар-Саба', en: 'Kfar Saba' }, 'רעננה': { ru: 'Раанана', en: 'Raanana' }, 'חיפה': { ru: 'Хайфа', en: 'Haifa' }, 'אשדוד': { ru: 'Ашдод', en: 'Ashdod' },
};

export function buildDemoSnapshot(realNow = new Date()): Snapshot {
  const r = rng(20260905);
  const snap = createBlankWorkspace(
    { organizationId: DEMO_ORG_ID, name: 'הפתרון המבריק', industry: 'upholstery_cleaning', locale: 'he', city: 'תל אביב', phone: '050-1234567', ownerEmail: 'owner@sparkle.demo', ownerName: 'סטס לוין', ownerUserId: DEMO_USER_ID, demo: true },
    addDays(realNow, -80),
  );
  snap.organization.onboardingStep = 7;
  snap.organization.active = true;
  snap.settings.businessName = 'הפתרון המבריק';
  snap.settings.agentName = 'נועה';
  snap.settings.description = 'ניקוי ריפודים, ספות ומזרנים בגוש דן. ציוד מקצועי, חומרים בטוחים לילדים ולחיות מחמד, ייבוש מהיר.';
  snap.settings.serviceAreas = [];
  snap.settings.greeting = { he: 'היי {name}! כאן {agent} מ-{business} 👋 מה נוכל לנקות עבורך?', ru: 'Здравствуйте, {name}! Это {agent} из {business} 👋 Что будем чистить?', en: 'Hi {name}! This is {agent} from {business} 👋 What can we clean for you?' };
  snap.leadSources = snap.leadSources.map((s) => ({ ...s, adSpendMonth: s.key === 'google' ? 4200 : s.key === 'facebook' ? 2600 : s.key === 'instagram' ? 900 : 0 }));

  const workers: Worker[] = [
    { id: 'w_yossi', name: 'יוסי כהן', phone: '052-3344556', color: 'indigo', serviceAreas: [], canSeePrices: true, active: true },
    { id: 'w_alex', name: 'אלכס פטרוב', phone: '054-7788990', color: 'teal', serviceAreas: [], canSeePrices: false, active: true },
    { id: 'w_moshe', name: 'משה לוי', phone: '053-1122334', color: 'amber', serviceAreas: ['פתח תקווה', 'ראש העין', 'כפר סבא', 'הוד השרון', 'רעננה'], canSeePrices: false, active: true },
  ].map((w) => ({ ...w, organizationId: DEMO_ORG_ID, workingHours: snap.settings.workingHours, createdAt: addDays(realNow, -70).toISOString() }));
  snap.workers = workers;
  snap.members.push({ id: uid('mem'), organizationId: DEMO_ORG_ID, userId: 'demo-worker-alex', email: 'alex@sparkle.demo', fullName: 'אלכס פטרוב', role: 'worker', workerId: 'w_alex' });

  const customers: Customer[] = [];
  const leads: Lead[] = [];
  const conversations: Conversation[] = [];
  const messages: Message[] = [];
  const quotes: Quote[] = [];
  const bookings: Booking[] = [];
  const jobs: Job[] = [];
  const runs: AutomationRun[] = [];
  const logs: ActivityLog[] = [];
  const followUps = snap.automations.filter((a) => a.trigger === 'quote_no_reply');
  const confirmAuto = snap.automations.find((a) => a.key === 'booking_confirmation')!;
  const reminderAuto = snap.automations.find((a) => a.key === 'reminder_24h')!;
  const thanksAuto = snap.automations.find((a) => a.key === 'thank_you')!;
  const reviewAuto = snap.automations.find((a) => a.key === 'review_request')!;

  const phone = () => `05${r.pick(['0', '2', '3', '4', '8'])}-${r.int(1000000, 9999999)}`;
  const nameFor = (lang: Locale) => (lang === 'he' ? r.pick(HE_NAMES) : lang === 'ru' ? r.pick(RU_NAMES) : r.pick(EN_NAMES));
  const cityFor = (lang: Locale, cityHe: string) => (lang === 'he' ? cityHe : CITY_LABEL[cityHe]?.[lang] ?? cityHe);
  const photo = (n: number): Attachment => ({ type: 'image', url: `/lc/photos/item-${n}.svg` });

  const log = (actor: ActivityLog['actor'], entityType: string, entityId: string, action: string, at: Date, payload: Record<string, unknown> = {}) =>
    logs.push({ id: uid('log'), organizationId: DEMO_ORG_ID, actor, entityType, entityId, action, payload, createdAt: at.toISOString() });

  // Lead arrival times: denser in the last 30 days, working-hour heavy.
  const arrivals: Date[] = [];
  for (let day = 75; day >= 0; day--) {
    const base = addDays(realNow, -day);
    const weekday = base.getDay();
    const perDay = day <= 30 ? r.int(3, 5) : r.int(2, 4);
    const factor = weekday === 6 ? 0.3 : weekday === 5 ? 0.6 : 1;
    const count = Math.round(perDay * factor);
    for (let i = 0; i < count; i++) {
      const d = new Date(base);
      d.setHours(r.weighted([[8, 4], [9, 8], [10, 10], [11, 10], [12, 8], [13, 7], [14, 7], [15, 7], [16, 8], [17, 9], [18, 9], [19, 8], [20, 6], [21, 4], [22, 2]]), r.int(0, 59), r.int(0, 59), 0);
      if (d < realNow) arrivals.push(d);
    }
  }
  // Guarantee a lively "today": a few leads earlier today, whatever the weekday.
  if (realNow.getHours() >= 10) {
    for (const h of [5.5, 3.5, 2.2, 1.2]) {
      const d = new Date(realNow.getTime() - h * 3600000);
      if (d.getHours() >= 7) arrivals.push(d);
    }
  }
  arrivals.sort((a, b) => a.getTime() - b.getTime());

  for (const arrival of arrivals) {
    const hoursAgo = (realNow.getTime() - arrival.getTime()) / 3600000;
    const lang: Locale = r.weighted([['he', 55], ['ru', 40], ['en', 5]]);
    let pool = SCENARIOS.filter((s) => s.lang === lang);
    if (hoursAgo > 6) pool = pool.filter((s) => s.outcome !== 'open');
    else if (hoursAgo < 1.5) pool = pool.filter((s) => s.outcome === 'open' || s.outcome === 'booked');
    else if (hoursAgo < 6) pool = pool.filter((s) => s.outcome === 'booked' || s.outcome === 'human' || s.outcome === 'open');
    const OUTCOME_W: Record<Scenario['outcome'], number> = { booked: 40, lost: 36, human: 6, human_booked: 5, recovered: 6, open: 7 };
    const scenario = r.weighted<Scenario>(pool.map((s) => [s, OUTCOME_W[s.outcome] / pool.filter((x) => x.outcome === s.outcome).length]));
    const cityHe = r.weighted(CITIES_W);
    const source = r.weighted(SOURCES_W);
    const channel = source === 'website' ? 'website' : source === 'instagram' ? 'instagram' : source === 'facebook' && r.chance(0.5) ? 'facebook' : 'whatsapp';

    // Returning customer ~10% of the time.
    let customer = r.chance(0.1) ? r.pick(customers.filter((c) => c.language === lang)) : undefined;
    if (!customer) {
      customer = {
        id: uid('c'), organizationId: DEMO_ORG_ID, name: nameFor(lang), phone: phone(), language: lang, addresses: [{ street: `${r.pick(STREETS_HE)} ${r.int(2, 80)}`, city: cityHe }], city: cityHe, notes: '', tags: [], source, lifetimeValue: 0, lastContactAt: arrival.toISOString(), createdAt: arrival.toISOString(),
      };
      customers.push(customer);
    }
    customer.lastContactAt = arrival.toISOString();

    const convId = uid('conv');
    const leadId = uid('lead');
    const lead: Lead = { id: leadId, organizationId: DEMO_ORG_ID, customerId: customer.id, conversationId: convId, source, channel, status: 'new', language: lang, qualification: emptyQualification(), quoteId: null, bookingId: null, lostReason: null, aiHandled: true, value: 0, createdAt: arrival.toISOString(), updatedAt: arrival.toISOString() };
    const conv: Conversation = { id: convId, organizationId: DEMO_ORG_ID, leadId, customerId: customer.id, channel, language: lang, status: 'new', aiPaused: false, unreadCount: 0, lastMessageText: '', lastMessageAt: arrival.toISOString(), agentState: emptyAgentState(), followUpStage: 0, createdAt: arrival.toISOString() };
    log('system', 'lead', leadId, 'lead_received', arrival, { source });

    let t = new Date(arrival);
    const push = (sender: Message['sender'], text: string, attachments: Attachment[] = [], meta: Message['meta'] = {}) => {
      const m: Message = { id: uid('m'), organizationId: DEMO_ORG_ID, conversationId: convId, sender, text, attachments, meta, createdAt: t.toISOString() };
      messages.push(m);
      conv.lastMessageText = text || (attachments.length ? '📷' : '');
      conv.lastMessageAt = t.toISOString();
      return m;
    };

    const ctx = (): AgentContext => ({ organization: snap.organization, settings: snap.settings, services: snap.services, rules: snap.pricingRules, bookings, workers, customer, qualification: lead.qualification, state: conv.agentState, now: t });

    let quote: Quote | null = null;
    let lastQuoteAt: Date | null = null;
    let recovering = false;
    let terminal = false;

    // The conversation opener comes from the customer; the agent greets first only on a website form.
    if (channel === 'website') {
      const g = agentGreeting(ctx());
      conv.agentState = g.state;
      t = addMinutes(t, 0);
      push('ai', g.replies[0]);
      t = addMinutes(t, r.int(1, 4));
    }

    for (const step of scenario.steps) {
      if (terminal) break;
      if (typeof step === 'object' && 'silence' in step) {
        // Follow-up sequence after the quote.
        if (!lastQuoteAt) break;
        let stage: 0 | 1 | 2 | 3 = 0;
        for (const fu of followUps) {
          const at = addMinutes(lastQuoteAt, fu.delayMinutes);
          const sent = at < realNow && !(scenario.outcome === 'recovered' && fu.key !== 'quote_followup_1');
          const rendered = renderMessage(fu, lang, { name: customer.name.split(' ')[0], total: quote ? `₪${quote.total}` : '' });
          runs.push({ id: uid('run'), organizationId: DEMO_ORG_ID, automationId: fu.id, automationKey: fu.key, entityType: 'conversation', entityId: convId, conversationId: convId, scheduledAt: at.toISOString(), sentAt: sent ? at.toISOString() : null, status: sent ? 'sent' : scenario.outcome === 'recovered' && fu.key !== 'quote_followup_1' ? 'skipped' : 'scheduled', renderedMessage: rendered, recoveredValue: 0 });
          if (sent) {
            stage = (stage + 1) as 0 | 1 | 2 | 3;
            t = at;
            push('ai', rendered, [], { kind: 'followup', automationKey: fu.key });
          }
          if (scenario.outcome === 'recovered' && fu.key === 'quote_followup_1') break;
        }
        conv.followUpStage = stage;
        if (scenario.outcome === 'lost') {
          const lastAt = addMinutes(lastQuoteAt, followUps[followUps.length - 1].delayMinutes);
          if (lastAt < realNow) {
            lead.status = 'lost';
            lead.lostReason = r.weighted(LOST_W);
            conv.status = 'lost';
            log('system', 'lead', leadId, 'lead_lost', addMinutes(lastAt, 60), { reason: lead.lostReason });
          } else {
            conv.status = stage > 0 ? 'waiting' : 'quote_sent';
            lead.status = 'quoted';
          }
          terminal = true;
        } else {
          recovering = true;
          t = addMinutes(t, r.int(10, 90));
        }
        continue;
      }

      // Customer turn
      let text = '';
      let attachments: Attachment[] = [];
      if (typeof step === 'string') text = step.replace('{city}', cityFor(lang, cityHe));
      else if ('photo' in step) attachments = [photo(step.photo)];
      else if ('recover' in step) text = step.recover;
      else if ('pickSlot' in step) {
        const offered = conv.agentState.offeredSlots;
        if (!offered.length) break;
        const slot = offered[Math.min(step.pickSlot, offered.length - 1)];
        const time = toTimeKey(slot);
        const tomorrow = toDateKey(slot) === toDateKey(addDays(t, 1));
        text = lang === 'he' ? `${tomorrow ? 'מחר ' : ''}ב-${time} מתאים לי` : lang === 'ru' ? `${tomorrow ? 'Завтра ' : ''}в ${time} подходит` : `${tomorrow ? 'Tomorrow ' : ''}at ${time} works`;
      }
      if (t > realNow) break;
      push('customer', text, attachments);
      conv.unreadCount = 0;

      // Agent turn (seconds later)
      const turn = runAgentTurn(ctx(), { text, attachments });
      t = addMinutes(t, 0);
      t = new Date(t.getTime() + r.int(4, 25) * 1000);
      lead.qualification = turn.qualification;
      conv.agentState = turn.state;
      conv.language = turn.language;
      if (turn.customerUpdates?.city) customer.city = turn.customerUpdates.city;
      if (turn.photoAnalysis && attachments.length) attachments[0].analysis = turn.photoAnalysis[0];

      if (turn.quote && !turn.booking) {
        quote = buildQuote(turn.quote, { organizationId: DEMO_ORG_ID, leadId, conversationId: convId });
        quote.sentAt = t.toISOString();
        quote.createdAt = t.toISOString();
        quotes.push(quote);
        lead.quoteId = quote.id;
        lead.status = 'quoted';
        lead.value = quote.total;
        conv.agentState.lastQuoteId = quote.id;
        lastQuoteAt = new Date(t);
        log('ai', 'quote', quote.id, 'quote_sent', t, { total: quote.total });
      }
      for (const reply of turn.replies) push('ai', reply, [], turn.quote && !turn.booking ? { kind: 'quote', quoteId: quote?.id } : turn.booking ? { kind: 'booking' } : turn.handoff ? { kind: 'handoff' } : {});
      conv.status = turn.status;

      if (turn.handoff) {
        conv.status = 'human';
        conv.aiPaused = true;
        conv.unreadCount = hoursAgo < 48 ? 1 : 0;
        lead.aiHandled = false;
        // Owner replied manually on older conversations.
        if (hoursAgo > 3) {
          t = addMinutes(t, r.int(20, 180));
          push('owner', lang === 'he' ? 'היי, כאן סטס בעל העסק. אני אחזור אליך טלפונית תוך כמה דקות 🙏' : lang === 'ru' ? 'Здравствуйте, это Стас, владелец. Перезвоню вам в течение нескольких минут 🙏' : "Hi, it's Stas, the owner. I'll call you back in a few minutes 🙏");
          conv.unreadCount = 0;
        }
        if (scenario.outcome === 'human_booked' && quote && hoursAgo > 4) {
          // The owner closed it by phone and booked from the calendar.
          t = addMinutes(t, r.int(15, 60));
          const durationMin = Math.max(45, quote.lines.reduce((acc, l) => acc + (snap.services.find((x) => x.id === l.serviceId)?.durationMin ?? 60) * l.quantity, 0));
          const slots = availableSlots({ from: t, days: 7, durationMin, settings: snap.settings, bookings, workers, now: t });
          const slot = slots[r.int(0, Math.min(3, slots.length - 1))];
          if (slot) {
            push('owner', lang === 'he' ? `סיכמנו טלפונית — קבעתי לכם ל-${toDateKey(slot.start)} בשעה ${toTimeKey(slot.start)} 👍` : lang === 'ru' ? `Договорились по телефону — записал вас на ${toDateKey(slot.start)} в ${toTimeKey(slot.start)} 👍` : `As agreed on the phone — booked for ${toDateKey(slot.start)} at ${toTimeKey(slot.start)} 👍`);
            quote.status = 'accepted';
            const worker = pickWorker(slot.start, durationMin, cityHe, bookings, workers, snap.settings.travelBufferMin);
            const booking: Booking = { id: uid('b'), organizationId: DEMO_ORG_ID, leadId, quoteId: quote.id, customerId: customer.id, workerId: worker?.id ?? null, startAt: slot.start.toISOString(), endAt: slot.end.toISOString(), status: 'active', createdBy: 'owner', createdAt: t.toISOString() };
            bookings.push(booking);
            lead.bookingId = booking.id;
            lead.status = 'booked';
            lead.value = quote.total;
            conv.status = 'booked';
            conv.unreadCount = 0;
            const isPast = slot.start < realNow;
            const status: Job['status'] = !isPast ? 'confirmed' : 'completed';
            const job: Job = { id: uid('job'), organizationId: DEMO_ORG_ID, bookingId: booking.id, leadId, customerId: customer.id, workerId: booking.workerId, serviceSummary: quote.lines.map((l) => l.label).join(', '), serviceIds: quote.lines.map((l) => l.serviceId), address: customer.addresses[0]?.street ?? '', city: cityHe, scheduledAt: booking.startAt, durationMin, price: quote.total, paymentStatus: status === 'completed' ? 'paid' : 'unpaid', status, internalNotes: lang === 'ru' ? 'Клиент просил скидку — договорились на полную цену' : 'הלקוח ביקש הנחה — סוכם מחיר מלא', customerNotes: '', photos: messages.filter((m) => m.conversationId === convId && m.attachments.length).flatMap((m) => m.attachments), leadSource: source, completedAt: status === 'completed' ? slot.end.toISOString() : null, createdAt: t.toISOString() };
            jobs.push(job);
            if (status === 'completed') customer.lifetimeValue += job.price;
            log('owner', 'booking', booking.id, 'booking_created', t, { total: quote.total, when: booking.startAt });
          }
        }
        terminal = true;
        continue;
      }

      if (turn.booking) {
        const q2 = quote ?? buildQuote(turn.quote!, { organizationId: DEMO_ORG_ID, leadId, conversationId: convId });
        if (!quote) {
          quotes.push(q2);
          quote = q2;
        }
        quote.status = 'accepted';
        const start = new Date(turn.booking.startAt);
        const worker = pickWorker(start, turn.booking.durationMin, cityHe, bookings, workers, snap.settings.travelBufferMin);
        const booking: Booking = { id: uid('b'), organizationId: DEMO_ORG_ID, leadId, quoteId: quote.id, customerId: customer.id, workerId: worker?.id ?? null, startAt: turn.booking.startAt, endAt: turn.booking.endAt, status: 'active', createdBy: 'ai', createdAt: t.toISOString() };
        bookings.push(booking);
        lead.bookingId = booking.id;
        lead.status = 'booked';
        lead.quoteId = quote.id;
        lead.value = quote.total;
        conv.status = 'booked';
        const summary = quote.lines.map((l) => (l.quantity > 1 ? `${l.label} ×${l.quantity}` : l.label)).join(', ');
        const isPast = start < realNow;
        const status: Job['status'] = !isPast ? (start.getTime() - realNow.getTime() < 36 * 3600000 ? 'confirmed' : 'booked') : r.chance(0.94) ? 'completed' : 'cancelled';
        const job: Job = { id: uid('job'), organizationId: DEMO_ORG_ID, bookingId: booking.id, leadId, customerId: customer.id, workerId: booking.workerId, serviceSummary: summary, serviceIds: quote.lines.map((l) => l.serviceId), address: customer.addresses[0]?.street ?? '', city: cityHe, scheduledAt: booking.startAt, durationMin: turn.booking.durationMin, price: quote.total, paymentStatus: status === 'completed' ? (r.chance(0.9) ? 'paid' : 'unpaid') : status === 'cancelled' ? 'refunded' : r.chance(0.2) ? 'deposit' : 'unpaid', status, internalNotes: r.chance(0.3) ? (lang === 'ru' ? 'Есть парковка во дворе' : 'יש חניה בחצר') : '', customerNotes: lead.qualification.condition ? `${lead.qualification.condition}` : '', photos: attachments.length ? [] : [], leadSource: source, completedAt: status === 'completed' ? addMinutes(start, turn.booking.durationMin).toISOString() : null, createdAt: t.toISOString() };
        // Photos sent in this conversation belong to the job record too.
        job.photos = messages.filter((m) => m.conversationId === convId && m.attachments.length).flatMap((m) => m.attachments);
        jobs.push(job);
        if (status === 'completed') customer.lifetimeValue += job.price;
        log('ai', 'booking', booking.id, 'booking_created', t, { total: quote.total, when: booking.startAt });
        if (status === 'completed') log('worker', 'job', job.id, 'job_completed', addMinutes(start, turn.booking.durationMin), { price: job.price });
        if (recovering) {
          const run = runs.find((x) => x.conversationId === convId && x.automationKey === 'quote_followup_1');
          if (run) run.recoveredValue = quote.total;
        }
        // Automation runs around the booking.
        const vars = bookingVars(customer, booking, job, worker, quote, lang);
        const mkRun = (a: typeof confirmAuto, at: Date, entityType: AutomationRun['entityType'], entityId: string) => {
          const sent = at <= realNow && status !== 'cancelled';
          runs.push({ id: uid('run'), organizationId: DEMO_ORG_ID, automationId: a.id, automationKey: a.key, entityType, entityId, conversationId: convId, scheduledAt: at.toISOString(), sentAt: sent ? at.toISOString() : null, status: sent ? 'sent' : status === 'cancelled' ? 'skipped' : 'scheduled', renderedMessage: renderMessage(a, lang, vars), recoveredValue: 0 });
          return sent;
        };
        if (mkRun(confirmAuto, addMinutes(t, 0), 'booking', booking.id)) push('ai', renderMessage(confirmAuto, lang, vars), [], { kind: 'note', automationKey: confirmAuto.key });
        mkRun(reminderAuto, addMinutes(start, reminderAuto.delayMinutes), 'booking', booking.id);
        if (status === 'completed') {
          const done = addMinutes(start, turn.booking.durationMin);
          mkRun(thanksAuto, done, 'job', job.id);
          mkRun(reviewAuto, addMinutes(done, reviewAuto.delayMinutes), 'job', job.id);
        }
        terminal = true;
        continue;
      }

      // Pace: customer replies after a few minutes.
      t = addMinutes(t, r.int(1, 9));
    }

    if (!terminal) {
      // Open conversation — waiting for the customer or brand-new.
      if (conv.status === 'new') conv.status = messages.some((m) => m.conversationId === convId && m.sender === 'ai') ? 'ai' : 'new';
      if (hoursAgo < 6) conv.unreadCount = conv.status === 'quote_sent' || conv.status === 'waiting' ? 0 : 1;
      if (lead.status === 'new' && lead.qualification.items.length) lead.status = 'qualified';
    }
    lead.updatedAt = conv.lastMessageAt;
    leads.push(lead);
    conversations.push(conv);
  }

  // A couple of brand-new leads in the last minutes so the inbox pulses.
  for (const [lang, text, src] of [['he', 'היי, כמה עולה ניקוי ספה פינתית ומזרן?', 'google'], ['ru', 'Здравствуйте! Сколько стоит почистить диван и 4 стула?', 'facebook']] as [Locale, string, LeadSourceKey][]) {
    const at = addMinutes(realNow, -r.int(1, 4));
    const cityHe = r.weighted(CITIES_W);
    const customer: Customer = { id: uid('c'), organizationId: DEMO_ORG_ID, name: nameFor(lang), phone: phone(), language: lang, addresses: [], city: cityHe, notes: '', tags: [], source: src, lifetimeValue: 0, lastContactAt: at.toISOString(), createdAt: at.toISOString() };
    customers.push(customer);
    const convId = uid('conv');
    const leadId = uid('lead');
    const lead: Lead = { id: leadId, organizationId: DEMO_ORG_ID, customerId: customer.id, conversationId: convId, source: src, channel: 'whatsapp', status: 'new', language: lang, qualification: emptyQualification(), quoteId: null, bookingId: null, lostReason: null, aiHandled: true, value: 0, createdAt: at.toISOString(), updatedAt: at.toISOString() };
    const conv: Conversation = { id: convId, organizationId: DEMO_ORG_ID, leadId, customerId: customer.id, channel: 'whatsapp', language: lang, status: 'new', aiPaused: false, unreadCount: 1, lastMessageText: text, lastMessageAt: at.toISOString(), agentState: emptyAgentState(), followUpStage: 0, createdAt: at.toISOString() };
    messages.push({ id: uid('m'), organizationId: DEMO_ORG_ID, conversationId: convId, sender: 'customer', text, attachments: [], meta: {}, createdAt: at.toISOString() });
    leads.push(lead);
    conversations.push(conv);
    log('system', 'lead', leadId, 'lead_received', at, { source: src });
  }

  // Jobs happening right now get live statuses.
  for (const j of jobs) {
    const start = new Date(j.scheduledAt).getTime();
    const end = start + j.durationMin * 60000;
    if (j.status === 'completed' && toDateKey(j.scheduledAt) === toDateKey(realNow)) {
      if (start > realNow.getTime()) j.status = 'confirmed';
      else if (end > realNow.getTime()) j.status = 'in_progress';
    }
    if (j.status === 'confirmed' && start - realNow.getTime() < 45 * 60000 && start > realNow.getTime()) j.status = 'on_the_way';
    if (j.status === 'in_progress' || j.status === 'on_the_way') {
      j.paymentStatus = 'unpaid';
      j.completedAt = null;
    }
  }

  // Blocked time for the owner (dentist!) to show in the calendar.
  snap.settings.blockedTimes = [{ date: toDateKey(addDays(realNow, 2)), start: '12:00', end: '14:00', label: 'פגישה פרטית' }];

  snap.customers = customers;
  snap.leads = leads;
  snap.conversations = conversations;
  snap.messages = messages;
  snap.quotes = quotes;
  snap.bookings = bookings;
  snap.jobs = jobs;
  snap.automationRuns = runs;
  snap.activityLogs = logs.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 200);
  return snap;
}
