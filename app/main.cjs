/*
 * הפתרון המבריק — the thing a customer downloads and opens.
 *
 * WHAT IT IS, AND WHAT IT DELIBERATELY IS NOT.
 *
 * It is not a second program. The publishing worker is one bundled file next
 * to this one, and everything this window does is start it, show what it says
 * and type back what the person answers. Splitting the logic in two would mean
 * two places to fix every Facebook change, and the one that matters would be
 * the one nobody ran the tests on.
 *
 * It is not the dashboard either. The website stays the place where posts and
 * rounds are made; this window exists because three things cannot happen in a
 * browser: driving a real Chrome on this machine, keeping a Facebook session
 * in a profile folder, and being running at 09:00 when a post is due.
 *
 * WHY A WINDOW AT ALL rather than the console it replaces. A console is
 * something people close. It also cannot be asked to do the one thing the
 * first run needs — take an email address and a code — in a way anybody would
 * trust. And a black window full of scrolling English is the single clearest
 * signal that software is not meant for you.
 */
const { app, BrowserWindow, Tray, Menu, ipcMain, shell, nativeImage } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const fs = require('node:fs');

/*
 * Baked in at build time. Both are public values — the anon key is the one
 * that ships inside every browser bundle of the website and is governed
 * entirely by the row-level policies behind it. Nothing secret is in this
 * package; see app/config.json and scripts/build-app.mjs.
 */
const config = JSON.parse(fs.readFileSync(path.join(__dirname, 'config.json'), 'utf8'));

const SINGLE = app.requestSingleInstanceLock();

let win = null;
let tray = null;
let worker = null;
let quitting = false;
/* The last lines the worker printed, so a window opened from the tray five
   minutes later is not blank. Bounded: this runs for weeks. */
const scrollback = [];
const MAX_LINES = 400;

function say(line, kind = 'out') {
  const entry = { line, kind, at: Date.now() };
  scrollback.push(entry);
  if (scrollback.length > MAX_LINES) scrollback.shift();
  if (win && !win.isDestroyed()) win.webContents.send('worker:line', entry);
}

function createWindow() {
  if (win && !win.isDestroyed()) {
    win.show();
    win.focus();
    return;
  }
  win = new BrowserWindow({
    width: 760,
    height: 560,
    minWidth: 520,
    minHeight: 420,
    title: 'הפתרון המבריק',
    backgroundColor: '#0d1117',
    autoHideMenuBar: true,
    icon: path.join(__dirname, 'icon.png'),
    webPreferences: {
      preload: path.join(__dirname, 'preload.cjs'),
      /* The renderer is a local file that talks to nothing. It gets no Node
         and no remote module; everything it can do is the four channels in
         preload.cjs, and each of them is a sentence long. */
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });
  win.loadFile(path.join(__dirname, 'index.html'));
  win.webContents.on('did-finish-load', () => {
    win.webContents.send('worker:history', scrollback);
    win.webContents.send('worker:state', { running: !!worker, site: config.siteUrl });
  });
  /*
   * CLOSING THE WINDOW MUST NOT STOP PUBLISHING. This is the whole difference
   * from the console it replaces: a person who is done looking closes it, and
   * a post due at 14:00 still goes out. Quitting is a deliberate act from the
   * tray, and the first close says so once.
   */
  win.on('close', (e) => {
    if (quitting) return;
    e.preventDefault();
    win.hide();
    if (!app.isPackaged) return;
    if (tray && !createWindow.warned) {
      createWindow.warned = true;
      tray.displayBalloon?.({
        title: 'ממשיך לעבוד',
        content: 'התוכנה ממשיכה לפרסם ברקע. ליציאה — לחצו ימני על הסמל ליד השעון.',
      });
    }
  });
  /* Any link in the window opens in the real browser, never inside this one. */
  win.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: 'deny' };
  });
}

function startWorker() {
  if (worker) return;
  const entry = path.join(__dirname, 'worker.cjs');
  say('מתחיל…', 'sys');
  worker = spawn(process.execPath, [entry], {
    cwd: __dirname,
    env: {
      ...process.env,
      /* Tells Electron's own binary to behave as plain Node for this child. */
      ELECTRON_RUN_AS_NODE: '1',
      NEXT_PUBLIC_SUPABASE_URL: config.supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: config.supabaseAnonKey,
      /*
       * There is a person in front of a window, so the worker may ask who this
       * machine belongs to. Without this it assumes it was started by Windows
       * at boot and refuses to prompt — see worker/sign-in.ts.
       */
      SOCIAL_WORKER_PROMPTABLE: '1',
      /* Never inherited from the developer's machine into a customer's copy. */
      SOCIAL_WORKER_EMAIL: '',
      SOCIAL_WORKER_PASSWORD: '',
    },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const feed = (kind) => {
    let buffer = '';
    return (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split('\n');
      buffer = lines.pop() ?? '';
      for (const line of lines) say(line.replace(/\r$/, ''), kind);
      /*
       * A PROMPT HAS NO NEWLINE, which is exactly why it would otherwise never
       * reach the window: readline writes "  המייל שלכם: " and then waits, and
       * a line-buffered reader waits with it. Forever, on the one screen where
       * somebody is waiting to type.
       */
      if (buffer.trim().endsWith(':')) {
        say(buffer, 'prompt');
        buffer = '';
      }
    };
  };
  worker.stdout.on('data', feed('out'));
  worker.stderr.on('data', feed('err'));

  worker.on('exit', (code) => {
    worker = null;
    if (win && !win.isDestroyed()) win.webContents.send('worker:state', { running: false, site: config.siteUrl });
    if (quitting) return;
    say(`נעצר (${code}). מפעיל מחדש בעוד 30 שניות…`, 'sys');
    setTimeout(() => { if (!quitting) startWorker(); }, 30_000);
  });

  if (win && !win.isDestroyed()) win.webContents.send('worker:state', { running: true, site: config.siteUrl });
}

function stopWorker() {
  if (!worker) return;
  worker.kill();
  worker = null;
}

ipcMain.on('worker:answer', (_e, text) => {
  if (!worker) return;
  worker.stdin.write(`${String(text)}\n`);
  /* Echoed so the person can see what they typed; the worker's own readline
     echo does not come back through a pipe. */
  say(String(text), 'you');
});
ipcMain.on('app:open-site', () => shell.openExternal(config.siteUrl));
ipcMain.on('app:restart-worker', () => { stopWorker(); startWorker(); });

if (!SINGLE) {
  /* A second double-click focuses the window that is already publishing
     rather than starting a rival that fights it for the same queue rows. */
  app.quit();
} else {
  app.on('second-instance', createWindow);

  app.whenReady().then(() => {
    /*
     * A TRAY IS NOT GUARANTEED TO EXIST. Windows always has one; a Linux
     * desktop may not, and a machine with no desktop at all certainly does
     * not. Failing here would mean the whole app refusing to start over an
     * icon — so it is attempted, and its absence only costs the icon.
     */
    try {
      const icon = nativeImage.createFromPath(path.join(__dirname, 'icon.png'));
      tray = new Tray(icon.isEmpty() ? nativeImage.createEmpty() : icon);
      tray.setToolTip('הפתרון המבריק — פרסום');
      tray.setContextMenu(Menu.buildFromTemplate([
        { label: 'פתח את החלון', click: createWindow },
        { label: 'פתח את הדשבורד באתר', click: () => shell.openExternal(config.siteUrl) },
        { type: 'separator' },
        { label: 'הפעל מחדש', click: () => { stopWorker(); startWorker(); } },
        { label: 'יציאה (מפסיק לפרסם)', click: () => { quitting = true; stopWorker(); app.quit(); } },
      ]));
      tray.on('click', createWindow);
    } catch (err) {
      console.error('[app] אין סמל ליד השעון במערכת הזאת:', err && err.message);
    }

    /*
     * START WITH WINDOWS, minimised. A post due at 09:00 on a machine that
     * rebooted at 03:00 is the failure this exists to prevent, and asking
     * somebody to remember to open a program every morning is not a plan.
     * Only in a real installed build: doing it from a checkout would wire the
     * developer's machine to a path that moves.
     */
    if (app.isPackaged) {
      app.setLoginItemSettings({ openAtLogin: true, args: ['--hidden'] });
    }

    const hidden = process.argv.includes('--hidden');
    if (!hidden) createWindow();
    startWorker();
  });

  /*
   * CLOSING THE LAST WINDOW MUST NOT END THE PROCESS. The default on Windows
   * and Linux is to quit, which would make the tray icon a lie and stop every
   * scheduled post the moment somebody tidied their desktop. An empty handler
   * is how that default is replaced.
   */
  app.on('window-all-closed', () => {});
  app.on('before-quit', () => { quitting = true; stopWorker(); });
}
