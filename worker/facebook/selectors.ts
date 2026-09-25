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
  /*
   * The camera inside a COMMENT box, which is a different control from the
   * post composer's "תמונה/סרטון" and carries a different label. Facebook
   * words it as attaching to a comment, so the pattern is about that rather
   * than about photos in general — matching the composer's wording here would
   * find the button that starts a new POST.
   */
  /*
   * The camera beside a comment box, named every way Facebook names it.
   *
   * The narrow list missed the label the owner's Facebook actually uses, the
   * click fell through, and the comment went out with the words and no
   * picture. Broad on purpose: this pattern only ever runs INSIDE the comment
   * form, so a loose match cannot reach the post composer's own camera.
   */
  /*
   * Hebrew puts words BETWEEN the verb and the noun, and the list above did
   * not allow for any: "צירוף קובץ תמונה" and "הוספת קובץ תמונה או וידאו" are
   * both shapes Facebook ships, and neither matched "צירוף תמונה". The verb
   * and the noun are separated by an optional word now, and וידאו is allowed
   * beside סרטון. Safe to loosen because, unlike the version that made this
   * comment untrue, the pattern is no longer run against the whole page.
   */
  commentPhoto:
    /attach (a |an )?(file |image )?photo|photo or video|comment with a photo|insert photo|add (a )?photo|camera|צרף(ו)? (קובץ )?תמונה|צירוף (קובץ )?תמונה|הוספת (קובץ )?תמונה|הוסף (קובץ )?תמונה|תמונה לתגובה|תמונה או (סרטון|וידאו)|מצלמה|прикрепить фото|фото к комментарию|добавить фото|камера/i,

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
  /** Group page title suffix to strip when auto-naming targets. */
  titleSuffix: /\s*[|·-]\s*facebook\s*$/i,
  /*
   * WHAT A PUBLISHED POST DID — the only exposure figure Facebook offers on a
   * group post, and the two engagement counts beside it.
   *
   * Written like every other pattern here: the label in each language the
   * account might be set to, with the number captured on whichever side of it
   * that language puts it. There is no reach pattern because there is no reach
   * on the page; the group's size is not an audience and is not read as one.
   */
  seenBy: /(?:נצפה על ידי|נצפו על ידי)\s*([\d.,\s]+(?:K|M|אלף|מיליון)?)|seen by\s*([\d.,\s]+(?:K|M)?)|([\d.,\s]+(?:тыс|млн)?)\s*просмотрел/i,
  /*
   * A VIDEO REPORTS "צפיות", NOT "נצפה על ידי", and that distinction was
   * found on the owner's own post: everything they publish is video, and the
   * only exposure figure Facebook was ever going to hand them is the one this
   * pattern reads. Matching "seen by" alone would have collected nothing from
   * their entire library while looking like it worked.
   *
   * Kept as its own count rather than folded into seenBy, because they are not
   * the same claim — a play is a person who watched, an impression is a post
   * that crossed a screen. The card labels each for what it is.
   */
  viewCount: /([\d.,\s]+(?:K|M|אלף|מיליון)?)\s*צפיות|([\d.,\s]+(?:K|M)?)\s*views?\b|([\d.,\s]+(?:тыс|млн)?)\s*просмотр/i,
  /* No \b after the Hebrew and Russian words: JavaScript's word boundary is
     defined on ASCII \w, so it never matches at the edge of a Hebrew letter
     and the alternative silently never fires. Measured, not assumed — the
     first version of these patterns read 0 comments on every Hebrew post. */
  commentCount: /([\d.,\s]+(?:K|M|אלף|מיליון)?)\s*(?:תגובות|תגובה)|([\d.,\s]+(?:K|M)?)\s*comments?\b|([\d.,\s]+(?:тыс|млн)?)\s*комментар/i,
  shareCount: /([\d.,\s]+(?:K|M|אלף|מיליון)?)\s*(?:שיתופים|שיתוף)|([\d.,\s]+(?:K|M)?)\s*shares?\b|([\d.,\s]+(?:тыс|млн)?)\s*поделил/i,
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
  /*
   * A LOCAL file's preview, and nothing else.
   *
   * A blob: URL is minted by the page for a file chosen on this machine, so
   * it cannot come from anything Facebook merely loaded — not an avatar, not
   * a photo in a comment somebody else left, not the feed behind a modal.
   * That is why it, alone of the preview selectors, is safe to count inside a
   * whole dialog: everything else in mediaPreview above matches Facebook's
   * own CDN and would climb on its own as comments load.
   */
  localPreview: (scope: Locator): Locator => scope.locator('img[src^="blob:"], video[src^="blob:"]'),
  /** Multi-photo collage: Facebook shows an "Edit all" affordance instead of N separate previews. */
  collageReady: (dialog: Locator): Locator => dialog.getByText(/edit all|לערוך את הכל|עריכת הכל|редактировать все/i).first(),

  /** The submit button. */
  postButton: (dialog: Locator): Locator[] => [
    dialog.getByRole('button', { name: patterns.postButton }),
    dialog.locator('[role="button"]').filter({ hasText: patterns.postButton }).last(),
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
