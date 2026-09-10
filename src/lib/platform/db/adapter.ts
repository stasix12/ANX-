import type {
  AdSpendEntry,
  Cancellation,
  ComplaintCategory,
  FeeModel,
  Job,
  JobStatus,
  Lead,
  LeadItem,
  MarketingSource,
  PaymentMethod,
  PlatformConfig,
  Professional,
  Review,
  UtmParams,
} from '../types';
import type { Snapshot } from '../types';

/** What the customer funnel submits. */
export interface NewLeadInput {
  name: string;
  phone: string;
  hasWhatsapp: boolean;
  city: string;
  address: string;
  items: LeadItem[];
  condition: string[];
  photos: string[];
  preferred: 'today' | 'tomorrow' | 'date';
  preferredDate: string | null;
  source: MarketingSource;
  utm: UtmParams;
}

/** What the agent confirms in the "סגור עבודה" dialog. */
export interface CloseJobInput {
  customerPrice: number;
  date: string;
  windowStart: string;
  windowEnd: string;
  address: string;
  city: string;
  notes: string;
  paymentMethod: PaymentMethod;
  feeModel: FeeModel;
  /** Fee model: sale price of the job. Payout model: what the pro is paid. */
  baseFee: number;
  payoutAmount: number | null;
  items: LeadItem[];
}

/** Onboarding form at /pro/join. */
export interface ProRegistration {
  name: string;
  phone: string;
  businessName: string;
  businessType: Professional['businessType'];
  city: string;
  areas: string[];
  radiusKm: number;
  hasCar: boolean;
  services: string[];
  languages: string[];
  yearsExperience: number;
}

/**
 * The one data-access contract of the platform. The demo adapter
 * (../store.ts) implements it in-browser over localStorage; the Supabase
 * adapter (./supabase.ts) implements it over PostgreSQL + RPCs. UI code only
 * ever talks to this interface, so switching backends is an env change.
 */
export interface PlatformDB {
  readonly kind: 'demo' | 'supabase';
  snapshot(): Promise<Snapshot>;

  createLead(input: NewLeadInput): Promise<Lead>;
  setLeadStatus(id: string, status: Lead['status'], by: string): Promise<void>;
  addLeadActivity(id: string, kind: 'note' | 'call' | 'whatsapp', text: string, by: string): Promise<void>;
  setLeadQuote(id: string, price: number, by: string): Promise<void>;
  scheduleFollowup(id: string, at: string | null, note: string, by: string): Promise<void>;
  assignAgent(id: string, agentId: string | null): Promise<void>;
  markAnswered(id: string): Promise<void>;
  closeLead(id: string, input: CloseJobInput, by: string): Promise<Job>;

  takeJob(jobId: string, proId: string): Promise<Job>;
  advanceJob(jobId: string, status: JobStatus, by: string): Promise<void>;
  cancelJob(jobId: string, by: Cancellation['by'], reason: string, actor: string): Promise<void>;
  redispatchJob(jobId: string): Promise<void>;
  submitReview(jobId: string, review: Omit<Review, 'at'>): Promise<void>;

  registerPro(input: ProRegistration): Promise<Professional>;
  updatePro(id: string, patch: Partial<Professional>): Promise<void>;
  topUpWallet(proId: string, amount: number): Promise<void>;

  openComplaint(jobId: string, category: ComplaintCategory, text: string): Promise<void>;
  resolveComplaint(id: string, resolution: string): Promise<void>;

  addAdSpend(entry: Omit<AdSpendEntry, 'id'>): Promise<void>;
  updateConfig(patch: Partial<PlatformConfig>): Promise<void>;
  markNotificationsRead(toId: string): Promise<void>;
}
