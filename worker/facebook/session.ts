import { execFileSync } from 'node:child_process';
import { existsSync, rmSync } from 'node:fs';
import path from 'node:path';
import { chromium, type BrowserContext, type Page } from 'playwright-core';
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
  async checkLogin(headless: boolean): Promise<{ state: 'connected' | 'needs_auth'; detail: string }> {
    if (!this.hasProfile()) return { state: 'needs_auth', detail: 'אין עדיין פרופיל דפדפן — לחצו "התחבר לפייסבוק".' };
    const page = await this.newPage(headless);
    try {
      await page.goto('https://www.facebook.com/', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      await page.waitForTimeout(2500);
      const kind = await classifyPage(page);
      if (kind === 'checkpoint') return { state: 'needs_auth', detail: 'Facebook מציג בדיקת אבטחה — פתחו את הדפדפן וטפלו בה.' };
      if (kind === 'login' || !(await this.hasLoginCookie())) return { state: 'needs_auth', detail: 'לא מחובר לפייסבוק — לחצו "התחבר לפייסבוק".' };
      return { state: 'connected', detail: 'מחובר לפייסבוק.' };
    } finally {
      await page.close().catch(() => undefined);
    }
  }

  /**
   * "התחבר לפייסבוק": a headed window on the login page; the owner types
   * their own credentials (the worker never sees them). Resolves once the
   * login cookie appears or the timeout passes.
   */
  async interactiveLogin(timeoutMs = 15 * 60_000): Promise<{ state: 'connected' | 'needs_auth'; detail: string }> {
    const page = await this.newPage(false);
    try {
      await page.goto('https://www.facebook.com/login', { waitUntil: 'domcontentloaded', timeout: 60_000 });
      const deadline = Date.now() + timeoutMs;
      while (Date.now() < deadline) {
        if (page.isClosed()) break;
        if (await this.hasLoginCookie()) {
          const kind = await classifyPage(page).catch(() => 'ok' as PageKind);
          if (kind !== 'checkpoint') {
            await page.waitForTimeout(1500);
            return { state: 'connected', detail: 'ההתחברות הצליחה. הפרופיל נשמר מקומית.' };
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
