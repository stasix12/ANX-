import { supabase } from '@/lib/supabase';

/**
 * Data layer for the cleaning-business CRM (/crm). Same access model as the
 * store's admin panel: the browser talks to Supabase directly with the anon
 * key, and Row Level Security (supabase/crm-schema.sql) is what actually
 * protects the data — the leads table accepts no reads or writes without a
 * signed-in admin session.
 */

export type LeadStatus = 'new' | 'pending' | 'scheduled' | 'on_way' | 'completed' | 'canceled';
export type LeadSource = 'google' | 'facebook' | 'instagram' | 'whatsapp' | 'other';

export interface Lead {
  id: string;
  name: string;
  phone: string;
  address: string;
  city: string;
  /** ISO date (YYYY-MM-DD) or null while the job has no scheduled day yet. */
  jobDate: string | null;
  /** HH:MM (24h) or null. */
  jobTime: string | null;
  services: string[];
  price: number | null;
  notes: string;
  source: LeadSource;
  status: LeadStatus;
  createdAt: string;
  updatedAt: string;
}

/** What the lead form edits — everything except server-assigned fields. */
export type LeadInput = Omit<Lead, 'id' | 'createdAt' | 'updatedAt'>;

export const SERVICE_OPTIONS = [
  'ניקוי ספה',
  'ניקוי ספה פינתית',
  'ניקוי מזרן',
  'ניקוי שטיח',
  'ניקוי כיסאות',
  'ניקוי רכב',
  'ניקוי מזגן',
  'אחר',
] as const;

export const STATUS_OPTIONS: {
  value: LeadStatus;
  label: string;
  /** Badge colors — solid enough to read at a glance on the dark surface. */
  badgeClass: string;
  /** Accent for the card's status edge. */
  dotClass: string;
}[] = [
  { value: 'new', label: 'חדש', badgeClass: 'bg-teal-500/15 text-teal-300', dotClass: 'bg-teal-400' },
  { value: 'pending', label: 'ממתין לאישור', badgeClass: 'bg-amber-500/15 text-amber-300', dotClass: 'bg-amber-400' },
  { value: 'scheduled', label: 'נקבע', badgeClass: 'bg-violet-500/15 text-violet-300', dotClass: 'bg-violet-400' },
  { value: 'on_way', label: 'בדרך ללקוח', badgeClass: 'bg-orange-500/15 text-orange-300', dotClass: 'bg-orange-400' },
  { value: 'completed', label: 'הושלם', badgeClass: 'bg-emerald-500/15 text-emerald-300', dotClass: 'bg-emerald-400' },
  { value: 'canceled', label: 'בוטל', badgeClass: 'bg-red-500/15 text-red-300', dotClass: 'bg-red-400' },
];

export const statusById = Object.fromEntries(STATUS_OPTIONS.map((s) => [s.value, s])) as Record<
  LeadStatus,
  (typeof STATUS_OPTIONS)[number]
>;

export const SOURCE_OPTIONS: { value: LeadSource; label: string }[] = [
  { value: 'google', label: 'Google' },
  { value: 'facebook', label: 'Facebook' },
  { value: 'instagram', label: 'Instagram' },
  { value: 'whatsapp', label: 'WhatsApp' },
  { value: 'other', label: 'אחר' },
];

export const sourceLabel = (source: LeadSource): string =>
  SOURCE_OPTIONS.find((s) => s.value === source)?.label ?? source;

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase לא מוגדר — חסרים משתני הסביבה NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return supabase;
}

/* eslint-disable @typescript-eslint/no-explicit-any */
function fromRow(row: any): Lead {
  return {
    id: row.id,
    name: row.name,
    phone: row.phone ?? '',
    address: row.address ?? '',
    city: row.city ?? '',
    jobDate: row.job_date ?? null,
    // Postgres returns time as HH:MM:SS — trim the seconds nobody entered.
    jobTime: row.job_time ? String(row.job_time).slice(0, 5) : null,
    services: row.services ?? [],
    price: row.price === null || row.price === undefined ? null : Number(row.price),
    notes: row.notes ?? '',
    source: row.source ?? 'other',
    status: row.status ?? 'new',
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toRow(input: LeadInput) {
  return {
    name: input.name.trim(),
    phone: input.phone.trim(),
    address: input.address.trim(),
    city: input.city.trim(),
    job_date: input.jobDate || null,
    job_time: input.jobTime || null,
    services: input.services,
    price: input.price,
    notes: input.notes.trim(),
    source: input.source,
    status: input.status,
  };
}

/** Every lead, scheduled ones first (soonest date, then time), unscheduled by recency. */
export async function listLeads(): Promise<Lead[]> {
  const client = requireSupabase();
  const { data, error } = await client
    .from('leads')
    .select()
    .order('job_date', { ascending: true, nullsFirst: false })
    .order('job_time', { ascending: true, nullsFirst: false })
    .order('created_at', { ascending: false });
  if (error) throw new Error(error.message);
  return (data ?? []).map(fromRow);
}

export async function getLead(id: string): Promise<Lead | null> {
  const client = requireSupabase();
  const { data, error } = await client.from('leads').select().eq('id', id).maybeSingle();
  if (error) throw new Error(error.message);
  return data ? fromRow(data) : null;
}

export async function createLead(input: LeadInput): Promise<Lead> {
  const client = requireSupabase();
  const { data, error } = await client.from('leads').insert(toRow(input)).select().single();
  if (error || !data) throw new Error(error?.message ?? 'שמירת הליד נכשלה');
  return fromRow(data);
}

export async function updateLead(id: string, input: LeadInput): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('leads').update(toRow(input)).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setLeadStatus(id: string, status: LeadStatus): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('leads').update({ status }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteLead(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('leads').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

/** Previous jobs of the same customer, matched by phone number. */
export async function listLeadsByPhone(phone: string, excludeId?: string): Promise<Lead[]> {
  const trimmed = phone.trim();
  if (!trimmed) return [];
  const client = requireSupabase();
  let query = client
    .from('leads')
    .select()
    .eq('phone', trimmed)
    .order('job_date', { ascending: false, nullsFirst: false });
  if (excludeId) query = query.neq('id', excludeId);
  const { data, error } = await query;
  if (error) throw new Error(error.message);
  return (data ?? []).map(fromRow);
}

/* ---------------------------------------------------------------- dates --- */

/** Local-time ISO date (YYYY-MM-DD) — toISOString() would shift the day near midnight. */
export function toISODate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, '0');
  const d = String(date.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

export function todayISO(): string {
  return toISODate(new Date());
}

export function addDaysISO(iso: string, days: number): string {
  const date = new Date(`${iso}T12:00:00`);
  date.setDate(date.getDate() + days);
  return toISODate(date);
}

/** Sunday-based week containing the given day — the Israeli work week. */
export function weekRangeISO(iso: string): { start: string; end: string } {
  const date = new Date(`${iso}T12:00:00`);
  const start = addDaysISO(iso, -date.getDay());
  return { start, end: addDaysISO(start, 6) };
}

export function formatDateHe(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('he-IL', {
    day: 'numeric',
    month: 'numeric',
    year: 'numeric',
  });
}

export function formatDateLongHe(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('he-IL', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
  });
}

export function formatPrice(price: number | null): string {
  if (price === null) return '—';
  return `₪${price.toLocaleString('he-IL')}`;
}

/* ---------------------------------------------------------- action links --- */

/** 05X-XXXXXXX → 9725XXXXXXXX, as wa.me expects; leaves non-Israeli numbers alone. */
export function toWhatsAppNumber(phone: string): string {
  const digits = phone.replace(/\D/g, '');
  if (digits.startsWith('0')) return `972${digits.slice(1)}`;
  return digits;
}

export function whatsAppUrl(phone: string): string {
  return `https://wa.me/${toWhatsAppNumber(phone)}`;
}

export function telUrl(phone: string): string {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

export function wazeUrl(address: string, city: string): string {
  const query = [address, city].filter(Boolean).join(', ');
  return `https://waze.com/ul?q=${encodeURIComponent(query)}&navigate=yes`;
}
