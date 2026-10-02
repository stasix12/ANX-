import type { ActivityEntry } from './types';

/**
 * WHAT A LOG ROW SAYS TO A PERSON, as opposed to what it says to me.
 *
 * The owner, reading their own dashboard:
 *
 *   "אני לא רוצה לראות יותר טקסטים טכניים ארוכים כמו facebook/selectors.ts"
 *
 * They were reading this, on the main screen of a business tool, between two
 * publications:
 *
 *   באר שבע ביחד ❤️ : ניסיון 2 לפרסום נכשל. לא מצאתי את תיבת "כתבו משהו…"
 *   בקבוצה. ייתכן שאין הרשאת פרסום או ש-Facebook שינתה את הממשק
 *   (facebook/selectors.ts). המערכת תנסה שוב ב-27.09.2026, 18:51.
 *
 * Every word of that is true and most of it is addressed to whoever maintains
 * the selectors. The file name is meaningless to the person it is shown to,
 * and it is the part that makes the line look like something has gone
 * seriously wrong when the system is in fact handling it.
 *
 * NOTHING HERE CHANGES WHAT IS STORED. This is a pure function over a row the
 * caller already has — no column, no write, no second source. The original
 * `message`, the raw `event` and the whole of `meta` stay exactly as they are
 * in social_activity_log and are shown in full behind "פרטים מלאים" on the
 * activity screen. A log you cannot read in full is not a log.
 *
 * The same discipline as activityKind() beside it: one decision, one place, so
 * the dashboard card and the activity screen cannot drift into calling the
 * same event two different things.
 */
export type ActivityText = {
  /** A short headline. Always present, always Hebrew, never a file path. */
  title: string;
  /** One plain line under it. '' when the title already says everything. */
  detail: string;
  /** The group or post this is about, when the writer stamped one. */
  subject: string;
};

/**
 * The headline per event.
 *
 * Built from the writers — the same source activityKind()'s map is built from
 * — so an event that is emitted has a name a person can read. An event that is
 * not here falls through to its level, which is why adding a writer does not
 * require editing this file before its rows make sense.
 */
const TITLE: Record<string, string> = {
  // Went out.
  published: 'פורסם פוסט',
  quick_published: 'פורסם פוסט',
  group_share_resolved: 'נמצא קישור לקבוצה',
  run_adopted_queue: 'הסבב אימץ פרסומים קיימים',
  worker_started: 'המחשב התחבר',
  worker_self_update: 'התוכנה עודכנה לגרסה חדשה',
  targets_synced: 'סונכרנו דפי פייסבוק',

  // Did not.
  publish_failed: 'פרסום נכשל',
  publish_unrecorded: 'פורסם, אבל לא נרשם',
  needs_attention: 'פרסום דורש טיפול',
  worker_error: 'תקלה בתוכנה שבמחשב',
  browser_start_failed: 'הדפדפן לא נפתח',
  picture_upload_failed: 'תמונות קבוצות לא נשמרו',
  plan_failed: 'תכנון הסבב נכשל',
  plan_retry: 'הסבב יתוכנן שוב',
  plan_revived: 'סבב הוחזר לתכנון',
  account_save_failed: 'שמירת החשבון נכשלה',
  profiles_save_failed: 'רשימת הפרופילים לא נשמרה',
  page_not_allowed: 'הקבוצה לא מאפשרת פרסום בתור דף',
  avatar_upload_blocked: 'תמונת הפרופיל לא נשמרה',
  login_challenge_failed: 'אימות הפייסבוק נכשל',
  /* The post went out and the button under it did not. Named for what the
     owner will actually notice — a published post with no link on it. */
  cta_dropped: 'הפוסט פורסם בלי כפתור הקישור',
  rate_limit: 'פייסבוק הגביל זמנית את הפרסום',
  /* The local disconnect worked and telling Facebook about it did not, which
     means a token this product no longer holds may still be live there. The
     headline says the part that needs doing, not the part that worked. */
  revoke_remote_failed: 'ניתוק החיבור מצד פייסבוק לא הושלם',

  // A round's own life.
  planned: 'נבנה סבב פרסום',
  drip_planned: 'נבנה סבב פרסום',
  /* Written when Facebook's own page says this account cannot post in a
     group — the group is switched off and the owner is told which one. */
  target_left: 'יצאתם מקבוצה — היא כובתה',
  worker_window_storm: 'ריבוי חלונות דפדפן — פעולות הרקע נעצרו',
  nightly_group_check: 'בדיקה יומית של הקבוצות',
  campaign_paused: 'הסבב הושהה',
  campaign_resumed: 'הסבב חודש',
  campaign_stopped: 'הסבב נעצר',
  campaign_deleted: 'הסבב נמחק',
  stopped_campaign_swept: 'נוקו פרסומים מסבב שנעצר',
  worker_run: 'סיכום סבב עבודה',

  // The queue moving.
  deferred: 'ממתין למרווח בין פרסומים',
  comments_waiting: 'תגובות ממתינות לחלון פנוי',
  skipped: 'פרסום דולג',
  retry: 'פרסום הוחזר לתור',
  cancelled: 'פרסום בוטל',
  manual_pending: 'ממתין לפרסום ידני',
  plan_targets_skipped: 'קבוצות לא נכנסו לסבב',
  /* The feature that wrote this is gone ("לפרסם רק לאן שיש לקוחות"), and the
     entry stays because his history still holds rows that carry it. Deleting
     the label would not delete the rows — it would only make them unreadable. */
  plan_not_customers: 'קבוצות בלי לקוחות — לא נכנסו לסבב',
  queue_respaced: 'המרווח בתור שונה',
  queue_target_removed: 'קבוצה הוסרה מהתור',
  queue_targets_added: 'קבוצות נוספו לתור',
  stuck_rows_released: 'פרסומים תקועים שוחררו',

  // The machine and the session.
  worker_stopped: 'המחשב התנתק',
  worker_update_blocked: 'לא ניתן לעדכן את התוכנה',
  browser_needs_auth: 'צריך להתחבר מחדש לפייסבוק',
  login_challenge: 'פייסבוק ביקש אימות',
  group_share_duplicate: 'קישור כפול לקבוצה',
  comment_columns_missing: 'חסר עדכון במסד הנתונים',
  comment_claim_failed: 'תגובה לא ננעלה לעיבוד',
  discover_unread: 'לא זוהתה חברות בקבוצה',
  account_scope_narrowed: 'הגישה צומצמה לחשבון אחד',
  disconnected: 'החיבור לפייסבוק נותק',
  metrics_columns_missing: 'חסר עדכון במסד הנתונים',
  commands_payload_missing: 'חסר עדכון במסד הנתונים',
};

/** When the event has no headline of its own, its severity is the headline. */
const BY_LEVEL: Record<string, string> = {
  error: 'תקלה',
  warn: 'דורש תשומת לב',
  info: 'עדכון מהמערכת',
};

/**
 * The noise, and only the noise.
 *
 * Deliberately a short list of shapes that are unambiguously addressed to a
 * developer. A sentence in Hebrew is never rewritten by guesswork — it is the
 * only specific thing most rows have, and replacing it with a generic phrase
 * would make this screen emptier rather than clearer, which is the opposite of
 * what was asked.
 */
const NOISE: RegExp[] = [
  /\s*\(\s*[\w@./-]+\.(?:ts|tsx|js|cjs|mjs|sql|json|cmd|exe)\s*\)/gi, // (facebook/selectors.ts)
  /\s*\bworker@[\w.-]+/gi, // worker@stas-pc
  /\s*\bat\s+[\w$.<>]+\s*\([^)]*:\d+:\d+\)/g, // a stack frame
  /\s*\b[\w./-]+\.(?:ts|tsx|js|cjs|mjs):\d+(?::\d+)?/g, // file.ts:12:3
];

const HEBREW = /[֐-׿]/;

/**
 * The first sentence, cleaned.
 *
 * Long messages on this log are built the same way: what happened, then why it
 * might have happened, then what the system will do about it. The first clause
 * is the part a person needs on a card that holds five of these; the rest is
 * still one tap away, whole.
 */
export function plainMessage(message: string): string {
  let text = message ?? '';
  for (const pattern of NOISE) text = text.replace(pattern, '');
  text = text.replace(/\s+/g, ' ').trim();
  /* No Hebrew left means it was an exception verbatim — there is nothing here
     to show somebody who did not write it. The headline carries the row and
     the original is intact behind "פרטים מלאים". */
  if (!HEBREW.test(text)) return '';
  if (text.length <= 90) return text;
  /* Split on a full stop that ENDS a sentence, not on the dots inside a date
     ("27.09.2026") or a version ("3.39.0"). */
  const cut = text.search(/(?<!\d)\.(?!\d)\s/);
  const first = cut > 0 ? text.slice(0, cut + 1) : text;
  return first.length > 140 ? `${first.slice(0, 137).trimEnd()}…` : first;
}

/** The group or post a row is about, when the writer stamped one. */
function subjectOf(entry: Pick<ActivityEntry, 'meta'>): string {
  const meta = (entry.meta ?? {}) as Record<string, unknown>;
  for (const key of ['target', 'targetName', 'group', 'post', 'title', 'name']) {
    const value = meta[key];
    if (typeof value === 'string' && value.trim()) return value.trim();
  }
  return '';
}

export function activityText(entry: Pick<ActivityEntry, 'event' | 'level' | 'message' | 'meta'>): ActivityText {
  const title = TITLE[entry.event] ?? BY_LEVEL[entry.level] ?? BY_LEVEL.info;
  /*
   * THE ONE FACT WORTH PROMOTING OUT OF `meta`.
   *
   * "which version is my PC actually running" has been asked, by me, four
   * times today, and the answer was already being written to this log on every
   * start — inside meta, where nobody looks. The stored row is untouched; this
   * just reads it.
   */
  const version = (entry.meta as { version?: unknown } | null | undefined)?.version;
  if (entry.event === 'worker_started' && typeof version === 'string' && version) {
    return { title, detail: `גרסה ${version}`, subject: subjectOf(entry) };
  }
  const detail = plainMessage(entry.message);
  const subject = subjectOf(entry);
  return {
    title,
    /* Never the headline twice. A short message that already IS the headline
       leaves the second line empty rather than repeating it. */
    detail: detail === title ? '' : detail,
    subject,
  };
}

/** True when the stored row holds more than the friendly view shows. */
export function hasTechnicalDetail(entry: Pick<ActivityEntry, 'message' | 'meta'>): boolean {
  const message = entry.message ?? '';
  if (plainMessage(message) !== message.trim()) return true;
  return Object.keys((entry.meta ?? {}) as Record<string, unknown>).length > 0;
}
