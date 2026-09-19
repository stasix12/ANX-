import type { Locator, Page } from 'playwright-core';

/**
 * Every Facebook DOM touchpoint lives here and nowhere else. Facebook
 * changes its markup often, so each interaction is a *list* of candidates
 * ordered from most to least stable: ARIA roles + accessible names first
 * (in English, Hebrew and Russian — the UI language follows the account),
 * then text matching, then structural fallbacks. No generated class names.
 *
 * When Facebook changes its UI, update the patterns below; composer.ts and
 * the worker do not need to change.
 */

/* ------------------------------------------------------------ patterns */

export const patterns = {
  /** Group feed: the "Write something..." box that opens the composer. */
  composerTrigger: /write something|create (a )?(public )?post|what'?s on your mind|share something|start a discussion|כאן כותב(ים|ות)?|כת(ו)?ב(\/י|י|ו)?\s*(משהו|פוסט)|יצירת פוסט|צור פוסט|כתיבת פוסט|פוסט חדש|מה (תרצ[הו]|בא ל[ךכ][םן]?) לשתף|שת(ף|פי|פו)\s*משהו|פרסם משהו|מה חדש|מה עובר לך בראש|напишите что-нибудь|создать публикацию|что у вас нового|поделитесь/i,
  /** Anything that is a COMMENT box, never a post composer — typing here is forbidden. */
  commentBox: /comment|reply|תגובה|תגובת|הגב|комментар|ответ/i,
  /** The composer dialog's accessible name. */
  composerDialog: /create post|create a post|יצירת פוסט|פוסט חדש|создать публикацию|создание публикации/i,
  /** The contenteditable text box inside the composer. */
  composerTextbox: /write something|create a public post|what'?s on your mind|share something|כאן כותב(ים|ות)?|כת(ו)?ב(\/י|י|ו)?\s*(משהו|פוסט)|יצירת פוסט|מה (תרצ[הו]|בא ל[ךכ][םן]?) לשתף|שת(ף|פי|פו)\s*משהו|מה עובר לך בראש|напишите что-нибудь|что у вас нового|поделитесь/i,
  /** Button that reveals the file input. */
  photoVideo: /photo\/video|photo or video|add photos?\/videos?|תמונה\/סרטון|תמונה או סרטון|הוספת תמונות|фото\/видео|добавить фото/i,
  /** The final submit button. */
  postButton: /^(post|publish|פרסום|פרסם|פרסמי|פרסמו|опубликовать)$/i,
  /** Toasts / banners that mean "post did not go out". */
  postFailed: /something went wrong|couldn'?t (be )?(post|shar)|try again later|משהו השתבש|לא ניתן לפרסם|לא הצלחנו|נסו שוב מאוחר יותר|что-то пошло не так|не удалось опубликовать/i,
  /** Group requires admin approval — the post exists but is pending. */
  pendingApproval: /pending (admin )?approval|will be reviewed|awaiting approval|ממתין לאישור|יאושר על ידי מנהל|ожидает одобрения|на проверке/i,
  /** Not a member / cannot post here. */
  cannotPost: /you can'?t post|only members can post|join group|you're not a member|אי אפשר לפרסם|רק חברי הקבוצה|הצטרפות לקבוצה|הצטרפו לקבוצה|вы не можете публиковать|вступить в группу/i,
  /** Security interstitials — the worker stops and hands over to the owner. */
  checkpoint: /confirm your identity|enter (the )?(security|login) code|two-factor|two factor|verify (your|it'?s) (you|account)|suspicious activity|unusual activity|temporarily blocked|you'?re temporarily blocked|account restricted|we suspended|captcha|security check|help us confirm|please confirm|אשר את זהותך|אמת את זהותך|קוד אבטחה|אימות דו-שלבי|פעילות חשודה|נחסמת זמנית|חסימה זמנית|החשבון שלך הוגבל|אימות זהות|подтвердите свою личность|код безопасности|подозрительная активность|временно заблокирован|подтвердите, что это вы/i,
  /** Login page markers. */
  loginPage: /log in to facebook|log into facebook|התחברות לפייסבוק|כניסה לפייסבוק|вход на facebook/i,
  /* ---- Group discovery (read-only). See worker/facebook/profile.ts. ----
   * These answer "what is the owner to this group?", which patterns.cannotPost
   * deliberately does NOT: that one conflates "you can't post", "only members
   * can post" and "join group" into one question ("can I publish here?"), and a
   * member of an announcement-only group matches it. Reusing it for membership
   * would mislabel groups the owner is already in. */

  /** An actual join CONTROL. Anchored ^…$ so prose ("הצטרפו לקבוצה כדי לראות…") never matches. */
  joinGroupButton: /^\s*(join group|join|ask to join|request to join|הצטרפות לקבוצה|הצטרפות|הצטרף|הצטרפי|בקשה להצטרף|בקשת הצטרפות|вступить в группу|вступить|присоединиться|подать заявку)\s*$/i,
  /** A join request already sent — Facebook renders this as a disabled button, a
   *  "cancel request" button or a banner, depending on the surface. The least
   *  stable string in the product: a non-match means UNKNOWN, never NOT_MEMBER. */
  joinRequestPending: /^\s*(request sent|requested|cancel request|pending approval|request pending|הבקשה נשלחה|בקשה נשלחה|נשלחה בקשה|ביטול הבקשה|בטל בקשה|בקשה ממתינה|ממתין לאישור המנהלים|запрос отправлен|заявка отправлена|отменить запрос|запрос на рассмотрении)\s*$/i,
  /** The privacy badge, stated in words. "Public"/"Private" alone is far too
   *  loose (every page footer links to a privacy policy), so the word "group"
   *  is required. Anything else stays 'unknown'. */
  groupPublic: /public group|קבוצה ציבורית|открытая группа|публичная группа/i,
  groupPrivate: /private group|קבוצה פרטית|סגורה קבוצה|закрытая группа|частная группа/i,
  /** A plainly written member count. Abbreviated forms ("12K", "1.2 אלף",
   *  "12 тыс.") deliberately do not match — rounding them into a number would be
   *  inventing one. The caller still validates the digits before believing them. */
  memberCount: /(\d[\d.,\u00a0\u202f ]{0,14})[\u00a0\u202f ]{0,2}(?:members?|חברים|חברות|участник(?:а|ов)?)(?![\p{L}])/giu,

  /** Group page title suffix to strip when auto-naming targets. */
  titleSuffix: /\s*[|·-]\s*facebook\s*$/i,
} as const;

/** URL paths that always mean "human needed". */
export const CHECKPOINT_PATHS = ['/checkpoint', '/two_step_verification', '/two_factor', '/recover', '/confirmemail', '/help/contact', '/login/identify', '/security/', '/challenge'];
export const LOGIN_PATHS = ['/login', '/login.php', '/login/', '/reg/', '/signup'];

/* ---------------------------------------------------------- candidates */

export const fb = {
  /** Something on the page that opens the post composer for this group. */
  composerTrigger: (page: Page): Locator[] => [
    page.getByRole('button', { name: patterns.composerTrigger }),
    page.locator('[role="main"]').getByText(patterns.composerTrigger, { exact: false }).first(),
    page.getByText(patterns.composerTrigger, { exact: false }).first(),
  ],

  /**
   * The composer dialog. Facebook pages carry several role="dialog" nodes
   * (chat pop-outs, notification panels), so only a dialog that actually
   * contains an editable field counts.
   */
  composerDialog: (page: Page): Locator[] => [
    page.getByRole('dialog', { name: patterns.composerDialog }).filter({ has: page.locator('[contenteditable="true"], [role="textbox"]') }),
    page.getByRole('dialog').filter({ has: page.locator('[contenteditable="true"], [role="textbox"]') }).last(),
    page.locator('[role="dialog"]').filter({ has: page.locator('[contenteditable="true"]') }).last(),
  ],

  /** The editable text area inside the dialog. */
  textbox: (dialog: Locator): Locator[] => [
    dialog.getByRole('textbox', { name: patterns.composerTextbox }),
    dialog.getByRole('textbox').first(),
    dialog.locator('[contenteditable="true"]').first(),
  ],

  /** The "Photo/video" affordance inside the dialog. */
  photoVideo: (dialog: Locator): Locator[] => [
    dialog.getByRole('button', { name: patterns.photoVideo }),
    dialog.getByLabel(patterns.photoVideo),
    dialog.locator('[aria-label]').filter({ hasText: patterns.photoVideo }).first(),
  ],

  /**
   * The hidden file input for the composer. ONLY inside the dialog: a
   * page-wide input can belong to the group cover photo or profile picture
   * (an admin's page has those), and uploading there is a disaster.
   */
  fileInput: (_page: Page, dialog: Locator): Locator[] => [
    dialog.locator('input[type="file"][accept*="image"], input[type="file"][accept*="video"]').first(),
    dialog.locator('input[type="file"]').first(),
  ],

  /** Upload in progress indicators (any progress bar inside the dialog). */
  uploadProgress: (dialog: Locator): Locator => dialog.locator('[role="progressbar"]'),

  /** Uploaded media previews (an <img> with a blob: or scontent src, or a <video>). */
  mediaPreview: (dialog: Locator): Locator => dialog.locator('img[src^="blob:"], img[src*="scontent"], img[src*="fbcdn"], video'),
  /** Multi-photo collage: Facebook shows an "Edit all" affordance instead of N separate previews. */
  collageReady: (dialog: Locator): Locator => dialog.getByText(/edit all|לערוך את הכל|עריכת הכל|редактировать все/i).first(),

  /** The submit button. */
  postButton: (dialog: Locator): Locator[] => [
    dialog.getByRole('button', { name: patterns.postButton }),
    dialog.locator('[role="button"]').filter({ hasText: patterns.postButton }).last(),
  ],

  /**
   * A join control for THIS group. Restricted to [role="main"] first: the left
   * rail and the "suggested groups" tray carry join buttons for other groups,
   * and one of those would label the group on screen NOT_MEMBER.
   */
  joinButton: (page: Page): Locator[] => [
    page.locator('[role="main"]').getByRole('button', { name: patterns.joinGroupButton }),
    page.locator('[role="main"]').getByRole('link', { name: patterns.joinGroupButton }),
  ],

  /** "Request sent" / "Cancel request", same main-region restriction. */
  joinPending: (page: Page): Locator[] => [
    page.locator('[role="main"]').getByRole('button', { name: patterns.joinRequestPending }),
    page.locator('[role="main"]').getByText(patterns.joinRequestPending).first(),
  ],

  /** Login form presence. */
  loginForm: (page: Page): Locator[] => [
    page.locator('form[action*="login"]'),
    page.locator('input[name="email"]'),
    page.getByRole('button', { name: /^(log in|התחברות|כניסה|войти)$/i }),
  ],

  /** Text anywhere on the page that indicates a security interstitial. */
  checkpointText: (page: Page): Locator => page.getByText(patterns.checkpoint).first(),
  failureText: (page: Page): Locator => page.getByText(patterns.postFailed).first(),
  pendingText: (page: Page): Locator => page.getByText(patterns.pendingApproval).first(),
  cannotPostText: (page: Page): Locator => page.getByText(patterns.cannotPost).first(),
};

/* ------------------------------------------------------------- helpers */

/** Resolves to the first candidate that becomes visible within `timeout`. */
export async function firstVisible(candidates: Locator[], timeout: number): Promise<Locator | null> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const c of candidates) {
      try {
        if (await c.first().isVisible()) return c.first();
      } catch {
        /* detached / not ready */
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}

/** Like firstVisible but for attached (possibly hidden) elements, e.g. file inputs. */
export async function firstAttached(candidates: Locator[], timeout: number): Promise<Locator | null> {
  const deadline = Date.now() + timeout;
  while (Date.now() < deadline) {
    for (const c of candidates) {
      try {
        if ((await c.count()) > 0) return c.first();
      } catch {
        /* ignore */
      }
    }
    await new Promise((r) => setTimeout(r, 250));
  }
  return null;
}
