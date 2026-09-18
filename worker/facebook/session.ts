import { existsSync, rmSync } from 'node:fs';
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
      this.context = env.browserExecutable
        ? await chromium.launchPersistentContext(env.profileDir, { ...common, executablePath: env.browserExecutable })
        : env.browserChannel === 'chromium'
          ? await chromium.launchPersistentContext(env.profileDir, common)
          : await chromium.launchPersistentContext(env.profileDir, { ...common, channel: env.browserChannel });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      throw new Error(
        `לא הצלחתי לפתוח דפדפן (${env.browserChannel}). התקינו Google Chrome או הריצו "npx playwright-core install chromium" והגדירו SOCIAL_BROWSER_CHANNEL=chromium. פרטים: ${msg.split('\n')[0]}`,
      );
    }
    this.context.setDefaultTimeout(30_000);
    this.context.on('close', () => {
      this.context = null;
    });
    return this.context;
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
