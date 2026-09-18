/**
 * Shared shapes for the social publishing module. Everything here is plain
 * data that crosses the browser/server line, so no tokens ever appear in
 * these types — encrypted secrets live only in social_secrets and are
 * handled by src/lib/social/server/*.
 */

export const TIMEZONE = 'Asia/Jerusalem';

/** Extension point: add 'instagram' etc. by implementing a Channel adapter. */
export type Channel = 'facebook_page' | 'facebook_group_manual' | 'instagram';

export type PermissionStatus = 'ok' | 'missing_permissions' | 'manual_only' | 'revoked';

export interface SocialAccount {
  id: string;
  provider: 'facebook';
  provider_user_id: string;
  name: string;
  granted_scopes: string[];
  declined_scopes: string[];
  token_expires_at: string | null;
  connected_at: string;
  revoked_at: string | null;
  last_synced_at: string | null;
}

export interface SocialTarget {
  id: string;
  account_id: string | null;
  channel: Channel;
  external_id: string;
  name: string;
  url: string;
  tasks: string[];
  permission_status: PermissionStatus;
  can_api_publish: boolean;
  enabled: boolean;
  notes: string;
  last_synced_at: string | null;
  created_at: string;
}

export type Language = 'he' | 'ru';

export interface Campaign {
  id: string;
  name: string;
  service: string;
  city: string;
  language: Language | 'mixed';
  status: 'active' | 'paused' | 'archived';
  notes: string;
  created_at: string;
}

export interface MediaItem {
  kind: 'image' | 'video';
  url: string;
  path: string;
  name: string;
}

export type CtaType =
  | ''
  | 'CALL_NOW'
  | 'WHATSAPP_MESSAGE'
  | 'MESSAGE_PAGE'
  | 'LEARN_MORE'
  | 'GET_QUOTE'
  | 'BOOK_NOW'
  | 'SHOP_NOW'
  | 'SIGN_UP';

export interface Post {
  id: string;
  campaign_id: string | null;
  title: string;
  base_text: string;
  language: Language;
  link_url: string;
  cta_type: CtaType;
  phone: string;
  whatsapp_url: string;
  media: MediaItem[];
  status: 'draft' | 'ready' | 'archived';
  created_at: string;
  updated_at: string;
}

export type Approval = 'pending' | 'approved' | 'rejected';

export interface Variant {
  id: string;
  post_id: string;
  label: string;
  text: string;
  language: Language;
  approval: Approval;
  sort: number;
}

export type ScheduleMode = 'now' | 'once' | 'weekly' | 'interval';

/** "0" = Sunday … "6" = Saturday → list of "HH:MM" local times. */
export type WeeklyPlan = Record<string, string[]>;

export interface Schedule {
  id: string;
  post_id: string;
  mode: ScheduleMode;
  timezone: string;
  run_at: string | null;
  weekly: WeeklyPlan;
  interval_days: number | null;
  interval_time: string | null;
  target_ids: string[];
  active: boolean;
  planned_until: string | null;
  created_at: string;
}

export type QueueStatus =
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped'
  | 'manual_pending';

export interface QueueItem {
  id: string;
  schedule_id: string | null;
  post_id: string;
  variant_id: string | null;
  target_id: string;
  scheduled_at: string;
  status: QueueStatus;
  attempts: number;
  dedupe_hash: string;
  rendered_text: string;
  external_post_id: string | null;
  permalink: string | null;
  error: string | null;
  skip_reason: string | null;
  claimed_at: string | null;
  published_at: string | null;
  created_at: string;
}

export interface ActivityEntry {
  id: number;
  at: string;
  level: 'info' | 'warn' | 'error';
  event: string;
  message: string;
  meta: Record<string, unknown>;
}

export interface LimitsSettings {
  maxPerDay: number;
  maxPerTargetPerDay: number;
  minGapMinutes: number;
  dedupeDays: number;
}

export interface ControlSettings {
  paused: boolean;
  rateLimitedUntil: string | null;
}

export interface BusinessSettings {
  name: string;
  phone: string;
  whatsapp: string;
  cities: string[];
  services: string[];
}

export const DEFAULT_LIMITS: LimitsSettings = {
  maxPerDay: 6,
  maxPerTargetPerDay: 2,
  minGapMinutes: 45,
  dedupeDays: 14,
};

export const DEFAULT_BUSINESS: BusinessSettings = {
  name: 'הפתרון המבריק',
  phone: '053-5257250',
  whatsapp: '972535257250',
  cities: ['באר שבע', 'ערד'],
  services: ['ניקוי ספות וריפודים', 'ניקוי מזגנים'],
};

export const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = {
  scheduled: 'Scheduled · מתוזמן',
  publishing: 'Publishing · מפרסם',
  published: 'Published · פורסם',
  failed: 'Failed · נכשל',
  skipped: 'Skipped · דולג',
  manual_pending: 'ידני · ממתין לך',
};

export const PERMISSION_LABEL: Record<PermissionStatus, string> = {
  ok: 'מאושר לפרסום דרך API',
  missing_permissions: 'חסרות הרשאות',
  manual_only: 'פרסום ידני בלבד',
  revoked: 'החיבור בוטל',
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  facebook_page: 'דף פייסבוק',
  facebook_group_manual: 'קבוצת פייסבוק (ידני)',
  instagram: 'Instagram',
};

export const CTA_OPTIONS: { value: CtaType; label: string }[] = [
  { value: '', label: 'ללא כפתור' },
  { value: 'CALL_NOW', label: 'התקשר עכשיו' },
  { value: 'WHATSAPP_MESSAGE', label: 'שלח הודעת WhatsApp' },
  { value: 'MESSAGE_PAGE', label: 'שלח הודעה' },
  { value: 'GET_QUOTE', label: 'קבל הצעת מחיר' },
  { value: 'BOOK_NOW', label: 'הזמן עכשיו' },
  { value: 'LEARN_MORE', label: 'למידע נוסף' },
  { value: 'SHOP_NOW', label: 'קנה עכשיו' },
  { value: 'SIGN_UP', label: 'הרשמה' },
];

/** The minimal Meta permission set the module asks for. */
export const REQUIRED_SCOPES = ['pages_show_list', 'pages_read_engagement', 'pages_manage_posts'] as const;

export const WEEKDAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];
