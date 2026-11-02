'use client';

import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { Stamp } from '@/components/social/DateTime';
import { SocialShell } from '@/components/social/SocialShell';
import { BrowserStatusCard } from '@/components/social/BrowserStatusCard';
import { Button, Card, Field, Loading, Notice, SegmentedControl, Toggle, inputClass, useToast } from '@/components/social/ui';
import { getBrowserSettings, getBusiness, getControl, getLimits, listWorkers, loadAdminPresence, saveSetting, setPaused } from '@/lib/social/client';
import { WORKER_VERSION } from '@/lib/social/worker-version';
import { ABSOLUTE_MIN_REPEAT_HOURS, MAX_REPEAT_HOURS, MIN_REPEAT_HOURS, repeatFloorFrom } from '@/lib/social/campaign-schedule';
import { DEFAULT_BROWSER, DEFAULT_BUSINESS, DEFAULT_LIMITS, type AdminPresence, type BrowserSettings, type BusinessSettings, type ControlSettings, type LimitsSettings } from '@/lib/social/types';
import { accountGapLabel, accountGapSeconds } from '@/lib/social/rules';
import { friendlyMessage } from '@/lib/social/errors';

type Tab = 'limits' | 'browser' | 'business' | 'admin';

/* How often the admin panel re-asks while it is open. "כל רגע נתון" is what
   was asked for, and a presence screen that does not refresh is a photograph:
   it would show a machine as connected for as long as the tab stayed open. Ten
   seconds is well inside WORKER_OFFLINE_AFTER_SECONDS (90), so a machine that
   stops answering goes grey here within one cutoff rather than two. */
const PRESENCE_POLL_MS = 10_000;

/**
 * Settings, in three sections rather than one long scroll. The wording here
 * matters: every number on this screen is the owner's own choice, and the
 * screen says so — Meta publishes no per-account posting quota that a tool
 * can promise to stay under.
 */
export default function SettingsPage() {
  const [tab, setTab] = useState<Tab>('limits');
  const [limits, setLimits] = useState<LimitsSettings>(DEFAULT_LIMITS);
  const [control, setControl] = useState<ControlSettings>({ paused: false, rateLimitedUntil: null });
  const [business, setBusiness] = useState<BusinessSettings>(DEFAULT_BUSINESS);
  const [browser, setBrowser] = useState<BrowserSettings>(DEFAULT_BROWSER);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  /*
   * The version the PC is actually running.
   *
   * Some settings on this screen are enforced on the SERVER (Pages, Graph API)
   * and take effect the moment they are saved. The repeat-to-same-group switch
   * is not one of them: groups are published by the copy of this codebase
   * running on the owner's own machine, and an older copy does not know the
   * key exists — it reads the same settings row, ignores the new field, and
   * goes on skipping. Saving the switch then looks like it did nothing, which
   * is exactly the kind of silence this product keeps removing.
   */
  const [workerVersion, setWorkerVersion] = useState<string | null>(null);

  /*
   * ─── THE OWNER'S PANEL, AND WHY IT IS NULL FOR EVERYONE ELSE ─────────────
   *
   * "ותוסיף רק אצלי, לא אצל הלקוחות."
   *
   * The server answers every signed-in person, and answers a customer
   * `admin: false` with empty lists — so this state is never the thing keeping
   * the panel hidden. It cannot be: anything the browser decides, a customer's
   * browser can be told to decide differently. The gate is the allowlist in
   * the server's environment (server/auth.ts), and what arrives here is
   * already the whole of what this person is allowed to see.
   *
   * Null means "not asked yet, or the ask failed" — drawn as nothing, exactly
   * like `admin: false`, because a panel about who is connected may not guess.
   */
  const [presence, setPresence] = useState<AdminPresence | null>(null);

  useEffect(() => {
    Promise.all([
      getLimits(),
      getControl(),
      getBusiness(),
      getBrowserSettings(),
      listWorkers().catch(() => []),
      /* Swallowed on purpose: a customer, or a deployment with no allowlist
         configured, must not see "טעינה נכשלה" over a panel they were never
         going to be shown. A real failure for the OWNER shows as the panel
         staying away, which is the same thing the gate does — so the tab
         simply does not appear and nothing on this screen is wrong. */
      loadAdminPresence().catch(() => null),
    ])
      .then(([l, c, b, br, workers, pres]) => {
        setPresence(pres);
        setLimits(l);
        setControl(c);
        setBusiness(b);
        setBrowser(br);
        const live = workers.find((w) => w.online) ?? workers[0] ?? null;
        setWorkerVersion(live?.version ?? null);
        setLoaded(true);
      })
      .catch((err) => setError(friendlyMessage(err, 'טעינה נכשלה.')));
  }, []);

  /*
   * ─── "כל רגע נתון" ───────────────────────────────────────────────────────
   *
   * Only while the panel is on screen, and only for somebody the server has
   * already called an admin. A presence screen that polled from the settings
   * page in general would cost every customer a request every ten seconds for
   * an answer they are not allowed to have.
   *
   * A failed refresh keeps the last good answer rather than blanking the list
   * — one dropped poll on a phone's flaky connection is not evidence that
   * everybody disconnected. The timestamps on the rows are what age, and they
   * are drawn from the server's own clock.
   */
  const isAdmin = presence?.admin === true;
  useEffect(() => {
    if (!isAdmin || tab !== 'admin') return;
    const id = setInterval(() => {
      void loadAdminPresence()
        .then((p) => setPresence(p))
        .catch(() => undefined);
    }, PRESENCE_POLL_MS);
    return () => clearInterval(id);
  }, [isAdmin, tab]);

  /**
   * Save what this form edits, onto the rows as they are NOW.
   *
   * saveSetting() upserts the WHOLE jsonb value, so writing back a copy read
   * at mount reverts anything written into that row since — and these rows do
   * get written elsewhere. graph.ts sets `control.rateLimitedUntil` when Meta
   * asks us to slow down, worker.ts clears it, the header's pause button
   * writes `control.paused` from any screen, and the dashboard's queue tuner
   * writes `limits.minGapMinutes` and `browser.groupMinGapMinutes` through
   * applyGapSettings(). A form left open for ten minutes and then saved
   * un-paused the account, erased a live cooldown and undid a gap the owner
   * had just tuned, with no way for them to know it had.
   *
   * So: re-read, then spread this form's fields over what came back. `control`
   * is not here at all — its two controls write themselves on the tap, since a
   * stop that waits for a second tap on שמור is not a stop.
   */
  /*
   * A REF, BECAUSE `busy` IS A RENDER TOO LATE.
   *
   * Measured in a real browser against this screen: three taps on "שמור"
   * dispatched inside one task produced THREE writes to social_settings. The
   * `busy` flag above is React state, so it is not set until the render after
   * the first click — the second and third handlers run before it exists.
   *
   * It matters more than a wasted request. save() is a read-modify-write: it
   * re-reads limits, business and browser, merges the form over them and
   * writes back. Three of those interleaving can land a merge built on a row
   * that a sibling save has already replaced. And there are two "שמור"
   * buttons on this screen, both calling this, so it does not even take a
   * double-tap.
   *
   * The same guard, for the same reason, as `writing` in
   * src/app/social/page.tsx — that comment explains it at length. A ref flips
   * synchronously, inside the handler, which is the only thing that can stop
   * the second tap. One tap behaves exactly as it always did.
   */
  const saving = useRef(false);

  async function save() {
    if (saving.current) return;
    saving.current = true;
    setBusy(true);
    try {
      const [curLimits, curBrowser, curBusiness] = await Promise.all([getLimits(), getBrowserSettings(), getBusiness()]);
      /*
       * ─── THE MINUTE FIELDS CARRY THEIR SECONDS WITH THEM ────────────────
       *
       * The two gap boxes on this screen are whole minutes, and the pair they
       * write also has a `*Seconds` half that accountGapSeconds() PREFERS when
       * it is present. So once anything has written seconds — the campaign
       * panel lowering the floor to 30s does — typing "45" here and pressing
       * שמור would say "ההגדרות נשמרו", show 45, and leave the engine on
       * thirty seconds. A screen that is simply not true, with nothing on it
       * disagreeing with anything else.
       *
       * ...AND NOT DERIVED BLINDLY, which is where the first version of this
       * was WRONG in the opposite direction, silently, on the most ordinary
       * action this screen has.
       *
       * The seconds are stored alongside the minutes ROUNDED UP, deliberately:
       * a worker that predates them must read a SLOWER number, never a faster
       * one. So a 30-second floor is stored as `groupMinGapSeconds: 30` with
       * `groupMinGapMinutes: 1`. This box then loads "1" — and a save that
       * recomputed 1 × 60 = 60 would DOUBLE the floor the owner had just
       * chosen in the campaign panel, having been told nothing and having
       * touched nothing. Open this screen, press שמור, and 30 שניות quietly
       * becomes 60. A one-way ratchet upwards through the one screen whose
       * whole job is to show the truth about these settings.
       *
       * So the rule is: if the minutes in the box are still what the stored
       * seconds round up to, the owner did not touch this field — keep the
       * seconds exactly as they are. Only a minutes value that NO LONGER
       * agrees with them is a decision, and then the minutes win, because
       * minutes are all this control can express.
       */
      const keepOrDerive = (typedMinutes: number, storedSeconds: unknown): number => {
        const minutes = Math.max(0, Math.round(Number(typedMinutes) || 0));
        const stored = Number(storedSeconds);
        /* `>= 0` and not truthiness: a stored floor of 0 is a real setting —
           the owner who wants no gap at all — and `!0` would discard it. */
        if (Number.isFinite(stored) && stored >= 0 && Math.ceil(stored / 60) === minutes) return stored;
        return minutes * 60;
      };
      const gapFields = {
        minGapSeconds: keepOrDerive(limits.minGapMinutes, curLimits.minGapSeconds),
        groupMinGapSeconds: keepOrDerive(browser.groupMinGapMinutes, curBrowser.groupMinGapSeconds),
      };
      await Promise.all([
        saveSetting('limits', { ...curLimits, ...limits, minGapSeconds: gapFields.minGapSeconds }),
        saveSetting('business', { ...curBusiness, ...business }),
        saveSetting('browser', { ...curBrowser, ...browser, groupMinGapSeconds: gapFields.groupMinGapSeconds }),
      ]);
      toast('ההגדרות נשמרו.');
    } catch (err) {
      toast(friendlyMessage(err, 'השמירה נכשלה.'), 'error');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  /**
   * The emergency stop writes on the tap, like the identical button in the
   * header does — it is the same switch, and a stop that waits for a second
   * tap on שמור is not a stop. setPaused() re-reads the row and merges, so a
   * cooldown Meta set a second ago survives.
   */
  async function togglePause(next: boolean) {
    const previous = control.paused;
    setControl((c) => ({ ...c, paused: next }));
    try {
      await setPaused(next);
      toast(next ? 'הפרסום הושהה. התור נשמר.' : 'הפרסום חודש.');
    } catch (err) {
      setControl((c) => ({ ...c, paused: previous }));
      toast(friendlyMessage(err, 'לא הצלחנו לשנות את מצב הפרסום.'), 'error');
    }
  }

  /** Same merge, for the one server-written field this screen may clear. */
  async function clearRateLimit() {
    const previous = control.rateLimitedUntil;
    setControl((c) => ({ ...c, rateLimitedUntil: null }));
    try {
      const current = await getControl();
      await saveSetting('control', { ...current, rateLimitedUntil: null });
      toast('ההמתנה בוטלה. הפרסום יימשך בתור הרגיל.');
    } catch (err) {
      setControl((c) => ({ ...c, rateLimitedUntil: previous }));
      toast(friendlyMessage(err, 'לא הצלחנו לבטל את ההמתנה.'), 'error');
    }
  }

  /** The header button just wrote `paused`; re-read so this screen agrees. */
  function refreshControl() {
    getControl()
      .then(setControl)
      .catch(() => undefined);
  }

  const num = (key: keyof LimitsSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setLimits({ ...limits, [key]: Math.max(0, Number(e.target.value) || 0) });

  return (
    // `paused` / `onControlChanged`: this screen already holds the pause state,
    // so the header's button renders THIS value instead of polling
    // social_settings on a clock of its own — which is what let the header and
    // the switch a few hundred pixels below it show opposite states at once.
    <SocialShell
      title="הגדרות"
      lede="קצב, מגבלות ופרטי העסק"
      paused={loaded ? control.paused : null}
      onControlChanged={refreshControl}
      /*
       * NOT PRESSABLE BEFORE THE FORM HAS LOADED — and this was the worst bug
       * in the screen.
       *
       * The body below is gated on `loaded`; this button was not. So on a slow
       * connection, or on a failed first read (which leaves `loaded` false and
       * renders nothing but a red banner and this button), one tap ran save()
       * — which merges the form state over the stored rows. That form state is
       * still DEFAULT_LIMITS / DEFAULT_BUSINESS / DEFAULT_BROWSER at that
       * point, so the tap wrote the factory defaults over everything: testMode
       * back to true (every later publish capped at one group), the phone and
       * the WhatsApp link wiped out of every future post, and the gap reset.
       * The toast then said "ההגדרות נשמרו".
       *
       * Hidden rather than disabled, because while the body is not on screen
       * there is nothing to save; it comes back with the form.
       */
      headerAction={
        loaded ? (
          <Button busy={busy} onClick={save}>
            שמור
          </Button>
        ) : undefined
      }
    >
      {error && (
        <div className="mb-4">
          <Notice tone="error">{error}</Notice>
        </div>
      )}
      {!loaded && !error && <Loading />}
      {loaded && (
        <div className="space-y-4 pb-4">
          <SegmentedControl
            label="חלקי ההגדרות"
            value={tab}
            onChange={setTab}
            options={[
              { value: 'limits', label: 'קצב ומגבלות' },
              { value: 'browser', label: 'פרסום בקבוצות' },
              { value: 'business', label: 'פרטי העסק' },
              /* Appended rather than woven in, so the three tabs every
                 customer sees keep their order and their widths. */
              ...(isAdmin ? [{ value: 'admin' as const, label: 'ניהול' }] : []),
            ]}
          />

          {tab === 'limits' && (
            <>
              <Card title="היעד היומי שלכם" subtitle="מספרים שאתם קובעים — לא מכסות רשמיות של פייסבוק">
                <Notice tone="info">
                  לפייסבוק אין מספר פרסומים רשמי ומפורסם לחשבון פרטי, ואף כלי לא יכול להבטיח שמספר מסוים לא יוביל להגבלה. המספרים כאן הם
                  התקרה שאתם מגדירים למערכת, והיא תכבד אותה.
                </Notice>
                <div className="mt-3 grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                  <Field label="מקסימום פרסומים ביום (כל היעדים)" hint="פרסום מעבר לתקרה מדולג עם סיבה ברורה בהיסטוריה">
                    <input type="number" min={0} inputMode="numeric" className={inputClass} value={limits.maxPerDay} onChange={num('maxPerDay')} />
                  </Field>
                  <Field label="מקסימום ביום לכל יעד">
                    <input type="number" min={0} inputMode="numeric" className={inputClass} value={limits.maxPerTargetPerDay} onChange={num('maxPerTargetPerDay')} />
                  </Field>
                  <Field label="מרווח מינימלי בין פרסומים (דקות)" hint="פרסום שמגיע מוקדם מדי נדחה אוטומטית, לא נמחק">
                    <input type="number" min={0} inputMode="numeric" className={inputClass} value={limits.minGapMinutes} onChange={num('minGapMinutes')} />
                  </Field>
                  <Field label="מניעת כפילות (ימים)" hint="אותו טקסט ומדיה לאותו יעד לא יפורסמו שוב בטווח הזה">
                    <input type="number" min={0} inputMode="numeric" className={inputClass} value={limits.dedupeDays} onChange={num('dedupeDays')} />
                  </Field>
                </div>

                {/*
                  ─── WHAT THE ENGINE ACTUALLY ENFORCES, WHEN IT IS NOT A
                      WHOLE NUMBER OF MINUTES ─────────────────────────────

                  The box above is minutes, and the floor is stored in seconds
                  with the minutes beside it rounded UP. So a 30-second floor —
                  which is what the campaign panel writes when the owner picks
                  "30 שניות" — makes that box read "1", and 1 is not what the
                  engine does. The box is not wrong to say 1: it cannot say 0.5
                  and rounding DOWN would promise something faster than the
                  account allows. It is just not the whole truth, and this is
                  the one screen whose job is the whole truth about these
                  numbers.

                  Shown only when the two genuinely differ, so an account whose
                  floor IS a whole number of minutes sees nothing new. And it
                  names the two halves separately, because they are two boxes
                  on two tabs and the engine only ever compares against the
                  sum.
                */}
                {accountGapSeconds(limits, browser, true) !== (Math.max(0, Math.round(limits.minGapMinutes)) + Math.max(0, Math.round(browser.groupMinGapMinutes))) * 60 && (
                  <Notice tone="info">
                    המרווח שהמערכת באמת שומרת בין שני פרסומים לקבוצה הוא{' '}
                    <strong>{accountGapLabel(accountGapSeconds(limits, browser, true))}</strong> — פחות ממה שהתיבות למעלה יכולות להציג, כי הן
                    מציגות דקות שלמות. זה נקבע כשבחרתם הפרש בשניות בתזמון של קמפיין. שינוי של אחת התיבות למעלה ושמירה יחזירו את המרווח לדקות
                    שלמות.
                  </Notice>
                )}

                {/*
                  The one rule in the product that had no time window and no
                  switch: rules.ts refused a post at a group it had ever
                  reached, so an owner republishing the same monthly offer
                  watched every row skip with a reason that read like a bug.
                  It is a judgement, so it is presented as one — and the
                  consequence of switching it off is stated on the screen
                  rather than discovered on Facebook.
                */}
                <div className="mt-4 rounded-xl border border-ink-700 px-3 py-3">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-mist-100">לא לשלוח את אותו פוסט פעמיים לאותה קבוצה</p>
                      <p className="text-xs text-mist-500">
                        כשמופעל, פוסט שכבר פורסם לקבוצה לא יצא אליה שוב — לעולם, בלי קשר לכמה זמן עבר. זו הסיבה שמופיעה בהיסטוריה כ״הפוסט
                        הזה כבר פורסם ל…״.
                      </p>
                    </div>
                    <Toggle
                      checked={limits.blockRepeatToSameTarget !== false}
                      onChange={(v) => setLimits({ ...limits, blockRepeatToSameTarget: v })}
                      label="מניעת פרסום חוזר לאותה קבוצה"
                    />
                  </div>
                  {/*
                    The switch is enforced in rules.ts, which runs in TWO
                    places: on the server for Pages, and on the owner's own PC
                    for groups. An older copy on that PC does not know this key
                    exists — it reads the same settings row, ignores the field
                    and goes on skipping — so saving the switch looks like it
                    did nothing at all. Groups are almost everything this owner
                    publishes, so that silence is the whole feature failing.
                  */}
                  {limits.blockRepeatToSameTarget === false && workerVersion && workerVersion !== WORKER_VERSION && (
                    <div className="mt-2.5">
                      <Notice tone="error">
                        <strong>הכיבוי עדיין לא תקף לקבוצות.</strong> התוכנה שעל המחשב מריצה גרסה{' '}
                        <span dir="ltr">{workerVersion}</span> במקום <span dir="ltr">{WORKER_VERSION}</span>, והיא זו שמפרסמת לקבוצות —
                        גרסה ישנה לא מכירה את המתג הזה ותמשיך לדלג. סגרו את חלון התוכנה במחשב ולחצו פעמיים על{' '}
                        <code dir="ltr">start-worker.cmd</code> כדי לעדכן אותה. פרסום לדפי פייסבוק כבר עובד לפי המתג.
                      </Notice>
                    </div>
                  )}
                  {/*
                    ─── AND HOW CLOSE IS TOO CLOSE, WHICH USED TO BE A LAW ──

                    "את ההגנה של החזרה יומית של אותו הפוסט לאותו קבוצה יש הגנה
                     של 12 שעות תוסיף אופציה בהגדרות לשחק עם זה."
                     — the owner, 02.11.2026.

                    MIN_REPEAT_HOURS was a hard 12 in three clamps and a
                    database CHECK, and it was quietly costing him a layout he
                    had chosen on purpose. Measured by driving the real engine:
                    with rounds at 03:30, 06:30 and 18:30 the queue row for
                    round two was DEFERRED from 06:30 to 23:30, and because a
                    group may hold only one open row, that parked row then
                    blocked round three entirely. He asked for three
                    publications a day, the system delivered two — one at an
                    hour he never chose — and the card said it had saved three.

                    It sits inside THIS card rather than beside the other gaps
                    on purpose: it belongs to the toggle above it, and the two
                    boxes further up ("מרווח מינימלי בין פרסומים",
                    "מרווח נוסף בין קבוצות") are a different number about a
                    different thing. Three gaps on one screen is already one
                    too many to keep straight; a fourth that looked like a
                    sibling of those two would be unreadable.
                  */}
                  {limits.blockRepeatToSameTarget !== false && (
                    <div className="mt-3 border-t border-ink-700 pt-3">
                      <Field
                        label="מרווח מינימלי בין שני פרסומים של אותו פוסט לאותה קבוצה (שעות)"
                        hint="ברירת המחדל היא 12. זה המספר שקובע כמה סבבים ביום אפשר באמת להריץ לאותן קבוצות"
                      >
                        <input
                          type="number"
                          min={ABSOLUTE_MIN_REPEAT_HOURS}
                          max={MAX_REPEAT_HOURS}
                          inputMode="numeric"
                          className={inputClass}
                          value={limits.repeatFloorHours ?? MIN_REPEAT_HOURS}
                          onChange={(e) =>
                            setLimits({
                              ...limits,
                              repeatFloorHours: Math.min(
                                MAX_REPEAT_HOURS,
                                Math.max(ABSOLUTE_MIN_REPEAT_HOURS, Math.round(Number(e.target.value) || MIN_REPEAT_HOURS)),
                              ),
                            })
                          }
                        />
                      </Field>
                      {repeatFloorFrom(limits) < MIN_REPEAT_HOURS && (
                        <div className="mt-2.5">
                          <Notice tone="warn">
                            {repeatFloorFrom(limits) === 0
                              ? 'ביטלתם את ההגנה לגמרי — אין מרווח מינימלי בין שני פרסומים של אותו פוסט לאותה קבוצה. '
                              : `הורדתם את ההגנה ל-${repeatFloorFrom(limits)} שעות במקום ${MIN_REPEAT_HOURS}. מעכשיו אותו פוסט יכול לצאת לאותה`}
                            קבוצה פעמיים באותו יום עבודה. פרסום לקבוצות יוצא מחשבון הפייסבוק שלכם דרך הדפדפן שעל המחשב ולא דרך API, ולכן
                            תוכן חוזר לאותה קבוצה בפרק זמן קצר הוא בדיוק מה שמנהלי קבוצות ומערכות הסינון של Meta מחפשים — והחשבון שבסיכון
                            הוא שלכם. זו החלטה שלכם, והמערכת מבצעת אותה.
                          </Notice>
                        </div>
                      )}
                    </div>
                  )}
                  {limits.blockRepeatToSameTarget === false && (
                    <div className="mt-2.5">
                      <Notice tone="warn">
                        כיביתם את ההגנה. מעכשיו אותו פוסט יכול לצאת שוב ושוב לאותה קבוצה, ומה שימנע חזרה מיידית זה רק ״מניעת כפילות״ למעלה
                        ({limits.dedupeDays} ימים), שבודקת טקסט ומדיה זהים. פרסום לקבוצות יוצא מחשבון הפייסבוק שלכם דרך הדפדפן שעל המחשב, ולא
                        דרך API, ולכן תוכן חוזר לאותה קבוצה מסכן את החשבון האישי שלכם. אם אתם מפרסמים מבצע חוזר — עדיף לשנות את הנוסח בין
                        סבב לסבב.
                      </Notice>
                    </div>
                  )}
                </div>
              </Card>

              <Card title="עצירת חירום">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-ink-700 px-3 py-3">
                  <div className="min-w-0">
                    <p className="font-bold text-mist-100">השהיית כל הפרסומים</p>
                    <p className="text-xs text-mist-500">כשמופעל, שום דבר לא יוצא — כולל "פרסם עכשיו". התור נשמר.</p>
                  </div>
                  <Toggle checked={control.paused} onChange={togglePause} label="השהיה" />
                </div>
                {/* Two save models on one screen, so say which one this card
                    uses. Everything above needs שמור; this switch does not. */}
                <p className="mt-2 text-xs text-mist-500">ההשהיה נשמרת מיד — אין צורך ללחוץ "שמור".</p>
                {control.rateLimitedUntil && (
                  <p className="mt-2 text-xs text-warning-400">
                    Meta ביקשה להאט — הפרסום מושהה עד <Stamp iso={control.rateLimitedUntil} />.{' '}
                    <button type="button" className="min-h-11 px-1 font-bold underline" onClick={clearRateLimit}>
                      נקה
                    </button>
                  </p>
                )}
              </Card>
            </>
          )}

          {tab === 'browser' && (
            <>
              {/*
                THE CONNECTION LIVES HERE NOW, not on the dashboard.
                *
                * The owner asked for the "התוכנה במחשב פועלת ומחוברת" strip
                * off the home screen and a computer icon in the header
                * instead. Moved rather than deleted: this card is the ONLY
                * place in the product with "התחבר לפייסבוק", "בדוק חיבור" and
                * the profile reset, and deleting it would have taken away the
                * one way to reconnect at exactly the moment it is needed. The
                * header's icon links straight to it, and it keeps its
                * #browser-status id so every existing link still lands on it.
              */}
              <BrowserStatusCard id="browser-status" />

              <Card title="פרסום בקבוצות — איך זה עובד">
                <Notice tone="warn">
                  ל-Meta אין API לפרסום בקבוצות מאז אפריל 2024. הפרסום בקבוצות נעשה דרך חלון Chrome אמיתי על המחשב שלכם, מהחשבון שלכם. זו
                  אינה אינטגרציה רשמית של פייסבוק; היא עשויה לנגוד בתנאי השימוש, והשימוש בה באחריותכם. המערכת לא עוקפת CAPTCHA, אימות או
                  חסימה — כשפייסבוק מבקשת אדם, התוכנה עוצרת וממתינה לכם.
                </Notice>
              </Card>

              <Card title="בטיחות הריצה">
                <div className="space-y-2.5">
                  {(
                    [
                      ['testMode', 'מצב בדיקה', 'קבוצה אחת בלבד לכל פרסום, ואישור ידני חובה לפני הלחיצה הסופית. כבו אחרי שהבדיקה הראשונה עברה.'],
                      ['requireConfirmation', 'אישור לפני כל פרסום', 'התוכנה שבמחשב עוצרת לפני "פרסום", מצלמת מסך, ומחכה לאישור שלכם בלוח הבקרה.'],
                      ['debugMode', 'חלון דפדפן גלוי', 'Playwright רץ עם חלון פתוח כדי שתראו בדיוק מה קורה. כבו לריצה שקטה ברקע.'],
                    ] as const
                  ).map(([key, label, hint]) => (
                    <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-ink-700 px-3 py-2.5">
                      <div className="min-w-0">
                        <p className="font-bold text-mist-100">{label}</p>
                        <p className="text-xs leading-snug text-mist-500">{hint}</p>
                      </div>
                      <Toggle checked={browser[key]} onChange={(v) => setBrowser({ ...browser, [key]: v })} label={label} />
                    </div>
                  ))}
                </div>
              </Card>

              <Card title="קצב הקבוצות">
                <div className="grid gap-4 sm:grid-cols-3 [&>*]:min-w-0">
                  <Field label="עבודות דפדפן במקביל" hint="1 מומלץ — חלון אחד שעושה דבר אחד">
                    <input
                      type="number"
                      min={1}
                      max={3}
                      inputMode="numeric"
                      className={inputClass}
                      value={browser.concurrentJobs}
                      onChange={(e) => setBrowser({ ...browser, concurrentJobs: Math.min(3, Math.max(1, Number(e.target.value) || 1)) })}
                    />
                  </Field>
                  <Field label="מקסימום לסבב ביום">
                    <input
                      type="number"
                      min={1}
                      inputMode="numeric"
                      className={inputClass}
                      value={browser.maxPerCampaignPerDay}
                      onChange={(e) => setBrowser({ ...browser, maxPerCampaignPerDay: Math.max(1, Number(e.target.value) || 1) })}
                    />
                  </Field>
                  <Field label="מרווח נוסף בין קבוצות (דקות)" hint="מתווסף למרווח הכללי">
                    <input
                      type="number"
                      min={0}
                      inputMode="numeric"
                      className={inputClass}
                      value={browser.groupMinGapMinutes}
                      onChange={(e) => setBrowser({ ...browser, groupMinGapMinutes: Math.max(0, Number(e.target.value) || 0) })}
                    />
                  </Field>
                </div>
              </Card>

            </>
          )}

          {tab === 'business' && (
            <Card title="פרטי העסק" subtitle="ברירות מחדל שנכנסות לכל פוסט חדש">
              <div className="grid gap-4">
                <Field label="שם העסק">
                  <input className={inputClass} value={business.name} onChange={(e) => setBusiness({ ...business, name: e.target.value })} />
                </Field>
                <div className="grid gap-4 sm:grid-cols-2 [&>*]:min-w-0">
                  <Field label="טלפון לתצוגה">
                    <input className={inputClass} dir="ltr" inputMode="tel" value={business.phone} onChange={(e) => setBusiness({ ...business, phone: e.target.value })} />
                  </Field>
                  <Field label="WhatsApp (בינלאומי, בלי +)">
                    <input className={inputClass} dir="ltr" inputMode="numeric" value={business.whatsapp} onChange={(e) => setBusiness({ ...business, whatsapp: e.target.value })} />
                  </Field>
                </div>
                <Field label="ערים / אזורים" hint="מופרד בפסיקים">
                  <input className={inputClass} value={business.cities.join(', ')} onChange={(e) => setBusiness({ ...business, cities: splitList(e.target.value) })} />
                </Field>
                <Field label="שירותים" hint="מופרד בפסיקים">
                  <input className={inputClass} value={business.services.join(', ')} onChange={(e) => setBusiness({ ...business, services: splitList(e.target.value) })} />
                </Field>
              </div>
            </Card>
          )}

          {/*
            ─── ניהול — THE PANEL ONLY THE OWNER OF THE PRODUCT SEES ─────────

            "ותוסיף רק אצלי, לא אצל הלקוחות. בהגדרות פאנל אדמין שאני ידע כל
             רגע נתון מי מחובר באפליקציה ומאיזה משתמש."

            `isAdmin` comes from the server's own answer, not from anything
            this browser worked out, and the tab above does not exist without
            it. The second guard here is not belt-and-braces for security —
            the security is the allowlist in the server's environment — it is
            so a stale `tab` value can never render an empty panel.

            IT SHOWS PRESENCE AND IDENTITY AND NOTHING ELSE. No token, no
            cookie, no password, and not the login screenshot column: a panel
            that answers "who is connected" has no business carrying a picture
            of somebody's own screen.
          */}
          {tab === 'admin' && isAdmin && presence && (
            <>
              <Card
                title="מי מחובר עכשיו"
                subtitle={`${presence.workers.filter((w) => w.online).length} מחוברים מתוך ${presence.workers.length} מחשבים · מתרענן לבד כל 10 שניות`}
              >
                {presence.workers.length === 0 ? (
                  <Notice tone="info">אף מחשב לא נרשם עדיין. מחשב נכנס לרשימה הזו ברגע שהתוכנה עליו נפתחת פעם אחת.</Notice>
                ) : (
                  <div className="mt-1 space-y-2">
                    {presence.workers.map((w) => (
                      <div key={w.id} className="rounded-xl border border-ink-700 px-3 py-2.5">
                        <div className="flex items-center gap-2">
                          {/* The dot is the SAME rule the dashboard chip uses —
                              computed on the server so there is one definition
                              of "מחובר" in the product, not two. */}
                          <span
                            aria-hidden
                            className={`h-2.5 w-2.5 shrink-0 rounded-full ${w.online ? 'bg-success-400' : 'bg-ink-600'}`}
                          />
                          <span className="min-w-0 grow truncate font-bold text-mist-100">{w.name || w.host || '—'}</span>
                          <span className={`shrink-0 text-[11px] font-extrabold ${w.online ? 'text-success-400' : 'text-mist-500'}`}>
                            {w.online ? (w.busy ? 'מפרסם עכשיו' : 'מחובר') : 'מנותק'}
                          </span>
                        </div>
                        <dl className="mt-1.5 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] leading-4">
                          <dt className="text-mist-500">עסק</dt>
                          <dd className="min-w-0 truncate text-mist-300">{w.tenantName || '— לא משויך לעסק'}</dd>
                          <dt className="text-mist-500">משתמש פייסבוק</dt>
                          <dd className="min-w-0 truncate text-mist-300">
                            {w.fbUserName || (w.fbUserId ? <span dir="ltr">{w.fbUserId}</span> : '— לא ידוע')}
                          </dd>
                          <dt className="text-mist-500">מחשב</dt>
                          <dd className="min-w-0 truncate text-mist-300" dir="ltr">{w.host || '—'}</dd>
                          <dt className="text-mist-500">גרסה</dt>
                          <dd className="min-w-0 truncate text-mist-300" dir="ltr">{w.version || '—'}</dd>
                          <dt className="text-mist-500">אות חיים אחרון</dt>
                          <dd className="min-w-0 text-mist-300">{w.last_seen_at ? <Stamp iso={w.last_seen_at} /> : '— מעולם'}</dd>
                        </dl>
                        {/* What the machine itself said is wrong, in its own
                            words, rather than a status word standing in for it. */}
                        {w.attention_message && (
                          <p className="mt-1.5 text-[11px] font-bold leading-4 text-warning-400">{w.attention_message}</p>
                        )}
                      </div>
                    ))}
                  </div>
                )}
                {presence.truncated.workers && (
                  <div className="mt-2.5">
                    <Notice tone="warn">הרשימה נקטעה — יש יותר מחשבים ממה שמוצג כאן.</Notice>
                  </div>
                )}
              </Card>

              <Card title="משתמשים" subtitle="מי יכול להיכנס לדשבורד, ומתי נכנס לאחרונה">
                {presence.users.length === 0 ? (
                  <Notice tone="info">אין עדיין משתמשים רשומים.</Notice>
                ) : (
                  <div className="mt-1 space-y-2">
                    {presence.users.map((u) => (
                      <div key={u.id} className="rounded-xl border border-ink-700 px-3 py-2.5">
                        <p className="truncate font-bold text-mist-100" dir="ltr">{u.email || u.id}</p>
                        <dl className="mt-1 grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-[11px] leading-4">
                          <dt className="text-mist-500">עסקים</dt>
                          <dd className="min-w-0 truncate text-mist-300">{u.tenants.length ? u.tenants.join(' · ') : '— לא משויך'}</dd>
                          <dt className="text-mist-500">כניסה אחרונה</dt>
                          <dd className="min-w-0 text-mist-300">{u.lastSignInAt ? <Stamp iso={u.lastSignInAt} /> : '— מעולם לא נכנס'}</dd>
                        </dl>
                      </div>
                    ))}
                  </div>
                )}
                {presence.truncated.users && (
                  <div className="mt-2.5">
                    <Notice tone="warn">הרשימה נקטעה — יש יותר משתמשים ממה שמוצג כאן.</Notice>
                  </div>
                )}
                {/*
                  SAID OUT LOUD, because the two lists answer two different
                  questions and the difference matters when something is wrong.
                */}
                <p className="mt-2.5 text-[11px] leading-4 text-mist-500">
                  ״כניסה אחרונה״ היא כניסה לדשבורד באתר — לא הפעלה של התוכנה במחשב. מחשב יכול לפרסם שבועות בלי שאף אחד ייכנס לדשבורד,
                  ולהפך.
                </p>
              </Card>
            </>
          )}

          <Button size="lg" className="w-full" busy={busy} onClick={save}>
            שמור הגדרות
          </Button>

          {/* Which build the phone is actually running. If this does not change
              after a deploy, the browser is serving a cached copy. */}
          <p className="text-center text-[11px] text-mist-500">
            גרסת המערכת: <span dir="ltr" className="font-mono">{process.env.NEXT_PUBLIC_BUILD_STAMP || '—'}</span>
          </p>
        </div>
      )}
    </SocialShell>
  );
}

function splitList(value: string): string[] {
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}
