'use client';

import { useCallback, useEffect, useState } from 'react';
import { SpinnerIcon } from '@/components/icons';
import { fetchAdSpend, formatSpend, type AdSpend } from '@/lib/crm/facebookAds';
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
 * Facebook ad-spend panel for the statistics page: today / this month / this
 * year straight from the Marketing API, plus the number the owner actually
 * cares about — how much revenue came back per shekel of ads this month.
 */
export function FacebookAdsSection({ monthRevenue }: { monthRevenue: number }) {
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

  const returnRatio =
    spend && spend.month > 0 && monthRevenue > 0 ? monthRevenue / spend.month : null;

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
          {returnRatio !== null ? (
            <p className="mt-2 rounded-card border border-ink-700 surface px-4 py-3 text-sm font-semibold">
              🎯 החודש: על כל ₪1 פרסום נכנסו{' '}
              <b className="tabular-nums">₪{returnRatio.toFixed(1)}</b> מהעבודות שהושלמו
              {returnRatio >= 3 ? ' — יחס מצוין!' : returnRatio >= 1.5 ? ' — יחס סביר.' : ' — כדאי לבדוק את הקמפיינים.'}
            </p>
          ) : null}
        </>
      ) : null}
    </section>
  );
}
