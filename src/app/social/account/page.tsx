'use client';

import { useCallback, useEffect, useState } from 'react';
import { Stamp } from '@/components/social/DateTime';
import { SocialShell } from '@/components/social/SocialShell';
import { TargetAvatar } from '@/components/social/TargetAvatar';
import { Button, Card, Field, Loading, Notice, inputClass, useConfirm, useToast } from '@/components/social/ui';
import { ProfileUploadCard } from '@/components/social/ProfileUploadCard';
import { PairWorkerCard } from '@/components/social/PairWorkerCard';
import { listRecentCommands, listWorkers, screenshotUrl, sendWorkerCommand } from '@/lib/social/client';
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
 * THE DETAILS ARE TYPED HERE, because this product is meant to be sold. A
 * customer buys it, enters their own Facebook details on their own phone, and
 * their own account publishes to their own groups. Requiring them to walk to
 * the machine would make the thing unsellable, and an earlier version of this
 * screen did exactly that.
 *
 * What it is NOT is a password store, and the difference is the whole design:
 *
 *   - What is typed lives in component state and goes out as a ONE-TIME
 *     command payload. The worker empties that column in the same statement
 *     that claims the command, before it opens a browser, so nothing is left
 *     to read a second time. No table holds it, no log receives it (scrub()
 *     redacts any key matching /password|secret|token/), and the command list
 *     rendered below names its columns rather than asking for all of them.
 *   - The worker types them into FACEBOOK'S OWN login form, in a real Chrome
 *     window on the machine that publishes. It does not talk to an API or
 *     forge a session.
 *   - Typing the password skips a step; it does not skip Facebook. Two-factor
 *     codes, device approvals and security checks still happen — and they are
 *     answered HERE. The worker photographs whatever Facebook is showing, this
 *     screen renders it, and what the person types goes back the same one-time
 *     way. Nobody has to be standing at the machine, which is the difference
 *     between a tool its author can use and a product somebody can buy.
 *
 * And it says plainly that automated sign-in is against Facebook's terms and
 * can get an account locked. Somebody paying for this deserves to learn that
 * from the screen rather than from Facebook.
 */

/**
 * The last instruction, as a sentence.
 *
 * It read "פקודה אחרונה: login · pending" — two English words from a database
 * column, on a screen a cleaning-business owner reads on a phone. Worse, the
 * one state that actually needs explaining is exactly the one that word hides:
 * "pending" means NOBODY HAS PICKED IT UP, which on a machine that is not
 * running is the whole answer and on a machine that is running is a real
 * fault. Said in Hebrew, it tells them what to do next.
 */
function commandLine(cmd: WorkerCommand, online: boolean): string {
  const what: Record<string, string> = {
    login: 'התחברות',
    check: 'בדיקת חיבור',
    logout: 'ניתוק',
    resume: 'המשך סבב',
    verify: 'שליחת קוד אימות',
    profiles: 'חיפוש פרופילים',
    switch: 'מעבר בין פרופילים',
  };
  const name = what[cmd.command] ?? cmd.command;
  if (cmd.status === 'pending') {
    return online
      ? `${name}: ממתינה — התוכנה במחשב עוד לא לקחה אותה.`
      : `${name}: ממתינה, והתוכנה במחשב לא פועלת. הפעילו אותה שם כדי שהפעולה תתבצע.`;
  }
  if (cmd.status === 'running') return `${name}: מתבצעת עכשיו.`;
  if (cmd.status === 'failed') return `${name}: נכשלה.`;
  return `${name}: הסתיימה.`;
}

export default function AccountPage() {
  const [workers, setWorkers] = useState<(SocialWorker & { online: boolean })[]>([]);
  const [commands, setCommands] = useState<WorkerCommand[]>([]);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const confirm = useConfirm();
  const toast = useToast();
  /*
   * Held in component state and nowhere else — no localStorage, no draft
   * saving, no query string. The component unmounts and they are gone.
   */
  const [user, setUser] = useState('');
  const [secret, setSecret] = useState('');
  const [code, setCode] = useState('');
  /* A signed URL for the challenge screenshot, re-fetched whenever the worker
     publishes a new one. The bucket is private: this is a photograph of
     somebody's Facebook mid-login, not a public asset. */
  const [shotUrl, setShotUrl] = useState<string | null>(null);

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
  /*
   * The profile list, and WHETHER IT WAS EVER READ — two facts, because an
   * empty array answers both "this account has one profile" and "nobody has
   * looked", and only the timestamp separates them.
   */
  const profiles = worker?.fb_profiles ?? [];
  const profilesReadAt = worker?.fb_profiles_at ?? null;
  const currentName = worker?.fb_user_name ?? '';
  const avatar = worker?.fb_avatar_url ?? '';
  const challenge = worker?.login_stage === 'challenge';
  const shotPath = worker?.login_shot ?? '';

  /*
   * The signed URL is fetched for the path the worker published, and dropped
   * the moment the challenge closes — a picture of a question that has been
   * answered is worse than no picture, because the screen goes on asking.
   */
  useEffect(() => {
    if (!challenge || !shotPath) {
      setShotUrl(null);
      return;
    }
    let alive = true;
    screenshotUrl(shotPath)
      .then((url) => {
        if (alive) setShotUrl(url);
      })
      .catch(() => undefined);
    return () => {
      alive = false;
    };
  }, [challenge, shotPath]);

  /** Send back what Facebook asked for. One-time, like the password. */
  async function sendCode() {
    if (!code.trim()) return;
    setBusy('verify');
    try {
      await sendWorkerCommand(worker?.online ? worker.id : null, 'verify', { code: code.trim() });
      setCode('');
      await load();
      toast('נשלח. אם זה התקבל, ההתחברות תושלם תוך כמה שניות.');
    } catch (err) {
      setError(friendlyMessage(err, 'השליחה נכשלה.'));
    } finally {
      setBusy(null);
    }
  }

  /**
   * MOVE THE PUBLISHING ONTO ANOTHER PROFILE OF THE SAME ACCOUNT.
   *
   * Confirmed rather than instant, and the wording says the two things that
   * actually change: who every future post is signed by, and which groups are
   * reachable at all — a second profile is a member of its own groups, not of
   * the first one's. Somebody tapping this on a phone at midnight should not
   * discover the second half in the morning.
   *
   * The NAME is what travels, because that is what Facebook's menu offers;
   * there are no ids on those rows. It is checked against the worker's own
   * reading of that menu before anything is pressed — see the switch command
   * in social-worker.ts. A name arriving from this screen is a request, never
   * a permission.
   */
  async function goToProfile(name: string) {
    const ok = await confirm.ask({
      title: `לעבור לפרופיל "${name}"?`,
      body: 'מהרגע הזה כל פרסום וכל תגובה ייצאו מהפרופיל הזה. שימו לב: אפשר לפרסם רק לקבוצות שהפרופיל הזה חבר בהן, ולכן ייתכן שרשימת הקבוצות שנפרסם אליהן תשתנה.',
      confirmLabel: 'עבור',
    });
    if (!ok) return;
    setBusy(`switch:${name}`);
    try {
      await sendWorkerCommand(worker?.online ? worker.id : null, 'switch', { name });
      await load();
      toast('הבקשה נשלחה למחשב. המעבר לוקח כמה שניות.');
    } catch (err) {
      setError(friendlyMessage(err, 'הפקודה נכשלה.'));
    } finally {
      setBusy(null);
    }
  }

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
   * Sign in with what was typed on this screen.
   *
   * The details go to the local worker as a one-time command payload, which it
   * empties in the same statement that claims the command — before it opens a
   * browser. They are never stored, and this component forgets them the moment
   * the command is away.
   *
   * The profile is wiped first. Signing in as somebody new on top of an
   * existing Facebook session lands on that session rather than on a login
   * form, so without this the new details would be typed into a page that is
   * not asking for them.
   */
  async function signIn() {
    if (!user.trim() || !secret) return;
    setBusy('signin');
    try {
      await sendWorkerCommand(worker?.online ? worker.id : null, 'logout');
      await sendWorkerCommand(worker?.online ? worker.id : null, 'login', { user: user.trim(), pass: secret });
      setSecret('');
      await load();
      toast('מתחבר. אם פייסבוק תבקש אימות — הוא יופיע כאן במסך תוך כמה שניות.');
    } catch (err) {
      setError(friendlyMessage(err, 'ההתחברות נכשלה.'));
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
              <p className="text-sm text-mist-300">
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

          {/*
            FIRST ON THE SCREEN WHEN IT IS OPEN, above everything else.

            A login stops dead here until somebody answers, and the person who
            can answer is holding a phone, not standing at the machine. That is
            the entire reason this card exists — without it, "Facebook asked
            for a code" is a dead end for anybody who did not build this.
          */}
          {challenge && (
            <div className="mb-3">
              <Card title="פייסבוק מבקשת אימות" subtitle="זה מה שפייסבוק מציגה עכשיו. ענו כאן — אין צורך לגשת למחשב.">
                {shotUrl ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={shotUrl}
                    alt="מה שפייסבוק מציגה כרגע בחלון ההתחברות"
                    className="mb-3 w-full rounded-xl border border-ink-700 bg-ink-900 object-contain"
                  />
                ) : (
                  <p className="mb-3 text-sm text-mist-500">טוען את מה שפייסבוק מציגה…</p>
                )}
                <form
                  onSubmit={(e) => {
                    e.preventDefault();
                    void sendCode();
                  }}
                >
                  <Field label="הקוד או התשובה שפייסבוק מבקשת">
                    <input
                      className={inputClass}
                      dir="ltr"
                      type="text"
                      inputMode="numeric"
                      autoComplete="one-time-code"
                      value={code}
                      onChange={(e) => setCode(e.target.value)}
                    />
                  </Field>
                  <div className="mt-3">
                    <Button type="submit" busy={busy === 'verify'} disabled={!code.trim()}>
                      שלח לפייסבוק
                    </Button>
                  </div>
                </form>
                <p className="mt-3 text-xs text-mist-500">
                  התמונה מצולמת מהדפדפן שמפרסם, והיא פרטית. אם עברו כמה דקות בלי תשובה — ההתחברות נסגרת וצריך להתחיל מחדש.
                </p>
              </Card>
            </div>
          )}

          <div className="mt-3">
            <Card
              title="התחברות לחשבון פייסבוק"
              subtitle="מזינים כאן את פרטי החשבון. הם נשלחים למחשב לשימוש חד-פעמי ולא נשמרים בשום מקום."
            >
              {!online && (
                <div className="mb-3">
                  <Notice tone="warn">
                    <strong>התוכנה במחשב לא פועלת.</strong> ההתחברות מתבצעת בדפדפן שעל המחשב, אז צריך שהוא יהיה פתוח. הפעילו שם את{' '}
                    <code dir="ltr">start-worker.cmd</code> ונסו שוב.
                  </Notice>
                </div>
              )}
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  void signIn();
                }}
              >
                <Field label="אימייל או טלפון של החשבון">
                  <input
                    className={inputClass}
                    dir="ltr"
                    type="text"
                    inputMode="email"
                    autoComplete="off"
                    value={user}
                    onChange={(e) => setUser(e.target.value)}
                    placeholder="name@example.com"
                  />
                </Field>
                <div className="mt-2">
                  <Field label="סיסמה">
                    <input
                      className={inputClass}
                      dir="ltr"
                      /* Masked and kept out of the browser's saved passwords:
                         this field is a pass-through to one machine, not a
                         credential this site owns. */
                      type="password"
                      autoComplete="off"
                      value={secret}
                      onChange={(e) => setSecret(e.target.value)}
                    />
                  </Field>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  <Button type="submit" busy={busy === 'signin'} disabled={!online || !user.trim() || !secret}>
                    התחבר לחשבון הזה
                  </Button>
                  <Button
                    variant="secondary"
                    busy={busy === 'check'}
                    disabled={!online}
                    onClick={() => send('check', 'נשלחה בדיקת חיבור.')}
                  >
                    בדוק חיבור
                  </Button>
                </div>
              </form>
              {/*
                Said here, not buried: Facebook answers a password with a code
                or a device approval more often than not, and somebody who does
                not expect that reads a half-finished login as a broken product.
              */}
              <p className="mt-3 text-xs text-mist-500">
                אם פייסבוק תבקש קוד אימות או אישור מכשיר — הוא יופיע כאן במסך הזה, עם תמונה של מה שהיא מציגה ושדה לענות בו. אין צורך לגשת למחשב.
              </p>
              {lastCommand && (
                <p className="mt-2 text-xs text-mist-500">
                  {commandLine(lastCommand, online)}
                  {lastCommand.result ? ` · ${lastCommand.result}` : ''}
                </p>
              )}
            </Card>
          </div>

          {/*
            THE OTHER PROFILES ON THIS ACCOUNT.

            One Facebook account can carry several profiles — a person and
            their business — and until now this product knew only the one whose
            cookie the browser happened to hold. Every group post went out
            under it, and a business that posts as itself had no way to say so.

            THE LIST IS THE WORKER'S, NOT THIS SCREEN'S. It is whatever the
            machine read out of Facebook's own account menu, and the switch is
            performed there, in that menu, in the window that publishes. This
            screen offers the choice and reports the answer; it cannot invent a
            profile, and a name it sends is checked against that same reading
            before anything is pressed.

            THE BUTTON IS ON THE OTHER ROWS, never on the active one. A "switch
            to" beside the profile you are already on is a tap that asks
            Facebook to do nothing and then reports either outcome as news.
          */}
          <div className="mt-3">
            <Card
              title="פרופילים בחשבון הזה"
              subtitle="לפייסבוק אחת יכולים להיות כמה פרופילים — אישי ועסקי. כאן בוחרים מי מהם מפרסם."
              action={
                <Button variant="secondary" busy={busy === 'profiles'} disabled={!online} onClick={() => send('profiles', 'מחפשים פרופילים במחשב…')}>
                  {profilesReadAt ? 'רענן' : 'חפש פרופילים'}
                </Button>
              }
            >
              {/*
                THREE STATES, AND THE FIRST TWO ARE NOT THE SAME.
                "Nobody has looked yet" and "we looked and there is one" are
                different answers, and only the timestamp can tell them apart.
                Showing "no other profiles" to somebody who has a business
                profile, merely because nothing was ever read, would send them
                looking for a bug in the wrong place.
              */}
              {!profilesReadAt ? (
                <p className="text-sm text-mist-300">
                  עוד לא בדקנו אילו פרופילים יש בחשבון הזה. לחצו "חפש פרופילים" — התוכנה במחשב תפתח את תפריט החשבון בפייסבוק ותקרא מה יש בו.
                </p>
              ) : profiles.length <= 1 ? (
                <p className="text-sm text-mist-300">
                  בחשבון הזה יש פרופיל אחד בלבד{currentName ? ` — ${currentName}` : ''}. אם פתחתם מאז פרופיל נוסף בפייסבוק, לחצו "רענן".
                </p>
              ) : (
                <ul className="grid gap-2">
                  {profiles.map((p) => {
                    const active = Boolean(currentName) && p.name === currentName;
                    return (
                      <li
                        key={p.name}
                        className={`flex min-h-14 items-center gap-3 rounded-xl border px-3 py-2 ${
                          active ? 'border-success-400/40 bg-success-400/10' : 'border-ink-700 bg-ink-850'
                        }`}
                      >
                        {/* The face is only ever shown for the profile we
                            actually photographed — the signed-in one. A stock
                            circle beside somebody else's name is the same lie
                            as a stock face, one size smaller. */}
                        {/* The signed-in account's own avatar for the row that
                            is publishing, and for the others the logo the
                            computer photographed in Facebook's menu — which is
                            what this list had no way of showing until the
                            switcher started collecting them. Still never a stock
                            circle standing in for a face nobody read: a name
                            with no picture gets its initial. */}
                        {active && avatar ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={avatar} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover" />
                        ) : p.image ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img src={p.image} alt="" className="h-9 w-9 shrink-0 rounded-full object-cover ring-1 ring-ink-700" />
                        ) : (
                          <span className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-ink-800 text-sm font-extrabold text-mist-300">
                            {p.name.trim().charAt(0) || '?'}
                          </span>
                        )}
                        <span className="flex min-w-0 flex-1 flex-col">
                          <span dir="auto" className="truncate text-sm font-bold text-mist-100">
                            {p.name}
                          </span>
                          {/*
                            SAID ON THE ROW, because it changes what to expect.
                            A Page can publish only to groups whose admin
                            allowed Pages in; the rest are skipped and listed.
                            Somebody choosing between two names deserves to
                            know that before they tap, not afterwards from a
                            list of skipped groups.
                          */}
                          {p.kind === 'page' && (
                            <span className="text-[11px] font-bold text-mist-500">דף עסקי</span>
                          )}
                        </span>
                        {active ? (
                          <span className="shrink-0 rounded-lg bg-success-400/15 px-2 py-1 text-xs font-extrabold text-success-400">
                            מפרסם עכשיו
                          </span>
                        ) : (
                          <Button
                            variant="secondary"
                            className="shrink-0"
                            busy={busy === `switch:${p.name}`}
                            disabled={!online}
                            onClick={() => goToProfile(p.name)}
                          >
                            עבור לזה
                          </Button>
                        )}
                      </li>
                    );
                  })}
                </ul>
              )}
              {profiles.some((p) => p.kind === 'page') && (
                <p className="mt-3 rounded-xl bg-warning-400/10 px-3 py-2 text-xs leading-relaxed text-warning-400">
                  פרסום בתור <b>דף עסקי</b> אפשרי רק בקבוצות שמנהל הקבוצה אישר בהן פרסום מדפים — ברוב הקבוצות זה כבוי.
                  קבוצה שלא מאפשרת תדולג, תופיע ברשימה עם הסיבה, <b>ותישאר פעילה</b> — היא תמשיך לעבוד כרגיל מהפרופיל האישי.
                </p>
              )}
              <p className="mt-3 text-xs text-mist-500">
                המעבר נעשה בתפריט של פייסבוק עצמה, באותו חלון שבו התוכנה מפרסמת — בדיוק כמו שהייתם עושים ידנית. אם פייסבוק תבקש אימות באמצע, זה יופיע למעלה במסך הזה.
              </p>
            </Card>
          </div>

          <div className="mt-3">
            <Card title="פעולות נוספות">
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" busy={busy === 'switch'} disabled={!online} onClick={switchAccount}>
                  פתח חלון התחברות במחשב
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
                  נתק
                </Button>
              </div>
              <p className="mt-2 text-xs text-mist-500">
                "פתח חלון התחברות" מנתק את החשבון הנוכחי ופותח במחשב חלון על דף ההתחברות של פייסבוק, בלי להזין כאן כלום — שימושי כשיושבים ליד המחשב.
              </p>
            </Card>
          </div>

          <div className="mt-3">
            <PairWorkerCard />
          </div>

          <div className="mt-3">
            <ProfileUploadCard />
          </div>

          {/*
            THE TWO THINGS SOMEBODY BUYING THIS DESERVES TO KNOW, and neither is
            a detail. A password typed into a tool is a question about where it
            goes; an automated Facebook login is a question about what Facebook
            does back. Left unsaid, both get answered wrongly and the first
            locked account is a surprise.
          */}
          <div className="mt-3">
            <Card title="מה קורה עם הפרטים, ומה פייסבוק עושה">
              <ul className="space-y-1.5 text-sm text-mist-300">
                <li>· הסיסמה נשלחת למחשב פעם אחת, לצורך ההתחברות, ונמחקת באותו רגע שהמחשב לוקח אותה. היא לא נשמרת בשום טבלה ולא מופיעה בשום יומן.</li>
                <li>· מרגע שההתחברות הצליחה, מה שנשמר הוא פרופיל Chrome על המחשב בלבד — בדיוק כמו דפדפן רגיל. "נתק" מוחק אותו.</li>
                <li>· התחברות אוטומטית עם סיסמה היא נגד תנאי השימוש של פייסבוק, והיא עלולה לגרום לנעילת החשבון או לדרישת אימות. זה סיכון שנופל על בעל החשבון.</li>
                <li>· פייסבוק מבקשת לעיתים קרובות קוד אימות או אישור מכשיר. אי אפשר לעקוף את זה, אבל עונים עליו מכאן — השאלה מופיעה במסך הזה עם תמונה של מה שפייסבוק מציגה.</li>
              </ul>
            </Card>
          </div>
        </>
      )}
      {confirm.dialog}
    </SocialShell>
  );
}
