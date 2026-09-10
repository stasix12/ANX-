import { supabase } from '@/lib/supabase';
import { cityById } from '../catalog';
import type {
  Job,
  Lead,
  PlatformConfig,
  Professional,
  Snapshot,
} from '../types';
import type { PlatformDB } from './adapter';

/**
 * Supabase backend — the same PlatformDB contract the demo implements, over
 * PostgreSQL (supabase/platform-schema.sql). Operational tables carry typed
 * key columns for RLS/queries plus the full entity in a `data` jsonb column,
 * so both backends speak identical entity shapes. Money and status paths go
 * through SECURITY DEFINER RPCs — the server, not the browser, checks the
 * wallet balance, locks the job row and validates the state machine.
 *
 * Activation: set NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY
 * in .env.local, run supabase/platform-schema.sql (and optionally
 * platform-seed.sql), create Auth users, then set
 * NEXT_PUBLIC_PLATFORM_BACKEND=supabase.
 */

function client() {
  if (!supabase) {
    throw new Error(
      'Supabase לא מוגדר — חסרים NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY ב-.env.local',
    );
  }
  return supabase;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
const rows = <T>(res: { data: any; error: any }): T[] => {
  if (res.error) throw new Error(res.error.message);
  return ((res.data ?? []) as { data: T }[]).map((r) => r.data);
};

const one = <T>(res: { data: any; error: any }): T => {
  if (res.error) throw new Error(res.error.message);
  return res.data as T;
};

/** Read-modify-write on a row's jsonb entity (non-critical edits only). */
async function patchEntity<T>(table: string, id: string, fn: (entity: T) => void, keyCols: (entity: T) => Record<string, unknown>) {
  const db = client();
  const res = await db.from(table).select('data').eq('id', id).single();
  if (res.error) throw new Error(res.error.message);
  const entity = res.data.data as T;
  fn(entity);
  const upd = await db.from(table).update({ data: entity, ...keyCols(entity) }).eq('id', id);
  if (upd.error) throw new Error(upd.error.message);
}

const leadKeys = (l: Lead) => ({ phone: l.phone, status: l.status, city: l.city });
const proKeys = (p: Professional) => ({ approved: p.approved, online: p.online, city: p.city });

const uid = (prefix: string): string =>
  `${prefix}-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

export const supabaseDB: PlatformDB = {
  kind: 'supabase',

  async snapshot(): Promise<Snapshot> {
    const db = client();
    const [leads, jobs, pros, txs, customers, complaints, notifications, adSpend, agents, config] =
      await Promise.all([
        db.from('platform_leads').select('data').order('created_at', { ascending: false }),
        db.from('platform_jobs').select('data').order('created_at', { ascending: false }),
        db.from('platform_professionals').select('data'),
        db.from('platform_wallet_txs').select('data').order('created_at', { ascending: true }),
        db.from('platform_customers').select('data'),
        db.from('platform_complaints').select('data'),
        db.from('platform_notifications').select('data').order('created_at', { ascending: false }),
        db.from('platform_ad_spend').select('data'),
        db.from('platform_users').select('data'),
        db.from('platform_config').select('data').eq('id', 'main').single(),
      ]);
    return {
      leads: rows(leads),
      jobs: rows(jobs),
      professionals: rows(pros),
      walletTxs: rows(txs),
      customers: rows(customers),
      complaints: rows(complaints),
      notifications: rows(notifications),
      adSpend: rows(adSpend),
      agents: rows(agents),
      config: one<{ data: PlatformConfig }>(config).data,
    };
  },

  async createLead(input) {
    const db = client();
    const now = new Date().toISOString();
    const lead: Lead = {
      id: uid('lead'),
      createdAt: now,
      updatedAt: now,
      ...input,
      status: 'new',
      quotedPrice: null,
      agentId: null,
      followupAt: null,
      followupNote: '',
      answered: false,
      activities: [{ id: uid('act'), at: now, kind: 'system', text: 'ליד נכנס מהאתר', by: 'system' }],
      customerId: null,
      jobId: null,
    };
    const res = await db
      .from('platform_leads')
      .insert({ id: lead.id, created_at: now, ...leadKeys(lead), data: lead });
    if (res.error) throw new Error(res.error.message);
    return lead;
  },

  async setLeadStatus(id, status, by) {
    await patchEntity<Lead>('platform_leads', id, (l) => {
      l.status = status;
      l.updatedAt = new Date().toISOString();
      l.activities.push({ id: uid('act'), at: l.updatedAt, kind: 'status', text: 'סטטוס עודכן', by });
    }, leadKeys);
  },

  async addLeadActivity(id, kind, text, by) {
    await patchEntity<Lead>('platform_leads', id, (l) => {
      if (kind === 'call' && l.status === 'new') l.status = 'contacting';
      l.updatedAt = new Date().toISOString();
      l.activities.push({ id: uid('act'), at: l.updatedAt, kind, text, by });
    }, leadKeys);
  },

  async setLeadQuote(id, price, by) {
    await patchEntity<Lead>('platform_leads', id, (l) => {
      l.quotedPrice = price;
      l.status = 'quote_sent';
      l.updatedAt = new Date().toISOString();
      l.activities.push({ id: uid('act'), at: l.updatedAt, kind: 'quote', text: `נשלחה הצעת מחיר — ₪${price}`, by });
    }, leadKeys);
  },

  async scheduleFollowup(id, at, note, by) {
    await patchEntity<Lead>('platform_leads', id, (l) => {
      l.followupAt = at;
      l.followupNote = note;
      if (at) l.status = 'followup';
      l.updatedAt = new Date().toISOString();
      l.activities.push({ id: uid('act'), at: l.updatedAt, kind: 'followup', text: at ? `נקבע Follow-up · ${note || 'ללא הערה'}` : 'ה-Follow-up בוטל', by });
    }, leadKeys);
  },

  async assignAgent(id, agentId) {
    await patchEntity<Lead>('platform_leads', id, (l) => {
      l.agentId = agentId;
      l.updatedAt = new Date().toISOString();
    }, leadKeys);
  },

  async markAnswered(id) {
    await patchEntity<Lead>('platform_leads', id, (l) => {
      l.answered = true;
      l.updatedAt = new Date().toISOString();
    }, leadKeys);
  },

  async closeLead(id, input, by) {
    const db = client();
    const city = cityById(input.city);
    const res = await db.rpc('platform_close_lead', {
      p_lead_id: id,
      p_input: { ...input, lat: city?.lat ?? null, lng: city?.lng ?? null },
      p_by: by,
    });
    return one<Job>(res);
  },

  async takeJob(jobId, proId) {
    const res = await client().rpc('platform_take_job', { p_job_id: jobId, p_pro_id: proId });
    return one<Job>(res);
  },

  async advanceJob(jobId, status, by) {
    const res = await client().rpc('platform_advance_job', { p_job_id: jobId, p_status: status, p_by: by });
    if (res.error) throw new Error(res.error.message);
  },

  async cancelJob(jobId, by, reason, actor) {
    const res = await client().rpc('platform_cancel_job', { p_job_id: jobId, p_by: by, p_reason: reason, p_actor: actor });
    if (res.error) throw new Error(res.error.message);
  },

  async redispatchJob(jobId) {
    const res = await client().rpc('platform_redispatch_job', { p_job_id: jobId });
    if (res.error) throw new Error(res.error.message);
  },

  async submitReview(jobId, review) {
    const res = await client().rpc('platform_submit_review', { p_job_id: jobId, p_review: review });
    if (res.error) throw new Error(res.error.message);
  },

  async registerPro(input) {
    const db = client();
    const now = new Date().toISOString();
    const city = cityById(input.city);
    const pro: Professional = {
      id: uid('pro'),
      createdAt: now,
      ...input,
      areas: input.areas.length > 0 ? input.areas : [input.city],
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
    const res = await db
      .from('platform_professionals')
      .insert({ id: pro.id, created_at: now, ...proKeys(pro), data: pro });
    if (res.error) throw new Error(res.error.message);
    return pro;
  },

  async updatePro(id, patch) {
    await patchEntity<Professional>('platform_professionals', id, (p) => {
      Object.assign(p, patch);
    }, proKeys);
  },

  async topUpWallet(proId, amount) {
    const res = await client().rpc('platform_wallet_topup', { p_pro_id: proId, p_amount: amount });
    if (res.error) throw new Error(res.error.message);
  },

  async openComplaint(jobId, category, text) {
    const db = client();
    const c = { id: uid('comp'), jobId, category, text, status: 'open', at: new Date().toISOString(), resolution: '' };
    const res = await db.from('platform_complaints').insert({ id: c.id, job_id: jobId, status: c.status, data: c });
    if (res.error) throw new Error(res.error.message);
  },

  async resolveComplaint(id, resolution) {
    await patchEntity<{ status: string; resolution: string }>('platform_complaints', id, (c) => {
      c.status = 'resolved';
      c.resolution = resolution;
    }, (c) => ({ status: c.status }));
  },

  async addAdSpend(entry) {
    const db = client();
    const full = { ...entry, id: uid('spend') };
    const res = await db.from('platform_ad_spend').insert({ id: full.id, date: full.date, source: full.source, data: full });
    if (res.error) throw new Error(res.error.message);
  },

  async updateConfig(patch) {
    const db = client();
    const res = await db.from('platform_config').select('data').eq('id', 'main').single();
    if (res.error) throw new Error(res.error.message);
    const next = { ...(res.data.data as PlatformConfig), ...patch };
    const upd = await db.from('platform_config').update({ data: next }).eq('id', 'main');
    if (upd.error) throw new Error(upd.error.message);
  },

  async markNotificationsRead(toId) {
    const db = client();
    const res = await db.rpc('platform_mark_notifications_read', { p_to_id: toId });
    if (res.error) throw new Error(res.error.message);
  },
};
