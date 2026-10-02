import type { Page } from 'playwright-core';
import { classifyPage } from './session';

/**
 * JOINING GROUPS THE OWNER PICKED, ONE AT A TIME, AT A PACE THAT DOES NOT GET
 * HIS ACCOUNT BLOCKED.
 *
 * "תוסיף לי אופציה שאני יכול לסמן את הקבוצות האלה שאני לא נמצא בהם, ושהתוכנה
 *  תפתח קבוצה קבוצה ותצרתף אוטומטי."
 *
 * The product already drives this account's own browser to write a post and
 * press "פרסם". Pressing "הצטרפות לקבוצה" is the same class of thing and a
 * smaller one. What is NOT the same is the risk profile: rapid joining is the
 * single fastest way to collect "אתם מוגבלים זמנית" on a Facebook account, and
 * a blocked account cannot publish either — so the whole value of this product
 * is what is being spent if this runs too fast.
 *
 * SO THE PACE IS THE FEATURE, not a setting that happens to exist:
 *
 *   • a real gap between one join and the next, with jitter, because a request
 *     every exactly-sixty-seconds is a machine signature;
 *   • a cap per run, so a selection of two hundred cannot be handed over in one
 *     sitting;
 *   • and the first sign of a limit stops EVERYTHING. Not the current group —
 *     everything. Carrying on after Facebook has said no is the behaviour that
 *     turns a temporary limit into a long one.
 *
 * WHAT IT WILL NOT DO, deliberately:
 *
 *   • it never answers a group's membership QUESTIONS. Those are the owner's
 *     words about his own business, and a machine inventing them is both a lie
 *     to the admin and the fastest way to be removed. Such a group is reported
 *     as needing him, and left.
 *   • it never retries a refusal, and never dismisses a security check.
 *   • it never claims a join that Facebook has not confirmed: a group that
 *     holds new members for an admin comes back as "ממתין לאישור", which is
 *     what it is.
 */

/** What became of one group. */
export type JoinOutcome =
  /** The button turned into "הצטרפת" — we are in. */
  | 'joined'
  /** Sent, and an admin has to approve it. Not a membership yet. */
  | 'pending'
  /** Already a member before we arrived. */
  | 'already'
  /** The group asks questions. Only he can answer them. */
  | 'questions'
  /** No join control on the page at all — closed group, removed, or a layout
      this reader does not know. Reported, never guessed at. */
  | 'no-button'
  /** Facebook said no to US, not to this group. The run stops. */
  | 'blocked'
  /** The page did not load, or a security check appeared. The run stops. */
  | 'unavailable';

export interface JoinResult {
  url: string;
  outcome: JoinOutcome;
  /** What Facebook actually said, when it said something. For the log. */
  detail: string;
}

/**
 * THE GAP, and why it is this long.
 *
 * Facebook's own rate limits on joining are not published, and the numbers
 * people report are between a handful and a few dozen a day before a block.
 * The cost of being slow is that a list of twenty takes a quarter of an hour
 * in the background; the cost of being fast is an account that cannot publish
 * for a week. The jitter matters as much as the length — a join every exactly
 * ninety seconds is a pattern, and the point is not to look like one.
 */
export const GAP_MIN_MS = 60_000;
export const GAP_JITTER_MS = 60_000;

/** No more than this in one run, whatever the owner selected. */
export const JOIN_RUN_CAP = 15;

/* Facebook's own words when it is us it is refusing, in the three languages
   this account sees. Any of them stops the run. */
const BLOCKED = new RegExp(
  [
    'מוגבל', 'הוגבלת', 'חסימה זמנית', 'נחסמת', 'יותר מדי',
    "you'?re temporarily blocked", 'temporarily restricted', 'too many requests',
    'try again later', 'слишком много', 'временно заблокирован', 'ограничен',
  ].join('|'),
  'i',
);

/* The membership questions dialog. */
const QUESTIONS = new RegExp(
  ['שאלות', 'ענה על', 'ענו על', 'answer.{0,20}question', 'membership question', 'вопрос'].join('|'),
  'i',
);

/* What the control says before we press it. */
const JOIN_LABEL = new RegExp(
  ['^\\s*הצטרפות לקבוצה', '^\\s*הצטרף לקבוצה', '^\\s*הצטרפות\\s*$', '^\\s*join group', '^\\s*join\\s*$', '^\\s*вступить', '^\\s*присоединиться'].join('|'),
  'i',
);

/* And after: either we are in, or the request is waiting for an admin. */
const JOINED_LABEL = new RegExp(['הצטרפת', 'חבר בקבוצה', '^\\s*joined', 'вы участник', 'вы вступили'].join('|'), 'i');
const PENDING_LABEL = new RegExp(
  ['ממתין לאישור', 'הבקשה נשלחה', 'בקשה ממתינה', 'ביטול בקשה', 'request sent', 'requested', 'pending', 'cancel request', 'запрос отправлен', 'отменить запрос'].join('|'),
  'i',
);

/** A pause that is not the same pause twice. */
function gap(): number {
  return GAP_MIN_MS + Math.floor(Math.random() * GAP_JITTER_MS);
}

/**
 * The join control on a group page, by what it SAYS rather than where it sits.
 *
 * Facebook moves this button between the cover photo, a sticky header and an
 * overflow menu depending on the layout it serves; its wording is the only
 * thing that has held still. Buttons are read in order and the first whose
 * whole label is a join phrase wins — "^" anchors matter here, because
 * "הצטרפות לקבוצה" appears inside the text of plenty of other things on the
 * page, including other groups' cards in the sidebar.
 */
async function controls(page: Page): Promise<{ label: string; click: () => Promise<void> }[]> {
  const handles = await page.locator('[role="button"], button, a[role="button"]').all();
  const out: { label: string; click: () => Promise<void> }[] = [];
  for (const h of handles.slice(0, 120)) {
    const label = ((await h.getAttribute('aria-label').catch(() => null)) ?? (await h.innerText().catch(() => '')) ?? '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!label || label.length > 40) continue;
    out.push({ label, click: async () => void (await h.click({ timeout: 5_000 })) });
  }
  return out;
}

/** Everything the page says right now, for the refusal patterns. */
async function pageText(page: Page): Promise<string> {
  return (await page.evaluate(() => document.body?.innerText ?? '').catch(() => '')) || '';
}

/**
 * One group. Opens it, decides what the page is offering, and presses at most
 * one button.
 */
export async function joinOneGroup(page: Page, url: string): Promise<JoinResult> {
  const say = (outcome: JoinOutcome, detail = ''): JoinResult => ({ url, outcome, detail });
  try {
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 60_000 });
  } catch {
    return say('unavailable', 'הקבוצה לא נפתחה.');
  }
  await page.waitForTimeout(2_500);

  const kind = await classifyPage(page).catch(() => 'ok' as const);
  if (kind === 'checkpoint') return say('unavailable', 'Facebook מציג בדיקת אבטחה.');
  if (kind === 'login') return say('unavailable', 'החיבור לפייסבוק פג.');

  const before = await pageText(page);
  if (BLOCKED.test(before)) return say('blocked', firstLine(before, BLOCKED));

  const buttons = await controls(page);
  /* Already in, and the page says so before anything is pressed. */
  if (buttons.some((b) => JOINED_LABEL.test(b.label))) return say('already', '');
  if (buttons.some((b) => PENDING_LABEL.test(b.label))) return say('pending', 'בקשה כבר ממתינה לאישור.');

  const join = buttons.find((b) => JOIN_LABEL.test(b.label));
  if (!join) return say('no-button', 'לא נמצא כפתור הצטרפות בעמוד.');

  try {
    await join.click();
  } catch {
    return say('no-button', 'כפתור ההצטרפות לא נלחץ.');
  }
  await page.waitForTimeout(3_000);

  const after = await pageText(page);
  /*
   * THE REFUSAL IS READ BEFORE THE SUCCESS, always. A page that shows both a
   * limit notice and a stale "joined" button must be read as the limit — the
   * expensive mistake is carrying on.
   */
  if (BLOCKED.test(after)) return say('blocked', firstLine(after, BLOCKED));
  if (QUESTIONS.test(after)) {
    /*
     * The group asks questions. They are about his business and only he can
     * answer them, so the dialog is closed and the group is handed back. Never
     * answered, never left open — an open dialog would swallow the next
     * group's page.
     */
    await page.keyboard.press('Escape').catch(() => undefined);
    return say('questions', 'הקבוצה שואלת שאלות הצטרפות — צריך לענות עליהן ידנית.');
  }

  const now = await controls(page);
  if (now.some((b) => JOINED_LABEL.test(b.label))) return say('joined', '');
  if (now.some((b) => PENDING_LABEL.test(b.label))) return say('pending', 'הבקשה נשלחה וממתינה לאישור מנהל.');
  /*
   * Pressed, and the page will not say what happened. Reported as pending
   * rather than as joined: the request almost certainly went in, and claiming
   * a membership we cannot see is the one answer that would put him in a
   * publishing list for a group he is not in.
   */
  return say('pending', 'נלחץ, והעמוד לא אישר — בדקו בקבוצה.');
}

function firstLine(text: string, re: RegExp): string {
  const line = text.split('\n').find((l) => re.test(l)) ?? '';
  return line.trim().slice(0, 140);
}

/**
 * The run: every group the owner picked, paced, capped, and stopped the moment
 * Facebook pushes back.
 *
 * `onEach` is called after every group so the caller can write the outcome down
 * as it happens — a run that is stopped halfway must leave behind what it
 * already did, not lose it.
 *
 * `onWait` is called while the gap is being served, so the worker can keep
 * saying it is alive: the dashboard calls it offline after ninety seconds of
 * silence and the gap is longer than that.
 */
export async function joinGroups(
  page: Page,
  urls: string[],
  hooks: {
    onEach: (result: JoinResult) => Promise<void>;
    onWait?: (msLeft: number) => Promise<void>;
    stopped?: () => boolean;
    /*
     * THE GAP, OVERRIDDEN — and the only caller that may is the test.
     *
     * A test that had to serve a real sixty-second pause between three mock
     * pages would take four minutes, which means it would not be run, which
     * means the stop conditions it exists to hold would go unchecked. The
     * default is the real one and worker/test/join.test.ts asserts that it is:
     * a knob that could quietly disable the pacing in production is a worse
     * bug than the one it was added to test.
     */
    gapMs?: number;
  },
): Promise<{ results: JoinResult[]; stoppedBy: '' | 'blocked' | 'unavailable' | 'cap' | 'stopped' }> {
  const results: JoinResult[] = [];
  let stoppedBy: '' | 'blocked' | 'unavailable' | 'cap' | 'stopped' = '';
  /*
   * THE CAP COUNTS JOINS, NOT ADDRESSES — and that is the difference between a
   * limit and an obstacle.
   *
   * "למה הוא נותן להצתרף רק לאחד, אני רוצה לכל מה שאני מסמן." The screen used
   * to strip the groups it believed he was already in before sending them, so
   * a selection of three arrived as one and he was told nothing about the other
   * two. Now everything he ticked is sent and this decides what counts.
   *
   * A group we turn out to be in already, or one with no join control, costs
   * Facebook nothing — no click, no request, no gap — so it cannot sensibly
   * spend a cap that exists to keep the account out of trouble. Only a group
   * we actually pressed does.
   *
   * It also makes the run immune to a wrong membership flag, which matters
   * here: the membership parser has been wrong about this owner's groups twice
   * before, and a screen that silently drops a group on its say-so would hide
   * exactly the group he meant to join.
   */
  let attempts = 0;

  for (let i = 0; i < urls.length; i += 1) {
    if (hooks.stopped?.()) return { results, stoppedBy: 'stopped' };
    if (attempts >= JOIN_RUN_CAP) return { results, stoppedBy: 'cap' };
    const result = await joinOneGroup(page, urls[i]);
    results.push(result);
    await hooks.onEach(result);

    /* Facebook refusing US, or a security check: the run is over. Not this
       group — the run. */
    if (result.outcome === 'blocked' || result.outcome === 'unavailable') {
      return { results, stoppedBy: result.outcome };
    }

    /* A group we did not press is not an attempt. */
    if (result.outcome !== 'already' && result.outcome !== 'no-button') attempts += 1;

    /* No gap after the last one, and none after a group we did not touch:
       being already a member cost Facebook nothing. */
    const last = i === urls.length - 1;
    if (last || result.outcome === 'already' || result.outcome === 'no-button') continue;

    let left = hooks.gapMs ?? gap();
    while (left > 0) {
      if (hooks.stopped?.()) return { results, stoppedBy: 'stopped' };
      const slice = Math.min(left, 10_000);
      await page.waitForTimeout(slice);
      left -= slice;
      await hooks.onWait?.(left);
    }
  }

  return { results, stoppedBy };
}
