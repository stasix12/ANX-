'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CrmShell } from '@/components/crm/CrmShell';
import { ManageCampaignCard } from '@/components/crm/ManageCampaignCard';
import { SpinnerIcon } from '@/components/icons';
import { fetchCampaignPerf, formatSpend, type CampaignPerf } from '@/lib/crm/facebookAds';
import { getFbAdsConfig, type FbAdsConfig } from '@/lib/crm/settings';

const currency = 'ILS';

/**
 * The ads-management tab: scans the whole Ads Manager tree (campaigns →
 * ad sets → ads) and manages it in place — status switches, budgets, city
 * targeting, duplication. Analysis and recommendations live on
 * /crm/ads/optimize; this tab is where the changes happen.
 */
export default function CrmManagePage() {
  const [config, setConfig] = useState<FbAdsConfig | null>(null);
  const [configLoaded, setConfigLoaded] = useState(false);
  const [campaigns, setCampaigns] = useState<CampaignPerf[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getFbAdsConfig()
      .then(setConfig)
      .catch(() => setConfig(null))
      .finally(() => setConfigLoaded(true));
  }, []);

  const load = useCallback(async (cfg: FbAdsConfig) => {
    setError(null);
    try {
      setCampaigns(await fetchCampaignPerf(cfg));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'סריקת חשבון הפרסום נכשלה.');
    }
  }, []);

  useEffect(() => {
    if (config) void load(config);
  }, [config, load]);

  const summary = useMemo(() => {
    const source = campaigns ?? [];
    return {
      active: source.filter((c) => c.status === 'ACTIVE').length,
      total: source.length,
      spend: source.reduce((sum, c) => sum + c.d30.spend, 0),
      conversations: source.reduce((sum, c) => sum + c.d30.conversations, 0),
    };
  }, [campaigns]);

  return (
    <CrmShell title="ניהול פרסום">
      {!configLoaded ? null : !config ? (
        <div className="rounded-card border border-ink-700 surface p-6 text-center">
          <p aria-hidden className="text-3xl">📣</p>
          <p className="mt-2 text-sm font-bold">עדיין לא חובר חשבון פרסום</p>
          <p className="mt-1 text-sm text-mist-500">מתחברים פעם אחת בעמוד הנתונים.</p>
          <Link
            href="/crm/stats"
            className="mt-3 inline-flex rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-400"
          >
            לחיבור פייסבוק
          </Link>
        </div>
      ) : error ? (
        <div className="space-y-3 rounded-card border border-ink-700 surface p-4">
          <p role="alert" className="text-sm font-semibold text-red-600">
            {error}
          </p>
          <Link
            href="/crm/stats"
            className="inline-flex rounded-full bg-brand-500 px-5 py-2.5 text-sm font-bold text-on-brand"
          >
            לעדכון החיבור
          </Link>
        </div>
      ) : !campaigns ? (
        <div className="grid place-items-center py-20">
          <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            <div className="rounded-card border border-ink-700 surface p-3 text-center">
              <p aria-hidden className="text-lg leading-none">📣</p>
              <p className="mt-1.5 text-lg font-extrabold tabular-nums text-blue-700">
                {summary.active}/{summary.total}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-mist-500">קמפיינים פעילים</p>
            </div>
            <div className="rounded-card border border-ink-700 surface p-3 text-center">
              <p aria-hidden className="text-lg leading-none">💰</p>
              <p className="mt-1.5 text-lg font-extrabold tabular-nums text-blue-700">
                {formatSpend(summary.spend, currency)}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-mist-500">הוצאה · 30 יום</p>
            </div>
            <div className="rounded-card border border-ink-700 surface p-3 text-center">
              <p aria-hidden className="text-lg leading-none">📥</p>
              <p className="mt-1.5 text-lg font-extrabold tabular-nums text-blue-700">
                {summary.conversations.toLocaleString('he-IL')}
              </p>
              <p className="mt-0.5 text-xs font-semibold text-mist-500">פניות · 30 יום</p>
            </div>
          </div>

          <Link
            href="/crm/ads/optimize"
            className="mt-3 flex items-center justify-center gap-2 rounded-full border border-ink-700 bg-ink-850 py-2.5 text-sm font-bold text-mist-300 transition-colors hover:bg-ink-700"
          >
            🧠 לניתוח ולהמלצות — מה כדאי לשנות
          </Link>

          {campaigns.length === 0 ? (
            <div className="mt-3 rounded-card border border-ink-700 surface p-6 text-center">
              <p aria-hidden className="text-3xl">🌱</p>
              <p className="mt-2 text-sm font-bold">לא נמצאו קמפיינים בחשבון</p>
              <p className="mt-1 text-sm text-mist-500">
                ברגע שיהיה קמפיין במנהל המודעות, הוא יופיע כאן לניהול.
              </p>
            </div>
          ) : (
            <div className="mt-3 space-y-2.5">
              {campaigns.map((campaign) => (
                <ManageCampaignCard
                  key={campaign.campaignId}
                  config={config}
                  campaign={campaign}
                  onChanged={() => void load(config)}
                />
              ))}
            </div>
          )}

          <p className="mt-3 text-xs font-semibold leading-relaxed text-mist-500">
            💡 כל שינוי כאן מתעדכן ישירות במנהל המודעות של פייסבוק. נדרש טוקן עם הרשאת
            ads_management — אם חסרה, תופיע הודעה שמסבירה איך להוסיף אותה (בעמוד הנתונים).
          </p>
        </>
      )}
    </CrmShell>
  );
}
