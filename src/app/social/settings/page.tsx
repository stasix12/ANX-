'use client';

import { useEffect, useState } from 'react';
import { SocialShell } from '@/components/social/SocialShell';
import { Button, Card, Field, Loading, Notice, SegmentedControl, Toggle, inputClass, useToast } from '@/components/social/ui';
import { getBrowserSettings, getBusiness, getControl, getLimits, saveSetting } from '@/lib/social/client';
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

  useEffect(() => {
    Promise.all([getLimits(), getControl(), getBusiness(), getBrowserSettings()])
      .then(([l, c, b, br]) => {
        setLimits(l);
        setControl(c);
        setBusiness(b);
        setBrowser(br);
        setLoaded(true);
      })
      .catch((err) => setError(friendlyMessage(err, 'טעינה נכשלה.')));
  }, []);

  async function save() {
    setBusy(true);
    try {
      await Promise.all([
        saveSetting('limits', limits),
        saveSetting('control', control),
        saveSetting('business', business),
        saveSetting('browser', browser),
      ]);
      toast('ההגדרות נשמרו.');
    } catch (err) {
      toast(friendlyMessage(err, 'השמירה נכשלה.'), 'error');
    } finally {
      setBusy(false);
    }
  }

  const num = (key: keyof LimitsSettings) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setLimits({ ...limits, [key]: Math.max(0, Number(e.target.value) || 0) });

  return (
    <SocialShell
      title="הגדרות"
      lede="קצב, מגבלות ופרטי העסק"
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
              </Card>

              <Card title="עצירת חירום">
                <div className="flex items-center justify-between gap-3 rounded-xl border border-ink-600 px-3 py-3">
                  <div className="min-w-0">
                    <p className="font-bold text-mist-100">השהיית כל הפרסומים</p>
                    <p className="text-xs text-mist-500">כשמופעל, שום דבר לא יוצא — כולל "פרסם עכשיו". התור נשמר.</p>
                  </div>
                  <Toggle checked={control.paused} onChange={(v) => setControl({ ...control, paused: v })} label="השהיה" />
                </div>
                {control.rateLimitedUntil && (
                  <p className="mt-2 text-xs text-amber-700">
                    Meta ביקשה להאט — הפרסום מושהה עד {control.rateLimitedUntil}.{' '}
                    <button type="button" className="min-h-9 font-bold underline" onClick={() => setControl({ ...control, rateLimitedUntil: null })}>
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
                  חסימה — כשפייסבוק מבקשת אדם, ה-worker עוצר וממתין לכם.
                </Notice>
              </Card>

              <Card title="בטיחות הריצה">
                <div className="space-y-2.5">
                  {(
                    [
                      ['testMode', 'מצב בדיקה', 'קבוצה אחת בלבד לכל פרסום, ואישור ידני חובה לפני הלחיצה הסופית. כבו אחרי שהבדיקה הראשונה עברה.'],
                      ['requireConfirmation', 'אישור לפני כל פרסום', 'ה-worker עוצר לפני "פרסום", מצלם מסך, ומחכה לאישור שלכם בלוח הבקרה.'],
                      ['debugMode', 'חלון דפדפן גלוי', 'Playwright רץ עם חלון פתוח כדי שתראו בדיוק מה קורה. כבו לריצה שקטה ברקע.'],
                    ] as const
                  ).map(([key, label, hint]) => (
                    <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-ink-600 px-3 py-2.5">
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
                  <Field label="מקסימום לקמפיין ביום">
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
