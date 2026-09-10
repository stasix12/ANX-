'use client';

import { useEffect, useSyncExternalStore } from 'react';
import { cityById, cityName, itemsLabel, todayIso } from './catalog';
import { eligiblePros, rankPros, waveState } from './dispatch';
import { buildDecaySteps, currentFee } from './pricing';
import { assertTransition, OPEN_STATUSES } from './stateMachine';
import { buildDemoSnapshot } from './demoData';
import { supabaseDB } from './db/supabase';
import type {
  CloseJobInput,
  NewLeadInput,
  PlatformDB,
  ProRegistration,
} from './db/adapter';
import type {
  AdSpendEntry,
  AppNotification,
  Cancellation,
  ComplaintCategory,
  Customer,
  Job,
  JobStatus,
  Lead,
  LeadActivity,
  PlatformConfig,
  Professional,
  Review,
  Role,
  Session,
  Snapshot,
  WalletTx,
} from './types';

/**
 * Demo backend + the client-side store the UI subscribes to.
 *
 * Every mutation below is the same business operation the Supabase backend
 * implements in SQL (supabase/platform-schema.sql): the demo runs it in the
 * browser over a localStorage snapshot so the entire product works end to
 * end with no keys. UI code never touches this module's internals — it uses
 * usePlatform()/useSession() and the exported `actions`, which would also be
 * the surface for the Supabase adapter (src/lib/platform/db/supabase.ts).
 */

const STORAGE_KEY = 'anx-platform-db-v1';
const SESSION_KEY = 'anx-platform-session-v1';

let cache: Snapshot | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const fn of listeners) fn();
}

function persist() {
  if (typeof window === 'undefined' || !cache) return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(cache));
  } catch {
    // Storage full or blocked — demo keeps running in memory.
  }
}

function loadSnapshot(): Snapshot {
  if (typeof window !== 'undefined') {
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as Snapshot;
        if (parsed && Array.isArray(parsed.leads) && parsed.config) return parsed;
      }
    } catch {
      // Corrupt store — fall through to a fresh seed.
    }
  }
  return buildDemoSnapshot();
}

function ensureLoaded(): Snapshot {
  if (!cache) {
    cache = loadSnapshot();
    persist();
  }
  return cache;
}

/** Run a mutation, persist, and hand subscribers a fresh reference. */
function mutate(fn: (s: Snapshot) => void): void {
  const s = ensureLoaded();
  fn(s);
  cache = { ...s };
  persist();
  notify();
}

export const uid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

const nowIso = (): string => new Date().toISOString();

/* ---------- Cross-cutting helpers ---------- */

export function walletBalance(s: Snapshot, proId: string): number {
  return s.walletTxs.filter((t) => t.proId === proId).reduce((sum, t) => sum + t.amount, 0);
}

function addTx(s: Snapshot, tx: Omit<WalletTx, 'id' | 'at' | 'balanceAfter'>): WalletTx {
  const full: WalletTx = {
    ...tx,
    id: uid('tx'),
    at: nowIso(),
    balanceAfter: walletBalance(s, tx.proId) + tx.amount,
  };
  s.walletTxs = [...s.walletTxs, full];
  return full;
}

function pushActivity(lead: Lead, kind: LeadActivity['kind'], text: string, by: string) {
  lead.activities = [...lead.activities, { id: uid('act'), at: nowIso(), kind, text, by }];
  lead.updatedAt = nowIso();
}

function setJobStatus(job: Job, status: JobStatus, by: string) {
  assertTransition(job.status, status);
  job.status = status;
  job.updatedAt = nowIso();
  job.statusHistory = [...job.statusHistory, { status, at: nowIso(), by }];
}

function notifyPros(s: Snapshot, job: Job, title: string) {
  const ranked = rankPros(job, eligiblePros(job, s.professionals), s.config.dispatch);
  const wave = waveState(job, ranked, s.config.dispatch);
  for (const r of wave.visible) {
    s.notifications = [
      ...s.notifications,
      {
        id: uid('notif'),
        toRole: 'professional',
        toId: r.pro.id,
        at: nowIso(),
        title,
        body: `${itemsLabel(job.items)} · ₪${job.customerPrice} ללקוח · ${job.date === todayIso() ? 'היום' : job.date} ${job.windowStart}–${job.windowEnd}`,
        jobId: job.id,
        read: false,
      },
    ];
  }
}

/** Minutes until the job's arrival window opens (negative = already open). */
function minutesToWindow(job: Job): number {
  const start = new Date(`${job.date}T${job.windowStart}:00`);
  return (start.getTime() - Date.now()) / 60000;
}

function requireLead(s: Snapshot, id: string): Lead {
  const lead = s.leads.find((l) => l.id === id);
  if (!lead) throw new Error('הליד לא נמצא');
  return lead;
}

function requireJob(s: Snapshot, id: string): Job {
  const job = s.jobs.find((j) => j.id === id);
  if (!job) throw new Error('העבודה לא נמצאה');
  return job;
}

function requirePro(s: Snapshot, id: string): Professional {
  const pro = s.professionals.find((p) => p.id === id);
  if (!pro) throw new Error('בעל המקצוע לא נמצא');
  return pro;
}

/**
 * Ad-cost attribution for a new job: the source's spend over the last 7 days
 * divided by the jobs it produced (this one included). Refined later by the
 * economics screen, but each job carries a defensible acquisition cost.
 */
function advertisingCostFor(s: Snapshot, source: Job['source']): number {
  const weekAgo = new Date(Date.now() - 7 * 24 * 3600 * 1000).toISOString().slice(0, 10);
  const spend = s.adSpend
    .filter((e) => e.source === source && e.date >= weekAgo)
    .reduce((sum, e) => sum + e.amount, 0);
  const jobs = s.jobs.filter((j) => j.source === source && j.createdAt >= `${weekAgo}T00:00:00`).length;
  if (spend === 0) return 0;
  return Math.round(spend / (jobs + 1));
}

/* ---------- The demo backend ---------- */

export const demoDB: PlatformDB = {
  kind: 'demo',

  async snapshot() {
    return ensureLoaded();
  },

  async createLead(input: NewLeadInput) {
    let created: Lead | null = null;
    mutate((s) => {
      const existing = s.customers.find((c) => c.phone === input.phone) ?? null;
      const lead: Lead = {
        id: uid('lead'),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        name: input.name,
        phone: input.phone,
        hasWhatsapp: input.hasWhatsapp,
        city: input.city,
        address: input.address,
        items: input.items,
        condition: input.condition,
        photos: input.photos,
        preferred: input.preferred,
        preferredDate: input.preferredDate,
        source: input.source,
        utm: input.utm,
        status: 'new',
        quotedPrice: null,
        agentId: null,
        followupAt: null,
        followupNote: '',
        answered: false,
        activities: [],
        customerId: existing?.id ?? null,
        jobId: null,
      };
      pushActivity(lead, 'system', existing ? 'ליד נכנס מהאתר — לקוח חוזר 🎉' : 'ליד נכנס מהאתר', 'system');
      s.leads = [lead, ...s.leads];
      created = lead;
    });
    if (!created) throw new Error('יצירת הליד נכשלה');
    return created;
  },

  async setLeadStatus(id, status, by) {
    mutate((s) => {
      const lead = requireLead(s, id);
      lead.status = status;
      pushActivity(lead, 'status', `סטטוס עודכן`, by);
    });
  },

  async addLeadActivity(id, kind, text, by) {
    mutate((s) => {
      const lead = requireLead(s, id);
      if (kind === 'call' && lead.status === 'new') lead.status = 'contacting';
      pushActivity(lead, kind, text, by);
    });
  },

  async setLeadQuote(id, price, by) {
    mutate((s) => {
      const lead = requireLead(s, id);
      lead.quotedPrice = price;
      lead.status = 'quote_sent';
      pushActivity(lead, 'quote', `נשלחה הצעת מחיר — ₪${price}`, by);
    });
  },

  async scheduleFollowup(id, at, note, by) {
    mutate((s) => {
      const lead = requireLead(s, id);
      lead.followupAt = at;
      lead.followupNote = note;
      if (at) {
        lead.status = 'followup';
        pushActivity(lead, 'followup', `נקבע Follow-up · ${note || 'ללא הערה'}`, by);
      } else {
        pushActivity(lead, 'followup', 'ה-Follow-up בוטל', by);
      }
    });
  },

  async assignAgent(id, agentId) {
    mutate((s) => {
      const lead = requireLead(s, id);
      lead.agentId = agentId;
      lead.updatedAt = nowIso();
    });
  },

  async markAnswered(id) {
    mutate((s) => {
      const lead = requireLead(s, id);
      lead.answered = true;
      lead.updatedAt = nowIso();
    });
  },

  async closeLead(id, input: CloseJobInput, by) {
    let created: Job | null = null;
    mutate((s) => {
      const lead = requireLead(s, id);

      // Upsert the customer profile by phone — repeat business is the asset.
      let customer = s.customers.find((c) => c.phone === lead.phone);
      if (customer) {
        customer.orders += 1;
        customer.totalSpent += input.customerPrice;
        customer.lastOrderAt = nowIso();
        customer.address = input.address || customer.address;
        customer.servicesUsed = [
          ...new Set([...customer.servicesUsed, ...input.items.map((i) => i.categoryId)]),
        ];
      } else {
        customer = {
          id: uid('cust'),
          createdAt: nowIso(),
          name: lead.name,
          phone: lead.phone,
          city: input.city,
          address: input.address,
          orders: 1,
          totalSpent: input.customerPrice,
          lastOrderAt: nowIso(),
          servicesUsed: input.items.map((i) => i.categoryId),
          lastProId: null,
          lastStars: null,
          loyaltyCredit: 0,
        };
        s.customers = [...s.customers, customer];
      }

      const city = cityById(input.city);
      const job: Job = {
        id: uid('job'),
        createdAt: nowIso(),
        updatedAt: nowIso(),
        leadId: lead.id,
        customerId: customer.id,
        customerName: lead.name,
        customerPhone: lead.phone,
        city: input.city,
        address: input.address,
        lat: city?.lat ?? 31.25,
        lng: city?.lng ?? 34.79,
        items: input.items,
        condition: lead.condition,
        photos: lead.photos,
        notes: input.notes,
        date: input.date,
        windowStart: input.windowStart,
        windowEnd: input.windowEnd,
        paymentMethod: input.paymentMethod,
        feeModel: input.feeModel,
        customerPrice: input.customerPrice,
        baseFee: input.baseFee,
        payoutAmount: input.feeModel === 'payout' ? input.payoutAmount : null,
        decaySteps:
          input.feeModel === 'fee' ? buildDecaySteps(input.baseFee, s.config.decay, false) : [],
        status: 'WAITING_FOR_PROFESSIONAL',
        statusHistory: [{ status: 'WAITING_FOR_PROFESSIONAL', at: nowIso(), by }],
        dispatchStartedAt: null,
        urgent: false,
        redispatchCount: 0,
        excludedProIds: [],
        assignedProId: null,
        assignedAt: null,
        purchaseFee: null,
        advertisingCost: advertisingCostFor(s, lead.source),
        paymentFee: input.paymentMethod === 'card' ? Math.round(input.customerPrice * 0.025) : 0,
        refunds: 0,
        discounts: 0,
        review: null,
        reviewRequestedAt: null,
        cancellation: null,
        source: lead.source,
        agentId: lead.agentId ?? by,
      };

      // Dispatch starts immediately: the job opens to wave 1.
      setJobStatus(job, 'OFFERED', 'system');
      job.dispatchStartedAt = nowIso();
      s.jobs = [job, ...s.jobs];

      lead.status = 'converted';
      lead.quotedPrice = input.customerPrice;
      lead.customerId = customer.id;
      lead.jobId = job.id;
      pushActivity(lead, 'system', `העבודה נסגרה ונשלחה למנקים — ₪${input.customerPrice}`, by);

      notifyPros(s, job, `🔥 עבודה חדשה ב${cityName(job.city)}`);
      created = job;
    });
    if (!created) throw new Error('סגירת העבודה נכשלה');
    return created;
  },

  async takeJob(jobId, proId) {
    let taken: Job | null = null;
    mutate((s) => {
      const job = requireJob(s, jobId);
      const pro = requirePro(s, proId);
      if (!OPEN_STATUSES.includes(job.status)) throw new Error('העבודה כבר נלקחה');
      if (!pro.approved) throw new Error('החשבון עדיין לא אושר');
      if (job.excludedProIds.includes(proId)) throw new Error('העבודה אינה זמינה עבורך');

      const fee = job.feeModel === 'fee' ? currentFee(job) : 0;
      const balance = walletBalance(s, proId);
      if (fee > 0 && balance - fee < s.config.dispatch.minBalance) {
        throw new Error(`אין מספיק יתרה בארנק (₪${balance}). טען ארנק כדי לקבל את העבודה.`);
      }

      if (fee > 0) {
        addTx(s, {
          proId,
          type: 'JOB_PURCHASE',
          amount: -fee,
          jobId: job.id,
          note: `רכישת עבודה — ${cityName(job.city)}`,
        });
      }

      setJobStatus(job, 'ACCEPTED', proId);
      setJobStatus(job, 'PROFESSIONAL_ASSIGNED', proId);
      job.assignedProId = proId;
      job.assignedAt = nowIso();
      job.purchaseFee = fee;

      pro.totalTaken += 1;
      pro.jobsLast7d += 1;

      const customer = s.customers.find((c) => c.id === job.customerId);
      if (customer) customer.lastProId = proId;

      taken = job;
    });
    if (!taken) throw new Error('קבלת העבודה נכשלה');
    return taken;
  },

  async advanceJob(jobId, status, by) {
    mutate((s) => {
      const job = requireJob(s, jobId);
      setJobStatus(job, status, by);
      if (status === 'COMPLETED') {
        job.reviewRequestedAt = nowIso();
        if (job.assignedProId) {
          const pro = requirePro(s, job.assignedProId);
          pro.completedJobs += 1;
        }
      }
    });
  },

  async cancelJob(jobId, by: Cancellation['by'], reason, actor) {
    mutate((s) => {
      const job = requireJob(s, jobId);
      const assignedProId = job.assignedProId;

      if (by === 'professional' && assignedProId) {
        // The pro backs out: no refund, his score suffers, and the job goes
        // straight back to the marketplace — urgent if the window is close.
        const pro = requirePro(s, assignedProId);
        pro.cancelledJobs += 1;

        job.cancellation = { by, reason, at: nowIso(), refunded: false };
        job.excludedProIds = [...job.excludedProIds, assignedProId];
        job.assignedProId = null;
        job.assignedAt = null;
        job.purchaseFee = null;
        job.redispatchCount += 1;

        const urgent = minutesToWindow(job) <= s.config.dispatch.urgentThresholdMinutes;
        job.urgent = urgent;
        if (job.feeModel === 'fee') {
          job.decaySteps = buildDecaySteps(job.baseFee, s.config.decay, urgent);
        }
        setJobStatus(job, 'WAITING_FOR_PROFESSIONAL', actor);
        setJobStatus(job, 'OFFERED', 'system');
        job.dispatchStartedAt = nowIso();
        notifyPros(s, job, urgent ? `🚨 עבודה דחופה ב${cityName(job.city)}` : `🔥 עבודה חזרה ללוח ב${cityName(job.city)}`);
        return;
      }

      // Customer/admin cancellation before execution refunds the pro's fee.
      setJobStatus(job, 'CANCELLED', actor);
      job.cancellation = { by, reason, at: nowIso(), refunded: false };
      const beforeDeparture = !['ON_THE_WAY', 'ARRIVED', 'IN_PROGRESS'].includes(
        job.statusHistory[job.statusHistory.length - 2]?.status ?? '',
      );
      if (assignedProId && job.purchaseFee && beforeDeparture) {
        addTx(s, {
          proId: assignedProId,
          type: 'REFUND',
          amount: job.purchaseFee,
          jobId: job.id,
          note: 'החזר — הלקוח ביטל לפני יציאה',
        });
        job.cancellation.refunded = true;
        setJobStatus(job, 'REFUNDED', 'system');
      }
    });
  },

  async redispatchJob(jobId) {
    mutate((s) => {
      const job = requireJob(s, jobId);
      setJobStatus(job, 'WAITING_FOR_PROFESSIONAL', 'admin');
      setJobStatus(job, 'OFFERED', 'system');
      job.assignedProId = null;
      job.assignedAt = null;
      job.purchaseFee = null;
      job.redispatchCount += 1;
      job.dispatchStartedAt = nowIso();
      notifyPros(s, job, `🔥 עבודה חזרה ללוח ב${cityName(job.city)}`);
    });
  },

  async submitReview(jobId, review: Omit<Review, 'at'>) {
    mutate((s) => {
      const job = requireJob(s, jobId);
      if (job.review) throw new Error('כבר נשלח דירוג לעבודה זו');
      job.review = { ...review, at: nowIso() };
      setJobStatus(job, 'CUSTOMER_CONFIRMED', 'customer');
      if (job.assignedProId) {
        const pro = requirePro(s, job.assignedProId);
        pro.rating =
          Math.round(((pro.rating * pro.ratingCount + review.stars) / (pro.ratingCount + 1)) * 10) / 10;
        pro.ratingCount += 1;
      }
      const customer = s.customers.find((c) => c.id === job.customerId);
      if (customer) {
        customer.lastStars = review.stars;
        // Loyalty credit for reviewing — nudges the next order through us.
        customer.loyaltyCredit += 25;
      }
    });
  },

  async registerPro(input: ProRegistration) {
    let created: Professional | null = null;
    mutate((s) => {
      const city = cityById(input.city);
      const pro: Professional = {
        id: uid('pro'),
        createdAt: nowIso(),
        name: input.name,
        phone: input.phone,
        businessName: input.businessName,
        businessType: input.businessType,
        city: input.city,
        areas: input.areas.length > 0 ? input.areas : [input.city],
        radiusKm: input.radiusKm,
        hasCar: input.hasCar,
        services: input.services,
        languages: input.languages,
        yearsExperience: input.yearsExperience,
        workPhotos: [],
        documents: [],
        approved: false,
        online: false,
        rating: 0,
        ratingCount: 0,
        completedJobs: 0,
        cancelledJobs: 0,
        totalTaken: 0,
        avgResponseSec: 120,
        jobsLast7d: 0,
        repeatCustomers: 0,
        complaintsCount: 0,
        onTimeRate: 0.9,
        lat: city?.lat ?? 31.25,
        lng: city?.lng ?? 34.79,
      };
      s.professionals = [...s.professionals, pro];
      s.notifications = [
        ...s.notifications,
        {
          id: uid('notif'),
          toRole: 'admin',
          toId: null,
          at: nowIso(),
          title: 'בעל מקצוע חדש ממתין לאישור',
          body: `${pro.name} · ${cityName(pro.city)}`,
          jobId: null,
          read: false,
        },
      ];
      created = pro;
    });
    if (!created) throw new Error('ההרשמה נכשלה');
    return created;
  },

  async updatePro(id, patch) {
    mutate((s) => {
      const pro = requirePro(s, id);
      Object.assign(pro, patch);
      s.professionals = [...s.professionals];
    });
  },

  async topUpWallet(proId, amount) {
    if (amount <= 0) throw new Error('סכום טעינה לא תקין');
    mutate((s) => {
      requirePro(s, proId);
      addTx(s, { proId, type: 'TOP_UP', amount, jobId: null, note: 'טעינת ארנק' });
    });
  },

  async openComplaint(jobId, category: ComplaintCategory, text) {
    mutate((s) => {
      const job = requireJob(s, jobId);
      s.complaints = [
        ...s.complaints,
        { id: uid('comp'), jobId, category, text, status: 'open', at: nowIso(), resolution: '' },
      ];
      if (job.assignedProId) requirePro(s, job.assignedProId).complaintsCount += 1;
    });
  },

  async resolveComplaint(id, resolution) {
    mutate((s) => {
      const c = s.complaints.find((x) => x.id === id);
      if (!c) throw new Error('התלונה לא נמצאה');
      c.status = 'resolved';
      c.resolution = resolution;
      s.complaints = [...s.complaints];
    });
  },

  async addAdSpend(entry: Omit<AdSpendEntry, 'id'>) {
    mutate((s) => {
      s.adSpend = [{ ...entry, id: uid('spend') }, ...s.adSpend];
    });
  },

  async updateConfig(patch: Partial<PlatformConfig>) {
    mutate((s) => {
      s.config = { ...s.config, ...patch };
    });
  },

  async markNotificationsRead(toId) {
    mutate((s) => {
      s.notifications = s.notifications.map((n) => (n.toId === toId ? { ...n, read: true } : n));
    });
  },
};

/**
 * The active backend. When Supabase env keys exist AND
 * NEXT_PUBLIC_PLATFORM_BACKEND=supabase, src/lib/platform/db/supabase.ts
 * takes over with the same interface; until then the demo backend serves
 * everything (docs/PLATFORM.md → "איפה מכניסים מפתחות").
 */
const useSupabase =
  process.env.NEXT_PUBLIC_PLATFORM_BACKEND === 'supabase' &&
  Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL);

/** After a remote mutation, re-pull the snapshot so subscribers see it. */
function withRefresh(base: PlatformDB): PlatformDB {
  return new Proxy(base, {
    get(target, prop) {
      const value = Reflect.get(target, prop);
      if (typeof value !== 'function' || prop === 'snapshot') return value;
      return async (...args: unknown[]) => {
        const result = await (value as (...a: unknown[]) => Promise<unknown>).apply(target, args);
        cache = await target.snapshot();
        notify();
        return result;
      };
    },
  }) as PlatformDB;
}

export const db: PlatformDB = useSupabase ? withRefresh(supabaseDB) : demoDB;

export const actions = db;

/* ---------- React bindings ---------- */

function subscribe(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

/** Live snapshot; null during SSR/first paint (render a skeleton). */
export function usePlatform(): Snapshot | null {
  const snap = useSyncExternalStore(
    subscribe,
    () => cache,
    () => null,
  );
  useEffect(() => {
    if (cache) return;
    if (db.kind === 'demo') {
      ensureLoaded();
      cache = { ...cache! };
      notify();
    } else {
      void db.snapshot().then((s) => {
        cache = s;
        notify();
      });
    }
  }, []);
  return snap;
}

/** Wipe the demo store and reseed — the "אפס דמו" button. */
export function resetDemo(): void {
  cache = buildDemoSnapshot();
  persist();
  notify();
}

/* ---------- Session (demo login-as) ---------- */

let sessionCache: Session | null | undefined;
const sessionListeners = new Set<() => void>();

function loadSession(): Session | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(SESSION_KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

export function useSession(): Session | null {
  const session = useSyncExternalStore(
    (fn) => {
      sessionListeners.add(fn);
      return () => sessionListeners.delete(fn);
    },
    () => {
      if (sessionCache === undefined) sessionCache = loadSession();
      return sessionCache ?? null;
    },
    () => null,
  );
  useEffect(() => {
    if (sessionCache === undefined) {
      sessionCache = loadSession();
      for (const fn of sessionListeners) fn();
    }
  }, []);
  return session;
}

export function loginAs(role: Role, userId: string | null, name: string): void {
  sessionCache = { role, userId, name };
  try {
    window.localStorage.setItem(SESSION_KEY, JSON.stringify(sessionCache));
  } catch {
    // In-memory session still works.
  }
  for (const fn of sessionListeners) fn();
}

export function logout(): void {
  sessionCache = null;
  try {
    window.localStorage.removeItem(SESSION_KEY);
  } catch {
    // Ignore.
  }
  for (const fn of sessionListeners) fn();
}
