import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
import { readAccountProfile, type AccountProfile } from './account';
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

  async newPage(headless: boolean): Promise<Page> {
    const ctx = await this.ensure(headless);
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
    const page = await this.newPage(headless);
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
    const page = await this.newPage(false);
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
