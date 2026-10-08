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
 *   It never restarts while that could cost a publication. This program's
 *   whole job is to be running at 14:00 when a post is due, and an update
 *   that decides for itself that now is a good moment to quit is an update
 *   that eats a publication and leaves no trace of why.
 *
 *   IT USED TO SAY "IT NEVER RESTARTS ON ITS OWN", AND THAT WAS THE BUG.
 *   "כל פעם שאני עושה עדכון תוכנה, זה מנתקת את הלקוח - לא מתאים אני רוצה
 *    שזה יעבוד אצלו אוטמט בדיוק כמו אצלי."
 *
 *   He is right, and the rule was protecting the wrong thing. On HIS machine
 *   — a git checkout behind start-worker.cmd — the engine has always updated
 *   itself with nobody touching anything: worker/social-worker.ts's
 *   restartIfUpdated() waits for a clear window, marks itself offline, says
 *   "אין צורך לגעת במחשב" in the log, and stands down for the launcher. It is
 *   automatic AND it never lands on a post, because it CHOOSES ITS MOMENT.
 *
 *   The packaged copy had the second half of that and not the first: it
 *   downloaded quietly and then waited for a human to press a button. And the
 *   fallback it advertised — autoInstallOnAppQuit — is unreachable in
 *   practice, because this app is built not to quit (closing the window hides
 *   it to the tray; window-all-closed does not quit while keepRunning is on).
 *   So a customer's copy could sit with a finished download for days, branded
 *   "גרסה ישנה" on the owner's dashboard, while the only instruction on that
 *   dashboard named a start-worker.cmd that does not exist on their machine.
 *
 *   So it restarts on its own NOW — at a moment the shell has checked is
 *   clear, by the same standard the owner's own machine uses: nothing being
 *   published, nothing awaiting a human, and the next post far enough away.
 *   See `safeToInstall` in desktop/main.ts, which owns that judgement because
 *   it is the side that can read the queue.
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
     copy a rival for the same queue rows.
     Awaited now: the installer must not start while the engine is still
     holding the browser profile and the exe it is about to replace. */
  beforeInstall: () => Promise<void> | void;
  /**
   * IS NOW A MOMENT WHEN RESTARTING COSTS NOTHING?
   *
   * Lives in main.ts because that is the side with the database reader: it
   * already polls social_queue and social_workers every ten seconds for the
   * window. `waitedMs` is how long the finished download has been sitting, so
   * that side can relax its "and the next post is far enough away" rule for a
   * queue that is never quiet — without ever relaxing the part that matters,
   * which is that nothing is in flight.
   *
   * Returns a reason either way, which goes to the technical log: an update
   * that is holding back needs to say what it is waiting for, or it is
   * indistinguishable from an update that is stuck.
   */
  safeToInstall: (waitedMs: number) => Promise<{ ok: boolean; why: string }>;
};

/*
 * EVERY HOUR, NOT EVERY SIX.
 *
 * Six hours was chosen when a found update only led to a button nobody was
 * standing next to, so the cadence did not matter much. It matters now: the
 * dashboard brands a copy "גרסה ישנה" the moment the owner deploys the
 * website, because the number it compares against is compiled into that
 * deploy — so the six hours were six hours of a customer's PC looking wrong
 * on his screen before anything had even been offered to it.
 *
 * An hour is still nothing on the network (one HTTPS request for a 346-byte
 * latest.yml) and it puts the whole round trip — ship, notice, download,
 * install at a clear moment — inside the hour.
 */
const CHECK_EVERY = 60 * 60 * 1000;
/* Late enough that it is never competing with signing in or the engine's
   first poll on a cold machine. */
const FIRST_CHECK = 25_000;

/**
 * How often a finished download asks whether it may install itself.
 *
 * Short, because the answer changes with the queue: between two posts there
 * can be a clear minute that was not there thirty seconds earlier. Each ask
 * is one small database read on the machine's own connection.
 */
const SAFETY_POLL = 30_000;

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
/** When the download finished, so `safeToInstall` can be told how long it has waited. */
let readyAt = 0;
/** The running "waiting for a clear moment" poll. One at a time. */
let safetyTimer: ReturnType<typeof setInterval> | null = null;
/** The last reason we held back, so the log says it once rather than every poll. */
let heldBecause = '';
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
    readyAt = Date.now();
    set({
      status: 'ready',
      next: String(info?.version ?? state.next ?? ''),
      percent: 100,
      /* Says what will happen by itself, because that is now the ordinary
         path rather than a fallback nobody could reach. A person who does
         nothing should still know what to expect — and what they should
         expect is that it handles itself. */
      message: 'הגרסה החדשה מוכנה. היא תותקן בעצמה ברגע שלא יוצא פרסום — אין צורך לגעת במחשב.',
    });
    w.say('[עדכון] גרסה חדשה הורדה. ממתין לרגע שבו אין פרסום כדי להתקין אותה.', 'sys');
    waitForAClearMoment();
  });

  autoUpdater.on('error', (err) => {
    /* next/notes are cleared with it: they described a version this check did
       not manage to confirm, and leaving them would put "מה חדש" about 3.38.0
       on a screen that just said it could not reach the internet. */
    set({ status: 'error', percent: 0, next: null, notes: '', checkedAt: Date.now(), message: readable(err) });
  });

  setTimeout(() => { if (w.autoEnabled()) void check(); }, FIRST_CHECK);
  setInterval(() => { if (w.autoEnabled()) void check(); }, CHECK_EVERY);
}

/**
 * ─── THE PART THAT MAKES IT AUTOMATIC ────────────────────────────────────
 *
 * A finished download asks, every half minute, whether restarting right now
 * would cost anything. The judgement is main.ts's — it is the side that can
 * read the queue — and this only acts on the answer.
 *
 * IT RESPECTS THE TOGGLE. "עדכונים אוטומטיים" off has always meant "do not
 * spend my connection without asking"; it now also means "do not restart
 * without asking". A copy with the toggle off keeps exactly the old
 * behaviour: the download waits for the button. That is deliberate — the
 * toggle is the one place a person can say "not by yourself", and taking that
 * away because the default changed would be the product deciding for them.
 */
function waitForAClearMoment(): void {
  if (safetyTimer) return;
  heldBecause = '';
  const ask = async (): Promise<void> => {
    const w = wiring;
    /* Nothing left to install — the button got there first, or an error threw
       the download away. Either way stop asking. */
    if (!w || state.status !== 'ready') {
      stopWaiting();
      return;
    }
    if (!w.autoEnabled()) return;
    let verdict: { ok: boolean; why: string };
    try {
      verdict = await w.safeToInstall(Date.now() - readyAt);
    } catch (err) {
      /* A failed read is NOT permission. The whole value of this gate is that
         it is pessimistic: a machine that cannot answer "is a post going out
         right now" must be assumed to be publishing one. */
      verdict = { ok: false, why: `לא הצלחתי לבדוק אם אפשר להתקין (${err instanceof Error ? err.message : String(err)})` };
    }
    if (!verdict.ok) {
      /* Said once per distinct reason. A line every thirty seconds would bury
         the technical log in a message about nothing happening. */
      if (verdict.why && verdict.why !== heldBecause) {
        heldBecause = verdict.why;
        w.say(`[עדכון] מחכה להתקין: ${verdict.why}`, 'out');
      }
      return;
    }
    stopWaiting();
    w.say('[עדכון] אין פרסום כרגע — מתקין את הגרסה החדשה ומפעיל מחדש.', 'sys');
    await install();
  };
  safetyTimer = setInterval(() => void ask(), SAFETY_POLL);
  /* And once straight away: a machine with an empty queue should not sit on a
     finished download for half a minute for no reason. */
  void ask();
}

function stopWaiting(): void {
  if (safetyTimer) clearInterval(safetyTimer);
  safetyTimer = null;
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

export async function install(): Promise<UpdateState> {
  if (state.status !== 'ready') return updateState();
  /* Whoever got here first wins; the poll must not fire a second install
     behind the button, because quitAndInstall's second call returns false and
     lands as an 'error' on a screen where nothing is actually wrong. */
  stopWaiting();
  set({ message: 'מתקין את הגרסה החדשה ומפעיל מחדש…' });
  wiring?.say('[עדכון] מתקין ומפעיל מחדש.', 'sys');
  /*
   * AWAITED, which it was not before.
   *
   * beforeInstall stops the engine, and on Windows that kill is a
   * TerminateProcess — the child is gone by the time it returns, but the
   * Chrome it launched is its grandchild and takes a moment longer, and the
   * engine is a second live instance of the very exe the installer is about
   * to replace. Firing the installer on the next tick regardless was an
   * unenforced assumption about all of that. It also gives main.ts somewhere
   * to put the thing that makes this not look like a disconnection: the
   * offline heartbeat and the log line, written BEFORE the process goes.
   */
  try {
    await wiring?.beforeInstall();
  } catch (err) {
    /* Never block the install on it. A failed announcement means the owner's
       dashboard shows a gap it cannot explain for a minute — annoying. Not
       installing means the customer stays on old code — worse. */
    wiring?.say(`[עדכון] לא הצלחתי לרשום את ההפעלה מחדש ביומן (${err instanceof Error ? err.message : String(err)}). ממשיך בהתקנה.`, 'err');
  }
  /* Silent, and back up afterwards. Silent because this is the same installer
     the person already approved once and a second wizard teaches them that
     updating is a chore; force-run-after because a publishing machine that
     quietly stays down after an update is worse than one that never updated. */
  setImmediate(() => autoUpdater.quitAndInstall(true, true));
  return updateState();
}
