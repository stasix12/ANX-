/**
 * LeadCloser AI — domain types.
 *
 * Every entity that belongs to a business carries `organizationId`. The same
 * shapes are used by the in-browser demo store and by the Supabase store
 * (which maps camelCase ↔ snake_case), so the UI never knows which one it is
 * talking to.
 */

export type Locale = 'he' | 'ru' | 'en';
export const LOCALES: Locale[] = ['he', 'ru', 'en'];

/** Text that has a variant per supported language. */
export type I18nText = Partial<Record<Locale, string>> & { he?: string; ru?: string; en?: string };

export type Industry = 'upholstery_cleaning' | 'ac_technician' | 'plumbing' | 'locksmith' | 'pest_control' | 'electrician';

export type Channel = 'whatsapp' | 'website' | 'facebook' | 'instagram' | 'phone' | 'manual';

export type LeadSourceKey = 'google' | 'facebook' | 'instagram' | 'whatsapp' | 'website' | 'organic' | 'other';
export const LEAD_SOURCE_KEYS: LeadSourceKey[] = ['google', 'facebook', 'instagram', 'whatsapp', 'website', 'organic', 'other'];

export type LeadStatus = 'new' | 'qualified' | 'quoted' | 'booked' | 'lost';

export type ConversationStatus = 'new' | 'ai' | 'waiting' | 'quote_sent' | 'booked' | 'lost' | 'human';
export const CONVERSATION_STATUSES: ConversationStatus[] = ['new', 'ai', 'waiting', 'quote_sent', 'booked', 'lost', 'human'];

export type MessageSender = 'customer' | 'ai' | 'owner' | 'system';

export type JobStatus = 'booked' | 'confirmed' | 'on_the_way' | 'in_progress' | 'completed' | 'cancelled';
export const JOB_STATUSES: JobStatus[] = ['booked', 'confirmed', 'on_the_way', 'in_progress', 'completed', 'cancelled'];

export type PaymentStatus = 'unpaid' | 'deposit' | 'paid' | 'refunded';

export type Tone = 'friendly' | 'professional' | 'direct' | 'warm' | 'custom';

export type PlanKey = 'starter' | 'pro' | 'business';

export type LostReason = 'price' | 'no_response' | 'competitor' | 'not_relevant' | 'timing' | 'other';

export interface Organization {
  id: string;
  name: string;
  slug: string;
  industry: Industry;
  locale: Locale;
  currency: 'ILS';
  timezone: string;
  phone: string;
  city: string;
  onboardingStep: number; // 0..7, 7 = activated
  active: boolean;
  demo: boolean;
  createdAt: string;
}

export interface Member {
  id: string;
  organizationId: string;
  userId: string;
  email: string;
  fullName: string;
  role: 'owner' | 'admin' | 'worker';
  workerId: string | null;
}

export interface Address {
  street: string;
  city: string;
  floor?: string;
  notes?: string;
}

export interface Customer {
  id: string;
  organizationId: string;
  name: string;
  phone: string;
  language: Locale;
  addresses: Address[];
  city: string;
  notes: string;
  tags: string[];
  source: LeadSourceKey;
  lifetimeValue: number;
  lastContactAt: string;
  createdAt: string;
}

/** What the agent tries to learn about a job before quoting. */
export interface Qualification {
  serviceIds: string[]; // service ids
  items: { serviceId: string; quantity: number }[];
  city?: string;
  address?: string;
  condition?: string; // stains / pets / smell / general
  photos: string[];
  preferredDate?: string; // YYYY-MM-DD
  preferredTime?: string; // HH:MM
  urgent?: boolean;
}

export interface Lead {
  id: string;
  organizationId: string;
  customerId: string;
  conversationId: string;
  source: LeadSourceKey;
  channel: Channel;
  status: LeadStatus;
  language: Locale;
  qualification: Qualification;
  quoteId: string | null;
  bookingId: string | null;
  lostReason: LostReason | null;
  aiHandled: boolean; // booked without a human touching it
  value: number; // quoted/booked value, for analytics
  createdAt: string;
  updatedAt: string;
}

export interface Conversation {
  id: string;
  organizationId: string;
  leadId: string;
  customerId: string;
  channel: Channel;
  language: Locale;
  status: ConversationStatus;
  aiPaused: boolean; // human takeover
  unreadCount: number;
  lastMessageText: string;
  lastMessageAt: string;
  /** Agent state machine memory (what has been asked, offered slots, etc). */
  agentState: AgentState;
  followUpStage: 0 | 1 | 2 | 3; // how many follow-ups were sent after the quote
  createdAt: string;
}

export interface Attachment {
  type: 'image';
  url: string;
  caption?: string;
  /** Mocked analysis until the vision adapter is real. */
  analysis?: { label: string; confidence: number };
}

export interface Message {
  id: string;
  organizationId: string;
  conversationId: string;
  sender: MessageSender;
  text: string;
  attachments: Attachment[];
  meta: { kind?: 'quote' | 'slots' | 'booking' | 'followup' | 'handoff' | 'note'; quoteId?: string; slots?: string[]; automationKey?: string };
  createdAt: string;
}

export type ServiceUnit = 'item' | 'seat' | 'sqm' | 'hour';

export interface Service {
  id: string;
  organizationId: string;
  name: I18nText;
  basePrice: number;
  unit: ServiceUnit;
  durationMin: number;
  category: string;
  /** Keywords per language the agent uses to recognise this service in free text. */
  keywords: I18nText;
  active: boolean;
  sortOrder: number;
}

export type PricingRuleType =
  | 'min_order'
  | 'quantity_discount'
  | 'package_discount'
  | 'location_surcharge'
  | 'urgent_surcharge'
  | 'extra'
  | 'custom';

export interface PricingRule {
  id: string;
  organizationId: string;
  type: PricingRuleType;
  name: I18nText;
  active: boolean;
  config: {
    /** min_order */
    minimum?: number;
    /** quantity_discount: from N units of a service → percent off that line */
    serviceId?: string;
    fromQuantity?: number;
    percentOff?: number;
    /** package_discount: all serviceIds present → flat amount off */
    serviceIds?: string[];
    amountOff?: number;
    /** location_surcharge: cities → amount */
    cities?: string[];
    amount?: number;
    /** urgent_surcharge: same-day / next-day → percent */
    percent?: number;
    /** extra: optional add-on offered by the agent */
    keywords?: I18nText;
    /** custom: free description shown to owner */
    description?: string;
  };
}

export interface QuoteLine {
  serviceId: string;
  label: string;
  quantity: number;
  unitPrice: number;
  total: number;
}

export interface QuoteAdjustment {
  ruleId: string;
  label: string;
  amount: number; // negative = discount
}

export interface Quote {
  id: string;
  organizationId: string;
  leadId: string;
  conversationId: string;
  lines: QuoteLine[];
  adjustments: QuoteAdjustment[];
  subtotal: number;
  total: number;
  status: 'draft' | 'sent' | 'accepted' | 'expired' | 'rejected';
  sentAt: string | null;
  createdAt: string;
}

export interface Booking {
  id: string;
  organizationId: string;
  leadId: string;
  quoteId: string | null;
  customerId: string;
  workerId: string | null;
  startAt: string; // ISO
  endAt: string;
  status: 'active' | 'cancelled';
  createdBy: 'ai' | 'owner';
  createdAt: string;
}

export interface Job {
  id: string;
  organizationId: string;
  bookingId: string;
  leadId: string;
  customerId: string;
  workerId: string | null;
  serviceSummary: string;
  serviceIds: string[];
  address: string;
  city: string;
  scheduledAt: string;
  durationMin: number;
  price: number;
  paymentStatus: PaymentStatus;
  status: JobStatus;
  internalNotes: string;
  customerNotes: string;
  photos: Attachment[];
  leadSource: LeadSourceKey;
  completedAt: string | null;
  createdAt: string;
}

export interface WorkingDay {
  enabled: boolean;
  start: string; // HH:MM
  end: string;
}
/** 0 = Sunday … 6 = Saturday (Israeli week starts Sunday). */
export type WorkingHours = Record<number, WorkingDay>;

export interface Worker {
  id: string;
  organizationId: string;
  name: string;
  phone: string;
  color: string; // calendar color token
  workingHours: WorkingHours;
  serviceAreas: string[];
  canSeePrices: boolean;
  active: boolean;
  createdAt: string;
}

export type AutomationTrigger =
  | 'lead_created'
  | 'booking_created'
  | 'before_appointment'
  | 'worker_assigned'
  | 'worker_on_the_way'
  | 'job_completed'
  | 'after_completion_review'
  | 'after_completion_followup'
  | 'reactivation'
  | 'quote_no_reply';

export interface Automation {
  id: string;
  organizationId: string;
  key: string;
  trigger: AutomationTrigger;
  name: I18nText;
  enabled: boolean;
  delayMinutes: number; // 0 = immediately; negative = before (reminder)
  message: I18nText;
  /** 'auto' = customer's language */
  language: Locale | 'auto';
  audience: 'customer' | 'worker' | 'owner';
}

export interface AutomationRun {
  id: string;
  organizationId: string;
  automationId: string;
  automationKey: string;
  entityType: 'lead' | 'booking' | 'job' | 'conversation';
  entityId: string;
  conversationId: string | null;
  scheduledAt: string;
  sentAt: string | null;
  status: 'scheduled' | 'sent' | 'skipped' | 'failed';
  renderedMessage: string;
  /** For follow-ups: did the customer come back and book afterwards? */
  recoveredValue: number;
}

export interface LeadSource {
  id: string;
  organizationId: string;
  key: LeadSourceKey;
  adSpendMonth: number; // prepared for ROAS
  enabled: boolean;
}

export interface FAQ {
  question: I18nText;
  answer: I18nText;
}

export interface AgentSettings {
  organizationId: string;
  businessName: string;
  agentName: string;
  tone: Tone;
  customTone: string;
  languages: Locale[];
  greeting: I18nText;
  description: string;
  serviceAreas: string[];
  workingHours: WorkingHours;
  slotMinutes: number; // default job slot granularity
  travelBufferMin: number;
  blockedTimes: { date: string; start: string; end: string; label?: string }[];
  faqs: FAQ[];
  neverSay: string[];
  handoffRules: { onAngry: boolean; onDiscountRequest: boolean; onComplaint: boolean; keywords: string[] };
  askForPhotos: boolean;
  autoBook: boolean;
  offerSlotsCount: number;
}

export interface Subscription {
  organizationId: string;
  plan: PlanKey;
  status: 'trialing' | 'active' | 'past_due' | 'cancelled';
  periodEnd: string;
  provider: 'mock' | 'stripe';
  externalId: string | null;
}

export interface ActivityLog {
  id: string;
  organizationId: string;
  actor: 'ai' | 'owner' | 'system' | 'customer' | 'worker';
  entityType: string;
  entityId: string;
  action: string;
  payload: Record<string, unknown>;
  createdAt: string;
}

/** Conversation memory the agent keeps between turns. */
export interface AgentState {
  step: 'greet' | 'discover' | 'qualify' | 'quote' | 'schedule' | 'confirm' | 'done' | 'handoff';
  asked: string[]; // field keys already asked
  offeredSlots: string[]; // ISO start times offered
  lastQuoteId: string | null;
  turns: number;
  pendingSlotConfirmation?: string;
}

/** Everything the client holds for one organisation. */
export interface Snapshot {
  organization: Organization;
  members: Member[];
  settings: AgentSettings;
  subscription: Subscription;
  customers: Customer[];
  leads: Lead[];
  conversations: Conversation[];
  messages: Message[];
  services: Service[];
  pricingRules: PricingRule[];
  quotes: Quote[];
  bookings: Booking[];
  jobs: Job[];
  workers: Worker[];
  automations: Automation[];
  automationRuns: AutomationRun[];
  leadSources: LeadSource[];
  activityLogs: ActivityLog[];
}

export type CollectionName = Exclude<keyof Snapshot, 'organization' | 'settings' | 'subscription'>;

export type CollectionRow<K extends CollectionName> = Snapshot[K] extends (infer T)[] ? T : never;

export const COLLECTIONS: CollectionName[] = [
  'members',
  'customers',
  'leads',
  'conversations',
  'messages',
  'services',
  'pricingRules',
  'quotes',
  'bookings',
  'jobs',
  'workers',
  'automations',
  'automationRuns',
  'leadSources',
  'activityLogs',
];

export function emptyQualification(): Qualification {
  return { serviceIds: [], items: [], photos: [] };
}

export function emptyAgentState(): AgentState {
  return { step: 'greet', asked: [], offeredSlots: [], lastQuoteId: null, turns: 0 };
}
