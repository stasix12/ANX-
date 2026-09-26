import { existsSync, readFileSync } from 'node:fs';
import { homedir, hostname } from 'node:os';
import path from 'node:path';

/**
 * Worker configuration. Reads .env.local (same file Next.js uses) and the
 * process environment. Only the Supabase login + browser preferences live
 * here — the Facebook login itself happens in the real browser window and
 * stays inside the local Chrome profile directory.
 */

function loadDotEnv(file: string): void {
  if (!existsSync(file)) return;
  for (const line of readFileSync(file, 'utf8').split('\n')) {
    const m = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/i);
    if (!m || m[1] in process.env) continue;
    process.env[m[1]] = m[2].replace(/^(['"])(.*)\1$/, '$2');
  }
}

loadDotEnv(path.resolve(process.cwd(), '.env.local'));
loadDotEnv(path.resolve(process.cwd(), '.env'));

function required(name: string): string {
  const v = process.env[name];
  if (!v) throw new Error(`חסר משתנה סביבה ${name} (ראו docs/SOCIAL.md → Local Worker).`);
  return v;
}

/** Lazy getters: a missing variable only fails when it is actually needed. */
export const env = {
  get supabaseUrl() {
    return required('NEXT_PUBLIC_SUPABASE_URL');
  },
  get supabaseAnonKey() {
    return required('NEXT_PUBLIC_SUPABASE_ANON_KEY');
  },
  get workerName() {
    return process.env.SOCIAL_WORKER_NAME ?? `worker@${hostname()}`;
  },
  /**
   * Everything this machine remembers between runs: the Facebook browser
   * profile, and the Supabase session once the worker signs itself in. Outside
   * the repository on purpose — a folder that gets pulled, zipped or handed to
   * somebody else must never contain either of them.
   */
  get stateDir() {
    return process.env.SOCIAL_WORKER_STATE_DIR ?? path.join(homedir(), '.hapitaron-social');
  },
  /** Where the logged-in Facebook profile lives. Outside the repo by default. */
  get profileDir() {
    return process.env.SOCIAL_BROWSER_PROFILE_DIR ?? path.join(this.stateDir, 'facebook-profile');
  },
  /**
   * The owner's own login, and now OPTIONAL.
   *
   * It is how this worker has always authenticated and it still wins when it
   * is set, so the machine that publishes today does not change at all. When
   * it is absent — which is every copy handed to somebody else — the worker
   * signs in with a one-time code sent to the customer's own email instead,
   * and remembers the session. See worker/sign-in.ts.
   */
  get workerEmailOptional() {
    return process.env.SOCIAL_WORKER_EMAIL ?? '';
  },
  get workerPasswordOptional() {
    return process.env.SOCIAL_WORKER_PASSWORD ?? '';
  },
  /** 'chrome' uses the installed Google Chrome; 'chromium' uses Playwright's build. */
  get browserChannel() {
    return (process.env.SOCIAL_BROWSER_CHANNEL ?? 'chrome') as 'chrome' | 'msedge' | 'chromium';
  },
  get browserExecutable() {
    return process.env.SOCIAL_BROWSER_EXECUTABLE;
  },
  /** Force headed regardless of the dashboard setting. */
  get forceHeaded() {
    return process.env.SOCIAL_BROWSER_HEADED === '1';
  },
  get pollMs() {
    return Number(process.env.SOCIAL_WORKER_POLL_MS ?? 5000);
  },
  get locale() {
    return process.env.SOCIAL_BROWSER_LOCALE ?? 'he-IL';
  },
  /**
   * The clock the BROWSER reports, which is not the machine's.
   *
   * A container runs on UTC. The account it signs in as posts from Be'er
   * Sheva, and the page can read its own timezone in one line — so a session
   * that says UTC while the account has said Asia/Jerusalem for years is a
   * difference Facebook can see for free. Defaulted rather than required:
   * on the owner's own PC it already matches, and pinning it there changes
   * nothing.
   */
  get timezone() {
    return process.env.SOCIAL_BROWSER_TIMEZONE ?? 'Asia/Jerusalem';
  },
  /**
   * An outbound proxy for the browser, when the machine's own address is the
   * problem.
   *
   * Moving the worker off the owner's PC moves it to a datacenter address,
   * and a datacenter address is the single thing most likely to turn a
   * working session into a security check. Set these to route the browser
   * through a residential address in the country the account actually lives
   * in; leave them unset and nothing changes.
   */
  get proxy() {
    const server = process.env.SOCIAL_BROWSER_PROXY;
    if (!server) return undefined;
    return {
      server,
      username: process.env.SOCIAL_BROWSER_PROXY_USER,
      password: process.env.SOCIAL_BROWSER_PROXY_PASS,
    };
  },
};
