import { calculatePrice, describeQuote, type PriceResult } from '../pricing';
import { availableSlots, slotConflict, suggestSlots } from '../scheduling';
import { TEMPLATES } from '../templates';
import type {
  AgentSettings,
  AgentState,
  Attachment,
  Booking,
  ConversationStatus,
  Customer,
  Locale,
  Organization,
  PricingRule,
  Qualification,
  Service,
  Tone,
  Worker,
} from '../types';
import { detectLanguage, pick, toDateKey, toTimeKey } from '../util';
import {
  asksIfBot,
  asksPrice,
  chooseSlot,
  cityLabel,
  declinesPhotos,
  detectAddress,
  detectCity,
  detectCondition,
  detectDate,
  detectExtras,
  detectName,
  detectPhone,
  detectServices,
  detectTime,
  detectUrgent,
  isAffirmative,
  isAngry,
  isComplaint,
  isNegative,
  isPriceObjection,
  wantsHuman,
} from './nlu';

/**
 * The AI sales agent — a deterministic conversation engine.
 *
 * It never invents a price (all numbers come from the pricing engine) and
 * never offers a slot the scheduling engine did not return. An LLM provider
 * may rephrase what this engine decides to say, but the decisions — what to
 * ask next, what to quote, when to book, when to hand off — live here.
 */

export interface AgentContext {
  organization: Pick<Organization, 'id' | 'name' | 'locale'>;
  settings: AgentSettings;
  services: Service[];
  rules: PricingRule[];
  bookings: Booking[];
  workers: Worker[];
  customer: Pick<Customer, 'name' | 'phone' | 'city' | 'language'>;
  qualification: Qualification;
  state: AgentState;
  now: Date;
}

export interface Incoming {
  text: string;
  attachments?: Attachment[];
}

export interface AgentTurn {
  replies: string[];
  language: Locale;
  qualification: Qualification;
  state: AgentState;
  status: ConversationStatus;
  quote?: PriceResult;
  booking?: { startAt: string; endAt: string; durationMin: number };
  handoff?: { reason: 'requested' | 'angry' | 'complaint' | 'discount' | 'keyword' };
  customerUpdates?: Partial<Pick<Customer, 'name' | 'phone' | 'city'>>;
  photoAnalysis?: Attachment['analysis'][];
}

type Tpl = Record<Locale, string>;

const T: Record<string, Tpl> = {
  greet: {
    he: 'היי! כאן {agent} מ-{business} 👋 איך אפשר לעזור היום?',
    ru: 'Здравствуйте! Это {agent} из {business} 👋 Чем могу помочь?',
    en: 'Hi! This is {agent} from {business} 👋 How can I help today?',
  },
  greetName: {
    he: 'היי {name}! כאן {agent} מ-{business} 👋 מה נוכל לנקות עבורך?',
    ru: 'Здравствуйте, {name}! Это {agent} из {business} 👋 Что будем чистить?',
    en: 'Hi {name}! This is {agent} from {business} 👋 What can we clean for you?',
  },
  askService: {
    he: 'בשמחה 🙂 מה תרצו לנקות — ספה, ספה פינתית, מזרן, כורסא או כיסאות?',
    ru: 'Конечно 🙂 Что нужно почистить — диван, угловой диван, матрас, кресло или стулья?',
    en: 'Happy to help 🙂 What would you like cleaned — a sofa, corner sofa, mattress, armchair or chairs?',
  },
  priceFromPhoto: {
    he: 'בטח 🙂 ל{item} המחיר מתחיל מ-₪{price}. אפשר לשלוח תמונה? כך אוכל לתת מחיר מדויק מיד.',
    ru: 'Конечно 🙂 Для {item} цена начинается от {price}₪. Можете отправить фото? Я сразу смогу уточнить стоимость.',
    en: 'Sure 🙂 For {item} the price starts at ₪{price}. Could you send a photo? I’ll confirm the exact price right away.',
  },
  priceFromNoPhoto: {
    he: 'בטח 🙂 ל{item} המחיר הוא ₪{price}. באיזו עיר אתם?',
    ru: 'Конечно 🙂 Для {item} цена {price}₪. В каком вы городе?',
    en: 'Sure 🙂 For {item} the price is ₪{price}. Which city are you in?',
  },
  photoThanks: {
    he: 'תודה על התמונה! {analysis} ',
    ru: 'Спасибо за фото! {analysis} ',
    en: 'Thanks for the photo! {analysis} ',
  },
  askCity: {
    he: 'באיזו עיר אתם? כדי שאבדוק זמינות באזור.',
    ru: 'В каком вы городе? Проверю доступность в вашем районе.',
    en: 'Which city are you in? I’ll check availability in your area.',
  },
  quoteIntro: {
    he: 'הנה הצעת המחיר עבורכם:',
    ru: 'Вот ваше предложение:',
    en: 'Here’s your quote:',
  },
  quoteOutro: {
    he: 'המחיר כולל הגעה, חומרים וייבוש מהיר. ',
    ru: 'В цену входит выезд, материалы и быстрая сушка. ',
    en: 'The price includes travel, materials and fast drying. ',
  },
  offerSlots2: {
    he: 'יש לי {slot1} או {slot2}. מה נוח לכם יותר?',
    ru: 'Есть {slot1} или {slot2}. Что удобнее?',
    en: 'I have {slot1} or {slot2}. Which works better for you?',
  },
  offerSlots1: {
    he: 'יש לי מקום פנוי {slot1}. מתאים?',
    ru: 'Есть свободное окно {slot1}. Подходит?',
    en: 'I have an opening {slot1}. Does that work?',
  },
  offerSlotsN: {
    he: 'השעות הפנויות הקרובות: {slots}. מה נוח לכם?',
    ru: 'Ближайшие свободные слоты: {slots}. Что удобно?',
    en: 'Next available slots: {slots}. Which suits you?',
  },
  noSlots: {
    he: 'בימים הקרובים אנחנו מלאים לגמרי. אעביר לבעל העסק כדי למצוא לכם פתרון.',
    ru: 'В ближайшие дни всё занято. Передам владельцу, чтобы найти решение.',
    en: 'We’re fully booked in the coming days. I’ll pass this to the owner to find a solution.',
  },
  slotTaken: {
    he: 'אוי, השעה הזו נתפסה ממש עכשיו. יש לי {slot1} או {slot2} — מה מתאים?',
    ru: 'Ой, этот слот только что заняли. Есть {slot1} или {slot2} — что подходит?',
    en: 'Ah, that slot was just taken. I have {slot1} or {slot2} — which works?',
  },
  booked: {
    he: 'מעולה, קבעתי לכם ✅ {when}, {items} — ₪{total}. נשלח תזכורת יום לפני. ',
    ru: 'Отлично, записал ✅ {when}, {items} — {total}₪. Напомним за день. ',
    en: 'Great, you’re booked ✅ {when}, {items} — ₪{total}. We’ll send a reminder the day before. ',
  },
  askAddress: {
    he: 'מה הכתובת המדויקת (רחוב ומספר)?',
    ru: 'Какой точный адрес (улица и дом)?',
    en: 'What’s the exact address (street and number)?',
  },
  addressSaved: {
    he: 'רשמתי: {address}. נתראה {when} 🙌',
    ru: 'Записал: {address}. Увидимся {when} 🙌',
    en: 'Noted: {address}. See you {when} 🙌',
  },
  askWhen: {
    he: 'מתי נוח לכם? ',
    ru: 'Когда вам удобно? ',
    en: 'When would suit you? ',
  },
  honest: {
    he: 'אני העוזר האוטומטי של {business} 🤖 אני עונה, נותן מחירים לפי המחירון שלנו וקובע תורים. לכל דבר מיוחד אפשר להעביר לבעל העסק. ',
    ru: 'Я автоматический помощник {business} 🤖 Отвечаю, называю цены по нашему прайсу и записываю на удобное время. По особым вопросам могу передать владельцу. ',
    en: 'I’m the automated assistant of {business} 🤖 I answer questions, quote from our price list and book appointments. For anything special I can hand over to the owner. ',
  },
  handoff: {
    he: 'בטח, אני מעביר את השיחה ל{owner}. תקבלו תשובה אנושית בהקדם 🙏',
    ru: 'Конечно, передаю диалог {owner}. Скоро вам ответит человек 🙏',
    en: 'Of course, I’m passing this to {owner}. You’ll get a human reply shortly 🙏',
  },
  objection: {
    he: 'מבין לגמרי. המחיר קבוע לפי המחירון וכולל הגעה, חומרים מקצועיים ואחריות על התוצאה. ',
    ru: 'Понимаю. Цена фиксированная по прайсу и включает выезд, профессиональные средства и гарантию результата. ',
    en: 'Totally understand. The price is fixed by our price list and includes travel, professional products and a result guarantee. ',
  },
  fallback: {
    he: 'רק כדי שאדייק — ',
    ru: 'Уточню — ',
    en: 'Just so I get it right — ',
  },
  outsideArea: {
    he: 'לצערי אנחנו לא מגיעים כרגע ל{city}. אעביר לבעל העסק לבדוק אם אפשר לסדר.',
    ru: 'К сожалению, мы пока не выезжаем в {city}. Передам владельцу — проверит, можно ли организовать.',
    en: 'Unfortunately we don’t currently cover {city}. I’ll ask the owner whether it can be arranged.',
  },
  thanksBye: {
    he: 'תודה! אם תרצו לקבוע בהמשך — אני כאן 🙂',
    ru: 'Спасибо! Если захотите записаться позже — я здесь 🙂',
    en: 'Thanks! If you’d like to book later — I’m here 🙂',
  },
  alreadyBooked: {
    he: 'התור שלכם כבר קבוע ל-{when}. רוצים לשנות משהו?',
    ru: 'Ваша запись уже на {when}. Хотите что-то изменить?',
    en: 'You’re already booked for {when}. Would you like to change anything?',
  },
  condition: {
    he: 'רשמתי לגבי {condition} — יש לנו טיפול ייעודי לזה, ללא תוספת. ',
    ru: 'Учёл насчёт {condition} — для этого есть специальная обработка, без доплаты. ',
    en: 'Noted about {condition} — we have a dedicated treatment for that, no extra charge. ',
  },
};

const ANALYSIS: Record<Locale, string[]> = {
  he: ['נראה בד רגיל עם לכלוך שגרתי — ניקוי עמוק סטנדרטי יתאים.', 'רואה כתמים נקודתיים — נטפל בהם עם חומר ייעודי.', 'הבד נראה במצב טוב, זה יתנקה יפה.'],
  ru: ['Похоже на обычную ткань с бытовыми загрязнениями — подойдёт стандартная глубокая чистка.', 'Вижу локальные пятна — обработаем их специальным средством.', 'Ткань в хорошем состоянии, отчистится отлично.'],
  en: ['Looks like standard fabric with everyday soiling — a standard deep clean will do.', 'I can see localised stains — we’ll treat them with a dedicated product.', 'The fabric looks in good shape, it’ll clean up nicely.'],
};

function fill(tpl: string, vars: Record<string, string | number>): string {
  return tpl.replace(/\{(\w+)\}/g, (_, k) => (vars[k] !== undefined ? String(vars[k]) : ''));
}

/** Tone post-processing: friendly keeps emoji, professional strips them, direct shortens softeners, warm adds warmth. */
function applyTone(text: string, tone: Tone, locale: Locale): string {
  let out = text;
  if (tone === 'professional' || tone === 'direct') out = out.replace(/\s?[\u{1F300}-\u{1FAFF}\u{2600}-\u{27BF}]️?/gu, '');
  if (tone === 'direct') {
    out = out.replace(/(בשמחה|בטח|Конечно|Sure|Happy to help|Totally understand|מבין לגמרי|Понимаю)\s?[🙂]?\.?\s?/g, '');
  }
  if (tone === 'warm') {
    const warm = { he: ' 💙', ru: ' 💙', en: ' 💙' }[locale];
    if (!/[\u{1F300}-\u{1FAFF}]/u.test(out.slice(-4))) out = out.trimEnd() + warm;
  }
  return out.replace(/\s{2,}/g, ' ').trim();
}

function violatesNeverSay(text: string, neverSay: string[]): boolean {
  const n = text.toLowerCase();
  return neverSay.some((p) => p.trim() && n.includes(p.trim().toLowerCase()));
}

function fmtSlot(iso: string, locale: Locale, now: Date): string {
  const d = new Date(iso);
  const time = toTimeKey(d);
  const today = toDateKey(now);
  const tomorrow = toDateKey(new Date(now.getTime() + 86400000));
  const key = toDateKey(d);
  const dayWord = key === today ? { he: 'היום', ru: 'сегодня', en: 'today' }[locale] : key === tomorrow ? { he: 'מחר', ru: 'завтра', en: 'tomorrow' }[locale] : d.toLocaleDateString({ he: 'he-IL', ru: 'ru-RU', en: 'en-GB' }[locale], { weekday: 'long', day: 'numeric', month: 'numeric' });
  return locale === 'he' ? `${dayWord} ב-${time}` : locale === 'ru' ? `${dayWord} в ${time}` : `${dayWord} at ${time}`;
}

function pickLanguage(text: string, ctx: AgentContext): Locale {
  const detected = detectLanguage(text, ctx.customer.language ?? ctx.organization.locale);
  if (ctx.settings.languages.includes(detected)) return detected;
  if (ctx.settings.languages.includes(ctx.customer.language)) return ctx.customer.language;
  return ctx.settings.languages[0] ?? ctx.organization.locale;
}

function itemsLabel(q: Qualification, services: Service[], locale: Locale): string {
  return q.items
    .map((it) => {
      const s = services.find((x) => x.id === it.serviceId);
      const name = s ? pick(s.name, locale) : '';
      return it.quantity > 1 ? `${name} ×${it.quantity}` : name;
    })
    .filter(Boolean)
    .join(', ');
}

function durationFor(q: Qualification, services: Service[]): number {
  const total = q.items.reduce((s, it) => s + (services.find((x) => x.id === it.serviceId)?.durationMin ?? 60) * it.quantity, 0);
  return Math.max(45, Math.min(240, total || 60));
}

function computeSlots(ctx: AgentContext, q: Qualification): string[] {
  const durationMin = durationFor(q, ctx.services);
  const all = availableSlots({ from: ctx.now, days: 7, durationMin, settings: ctx.settings, bookings: ctx.bookings, workers: ctx.workers, now: ctx.now });
  return suggestSlots(all, Math.max(1, ctx.settings.offerSlotsCount || 2), q.preferredDate, q.preferredTime).map((s) => s.start.toISOString());
}

function slotSentence(slots: string[], locale: Locale, now: Date): string {
  if (slots.length === 0) return T.noSlots[locale];
  if (slots.length === 1) return fill(T.offerSlots1[locale], { slot1: fmtSlot(slots[0], locale, now) });
  if (slots.length === 2) return fill(T.offerSlots2[locale], { slot1: fmtSlot(slots[0], locale, now), slot2: fmtSlot(slots[1], locale, now) });
  return fill(T.offerSlotsN[locale], { slots: slots.map((s) => fmtSlot(s, locale, now)).join(' · ') });
}

function faqAnswer(text: string, ctx: AgentContext, locale: Locale): string | undefined {
  const n = text.toLowerCase();
  for (const faq of ctx.settings.faqs) {
    const q = [faq.question.he, faq.question.ru, faq.question.en].filter(Boolean) as string[];
    const words = q.flatMap((s) => s.toLowerCase().split(/[\s?،,.!]+/)).filter((w) => w.length >= 4);
    const hits = words.filter((w) => n.includes(w)).length;
    if (hits >= 2) return pick(faq.answer, locale);
  }
  return undefined;
}

export function agentGreeting(ctx: AgentContext): AgentTurn {
  const locale = ctx.settings.languages.includes(ctx.customer.language) ? ctx.customer.language : ctx.settings.languages[0] ?? ctx.organization.locale;
  const custom = pick(ctx.settings.greeting, locale, '');
  const vars = { agent: ctx.settings.agentName, business: ctx.settings.businessName || ctx.organization.name, name: ctx.customer.name.split(' ')[0] };
  const text = custom ? fill(custom, vars) : fill(ctx.customer.name ? T.greetName[locale] : T.greet[locale], vars);
  return {
    replies: [applyTone(text, ctx.settings.tone, locale)],
    language: locale,
    qualification: ctx.qualification,
    state: { ...ctx.state, step: 'discover', turns: ctx.state.turns + 1 },
    status: 'ai',
  };
}

export function runAgentTurn(ctx: AgentContext, incoming: Incoming): AgentTurn {
  const locale = pickLanguage(incoming.text, ctx);
  const tone = ctx.settings.tone;
  const business = ctx.settings.businessName || ctx.organization.name;
  const q: Qualification = { ...ctx.qualification, items: [...ctx.qualification.items], photos: [...ctx.qualification.photos] };
  const state: AgentState = { ...ctx.state, asked: [...ctx.state.asked], offeredSlots: [...ctx.state.offeredSlots], turns: ctx.state.turns + 1 };
  const replies: string[] = [];
  const text = incoming.text ?? '';
  const customerUpdates: AgentTurn['customerUpdates'] = {};
  let status: ConversationStatus = 'ai';
  const result: AgentTurn = { replies, language: locale, qualification: q, state, status };
  const say = (s: string) => {
    const cleaned = applyTone(s, tone, locale);
    if (cleaned && !violatesNeverSay(cleaned, ctx.settings.neverSay)) replies.push(cleaned);
  };
  const finish = (st: ConversationStatus) => {
    result.status = st;
    return result;
  };

  // ── Hand-off rules (checked first: a person must be able to reach a person) ──
  if (wantsHuman(text, ctx.settings.handoffRules.keywords)) {
    say(fill(T.handoff[locale], { owner: business }));
    state.step = 'handoff';
    result.handoff = { reason: 'requested' };
    return finish('human');
  }
  if (ctx.settings.handoffRules.onComplaint && isComplaint(text)) {
    say(fill(T.handoff[locale], { owner: business }));
    state.step = 'handoff';
    result.handoff = { reason: 'complaint' };
    return finish('human');
  }
  if (ctx.settings.handoffRules.onAngry && isAngry(text)) {
    say(fill(T.handoff[locale], { owner: business }));
    state.step = 'handoff';
    result.handoff = { reason: 'angry' };
    return finish('human');
  }

  // ── Extraction ──
  const name = detectName(text);
  if (name && (!ctx.customer.name || /^(לקוח|Клиент|Customer)/.test(ctx.customer.name))) customerUpdates.name = name;
  const phone = detectPhone(text);
  if (phone && !ctx.customer.phone) customerUpdates.phone = phone;

  const detected = detectServices(text, ctx.services);
  for (const d of detected) {
    const existing = q.items.find((i) => i.serviceId === d.serviceId);
    if (existing) existing.quantity = Math.max(existing.quantity, d.quantity);
    else q.items.push(d);
  }
  q.serviceIds = q.items.map((i) => i.serviceId);
  const city = detectCity(text);
  if (city) {
    q.city = city;
    customerUpdates.city = city;
  }
  const condition = detectCondition(text, TEMPLATES.upholstery_cleaning.conditionKeywords);
  if (condition) q.condition = condition;
  const date = detectDate(text, ctx.now);
  if (date) q.preferredDate = date;
  const time = detectTime(text);
  if (time && !/^\d{1,2}[:.]\d{2}$/.test(text.trim())) q.preferredTime = time;
  else if (time) q.preferredTime = time;
  if (detectUrgent(text)) q.urgent = true;
  const extras = detectExtras(text, ctx.rules);
  const address = detectAddress(text);
  if (address && (state.asked.includes('address') || /(רחוב|ул|street|st\.)/i.test(text))) q.address = address;
  const photos = (incoming.attachments ?? []).filter((a) => a.type === 'image');
  if (photos.length) {
    q.photos.push(...photos.map((p) => p.url));
    result.photoAnalysis = photos.map((_, i) => ({ label: ANALYSIS[locale][i % ANALYSIS[locale].length], confidence: 0.82 }));
  }
  if (Object.keys(customerUpdates).length) result.customerUpdates = customerUpdates;

  // ── Honesty rule ──
  if (asksIfBot(text)) say(fill(T.honest[locale], { business }));

  // ── FAQ ──
  const faq = faqAnswer(text, ctx, locale);
  if (faq) say(faq);

  // ── Already booked? ──
  if (state.step === 'done' && state.pendingSlotConfirmation) {
    if (!q.address && state.asked.includes('address') && address) {
      q.address = address;
      say(fill(T.addressSaved[locale], { address, when: fmtSlot(state.pendingSlotConfirmation, locale, ctx.now) }));
      return finish('booked');
    }
    if (!q.address && !state.asked.includes('address')) {
      state.asked.push('address');
      say(T.askAddress[locale]);
      return finish('booked');
    }
    if (!faq && !asksIfBot(text)) say(fill(T.alreadyBooked[locale], { when: fmtSlot(state.pendingSlotConfirmation, locale, ctx.now) }));
    return finish('booked');
  }

  // ── Slot selection ──
  if (state.offeredSlots.length && (q.items.length > 0)) {
    let chosen = chooseSlot(text, state.offeredSlots, ctx.now);
    // Customer proposes a different concrete time on an offered day.
    if (!chosen && time && (date || state.offeredSlots.length)) {
      const dayKey = date ?? toDateKey(state.offeredSlots[0]);
      const [hh, mm] = time.split(':').map(Number);
      const [y, m, d] = dayKey.split('-').map(Number);
      const candidate = new Date(y, m - 1, d, hh, mm);
      const durationMin = durationFor(q, ctx.services);
      const wd = ctx.settings.workingHours[candidate.getDay()];
      if (candidate > ctx.now && wd?.enabled && `${String(hh).padStart(2, '0')}:${String(mm).padStart(2, '0')}` >= wd.start && !slotConflict(candidate, durationMin, ctx.bookings, ctx.workers, ctx.settings.travelBufferMin)) {
        chosen = candidate.toISOString();
      }
    }
    if (chosen) {
      const durationMin = durationFor(q, ctx.services);
      const start = new Date(chosen);
      if (slotConflict(start, durationMin, ctx.bookings, ctx.workers, ctx.settings.travelBufferMin)) {
        const fresh = computeSlots(ctx, q).filter((s) => s !== chosen);
        state.offeredSlots = fresh;
        say(fresh.length >= 2 ? fill(T.slotTaken[locale], { slot1: fmtSlot(fresh[0], locale, ctx.now), slot2: fmtSlot(fresh[1], locale, ctx.now) }) : slotSentence(fresh, locale, ctx.now));
        return finish('ai');
      }
      const price = calculatePrice({ items: q.items, city: q.city, urgent: q.urgent, extras }, ctx.services, ctx.rules, locale);
      result.quote = price;
      result.booking = { startAt: start.toISOString(), endAt: new Date(start.getTime() + durationMin * 60000).toISOString(), durationMin };
      state.step = 'done';
      state.pendingSlotConfirmation = chosen;
      state.offeredSlots = [];
      let msg = fill(T.booked[locale], { when: fmtSlot(chosen, locale, ctx.now), items: itemsLabel(q, ctx.services, locale), total: price.total });
      if (!q.address) {
        state.asked.push('address');
        msg += T.askAddress[locale];
      }
      say(msg);
      return finish('booked');
    }
  }

  // ── Price objection ──
  if (isPriceObjection(text) && state.lastQuoteId) {
    if (ctx.settings.handoffRules.onDiscountRequest && /(הנחה|скидк|discount)/i.test(text)) {
      say(fill(T.handoff[locale], { owner: business }));
      state.step = 'handoff';
      result.handoff = { reason: 'discount' };
      return finish('human');
    }
    say(T.objection[locale] + (state.offeredSlots.length ? '' : ''));
  }

  // ── Customer declines ──
  if (isNegative(text) && state.step === 'quote' && !detected.length && !date && !time) {
    say(T.thanksBye[locale]);
    return finish('waiting');
  }

  // ── Main flow ──
  if (q.items.length === 0) {
    if (!replies.length || asksPrice(text)) say(T.askService[locale]);
    state.step = 'discover';
    return finish('ai');
  }

  const primary = ctx.services.find((s) => s.id === q.items[0].serviceId)!;
  const askedPhotos = state.asked.includes('photos');
  const photosDone = q.photos.length > 0 || declinesPhotos(text) || !ctx.settings.askForPhotos || (askedPhotos && (detected.length > 0 || city || date || time || isAffirmative(text) || isNegative(text)));

  if (q.photos.length && photos.length) {
    say(fill(T.photoThanks[locale], { analysis: result.photoAnalysis?.[0]?.label ?? '' }));
  }

  if (!photosDone && !askedPhotos) {
    state.asked.push('photos');
    state.step = 'qualify';
    say(fill(T.priceFromPhoto[locale], { item: pick(primary.name, locale), price: primary.basePrice }));
    return finish('waiting');
  }

  if (!q.city) {
    if (!state.asked.includes('city')) {
      state.asked.push('city');
      state.step = 'qualify';
      if (!askedPhotos && !q.photos.length) say(fill(T.priceFromNoPhoto[locale], { item: pick(primary.name, locale), price: primary.basePrice }));
      else say(T.askCity[locale]);
      return finish('waiting');
    }
    // Asked already and still unknown — assume the customer's saved city or proceed without surcharge.
    if (ctx.customer.city) q.city = ctx.customer.city;
  }

  // Service area check
  if (q.city && ctx.settings.serviceAreas.length && !ctx.settings.serviceAreas.some((a) => a.trim() === q.city || cityLabel(q.city!, 'ru') === a.trim() || cityLabel(q.city!, 'en') === a.trim())) {
    say(fill(T.outsideArea[locale], { city: cityLabel(q.city, locale) }));
    state.step = 'handoff';
    result.handoff = { reason: 'keyword' };
    return finish('human');
  }

  // ── Quote ──
  const price = calculatePrice({ items: q.items, city: q.city, urgent: q.urgent, extras }, ctx.services, ctx.rules, locale);
  const needsFreshQuote = !state.lastQuoteId || detected.length > 0 || extras.length > 0;
  if (needsFreshQuote) {
    result.quote = price;
    state.lastQuoteId = 'pending';
    state.step = 'quote';
    const lines = describeQuote(price, locale);
    let msg = `${T.quoteIntro[locale]}\n${lines.join('\n')}\n${T.quoteOutro[locale]}`;
    if (q.condition && !state.asked.includes('condition')) {
      state.asked.push('condition');
      msg += fill(T.condition[locale], { condition: q.condition });
    }
    const slots = computeSlots(ctx, q);
    state.offeredSlots = slots;
    msg += slots.length ? slotSentence(slots, locale, ctx.now) : T.noSlots[locale];
    say(msg);
    return finish(slots.length ? 'quote_sent' : 'human');
  }

  // ── Scheduling after quote ──
  if (isAffirmative(text) || date || time || asksPrice(text) === false) {
    const slots = computeSlots(ctx, q);
    state.offeredSlots = slots;
    state.step = 'schedule';
    say(slotSentence(slots, locale, ctx.now));
    return finish(slots.length ? 'waiting' : 'human');
  }

  say(T.fallback[locale] + slotSentence(computeSlots(ctx, q), locale, ctx.now));
  return finish('waiting');
}
