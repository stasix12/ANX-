/**
 * Shared shapes for the social publishing module. Everything here is plain
 * data that crosses the browser/server line, so no tokens ever appear in
 * these types — encrypted secrets live only in social_secrets and are
 * handled by src/lib/social/server/*.
 */

export const TIMEZONE = 'Asia/Jerusalem';

/** Extension point: add 'instagram' etc. by implementing a Channel adapter. */
/** facebook_group = published by the local Playwright worker (no Meta API exists). */
/*
 * Facebook Pages are no longer a channel here. The business never connected
 * one and never published to one, and carrying the type kept a second
 * publishing path alive across a dozen files — a "pages vs groups" split on
 * every screen that showed a target. Groups are the product.
 */
export type Channel = 'facebook_group' | 'facebook_group_manual' | 'instagram';

export type PermissionStatus = 'ok' | 'missing_permissions' | 'manual_only' | 'revoked' | 'browser';


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
  last_published_at?: string | null;
  last_status?: string;
  last_error?: string;
  /** Group/page picture, copied into our own storage by the worker (Facebook CDN links expire). */
  image_url?: string;
  /** Auto-detected from the name (src/lib/social/cities.ts); editable. */
  city?: string;
  /** Starred by the owner — surfaces first in pickers and filters. */
  favorite?: boolean;
  /** Free-form grouping ("לוחות מכירה", "קהילתי"…). */
  category?: string;
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
  /**
   * A comment to leave on this round's posts, when the owner asks for it.
   *
   * On the ROUND rather than in settings, because it is about this round: the
   * offer these posts carry, the price list that goes with them. A global
   * setting would put last month's wording under this month's posts.
   */
  comment_text?: string;
  comment_media?: MediaItem[];
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

export type ScheduleMode = 'now' | 'once' | 'weekly' | 'interval' | 'drip';

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
  /** drip: how many targets per day (0/null = as many as the window allows), inside [drip_window_start, drip_window_end] local time. */
  drip_per_day?: number | null;
  /** drip: minutes between two consecutive posts. */
  drip_gap_minutes?: number | null;
  drip_window_start?: string;
  drip_window_end?: string;
  target_ids: string[];
  /** rotate = A→B→C per target over time; distribute = spread approved variants across targets; fixed = variant_map only. */
  variant_strategy?: VariantStrategy;
  variant_map?: Record<string, string>;
  require_confirmation?: boolean;
  active: boolean;
  planned_until: string | null;
  created_at: string;
}

export type VariantStrategy = 'rotate' | 'distribute' | 'fixed';

export type QueueStatus =
  | 'scheduled'
  | 'publishing'
  | 'published'
  | 'failed'
  | 'skipped'
  | 'manual_pending'
  | 'needs_attention'
  | 'awaiting_confirmation'
  | 'paused';

/** Fine-grained progress the browser worker reports while a job runs. */
export type QueueStep =
  | ''
  | 'pending'
  | 'opening'
  | 'composer_opened'
  | 'uploading_media'
  | 'ready_to_publish'
  | 'publishing'
  | 'verifying'
  | 'published'
  | 'failed'
  | 'needs_attention';

/**
 * Hebrew only. This string is the live status line of a publication in flight,
 * and it is rendered as plain text — so every glyph in it was also part of the
 * row's accessible name, and a screen reader read a row out as "hourglass with
 * flowing sand, מפרסם". The colour is carried independently by the row's tone
 * class and the status pill's dot, so the emoji were decoration inside a
 * sentence. Four other legends in this module had the same set removed for the
 * same reason; this one was missed.
 */
export const QUEUE_STEP_LABEL: Record<QueueStep, string> = {
  '': '',
  pending: 'ממתין',
  opening: 'פותח את הקבוצה',
  composer_opened: 'חלון הפוסט נפתח',
  uploading_media: 'מעלה מדיה',
  ready_to_publish: 'מוכן לפרסום',
  publishing: 'מפרסם',
  verifying: 'מאמת',
  published: 'פורסם',
  failed: 'נכשל',
  needs_attention: 'דורש טיפול',
};

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
  step?: QueueStep;
  step_at?: string | null;
  worker_id?: string | null;
  screenshot_path?: string | null;
  require_confirmation?: boolean;
  confirmed_at?: string | null;
  campaign_id?: string | null;
  /** How this row was published: Graph API, local browser worker, or by hand. */
  method?: PublishMethod;
  /*
   * HOW THIS POST DID, read off the post's own page by the worker.
   *
   * Every one is NULLABLE and that is load-bearing: null means Facebook did
   * not state it, or nobody has looked yet. Zero means it stated zero. A
   * screen that flattens the two reports "nobody cared" about a post it simply
   * has not read, which is the kind of number a customer acts on.
   *
   * There is no reach here. Facebook puts none on a group post and Meta closed
   * the Groups API in April 2024, so an audience figure could only come from
   * the group's member count — a guess wearing the clothes of a measurement.
   */
  metrics_seen?: number | null;
  metrics_views?: number | null;
  metrics_reactions?: number | null;
  metrics_comments?: number | null;
  metrics_shares?: number | null;
  metrics_at?: string | null;
  /**
   * '' | 'pending' | 'done' | 'failed' — whether a comment was ASKED FOR on
   * this post, and what became of it.
   *
   * Four states, not a boolean. "Nobody asked" and "asked and could not" are
   * opposite facts about a post that is already live and cannot be taken back,
   * and a screen that showed them alike would have the owner believing a phone
   * number is under a post where it is not.
   */
  comment_status?: string;
  comment_at?: string | null;
  created_at: string;
}

export type PublishMethod = '' | 'api' | 'browser' | 'manual';

export const METHOD_LABEL: Record<PublishMethod, string> = {
  '': '—',
  api: 'API',
  browser: 'דפדפן',
  manual: 'ידני',
};

/** Per-campaign rollup used by the campaigns screen and the dashboard. */
/**
 * One campaign's rows, counted once each. The buckets come from the single
 * classification in status.ts, so this partitions `total` exactly:
 *
 *   total = published + failed + skipped + scheduled + running + manual
 *
 * There is deliberately no field called "done". That word was doing two jobs —
 * "finished" and "succeeded" — and the screens rendered the first as if it
 * meant the second, so a run that skipped everything read "84 מתוך 84 הושלמו".
 * `published` is what succeeded; `finished` is what will not change again.
 */
export interface CampaignProgress {
  total: number;
  published: number;
  failed: number;
  skipped: number;
  /** Waiting on the clock: 'scheduled' (and legacy 'paused'). */
  scheduled: number;
  /** In flight: a worker is holding it right now. */
  running: number;
  /** Waiting on a person: awaiting_confirmation, manual_pending, needs_attention. */
  manual: number;
  /** published + failed + skipped — everything that will not change again. */
  finished: number;
}

export const EMPTY_PROGRESS: CampaignProgress = {
  total: 0,
  published: 0,
  failed: 0,
  skipped: 0,
  scheduled: 0,
  running: 0,
  manual: 0,
  finished: 0,
};

export type WorkerStatus = 'online' | 'needs_attention' | 'offline';
export type BrowserState = 'connected' | 'needs_auth' | 'disconnected' | 'unknown';

export interface SocialWorker {
  id: string;
  name: string;
  status: WorkerStatus;
  browser_state: BrowserState;
  attention_message: string;
  current_job_id: string | null;
  debug_mode: boolean;
  version: string;
  host: string;
  last_seen_at: string | null;
  /*
   * The Facebook account this worker's browser profile is signed in as.
   *
   * `browser_state` says the session WORKS; these say WHOSE it is, which on a
   * shared machine is a different question with a different answer. The id
   * comes from the c_user cookie and is reliable; the name and avatar are read
   * from the page and are empty when it did not yield them — the screen shows
   * what is there and never fills a gap with a guess.
   */
  fb_user_id?: string;
  fb_user_name?: string;
  fb_avatar_url?: string;
  /*
   * Facebook is mid-login and asking a person something.
   *
   * It exists so that person does not have to be standing at the machine. The
   * worker photographs whatever the page is showing and puts it here; the
   * account screen renders it through a signed URL and sends back what was
   * typed. Empty whenever no question is open — a resolved challenge must not
   * keep asking.
   */
  login_stage?: string;
  login_shot?: string;
  login_asked_at?: string | null;
}

export type WorkerCommandName = 'login' | 'check' | 'logout' | 'resume' | 'verify';

export interface WorkerCommand {
  id: string;
  worker_id: string | null;
  command: WorkerCommandName;
  status: 'pending' | 'running' | 'done' | 'failed';
  result: string;
  created_at: string;
  finished_at: string | null;
}

export interface BrowserSettings {
  /** Headed Playwright so the owner can watch every step. */
  debugMode: boolean;
  /** One group at a time, confirmation forced — for the first runs. */
  testMode: boolean;
  /** Pause right before the final "Post" click until the dashboard approves. */
  requireConfirmation: boolean;
  concurrentJobs: number;
  maxPerCampaignPerDay: number;
  /** Extra spacing between two group posts, on top of the global gap. */
  groupMinGapMinutes: number;
}

export const DEFAULT_BROWSER: BrowserSettings = {
  debugMode: true,
  testMode: true,
  requireConfirmation: true,
  concurrentJobs: 1,
  maxPerCampaignPerDay: 8,
  groupMinGapMinutes: 20,
};

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
  /**
   * Whether one post may reach the same group only once, ever.
   *
   * rules.ts has always enforced this with no time window at all: a post that
   * published to a group in 2025 is refused there forever. That is the right
   * default — republishing identical content to the same group is exactly what
   * Facebook's spam detection looks for, and group publishing runs through the
   * owner's own browser session, so the account at risk is theirs. But it is a
   * judgement, not a law, and an owner who reworks the same seasonal offer
   * every month had no way to say so.
   *
   * Off leaves `dedupeDays` as the only guard, which IS time-boxed and still
   * catches an unchanged text. Defaulted true so every existing settings row,
   * which has no such key, keeps the behaviour it has today.
   */
  blockRepeatToSameTarget: boolean;
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
  blockRepeatToSameTarget: true,
};

/**
 * The FALLBACK business details — what `getBusiness()` returns for a key the
 * stored settings row does not carry. Every field here is blank on purpose.
 *
 * getSetting() merges `{ ...fallback, ...row.value }`, so anything left in this
 * object is published under the owner's name whenever their own row is missing
 * that key. It used to hold one specific business's real phone number and
 * WhatsApp link, which meant a settings row saved with a phone but no whatsapp
 * (or a fresh install that had not been through the settings screen) sent posts
 * out carrying one business's phone beside another's WhatsApp — two different
 * businesses on one Facebook post, with no way to notice from the editor.
 *
 * A contact detail nobody typed is invented data, so there is none here.
 * renderPostText() (./compose.ts) already omits an empty phone or WhatsApp
 * line, so a blank fallback publishes the body alone rather than someone
 * else's number, and the settings screen is where real values come from.
 */
export const DEFAULT_BUSINESS: BusinessSettings = {
  name: '',
  phone: '',
  whatsapp: '',
  cities: [],
  services: [],
};

export const QUEUE_STATUS_LABEL: Record<QueueStatus, string> = {
  scheduled: 'Scheduled · מתוזמן',
  publishing: 'Publishing · מפרסם',
  published: 'Published · פורסם',
  failed: 'Failed · נכשל',
  skipped: 'Skipped · דולג',
  manual_pending: 'ידני · ממתין לך',
  needs_attention: 'Needs attention · דורש טיפול',
  awaiting_confirmation: 'ממתין לאישור סופי',
  paused: 'Paused · מושהה',
};

export const PERMISSION_LABEL: Record<PermissionStatus, string> = {
  ok: 'מאושר לפרסום דרך API',
  missing_permissions: 'חסרות הרשאות',
  manual_only: 'פרסום ידני בלבד',
  revoked: 'החיבור בוטל',
  browser: 'פרסום דרך הדפדפן (worker מקומי)',
};

export const CHANNEL_LABEL: Record<Channel, string> = {
  facebook_group: 'קבוצת פייסבוק',
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

export const WEEKDAYS_HE = ['ראשון', 'שני', 'שלישי', 'רביעי', 'חמישי', 'שישי', 'שבת'];

/** Seconds without a heartbeat after which a worker counts as offline. */
export const WORKER_OFFLINE_AFTER_SECONDS = 90;

/** Parses any facebook.com/groups/… URL into its id or slug. */
/**
 * A group ADDRESS THAT IS NOT ONE YET.
 *
 * Facebook's own app, on "העתק קישור", hands back
 * https://www.facebook.com/share/g/<token> — a redirect, not a group address.
 * parseGroupUrl refuses it, correctly: it is the guard that stops an arbitrary
 * facebook.com path reaching a browser carrying a live session, and loosening
 * it would be loosening that. So the link is accepted here as a PENDING one
 * instead, and the worker — which has a browser and can follow the redirect —
 * turns it into a real group address before anything is ever published to it.
 *
 * The marker is the external_id prefix rather than a new column: a row nobody
 * has resolved yet cannot be mistaken for a group, by this code or by a query.
 */
export const PENDING_SHARE_PREFIX = 'share:';

export function parseGroupShareUrl(input: string): { url: string; externalId: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/(^|\.)facebook\.com$|(^|\.)fb\.com$/i.test(url.hostname)) return null;
  const m = url.pathname.match(/^\/share\/g\/([^/?#]+)/i);
  if (!m) return null;
  const token = decodeURIComponent(m[1]);
  return { url: `https://www.facebook.com/share/g/${token}`, externalId: `${PENDING_SHARE_PREFIX}${token}` };
}

/** True while a target is still a share link nobody has followed yet. */
export function isPendingShare(externalId: string | null | undefined): boolean {
  return Boolean(externalId?.startsWith(PENDING_SHARE_PREFIX));
}

export function parseGroupUrl(input: string): { url: string; externalId: string } | null {
  const raw = input.trim();
  if (!raw) return null;
  let url: URL;
  try {
    url = new URL(/^https?:\/\//i.test(raw) ? raw : `https://${raw}`);
  } catch {
    return null;
  }
  if (!/(^|\.)facebook\.com$|(^|\.)fb\.com$/i.test(url.hostname)) return null;
  const m = url.pathname.match(/\/groups\/([^/?#]+)/i);
  if (!m) return null;
  const externalId = decodeURIComponent(m[1]);
  return { url: `https://www.facebook.com/groups/${externalId}`, externalId };
}
