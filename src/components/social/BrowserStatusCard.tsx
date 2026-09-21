'use client';

import { useEffect, useState } from 'react';
import { listRecentCommands, listWorkers, resumeNeedsAttention, sendWorkerCommand } from '@/lib/social/client';
import { Stamp } from './DateTime';
import type { SocialWorker, WorkerCommand, WorkerCommandName } from '@/lib/social/types';
import { WORKER_VERSION } from '@/lib/social/worker-version';
import { Button, Card, Notice, TONE_FILL, TONE_TEXT, useConfirm, type Tone } from './ui';
import { friendlyMessage } from '@/lib/social/errors';

/**
 * The light, as a tone rather than an emoji.
 *
 * It used to return 🔴 / 🟡 / 🟢 beside the correct token class, so the one
 * status light in the product was painted in Apple's reds and greens — a
 * different red from every other red on the screen, at a heavier optical
 * weight than the 64 hairline glyphs around it, and announced to a screen
 * reader as "large yellow circle נדרש אימות". The dot below is the same mark
 * StatusPill uses, in the same indicator step.
 */
type Light = { tone: Tone; label: string };

function lightFor(w: (SocialWorker & { online: boolean }) | undefined): Light {
  if (!w || !w.online) return { tone: 'bad', label: 'מנותק — התוכנה לא רצה על המחשב' };
  if (w.status === 'needs_attention' || w.browser_state === 'needs_auth') return { tone: 'warn', label: 'נדרש אימות / טיפול ידני' };
  if (w.browser_state === 'connected') return { tone: 'good', label: 'מחובר' };
  if (w.browser_state === 'disconnected') return { tone: 'bad', label: 'לא מחובר לפייסבוק' };
  return { tone: 'warn', label: 'לא נבדק עדיין' };
}

/**
 * "Facebook Browser" status on the dashboard: the local worker's heartbeat
 * and its Chrome profile's login state, plus the three commands the owner
 * needs (connect / check / disconnect) and the recovery path when Facebook
 * asks for a human.
 */
export function BrowserStatusCard({ onChanged, id }: { onChanged?: () => void; id?: string }) {
  const [workers, setWorkers] = useState<(SocialWorker & { online: boolean })[]>([]);
  const [commands, setCommands] = useState<WorkerCommand[]>([]);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();

  async function load() {
    try {
      const [w, c] = await Promise.all([listWorkers(), listRecentCommands(3)]);
      setWorkers(w);
      setCommands(c);
      setError(null);
    } catch (err) {
      setError(friendlyMessage(err, 'טעינה נכשלה.'));
    }
  }

  /*
   * Four seconds, but never two reads at once and never while the tab is
   * hidden. Without the in-flight guard this poller stacked on a slow
   * connection — measured with each response held 7s: four concurrent
   * requests in flight, two still outstanding when the window closed, and
   * responses landing out of order so the card could show state older than it
   * already had.
   */
  useEffect(() => {
    let alive = true;
    let running = false;
    const tick = async () => {
      if (!alive || running || document.visibilityState === 'hidden') return;
      running = true;
      try {
        await load();
      } finally {
        running = false;
      }
    };
    tick();
    const timer = setInterval(tick, 4000);
    document.addEventListener('visibilitychange', tick);
    return () => {
      alive = false;
      clearInterval(timer);
      document.removeEventListener('visibilitychange', tick);
    };
  }, []);

  const worker = workers.find((w) => w.online) ?? workers[0];
  const light = lightFor(worker);
  const lastCommand = commands[0];

  async function send(command: WorkerCommandName) {
    setBusy(command);
    try {
      await sendWorkerCommand(worker?.online ? worker.id : null, command);
      if (command === 'resume') await resumeNeedsAttention();
      await load();
      onChanged?.();
    } catch (err) {
      setError(friendlyMessage(err, 'הפקודה נכשלה.'));
    } finally {
      setBusy(null);
    }
  }

  const needsHuman = worker?.online && (worker.status === 'needs_attention' || worker.browser_state === 'needs_auth');
  /*
   * A worker on an older build looks perfectly healthy — green light, fresh
   * heartbeat, posts going out — while a fix that lives in worker/ sits on the
   * machine unused. Say so here, where the light is, rather than leaving it in
   * a line of terminal output.
   */
  const stale = Boolean(worker?.online && worker.version && worker.version !== WORKER_VERSION);

  return (
    <Card
      id={id}
      title="פרסום בקבוצות — התוכנה שרצה במחשב"
      /* "worker" is a developer's word and it was the title of this card, on a
         screen a cleaning-business owner reads on a phone. The thing it names
         is the one reason to own this product, so it is named in Hebrew and
         explained in a line. */
      subtitle="קבוצות פייסבוק מתפרסמות רק דרך חלון Chrome אמיתי על המחשב שלכם. כאן רואים אם הוא פועל."
    >
      {error && <div className="mb-2"><Notice tone="error">{error}</Notice></div>}
      <p className={`flex items-center gap-2 text-lg font-extrabold ${TONE_TEXT[light.tone]}`}>
        <span aria-hidden className={`h-2.5 w-2.5 shrink-0 rounded-full ${TONE_FILL[light.tone]}`} />
        {light.label}
      </p>
      <p className="mt-1 text-xs text-mist-500">
        {worker ? (
          <>
            {worker.name} · {worker.host || '—'} · נראה לאחרונה <Stamp iso={worker.last_seen_at} />
            {worker.debug_mode && ' · חלון גלוי (מצב בדיקה)'}
          </>
        ) : (
          /* The first-run path used to hand the owner `npm run social-worker`
             — a terminal command, on a phone screen, with no explanation of
             what a "worker" is. The human instruction existed thirteen lines
             below, in the stale-version notice, and only ever appeared AFTER
             the thing had already run once. */
          <>
            התוכנה עוד לא הופעלה. במחשב שבו מותקנת המערכת, לחצו פעמיים על הקובץ{' '}
            <code dir="ltr">start-worker.cmd</code> והשאירו את החלון השחור פתוח. כל עוד הוא סגור — לא יוצאים פרסומים לקבוצות.
          </>
        )}
      </p>
      {stale && (
        <div className="mt-3">
          <Notice tone="warn">
            <strong>התוכנה במחשב מריצה גרסה ישנה</strong> (<span dir="ltr">{worker?.version}</span> במקום <span dir="ltr">{WORKER_VERSION}</span>).
            {' '}סגרו את החלון השחור והפעילו שוב את <code dir="ltr">start-worker.cmd</code> — הוא מתעדכן לבד.
          </Notice>
        </div>
      )}
      {needsHuman && (
        <div className="mt-3">
          <Notice tone="warn">
            <strong>Facebook דורש פעולה ידנית.</strong> {worker?.attention_message || 'פתחו את חלון הדפדפן שנפתח במחשב (או לחצו "התחבר לפייסבוק"), טפלו באימות, ואז "בדוק שוב".'}
          </Notice>
        </div>
      )}
      <div className="mt-3 flex flex-wrap gap-2">
        <Button busy={busy === 'login'} disabled={!worker?.online} onClick={() => send('login')}>
          התחבר לפייסבוק
        </Button>
        <Button variant="secondary" busy={busy === 'check'} disabled={!worker?.online} onClick={() => send('check')}>
          {needsHuman ? 'בדוק שוב' : 'בדוק חיבור'}
        </Button>
        {needsHuman && (
          <Button variant="secondary" busy={busy === 'resume'} onClick={() => send('resume')}>
            המשך סבב
          </Button>
        )}
        <Button
          variant="danger"
          busy={busy === 'logout'}
          disabled={!worker?.online}
          onClick={async () => {
            const ok = await confirm.ask({
              title: 'לנתק את הדפדפן?',
              body: 'פרופיל Chrome המקומי — כולל ההתחברות שלכם לפייסבוק — יימחק מהמחשב. תצטרכו להתחבר שוב לפני הפרסום הבא בקבוצות.',
              confirmLabel: 'נתק ומחק פרופיל',
              danger: true,
            });
            if (ok) send('logout');
          }}
        >
          נתק
        </Button>
      </div>
      {lastCommand && (
        <p className="mt-2 text-xs text-mist-500">
          פקודה אחרונה: {lastCommand.command} · {lastCommand.status}
          {lastCommand.result ? ` · ${lastCommand.result}` : ''}
        </p>
      )}
      {confirm.dialog}
      {!worker?.online && (
        <p className="mt-2 text-xs text-mist-500">"התחבר לפייסבוק" פותח חלון Chrome אמיתי על המחשב שמריץ את התוכנה; אתם מתחברים בעצמכם, והמערכת לא רואה סיסמה.</p>
      )}
    </Card>
  );
}
