/**
 * Domain types for the closed-jobs platform (Lead → Sale → Job → Dispatch →
 * Professional → Completion → Profit). Everything here is vertical-agnostic:
 * "sofa cleaning" only exists as rows in the service catalog, so the same
 * engine can later run plumbing, movers or any other home service.
 */

export type Role =
  | 'super_admin'
  | 'admin'
  | 'sales_manager'
  | 'sales_agent'
  | 'support_agent'
  | 'professional'
  | 'customer';

/* ---------- Catalog ---------- */

export interface ServiceCategory {
  id: string;
  /** Business vertical, e.g. 'cleaning'. New verticals are new catalog rows. */
  vertical: string;
  name: string;
  emoji: string;
  /** Typical customer price per unit, used for quote suggestions and lead value. */
  basePrice: number;
  unitLabel: string;
  maxQty: number;
  active: boolean;
}

export interface City {
  id: string;
  name: string;
  lat: number;
  lng: number;
}

/* ---------- Marketing ---------- */

export type MarketingSource =
  | 'google'
  | 'facebook'
  | 'instagram'
  | 'tiktok'
  | 'organic'
  | 'referral'
  | 'direct'
  | 'whatsapp';

export interface UtmParams {
  source?: string;
  campaign?: string;
  medium?: string;
  content?: string;
  term?: string;
}

export interface AdSpendEntry {
  id: string;
  /** ISO date (YYYY-MM-DD). */
  date: string;
  source: MarketingSource;
  campaign: string;
  amount: number;
}

/* ---------- Leads (sales pipeline) ---------- */

export type LeadStatus =
  | 'new'
  | 'contacting'
  | 'no_answer'
  | 'in_call'
  | 'quote_sent'
  | 'interested'
  | 'followup'
  | 'closed'
  | 'converted'
  | 'not_relevant'
  | 'lost';

export type LeadTier = 'HOT' | 'WARM' | 'COLD';

export interface LeadItem {
  categoryId: string;
  qty: number;
}

export type ActivityKind =
  | 'status'
  | 'note'
  | 'call'
  | 'whatsapp'
  | 'quote'
  | 'followup'
  | 'system';

export interface LeadActivity {
  id: string;
  at: string;
  kind: ActivityKind;
  text: string;
  by: string;
}

export interface Lead {
  id: string;
  createdAt: string;
  updatedAt: string;
  name: string;
  phone: string;
  hasWhatsapp: boolean;
  city: string;
  address: string;
  items: LeadItem[];
  /** Condition tags from the funnel: regular/tough stains, odors, pets… */
  condition: string[];
  /** Data-URLs in demo mode, storage URLs in production. */
  photos: string[];
  preferred: 'today' | 'tomorrow' | 'date';
  preferredDate: string | null;
  source: MarketingSource;
  utm: UtmParams;
  status: LeadStatus;
  quotedPrice: number | null;
  agentId: string | null;
  /** Next follow-up time (ISO) or null when none is pending. */
  followupAt: string | null;
  followupNote: string;
  /** Did the customer ever answer an agent? Feeds the lead score. */
  answered: boolean;
  activities: LeadActivity[];
  customerId: string | null;
  jobId: string | null;
}

/* ---------- Jobs ---------- */

/**
 * The job-phase slice of the full state machine (the lead phase LEAD →
 * CONTACTED → QUOTE_SENT → CLOSED lives on Lead.status). Kept in the spec's
 * uppercase names so the DB enum, the docs and the code all read the same.
 */
export type JobStatus =
  | 'WAITING_FOR_PROFESSIONAL'
  | 'OFFERED'
  | 'ACCEPTED'
  | 'PROFESSIONAL_ASSIGNED'
  | 'ON_THE_WAY'
  | 'ARRIVED'
  | 'IN_PROGRESS'
  | 'COMPLETED'
  | 'CUSTOMER_CONFIRMED'
  | 'CANCELLED'
  | 'REFUNDED';

/**
 * fee: the professional pays the platform to take the job and collects the
 *      full customer price himself.
 * payout: the platform collects from the customer and pays the professional
 *         a fixed execution amount.
 */
export type FeeModel = 'fee' | 'payout';

export type PaymentMethod = 'cash' | 'bit' | 'card' | 'transfer';

export interface DecayStep {
  afterMinutes: number;
  fee: number;
}

export interface Review {
  stars: number;
  quality: number;
  service: number;
  punctuality: number;
  professionalism: number;
  text: string;
  at: string;
}

export interface Cancellation {
  by: 'customer' | 'professional' | 'admin';
  reason: string;
  at: string;
  /** True when the professional was refunded his purchase fee. */
  refunded: boolean;
}

export interface Job {
  id: string;
  createdAt: string;
  updatedAt: string;
  leadId: string | null;
  customerId: string;
  customerName: string;
  customerPhone: string;
  city: string;
  address: string;
  lat: number;
  lng: number;
  items: LeadItem[];
  condition: string[];
  photos: string[];
  notes: string;
  /** ISO date of execution + arrival window. */
  date: string;
  windowStart: string;
  windowEnd: string;
  paymentMethod: PaymentMethod;
  feeModel: FeeModel;
  customerPrice: number;
  /** Fee model: opening price the professional pays. Payout model: platform margin. */
  baseFee: number;
  /** Payout model only: what the professional is paid for executing. */
  payoutAmount: number | null;
  /** Price-decay schedule computed at creation from the pricing config. */
  decaySteps: DecayStep[];
  status: JobStatus;
  statusHistory: { status: JobStatus; at: string; by: string }[];
  /** When dispatch waves started counting; reset on re-dispatch. */
  dispatchStartedAt: string | null;
  urgent: boolean;
  redispatchCount: number;
  /** Pros who cancelled this job — never re-offered to them. */
  excludedProIds: string[];
  assignedProId: string | null;
  assignedAt: string | null;
  /** The fee actually charged at purchase time (after decay). */
  purchaseFee: number | null;
  /** Cost attribution for per-job profitability. */
  advertisingCost: number;
  paymentFee: number;
  refunds: number;
  discounts: number;
  review: Review | null;
  reviewRequestedAt: string | null;
  cancellation: Cancellation | null;
  source: MarketingSource;
  agentId: string | null;
}

/* ---------- Professionals ---------- */

export type ProLevel = 'bronze' | 'silver' | 'gold' | 'diamond';

export interface Professional {
  id: string;
  createdAt: string;
  name: string;
  phone: string;
  businessName: string;
  businessType: 'exempt' | 'licensed' | 'company';
  city: string;
  /** City ids the professional serves, in addition to his radius. */
  areas: string[];
  radiusKm: number;
  hasCar: boolean;
  /** Category ids the professional performs. */
  services: string[];
  languages: string[];
  yearsExperience: number;
  workPhotos: string[];
  documents: string[];
  approved: boolean;
  online: boolean;
  rating: number;
  ratingCount: number;
  completedJobs: number;
  cancelledJobs: number;
  totalTaken: number;
  avgResponseSec: number;
  /** Jobs taken in the last 7 days — used for fair load spreading. */
  jobsLast7d: number;
  repeatCustomers: number;
  complaintsCount: number;
  /** 0..1 share of jobs where he arrived inside the window. */
  onTimeRate: number;
  lat: number;
  lng: number;
}

export type WalletTxType =
  | 'TOP_UP'
  | 'JOB_PURCHASE'
  | 'REFUND'
  | 'BONUS'
  | 'ADJUSTMENT'
  | 'PAYOUT';

export interface WalletTx {
  id: string;
  proId: string;
  type: WalletTxType;
  /** Signed amount: TOP_UP positive, JOB_PURCHASE negative, … */
  amount: number;
  jobId: string | null;
  at: string;
  note: string;
  /** Ledger invariant: running balance after this transaction. */
  balanceAfter: number;
}

/* ---------- Customers ---------- */

export interface Customer {
  id: string;
  createdAt: string;
  name: string;
  phone: string;
  city: string;
  address: string;
  orders: number;
  totalSpent: number;
  lastOrderAt: string | null;
  servicesUsed: string[];
  lastProId: string | null;
  lastStars: number | null;
  loyaltyCredit: number;
}

/* ---------- Quality ---------- */

export type ComplaintCategory =
  | 'no_show'
  | 'late'
  | 'quality'
  | 'damage'
  | 'price'
  | 'behavior'
  | 'other';

export interface Complaint {
  id: string;
  jobId: string;
  category: ComplaintCategory;
  text: string;
  status: 'open' | 'in_review' | 'resolved';
  at: string;
  resolution: string;
}

export interface AppNotification {
  id: string;
  toRole: Role;
  toId: string | null;
  at: string;
  title: string;
  body: string;
  jobId: string | null;
  read: boolean;
}

/* ---------- Configuration (all admin-editable, nothing hardcoded) ---------- */

export interface PricingRule {
  id: string;
  name: string;
  /** Scope filters — null/undefined means "any". Most specific rule wins. */
  categoryId: string | null;
  city: string | null;
  urgent: boolean | null;
  minCustomerPrice: number | null;
  maxCustomerPrice: number | null;
  mode: 'percent_range' | 'percent' | 'fixed';
  percentMin: number;
  percentMax: number;
  amount: number;
  priority: number;
  active: boolean;
}

export interface DecayConfig {
  /** Each step: after N minutes without a taker, drop to this % of the base fee. */
  steps: { afterMinutes: number; percentOfBase: number }[];
  /** Never drop below this % of the base fee. */
  floorPercent: number;
  /** Urgent re-dispatch opens at this % of the base fee immediately. */
  urgentStartPercent: number;
}

export interface DispatchWeights {
  distance: number;
  score: number;
  completion: number;
  cancellations: number;
  response: number;
  recentLoad: number;
  affinity: number;
}

export interface DispatchConfig {
  /** Wave sizes are cumulative counts; size -1 = everyone eligible. */
  waves: { size: number; afterSeconds: number }[];
  weights: DispatchWeights;
  /** Cancelling closer than this to the window start marks the job URGENT. */
  urgentThresholdMinutes: number;
  minBalance: number;
}

export interface PlatformConfig {
  defaultFeeModel: FeeModel;
  pricingRules: PricingRule[];
  decay: DecayConfig;
  dispatch: DispatchConfig;
  /** Months of silence before a customer enters the reactivation list. */
  reactivationMonths: number;
}

/* ---------- Users & session ---------- */

export interface AgentUser {
  id: string;
  name: string;
  role: Role;
}

export interface Session {
  role: Role;
  userId: string | null;
  name: string;
}

/* ---------- Full snapshot the adapters serve ---------- */

export interface Snapshot {
  leads: Lead[];
  jobs: Job[];
  professionals: Professional[];
  walletTxs: WalletTx[];
  customers: Customer[];
  complaints: Complaint[];
  notifications: AppNotification[];
  adSpend: AdSpendEntry[];
  agents: AgentUser[];
  config: PlatformConfig;
}
