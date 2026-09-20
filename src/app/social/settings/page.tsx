'use client';

import { useEffect, useState } from 'react';
import { Stamp } from '@/components/social/DateTime';
import { SocialShell } from '@/components/social/SocialShell';
import { Button, Card, Field, Loading, Notice, SegmentedControl, Toggle, inputClass, useToast } from '@/components/social/ui';
import { getBrowserSettings, getBusiness, getControl, getLimits, listWorkers, saveSetting, setPaused } from '@/lib/social/client';
import { WORKER_VERSION } from '@/lib/social/worker-version';
import { DEFAULT_BROWSER, DEFAULT_BUSINESS, DEFAULT_LIMITS, type BrowserSettings, type BusinessSettings, type ControlSettings, type LimitsSettings } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';

type Tab = 'limits' | 'browser' | 'business';

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

  useEffect(() => {
    Promise.all([getLimits(), getControl(), getBusiness(), getBrowserSettings(), listWorkers().catch(() => [])])
      .then(([l, c, b, br, workers]) => {
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
  async function save() {
    setBusy(true);
    try {
      const [curLimits, curBrowser, curBusiness] = await Promise.all([getLimits(), getBrowserSettings(), getBusiness()]);
      await Promise.all([
        saveSetting('limits', { ...curLimits, ...limits }),
        saveSetting('business', { ...curBusiness, ...business }),
        saveSetting('browser', { ...curBrowser, ...browser }),
      ]);
      toast('ההגדרות נשמרו.');
    } catch (err) {
      toast(friendlyMessage(err, 'השמירה נכשלה.'), 'error');
    } finally {
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
      headerAction={
        <Button busy={busy} onClick={save}>
          שמור
        </Button>
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
                        <code dir="ltr">start-worker.cmd</code> כדי לעדכן אותה.
                      </Notice>
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
