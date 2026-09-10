import { addDaysIso, cityById, todayIso } from './catalog';
import type {
  AdSpendEntry,
  AgentUser,
  AppNotification,
  Complaint,
  Customer,
  Job,
  Lead,
  PlatformConfig,
  Professional,
  Snapshot,
  WalletTx,
} from './types';

/**
 * Demo seed — everything the spec's §43 asks to test with: 20 leads across
 * the pipeline, 10 professionals, open/assigned/completed/cancelled jobs,
 * wallets with a real ledger, reviews, a complaint and ad spend. Times are
 * generated relative to "now" so waves, decay and follow-ups are alive the
 * moment the app loads.
 */

const minAgo = (m: number): string => new Date(Date.now() - m * 60000).toISOString();
const minAhead = (m: number): string => new Date(Date.now() + m * 60000).toISOString();

export const DEMO_CONFIG: PlatformConfig = {
  defaultFeeModel: 'fee',
  pricingRules: [
    {
      id: 'rule-default', name: 'ברירת מחדל — אחוז ממחיר הלקוח', categoryId: null, city: null,
      urgent: null, minCustomerPrice: null, maxCustomerPrice: null,
      mode: 'percent_range', percentMin: 20, percentMax: 28, amount: 0, priority: 0, active: true,
    },
    {
      id: 'rule-big', name: 'עבודות גדולות (₪800+)', categoryId: null, city: null,
      urgent: null, minCustomerPrice: 800, maxCustomerPrice: null,
      mode: 'percent_range', percentMin: 20, percentMax: 26, amount: 0, priority: 10, active: true,
    },
    {
      id: 'rule-urgent', name: 'עבודה דחופה — מחיר נמוך למציאת מחליף', categoryId: null, city: null,
      urgent: true, minCustomerPrice: null, maxCustomerPrice: null,
      mode: 'percent_range', percentMin: 15, percentMax: 20, amount: 0, priority: 20, active: true,
    },
  ],
  decay: {
    steps: [
      { afterMinutes: 15, percentOfBase: 90 },
      { afterMinutes: 30, percentOfBase: 80 },
      { afterMinutes: 45, percentOfBase: 70 },
      { afterMinutes: 60, percentOfBase: 60 },
    ],
    floorPercent: 50,
    urgentStartPercent: 75,
  },
  dispatch: {
    waves: [
      { size: 5, afterSeconds: 0 },
      { size: 15, afterSeconds: 60 },
      { size: -1, afterSeconds: 180 },
    ],
    weights: { distance: 25, score: 25, completion: 10, cancellations: 10, response: 10, recentLoad: 10, affinity: 10 },
    urgentThresholdMinutes: 90,
    minBalance: 0,
  },
  reactivationMonths: 6,
};

export const DEMO_AGENTS: AgentUser[] = [
  { id: 'admin-1', name: 'סטס (בעלים)', role: 'admin' },
  { id: 'agent-1', name: 'דנה לוי', role: 'sales_agent' },
  { id: 'agent-2', name: 'יוסי כהן', role: 'sales_agent' },
  { id: 'support-1', name: 'מור אזולאי', role: 'support_agent' },
];

/* ---------- Professionals ---------- */

function mkPro(p: Partial<Professional> & Pick<Professional, 'id' | 'name' | 'city'>): Professional {
  const city = cityById(p.city);
  return {
    createdAt: minAgo(60 * 24 * 90),
    phone: '050-0000000',
    businessName: `${p.name} — ניקוי מקצועי`,
    businessType: 'exempt',
    areas: [p.city],
    radiusKm: 25,
    hasCar: true,
    services: ['sofa', 'corner_sofa', 'mattress', 'carpet', 'chairs'],
    languages: ['עברית'],
    yearsExperience: 3,
    workPhotos: [],
    documents: [],
    approved: true,
    online: false,
    rating: 4.6,
    ratingCount: 20,
    completedJobs: 40,
    cancelledJobs: 1,
    totalTaken: 42,
    avgResponseSec: 120,
    jobsLast7d: 2,
    repeatCustomers: 3,
    complaintsCount: 0,
    onTimeRate: 0.93,
    lat: (city?.lat ?? 31.25) + (Math.random() - 0.5) * 0.02,
    lng: (city?.lng ?? 34.79) + (Math.random() - 0.5) * 0.02,
    ...p,
  };
}

export const DEMO_PROS: Professional[] = [
  mkPro({
    id: 'pro-1', name: 'אבי מזרחי', city: 'beer-sheva', phone: '052-1111111', online: true,
    areas: ['beer-sheva', 'ofakim', 'netivot'], rating: 4.9, ratingCount: 84, completedJobs: 170,
    totalTaken: 174, cancelledJobs: 2, avgResponseSec: 45, jobsLast7d: 4, repeatCustomers: 14,
    onTimeRate: 0.97, yearsExperience: 7, businessType: 'licensed',
  }),
  mkPro({
    id: 'pro-2', name: 'מיכאל גרוס', city: 'beer-sheva', phone: '053-2222222', online: true,
    areas: ['beer-sheva', 'kiryat-gat'], rating: 4.7, ratingCount: 41, completedJobs: 78,
    totalTaken: 82, cancelledJobs: 3, avgResponseSec: 90, jobsLast7d: 1, repeatCustomers: 6,
    languages: ['עברית', 'רוסית'],
  }),
  mkPro({
    id: 'pro-3', name: 'שרון ביטון', city: 'beer-sheva', phone: '054-3333333', online: true,
    rating: 4.3, ratingCount: 18, completedJobs: 22, totalTaken: 26, cancelledJobs: 3,
    avgResponseSec: 300, jobsLast7d: 0, yearsExperience: 1,
  }),
  mkPro({
    id: 'pro-4', name: 'דוד אלקיים', city: 'ofakim', phone: '050-4444444', online: true,
    areas: ['ofakim', 'netivot', 'beer-sheva'], radiusKm: 35, rating: 4.8, ratingCount: 33,
    completedJobs: 61, totalTaken: 63, cancelledJobs: 1, avgResponseSec: 60, jobsLast7d: 3,
    services: ['sofa', 'corner_sofa', 'mattress', 'carpet', 'chairs', 'car'],
  }),
  mkPro({
    id: 'pro-5', name: 'איגור פדורוב', city: 'ashdod', phone: '058-5555555', online: true,
    areas: ['ashdod', 'ashkelon'], radiusKm: 30, rating: 4.5, ratingCount: 26, completedJobs: 45,
    totalTaken: 49, cancelledJobs: 3, languages: ['עברית', 'רוסית'], jobsLast7d: 2,
  }),
  mkPro({
    id: 'pro-6', name: 'רועי שמעוני', city: 'tel-aviv', phone: '052-6666666', online: true,
    areas: ['tel-aviv', 'rishon', 'petah-tikva'], rating: 4.9, ratingCount: 120, completedJobs: 210,
    totalTaken: 214, cancelledJobs: 2, avgResponseSec: 40, jobsLast7d: 5, repeatCustomers: 22,
    onTimeRate: 0.98, businessType: 'company', yearsExperience: 9,
    services: ['sofa', 'corner_sofa', 'mattress', 'carpet', 'chairs', 'car', 'ac'],
  }),
  mkPro({
    id: 'pro-7', name: 'נתנאל פרץ', city: 'rishon', phone: '054-7777777', online: false,
    areas: ['rishon', 'tel-aviv'], rating: 4.4, ratingCount: 15, completedJobs: 28, totalTaken: 31,
    cancelledJobs: 2, jobsLast7d: 1,
  }),
  mkPro({
    id: 'pro-8', name: 'אלכס ברמן', city: 'haifa', phone: '053-8888888', online: true,
    areas: ['haifa', 'netanya'], radiusKm: 40, rating: 4.6, ratingCount: 22, completedJobs: 39,
    totalTaken: 41, cancelledJobs: 1, languages: ['עברית', 'רוסית', 'אנגלית'],
  }),
  mkPro({
    // Offline on purpose: Ashkelon shows demand with no supply on the map.
    id: 'pro-9', name: 'עומר דהן', city: 'ashkelon', phone: '050-9999999', online: false,
    rating: 4.2, ratingCount: 9, completedJobs: 14, totalTaken: 17, cancelledJobs: 2, jobsLast7d: 0,
  }),
  mkPro({
    // Pending admin approval — the /hq/pros approval queue.
    id: 'pro-10', name: 'ליאור חדד', city: 'jerusalem', phone: '052-1010101', approved: false,
    online: false, rating: 0, ratingCount: 0, completedJobs: 0, totalTaken: 0, cancelledJobs: 0,
    createdAt: minAgo(60 * 5), yearsExperience: 2,
  }),
];

/* ---------- Wallet ledger (balances derive from these rows only) ---------- */

function ledger(): WalletTx[] {
  const txs: WalletTx[] = [];
  const balances = new Map<string, number>();
  let n = 0;
  const add = (proId: string, type: WalletTx['type'], amount: number, minsAgo: number, note: string, jobId: string | null = null) => {
    const bal = (balances.get(proId) ?? 0) + amount;
    balances.set(proId, bal);
    txs.push({ id: `tx-${++n}`, proId, type, amount, jobId, at: minAgo(minsAgo), note, balanceAfter: bal });
  };

  add('pro-1', 'TOP_UP', 500, 60 * 24 * 14, 'טעינת ארנק');
  add('pro-1', 'JOB_PURCHASE', -120, 60 * 24 * 9, 'רכישת עבודה — באר שבע', 'job-done-4');
  add('pro-1', 'JOB_PURCHASE', -95, 60 * 24 * 3, 'רכישת עבודה — באר שבע', 'job-done-2');
  add('pro-1', 'JOB_PURCHASE', -110, 60 * 5, 'רכישת עבודה — באר שבע', 'job-active-1');
  add('pro-1', 'BONUS', 50, 60 * 24 * 2, 'בונוס — 10 עבודות בחודש');
  add('pro-2', 'TOP_UP', 400, 60 * 24 * 10, 'טעינת ארנק');
  add('pro-2', 'JOB_PURCHASE', -85, 60 * 24 * 6, 'רכישת עבודה — קריית גת', 'job-done-3');
  add('pro-2', 'JOB_PURCHASE', -105, 60 * 3, 'רכישת עבודה — באר שבע', 'job-active-2');
  add('pro-3', 'TOP_UP', 150, 60 * 24 * 7, 'טעינת ארנק');
  add('pro-3', 'JOB_PURCHASE', -90, 60 * 24 * 1, 'רכישת עבודה — באר שבע', 'job-cancelled-1');
  add('pro-3', 'REFUND', 90, 60 * 22, 'החזר — הלקוח ביטל לפני יציאה', 'job-cancelled-1');
  add('pro-4', 'TOP_UP', 600, 60 * 24 * 12, 'טעינת ארנק');
  add('pro-4', 'JOB_PURCHASE', -100, 60 * 24 * 4, 'רכישת עבודה — נתיבות', 'job-done-5');
  add('pro-5', 'TOP_UP', 300, 60 * 24 * 8, 'טעינת ארנק');
  add('pro-5', 'JOB_PURCHASE', -125, 60 * 24 * 2, 'רכישת עבודה — אשדוד', 'job-done-6');
  add('pro-6', 'TOP_UP', 1000, 60 * 24 * 20, 'טעינת ארנק');
  add('pro-6', 'JOB_PURCHASE', -140, 60 * 24 * 5, 'רכישת עבודה — תל אביב', 'job-done-1');
  add('pro-6', 'PAYOUT', 320, 60 * 24 * 1, 'תשלום ביצוע — עבודת Payout', 'job-done-7');
  add('pro-7', 'TOP_UP', 200, 60 * 24 * 15, 'טעינת ארנק');
  add('pro-8', 'TOP_UP', 250, 60 * 24 * 6, 'טעינת ארנק');
  add('pro-9', 'TOP_UP', 60, 60 * 24 * 30, 'טעינת ארנק');
  return txs;
}

export const DEMO_WALLET_TXS: WalletTx[] = ledger();

/* ---------- Customers ---------- */

function mkCustomer(c: Partial<Customer> & Pick<Customer, 'id' | 'name' | 'phone' | 'city'>): Customer {
  return {
    createdAt: minAgo(60 * 24 * 30),
    address: '',
    orders: 1,
    totalSpent: 0,
    lastOrderAt: null,
    servicesUsed: [],
    lastProId: null,
    lastStars: null,
    loyaltyCredit: 0,
    ...c,
  };
}

export const DEMO_CUSTOMERS: Customer[] = [
  mkCustomer({ id: 'cust-1', name: 'דני אברהם', phone: '050-1234567', city: 'beer-sheva', address: 'רגר 40', orders: 2, totalSpent: 950, lastOrderAt: minAgo(60 * 2), servicesUsed: ['corner_sofa', 'mattress'], lastProId: 'pro-1', lastStars: 5, loyaltyCredit: 25 }),
  mkCustomer({ id: 'cust-2', name: 'מירי שלום', phone: '052-2345678', city: 'tel-aviv', address: 'אבן גבירול 90', orders: 1, totalSpent: 400, lastOrderAt: minAgo(60 * 24 * 5), servicesUsed: ['sofa'], lastProId: 'pro-6', lastStars: 5 }),
  mkCustomer({ id: 'cust-3', name: 'אבירם כץ', phone: '054-3456789', city: 'beer-sheva', address: 'הנרייטה סולד 12', orders: 1, totalSpent: 300, lastOrderAt: minAgo(60 * 24 * 3), servicesUsed: ['mattress'], lastProId: 'pro-1', lastStars: 4 }),
  mkCustomer({ id: 'cust-4', name: 'רותם ניסים', phone: '053-4567890', city: 'kiryat-gat', address: 'שדרות גת 8', orders: 1, totalSpent: 350, lastOrderAt: minAgo(60 * 24 * 6), servicesUsed: ['sofa'], lastProId: 'pro-2', lastStars: 5 }),
  mkCustomer({ id: 'cust-5', name: 'יעל ברק', phone: '050-5678901', city: 'netivot', address: 'הרצל 3', orders: 1, totalSpent: 420, lastOrderAt: minAgo(60 * 24 * 4), servicesUsed: ['corner_sofa'], lastProId: 'pro-4', lastStars: 4 }),
  mkCustomer({ id: 'cust-6', name: 'אלון סבג', phone: '058-6789012', city: 'ashdod', address: 'הציונות 22', orders: 1, totalSpent: 500, lastOrderAt: minAgo(60 * 24 * 2), servicesUsed: ['sofa', 'carpet'], lastProId: 'pro-5', lastStars: 5 }),
  mkCustomer({ id: 'cust-7', name: 'נועה פרידמן', phone: '052-7890123', city: 'tel-aviv', address: 'דיזנגוף 150', orders: 1, totalSpent: 800, lastOrderAt: minAgo(60 * 24 * 1), servicesUsed: ['corner_sofa', 'carpet'], lastProId: 'pro-6', lastStars: null }),
  mkCustomer({ id: 'cust-8', name: 'משה טל', phone: '050-8901234', city: 'beer-sheva', address: 'ויצמן 5', orders: 1, totalSpent: 0, lastOrderAt: null }),
  mkCustomer({ id: 'cust-9', name: 'שירה גבאי', phone: '054-9012345', city: 'ashkelon', address: 'הנשיא 17', orders: 1, totalSpent: 0, lastOrderAt: null }),
  // Stale customer — powers the "לא הזמינו 6 חודשים" reactivation list.
  mkCustomer({ id: 'cust-10', name: 'אורי לביא', phone: '053-1112223', city: 'beer-sheva', address: 'ביאליק 9', orders: 3, totalSpent: 1350, lastOrderAt: minAgo(60 * 24 * 210), servicesUsed: ['sofa', 'mattress'], lastProId: 'pro-1', lastStars: 5, createdAt: minAgo(60 * 24 * 400) }),
];

/* ---------- Jobs ---------- */

function mkJob(j: Partial<Job> & Pick<Job, 'id' | 'customerId' | 'customerName' | 'customerPhone' | 'city' | 'customerPrice' | 'baseFee' | 'status'>): Job {
  const city = cityById(j.city);
  return {
    createdAt: minAgo(60),
    updatedAt: minAgo(30),
    leadId: null,
    address: '',
    lat: city?.lat ?? 31.25,
    lng: city?.lng ?? 34.79,
    items: [{ categoryId: 'sofa', qty: 1 }],
    condition: [],
    photos: [],
    notes: '',
    date: todayIso(),
    windowStart: '16:00',
    windowEnd: '18:00',
    paymentMethod: 'cash',
    feeModel: 'fee',
    payoutAmount: null,
    decaySteps: [],
    statusHistory: [],
    dispatchStartedAt: null,
    urgent: false,
    redispatchCount: 0,
    excludedProIds: [],
    assignedProId: null,
    assignedAt: null,
    purchaseFee: null,
    advertisingCost: 45,
    paymentFee: 0,
    refunds: 0,
    discounts: 0,
    review: null,
    reviewRequestedAt: null,
    cancellation: null,
    source: 'facebook',
    agentId: 'agent-1',
    ...j,
  };
}

const decayFor = (baseFee: number): Job['decaySteps'] => [
  { afterMinutes: 0, fee: baseFee },
  { afterMinutes: 15, fee: Math.round((baseFee * 0.9) / 5) * 5 },
  { afterMinutes: 30, fee: Math.round((baseFee * 0.8) / 5) * 5 },
  { afterMinutes: 45, fee: Math.round((baseFee * 0.7) / 5) * 5 },
  { afterMinutes: 60, fee: Math.round((baseFee * 0.6) / 5) * 5 },
];

export const DEMO_JOBS: Job[] = [
  // 🔥 Fresh open job in Be'er Sheva — wave 1 just opened.
  mkJob({
    id: 'job-open-1', customerId: 'cust-1', customerName: 'דני אברהם', customerPhone: '050-1234567',
    city: 'beer-sheva', address: 'רגר 40, באר שבע', customerPrice: 550, baseFee: 130,
    items: [{ categoryId: 'corner_sofa', qty: 1 }, { categoryId: 'mattress', qty: 1 }],
    condition: ['כתמים קשים', 'בעלי חיים'], notes: 'כלב בבית — לתאם הגעה בטלפון',
    status: 'OFFERED', dispatchStartedAt: minAgo(1), decaySteps: decayFor(130),
    createdAt: minAgo(6), updatedAt: minAgo(1), source: 'google', leadId: 'lead-15',
    statusHistory: [
      { status: 'WAITING_FOR_PROFESSIONAL', at: minAgo(2), by: 'agent-1' },
      { status: 'OFFERED', at: minAgo(1), by: 'system' },
    ],
  }),
  // Open job mid-decay — the fee already dropped a step.
  mkJob({
    id: 'job-open-2', customerId: 'cust-2', customerName: 'מירי שלום', customerPhone: '052-2345678',
    city: 'tel-aviv', address: 'אבן גבירול 90, תל אביב', customerPrice: 400, baseFee: 95,
    items: [{ categoryId: 'sofa', qty: 1 }], condition: ['כתמים רגילים'],
    date: addDaysIso(1), windowStart: '10:00', windowEnd: '12:00',
    status: 'OFFERED', dispatchStartedAt: minAgo(22), decaySteps: decayFor(95),
    createdAt: minAgo(25), updatedAt: minAgo(22), source: 'facebook', agentId: 'agent-2',
    statusHistory: [
      { status: 'WAITING_FOR_PROFESSIONAL', at: minAgo(23), by: 'agent-2' },
      { status: 'OFFERED', at: minAgo(22), by: 'system' },
    ],
  }),
  // 🚨 Urgent: the assigned pro cancelled 1h before the window.
  mkJob({
    id: 'job-open-3', customerId: 'cust-9', customerName: 'שירה גבאי', customerPhone: '054-9012345',
    city: 'ashkelon', address: 'הנשיא 17, אשקלון', customerPrice: 480, baseFee: 110,
    items: [{ categoryId: 'sofa', qty: 1 }, { categoryId: 'carpet', qty: 1 }],
    windowStart: '15:00', windowEnd: '17:00',
    status: 'OFFERED', dispatchStartedAt: minAgo(8), decaySteps: decayFor(110),
    urgent: true, redispatchCount: 1, excludedProIds: ['pro-9'],
    createdAt: minAgo(60 * 4), updatedAt: minAgo(8), source: 'instagram',
    statusHistory: [
      { status: 'WAITING_FOR_PROFESSIONAL', at: minAgo(60 * 4), by: 'agent-1' },
      { status: 'OFFERED', at: minAgo(60 * 4 + 1), by: 'system' },
      { status: 'PROFESSIONAL_ASSIGNED', at: minAgo(60 * 3), by: 'pro-9' },
      { status: 'WAITING_FOR_PROFESSIONAL', at: minAgo(9), by: 'system' },
      { status: 'OFFERED', at: minAgo(8), by: 'system' },
    ],
  }),
  // Taken and on the way — today.
  mkJob({
    id: 'job-active-1', customerId: 'cust-3', customerName: 'אבירם כץ', customerPhone: '054-3456789',
    city: 'beer-sheva', address: 'הנרייטה סולד 12, באר שבע', customerPrice: 460, baseFee: 110,
    items: [{ categoryId: 'sofa', qty: 1 }, { categoryId: 'chairs', qty: 4 }],
    windowStart: '13:00', windowEnd: '15:00',
    status: 'ON_THE_WAY', assignedProId: 'pro-1', assignedAt: minAgo(60 * 5), purchaseFee: 110,
    dispatchStartedAt: minAgo(60 * 5 + 10), decaySteps: decayFor(110),
    createdAt: minAgo(60 * 6), updatedAt: minAgo(20), source: 'google', leadId: 'lead-16',
    statusHistory: [
      { status: 'WAITING_FOR_PROFESSIONAL', at: minAgo(60 * 5 + 12), by: 'agent-1' },
      { status: 'OFFERED', at: minAgo(60 * 5 + 10), by: 'system' },
      { status: 'PROFESSIONAL_ASSIGNED', at: minAgo(60 * 5), by: 'pro-1' },
      { status: 'ON_THE_WAY', at: minAgo(20), by: 'pro-1' },
    ],
  }),
  // Taken for tomorrow — assigned, not yet moving.
  mkJob({
    id: 'job-active-2', customerId: 'cust-8', customerName: 'משה טל', customerPhone: '050-8901234',
    city: 'beer-sheva', address: 'ויצמן 5, באר שבע', customerPrice: 420, baseFee: 105,
    items: [{ categoryId: 'mattress', qty: 2 }], date: addDaysIso(1),
    windowStart: '09:00', windowEnd: '11:00',
    status: 'PROFESSIONAL_ASSIGNED', assignedProId: 'pro-2', assignedAt: minAgo(60 * 3), purchaseFee: 105,
    dispatchStartedAt: minAgo(60 * 3 + 5), decaySteps: decayFor(105),
    createdAt: minAgo(60 * 4), updatedAt: minAgo(60 * 3), source: 'whatsapp', agentId: 'agent-2',
    statusHistory: [
      { status: 'WAITING_FOR_PROFESSIONAL', at: minAgo(60 * 3 + 6), by: 'agent-2' },
      { status: 'OFFERED', at: minAgo(60 * 3 + 5), by: 'system' },
      { status: 'PROFESSIONAL_ASSIGNED', at: minAgo(60 * 3), by: 'pro-2' },
    ],
  }),
  // Completed today, waiting for the customer's rating.
  mkJob({
    id: 'job-done-1', customerId: 'cust-7', customerName: 'נועה פרידמן', customerPhone: '052-7890123',
    city: 'tel-aviv', address: 'דיזנגוף 150, תל אביב', customerPrice: 800, baseFee: 140,
    items: [{ categoryId: 'corner_sofa', qty: 1 }, { categoryId: 'carpet', qty: 2 }],
    windowStart: '08:00', windowEnd: '10:00',
    status: 'COMPLETED', assignedProId: 'pro-6', assignedAt: minAgo(60 * 26), purchaseFee: 140,
    dispatchStartedAt: minAgo(60 * 26 + 10), decaySteps: decayFor(140),
    reviewRequestedAt: minAgo(60 * 2),
    createdAt: minAgo(60 * 30), updatedAt: minAgo(60 * 2), source: 'google', agentId: 'agent-1',
    statusHistory: [
      { status: 'WAITING_FOR_PROFESSIONAL', at: minAgo(60 * 26 + 12), by: 'agent-1' },
      { status: 'OFFERED', at: minAgo(60 * 26 + 10), by: 'system' },
      { status: 'PROFESSIONAL_ASSIGNED', at: minAgo(60 * 26), by: 'pro-6' },
      { status: 'ON_THE_WAY', at: minAgo(60 * 4), by: 'pro-6' },
      { status: 'ARRIVED', at: minAgo(60 * 3.5), by: 'pro-6' },
      { status: 'IN_PROGRESS', at: minAgo(60 * 3.4), by: 'pro-6' },
      { status: 'COMPLETED', at: minAgo(60 * 2), by: 'pro-6' },
    ],
  }),
  // Confirmed + 5★ review (yesterday).
  mkJob({
    id: 'job-done-2', customerId: 'cust-1', customerName: 'דני אברהם', customerPhone: '050-1234567',
    city: 'beer-sheva', address: 'רגר 40, באר שבע', customerPrice: 400, baseFee: 95,
    items: [{ categoryId: 'sofa', qty: 1 }], date: addDaysIso(-3),
    status: 'CUSTOMER_CONFIRMED', assignedProId: 'pro-1', assignedAt: minAgo(60 * 24 * 3), purchaseFee: 95,
    review: { stars: 5, quality: 5, service: 5, punctuality: 5, professionalism: 5, text: 'הספה חזרה כמו חדשה, תודה!', at: minAgo(60 * 24 * 2) },
    createdAt: minAgo(60 * 24 * 3.2), updatedAt: minAgo(60 * 24 * 2), source: 'facebook',
  }),
  mkJob({
    id: 'job-done-3', customerId: 'cust-4', customerName: 'רותם ניסים', customerPhone: '053-4567890',
    city: 'kiryat-gat', address: 'שדרות גת 8, קריית גת', customerPrice: 350, baseFee: 85,
    items: [{ categoryId: 'sofa', qty: 1 }], date: addDaysIso(-6),
    status: 'CUSTOMER_CONFIRMED', assignedProId: 'pro-2', assignedAt: minAgo(60 * 24 * 6), purchaseFee: 85,
    review: { stars: 5, quality: 5, service: 4, punctuality: 5, professionalism: 5, text: 'מקצועי ואדיב', at: minAgo(60 * 24 * 5) },
    createdAt: minAgo(60 * 24 * 6.5), updatedAt: minAgo(60 * 24 * 5), source: 'google', agentId: 'agent-2',
  }),
  mkJob({
    id: 'job-done-4', customerId: 'cust-10', customerName: 'אורי לביא', customerPhone: '053-1112223',
    city: 'beer-sheva', address: 'ביאליק 9, באר שבע', customerPrice: 520, baseFee: 120,
    items: [{ categoryId: 'sofa', qty: 1 }, { categoryId: 'mattress', qty: 1 }], date: addDaysIso(-9),
    status: 'CUSTOMER_CONFIRMED', assignedProId: 'pro-1', assignedAt: minAgo(60 * 24 * 9), purchaseFee: 120,
    review: { stars: 5, quality: 5, service: 5, punctuality: 4, professionalism: 5, text: '', at: minAgo(60 * 24 * 8) },
    createdAt: minAgo(60 * 24 * 9.4), updatedAt: minAgo(60 * 24 * 8), source: 'google',
  }),
  mkJob({
    id: 'job-done-5', customerId: 'cust-5', customerName: 'יעל ברק', customerPhone: '050-5678901',
    city: 'netivot', address: 'הרצל 3, נתיבות', customerPrice: 420, baseFee: 100,
    items: [{ categoryId: 'corner_sofa', qty: 1 }], date: addDaysIso(-4),
    status: 'CUSTOMER_CONFIRMED', assignedProId: 'pro-4', assignedAt: minAgo(60 * 24 * 4), purchaseFee: 100,
    review: { stars: 4, quality: 4, service: 5, punctuality: 4, professionalism: 4, text: 'עבודה טובה, קצת איחר', at: minAgo(60 * 24 * 3) },
    createdAt: minAgo(60 * 24 * 4.3), updatedAt: minAgo(60 * 24 * 3), source: 'tiktok', agentId: 'agent-2',
  }),
  mkJob({
    id: 'job-done-6', customerId: 'cust-6', customerName: 'אלון סבג', customerPhone: '058-6789012',
    city: 'ashdod', address: 'הציונות 22, אשדוד', customerPrice: 500, baseFee: 125,
    items: [{ categoryId: 'sofa', qty: 1 }, { categoryId: 'carpet', qty: 1 }], date: addDaysIso(-2),
    status: 'COMPLETED', assignedProId: 'pro-5', assignedAt: minAgo(60 * 24 * 2), purchaseFee: 125,
    reviewRequestedAt: minAgo(60 * 24), paymentFee: 8,
    createdAt: minAgo(60 * 24 * 2.4), updatedAt: minAgo(60 * 24), source: 'facebook',
  }),
  // Payout-model example: platform collected ₪600, pays the pro ₪320.
  mkJob({
    id: 'job-done-7', customerId: 'cust-2', customerName: 'מירי שלום', customerPhone: '052-2345678',
    city: 'tel-aviv', address: 'אבן גבירול 90, תל אביב', customerPrice: 600, baseFee: 280,
    feeModel: 'payout', payoutAmount: 320, paymentMethod: 'card', paymentFee: 15,
    items: [{ categoryId: 'corner_sofa', qty: 1 }, { categoryId: 'chairs', qty: 6 }], date: addDaysIso(-1),
    status: 'CUSTOMER_CONFIRMED', assignedProId: 'pro-6', assignedAt: minAgo(60 * 24 * 1.2), purchaseFee: 0,
    review: { stars: 5, quality: 5, service: 5, punctuality: 5, professionalism: 5, text: 'שירות מעולה מההזמנה ועד הביצוע', at: minAgo(60 * 20) },
    createdAt: minAgo(60 * 24 * 1.5), updatedAt: minAgo(60 * 20), source: 'google', agentId: 'agent-1',
  }),
  // Customer cancelled before the pro left — fee refunded.
  mkJob({
    id: 'job-cancelled-1', customerId: 'cust-3', customerName: 'אבירם כץ', customerPhone: '054-3456789',
    city: 'beer-sheva', address: 'הנרייטה סולד 12, באר שבע', customerPrice: 380, baseFee: 90,
    items: [{ categoryId: 'carpet', qty: 2 }], date: addDaysIso(-1),
    status: 'REFUNDED', assignedProId: 'pro-3', assignedAt: minAgo(60 * 26), purchaseFee: 90,
    refunds: 0,
    cancellation: { by: 'customer', reason: 'הלקוח דחה — נסיעה פתאומית', at: minAgo(60 * 22), refunded: true },
    createdAt: minAgo(60 * 28), updatedAt: minAgo(60 * 22), source: 'facebook', agentId: 'agent-2',
  }),
];

/* ---------- Leads (the 20 the spec asks for; some link to jobs above) ---------- */

function mkLead(l: Partial<Lead> & Pick<Lead, 'id' | 'name' | 'phone' | 'city' | 'status'>): Lead {
  return {
    createdAt: minAgo(120),
    updatedAt: minAgo(60),
    hasWhatsapp: true,
    address: '',
    items: [{ categoryId: 'sofa', qty: 1 }],
    condition: [],
    photos: [],
    preferred: 'date',
    preferredDate: addDaysIso(2),
    source: 'facebook',
    utm: { source: 'facebook', campaign: 'sofa-summer' },
    quotedPrice: null,
    agentId: null,
    followupAt: null,
    followupNote: '',
    answered: false,
    activities: [],
    customerId: null,
    jobId: null,
    ...l,
  };
}

export const DEMO_LEADS: Lead[] = [
  mkLead({ id: 'lead-1', name: 'עדי רחמים', phone: '050-2223334', city: 'beer-sheva', address: 'הפלמ"ח 18', status: 'new', preferred: 'today', items: [{ categoryId: 'corner_sofa', qty: 1 }, { categoryId: 'carpet', qty: 1 }], condition: ['כתמים קשים'], photos: ['demo'], source: 'google', utm: { source: 'google', campaign: 'sofa-bsh', medium: 'cpc' }, createdAt: minAgo(9), updatedAt: minAgo(9) }),
  mkLead({ id: 'lead-2', name: 'ליאת מור', phone: '052-3334445', city: 'tel-aviv', address: 'ארלוזורוב 60', status: 'new', preferred: 'tomorrow', items: [{ categoryId: 'sofa', qty: 1 }, { categoryId: 'mattress', qty: 1 }], photos: ['demo'], createdAt: minAgo(25), updatedAt: minAgo(25), source: 'facebook' }),
  mkLead({ id: 'lead-3', name: 'גיא אשכנזי', phone: '054-4445556', city: 'ashkelon', status: 'new', preferred: 'today', items: [{ categoryId: 'sofa', qty: 1 }], source: 'tiktok', utm: { source: 'tiktok', campaign: 'video-clean' }, createdAt: minAgo(40), updatedAt: minAgo(40) }),
  mkLead({ id: 'lead-4', name: 'הילה זהבי', phone: '053-5556667', city: 'ashdod', status: 'contacting', agentId: 'agent-1', preferred: 'tomorrow', items: [{ categoryId: 'mattress', qty: 2 }], createdAt: minAgo(65), updatedAt: minAgo(12), source: 'instagram' }),
  mkLead({ id: 'lead-5', name: 'תומר אדרי', phone: '050-6667778', city: 'beer-sheva', status: 'no_answer', agentId: 'agent-1', followupAt: minAhead(45), followupNote: 'ניסיון שני', preferred: 'today', createdAt: minAgo(95), updatedAt: minAgo(30), source: 'google' }),
  mkLead({ id: 'lead-6', name: 'קרן דוידוב', phone: '052-7778889', city: 'haifa', status: 'in_call', agentId: 'agent-2', answered: true, items: [{ categoryId: 'corner_sofa', qty: 1 }], photos: ['demo'], createdAt: minAgo(18), updatedAt: minAgo(2), source: 'facebook' }),
  mkLead({ id: 'lead-7', name: 'אורן חזן', phone: '054-8889990', city: 'rishon', status: 'quote_sent', agentId: 'agent-2', answered: true, quotedPrice: 450, items: [{ categoryId: 'sofa', qty: 1 }, { categoryId: 'chairs', qty: 4 }], createdAt: minAgo(60 * 3), updatedAt: minAgo(50), source: 'google' }),
  mkLead({ id: 'lead-8', name: 'סיון אלבז', phone: '053-9990001', city: 'beer-sheva', status: 'interested', agentId: 'agent-1', answered: true, quotedPrice: 520, preferred: 'tomorrow', items: [{ categoryId: 'corner_sofa', qty: 1 }, { categoryId: 'mattress', qty: 1 }], photos: ['demo'], createdAt: minAgo(60 * 4), updatedAt: minAgo(35), source: 'whatsapp' }),
  mkLead({ id: 'lead-9', name: 'ניר גולן', phone: '050-1112224', city: 'netanya', status: 'followup', agentId: 'agent-2', answered: true, followupAt: minAhead(60 * 3), followupNote: 'לחזור אחרי 17:00 — מתייעץ עם אשתו', quotedPrice: 380, createdAt: minAgo(60 * 6), updatedAt: minAgo(60), source: 'facebook' }),
  mkLead({ id: 'lead-10', name: 'דורית אמסלם', phone: '052-2223335', city: 'ofakim', status: 'followup', agentId: 'agent-1', answered: true, followupAt: minAgo(20), followupNote: 'ביקשה שנחזור בצהריים', quotedPrice: 300, createdAt: minAgo(60 * 8), updatedAt: minAgo(60 * 2), source: 'google' }),
  mkLead({ id: 'lead-11', name: 'רון שדה', phone: '054-3334446', city: 'tel-aviv', status: 'not_relevant', agentId: 'agent-2', activities: [], createdAt: minAgo(60 * 10), updatedAt: minAgo(60 * 9), source: 'organic' }),
  mkLead({ id: 'lead-12', name: 'ענת ברזילי', phone: '053-4445557', city: 'jerusalem', status: 'lost', agentId: 'agent-1', answered: true, quotedPrice: 600, createdAt: minAgo(60 * 26), updatedAt: minAgo(60 * 20), source: 'google' }),
  mkLead({ id: 'lead-13', name: 'שי ממן', phone: '050-5556668', city: 'beer-sheva', status: 'new', preferred: 'date', preferredDate: addDaysIso(3), items: [{ categoryId: 'ac', qty: 2 }], source: 'referral', createdAt: minAgo(55), updatedAt: minAgo(55) }),
  mkLead({ id: 'lead-14', name: 'מאיה עוז', phone: '052-6667779', city: 'ashkelon', status: 'contacting', agentId: 'agent-2', preferred: 'today', items: [{ categoryId: 'carpet', qty: 3 }], createdAt: minAgo(70), updatedAt: minAgo(8), source: 'instagram' }),
  mkLead({ id: 'lead-15', name: 'דני אברהם', phone: '050-1234567', city: 'beer-sheva', address: 'רגר 40', status: 'converted', agentId: 'agent-1', answered: true, quotedPrice: 550, customerId: 'cust-1', jobId: 'job-open-1', items: [{ categoryId: 'corner_sofa', qty: 1 }, { categoryId: 'mattress', qty: 1 }], condition: ['כתמים קשים', 'בעלי חיים'], photos: ['demo'], preferred: 'today', source: 'google', createdAt: minAgo(60 * 2), updatedAt: minAgo(2) }),
  mkLead({ id: 'lead-16', name: 'אבירם כץ', phone: '054-3456789', city: 'beer-sheva', status: 'converted', agentId: 'agent-1', answered: true, quotedPrice: 460, customerId: 'cust-3', jobId: 'job-active-1', preferred: 'today', source: 'google', createdAt: minAgo(60 * 7), updatedAt: minAgo(60 * 5) }),
  mkLead({ id: 'lead-17', name: 'נועה פרידמן', phone: '052-7890123', city: 'tel-aviv', status: 'converted', agentId: 'agent-1', answered: true, quotedPrice: 800, customerId: 'cust-7', jobId: 'job-done-1', source: 'google', createdAt: minAgo(60 * 31), updatedAt: minAgo(60 * 26) }),
  mkLead({ id: 'lead-18', name: 'משה טל', phone: '050-8901234', city: 'beer-sheva', status: 'converted', agentId: 'agent-2', answered: true, quotedPrice: 420, customerId: 'cust-8', jobId: 'job-active-2', source: 'whatsapp', createdAt: minAgo(60 * 5), updatedAt: minAgo(60 * 3) }),
  mkLead({ id: 'lead-19', name: 'איילת שקד', phone: '053-7778880', city: 'kiryat-gat', status: 'quote_sent', agentId: 'agent-1', answered: true, quotedPrice: 350, preferred: 'tomorrow', createdAt: minAgo(60 * 5), updatedAt: minAgo(60 * 1.5), source: 'facebook' }),
  mkLead({ id: 'lead-20', name: 'ברק אוחיון', phone: '050-8889991', city: 'netivot', status: 'closed', agentId: 'agent-1', answered: true, quotedPrice: 400, preferred: 'tomorrow', items: [{ categoryId: 'sofa', qty: 1 }, { categoryId: 'mattress', qty: 1 }], createdAt: minAgo(60 * 3), updatedAt: minAgo(15), source: 'google' }),
];

/* ---------- Marketing spend (last 7 days) ---------- */

export const DEMO_AD_SPEND: AdSpendEntry[] = Array.from({ length: 7 }).flatMap((_, i) => {
  const date = addDaysIso(-i);
  return [
    { id: `spend-g-${i}`, date, source: 'google' as const, campaign: 'sofa-bsh', amount: 420 + (i % 3) * 60 },
    { id: `spend-f-${i}`, date, source: 'facebook' as const, campaign: 'sofa-summer', amount: 380 + (i % 2) * 90 },
    { id: `spend-t-${i}`, date, source: 'tiktok' as const, campaign: 'video-clean', amount: 150 },
  ];
});

export const DEMO_COMPLAINTS: Complaint[] = [
  {
    id: 'comp-1', jobId: 'job-done-6', category: 'late',
    text: 'המנקה הגיע 40 דקות אחרי חלון הזמן שנקבע', status: 'open',
    at: minAgo(60 * 20), resolution: '',
  },
];

export const DEMO_NOTIFICATIONS: AppNotification[] = [
  {
    id: 'notif-1', toRole: 'professional', toId: 'pro-1', at: minAgo(1),
    title: '🔥 עבודה חדשה בבאר שבע', body: 'ספה פינתית + מזרן · ₪550 ללקוח · היום 16:00–18:00',
    jobId: 'job-open-1', read: false,
  },
  {
    id: 'notif-2', toRole: 'professional', toId: 'pro-5', at: minAgo(8),
    title: '🚨 עבודה דחופה באשקלון', body: 'ספה + שטיח · ₪480 ללקוח · היום 15:00–17:00',
    jobId: 'job-open-3', read: false,
  },
];

export function buildDemoSnapshot(): Snapshot {
  return {
    leads: DEMO_LEADS,
    jobs: DEMO_JOBS,
    professionals: DEMO_PROS,
    walletTxs: DEMO_WALLET_TXS,
    customers: DEMO_CUSTOMERS,
    complaints: DEMO_COMPLAINTS,
    notifications: DEMO_NOTIFICATIONS,
    adSpend: DEMO_AD_SPEND,
    agents: DEMO_AGENTS,
    config: DEMO_CONFIG,
  };
}
