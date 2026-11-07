'use client';

import { useEffect, useRef, useState } from 'react';
import { Stamp } from '@/components/social/DateTime';
import { ScreenProbe } from '@/components/social/ScreenProbe';
import { SocialShell } from '@/components/social/SocialShell';
import { Button, Card, Field, Loading, Notice, SegmentedControl, inputClass, useToast } from '@/components/social/ui';
import { getBrowserSettings, getControl, getLimits, loadAdminPresence, saveSetting } from '@/lib/social/client';
import { DEFAULT_BROWSER, DEFAULT_LIMITS, type AdminPresence, type BrowserSettings, type ControlSettings, type LimitsSettings } from '@/lib/social/types';
import { accountGapLabel, accountGapSeconds } from '@/lib/social/rules';
import { friendlyMessage } from '@/lib/social/errors';

type Tab = 'limits' | 'admin';

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
  const [browser, setBrowser] = useState<BrowserSettings>(DEFAULT_BROWSER);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();

  /*
   * NO workerVersion STATE ANY MORE, and that is the switch's last loose end.
   *
   * It existed for one sentence: the repeat-to-same-group switch is enforced
   * on the owner's OWN machine, so an older copy of the worker ignores the key
   * and goes on skipping, and the screen had to say the switch had not taken
   * effect yet rather than look as though it had. With the switch deleted
   * there is nothing on this screen whose effect waits on the PC — and the
   * warning itself did not go missing: BrowserStatusCard says
   * "התוכנה במחשב מריצה גרסה ישנה" with both version numbers, from the
   * header panel, on every screen in the product.
   *
   * So the listWorkers() read went with it. A settings load no longer asks
   * the database a question whose only answer fed a paragraph that is gone.
   */

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
      getBrowserSettings(),
      /* Swallowed on purpose: a customer, or a deployment with no allowlist
         configured, must not see "טעינה נכשלה" over a panel they were never
         going to be shown. A real failure for the OWNER shows as the panel
         staying away, which is the same thing the gate does — so the tab
         simply does not appear and nothing on this screen is wrong. */
      loadAdminPresence().catch(() => null),
    ])
      .then(([l, c, br, pres]) => {
        setPresence(pres);
        setLimits(l);
        setControl(c);
        setBrowser(br);
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
   * SO IT NO LONGER SPREADS A FORM OBJECT. It re-reads the row and writes
   * back the FOUR FIELDS THIS SCREEN STILL HAS A BOX FOR, by name.
   *
   * That is not tidiness, it is the bug above. `...limits` was safe only while
   * every key in it had an input, because then the stale copy WAS the owner's
   * decision. Once the six controls were deleted (07.11.2026) two of these
   * three rows had no live field left at all, and spreading a mount-time
   * snapshot over a fresh re-read is exactly the ten-minutes-open defect this
   * docblock was written to prevent — re-created, silently, by removing the
   * inputs. It was caught by review before anyone met it.
   *
   * `browser` and `business` are therefore NOT WRITTEN FROM HERE AT ALL. No
   * box on this screen edits either one. `browser` is still READ, for the
   * sub-minute notice below; nothing reads `business`.
   *
   * `control` is not here either: its one remaining write (the Meta hold)
   * happens on the tap, since a stop that waits for a second tap on שמור is
   * not a stop.
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
   * re-reads the limits row, puts this screen's four numbers onto it and
   * writes it back. Two of those interleaving can land a write built on a row
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
      const curLimits = await getLimits();
      /*
       * ─── THE MINUTE FIELDS CARRY THEIR SECONDS WITH THEM ────────────────
       *
       * The gap box on this screen is whole minutes (there were two until the
       * group-pacing card was deleted; this is the account one), and the pair it
       * writes also has a `*Seconds` half that accountGapSeconds() PREFERS when
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
      /*
       * BY NAME, AND ONLY THESE FOUR. Each one is a box a few hundred pixels
       * above; every other key in the row — blockRepeatToSameTarget and
       * repeatFloorHours among them — comes through from `curLimits`
       * untouched, because this screen has nothing to say about them.
       */
      await saveSetting('limits', {
        ...curLimits,
        maxPerDay: limits.maxPerDay,
        maxPerTargetPerDay: limits.maxPerTargetPerDay,
        minGapMinutes: limits.minGapMinutes,
        dedupeDays: limits.dedupeDays,
        minGapSeconds: keepOrDerive(limits.minGapMinutes, curLimits.minGapSeconds),
      });
      toast('ההגדרות נשמרו.');
    } catch (err) {
      toast(friendlyMessage(err, 'השמירה נכשלה.'), 'error');
    } finally {
      saving.current = false;
      setBusy(false);
    }
  }

  /**
   * THE ONE WRITE TO `control` LEFT ON THIS SCREEN, and it is not a setting.
   *
   * The emergency stop that used to live beside it is gone with the other five
   * controls — it wrote the same control.paused as the dashboard's own
   * "השהה פרסום / הפעל פרסום" button. The dashboard is now the only
   * SCREEN that can pause, through four calls in that one file: page.tsx:1792
   * and :1793 are the button itself, :741 is the stop that "בטל הכל" does on
   * the way to discarding, and :1973 is the resume on the stopped-run card.
   *
   * This one stays because nothing else can do it: it clears a hold FACEBOOK
   * put on the account, which the system can enter on its own and which the
   * dashboard reports without offering a way out. It re-reads the row and
   * merges rather than writing a whole object, so a `paused` the header set a
   * second ago is not overwritten by a stale copy of it.
   */
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
       * still DEFAULT_LIMITS at that point, so the tap wrote the factory
       * defaults over the owner's own numbers and the toast said
       * "ההגדרות נשמרו". It was worse when this was written: the save also
       * carried `business` and `browser`, so one tap also wiped the phone and
       * the WhatsApp link out of every future post and put testMode back to
       * true. Those two rows are no longer written from this screen at all,
       * which narrows the blast radius — it does not remove it, and this gate
       * is still the thing that stops it.
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
          {/*
            ONE PAGE FOR A CUSTOMER, TWO FOR AN ADMIN.
            *
            * "תמחק את שתי העמודים האלה זה מבלבל את הלקוחות" — the two tabs a
            * customer had no use for are gone: "פרסום בקבוצות", whose page was
            * mostly a notice about Meta's terms and about CAPTCHA, and
            * "פרטי העסק".
            *
            * The connection was NOT deleted with its tab. It is the same
            * BrowserStatusCard, and it already drops from the computer icon in
            * the header on every screen — so "המשך סבב", "התחבר לפייסבוק" and
            * "בדוק שוב" are one tap from anywhere, which is nearer than they
            * were. The two cards on that tab that did real work — the safety
            * switches and the group pacing — were moved up into
            * "קצב ומגבלות" when that tab went, and then DELETED from there
            * on 07.11.2026 at the owner's explicit request. The values they
            * edited are still read by the engine; the long note further down
            * this file is the record. Nothing on this screen edits them now.
            *
            * A segmented control with one option is a decoration, so a
            * customer never sees one.
          */}
          {isAdmin && (
            <SegmentedControl
              label="חלקי ההגדרות"
              value={tab}
              onChange={setTab}
              options={[
                { value: 'limits', label: 'קצב ומגבלות' },
                { value: 'admin' as const, label: 'ניהול' },
              ]}
            />
          )}

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
                  floor IS a whole number of minutes sees nothing new.

                  AND IT NO LONGER OFFERS A REMEDY, because the remedy was a
                  box that has been deleted. It used to end "שינוי של אחת
                  התיבות למעלה ושמירה יחזירו את המרווח לדקות שלמות", which was true
                  while "מרווח נוסף בין קבוצות" was on this screen AND the save
                  wrote the browser row. Both are gone: the sub-minute half
                  lives in browser.groupMinGapSeconds, and this screen does not
                  write that row any more. An instruction that cannot work is
                  worse than none, so the notice now says only what is true —
                  the real number, where it is changed, and that saving here
                  will not touch it.
                */}
                {accountGapSeconds(limits, browser, true) !== (Math.max(0, Math.round(limits.minGapMinutes)) + Math.max(0, Math.round(browser.groupMinGapMinutes))) * 60 && (
                  <Notice tone="info">
                    המרווח שהמערכת באמת שומרת בין שני פרסומים לקבוצה הוא{' '}
                    <strong>{accountGapLabel(accountGapSeconds(limits, browser, true))}</strong> — פחות ממה שהתיבה למעלה יכולה להציג, כי היא
                    מציגה דקות שלמות. זה נקבע כשבחרתם הפרש בשניות בתזמון של קמפיין, ושם גם משנים את זה. שמירה מהמסך הזה לא תיגע
                    במספר הזה.
                  </Notice>
                )}

                {/*
                  ───── WHAT WAS HERE, AND WHY IT IS NOT ─────────────────────

                  "תמחק גם את האופציות האלה, סתם מיותר ומבלבל לקוחות" — 07.11.2026, asked
                  of six controls and confirmed for all six after the trade was
                  put to him in writing.

                  THE CONTROLS ARE GONE. THE BEHAVIOUR IS NOT. Every value they
                  edited is a stored field that the engine goes on reading:

                    limits.blockRepeatToSameTarget   false on his account
                    limits.repeatFloorHours          6, which he set himself
                    browser.concurrentJobs           1
                    browser.maxPerCampaignPerDay     1000
                    browser.groupMinGapMinutes       0
                    control.paused                   false

                  HOW THAT IS GUARANTEED CHANGED WITHIN THE HOUR, and the
                  reason is worth recording. The first version of this deletion
                  left the save writing `browser` and `limits` WHOLE, and said
                  so here — which preserved the stored numbers only while the
                  object it spread was the owner's own typed decision. With no
                  inputs left, that object is a mount-time snapshot, and
                  spreading it over the fresh re-read reverted anything written
                  into those rows while the screen sat open: a campaign panel
                  set to "30 שניות" became 20 minutes again on the next שמור.
                  Review caught it before anyone met it. The save now writes
                  the four fields that still have boxes, by name, and does not
                  write the `browser` row at all — so the guarantee is
                  structural rather than a promise in a comment. Nothing about
                  publishing changed on the day this was removed.

                  THREE OF THEM GOVERNED NOTHING AT HIS NUMBERS and were the
                  clutter he meant: one browser window is what the hint itself
                  recommended, a 1,000-a-day ceiling over a 231-a-day round
                  never binds, and an extra gap of zero adds zero.

                  AT HIS NUMBERS — and that qualifier is the whole of it, so
                  it is written down rather than left as an impression. Read
                  live off the eight `browser` rows: his own is 1 / 1000 / 0,
                  one other account is 3 / 1000 / 1, and the remaining SIX are
                  1 / 8 / 20 — which is DEFAULT_BROWSER exactly, so nobody
                  chose them, a save merged them. For those six the ceiling is
                  real: rules.ts defers everything past the eighth publication
                  of a campaign in a day with "הסבב מילא את המכסה היומית
                  שלו (8)" (rules.ts:561-567).

                  AND THE 20 MINUTES ARE ACCOUNT-WIDE, which an earlier draft
                  of this note got wrong by calling them a gap "between two
                  publications to one group". They are not per group:
                  accountGapSeconds() adds the surcharge to the account's own
                  minimum gap (rules.ts:130-143), and the gate that consumes
                  it reads THE SINGLE MOST RECENT PUBLISHED ROW with no target
                  filter at all (rules.ts:691-717), passing withGroupExtra
                  only to decide whether this target is a group. So for those
                  six accounts the real floor is 45 + 20 = 65 minutes between
                  ANY two group publications — about 22 a day, not 8 ×
                  campaigns. That is a much tighter cap than the ceiling
                  above, and it is the number a stalled round should be
                  diagnosed against.

                  THEY KEEP THOSE NUMBERS — that is what the whole-row save
                  guarantees and what the test pins. What they no longer have
                  is a screen to CHANGE them, which for a customer who one day
                  wants more than eight a day means asking rather than
                  tapping. That is the cost of the deletion, it is his to
                  accept, and it is stated here so the next person does not
                  have to rediscover it from a customer's stalled round.

                  THE OTHER THREE ARE REAL, and they are not all the same
                  kind of real:

                    • עצירת חירום was a DUPLICATE. The dashboard's own
                      "השהה פרסום / הפעל פרסום" button writes the same
                      control.paused (page.tsx:1792-1798), on the screen he
                      opens first. The capability did not move, the second
                      copy did.

                      AN EARLIER DRAFT OF THIS LINE CALLED those few lines
                      "the ONLY writer of control.paused left in the product".
                      That is false and is corrected here: setPaused() is also
                      called at page.tsx:741 (the "בטל הכל" path, which stops
                      as well as discards) and at page.tsx:1973 (resume on the
                      stopped-run card). What IS true, and is the part worth
                      knowing, is that all four calls live in that one file:
                      the dashboard is the only screen in the product that can
                      pause. PublishingToggle.tsx calls setPaused too and is
                      mounted nowhere, so it cannot.
                    • the two duplicate guards are now editable NOWHERE. An
                      earlier draft of this comment claimed they moved to the
                      campaign's own panel; that was false and is corrected
                      here. The panel toggles whether a campaign repeats
                      (CampaignSchedulePanel:838, `{ ...repeat, enabled }`)
                      and PRINTS the window through repeatWindowSentence — it
                      has never had an input for either of these two values.

                  WHICH IS SAFE FOR EVERY ACCOUNT THAT EXISTS, and the
                  database is how that is known rather than assumed. All eight
                  saved `limits` rows — every tenant on the project, his own
                  included — already read blockRepeatToSameTarget: false, and
                  seven of the eight repeatFloorHours: 0 (his own says 6). So
                  for every customer alive today the switch was already off
                  and the floor already open: removing the control removed a
                  control, not a protection.

                  THE ONE THING IT LEAVES OPEN, recorded here rather than
                  quietly fixed: DEFAULT_LIMITS still ships
                  blockRepeatToSameTarget: true (types.ts), so an account with
                  NO saved row — a brand-new customer — gets the rule ON with
                  no switch to turn it off. That is the state that produced
                  "לא הסרת את המגבלה של ה-20 שעות! תמחק את זה כבר." Flipping that
                  default to false would change what PUBLISHES, which this
                  change deliberately does not, so it is his call and not
                  this commit's.

                  WHAT IS DELIBERATELY KEPT is the Meta hold below. It is not
                  one of the six, and it is the only manual way out: the
                  dashboard reports the hold but offers no clear. Removing it
                  would have left a state the system can enter on its own with
                  no way back.

                  AND IT NOW CHECKS THAT THE HOLD IS STILL RUNNING, which this
                  note claimed before the code did. It rendered on bare
                  truthiness, and `rateLimitedUntil` OUTLIVES the hold: the
                  server clears it lazily, and the clear sits AFTER the paused
                  check (server/worker.ts — `if (control.paused) return` comes
                  first), so an owner who pauses before an expiry keeps the
                  stale instant in the row for as long as they stay paused.
                  This screen then printed "הפרסום מושהה עד 14:00" at six in
                  the evening — a hold Facebook was not applying — while the
                  dashboard, four lines of the same product, said nothing,
                  because page.tsx:1751 has compared against the clock all
                  along. Two screens, one row, opposite answers. Same guard
                  here now.
                */}
                {control.rateLimitedUntil && new Date(control.rateLimitedUntil) > new Date() && (
                  <p className="mt-4 text-xs text-warning-400">
                    Meta ביקשה להאט — הפרסום מושהה עד <Stamp iso={control.rateLimitedUntil} />.{' '}
                    <button type="button" className="min-h-11 px-1 font-bold underline" onClick={clearRateLimit}>
                      נקה
                    </button>
                  </p>
                )}
              </Card>

            </>
          )}

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
                          <span dir="auto" className="min-w-0 grow truncate font-bold text-mist-100">{w.name || w.host || '—'}</span>
                          <span className={`shrink-0 text-[11px] font-extrabold ${w.online ? 'text-success-400' : 'text-mist-500'}`}>
                            {w.online ? (w.busy ? 'מפרסם עכשיו' : 'מחובר') : 'מנותק'}
                          </span>
                        </div>
                        <dl className="mt-1.5 grid grid-cols-[auto_1fr] [&>*]:min-w-0 gap-x-2 gap-y-0.5 text-[11px] leading-4">
                          <dt className="text-mist-500">עסק</dt>
                          <dd dir="auto" className="min-w-0 truncate text-mist-300">{w.tenantName || '— לא משויך לעסק'}</dd>
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
                        <dl className="mt-1 grid grid-cols-[auto_1fr] [&>*]:min-w-0 gap-x-2 gap-y-0.5 text-[11px] leading-4">
                          <dt className="text-mist-500">עסקים</dt>
                          <dd dir="auto" className="min-w-0 truncate text-mist-300">{u.tenants.length ? u.tenants.join(' · ') : '— לא משויך'}</dd>
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

              {/*
                WHAT THE DEVICE GIVES THE APP. Admin only, like the two cards
                above it: it answers a question no amount of reading this
                repository can answer — whether a strip of empty screen is
                inside our layout viewport (ours to use) or outside it (the
                browser's, and unreachable from CSS). See ScreenProbe.
              */}
              <ScreenProbe />
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

