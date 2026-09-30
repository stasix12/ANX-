import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { readAccountProfile, type AccountProfile } from './account';
import { readProfiles, switchProfile, type FacebookProfile } from './profiles';
import { env } from '../env';
import { CHECKPOINT_PATHS, LOGIN_PATHS, fb, patterns } from './selectors';

/**
 * One persistent Chrome profile = one Facebook login. The owner signs in by
 * hand in a real window; cookies live only in that profile directory on
 * this machine (outside the repo, never uploaded anywhere). Jobs reuse the
 * same profile, headless or headed depending on Debug Mode.
 *
 * Deliberately no "stealth" tricks, no user-agent spoofing, no cookie
 * import/export: this is the owner's own browser doing the owner's own
 * posting, at a conservative pace.
 */

export type PageKind = 'ok' | 'login' | 'checkpoint';

export class SessionError extends Error {
  constructor(
    public kind: 'login' | 'checkpoint',
    message: string,
  ) {
    super(message);
  }
}

/** Chromium's ProcessSingleton refuses to start on a profile another process holds. */
function isProfileLocked(message: string): boolean {
  return /has been closed|ProcessSingleton|profile appears to be in use|SingletonLock|Target page, context or browser/i.test(message);
}

function launchFailureMessage(msg: string): string {
  return `לא הצלחתי לפתוח דפדפן (${env.browserChannel}). התקינו Google Chrome או הריצו "npx playwright-core install chromium" והגדירו SOCIAL_BROWSER_CHANNEL=chromium. פרטים: ${msg.split('\n')[0]}`;
}

/**
 * Frees the worker's own profile directory: ends the Chrome processes that
 * were started against it, then drops the stale singleton files a killed
 * Chrome leaves behind.
 *
 * Scoped to env.profileDir on purpose. That directory is this tool's private
 * profile, so a process matching it is always one the worker started — the
 * owner's everyday Chrome runs on a different user-data-dir and is never
 * matched, never touched.
 */
async function releaseProfile(): Promise<void> {
  const dir = env.profileDir;
  try {
    if (process.platform === 'win32') {
      execFileSync(
        'powershell',
        [
          '-NoProfile',
          '-NonInteractive',
          '-Command',
          `Get-CimInstance Win32_Process -Filter "Name='chrome.exe'" | Where-Object { $_.CommandLine -like '*${dir.split(/[\\/]/).pop()}*' } | ForEach-Object { Stop-Process -Id $_.ProcessId -Force -ErrorAction SilentlyContinue }`,
        ],
        { stdio: 'ignore', timeout: 15_000 },
      );
    } else {
      // Match the launch flag, not just the path: only a browser started on
      // this profile can carry it.
      execFileSync('pkill', ['-f', `--user-data-dir=${dir}`], { stdio: 'ignore', timeout: 15_000 });
    }
  } catch {
    // Nothing matched, or no permission to end it. The lock-file sweep below
    // still covers the common case of a profile left locked by a crash.
  }
  // A Chrome that died without cleaning up leaves these behind; on Windows
  // they are the reason a relaunch fails even with no process running.
  for (const name of ['SingletonLock', 'SingletonCookie', 'SingletonSocket']) {
    try {
      rmSync(path.join(dir, name), { force: true, recursive: true });
    } catch {
      // Best effort — if it cannot be removed, the retry reports it properly.
    }
  }
  // Ending a process is not instant: Windows in particular holds the profile
  // for a moment after Stop-Process returns, and retrying inside that window
  // fails for the same reason all over again.
  await new Promise((r) => setTimeout(r, 1_500));
}

/*
 * EVERY WINDOW THIS WORKER OPENS, COUNTED — AND WHAT IT WAS FOR.
 *
 * The owner filmed their monitor twice: "ככה הוא פותח לי חלון אחרי חלון בלי
 * סיבה ובלי עבודה שהרצתי בתוכנה", and then, after a fix that did not fix it,
 * "עדיין פותח בלי סוף". Both times the terminal looked perfectly healthy,
 * because a loop between a chore and the tick has nothing to say for itself:
 * every individual step is a normal step.
 *
 * So the steps are counted here, where every single one of them passes. It
 * makes the loop a number and a name instead of an argument, and it is what
 * lets the worker stop ITSELF rather than waiting to be filmed again.
 */
const OPENS: { at: number; why: string }[] = [];

function notePageOpen(why: string): void {
  const now = Date.now();
  OPENS.push({ at: now, why });
  /* Only the recent past is ever asked about; without this the array is a
     slow leak on a machine that runs for weeks. */
  while (OPENS.length && now - OPENS[0].at > 30 * 60_000) OPENS.shift();
}

/** How many windows were opened in the last `ms`, and what most of them were for. */
export function recentPageOpens(ms: number): { count: number; why: string } {
  const since = Date.now() - ms;
  const recent = OPENS.filter((o) => o.at >= since);
  const tally = new Map<string, number>();
  for (const o of recent) tally.set(o.why, (tally.get(o.why) ?? 0) + 1);
  let why = '';
  let best = 0;
  for (const [k, n] of tally) if (n > best) [why, best] = [k, n];
  return { count: recent.length, why };
}

export class BrowserSession {
  private context: BrowserContext | null = null;
  private headless = true;

  get isOpen(): boolean {
    return this.context !== null;
  }

  hasProfile(): boolean {
    return existsSync(env.profileDir);
  }

  async ensure(headless: boolean): Promise<BrowserContext> {
    const wantHeadless = env.forceHeaded ? false : headless;
    if (this.context && this.headless === wantHeadless) return this.context;
    await this.close();
    this.headless = wantHeadless;
    const common = {
      headless: wantHeadless,
      locale: env.locale,
      /* The clock the PAGE reports. A container runs on UTC while the account
         has posted from Asia/Jerusalem for years, and a page can read its own
         timezone in one line — a free difference, so it is closed. */
      timezoneId: env.timezone,
      ...(env.proxy ? { proxy: env.proxy } : {}),
      viewport: wantHeadless ? { width: 1280, height: 900 } : null,
      args: ['--disable-notifications'],
      ignoreDefaultArgs: ['--enable-automation'],
    };
    try {
      this.context = await this.launch(common);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      /*
       * A Chrome window from an earlier run still holds the profile
       * directory, so the new one exits the moment it starts. This is the
       * most common startup failure by a wide margin, and it is entirely
       * self-inflicted: the window holding the lock is one the worker itself
       * opened. Handing the owner a Get-CimInstance one-liner to paste is not
       * a fix, so the worker clears its own lock and tries once more.
       */
      if (isProfileLocked(msg)) {
        console.warn('[worker] הפרופיל היה תפוס מריצה קודמת — סוגר את החלון שנשאר פתוח ומנסה שוב.');
        await releaseProfile();
        try {
          this.context = await this.launch(common);
        } catch (retryErr) {
          const retryMsg = retryErr instanceof Error ? retryErr.message : String(retryErr);
          if (isProfileLocked(retryMsg)) {
            throw new Error(
              `נשאר חלון דפדפן פתוח שמחזיק את הפרופיל, ולא הצלחתי לסגור אותו לבד (${env.profileDir}).\n` +
                '   סגרו ידנית את חלונות ה-Chrome שה-worker פתח (הלשוניות about:blank / facebook), ואז הריצו שוב.',
            );
          }
          throw new Error(launchFailureMessage(retryMsg));
        }
      } else {
        throw new Error(launchFailureMessage(msg));
      }
    }
    this.context.setDefaultTimeout(30_000);
    /*
     * THE ONE LINE THAT MAKES page.evaluate WORK AT ALL HERE.
     *
     * This worker runs its TypeScript through tsx, whose esbuild is configured
     * to keep function names: every `const f = () => …` compiles to
     * `const f = __name(() => …, 'f')`, with the `__name` helper defined in the
     * Node module. A function handed to page.evaluate is shipped to the browser
     * as source — so the `__name` call travels with it and the helper does not,
     * and the code dies in the page with "ReferenceError: __name is not
     * defined" before its first statement.
     *
     * It cost four rounds to find, because every caller here wraps its evaluate
     * in `.catch(() => null)` — correctly, since none of them may fail a login
     * check — so the failure was indistinguishable from "the page did not have
     * it". That is how a name could be read from the raw HTML while every DOM
     * read on the very same page came back empty.
     *
     * Defining the helper in the page makes those calls mean what they say.
     * Passed as a string on purpose: a function here would be compiled by the
     * same esbuild and carry the same undefined call into the page.
     */
    await this.context.addInitScript({
      content: 'globalThis.__name = globalThis.__name || function (f) { return f; };',
    });
    this.context.on('close', () => {
      this.context = null;
    });
    return this.context;
  }

  /** The three ways this project can reach a Chrome, in one place. */
  private launch(common: Parameters<typeof chromium.launchPersistentContext>[1]): Promise<BrowserContext> {
    if (env.browserExecutable) return chromium.launchPersistentContext(env.profileDir, { ...common, executablePath: env.browserExecutable });
    if (env.browserChannel === 'chromium') return chromium.launchPersistentContext(env.profileDir, common);
    return chromium.launchPersistentContext(env.profileDir, { ...common, channel: env.browserChannel });
  }

  async newPage(headless: boolean, why = 'לא מסומן'): Promise<Page> {
    const ctx = await this.ensure(headless);
    notePageOpen(why);
    return ctx.newPage();
  }

  async close(): Promise<void> {
    if (!this.context) return;
    const ctx = this.context;
    this.context = null;
    await ctx.close().catch(() => undefined);
  }

  /** Is there a logged-in Facebook user in the profile? (c_user cookie) */
  async hasLoginCookie(): Promise<boolean> {
    if (!this.context) return false;
    const cookies = await this.context.cookies('https://www.facebook.com');
    return cookies.some((c) => c.name === 'c_user' && c.value);
  }

  /**
   * Opens facebook.com and reports the session state without touching
   * anything. Used by "בדוק חיבור" and before every batch of jobs.
   */
  async checkLogin(headless: boolean): Promise<{ state: 'connected' | 'needs_auth'; detail: string; account?: AccountProfile | null }> {
    if (!this.hasProfile()) return { state: 'needs_auth', detail: 'אין עדיין פרופיל דפדפן — לחצו "התחבר לפייסבוק".' };
    const page = await this.newPage(headless, 'בדיקת התחברות');
    try {
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(2500);
      const kind = await classifyPage(page);
      if (kind === 'checkpoint') return { state: 'needs_auth', detail: 'Facebook מציג בדיקת אבטחה — פתחו את הדפדפן וטפלו בה.' };
      if (kind === 'login' || !(await this.hasLoginCookie())) return { state: 'needs_auth', detail: 'לא מחובר לפייסבוק — לחצו "התחבר לפייסבוק".' };
      /*
       * WHO is signed in, read here because here is the one moment the worker
       * already has facebook.com open in its own profile. A separate page load
       * for this would be a second visit per check, for a fact that cannot
       * change without this very check noticing.
       *
       * Best-effort: a failure returns null and the login is still connected.
       * Knowing the session works matters more than knowing whose it is.
       */
      const account = await readAccountProfile(page).catch(() => null);
      return { state: 'connected', detail: 'מחובר לפייסבוק.', account };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /** The signed-in id, or '' — the cookie itself rather than a yes/no. */
  private async currentUserId(): Promise<string> {
    if (!this.context) return '';
    const cookies = await this.context.cookies('https://www.facebook.com');
    return cookies.find((c) => c.name === 'c_user')?.value ?? '';
  }

  /**
   * THE PROFILES THIS ACCOUNT CAN SWITCH BETWEEN.
   *
   * One page load and one menu, read and closed. Deliberately NOT folded into
   * checkLogin, which runs on a ten-minute clock: a list that changes perhaps
   * twice a year does not justify opening Facebook's account menu a hundred
   * and forty times a day, and every avoidable click on somebody's real
   * account is one worth avoiding.
   */
  async listProfiles(headless: boolean): Promise<{ profiles: FacebookProfile[]; detail: string }> {
    if (!this.hasProfile()) return { profiles: [], detail: 'אין עדיין פרופיל דפדפן — צריך קודם להתחבר לפייסבוק.' };
    const page = await this.newPage(headless, 'רשימת פרופילים');
    try {
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(2500);
      const kind = await classifyPage(page);
      if (kind === 'checkpoint') return { profiles: [], detail: 'Facebook מציג בדיקת אבטחה — פתחו את הדפדפן וטפלו בה.' };
      if (kind === 'login' || !(await this.hasLoginCookie())) {
        return { profiles: [], detail: 'לא מחובר לפייסבוק — לחצו "התחבר לפייסבוק".' };
      }
      /*
       * WITH THE PICTURES, and only here.
       *
       * This is the one command whose whole purpose is to build the list the
       * owner picks from, so it is the right place to pay a second for each
       * face. The switch below reads the menu again afterwards and takes them
       * too — a list whose pictures went stale the moment it was used would be
       * a list that shows logos once.
       */
      const read = await readProfiles(page, { pictures: true });
      if (read.profiles.length) {
        return { profiles: read.profiles, detail: `נמצאו ${read.profiles.length} פרופילים בחשבון הזה.` };
      }
      /*
       * THE THREE WAYS OF FINDING NOTHING ARE NOT THE SAME FACT, and the
       * screen this reaches is read by somebody deciding whether their
       * business profile exists. "No second profile" is an answer; "we could
       * not read the menu" is a fault. Saying the first when the second
       * happened is the mistake this whole module is written against.
       */
      return {
        profiles: [],
        detail:
          read.note === 'no-anchor'
            ? 'לא מצאנו רשימת פרופילים בחשבון הזה. אם יש בו פרופיל נוסף, ייתכן שפייסבוק שינתה את התפריט — שלחו לנו צילום מסך של התפריט.'
            : read.note === 'no-menu'
              ? 'לא הצלחנו לפתוח את תפריט החשבון בפייסבוק. נסו שוב בעוד רגע.'
              : 'תפריט החשבון נפתח אבל לא זוהו בו פרופילים.',
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /**
   * MOVE THE BROWSER ONTO ANOTHER PROFILE.
   *
   * What makes this safe to automate is that it decides nothing: it presses
   * Facebook's own row and then asks the cookie who it is now. A switch that
   * Facebook refused, answered with a security check, or simply ignored leaves
   * c_user where it was, and that is reported as a failure — never as a
   * success nobody verified. Every group post after this goes out under the
   * name this returns, so a confident wrong answer here would be the worst
   * kind in the product.
   */
  async switchTo(
    headless: boolean,
    name: string,
  ): Promise<{ ok: boolean; detail: string; account?: AccountProfile | null; profiles?: FacebookProfile[] }> {
    if (!this.hasProfile()) return { ok: false, detail: 'אין עדיין פרופיל דפדפן — צריך קודם להתחבר לפייסבוק.' };
    const page = await this.newPage(headless, 'מעבר בין פרופילים');
    try {
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(2500);
      if ((await classifyPage(page)) !== 'ok' || !(await this.hasLoginCookie())) {
        return { ok: false, detail: 'לא מחובר לפייסבוק — לחצו "התחבר לפייסבוק".' };
      }
      const before = await this.currentUserId();
      const pressed = await switchProfile(page, name);
      if (pressed === 'no-menu') return { ok: false, detail: 'לא הצלחנו לפתוח את תפריט החשבון בפייסבוק. נסו שוב בעוד רגע.' };
      if (pressed === 'not-found') {
        return { ok: false, detail: `לא מצאנו פרופיל בשם "${name}" בתפריט. רעננו את רשימת הפרופילים ונסו שוב.` };
      }
      if ((await classifyPage(page)) === 'checkpoint') {
        return { ok: false, detail: 'פייסבוק ביקשה אימות באמצע המעבר — פתחו את הדפדפן וטפלו בזה.' };
      }
      const after = await this.currentUserId();
      const account = await readAccountProfile(page).catch(() => null);
      if (!after || after === before) {
        /* The name is the one thing that can still prove it: Facebook keeps a
           single c_user across some profile pairs, and a switch that changed
           the rendered name changed the identity whatever the cookie says. */
        if (account?.name && account.name === name) {
          return { ok: true, detail: `עברנו לפרופיל "${name}".`, account };
        }
        return { ok: false, detail: `פייסבוק לא השלימה את המעבר ל"${name}". החשבון נשאר כפי שהיה.`, account };
      }
      const read = await readProfiles(page, { pictures: true }).catch(() => null);
      return {
        ok: true,
        detail: `עברנו לפרופיל "${account?.name || name}". מכאן כל פרסום יוצא ממנו.`,
        account,
        profiles: read?.profiles,
      };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /**
   * "התחבר לפייסבוק": a headed window on Facebook's own login page.
   *
   * Two ways in, and the difference is only who does the typing.
   *
   * Without credentials the window simply opens and waits — the person at the
   * machine signs in themselves and the worker never sees anything.
   *
   * With credentials, the worker fills Facebook's own form and presses its own
   * button. That exists because this product is meant to be sold: a customer
   * buys it, enters their details on their phone, and their account publishes
   * to their groups, without anyone walking to the computer. The fields are
   * matched by `name` (email / pass), which is an attribute on Facebook's form
   * rather than a word in any language — the same discipline the rest of this
   * module keeps.
   *
   * WHAT IT DOES NOT DO is decide the login worked. Facebook answers a
   * password with two-factor codes, device approvals and security checks, and
   * the loop below is unchanged for exactly that reason: it waits for a real
   * session cookie on a page that is not a checkpoint, with the window left
   * open so a person can finish what Facebook asked for. Typing the password
   * skips a step; it does not skip Facebook.
   *
   * The credentials are used here and nowhere else. They are not stored, not
   * logged, and not returned.
   */
  async interactiveLogin(
    credentials?: { user: string; pass: string } | null,
    hooks?: { onChallenge?: (screenshot: Buffer) => Promise<string | null> },
    timeoutMs = 15 * 60_000,
  ): Promise<{ state: 'connected' | 'needs_auth'; detail: string }> {
    const page = await this.newPage(false, 'התחברות ידנית');
    try {
      await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      if (credentials?.user && credentials.pass) {
        /*
         * Best-effort, and deliberately silent on failure: if the form is not
         * where we expect it, the window is already open on the login page and
         * the person can type into it. A thrown error here would turn a
         * working manual path into a failed command.
         */
        try {
          await page.fill('input[name="email"]', credentials.user, { timeout: 15_000 });
          await page.fill('input[name="pass"]', credentials.pass, { timeout: 15_000 });
          await page.press('input[name="pass"]', 'Enter');
          await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => undefined);
        } catch {
          /* leave the window on the login page for a person to finish */
        }
      }
      const deadline = Date.now() + timeoutMs;
      let asked = false;
      while (Date.now() < deadline) {
        if (page.isClosed()) break;
        if (await this.hasLoginCookie()) {
          const kind = await classifyPage(page).catch(() => 'ok' as PageKind);
          if (kind !== 'checkpoint') {
            await page.waitForTimeout(1500);
            return { state: 'connected', detail: 'ההתחברות הצליחה. הפרופיל נשמר מקומית.' };
          }
        }
        /*
         * FACEBOOK IS ASKING SOMEBODY SOMETHING — AND NOBODY IS IN THE ROOM.
         *
         * A code, a device approval, a "was this you". Until now the answer
         * was "go to the computer and type it", which works for one owner with
         * the machine next door and not at all for the thing this is becoming:
         * a customer whose browser runs on a server they will never see.
         *
         * So the question is carried to them. The page is photographed as it
         * is — whatever Facebook is showing, in whatever language, without
         * this code needing to understand a word of it — and the hook puts it
         * on their screen and waits for what they type back. Then it is typed
         * in here and the loop carries on waiting for a real session, exactly
         * as before: answering the challenge is not the same as passing it.
         *
         * Asked once per login. A second prompt for a challenge already
         * answered would be a screen showing a stale question.
         */
        if (!asked && hooks?.onChallenge) {
          const kind = await classifyPage(page).catch(() => 'ok' as PageKind);
          if (kind === 'checkpoint') {
            asked = true;
            const shot = await page.screenshot({ type: 'png', timeout: 15_000 }).catch(() => null);
            const answer = shot ? await hooks.onChallenge(shot).catch(() => null) : null;
            if (answer) await typeChallengeAnswer(page, answer);
          }
        }
        await page.waitForTimeout(3000);
      }
      return { state: 'needs_auth', detail: 'ההתחברות לא הושלמה בזמן (או שהחלון נסגר). נסו שוב.' };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /** "נתק": close the browser and delete the local profile (cookies included). */
  async logout(): Promise<void> {
    await this.close();
    if (existsSync(env.profileDir)) rmSync(env.profileDir, { recursive: true, force: true });
  }
}

/**
 * Put the person's answer into whatever field Facebook is asking with.
 *
 * Structural, not linguistic, like every other read in this module. The
 * classic two-factor field is `input[name="approvals_code"]`; a checkpoint
 * that wants something else still asks with a visible text box, so the
 * fallback is the first one on the page rather than a label in any language.
 * Enter submits, because every one of these forms is a single field.
 */
async function typeChallengeAnswer(page: Page, answer: string): Promise<void> {
  const field = page
    .locator('input[name="approvals_code"], input[name="code"], input[type="tel"], input[type="text"]')
    .first();
  try {
    await field.waitFor({ state: 'visible', timeout: 10_000 });
    await field.fill(answer.trim());
    await field.press('Enter');
    await page.waitForLoadState('domcontentloaded', { timeout: 30_000 }).catch(() => undefined);
  } catch {
    /* The window is open on the page that asked; a person can still finish it. */
  }
}

/** Login page, security interstitial, or a normal page? */
export async function classifyPage(page: Page): Promise<PageKind> {
  const url = new URL(page.url());
  const path = url.pathname.toLowerCase();
  if (CHECKPOINT_PATHS.some((p) => path.startsWith(p))) return 'checkpoint';
  if (LOGIN_PATHS.some((p) => path === p || path.startsWith(p))) return 'login';
  try {
    if (await fb.checkpointText(page).isVisible({ timeout: 500 })) return 'checkpoint';
  } catch {
    /* not present */
  }
  try {
    const title = await page.title();
    if (patterns.loginPage.test(title)) return 'login';
    for (const c of fb.loginForm(page)) {
      if (await c.first().isVisible({ timeout: 300 }).catch(() => false)) return 'login';
    }
  } catch {
    /* ignore */
  }
  return 'ok';
}

export function assertUsable(kind: PageKind): void {
  if (kind === 'login') throw new SessionError('login', 'Facebook מבקש להתחבר מחדש. לחצו "התחבר לפייסבוק" בלוח הבקרה.');
  if (kind === 'checkpoint')
    throw new SessionError('checkpoint', 'Facebook דורש פעולה ידנית (אימות / בדיקת אבטחה / חסימה זמנית). פתחו את הדפדפן, טפלו בזה, ואז "בדוק שוב".');
}
