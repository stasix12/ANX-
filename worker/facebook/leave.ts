import type { Page } from 'playwright-core';

/**
 * LEAVING ONE GROUP, ON PURPOSE AND ONLY WHEN ASKED.
 *
 * "תוסיף כאן אופציה מהירה לצאת מהקבוצות שכשלו ולא ניתן לפרסם בהן."
 *
 * Fourteen of his fifteen failures on 10.11 were the same sentence — "לא
 * מצאתי את תיבת 'כתבו משהו…' בקבוצה" — and all fifteen groups were still
 * switched on, because composer.ts throws `PublishError('composer')` and only
 * `cannot_post` retires a target. So the queue keeps spending attempts on
 * groups that will never take a post, and his answer is the right one: get
 * out of them.
 *
 * THIS IS THE ONE FILE IN worker/facebook THAT TAKES SOMETHING AWAY, and the
 * difference from join.ts runs through every decision in it:
 *
 *   • LEAVING IS NOT UNDOABLE FROM HERE. Plenty of these groups re-admit only
 *     through an admin, so a wrong click costs him a group permanently. The
 *     dashboard asks before it queues the command; this file's job is to make
 *     sure that what it presses is the thing he agreed to and nothing else.
 *
 *   • ONE GROUP PER COMMAND. join.ts walks a list with pacing and a run cap
 *     because joining twenty groups is one errand. Leaving is a decision per
 *     group, taken while looking at that group's failure, so there is no list
 *     here to pace and no cap to reach.
 *
 *   • IT NEVER GUESSES THE OUTCOME. "Pressed a button" is not "left the
 *     group". The page is re-read afterwards and the answer is taken from
 *     what Facebook then offers: a join control where the leave control was.
 *     Without that check a layout change would be reported to him as fifteen
 *     successful exits that never happened.
 */

/** How long to wait for the page, and for the dialog it opens. */
const PAGE_TIMEOUT_MS = 60_000;
const DIALOG_TIMEOUT_MS = 8_000;
const SETTLE_MS = 1_200;

export type LeaveOutcome =
  /** Facebook now offers to JOIN — we are out, and the page says so. */
  | 'left'
  /** We were not a member to begin with. Nothing was pressed. */
  | 'not-member'
  /** The control is not on the page in any language we know. */
  | 'no-button'
  /** Pressed, but the page would not confirm it. Nothing is claimed. */
  | 'unconfirmed'
  /** The page did not open, or Facebook answered with something else. */
  | 'unavailable';

export interface LeaveResult {
  url: string;
  outcome: LeaveOutcome;
  detail: string;
}

/*
 * THE CONTROL, BY WHAT IT SAYS.
 *
 * Anchored at the start like join.ts's, and for the harder version of the
 * same reason: "עזיבת הקבוצה" appears inside other groups' cards in the
 * sidebar and inside Facebook's own help text, and an unanchored match there
 * would leave the WRONG group. A label is also capped at 40 characters
 * before it is considered at all, which rules out paragraphs that merely
 * contain the words.
 */
const LEAVE_LABEL = new RegExp(
  [
    '^\\s*עזיבת הקבוצה',
    '^\\s*עזוב את הקבוצה',
    '^\\s*עזבי את הקבוצה',
    '^\\s*צא מהקבוצה',
    '^\\s*יציאה מהקבוצה',
    '^\\s*leave group\\s*$',
    '^\\s*leave the group',
    '^\\s*покинуть группу',
    '^\\s*выйти из группы',
  ].join('|'),
  'i',
);

/*
 * AND THE PROOF THAT IT WORKED: Facebook offering the way back in. Borrowed
 * from join.ts deliberately — the two files must agree about what "a member"
 * looks like, or one of them is wrong.
 */
const JOIN_LABEL = new RegExp(
  ['^\\s*הצטרפות לקבוצה', '^\\s*הצטרף לקבוצה', '^\\s*הצטרפות\\s*$', '^\\s*join group', '^\\s*join\\s*$', '^\\s*вступить', '^\\s*присоединиться'].join(
    '|',
  ),
  'i',
);

/*
 * The overflow menu the leave control usually hides behind. Facebook puts it
 * under the cover photo as a "…" with an accessible name and nothing else, so
 * the name is all there is to match on.
 */
const MORE_LABEL = new RegExp(
  ['^\\s*עוד\\s*$', '^\\s*אפשרויות נוספות', '^\\s*פעולות נוספות', '^\\s*more options', '^\\s*see more options', '^\\s*ещё\\s*$', '^\\s*другие действия'].join(
    '|',
  ),
  'i',
);

/*
 * The confirmation Facebook raises over the page. Its button repeats the
 * word, which is what makes it safe to press: we are not looking for "the
 * primary button in whatever dialog opened" — we are looking for one that
 * says it leaves the group.
 */
const CONFIRM_LABEL = new RegExp(
  ['^\\s*עזיבת הקבוצה', '^\\s*עזוב את הקבוצה', '^\\s*צא מהקבוצה', '^\\s*יציאה\\s*$', '^\\s*leave group', '^\\s*leave\\s*$', '^\\s*покинуть'].join('|'),
  'i',
);

/** Facebook saying no — the same family join.ts watches for. */
const BLOCKED = new RegExp(
  ['מוגבל', 'הוגבלת', 'חסימה זמנית', 'נחסמת', "you'?re temporarily blocked", 'temporarily restricted', 'try again later', 'временно заблокирован'].join('|'),
  'i',
);

/**
 * Every pressable thing on the page, with the label it shows.
 *
 * The same reader join.ts uses, kept separate rather than imported so that a
 * change made for joining cannot quietly change what gets pressed when
 * leaving. The cost is twenty lines; the thing it buys is that this file can
 * be read on its own and believed.
 */
async function controls(page: Page): Promise<{ label: string; click: () => Promise<void> }[]> {
  const handles = await page.locator('[role="button"], button, a[role="button"], [role="menuitem"]').all();
  const out: { label: string; click: () => Promise<void> }[] = [];
  for (const h of handles.slice(0, 140)) {
    const label = ((await h.getAttribute('aria-label').catch(() => null)) ?? (await h.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
    if (!label || label.length > 40) continue;
    /*
     * VISIBLE ONLY, AND THIS IS THE LINE THE TEST FIXTURE WAS WRITTEN AGAINST.
     *
     * Facebook keeps the overflow menu's items IN THE DOM and merely hidden
     * until the "…" is pressed. Reading labels without this filter finds the
     * leave control before the menu is open, clicks a hidden element, and
     * Playwright waits out its timeout and throws — which this file catches,
     * so the run would go on to re-read the page, see us still a member, and
     * report `unconfirmed` on a group it never actually tried to leave.
     *
     * Caught by the `ok` fixture in worker/test/leave.test.ts, which hides
     * the control exactly the way Facebook does.
     */
    if (!(await h.isVisible().catch(() => false))) continue;
    out.push({ label, click: async () => void (await h.click({ timeout: 5_000 })) });
  }
  return out;
}

async function pageText(page: Page): Promise<string> {
  return (await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')) || '';
}

/**
 * ONE GROUP. Opens it, presses at most two buttons, and then asks the page
 * whether it worked.
 */
export async function leaveOneGroup(page: Page, url: string): Promise<LeaveResult> {
  const say = (outcome: LeaveOutcome, detail = ''): LeaveResult => ({ url, outcome, detail });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
  } catch {
    return say('unavailable', 'הקבוצה לא נפתחה.');
  }
  await page.waitForTimeout(SETTLE_MS);

  const text = await pageText(page);
  if (BLOCKED.test(text)) return say('unavailable', 'פייסבוק מציגה הגבלה זמנית — לא נגענו בקבוצה.');

  let buttons = await controls(page);

  /*
   * ALREADY OUT, AND THAT IS A SUCCESS AND NOT AN ERROR.
   *
   * He may have left by hand, or a previous run may have worked and failed to
   * report. Either way the group is not his any more, which is the state he
   * asked for — so the caller switches the target off exactly as it would
   * after a real exit. Checked BEFORE the leave control, because a page that
   * offers both is a page we have misread and must not press anything on.
   */
  if (buttons.some((b) => JOIN_LABEL.test(b.label)) && !buttons.some((b) => LEAVE_LABEL.test(b.label))) {
    return say('not-member', 'כבר לא היינו חברים בקבוצה.');
  }

  let leave = buttons.find((b) => LEAVE_LABEL.test(b.label));

  /*
   * Behind the "…" if it is not on the page itself. One menu, one look: if
   * opening it does not reveal the control, the answer is "no-button" rather
   * than a hunt through whatever else the menu holds.
   */
  if (!leave) {
    const more = buttons.find((b) => MORE_LABEL.test(b.label));
    if (more) {
      await more.click().catch(() => undefined);
      await page.waitForTimeout(SETTLE_MS);
      buttons = await controls(page);
      leave = buttons.find((b) => LEAVE_LABEL.test(b.label));
    }
  }
  if (!leave) return say('no-button', 'לא נמצא כפתור יציאה בעמוד הקבוצה.');

  await leave.click().catch(() => undefined);

  /*
   * THE CONFIRMATION, AND PRESSING NOTHING IF IT IS NOT THE RIGHT ONE.
   *
   * Facebook raises a dialog whose own button repeats "עזיבת הקבוצה". We look
   * for THAT, inside the dialog, rather than for "the confirming button" —
   * the same dialog carries a cancel, and a layout we have misread could
   * carry something else entirely. If no such button appears the run ends as
   * `unconfirmed` and the page is left exactly as it is.
   */
  const dialog = page.locator('[role="dialog"]').last();
  await dialog.waitFor({ state: 'visible', timeout: DIALOG_TIMEOUT_MS }).catch(() => undefined);
  const inDialog = (await dialog.count().catch(() => 0)) > 0;
  if (inDialog) {
    const handles = await dialog.locator('[role="button"], button').all();
    for (const h of handles.slice(0, 40)) {
      const label = ((await h.getAttribute('aria-label').catch(() => null)) ?? (await h.innerText().catch(() => '')) ?? '').replace(/\s+/g, ' ').trim();
      if (!label || label.length > 40 || !CONFIRM_LABEL.test(label)) continue;
      await h.click({ timeout: 5_000 }).catch(() => undefined);
      break;
    }
  }

  /*
   * AND THE ANSWER COMES FROM THE PAGE, NOT FROM THE CLICK.
   *
   * Reloaded on purpose: the group header is rendered once and Facebook does
   * not always swap it in place, so reading the live DOM can show the leave
   * control still sitting there a second after a successful exit. A fresh
   * load is the only reading that means anything.
   */
  await page.waitForTimeout(SETTLE_MS);
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: PAGE_TIMEOUT_MS });
  } catch {
    return say('unconfirmed', 'לחצנו על היציאה, אבל העמוד לא נטען שוב כדי לאשר.');
  }
  await page.waitForTimeout(SETTLE_MS);

  const after = await controls(page);
  if (after.some((b) => JOIN_LABEL.test(b.label))) return say('left', 'יצאנו מהקבוצה.');
  if (after.some((b) => LEAVE_LABEL.test(b.label))) return say('unconfirmed', 'נלחץ כפתור היציאה, אבל פייסבוק עדיין מציגה אותנו כחברים בקבוצה.');

  /*
   * Neither control. A private group usually stops showing itself the moment
   * you are out, which looks exactly like this — but so does a page that
   * failed to render. The text decides, and when it cannot, nothing is
   * claimed: `unconfirmed` keeps the group switched on and the owner looks.
   */
  const afterText = await pageText(page);
  if (/תוכן זה אינו זמין|content isn't available|содержимое недоступно|הצטרפות לקבוצה|join group/i.test(afterText)) {
    return say('left', 'יצאנו מהקבוצה — העמוד כבר לא זמין לנו.');
  }
  return say('unconfirmed', 'לא הצלחנו לאשר מהעמוד אם היציאה הושלמה.');
}
