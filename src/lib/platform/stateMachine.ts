import type { JobStatus, LeadStatus } from './types';

/**
 * The one transition map both the UI and the demo store enforce (and the SQL
 * schema mirrors in a trigger — supabase/platform-schema.sql). A transition
 * that is not listed here throws, so no screen can move a job sideways.
 *
 * The lead phase of the full funnel (LEAD → CONTACTED → QUOTE_SENT → CLOSED
 * → JOB_CREATED) lives on Lead.status below; Job.status starts at
 * WAITING_FOR_PROFESSIONAL, which is what JOB_CREATED immediately becomes.
 */
export const JOB_TRANSITIONS: Record<JobStatus, JobStatus[]> = {
  WAITING_FOR_PROFESSIONAL: ['OFFERED', 'CANCELLED'],
  OFFERED: ['ACCEPTED', 'WAITING_FOR_PROFESSIONAL', 'CANCELLED'],
  ACCEPTED: ['PROFESSIONAL_ASSIGNED', 'CANCELLED'],
  PROFESSIONAL_ASSIGNED: ['ON_THE_WAY', 'WAITING_FOR_PROFESSIONAL', 'CANCELLED'],
  ON_THE_WAY: ['ARRIVED', 'WAITING_FOR_PROFESSIONAL', 'CANCELLED'],
  ARRIVED: ['IN_PROGRESS', 'CANCELLED'],
  IN_PROGRESS: ['COMPLETED', 'CANCELLED'],
  COMPLETED: ['CUSTOMER_CONFIRMED'],
  CUSTOMER_CONFIRMED: [],
  CANCELLED: ['REFUNDED', 'WAITING_FOR_PROFESSIONAL'],
  REFUNDED: [],
};

export const canTransition = (from: JobStatus, to: JobStatus): boolean =>
  JOB_TRANSITIONS[from]?.includes(to) ?? false;

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`מעבר סטטוס לא חוקי: ${from} → ${to}`);
  }
}

/** Statuses in which the job still needs a professional (marketplace-visible). */
export const OPEN_STATUSES: JobStatus[] = ['WAITING_FOR_PROFESSIONAL', 'OFFERED'];

/** Statuses in which a professional currently owns the job. */
export const ACTIVE_STATUSES: JobStatus[] = [
  'PROFESSIONAL_ASSIGNED',
  'ON_THE_WAY',
  'ARRIVED',
  'IN_PROGRESS',
];

export const DONE_STATUSES: JobStatus[] = ['COMPLETED', 'CUSTOMER_CONFIRMED'];

export const JOB_STATUS_LABELS: Record<JobStatus, string> = {
  WAITING_FOR_PROFESSIONAL: 'ממתינה למנקה',
  OFFERED: 'הוצעה למנקים',
  ACCEPTED: 'התקבלה',
  PROFESSIONAL_ASSIGNED: 'שויכה למנקה',
  ON_THE_WAY: 'בדרך ללקוח',
  ARRIVED: 'הגיע ללקוח',
  IN_PROGRESS: 'בעבודה',
  COMPLETED: 'הושלמה',
  CUSTOMER_CONFIRMED: 'אושרה ע״י הלקוח',
  CANCELLED: 'בוטלה',
  REFUNDED: 'הוחזר תשלום',
};

/** The professional's forward path — what the "advance" button offers next. */
export const PRO_NEXT_STATUS: Partial<Record<JobStatus, { next: JobStatus; label: string }>> = {
  PROFESSIONAL_ASSIGNED: { next: 'ON_THE_WAY', label: 'יצאתי לדרך' },
  ON_THE_WAY: { next: 'ARRIVED', label: 'הגעתי ללקוח' },
  ARRIVED: { next: 'IN_PROGRESS', label: 'התחלתי לעבוד' },
  IN_PROGRESS: { next: 'COMPLETED', label: 'סיימתי את העבודה' },
};

/* ---------- Lead pipeline ---------- */

export const LEAD_STATUS_META: {
  value: LeadStatus;
  label: string;
  badgeClass: string;
}[] = [
  { value: 'new', label: 'ליד חדש', badgeClass: 'bg-sky-500/15 text-sky-700' },
  { value: 'contacting', label: 'ניסיון יצירת קשר', badgeClass: 'bg-indigo-500/15 text-indigo-700' },
  { value: 'no_answer', label: 'אין מענה', badgeClass: 'bg-slate-500/15 text-slate-600' },
  { value: 'in_call', label: 'בשיחה', badgeClass: 'bg-violet-500/15 text-violet-700' },
  { value: 'quote_sent', label: 'הצעת מחיר נשלחה', badgeClass: 'bg-cyan-600/15 text-cyan-700' },
  { value: 'interested', label: 'מעוניין', badgeClass: 'bg-teal-500/15 text-teal-700' },
  { value: 'followup', label: 'Follow-up', badgeClass: 'bg-amber-500/15 text-amber-700' },
  { value: 'closed', label: 'נסגר', badgeClass: 'bg-emerald-500/15 text-emerald-700' },
  { value: 'converted', label: 'הפך לעבודה', badgeClass: 'bg-emerald-600/20 text-emerald-800' },
  { value: 'not_relevant', label: 'לא רלוונטי', badgeClass: 'bg-stone-500/15 text-stone-600' },
  { value: 'lost', label: 'אבוד', badgeClass: 'bg-red-500/15 text-red-700' },
];

export const leadStatusMeta = (s: LeadStatus) =>
  LEAD_STATUS_META.find((m) => m.value === s) ?? LEAD_STATUS_META[0];

/** Pipeline stages an agent can still work — everything before a terminal state. */
export const OPEN_LEAD_STATUSES: LeadStatus[] = [
  'new',
  'contacting',
  'no_answer',
  'in_call',
  'quote_sent',
  'interested',
  'followup',
  'closed',
];
