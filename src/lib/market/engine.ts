import { trackEvent } from './analytics';
import { areaForPoint, geocodeAddress } from './geo';
import { scorePros } from './matching';
import { sendNotification } from './notifications';
import { computeQuote } from './services';
import { getStore, nowIso, uid } from './store';
import type {
  Booking,
  BookingEvent,
  BookingMode,
  BookingOffer,
  BookingStatus,
  Coupon,
  Message,
  PlatformSettings,
  Professional,
  Review,
} from './types';

/**
 * The booking engine: every state change in the marketplace goes through
 * here, so the customer app, the pro app, the admin panel and the demo
 * simulation all move bookings identically — one transition table, one audit
 * trail, one money path. All functions are idempotent enough to be re-run by
 * UI timers (dispatch ticks fire from whichever tab happens to be open).
 */

export const BOOKING_TRANSITIONS: Record<BookingStatus, BookingStatus[]> = {
  draft: ['searching', 'offered', 'canceled'],
  searching: ['offered', 'no_pros_available', 'canceled'],
  offered: ['accepted', 'searching', 'no_pros_available', 'canceled'],
  no_pros_available: ['searching', 'offered', 'canceled'],
  accepted: ['en_route', 'canceled'],
  en_route: ['arrived', 'canceled'],
  arrived: ['in_progress', 'canceled'],
  in_progress: ['completed', 'canceled'],
  completed: ['paid', 'reviewed', 'canceled'],
  paid: ['reviewed'],
  reviewed: [],
  canceled: ['searching'], // customer may retry after a cancellation
};

export const STATUS_LABELS: Record<BookingStatus, string> = {
  draft: 'טיוטה',
  searching: 'מחפשים בעל מקצוע',
  offered: 'העבודה נשלחה — ממתין לאישור',
  no_pros_available: 'אין כרגע מנקה זמין',
  accepted: 'העבודה התקבלה',
  en_route: 'בעל המקצוע בדרך',
  arrived: 'הגיע ללקוח',
  in_progress: 'העבודה התחילה',
  completed: 'העבודה הסתיימה',
  paid: 'שולם',
  reviewed: 'דורג',
  canceled: 'בוטל',
};

/** The customer-visible progress rail (happy path). */
export const STATUS_RAIL: BookingStatus[] = [
  'searching',
  'accepted',
  'en_route',
  'arrived',
  'in_progress',
  'completed',
  'paid',
];

async function appendEvent(
  bookingId: string,
  status: BookingStatus,
  actor: BookingEvent['actor'],
  note = '',
): Promise<void> {
  await getStore().put('events', { id: uid(), bookingId, status, actor, note, createdAt: nowIso() });
}

export async function addMessage(
  bookingId: string,
  sender: Message['sender'],
  body: string,
  kind: Message['kind'] = 'text',
): Promise<void> {
  await getStore().put('messages', { id: uid(), bookingId, sender, kind, body, createdAt: nowIso() });
}

async function systemMessage(bookingId: string, body: string): Promise<void> {
  await addMessage(bookingId, 'system', body, 'system');
}

// ---------------------------------------------------------------------------
// Creation + dispatch
// ---------------------------------------------------------------------------

export interface CreateBookingInput {
  customerId: string;
  customerName: string;
  customerPhone: string;
  serviceId: string;
  address: string;
  answers: Record<string, number | boolean | string>;
  photos: string[];
  notes: string;
  scheduledFor: string | null;
  mode: BookingMode;
  /** Only for mode 'chosen'. */
  chosenProId?: string;
  couponCode?: string | null;
  discountAgorot?: number;
  /** Smart-recommendation upsell: a second service added at 70% of its base. */
  addonServiceId?: string | null;
}

/** The promo price an add-on service is offered at during checkout. */
export function addonPriceAgorot(basePriceAgorot: number): number {
  return Math.round((basePriceAgorot * 0.7) / 100) * 100;
}

export async function createBooking(input: CreateBookingInput): Promise<Booking> {
  const store = getStore();
  const [areas, services, settings] = await Promise.all([
    store.list('areas'),
    store.list('services'),
    store.getSettings(),
  ]);
  const service = services.find((s) => s.id === input.serviceId);
  if (!service) throw new Error(`unknown service ${input.serviceId}`);
  const { location, area } = geocodeAddress(input.address, areas);
  const resolvedArea = area ?? areaForPoint(location, areas);
  const quote = computeQuote(service, input.answers, settings, {
    scheduledFor: input.scheduledFor,
  });
  let notes = input.notes;
  if (input.addonServiceId) {
    const addon = services.find((s) => s.id === input.addonServiceId);
    if (addon) {
      const extra = addonPriceAgorot(addon.basePriceAgorot);
      quote.lowAgorot += extra;
      quote.highAgorot += extra;
      notes = `${notes ? `${notes}\n` : ''}+ תוספת בצ׳קאאוט: ${addon.name} במחיר מיוחד`;
    }
  }

  const booking: Booking = {
    id: uid(),
    customerId: input.customerId,
    customerName: input.customerName,
    customerPhone: input.customerPhone,
    professionalId: null,
    serviceId: input.serviceId,
    areaId: resolvedArea?.id ?? null,
    address: input.address,
    location,
    answers: input.answers,
    photos: input.photos,
    notes,
    scheduledFor: input.scheduledFor,
    mode: input.mode,
    quoteLowAgorot: quote.lowAgorot,
    quoteHighAgorot: quote.highAgorot,
    finalPriceAgorot: null,
    couponCode: input.couponCode ?? null,
    discountAgorot: input.discountAgorot ?? 0,
    commissionAgorot: null,
    paymentMethod: null,
    status: 'searching',
    cancelReason: null,
    offeredProIds: [],
    createdAt: nowIso(),
    updatedAt: nowIso(),
  };
  await store.put('bookings', booking);
  await appendEvent(booking.id, 'searching', 'customer', 'הזמנה נוצרה');
  trackEvent('BookingStarted', { serviceId: booking.serviceId, mode: booking.mode });

  if (input.mode === 'chosen' && input.chosenProId) {
    await offerToPro(booking, input.chosenProId, settings);
  } else if (input.mode === 'bidding') {
    await sendBidRequests(booking, settings);
  } else {
    await dispatchNext(booking.id);
  }
  return (await store.get('bookings', booking.id))!;
}

async function offerToPro(
  booking: Booking,
  proId: string,
  settings: PlatformSettings,
): Promise<void> {
  const store = getStore();
  const offer: BookingOffer = {
    id: uid(),
    bookingId: booking.id,
    professionalId: proId,
    kind: 'dispatch',
    status: 'sent',
    expiresAt: new Date(Date.now() + settings.dispatchTtlSeconds * 1000).toISOString(),
    priceAgorot: null,
    etaMinutes: null,
    message: '',
    createdAt: nowIso(),
  };
  await store.put('offers', offer);
  await store.put('bookings', {
    ...booking,
    status: 'offered',
    offeredProIds: [...booking.offeredProIds, proId],
    updatedAt: nowIso(),
  });
  await appendEvent(booking.id, 'offered', 'system', `הוצע לבעל מקצוע`);
  await sendNotification(proId, 'עבודה חדשה!', 'יש עבודה חדשה באזור שלך — היכנס לאשר', booking.id);
}

/**
 * Offer the booking to the next-best pro. Returns false when the candidate
 * pool is exhausted (→ no_pros_available with the fallback options).
 */
export async function dispatchNext(bookingId: string): Promise<boolean> {
  const store = getStore();
  const booking = await store.get('bookings', bookingId);
  if (!booking || !['searching', 'offered', 'no_pros_available'].includes(booking.status)) {
    return false;
  }
  const [pros, availability, services, settings] = await Promise.all([
    store.list('professionals'),
    store.list('availability'),
    store.list('services'),
    store.getSettings(),
  ]);
  const service = services.find((s) => s.id === booking.serviceId);
  if (!service) return false;
  if (booking.offeredProIds.length >= settings.dispatchMaxOffers) {
    await markNoPros(booking);
    return false;
  }
  const ranked = scorePros(booking, pros, availability, service.basePriceAgorot);
  const next = ranked[0];
  if (!next) {
    await markNoPros(booking);
    return false;
  }
  await offerToPro(booking, next.pro.id, settings);
  return true;
}

async function markNoPros(booking: Booking): Promise<void> {
  const store = getStore();
  await store.put('bookings', { ...booking, status: 'no_pros_available', updatedAt: nowIso() });
  await appendEvent(booking.id, 'no_pros_available', 'system', 'לא נמצא בעל מקצוע זמין');
  await sendNotification(
    booking.customerId,
    'כרגע אין מנקה זמין',
    'אפשר לקבל הצעות מחיר, לקבוע למועד אחר או לקבל התראה כשמנקה יתפנה',
    booking.id,
  );
}

/** Bid mode: the request goes to several pros at once; each answers with a price. */
async function sendBidRequests(booking: Booking, settings: PlatformSettings): Promise<void> {
  const store = getStore();
  const [pros, availability, services] = await Promise.all([
    store.list('professionals'),
    store.list('availability'),
    store.list('services'),
  ]);
  const service = services.find((s) => s.id === booking.serviceId);
  if (!service) return;
  const ranked = scorePros(booking, pros, availability, service.basePriceAgorot, {
    requireOnline: false,
  }).slice(0, settings.dispatchMaxOffers);
  if (ranked.length === 0) {
    await markNoPros(booking);
    return;
  }
  const offeredProIds: string[] = [];
  for (const candidate of ranked) {
    offeredProIds.push(candidate.pro.id);
    await store.put('offers', {
      id: uid(),
      bookingId: booking.id,
      professionalId: candidate.pro.id,
      kind: 'bid',
      status: 'sent',
      expiresAt: null,
      priceAgorot: null,
      etaMinutes: null,
      message: '',
      createdAt: nowIso(),
    });
    await sendNotification(
      candidate.pro.id,
      'בקשה להצעת מחיר',
      'לקוח מבקש הצעות מחיר לעבודה באזור שלך',
      booking.id,
    );
  }
  await store.put('bookings', { ...booking, status: 'offered', offeredProIds, updatedAt: nowIso() });
  await appendEvent(booking.id, 'offered', 'system', `בקשת הצעות נשלחה ל-${ranked.length} בעלי מקצוע`);
}

/** Customer retries after no_pros_available — again as auto, or as a bid round. */
export async function retryBooking(bookingId: string, mode: 'auto' | 'bidding'): Promise<void> {
  const store = getStore();
  const booking = await store.get('bookings', bookingId);
  if (!booking || !['no_pros_available', 'canceled'].includes(booking.status)) return;
  const settings = await store.getSettings();
  const reset: Booking = {
    ...booking,
    mode,
    status: 'searching',
    offeredProIds: [],
    updatedAt: nowIso(),
  };
  await store.put('bookings', reset);
  await appendEvent(bookingId, 'searching', 'customer', mode === 'bidding' ? 'עבר למסלול הצעות מחיר' : 'חיפוש חוזר');
  if (mode === 'bidding') await sendBidRequests(reset, settings);
  else await dispatchNext(bookingId);
}

/** A pro answers a bid request with price + ETA + message. */
export async function submitBid(
  offerId: string,
  priceAgorot: number,
  etaMinutes: number,
  message: string,
): Promise<void> {
  const store = getStore();
  const offer = await store.get('offers', offerId);
  if (!offer || offer.kind !== 'bid' || offer.status !== 'sent') return;
  await store.put('offers', { ...offer, priceAgorot, etaMinutes, message });
  const booking = await store.get('bookings', offer.bookingId);
  if (booking) {
    await sendNotification(booking.customerId, 'התקבלה הצעת מחיר', 'הצעה חדשה ממתינה לך', booking.id);
  }
}

/** Customer picks one of the bids → same as accepting a dispatch offer. */
export async function chooseBid(offerId: string): Promise<void> {
  const store = getStore();
  const offer = await store.get('offers', offerId);
  if (!offer || offer.priceAgorot === null) return;
  await acceptOffer(offerId, 'customer');
  const booking = await store.get('bookings', offer.bookingId);
  if (booking) {
    await store.put('bookings', {
      ...booking,
      quoteLowAgorot: offer.priceAgorot,
      quoteHighAgorot: offer.priceAgorot,
      updatedAt: nowIso(),
    });
  }
}

// ---------------------------------------------------------------------------
// Offer resolution
// ---------------------------------------------------------------------------

export async function acceptOffer(
  offerId: string,
  actor: 'professional' | 'customer' = 'professional',
): Promise<void> {
  const store = getStore();
  const offer = await store.get('offers', offerId);
  if (!offer || !['sent'].includes(offer.status)) return;
  const booking = await store.get('bookings', offer.bookingId);
  if (!booking || !['offered', 'searching'].includes(booking.status)) return;

  await store.put('offers', { ...offer, status: 'accepted' });
  // Withdraw any sibling offers (bid mode sends several).
  const siblings = (await store.list('offers')).filter(
    (o) => o.bookingId === booking.id && o.id !== offer.id && o.status === 'sent',
  );
  for (const s of siblings) await store.put('offers', { ...s, status: 'withdrawn' });

  await store.put('bookings', {
    ...booking,
    professionalId: offer.professionalId,
    status: 'accepted',
    updatedAt: nowIso(),
  });
  await appendEvent(booking.id, 'accepted', actor, 'העבודה שובצה');
  await bumpAcceptance(offer.professionalId, true);
  await systemMessage(booking.id, 'העבודה שובצה! אפשר להתכתב כאן — פרטי הקשר המלאים יוצגו ביום העבודה.');
  await sendNotification(booking.customerId, 'העבודה שלך אושרה ✅', 'בעל המקצוע קיבל את העבודה', booking.id);
  trackEvent('ProfessionalAccepted', { bookingId: booking.id });
}

export async function declineOffer(offerId: string): Promise<void> {
  const store = getStore();
  const offer = await store.get('offers', offerId);
  if (!offer || offer.status !== 'sent') return;
  await store.put('offers', { ...offer, status: 'declined' });
  await bumpAcceptance(offer.professionalId, false);
  if (offer.kind === 'dispatch') await dispatchNext(offer.bookingId);
}

/**
 * Expire overdue dispatch offers and move on. Called by UI timers on both
 * sides every few seconds; safe to run concurrently.
 */
export async function tickDispatch(bookingId: string): Promise<void> {
  const store = getStore();
  const offers = (await store.list('offers')).filter(
    (o) => o.bookingId === bookingId && o.kind === 'dispatch' && o.status === 'sent',
  );
  let expired = false;
  for (const offer of offers) {
    if (offer.expiresAt && Date.parse(offer.expiresAt) < Date.now()) {
      await store.put('offers', { ...offer, status: 'expired' });
      await bumpAcceptance(offer.professionalId, false);
      expired = true;
    }
  }
  if (expired) await dispatchNext(bookingId);
}

/** EWMA acceptance tracking — no extra counters needed for the MVP. */
async function bumpAcceptance(proId: string, accepted: boolean): Promise<void> {
  const store = getStore();
  const pro = await store.get('professionals', proId);
  if (!pro) return;
  const next = Math.round((pro.acceptancePct * 0.9 + (accepted ? 100 : 0) * 0.1) * 10) / 10;
  await store.put('professionals', { ...pro, acceptancePct: next });
}

// ---------------------------------------------------------------------------
// Status progression + money
// ---------------------------------------------------------------------------

const PROGRESS_NOTIFICATIONS: Partial<Record<BookingStatus, [string, string]>> = {
  en_route: ['בעל המקצוע בדרך 🚗', 'המקצוען יצא אליך'],
  arrived: ['בעל המקצוע הגיע', 'המקצוען אצלך'],
  in_progress: ['העבודה התחילה 🧽', 'מנקים!'],
  completed: ['העבודה הסתיימה ✨', 'נשאר רק לשלם ולדרג'],
};

export async function advanceStatus(
  bookingId: string,
  next: BookingStatus,
  actor: BookingEvent['actor'],
  note = '',
): Promise<void> {
  const store = getStore();
  const booking = await store.get('bookings', bookingId);
  if (!booking) return;
  if (!BOOKING_TRANSITIONS[booking.status].includes(next) && actor !== 'admin') return;
  await store.put('bookings', { ...booking, status: next, updatedAt: nowIso() });
  await appendEvent(bookingId, next, actor, note);
  const notification = PROGRESS_NOTIFICATIONS[next];
  if (notification) {
    await sendNotification(booking.customerId, notification[0], notification[1], bookingId);
  }
}

/** The pro finishes the job and confirms the final price. */
export async function completeJob(bookingId: string, finalPriceAgorot: number): Promise<void> {
  const store = getStore();
  const booking = await store.get('bookings', bookingId);
  if (!booking || booking.status !== 'in_progress' || !booking.professionalId) return;
  const settings = await store.getSettings();
  const pro = await store.get('professionals', booking.professionalId);
  const commissionPct = pro?.commissionPct ?? settings.commissionPct;
  const priced = Math.max(0, finalPriceAgorot - booking.discountAgorot);
  const commission =
    settings.businessModel === 'lead_fee'
      ? settings.leadFeeAgorot
      : Math.round((priced * commissionPct) / 100);

  await store.put('bookings', {
    ...booking,
    status: 'completed',
    finalPriceAgorot: priced,
    commissionAgorot: commission,
    updatedAt: nowIso(),
  });
  await appendEvent(bookingId, 'completed', 'professional');
  await sendNotification(booking.customerId, 'העבודה הסתיימה ✨', 'נשאר רק לשלם ולדרג', bookingId);

  if (pro) {
    await store.put('professionals', {
      ...pro,
      jobCount: pro.jobCount + 1,
      lastJobAt: nowIso(),
    });
    await store.put('wallet', {
      id: uid(),
      professionalId: pro.id,
      bookingId,
      kind: 'job_income',
      amountAgorot: priced,
      note: 'תשלום עבור עבודה',
      createdAt: nowIso(),
    });
    await store.put('wallet', {
      id: uid(),
      professionalId: pro.id,
      bookingId,
      kind: settings.businessModel === 'lead_fee' ? 'lead_fee' : 'commission',
      amountAgorot: -commission,
      note:
        settings.businessModel === 'lead_fee'
          ? 'דמי ליד'
          : `עמלת פלטפורמה ${commissionPct}%`,
      createdAt: nowIso(),
    });
  }
}

export async function cancelBooking(
  bookingId: string,
  actor: BookingEvent['actor'],
  reason: string,
): Promise<void> {
  const store = getStore();
  const booking = await store.get('bookings', bookingId);
  if (!booking || ['completed', 'paid', 'reviewed', 'canceled'].includes(booking.status)) return;
  const open = (await store.list('offers')).filter(
    (o) => o.bookingId === bookingId && o.status === 'sent',
  );
  for (const o of open) await store.put('offers', { ...o, status: 'withdrawn' });
  await store.put('bookings', {
    ...booking,
    status: 'canceled',
    cancelReason: reason,
    updatedAt: nowIso(),
  });
  await appendEvent(bookingId, 'canceled', actor, reason);
}

// ---------------------------------------------------------------------------
// Reviews
// ---------------------------------------------------------------------------

export async function submitReview(
  input: Omit<Review, 'id' | 'createdAt'>,
): Promise<void> {
  const store = getStore();
  const booking = await store.get('bookings', input.bookingId);
  // Only a real completed booking by this customer can leave a review.
  if (
    !booking ||
    booking.customerId !== input.customerId ||
    !['completed', 'paid'].includes(booking.status)
  ) {
    return;
  }
  await store.put('reviews', { ...input, id: uid(), createdAt: nowIso() });
  await advanceStatus(input.bookingId, 'reviewed', 'customer');
  const pro = await store.get('professionals', input.professionalId);
  if (pro) {
    const overall = (input.quality + input.punctuality + input.service + input.price) / 4;
    const total = pro.rating * pro.reviewCount + overall;
    const count = pro.reviewCount + 1;
    const rating = Math.round((total / count) * 100) / 100;
    const badges = new Set(pro.badges);
    if (rating >= 4.8 && count >= 10) badges.add('top_rated');
    if (pro.jobCount >= 100) badges.add('jobs_100');
    await store.put('professionals', {
      ...pro,
      rating,
      reviewCount: count,
      badges: [...badges],
    });
  }
}

// ---------------------------------------------------------------------------
// Coupons
// ---------------------------------------------------------------------------

export function couponDiscount(
  coupon: Coupon,
  quoteAgorot: number,
  context: { serviceId: string; areaId: string | null; isNewCustomer: boolean },
): { ok: true; discountAgorot: number } | { ok: false; reason: string } {
  if (!coupon.active) return { ok: false, reason: 'הקופון אינו פעיל' };
  if (coupon.expiresAt && Date.parse(coupon.expiresAt) < Date.now())
    return { ok: false, reason: 'תוקף הקופון פג' };
  if (coupon.maxRedemptions !== null && coupon.redemptions >= coupon.maxRedemptions)
    return { ok: false, reason: 'הקופון נוצל במלואו' };
  if (coupon.serviceId && coupon.serviceId !== context.serviceId)
    return { ok: false, reason: 'הקופון אינו תקף לשירות זה' };
  if (coupon.areaId && coupon.areaId !== context.areaId)
    return { ok: false, reason: 'הקופון אינו תקף באזור זה' };
  if (coupon.newCustomersOnly && !context.isNewCustomer)
    return { ok: false, reason: 'הקופון ללקוחות חדשים בלבד' };
  const discount = coupon.percentOff
    ? Math.round((quoteAgorot * coupon.percentOff) / 100)
    : (coupon.amountOffAgorot ?? 0);
  return { ok: true, discountAgorot: Math.min(discount, quoteAgorot) };
}
