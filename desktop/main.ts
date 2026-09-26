/*
 * ANX Worker — the desktop shell.
 *
 * WHAT LIVES HERE AND WHAT DOES NOT.
 *
 * The publishing worker is a separate, unchanged program: one bundled file
 * beside this one, started as a child process. Not one line of its logic is in
 * here, and that is deliberate — it is the part that has been fixed a hundred
 * times against a real Facebook, and a redesign of a window must not be able
 * to break it.
 *
 * This process owns three things the worker does not:
 *
 *   1. SIGNING IN. The window asks for an email and a password (or a code),
 *      and the session is written to the same file the worker reads. So the
 *      worker never has to prompt: by the time it starts, it is already
 *      somebody's.
 *
 *   2. READING, FOR THE SCREEN. The dashboard's numbers come from the same
 *      tables the website reads, through the same policies, with the signed-in
 *      person's own token. The ONE thing it writes is a command row — "open
 *      Facebook", "check the connection", "disconnect" — and only because a
 *      person pressed a button that says so. It never writes a post, a queue
 *      row or a setting: those belong to the website and to the engine.
 *
 *   3. BEING A WINDOWS PROGRAM. Tray, minimise-instead-of-quit, start with
 *      Windows, a small always-there panel. The console it replaces could do
 *      none of that.
 *
 * WHO REFRESHES THE TOKEN. The worker does, and only the worker. Two clients
 * refreshing the same refresh token is a race that ends with one of them
 * signed out — and the one that must never be signed out is the one
 * publishing. So the reads below carry the access token as a bare header:
 * no session, no refresh, no writes to the session file after sign-in.
 */
import { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage, Notification } from 'electron';
import { createClient, type SupabaseClient } from '@supabase/supabase-js';
import { spawn, type ChildProcess } from 'node:child_process';
import { createServer } from 'node:http';
import path from 'node:path';
import fs from 'node:fs';
import os from 'node:os';
import { QUEUE_LIFECYCLE, NEEDS_HUMAN_STATUSES } from '../src/lib/social/status';
import { activityKind } from '../src/lib/social/activity';
import type { QueueStatus } from '../src/lib/social/types';

const here = __dirname;

/*
 * WHERE THE ENGINE ACTUALLY IS ON DISK, once this is a packaged app.
 *
 * electron-builder puts everything inside app.asar — a single archive. Electron
 * teaches its own `fs` to read through it, so loadFile() and readFileSync()
 * work on paths inside it and there is no sign anything is unusual.
 *
 * A CHILD PROCESS IS NOT ELECTRON'S fs. `spawn` goes to the operating system,
 * which has never heard of app.asar: the script is not a file it can open, and
 * a `cwd` inside the archive is not a directory it can enter. The failure it
 * returns is ENOENT against the executable's own name, which is why the error
 * a person sees names HaPitaron.exe — a file that plainly exists, and is not
 * the thing that was missing.
 *
 *   Error: spawn C:\...\HaPitaron.exe ENOENT
 *
 * So worker.cjs and its node_modules are kept OUT of the archive
 * (`asarUnpack` in electron-builder.yml), and the path is rewritten to the
 * unpacked copy beside it. Unpacked development runs have no app.asar in the
 * path at all, so the replace is a no-op there and one code path serves both.
 */
const onDisk = (p: string): string =>
  p.replace(`app.asar${path.sep}`, `app.asar.unpacked${path.sep}`);
const WORKER_ENTRY = onDisk(path.join(here, 'worker.cjs'));
const WORKER_CWD = path.dirname(WORKER_ENTRY);
const config = JSON.parse(fs.readFileSync(path.join(here, 'config.json'), 'utf8')) as {
  supabaseUrl: string;
  supabaseAnonKey: string;
  siteUrl: string;
};

const stateDir = process.env.SOCIAL_WORKER_STATE_DIR ?? path.join(os.homedir(), '.hapitaron-social');
const sessionFile = path.join(stateDir, 'session.json');
const prefsFile = path.join(stateDir, 'prefs.json');

/* ------------------------------------------------------------------ prefs */

/*
 * Settings that belong to this machine rather than to the account: whether to
 * start with Windows, whether closing the window means hide or quit, the
 * theme. They are per-computer by nature — a customer with a laptop and a
 * desktop wants different answers — so they are a local file and not a row.
 */
type Prefs = {
  openAtLogin: boolean;
  keepRunning: boolean;
  minimizeToTray: boolean;
  autoUpdates: boolean;
  notifications: boolean;
  startMinimized: boolean;
  theme: 'dark' | 'light';
  lang: 'he';
};
const DEFAULT_PREFS: Prefs = {
  openAtLogin: true,
  keepRunning: true,
  minimizeToTray: true,
  autoUpdates: true,
  notifications: true,
  startMinimized: false,
  theme: 'dark',
  lang: 'he',
};
function readPrefs(): Prefs {
  try {
    return { ...DEFAULT_PREFS, ...JSON.parse(fs.readFileSync(prefsFile, 'utf8')) };
  } catch {
    return { ...DEFAULT_PREFS };
  }
}
function writePrefs(next: Prefs): void {
  fs.mkdirSync(stateDir, { recursive: true });
  fs.writeFileSync(prefsFile, JSON.stringify(next, null, 2));
}
let prefs = readPrefs();

/* ---------------------------------------------------------------- session */

/*
 * The session file supabase-js writes: a bag of keys, one of which holds the
 * tokens. Read rather than imported so that this process has no opinion about
 * the worker's storage format beyond "find the object with an access_token".
 */
function readSession(): { access_token: string; refresh_token: string; expires_at?: number; user?: { email?: string } } | null {
  try {
    const bag = JSON.parse(fs.readFileSync(sessionFile, 'utf8')) as Record<string, string>;
    for (const value of Object.values(bag)) {
      try {
        const parsed = JSON.parse(value);
        if (parsed && typeof parsed === 'object' && parsed.access_token) return parsed;
      } catch {
        /* Not every key holds JSON — the PKCE verifier is a bare string. */
      }
    }
  } catch {
    /* No file, or a half-written one. Both mean "not signed in". */
  }
  return null;
}

/* A client that reads as the signed-in person and can do nothing else. */
let reader: SupabaseClient | null = null;
let readerToken = '';
function readerFor(token: string): SupabaseClient {
  if (reader && readerToken === token) return reader;
  readerToken = token;
  reader = createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { headers: { Authorization: `Bearer ${token}` } },
  });
  return reader;
}

/* The one client allowed to WRITE the session file: used during sign-in only,
   and torn down the moment the worker takes over the refreshing. */
function authClient(): SupabaseClient {
  return createClient(config.supabaseUrl, config.supabaseAnonKey, {
    auth: {
      persistSession: true,
      autoRefreshToken: false,
      detectSessionInUrl: false,
      storage: {
        getItem: (key) => {
          try {
            return (JSON.parse(fs.readFileSync(sessionFile, 'utf8')) as Record<string, string>)[key] ?? null;
          } catch {
            return null;
          }
        },
        setItem: (key, value) => {
          fs.mkdirSync(stateDir, { recursive: true });
          let bag: Record<string, string> = {};
          try {
            bag = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
          } catch {
            /* first write */
          }
          bag[key] = value;
          const tmp = `${sessionFile}.tmp`;
          fs.writeFileSync(tmp, JSON.stringify(bag), { mode: 0o600 });
          fs.renameSync(tmp, sessionFile);
        },
        removeItem: (key) => {
          try {
            const bag = JSON.parse(fs.readFileSync(sessionFile, 'utf8'));
            delete bag[key];
            fs.writeFileSync(sessionFile, JSON.stringify(bag), { mode: 0o600 });
          } catch {
            /* nothing to remove */
          }
        },
      },
    },
  });
}

/* ----------------------------------------------------------------- window */

let win: BrowserWindow | null = null;
let mini: BrowserWindow | null = null;
let tray: Tray | null = null;
let worker: ChildProcess | null = null;
let quitting = false;
let paused = false;

/*
 * The worker's own output, kept for the "יומן טכני" drawer. It is no longer
 * the interface — the whole point of this redesign — but it is still the only
 * thing that explains a failure, so it is one click away rather than gone.
 */
type Line = { line: string; kind: 'out' | 'err' | 'sys' | 'prompt' | 'you'; at: number };
const scrollback: Line[] = [];
const MAX_LINES = 500;

function send(channel: string, payload: unknown): void {
  for (const w of [win, mini]) {
    if (w && !w.isDestroyed()) w.webContents.send(channel, payload);
  }
}

function say(line: string, kind: Line['kind'] = 'out'): void {
  const entry: Line = { line, kind, at: Date.now() };
  scrollback.push(entry);
  if (scrollback.length > MAX_LINES) scrollback.shift();
  send('worker:line', entry);
}

function workerState() {
  return { running: !!worker && !paused, paused, signedIn: !!readSession(), email: readSession()?.user?.email ?? '' };
}

function createWindow(): void {
  if (win && !win.isDestroyed()) {
    if (win.isMinimized()) win.restore();
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    width: 1180,
    height: 760,
    /* Below this the sidebar and the cards cannot both be honest, so the
       window refuses to get smaller rather than overlapping its own content. */
    minWidth: 900,
    minHeight: 600,
    title: 'ANX Worker',
    backgroundColor: prefs.theme === 'light' ? '#f6f7fb' : '#0f1117',
    autoHideMenuBar: true,
    show: false,
    icon: path.join(here, 'icon.png'),
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(here, 'renderer', 'index.html'));
  win.once('ready-to-show', () => win?.show());
  win.webContents.on('did-finish-load', () => {
    send('worker:history', scrollback);
    send('worker:state', workerState());
    send('prefs', prefs);
  });
  win.on('close', (e) => {
    if (quitting || !prefs.minimizeToTray) return;
    e.preventDefault();
    win?.hide();
    notifyOnce();
  });
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

let warned = false;
function notifyOnce(): void {
  if (warned || !prefs.notifications) return;
  warned = true;
  if (!Notification.isSupported()) return;
  new Notification({
    title: 'ANX Worker ממשיך לעבוד',
    body: 'הפרסומים ימשיכו לצאת. הסמל נשאר ליד השעון.',
  }).show();
}

/*
 * THE SMALL PANEL. Asked for so that "is it working?" can be answered without
 * opening anything: a frameless strip that sits where the person put it, shows
 * the two numbers that matter, and gets out of the way.
 */
function toggleMini(): void {
  if (mini && !mini.isDestroyed()) {
    mini.close();
    mini = null;
    return;
  }
  mini = new BrowserWindow({
    width: 320,
    height: 252,
    resizable: false,
    frame: false,
    skipTaskbar: true,
    alwaysOnTop: true,
    backgroundColor: '#0f1117',
    webPreferences: {
      preload: path.join(here, 'preload.cjs'),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  mini.loadFile(path.join(here, 'renderer', 'mini.html'));
  mini.on('closed', () => { mini = null; });
  mini.webContents.on('did-finish-load', () => {
    send('worker:state', workerState());
    void pushData();
  });
}

/* ----------------------------------------------------------- the worker */

function startWorker(): void {
  if (worker || paused) return;
  say('מפעיל את מנוע הפרסום…', 'sys');
  worker = spawn(process.execPath, [WORKER_ENTRY], {
    cwd: WORKER_CWD,
    env: {
      ...process.env,
      ELECTRON_RUN_AS_NODE: '1',
      NEXT_PUBLIC_SUPABASE_URL: config.supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: config.supabaseAnonKey,
      SOCIAL_WORKER_STATE_DIR: stateDir,
      /*
       * The window signs people in now, so the worker should never need to
       * ask. Left at '1' all the same: if a session is somehow missing when
       * it starts, a prompt in the technical log is recoverable, and silence
       * is not.
       */
      SOCIAL_WORKER_PROMPTABLE: '1',
      /* Never carried into a customer's copy. */
      SOCIAL_WORKER_EMAIL: '',
      SOCIAL_WORKER_PASSWORD: '',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const feed = (kind: Line['kind']) => {
    let buffer = '';
    return (chunk: Buffer) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) say(line.replace(/\r$/, ''), kind);
      /* A prompt has no newline, which is why a line-buffered reader would
         wait for ever on the one line somebody is meant to answer. */
      if (buffer.trim().endsWith(':')) {
        say(buffer, 'prompt');
        buffer = '';
      }
    };
  };
  worker.stdout?.on('data', feed('out'));
  worker.stderr?.on('data', feed('err'));

  worker.on('exit', (code) => {
    worker = null;
    send('worker:state', workerState());
    if (quitting || paused) return;
    say(`המנוע נעצר (${code}). מפעיל מחדש בעוד 30 שניות…`, 'sys');
    setTimeout(() => { if (!quitting && !paused) startWorker(); }, 30_000);
  });
  send('worker:state', workerState());
}

function stopWorker(): void {
  worker?.kill();
  worker = null;
  send('worker:state', workerState());
}

/* ------------------------------------------------------------- the data */

/*
 * Everything the dashboard shows, in one read, every few seconds while a
 * window is open. Read-only and tenant-scoped by the policies themselves —
 * this process holds the person's own token and nothing more, so it can see
 * exactly what their dashboard on the website sees, and no more.
 */
const TAB_OF: Record<QueueStatus, 'active' | 'waiting' | 'done' | 'failed'> = {
  publishing: 'active',
  awaiting_confirmation: 'active',
  scheduled: 'waiting',
  manual_pending: 'waiting',
  paused: 'waiting',
  needs_attention: 'waiting',
  published: 'done',
  failed: 'failed',
  skipped: 'failed',
};

async function readData() {
  const session = readSession();
  if (!session) return null;
  const db = readerFor(session.access_token);
  const since = new Date(Date.now() - 30 * 24 * 3600_000).toISOString();
  const midnight = new Date();
  midnight.setHours(0, 0, 0, 0);

  const [queue, activity, workers] = await Promise.all([
    db
      .from('social_queue')
      /* The group's name comes along through the foreign key rather than in a
         second round trip, and row-level security applies to the embedded
         table exactly as it does to this one. */
      .select('id, status, step, scheduled_at, published_at, error, campaign_id, target:social_targets(name)')
      .gte('scheduled_at', since)
      .order('scheduled_at', { ascending: false })
      .limit(400),
    db
      .from('social_activity_log')
      .select('id, level, event, message, created_at, meta')
      .order('created_at', { ascending: false })
      .limit(60),
    db
      .from('social_workers')
      .select('name, status, browser_state, login_stage, fb_user_id, fb_user_name, fb_avatar_url, last_seen_at, version')
      .limit(5),
  ]);

  if (queue.error) return { error: queue.error.message };

  type Row = {
    id: string; status: QueueStatus; step: string; error: string;
    scheduled_at: string; published_at: string | null;
    target: { name: string } | { name: string }[] | null;
  };
  const rows = (queue.data ?? []) as Row[];
  const groupOf = (r: Row) => (Array.isArray(r.target) ? r.target[0]?.name : r.target?.name) ?? '';
  const counts = { all: rows.length, active: 0, waiting: 0, done: 0, failed: 0 };
  let doneToday = 0;
  let lastAt: string | null = null;
  for (const r of rows) {
    counts[TAB_OF[r.status] ?? 'waiting'] += 1;
    if (r.published_at) {
      if (new Date(r.published_at) >= midnight) doneToday += 1;
      if (!lastAt || r.published_at > lastAt) lastAt = r.published_at;
    }
  }
  const next = rows
    .filter((r) => QUEUE_LIFECYCLE[r.status] === 'waiting' && r.scheduled_at)
    .sort((a, b) => a.scheduled_at.localeCompare(b.scheduled_at))
    .find((r) => new Date(r.scheduled_at).getTime() > Date.now() - 3600_000);

  return {
    counts,
    doneToday,
    lastAt,
    nextAt: next?.scheduled_at ?? null,
    needsHuman: rows.filter((r) => NEEDS_HUMAN_STATUSES.includes(r.status)).length,
    tasks: rows.slice(0, 200).map((r) => ({
      id: r.id,
      status: r.status,
      tab: TAB_OF[r.status] ?? 'waiting',
      step: r.step,
      error: r.error,
      target: groupOf(r),
      scheduledAt: r.scheduled_at,
      publishedAt: r.published_at,
    })),
    activity: ((activity.data ?? []) as { id: string; level: string; event: string; message: string; created_at: string }[]).map((a) => ({
      id: a.id,
      kind: activityKind({ event: a.event, level: a.level as 'info' | 'warn' | 'error' }),
      level: a.level,
      event: a.event,
      message: a.message,
      at: a.created_at,
    })),
    machine: (workers.data ?? [])[0] ?? null,
  };
}

let dataTimer: NodeJS.Timeout | null = null;
async function pushData(): Promise<void> {
  try {
    const data = await readData();
    if (data) send('data', data);
  } catch (err) {
    send('data', { error: err instanceof Error ? err.message : String(err) });
  }
}
function startPolling(): void {
  if (dataTimer) return;
  void pushData();
  dataTimer = setInterval(() => {
    /* Nothing to draw on means nothing to fetch. A hidden window must not keep
       a laptop's radio awake every ten seconds for numbers nobody sees. */
    const visible = [win, mini].some((w) => w && !w.isDestroyed() && w.isVisible());
    if (visible) void pushData();
  }, 10_000);
}

/* ------------------------------------------------------------- signing in */

/*
 * THREE WAYS IN, and the reason there is more than one.
 *
 * A password is what people expect and what the design asks for; it is also
 * the same password that opens the dashboard, typed into a program the person
 * cannot read. That is a normal thing for desktop software to ask and it is
 * still worth offering an alternative, so a code by email sits one link away
 * and nothing is ever written to disk but the session that comes back.
 *
 * Google is a redirect, which a desktop app cannot do to itself. It opens the
 * real browser — where the person can see the address bar, which is the whole
 * security argument for OAuth — and catches the answer on a loopback port that
 * exists for the seconds it takes.
 */
function ok(): { ok: true } {
  return { ok: true };
}
function fail(message: string): { ok: false; message: string } {
  return { ok: false, message };
}

async function afterSignIn(): Promise<void> {
  /*
   * A BUSINESS OF THEIR OWN, ON THE FIRST SIGN-IN.
   *
   * Since v16 a person who belongs to no business sees no row and can create
   * none — correct, and until v19 there was nothing anywhere that gave them
   * one. A customer would sign in perfectly and land on an empty dashboard
   * with no explanation. social_claim_workspace() creates it, with default
   * settings, and returns the existing one for anybody who already has it —
   * so this is a no-op for the owner and runs exactly once per customer.
   *
   * A failure here is reported and does not stop the sign-in: the account is
   * valid either way, and an empty dashboard with a line in the log beats
   * being thrown back to a login screen that will accept the same details.
   */
  const session = readSession();
  if (session) {
    const { error } = await readerFor(session.access_token).rpc('social_claim_workspace', { business_name: '' });
    if (error) say(`לא הצלחנו להכין את סביבת העבודה: ${error.message}`, 'err');
  }
  send('worker:state', workerState());
  stopWorker();
  startWorker();
  startPolling();
  updateTray();
}

/*
 * THE FACEBOOK CONNECTION, STARTED FROM HERE.
 *
 * The typing happens on Facebook's own page, in a real Chrome window this
 * machine opens — never in a field of ours. All this does is put a row in the
 * command table that the engine is already polling, which is the same thing
 * the button on the website does. Without it a customer installs the app,
 * signs in, and has nowhere to connect the one account the whole product is
 * about.
 */
async function sendCommand(command: 'login' | 'check' | 'logout' | 'verify', payload?: Record<string, string>) {
  const session = readSession();
  if (!session) return fail('המחשב הזה לא מחובר לחשבון.');
  const { error } = await readerFor(session.access_token)
    .from('social_worker_commands')
    .insert({ worker_id: null, command, ...(payload ? { payload } : {}) });
  if (error) return fail(`לא הצלחנו לשלוח את הבקשה: ${error.message}`);
  say(`נשלחה בקשה למנוע: ${command}`, 'sys');
  return ok();
}
ipcMain.handle('fb:connect', () => sendCommand('login'));
ipcMain.handle('fb:check', () => sendCommand('check'));
ipcMain.handle('fb:disconnect', () => sendCommand('logout'));
ipcMain.handle('fb:verify', (_e, code: string) => sendCommand('verify', { code: String(code ?? '').trim() }));

ipcMain.handle('auth:password', async (_e, { email, password }: { email: string; password: string }) => {
  if (!email?.includes('@')) return fail('כתובת המייל לא נראית תקינה.');
  if (!password) return fail('צריך להקליד סיסמה.');
  const { error } = await authClient().auth.signInWithPassword({ email, password });
  if (error) {
    return fail(
      /invalid login/i.test(error.message)
        ? 'המייל או הסיסמה לא נכונים.'
        : `ההתחברות נכשלה: ${error.message}`,
    );
  }
  await afterSignIn();
  return ok();
});

ipcMain.handle('auth:otp-send', async (_e, { email }: { email: string }) => {
  if (!email?.includes('@')) return fail('כתובת המייל לא נראית תקינה.');
  /* shouldCreateUser stays false: signing up belongs on the website, where a
     person can read what they are agreeing to, and a typo here would make a
     second empty account and explain nothing. */
  const { error } = await authClient().auth.signInWithOtp({ email, options: { shouldCreateUser: false } });
  if (error) return fail(`לא הצלחנו לשלוח קוד: ${error.message}`);
  return ok();
});

ipcMain.handle('auth:otp-verify', async (_e, { email, token }: { email: string; token: string }) => {
  const clean = String(token ?? '').trim();
  const hash = clean.match(/[?&#]token_hash=([^&\s#]+)/i);
  const client = authClient();
  /* A code, or the whole link pasted: which of the two Supabase sends depends
     on one line in an email template, and the default is the link. */
  const { error } = hash
    ? await client.auth.verifyOtp({ token_hash: decodeURIComponent(hash[1]), type: 'email' })
    : await client.auth.verifyOtp({ email, token: clean.replace(/\s/g, ''), type: 'email' });
  if (error) return fail(`הקוד לא התקבל: ${error.message}`);
  await afterSignIn();
  return ok();
});

ipcMain.handle('auth:google', async () => {
  const client = authClient();
  /* A port the operating system picks, bound to the loopback only: nothing
     outside this machine can reach it, and it is closed the moment it answers
     once or two minutes pass, whichever comes first. */
  return await new Promise<{ ok: boolean; message?: string }>((resolve) => {
    const server = createServer(async (req, res) => {
      const url = new URL(req.url ?? '/', 'http://127.0.0.1');
      const code = url.searchParams.get('code');
      res.writeHead(200, { 'content-type': 'text/html; charset=utf-8' });
      res.end('<meta charset="utf-8"><body style="font-family:sans-serif;direction:rtl;padding:3rem">אפשר לחזור ל-ANX Worker.</body>');
      server.close();
      clearTimeout(timer);
      if (!code) return resolve(fail('לא קיבלנו תשובה מגוגל.'));
      const { error } = await client.auth.exchangeCodeForSession(code);
      if (error) return resolve(fail(`ההתחברות עם גוגל נכשלה: ${error.message}`));
      await afterSignIn();
      resolve(ok());
    });
    const timer = setTimeout(() => {
      server.close();
      resolve(fail('לא הושלמה התחברות עם גוגל.'));
    }, 120_000);
    server.listen(0, '127.0.0.1', async () => {
      const port = (server.address() as { port: number }).port;
      const { data, error } = await client.auth.signInWithOAuth({
        provider: 'google',
        options: { redirectTo: `http://127.0.0.1:${port}`, skipBrowserRedirect: true },
      });
      if (error || !data?.url) {
        server.close();
        clearTimeout(timer);
        resolve(fail(error ? `גוגל לא זמין: ${error.message}` : 'גוגל לא מוגדר במערכת.'));
        return;
      }
      await shell.openExternal(data.url);
    });
  });
});

ipcMain.handle('auth:signout', async () => {
  stopWorker();
  try {
    fs.unlinkSync(sessionFile);
  } catch {
    /* already gone */
  }
  reader = null;
  readerToken = '';
  send('worker:state', workerState());
  updateTray();
  return ok();
});

/* ------------------------------------------------------------------- IPC */

ipcMain.handle('app:state', () => ({ ...workerState(), prefs, site: config.siteUrl }));
ipcMain.handle('app:data', () => readData());
ipcMain.handle('prefs:set', (_e, patch: Partial<Prefs>) => {
  prefs = { ...prefs, ...patch };
  writePrefs(prefs);
  if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: prefs.openAtLogin, args: ['--hidden'] });
  send('prefs', prefs);
  return prefs;
});
ipcMain.on('worker:answer', (_e, text: string) => {
  worker?.stdin?.write(`${String(text)}\n`);
  say(String(text), 'you');
});
ipcMain.on('app:open-site', () => void shell.openExternal(config.siteUrl));
ipcMain.on('app:restart', () => { stopWorker(); startWorker(); });
ipcMain.on('app:pause', (_e, next: boolean) => {
  paused = !!next;
  if (paused) stopWorker();
  else startWorker();
  updateTray();
  send('worker:state', workerState());
});
ipcMain.on('app:mini', () => toggleMini());
ipcMain.on('app:open-main', () => { createWindow(); mini?.close(); });
ipcMain.on('app:quit', () => { quitting = true; stopWorker(); app.quit(); });

/* ------------------------------------------------------------------ tray */

function updateTray(): void {
  if (!tray) return;
  const signedIn = !!readSession();
  const label = !signedIn ? '○ לא מחובר' : paused ? '❚❚ מושהה' : '● פעיל';
  tray.setToolTip(`ANX Worker — ${label.slice(2)}`);
  tray.setContextMenu(
    Menu.buildFromTemplate([
      { label: 'ANX Worker', enabled: false },
      { label, enabled: false },
      { type: 'separator' },
      { label: 'פתח את המערכת', click: createWindow },
      { label: 'תצוגה מוקטנת', click: toggleMini },
      { type: 'separator' },
      { label: 'השהה', enabled: signedIn && !paused, click: () => { paused = true; stopWorker(); updateTray(); send('worker:state', workerState()); } },
      { label: 'המשך', enabled: signedIn && paused, click: () => { paused = false; startWorker(); updateTray(); send('worker:state', workerState()); } },
      { type: 'separator' },
      { label: 'הדשבורד באתר', click: () => void shell.openExternal(config.siteUrl) },
      { label: 'הגדרות', click: () => { createWindow(); send('nav', 'settings'); } },
      { type: 'separator' },
      { label: 'יציאה (מפסיק לפרסם)', click: () => { quitting = true; stopWorker(); app.quit(); } },
    ]),
  );
}

/* ----------------------------------------------------------------- start */

if (!app.requestSingleInstanceLock()) {
  /* A second double-click focuses the copy that is already publishing, rather
     than starting a rival that fights it for the same queue rows. */
  app.quit();
} else {
  app.on('second-instance', createWindow);

  app.whenReady().then(() => {
    try {
      const icon = nativeImage.createFromPath(path.join(here, 'icon.png'));
      tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
      tray.on('click', createWindow);
      updateTray();
    } catch (err) {
      /* No system tray on this desktop. It costs the icon, not the app. */
      console.error('[app] אין סמל ליד השעון:', err instanceof Error ? err.message : err);
    }

    if (app.isPackaged) app.setLoginItemSettings({ openAtLogin: prefs.openAtLogin, args: ['--hidden'] });

    const hidden = process.argv.includes('--hidden') || prefs.startMinimized;
    if (!hidden) createWindow();

    if (readSession()) {
      startWorker();
      startPolling();
    } else {
      say('אין עדיין חשבון מחובר במחשב הזה.', 'sys');
    }
  });

  /* Closing the last window must not end the process — that is the tray's
     entire purpose, and a post due at 14:00 must survive somebody tidying
     their desktop. */
  app.on('window-all-closed', () => {
    if (!prefs.keepRunning) app.quit();
  });
  app.on('before-quit', () => { quitting = true; stopWorker(); });
}
