'use client';

import { useEffect, useState } from 'react';
import { SocialShell } from '@/components/social/SocialShell';
import { Button, Card, Field, Loading, Notice, Toggle, inputClass } from '@/components/social/ui';
import { getBrowserSettings, getBusiness, getControl, getLimits, saveSetting } from '@/lib/social/client';
import { DEFAULT_BROWSER, DEFAULT_BUSINESS, DEFAULT_LIMITS, type BrowserSettings, type BusinessSettings, type ControlSettings, type LimitsSettings } from '@/lib/social/types';

export default function SettingsPage() {
  const [limits, setLimits] = useState<LimitsSettings>(DEFAULT_LIMITS);
  const [control, setControl] = useState<ControlSettings>({ paused: false, rateLimitedUntil: null });
  const [business, setBusiness] = useState<BusinessSettings>(DEFAULT_BUSINESS);
  const [browser, setBrowser] = useState<BrowserSettings>(DEFAULT_BROWSER);
  const [loaded, setLoaded] = useState(false);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ tone: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    Promise.all([getLimits(), getControl(), getBusiness(), getBrowserSettings()])
      .then(([l, c, b, br]) => {
        setLimits(l);
        setControl(c);
        setBusiness(b);
        setBrowser(br);
        setLoaded(true);
      })
      .catch((err) => setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'טעינה נכשלה.' }));
  }, []);

  async function save() {
    setBusy(true);
    try {
      await Promise.all([saveSetting('limits', limits), saveSetting('control', control), saveSetting('business', business), saveSetting('browser', browser)]);
      setMessage({ tone: 'success', text: 'ההגדרות נשמרו.' });
    } catch (err) {
      setMessage({ tone: 'error', text: err instanceof Error ? err.message : 'השמירה נכשלה.' });
    } finally {
      setBusy(false);
    }
  }

  const num = (key: keyof LimitsSettings) => (e: React.ChangeEvent<HTMLInputElement>) => setLimits({ ...limits, [key]: Math.max(0, Number(e.target.value) || 0) });

  return (
    <SocialShell title="הגדרות" headerAction={<Button busy={busy} onClick={save} className="!bg-white !text-blue-700">שמור</Button>}>
      {message && <div className="mb-4"><Notice tone={message.tone}>{message.text}</Notice></div>}
      {!loaded && !message && <Loading />}
      {loaded && (
        <div className="grid gap-5 lg:grid-cols-2">
          <Card title="מניעת ספאם">
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="מקסימום פרסומים ביום (כל היעדים)">
                <input type="number" min={0} className={inputClass} value={limits.maxPerDay} onChange={num('maxPerDay')} />
              </Field>
              <Field label="מקסימום פרסומים ביום לכל יעד">
                <input type="number" min={0} className={inputClass} value={limits.maxPerTargetPerDay} onChange={num('maxPerTargetPerDay')} />
              </Field>
              <Field label="מרווח מינימלי בין פרסומים (דקות)" hint="פרסום שמגיע מוקדם מדי נדחה אוטומטית, לא נמחק">
                <input type="number" min={0} className={inputClass} value={limits.minGapMinutes} onChange={num('minGapMinutes')} />
              </Field>
              <Field label="מניעת כפילות (ימים)" hint="אותו טקסט+מדיה לאותו יעד לא יפורסם שוב בטווח הזה">
                <input type="number" min={0} className={inputClass} value={limits.dedupeDays} onChange={num('dedupeDays')} />
              </Field>
            </div>
            <div className="mt-4 flex items-center justify-between rounded-xl border border-ink-600 px-3 py-3">
              <div>
                <p className="font-bold text-mist-100">השהיית כל התורים</p>
                <p className="text-xs text-mist-500">כשמופעל, שום פרסום לא יוצא — כולל "פרסם עכשיו".</p>
              </div>
              <Toggle checked={control.paused} onChange={(v) => setControl({ ...control, paused: v })} label="השהיה" />
            </div>
            {control.rateLimitedUntil && (
              <p className="mt-2 text-xs text-amber-700">
                הגבלת קצב מ-Meta פעילה עד {control.rateLimitedUntil}.{' '}
                <button type="button" className="font-bold underline" onClick={() => setControl({ ...control, rateLimitedUntil: null })}>
                  נקה
                </button>
              </p>
            )}
          </Card>

          <Card title="Browser Automation — קבוצות פייסבוק">
            <p className="mb-3 text-xs text-mist-500">
              קבוצות מתפרסמות דרך ה-worker המקומי (Chrome על המחשב שלכם). ברירות המחדל שמרניות בכוונה; אין כאן שום מנגנון לעקיפת ההגנות של Facebook.
            </p>
            <div className="space-y-2.5">
              {(
                [
                  ['testMode', 'TEST MODE', 'קבוצה אחת בלבד לכל פרסום, ואישור ידני חובה לפני הלחיצה הסופית. כבו אחרי שהבדיקה הראשונה עברה.'],
                  ['requireConfirmation', 'Require confirmation before final publish', 'ה-worker עוצר לפני "פרסום", מצלם את המסך, ומחכה לאישור שלכם בלוח הבקרה.'],
                  ['debugMode', 'Debug Mode (חלון גלוי)', 'Playwright רץ headed כדי שתראו בדיוק מה הוא עושה. כבו לריצה שקטה ברקע.'],
                ] as const
              ).map(([key, label, hint]) => (
                <div key={key} className="flex items-center justify-between gap-3 rounded-xl border border-ink-600 px-3 py-2.5">
                  <div>
                    <p className="font-bold text-mist-100">{label}</p>
                    <p className="text-xs text-mist-500">{hint}</p>
                  </div>
                  <Toggle checked={browser[key]} onChange={(v) => setBrowser({ ...browser, [key]: v })} label={label} />
                </div>
              ))}
            </div>
            <div className="mt-4 grid gap-4 sm:grid-cols-3">
              <Field label="עבודות דפדפן במקביל" hint="1 מומלץ">
                <input type="number" min={1} max={3} className={inputClass} value={browser.concurrentJobs} onChange={(e) => setBrowser({ ...browser, concurrentJobs: Math.min(3, Math.max(1, Number(e.target.value) || 1)) })} />
              </Field>
              <Field label="מקסימום פרסומים לקמפיין ביום">
                <input type="number" min={1} className={inputClass} value={browser.maxPerCampaignPerDay} onChange={(e) => setBrowser({ ...browser, maxPerCampaignPerDay: Math.max(1, Number(e.target.value) || 1) })} />
              </Field>
              <Field label="מרווח נוסף בין קבוצות (דקות)" hint="מתווסף למרווח הכללי">
                <input type="number" min={0} className={inputClass} value={browser.groupMinGapMinutes} onChange={(e) => setBrowser({ ...browser, groupMinGapMinutes: Math.max(0, Number(e.target.value) || 0) })} />
              </Field>
            </div>
          </Card>

          <Card title="פרטי העסק (ברירות מחדל לפוסטים)">
            <div className="grid gap-4">
              <Field label="שם העסק">
                <input className={inputClass} value={business.name} onChange={(e) => setBusiness({ ...business, name: e.target.value })} />
              </Field>
              <div className="grid gap-4 sm:grid-cols-2">
                <Field label="טלפון לתצוגה">
                  <input className={inputClass} dir="ltr" value={business.phone} onChange={(e) => setBusiness({ ...business, phone: e.target.value })} />
                </Field>
                <Field label="WhatsApp (בינלאומי, בלי +)">
                  <input className={inputClass} dir="ltr" value={business.whatsapp} onChange={(e) => setBusiness({ ...business, whatsapp: e.target.value })} />
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
