'use client';

import { useCallback, useEffect, useState } from 'react';
import { SpinnerIcon } from '@/components/icons';
import { fetchAdSpend, formatSpend, type AdSpend } from '@/lib/crm/facebookAds';
import { todayISO, type Lead } from '@/lib/crm/leads';
import { clearFbAdsConfig, getFbAdsConfig, saveFbAdsConfig, type FbAdsConfig } from '@/lib/crm/settings';

const inputClass =
  'w-full rounded-xl border border-ink-600 bg-ink-850 px-4 py-3 text-base outline-none transition-colors focus:border-brand-500';

function SpendTile({ label, value, emoji }: { label: string; value: string; emoji: string }) {
  // Stacked and centered — three of these share one row on a phone.
  return (
    <div className="rounded-card border border-ink-700 surface p-3 text-center">
      <p aria-hidden className="text-lg leading-none">
        {emoji}
      </p>
      <p className="mt-1.5 text-lg font-extrabold tabular-nums text-blue-700">{value}</p>
      <p className="mt-0.5 text-xs font-semibold text-mist-500">{label}</p>
    </div>
  );
}

function SetupForm({
  initial,
  onSaved,
  onCancel,
}: {
  initial: FbAdsConfig | null;
  onSaved: (config: FbAdsConfig) => void;
  onCancel?: () => void;
}) {
  const [accountId, setAccountId] = useState(initial?.accountId ?? '');
  const [token, setToken] = useState(initial?.accessToken ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    const config: FbAdsConfig = {
      accountId: accountId.replace(/^act_/, '').trim(),
      accessToken: token.trim(),
    };
    if (!config.accountId || !config.accessToken) {
      setError('חסר מזהה חשבון או טוקן.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveFbAdsConfig(config);
      onSaved(config);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-3 rounded-card border border-ink-700 surface p-4">
      <p className="text-sm font-bold">חיבור ל-Ads Manager של פייסבוק</p>
      <div>
        <label htmlFor="fb-account" className="mb-1 block text-sm font-semibold text-mist-300">
          מזהה חשבון מודעות (Account ID)
        </label>
        <input
          id="fb-account"
          type="text"
          inputMode="numeric"
          placeholder="למשל 1234567890"
          value={accountId}
          onChange={(e) => setAccountId(e.target.value)}
          className={inputClass}
          dir="ltr"
        />
      </div>
      <div>
        <label htmlFor="fb-token" className="mb-1 block text-sm font-semibold text-mist-300">
          Access Token (עם הרשאת ads_read)
        </label>
        <input
          id="fb-token"
          type="password"
          placeholder="EAAB..."
          value={token}
          onChange={(e) => setToken(e.target.value)}
          className={inputClass}
          dir="ltr"
        />
      </div>

      {error ? (
        <p role="alert" className="rounded-xl bg-red-600/10 px-3 py-2 text-sm font-semibold text-red-600">
          {error}
        </p>
      ) : null}

      <div className="flex gap-2">
        <button
          type="submit"
          disabled={saving}
          className="flex flex-1 items-center justify-center gap-2 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-400 disabled:opacity-60"
        >
          {saving ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : null}
          שמירה וחיבור
        </button>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            className="rounded-full border border-ink-600 bg-ink-850 px-5 py-2.5 text-sm font-bold text-mist-300"
          >
            ביטול
          </button>
        ) : null}
      </div>

      <details className="text-sm text-mist-300">
        <summary className="cursor-pointer font-bold">איך משיגים מזהה וטוקן? (מדריך קצר)</summary>
        <ol className="mt-2 list-decimal space-y-1.5 ps-5">
          <li>
            את <b>מזהה החשבון</b> מוצאים ב-Ads Manager: בבורר החשבונות למעלה, או בכתובת הדפדפן אחרי{' '}
            <span dir="ltr">act=</span>.
          </li>
          <li>
            היכנס ל-<span dir="ltr">developers.facebook.com</span> וצור אפליקציה (סוג Business) אם אין לך.
          </li>
          <li>
            פתח את <b>Graph API Explorer</b> (בתפריט Tools), בחר את האפליקציה, לחץ{' '}
            <b>Add a Permission</b> והוסף <span dir="ltr">ads_read</span>, ואז <b>Generate Access Token</b>.
          </li>
          <li>העתק את הטוקן לכאן. טוקן רגיל תקף כ-60 יום; לטוקן קבוע צור System User ב-Business Settings.</li>
        </ol>
      </details>
    </form>
  );
}

/**
 * Automatic analysis of the ad numbers against the CRM's own data — computed
 * fresh on every visit, in plain Hebrew, most important finding first.
 */
function AdInsights({ spend, leads }: { spend: AdSpend; leads: Lead[] }) {
  const today = todayISO();
  const month = today.slice(0, 7);
  const monthCount = Number(today.slice(5, 7));
  const dayOfMonth = Number(today.slice(8, 10));

  const completedMonth = leads.filter((l) => l.status === 'completed' && l.jobDate?.startsWith(month));
  const monthRevenue = completedMonth.reduce((sum, l) => sum + (l.price ?? 0), 0);
  const allCompleted = leads.filter((l) => l.status === 'completed');
  const avgJob = allCompleted.length
    ? allCompleted.reduce((sum, l) => sum + (l.price ?? 0), 0) / allCompleted.length
    : 0;

  const monthLeads = leads.filter((l) => l.createdAt.slice(0, 7) === month);
  const fbLeads = monthLeads.filter((l) => l.source === 'facebook');
  const fbCompleted = completedMonth.filter((l) => l.source === 'facebook');
  const fbRevenue = fbCompleted.reduce((sum, l) => sum + (l.price ?? 0), 0);
  const converted = monthLeads.filter((l) => ['scheduled', 'on_way', 'completed'].includes(l.status));
  const conversion = monthLeads.length ? converted.length / monthLeads.length : 0;

  const insights: { emoji: string; text: React.ReactNode }[] = [];

  // 1. The bottom line: revenue per ad shekel this month.
  if (spend.month > 0) {
    const ratio = monthRevenue / spend.month;
    insights.push({
      emoji: ratio >= 1.5 ? '✅' : ratio >= 1 ? '⚖️' : '⚠️',
      text: (
        <>
          החודש: על כל ₪1 פרסום נרשמו <b className="tabular-nums">₪{ratio.toFixed(1)}</b> הכנסות מעבודות
          שהושלמו{' '}
          {ratio >= 1.5
            ? '— הפרסום מחזיר את עצמו ויותר.'
            : ratio >= 1
              ? '— בערך על האיזון.'
              : '— על הנייר הפסד, אבל ככל שתתעד יותר עבודות במערכת המספר יתדייק.'}
        </>
      ),
    });
  }

  // 2. Is the ad money measurable at all? Untagged leads make ROI a guess.
  if (spend.month > 0 && fbLeads.length === 0) {
    insights.push({
      emoji: '🏷️',
      text: (
        <>
          אף ליד החודש לא תויג במקור <b>Facebook</b> — בלי תיוג אי אפשר לדעת אילו עבודות הגיעו מהפרסום.
          מהיום: כל פנייה מהקמפיין ← בחר Facebook בטופס הליד.
        </>
      ),
    });
  } else if (fbLeads.length > 0) {
    const cpl = spend.month / fbLeads.length;
    insights.push({
      emoji: '📥',
      text: (
        <>
          {fbLeads.length} לידים מפייסבוק החודש — עלות של{' '}
          <b className="tabular-nums">₪{Math.round(cpl).toLocaleString('he-IL')}</b> לליד
          {fbRevenue > 0 ? (
            <>
              , והם הביאו <b className="tabular-nums">₪{fbRevenue.toLocaleString('he-IL')}</b> מעבודות
              שהושלמו.
            </>
          ) : (
            '.'
          )}
        </>
      ),
    });
  }

  // 3. What a lead is allowed to cost, from the business's own numbers.
  if (avgJob > 0 && conversion > 0) {
    const maxCpl = avgJob * conversion;
    insights.push({
      emoji: '🎯',
      text: (
        <>
          לפי הנתונים שלך (עבודה ממוצעת{' '}
          <b className="tabular-nums">₪{Math.round(avgJob).toLocaleString('he-IL')}</b>, סגירה של{' '}
          <b className="tabular-nums">{Math.round(conversion * 100)}%</b>) — ליד משתלם עד{' '}
          <b className="tabular-nums">₪{Math.round(maxCpl).toLocaleString('he-IL')}</b>. מעל זה הקמפיין
          מפסיד.
        </>
      ),
    });
  }

  // 4. Spend pace vs the year's own average.
  if (monthCount > 1 && spend.year > spend.month) {
    const prevMonthsAvg = (spend.year - spend.month) / (monthCount - 1);
    if (prevMonthsAvg > 0) {
      const projected = (spend.month / Math.max(dayOfMonth, 1)) * 30;
      const diff = Math.round(((projected - prevMonthsAvg) / prevMonthsAvg) * 100);
      if (Math.abs(diff) >= 20) {
        insights.push({
          emoji: diff > 0 ? '📈' : '📉',
          text: (
            <>
              קצב ההוצאה החודש {diff > 0 ? 'גבוה' : 'נמוך'} בכ-
              <b className="tabular-nums">{Math.abs(diff)}%</b> מהממוצע החודשי שלך השנה (
              <b className="tabular-nums">₪{Math.round(prevMonthsAvg).toLocaleString('he-IL')}</b>) — ודא
              שזה מכוון.
            </>
          ),
        });
      }
    }
  }

  return (
    <div className="mt-3 rounded-card border border-ink-700 surface p-4">
      <p className="text-sm font-extrabold">🧠 ניתוח אוטומטי</p>
      <ul className="mt-2 space-y-2.5">
        {insights.map((insight, i) => (
          <li key={i} className="flex gap-2 text-sm font-semibold leading-relaxed">
            <span aria-hidden className="shrink-0">
              {insight.emoji}
            </span>
            <span>{insight.text}</span>
          </li>
        ))}
      </ul>

      <details className="mt-3 border-t border-ink-700/60 pt-3">
        <summary className="cursor-pointer text-sm font-bold text-brand-400">
          💡 טיפים לשיפור הקמפיינים
        </summary>
        <ul className="mt-2 space-y-2 text-sm font-semibold leading-relaxed text-mist-300">
          <li>💬 קמפיין הודעות לוואטסאפ עובד הכי טוב בתחום — הלקוח פונה בקליק ואתה סוגר בצ׳אט.</li>
          <li>🎬 סרטון לפני/אחרי של ספה מנצח כל תמונה סטטית. רענן קריאייטיב כל 3–4 שבועות.</li>
          <li>📍 מקד גיאוגרפית רק לערים שאתה באמת מגיע אליהן — קליקים מרחוק הם כסף זרוק.</li>
          <li>🎛️ רכז את התקציב ב-1–2 קמפיינים פעילים — פיזור על עשרות קמפיינים הורג את הלמידה של פייסבוק.</li>
          <li>📆 קבע שגרה: כל יום ראשון להשוות כאן הכנסות מול הוצאות פרסום, ולכבות מה שלא מחזיר את עצמו.</li>
        </ul>
      </details>
    </div>
  );
}

/**
 * Facebook ad-spend panel for the statistics page: today / this month / this
 * year straight from the Marketing API, plus the number the owner actually
 * cares about — how much revenue came back per shekel of ads this month.
 */
export function FacebookAdsSection({ leads }: { leads: Lead[] }) {
  const [config, setConfig] = useState<FbAdsConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [editing, setEditing] = useState(false);
  const [spend, setSpend] = useState<AdSpend | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFbAdsConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
      .finally(() => setConfigLoaded(true));
  }, []);

  const load = useCallback(async (cfg: FbAdsConfig) => {
    setLoading(true);
    setError(null);
    try {
      setSpend(await fetchAdSpend(cfg));
    } catch (err) {
      setSpend(null);
      setError(err instanceof Error ? err.message : 'שליפת נתוני הפרסום נכשלה.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (config) void load(config);
  }, [config, load]);

  return (
    <section className="mt-6">
      <div className="mb-3 flex items-center justify-between">
        <h3 className="text-base font-extrabold">הוצאות פרסום — פייסבוק</h3>
        {config && !editing ? (
          <button
            type="button"
            onClick={() => setEditing(true)}
            className="text-sm font-semibold text-mist-500 transition-colors hover:text-mist-300"
          >
            הגדרות
          </button>
        ) : null}
      </div>

      {!configLoaded ? null : !config || editing ? (
        <SetupForm
          initial={config}
          onSaved={(cfg) => {
            setConfig(cfg);
            setEditing(false);
          }}
          onCancel={
            config
              ? () => setEditing(false)
              : undefined
          }
        />
      ) : loading ? (
        <div className="grid place-items-center rounded-card border border-ink-700 surface py-10">
          <SpinnerIcon className="h-6 w-6 animate-spin text-brand-500" />
        </div>
      ) : error ? (
        <div className="space-y-3 rounded-card border border-ink-700 surface p-4">
          <p role="alert" className="text-sm font-semibold text-red-600">
            {error}
          </p>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void load(config)}
              className="rounded-full border border-ink-600 bg-ink-850 px-4 py-2 text-sm font-bold text-mist-300"
            >
              נסה שוב
            </button>
            <button
              type="button"
              onClick={() => setEditing(true)}
              className="rounded-full bg-brand-500 px-4 py-2 text-sm font-bold text-on-brand"
            >
              עדכון פרטי חיבור
            </button>
            <button
              type="button"
              onClick={async () => {
                await clearFbAdsConfig();
                setConfig(null);
                setSpend(null);
                setError(null);
              }}
              className="ms-auto text-sm font-semibold text-mist-500"
            >
              ניתוק
            </button>
          </div>
        </div>
      ) : spend ? (
        <>
          <div className="grid grid-cols-3 gap-2">
            <SpendTile label="היום" value={formatSpend(spend.today, spend.currency)} emoji="📣" />
            <SpendTile label="החודש" value={formatSpend(spend.month, spend.currency)} emoji="🗓️" />
            <SpendTile label="השנה" value={formatSpend(spend.year, spend.currency)} emoji="📊" />
          </div>
          <AdInsights spend={spend} leads={leads} />
        </>
      ) : null}
    </section>
  );
}
