/**
 * Marketplace domain types. Money is always integer agorot; timestamps are
 * ISO strings so rows survive JSON round-trips identically in the demo store
 * (localStorage) and in Supabase (jsonb / timestamptz → string).
 */

export type Role = 'customer' | 'professional' | 'admin' | 'super_admin';

export type Language = 'he' | 'ru' | 'ar' | 'en';

export interface GeoPoint {
  lat: number;
  lng: number;
}

// --- Catalogue -------------------------------------------------------------

export type QuestionType = 'count' | 'bool' | 'choice';

/** One pricing question in a service's questionnaire. */
export interface ServiceQuestion {
  id: string;
  label: string;
  type: QuestionType;
  /** count: price added per unit above `included`. */
  perUnitAgorot?: number;
  included?: number;
  min?: number;
  max?: number;
  /** bool: price added when answered "yes". */
  deltaAgorot?: number;
  /** choice options: label + price delta. */
  options?: { id: string; label: string; deltaAgorot: number }[];
}

export interface Service {
  id: string; // doubles as the SEO slug, e.g. 'sofa-cleaning'
  category: string;
  name: string;
  shortName: string;
  description: string;
  icon: string; // emoji — swapped for real art later
  basePriceAgorot: number;
  durationMinutes: number;
  questions: ServiceQuestion[];
  active: boolean;
  comingSoon: boolean;
}

export interface ServiceArea {
  id: string; // e.g. 'beer-sheva'
  name: string;
  center: GeoPoint;
  radiusKm: number;
  active: boolean;
  /** true → no coverage yet; customers get the waitlist flow. */
  waitlistOnly: boolean;
}

// --- Professionals ---------------------------------------------------------

export type ProStatus = 'pending' | 'active' | 'blocked';

export type Badge =
  | 'verified_id'
  | 'verified_business'
  | 'platform_checked'
  | 'top_rated'
  | 'jobs_100';

export interface GalleryImage {
  url: string;
  caption?: string;
  kind?: 'before' | 'after' | 'plain';
}

export interface Professional {
  id: string;
  slug: string;
  fullName: string;
  businessName: string;
  phone: string;
  email: string;
  photoUrl?: string;
  city: string;
  bio: string;
  languages: Language[];
  yearsExperience: number;
  workRadiusKm: number;
  base: GeoPoint;
  areaIds: string[];
  services: { serviceId: string; priceAgorot?: number }[];
  gallery: GalleryImage[];
  status: ProStatus;
  badges: Badge[];
  /** null → platform default commission. */
  commissionPct: number | null;
  boost: number; // 0–100, paid promotion
  rating: number;
  reviewCount: number;
  jobCount: number;
  acceptancePct: number;
  cancelPct: number;
  lastJobAt: string | null;
  /** Demo pros are driven by the built-in simulation when no human plays them. */
  isDemo?: boolean;
  createdAt: string;
}

export interface Availability {
  professionalId: string;
  online: boolean;
  heartbeatAt: string;
  location?: GeoPoint;
}

// --- Bookings --------------------------------------------------------------

export type BookingStatus =
  | 'draft'
  | 'searching'
  | 'offered'
  | 'no_pros_available'
  | 'accepted'
  | 'en_route'
  | 'arrived'
  | 'in_progress'
  | 'completed'
  | 'paid'
  | 'reviewed'
  | 'canceled';

export type BookingMode = 'auto' | 'chosen' | 'bidding';

export interface Booking {
  id: string;
  customerId: string;
  customerName: string;
  customerPhone: string;
  professionalId: string | null;
  serviceId: string;
  areaId: string | null;
  address: string;
  location: GeoPoint | null;
  answers: Record<string, number | boolean | string>;
  photos: string[]; // data URLs in demo mode, storage URLs in production
  notes: string;
  /** null → "עכשיו". */
  scheduledFor: string | null;
  mode: BookingMode;
  quoteLowAgorot: number;
  quoteHighAgorot: number;
  finalPriceAgorot: number | null;
  couponCode: string | null;
  discountAgorot: number;
  commissionAgorot: number | null;
  paymentMethod: string | null;
  status: BookingStatus;
  cancelReason: string | null;
  /** Pro ids already offered (dispatch order), so the loop never repeats one. */
  offeredProIds: string[];
  createdAt: string;
  updatedAt: string;
}

export type OfferStatus = 'sent' | 'accepted' | 'declined' | 'expired' | 'withdrawn';

export interface BookingOffer {
  id: string;
  bookingId: string;
  professionalId: string;
  kind: 'dispatch' | 'bid';
  status: OfferStatus;
  expiresAt: string | null;
  priceAgorot: number | null;
  etaMinutes: number | null;
  message: string;
  createdAt: string;
}

export interface BookingEvent {
  id: string;
  bookingId: string;
  status: BookingStatus;
  actor: 'customer' | 'professional' | 'admin' | 'system';
  note: string;
  createdAt: string;
}

export interface Message {
  id: string;
  bookingId: string;
  sender: 'customer' | 'professional' | 'system';
  kind: 'text' | 'image' | 'location' | 'system';
  body: string;
  createdAt: string;
}

export interface Review {
  id: string;
  bookingId: string;
  professionalId: string;
  customerId: string;
  customerName: string;
  serviceId: string;
  quality: number;
  punctuality: number;
  service: number;
  price: number;
  text: string;
  photoUrl?: string;
  createdAt: string;
}

// --- Money -----------------------------------------------------------------

export type WalletKind =
  | 'job_income'
  | 'commission'
  | 'lead_fee'
  | 'subscription'
  | 'boost'
  | 'payout'
  | 'credit'
  | 'adjustment';

export interface WalletTransaction {
  id: string;
  professionalId: string;
  bookingId: string | null;
  kind: WalletKind;
  /** Positive = credited to the pro. */
  amountAgorot: number;
  note: string;
  createdAt: string;
}

export interface Coupon {
  code: string;
  percentOff: number | null;
  amountOffAgorot: number | null;
  serviceId: string | null;
  areaId: string | null;
  newCustomersOnly: boolean;
  expiresAt: string | null;
  maxRedemptions: number | null;
  redemptions: number;
  active: boolean;
}

// --- Misc ------------------------------------------------------------------

export interface CustomerProfile {
  id: string;
  fullName: string;
  phone: string;
  email: string;
  language: Language;
  creditAgorot: number;
  referralCode: string;
  favorites: string[]; // professional ids
  blocked: boolean;
  createdAt: string;
}

export interface WaitlistEntry {
  id: string;
  phone: string;
  areaName: string;
  serviceId: string | null;
  createdAt: string;
}

export interface AppNotification {
  id: string;
  userId: string; // customer id or professional id
  title: string;
  body: string;
  bookingId: string | null;
  read: boolean;
  createdAt: string;
}

/** Admin-editable platform knobs — changing the business model needs no code. */
export interface PlatformSettings {
  businessModel: 'commission' | 'lead_fee' | 'subscription';
  commissionPct: number;
  leadFeeAgorot: number;
  subscriptionTiers: { id: 'basic' | 'pro' | 'premium'; name: string; priceAgorot: number }[];
  paymentMethods: { id: string; label: string; enabled: boolean }[];
  dispatchTtlSeconds: number;
  dispatchMaxOffers: number;
  /** Prepared, off by default. */
  dynamicPricing: {
    enabled: boolean;
    rushMultiplier: number;
    weekendMultiplier: number;
    lowSupplyMultiplier: number;
  };
  /** Demo pros accept/progress jobs automatically when no human plays them. */
  simulationEnabled: boolean;
}
