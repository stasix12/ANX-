/*
 * "אל תשלח לי כל פעם להורדה, שיהיה אופציה לעדכן דרך התוכנה שכבר במחשב."
 *
 * Until now every fix reached the person the same way: a link in WhatsApp, a
 * download, an installer, and a person who has to notice the message and care.
 * That works exactly once. By the third time it is the reason a machine sits
 * on a version from three weeks ago publishing with a bug that was fixed the
 * same day — and nobody knows, because a stale copy heartbeats and reports
 * itself perfectly healthy.
 *
 * So the app checks for itself and updates itself.
 *
 * WHAT IT WILL NOT DO, and this is the part worth being deliberate about:
 *
 *   It never restarts on its own. This program's whole job is to be running
 *   at 14:00 when a post is due. An update that decides for itself that now
 *   is a good moment to quit and reinstall is an update that eats a
 *   publication and leaves no trace of why. So a new version is downloaded
 *   quietly in the background and then WAITS: the person presses a button, or
 *   it installs on the next ordinary quit (autoInstallOnAppQuit), whichever
 *   comes first. Either way the restart happens at a moment somebody chose.
 *
 *   It never downloads on its own if the toggle is off. "עדכונים אוטומטיים"
 *   in הגדרות has been a real switch in the file since the redesign and has
 *   controlled nothing. It controls this. Off means the screen still tells
 *   the truth about what exists — it just does not spend the person's
 *   connection until they say so.
 *
 * WHERE IT LOOKS. A public repository that holds the installer and nothing
 * else — see `publish:` in electron-builder.yml, which is what bakes
 * app-update.yml into the package. It has to be public: the only alternative
 * is shipping a token that can read the private one inside every copy of the
 * app, which is precisely the thing worker/test/package.test.ts exists to
 * prevent. The feed leaks nothing — it is a version number and a file that
 * anyone who was sent the link could already download.
 */
import { app } from 'electron';
import { autoUpdater } from 'electron-updater';
import { readable } from './update-messages';

export type UpdateStatus =
  /* Not a packaged build, or packaged without a feed. Says so rather than
     pretending to be up to date, because "מעודכן" on a copy that has never
     been able to check is the one answer worse than an error. */
  | 'unsupported'
  | 'idle'
  | 'checking'
  | 'none'
  | 'available'
  | 'downloading'
  | 'ready'
  | 'error';

export type UpdateState = {
  status: UpdateStatus;
  current: string;
  next: string | null;
  percent: number;
  message: string;
  notes: string;
  checkedAt: number | null;
  auto: boolean;
};

type Wiring = {
  /* Pushed to any open window, so the screen follows a download it did not
     start — the auto check is not a button anybody pressed. */
  send: (channel: string, payload: unknown) => void;
  /* The technical drawer. Everything the updater says lands there, in the
     same place as everything the engine says. */
  say: (line: string, kind: 'out' | 'err' | 'sys') => void;
  /* Read fresh each time rather than captured: the toggle can change while
     the app is running and must take effect on the next check, not the next
     launch. */
  autoEnabled: () => boolean;
  /* Stops the engine and lets the app actually quit. Installing means the
     process is replaced; leaving a detached worker behind would give the new
     copy a rival for the same queue rows. */
  beforeInstall: () => void;
};

const SIX_HOURS = 6 * 60 * 60 * 1000;
/* Late enough that it is never competing with signing in or the engine's
   first poll on a cold machine. */
const FIRST_CHECK = 25_000;

/*
 * THE ONLY WAY TO ACTUALLY EXERCISE ANY OF THIS BEFORE A CUSTOMER DOES.
 *
 * Everything below only runs in a packaged build, and a packaged build is a
 * Windows installer produced on another machine. Without this the entire
 * network path — does the feed parse, does the version comparison fire, does
 * the Hebrew for "no connection" ever appear — would first execute on
 * somebody's PC. That is how the last three bugs in this app were found and it
 * is not a method.
 *
 * Set SOCIAL_UPDATE_FEED to a dev-app-update.yml and the module runs its real
 * code against it. It is inert in every shipped copy: nothing sets it, and the
 * worst it can do if something did is make the app look at a feed.
 */
const FORCED = !!process.env.SOCIAL_UPDATE_FEED;

let wiring: Wiring | null = null;
let state: UpdateState = {
  status: 'unsupported',
  current: app.getVersion(),
  next: null,
  percent: 0,
  message: '',
  notes: '',
  checkedAt: null,
  auto: true,
};

function set(patch: Partial<UpdateState>): void {
  state = { ...state, ...patch };
  wiring?.send('updates', state);
}

export function updateState(): UpdateState {
  return { ...state, auto: wiring?.autoEnabled() ?? true };
}

export function initUpdates(w: Wiring): void {
  wiring = w;

  /*
   * A build run from a checkout has no app-update.yml, and asking it to check
   * throws. There is nothing to fix there — it is what development looks like
   * — so it is reported as its own state and never as an error.
   */
  if (!app.isPackaged && !FORCED) {
    set({ status: 'unsupported', message: 'עדכונים אוטומטיים פועלים בגרסה המותקנת בלבד.' });
    return;
  }
  /* Only reached under SOCIAL_UPDATE_FEED. See FORCED. */
  if (FORCED) autoUpdater.forceDevUpdateConfig = true;

  autoUpdater.logger = {
    info: (m: unknown) => w.say(`[עדכון] ${String(m)}`, 'out'),
    warn: (m: unknown) => w.say(`[עדכון] ${String(m)}`, 'out'),
    error: (m: unknown) => w.say(`[עדכון] ${String(m)}`, 'err'),
  };

  /* Both of these are decided here rather than by the library, so that the
     rules at the top of this file are visible in one place. */
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = true;

  autoUpdater.on('checking-for-update', () => set({ status: 'checking', message: 'בודק אם יש גרסה חדשה…' }));

  autoUpdater.on('update-not-available', (info) => {
    set({
      status: 'none',
      next: null,
      percent: 0,
      notes: '',
      checkedAt: Date.now(),
      message: `הגרסה המותקנת (${info?.version ?? state.current}) היא העדכנית ביותר.`,
    });
  });

  autoUpdater.on('update-available', (info) => {
    const next = String(info?.version ?? '');
    set({
      status: 'available',
      next,
      percent: 0,
      checkedAt: Date.now(),
      notes: typeof info?.releaseNotes === 'string' ? info.releaseNotes : '',
      message: `יש גרסה חדשה — ${next}.`,
    });
    /* The toggle, doing the thing it has always claimed to do. */
    if (w.autoEnabled()) void download();
  });

  autoUpdater.on('download-progress', (p) => {
    set({ status: 'downloading', percent: Math.round(p?.percent ?? 0), message: `מוריד את הגרסה החדשה… ${Math.round(p?.percent ?? 0)}%` });
  });

  autoUpdater.on('update-downloaded', (info) => {
    set({
      status: 'ready',
      next: String(info?.version ?? state.next ?? ''),
      percent: 100,
      /* Deliberately says when it will happen by itself. A person who does
         nothing should still know what to expect. */
      message: 'הגרסה החדשה מוכנה. תותקן בסגירה הבאה של התוכנה, או עכשיו.',
    });
    w.say('[עדכון] גרסה חדשה הורדה וממתינה להתקנה.', 'sys');
  });

  autoUpdater.on('error', (err) => {
    /* next/notes are cleared with it: they described a version this check did
       not manage to confirm, and leaving them would put "מה חדש" about 3.38.0
       on a screen that just said it could not reach the internet. */
    set({ status: 'error', percent: 0, next: null, notes: '', checkedAt: Date.now(), message: readable(err) });
  });

  setTimeout(() => { if (w.autoEnabled()) void check(); }, FIRST_CHECK);
  setInterval(() => { if (w.autoEnabled()) void check(); }, SIX_HOURS);
}

export async function check(): Promise<UpdateState> {
  if (!app.isPackaged && !FORCED) return updateState();
  /* Nothing to re-check once a file is on disk waiting; checking again would
     only throw away a finished download. */
  if (state.status === 'downloading' || state.status === 'ready') return updateState();
  try {
    await autoUpdater.checkForUpdates();
  } catch (err) {
    set({ status: 'error', checkedAt: Date.now(), message: readable(err) });
  }
  return updateState();
}

export async function download(): Promise<UpdateState> {
  if ((!app.isPackaged && !FORCED) || state.status === 'ready' || state.status === 'downloading') return updateState();
  set({ status: 'downloading', percent: 0, message: 'מוריד את הגרסה החדשה…' });
  try {
    await autoUpdater.downloadUpdate();
  } catch (err) {
    set({ status: 'error', percent: 0, message: readable(err) });
  }
  return updateState();
}

export function install(): UpdateState {
  if (state.status !== 'ready') return updateState();
  wiring?.say('[עדכון] מתקין ומפעיל מחדש.', 'sys');
  wiring?.beforeInstall();
  /* Silent, and back up afterwards. Silent because this is the same installer
     the person already approved once and a second wizard teaches them that
     updating is a chore; force-run-after because a publishing machine that
     quietly stays down after an update is worse than one that never updated. */
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return updateState();
}
