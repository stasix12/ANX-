import type { Automation, Industry, PricingRule, Service } from './types';
import { uid } from './util';

/**
 * Industry templates. The first vertical (upholstery & mattress cleaning) is
 * complete; other industries ship as stubs so the architecture is proven and
 * a template is a data change, not a code change.
 */

type ServiceSeed = Omit<Service, 'id' | 'organizationId' | 'active' | 'sortOrder'>;
type RuleSeed = (services: Service[]) => Omit<PricingRule, 'id' | 'organizationId'>[];

export interface IndustryTemplate {
  industry: Industry;
  available: boolean;
  services: ServiceSeed[];
  rules: RuleSeed;
  /** Words describing the item's condition the agent should recognise. */
  conditionKeywords: { he: string[]; ru: string[]; en: string[] };
}

const upholstery: IndustryTemplate = {
  industry: 'upholstery_cleaning',
  available: true,
  services: [
    { name: { he: 'ספה 3 מושבים', ru: 'Диван 3-местный', en: '3-seat sofa' }, basePrice: 299, unit: 'item', durationMin: 60, category: 'sofa', keywords: { he: 'ספה תלת, ספה 3, ספה שלושה, ספה רגילה, ספה', ru: 'диван, трехместный, трёхместный, софа, 3-местный', en: 'sofa, couch, 3-seat, three seat' } },
    { name: { he: 'ספה פינתית', ru: 'Угловой диван', en: 'Corner sofa' }, basePrice: 350, unit: 'item', durationMin: 90, category: 'sofa', keywords: { he: 'פינתית, ספה פינתית, פינה', ru: 'угловой, угловой диван, уголок', en: 'corner sofa, sectional, l-shaped' } },
    { name: { he: 'מזרן', ru: 'Матрас', en: 'Mattress' }, basePrice: 279, unit: 'item', durationMin: 45, category: 'mattress', keywords: { he: 'מזרן, מזרון, מיטה', ru: 'матрас, матрац, кровать', en: 'mattress, bed' } },
    { name: { he: 'כורסא', ru: 'Кресло', en: 'Armchair' }, basePrice: 120, unit: 'item', durationMin: 25, category: 'sofa', keywords: { he: 'כורסא, כורסה', ru: 'кресло', en: 'armchair, recliner' } },
    { name: { he: 'כיסא אוכל', ru: 'Стул', en: 'Dining chair' }, basePrice: 50, unit: 'item', durationMin: 10, category: 'chair', keywords: { he: 'כיסא, כיסאות, כסא, כסאות', ru: 'стул, стулья, стульев', en: 'chair, chairs, dining chair' } },
    { name: { he: 'שטיח (למ״ר)', ru: 'Ковёр (за м²)', en: 'Rug (per m²)' }, basePrice: 45, unit: 'sqm', durationMin: 10, category: 'rug', keywords: { he: 'שטיח, שטיחים', ru: 'ковер, ковёр, ковры, палас', en: 'rug, carpet' } },
    { name: { he: 'מושבי רכב', ru: 'Салон автомобиля', en: 'Car seats' }, basePrice: 350, unit: 'item', durationMin: 90, category: 'car', keywords: { he: 'רכב, אוטו, מושבי רכב', ru: 'машина, авто, салон, автомобиль', en: 'car, car seats, vehicle' } },
  ],
  rules: (services) => {
    const byCat = (cat: string, i = 0) => services.filter((s) => s.category === cat)[i]?.id ?? '';
    const corner = services.find((s) => s.name.en === 'Corner sofa')?.id ?? '';
    const mattress = byCat('mattress');
    const chair = byCat('chair');
    return [
      { type: 'min_order', name: { he: 'מינימום הזמנה', ru: 'Минимальный заказ', en: 'Minimum order' }, active: true, config: { minimum: 250 } },
      { type: 'package_discount', name: { he: 'הנחת חבילה: פינתית + מזרן', ru: 'Пакет: угловой + матрас', en: 'Package: corner sofa + mattress' }, active: true, config: { serviceIds: [corner, mattress], amountOff: 30 } },
      { type: 'quantity_discount', name: { he: 'הנחת כמות: 6+ כיסאות', ru: 'Скидка: 6+ стульев', en: 'Quantity: 6+ chairs' }, active: true, config: { serviceId: chair, fromQuantity: 6, percentOff: 15 } },
      { type: 'quantity_discount', name: { he: 'הנחת כמות: 2+ מזרנים', ru: 'Скидка: 2+ матраса', en: 'Quantity: 2+ mattresses' }, active: true, config: { serviceId: mattress, fromQuantity: 2, percentOff: 10 } },
      { type: 'location_surcharge', name: { he: 'תוספת מרחק (חיפה, באר שבע)', ru: 'Надбавка за расстояние (Хайфа, Беэр-Шева)', en: 'Distance surcharge (Haifa, Beer Sheva)' }, active: true, config: { cities: ['חיפה', 'באר שבע', 'Хайфа', 'Беэр-Шева', 'Haifa', 'Beer Sheva'], amount: 60 } },
      { type: 'urgent_surcharge', name: { he: 'תוספת דחיפות (אותו יום)', ru: 'Срочность (в тот же день)', en: 'Same-day urgency' }, active: true, config: { percent: 15 } },
      { type: 'extra', name: { he: 'טיפול נגד קרדית', ru: 'Обработка от клещей', en: 'Anti-mite treatment' }, active: true, config: { amount: 80, keywords: { he: 'קרדית, אלרגיה', ru: 'клещ, клещи, аллергия', en: 'mite, mites, allergy' } } },
      { type: 'extra', name: { he: 'הגנת בד (Scotchgard)', ru: 'Защита ткани (Scotchgard)', en: 'Fabric protection (Scotchgard)' }, active: true, config: { amount: 90, keywords: { he: 'הגנה, סקוצ׳גארד', ru: 'защита, скотчгард', en: 'protection, scotchgard' } } },
    ];
  },
  conditionKeywords: {
    he: ['כתם', 'כתמים', 'ריח', 'כלב', 'חתול', 'שתן', 'קפה', 'יין', 'ילדים', 'עובש'],
    ru: ['пятно', 'пятна', 'запах', 'собака', 'кот', 'кошка', 'моча', 'кофе', 'вино', 'дети', 'плесень'],
    en: ['stain', 'stains', 'smell', 'odor', 'dog', 'cat', 'urine', 'coffee', 'wine', 'kids', 'mold'],
  },
};

const stub = (industry: Industry): IndustryTemplate => ({
  industry,
  available: false,
  services: [],
  rules: () => [{ type: 'min_order', name: { he: 'מינימום הזמנה', ru: 'Минимальный заказ', en: 'Minimum order' }, active: true, config: { minimum: 200 } }],
  conditionKeywords: { he: [], ru: [], en: [] },
});

export const TEMPLATES: Record<Industry, IndustryTemplate> = {
  upholstery_cleaning: upholstery,
  ac_technician: stub('ac_technician'),
  plumbing: stub('plumbing'),
  locksmith: stub('locksmith'),
  pest_control: stub('pest_control'),
  electrician: stub('electrician'),
};

export function instantiateTemplate(industry: Industry, organizationId: string): { services: Service[]; rules: PricingRule[] } {
  const tpl = TEMPLATES[industry];
  const services: Service[] = tpl.services.map((s, i) => ({ ...s, id: uid('svc'), organizationId, active: true, sortOrder: i }));
  const rules: PricingRule[] = tpl.rules(services).map((r) => ({ ...r, id: uid('rule'), organizationId }));
  return { services, rules };
}

/** Default automation set. Delay in minutes; negative = before the event. */
export function defaultAutomations(organizationId: string): Automation[] {
  const mk = (key: string, trigger: Automation['trigger'], delayMinutes: number, name: Automation['name'], message: Automation['message'], audience: Automation['audience'] = 'customer', enabled = true): Automation => ({
    id: uid('auto'),
    organizationId,
    key,
    trigger,
    name,
    enabled,
    delayMinutes,
    message,
    language: 'auto',
    audience,
  });
  return [
    mk('lead_ai_reply', 'lead_created', 0, { he: 'ליד חדש → ה-AI עונה', ru: 'Новый лид → AI отвечает', en: 'New lead → AI responds' }, { he: 'הסוכן פותח שיחה תוך שניות', ru: 'Агент начинает диалог за секунды', en: 'The agent opens the conversation within seconds' }),
    mk('booking_confirmation', 'booking_created', 0, { he: 'הזמנה נוצרה → אישור', ru: 'Запись создана → подтверждение', en: 'Booking created → confirmation' }, { he: 'היי {name}, התור שלכם נקבע ל-{date} בשעה {time}. נתראה! 🧽', ru: 'Здравствуйте, {name}! Ваша запись: {date} в {time}. До встречи! 🧽', en: 'Hi {name}, your appointment is set for {date} at {time}. See you! 🧽' }),
    mk('reminder_24h', 'before_appointment', -24 * 60, { he: '24 שעות לפני → תזכורת', ru: 'За 24 часа → напоминание', en: '24 hours before → reminder' }, { he: 'תזכורת: מחר בשעה {time} אנחנו אצלכם ב-{address}. אם צריך לשנות — פשוט כתבו לנו.', ru: 'Напоминание: завтра в {time} мы у вас по адресу {address}. Нужно перенести — просто напишите.', en: 'Reminder: tomorrow at {time} we’ll be at {address}. Need to change it? Just reply.' }),
    mk('worker_assigned', 'worker_assigned', 0, { he: 'עובד הוקצה → הודעה לעובד', ru: 'Назначен сотрудник → уведомление', en: 'Worker assigned → notify worker' }, { he: 'עבודה חדשה: {service} אצל {name}, {address}, {date} {time}.', ru: 'Новая работа: {service} у {name}, {address}, {date} {time}.', en: 'New job: {service} for {name}, {address}, {date} {time}.' }, 'worker'),
    mk('on_the_way', 'worker_on_the_way', 0, { he: 'עובד בדרך → הודעה ללקוח', ru: 'Сотрудник в пути → клиенту', en: 'Worker on the way → notify customer' }, { he: '{worker} בדרך אליכם ויגיע בעוד כ-{eta} דקות 🚐', ru: '{worker} уже едет к вам, будет примерно через {eta} минут 🚐', en: '{worker} is on the way, arriving in about {eta} minutes 🚐' }),
    mk('thank_you', 'job_completed', 0, { he: 'עבודה הושלמה → תודה', ru: 'Работа завершена → спасибо', en: 'Job completed → thank-you' }, { he: 'תודה שבחרתם בנו, {name}! הריפוד יתייבש תוך 4–6 שעות. אם משהו לא מושלם — אנחנו כאן.', ru: 'Спасибо, что выбрали нас, {name}! Мебель высохнет за 4–6 часов. Если что-то не так — мы на связи.', en: 'Thanks for choosing us, {name}! Upholstery dries in 4–6 hours. If anything isn’t perfect, we’re here.' }),
    mk('review_request', 'after_completion_review', 120, { he: '2 שעות אחרי → בקשת ביקורת בגוגל', ru: 'Через 2 часа → отзыв в Google', en: '2 hours after → Google review request' }, { he: 'היה לכם טוב? ביקורת קצרה בגוגל עוזרת לנו מאוד 🙏 {review_link}', ru: 'Понравилось? Короткий отзыв в Google очень нам поможет 🙏 {review_link}', en: 'Happy with the result? A short Google review helps us a lot 🙏 {review_link}' }),
    mk('followup_30d', 'after_completion_followup', 30 * 24 * 60, { he: '30 יום אחרי → מעקב', ru: 'Через 30 дней → фоллоу-ап', en: '30 days later → follow-up' }, { he: 'היי {name}, איך הריפוד מחזיק? אם יש כתם חדש — טיפול נקודתי ב-20% הנחה ללקוחות חוזרים.', ru: 'Здравствуйте, {name}! Как держится чистота? Если появилось новое пятно — локальная чистка со скидкой 20%.', en: 'Hi {name}, how’s the upholstery holding up? New stain? Spot treatment at 20% off for returning customers.' }),
    mk('reactivation_6m', 'reactivation', 180 * 24 * 60, { he: '6 חודשים אחרי → הצעת חזרה', ru: 'Через 6 месяцев → реактивация', en: '6 months later → reactivation offer' }, { he: 'עברה חצי שנה מהניקוי האחרון — הזמן המומלץ לרענון. 15% הנחה השבוע ללקוחות חוזרים 🧼', ru: 'Прошло полгода с последней чистки — время обновить. 15% скидка на этой неделе 🧼', en: 'It’s been six months since your last clean — the recommended refresh time. 15% off this week 🧼' }),
    mk('quote_followup_1', 'quote_no_reply', 30, { he: 'מעקב 1 — 30 דקות', ru: 'Фоллоу-ап 1 — 30 минут', en: 'Follow-up 1 — 30 minutes' }, { he: 'רק בודק שההצעה הגיעה 🙂 יש שאלה שאוכל לעזור בה?', ru: 'Просто проверяю, что предложение дошло 🙂 Есть вопросы?', en: 'Just checking the quote reached you 🙂 Any question I can help with?' }),
    mk('quote_followup_2', 'quote_no_reply', 24 * 60, { he: 'מעקב 2 — 24 שעות', ru: 'Фоллоу-ап 2 — 24 часа', en: 'Follow-up 2 — 24 hours' }, { he: 'היי {name}, נשארו לנו כמה שעות פנויות השבוע. לשמור לכם אחת?', ru: 'Здравствуйте, {name}! На этой неделе ещё есть свободные слоты. Оставить один для вас?', en: 'Hi {name}, we still have a few open slots this week. Want me to hold one for you?' }),
    mk('quote_followup_3', 'quote_no_reply', 3 * 24 * 60, { he: 'מעקב 3 — 3 ימים', ru: 'Фоллоу-ап 3 — 3 дня', en: 'Follow-up 3 — 3 days' }, { he: 'ההצעה שלכם ({total}) תקפה עד סוף השבוע. אם זה לא הזמן הנכון — אין בעיה, נשמח לעזור בעתיד 🙏', ru: 'Ваше предложение ({total}) действует до конца недели. Если сейчас не время — ничего страшного, будем рады помочь позже 🙏', en: 'Your quote ({total}) is valid until the end of the week. If now isn’t the right time, no worries — happy to help later 🙏' }),
  ];
}
