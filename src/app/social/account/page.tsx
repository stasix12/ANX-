'use client';

import { useCallback, useEffect, useState } from 'react';
import { Stamp } from '@/components/social/DateTime';
import { SocialShell } from '@/components/social/SocialShell';
import { TargetAvatar } from '@/components/social/TargetAvatar';
import { Button, Card, Loading, Notice, useConfirm, useToast } from '@/components/social/ui';
import { listRecentCommands, listWorkers, sendWorkerCommand } from '@/lib/social/client';
import type { SocialWorker, WorkerCommand, WorkerCommandName } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';

/**
 * WHICH Facebook account publishes, and how to make it a different one.
 *
 * The chip on the dashboard answers the first half — it shows the face and
 * name the worker's browser is signed in as, because every group post goes out
 * under it. This screen is the second half: the way off that account and on to
 * another one, which until now existed only as two buttons on a card inside
 * the settings screen, under a title about a "browser".
 *
 * THE PASSWORD IS NEVER TYPED HERE, and that is a design decision rather than
 * a missing feature. Switching accounts opens a real Chrome window on the PC
 * that runs the worker and lands it on Facebook's own login page. Two reasons,
 * both of which a form on this screen would break:
 *
 *   - This product never holds a Facebook password. There is nowhere to type
 *     one, so there is nothing to store, log, sync or leak — the browser
 *     profile on that one machine holds the session and nothing else does.
 *   - Facebook answers a login with two-factor codes, device approvals and
 *     security checks. Those need a real browser and a person looking at it.
 *     A form here would collect a password and then fail at the first
 *     challenge, which is worse than not offering one.
 *
 * So the owner still signs in with the other account's username and password —
 * on Facebook's page, in a window this app opened for them.
 */
export default function AccountPage() {
  const [workers, setWorkers] = useState<(SocialWorker & { online: boolean })[]>([]);
  const [commands, setCommands] = useState<WorkerCommand[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const toast = useToast();

  const load = useCallback(async () => {
    try {
      const [w, c] = await Promise.all([listWorkers(), listRecentCommands(3)]);
      setWorkers(w);
      setCommands(c);
      setError(null);
    } catch (err) {
      setError(friendlyMessage(err, 'טעינה נכשלה.'));
    } finally {
      setLoaded(true);
    }
  }, []);

  /*
   * Polled, and never twice at once or while the tab is hidden — the same
   * shape BrowserStatusCard settled on after its poller stacked on a slow
   * connection and started landing responses out of order. It matters more
   * here: the whole screen is a live report on a machine in another room, and
   * a switch takes a minute of somebody typing into a Chrome window.
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
  }, [load]);

  const worker = workers.find((w) => w.online) ?? workers[0];
  const online = Boolean(worker?.online);
  const connected = online && worker?.browser_state === 'connected';
  /* The account is shown only when a worker actually reported one. An empty
     name is a real answer here — it means the page yielded none — and it must
     not be filled in with a placeholder. */
  const account = worker?.fb_user_name ? { name: worker.fb_user_name, avatar: worker.fb_avatar_url ?? '' } : null;
  const lastCommand = commands[0];

  async function send(command: WorkerCommandName, label: string) {
    setBusy(command);
    try {
      await sendWorkerCommand(worker?.online ? worker.id : null, command);
      await load();
      toast(label);
    } catch (err) {
      setError(friendlyMessage(err, 'הפקודה נכשלה.'));
    } finally {
      setBusy(null);
    }
  }

  /**
   * Switch, in the order the machine needs it: wipe the profile, then open a
   * window on Facebook's login page.
   *
   * Sent as two commands rather than one because the worker already has both
   * and runs them in order, and because either half is worth doing alone —
   * disconnecting a shared computer at the end of a day is not the same
   * request as signing in as somebody else.
   */
  async function switchAccount() {
    const ok = await confirm.ask({
      title: 'להחליף חשבון פייסבוק?',
      body:
        'החשבון המחובר יימחק מהמחשב, וייפתח שם חלון Chrome על דף ההתחברות של פייסבוק. שם מקלידים את שם המשתמש והסיסמה של החשבון החדש — בדף של פייסבוק עצמה, לא כאן. עד שההתחברות תושלם לא יוצאים פרסומים לקבוצות.',
      confirmLabel: 'נתק ופתח התחברות',
      danger: true,
    });
    if (!ok) return;
    setBusy('switch');
    try {
      await sendWorkerCommand(worker?.online ? worker.id : null, 'logout');
      await sendWorkerCommand(worker?.online ? worker.id : null, 'login');
      await load();
      toast('נשלח למחשב. עברו לחלון Chrome שנפתח שם והתחברו לחשבון החדש.');
    } catch (err) {
      setError(friendlyMessage(err, 'הפקודה נכשלה.'));
    } finally {
      setBusy(null);
    }
  }

  return (
    <SocialShell title="חשבון הפייסבוק המפרסם" lede="באיזה חשבון פייסבוק המערכת מפרסמת לקבוצות, ואיך מחליפים אותו.">
      {!loaded ? (
        <Loading />
      ) : (
        <>
          {error && <div className="mb-3"><Notice tone="error">{error}</Notice></div>}

          <Card title="מי מחובר עכשיו">
            {account ? (
              <div className="flex items-center gap-3">
                {account.avatar ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={account.avatar} alt="" className="h-14 w-14 shrink-0 rounded-full object-cover" />
                ) : (
                  <TargetAvatar name={account.name} size={56} />
                )}
                <div className="min-w-0">
                  <p dir="auto" className="truncate text-lg font-extrabold text-ink-100">{account.name}</p>
                  <p className="mt-0.5 text-xs text-mist-500">
                    {connected ? 'כל פרסום לקבוצה יוצא בשם הזה.' : 'זה החשבון האחרון שנקרא מהמחשב — כרגע החיבור לא מאומת.'}
                  </p>
                </div>
              </div>
            ) : (
              <p className="text-sm text-mist-400">
                {online
                  ? 'אף חשבון פייסבוק לא מחובר בדפדפן של התוכנה. לחצו "התחבר לחשבון" למטה.'
                  : 'התוכנה במחשב לא פועלת, אז אי אפשר לדעת איזה חשבון מחובר.'}
              </p>
            )}
            <p className="mt-3 text-xs text-mist-500">
              {worker ? (
                <>
                  המחשב: {worker.name} · {worker.host || '—'} · נבדק לאחרונה <Stamp iso={worker.last_seen_at} />
                </>
              ) : (
                <>
                  התוכנה עוד לא הופעלה. במחשב שבו מותקנת המערכת, לחצו פעמיים על <code dir="ltr">start-worker.cmd</code> והשאירו את החלון השחור פתוח.
                </>
              )}
            </p>
          </Card>

          <div className="mt-3">
            <Card
              title="החלפה לחשבון אחר"
              subtitle="שם המשתמש והסיסמה מוקלדים בדף של פייסבוק, בחלון שנפתח על המחשב — לא במסך הזה."
            >
              {!online && (
                <div className="mb-3">
                  <Notice tone="warn">
                    <strong>התוכנה במחשב לא פועלת.</strong> החלפת חשבון קורית בדפדפן שעל המחשב, אז צריך שהוא יהיה פתוח. הפעילו שם את{' '}
                    <code dir="ltr">start-worker.cmd</code> ונסו שוב.
                  </Notice>
                </div>
              )}
              <ol className="mb-3 space-y-1.5 text-sm text-mist-400">
                <li>1. לוחצים "נתק ופתח התחברות" — החשבון הנוכחי נמחק מהמחשב.</li>
                <li>2. במחשב נפתח חלון Chrome על דף ההתחברות של פייסבוק.</li>
                <li>3. מקלידים שם והסיסמה של החשבון החדש, ומאשרים אימות דו-שלבי אם פייסבוק מבקשת.</li>
                <li>4. חוזרים לכאן — השם והתמונה של החשבון החדש יופיעו למעלה תוך כמה שניות.</li>
              </ol>
              <div className="flex flex-wrap gap-2">
                <Button busy={busy === 'switch'} disabled={!online} onClick={switchAccount}>
                  נתק ופתח התחברות
                </Button>
                <Button
                  variant="secondary"
                  busy={busy === 'login'}
                  disabled={!online}
                  onClick={() => send('login', 'נשלח למחשב. עברו לחלון Chrome שנפתח שם.')}
                >
                  התחבר לחשבון
                </Button>
                <Button
                  variant="secondary"
                  busy={busy === 'check'}
                  disabled={!online}
                  onClick={() => send('check', 'נשלחה בדיקת חיבור.')}
                >
                  בדוק חיבור
                </Button>
                <Button
                  variant="danger"
                  busy={busy === 'logout'}
                  disabled={!online}
                  onClick={async () => {
                    const ok = await confirm.ask({
                      title: 'לנתק את החשבון?',
                      body: 'החיבור לפייסבוק יימחק מהמחשב ולא ייצאו פרסומים לקבוצות עד שתתחברו שוב — לאותו חשבון או לאחר.',
                      confirmLabel: 'נתק',
                      danger: true,
                    });
                    if (ok) send('logout', 'החשבון נותק מהמחשב.');
                  }}
                >
                  נתק בלבד
                </Button>
              </div>
              {lastCommand && (
                <p className="mt-3 text-xs text-mist-500">
                  פקודה אחרונה: {lastCommand.command} · {lastCommand.status}
                  {lastCommand.result ? ` · ${lastCommand.result}` : ''}
                </p>
              )}
            </Card>
          </div>

          {/*
            Said plainly, because "why can't I just type it here" is the first
            thing this screen invites somebody to ask, and an unanswered
            question about a password is the kind that gets answered wrongly.
          */}
          <div className="mt-3">
            <Card title="למה הסיסמה לא נכתבת כאן">
              <ul className="space-y-1.5 text-sm text-mist-400">
                <li>· המערכת הזו לא מחזיקה סיסמת פייסבוק בשום מקום. אין איפה להקליד אותה, ולכן אין מה שיישמר, ייסנכרן או ידלוף.</li>
                <li>· פייסבוק מגיבה להתחברות באימות דו-שלבי ובבדיקות אבטחה, שדורשות דפדפן אמיתי ואדם שמסתכל עליו. טופס כאן היה אוסף סיסמה ונתקע בשלב הראשון.</li>
                <li>· ההתחברות נשמרת רק בפרופיל Chrome שעל המחשב הזה. ניתוק מוחק אותו משם.</li>
              </ul>
            </Card>
          </div>
        </>
      )}
      {confirm.dialog}
    </SocialShell>
  );
}
