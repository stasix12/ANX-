'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CrmShell } from '@/components/crm/CrmShell';
import { InboxIcon, SpinnerIcon, TargetIcon, WalletIcon } from '@/components/icons';
import { buildRecommendations, type RecommendationTone } from '@/lib/crm/adsOptimizer';
import { fetchCampaignPerf, formatSpend, type CampaignPerf } from '@/lib/crm/facebookAds';
import { getFbAdsConfig, type FbAdsConfig } from '@/lib/crm/settings';

const currency = 'ILS';

const STATUS_LABEL: Record<string, { label: string; className: string }> = {
  ACTIVE: { label: 'פעיל', className: 'bg-emerald-500/15 text-emerald-600' },
  PAUSED: { label: 'מושהה', className: 'bg-ink-700 text-mist-300' },
  CAMPAIGN_PAUSED: { label: 'מושהה', className: 'bg-ink-700 text-mist-300' },
  ARCHIVED: { label: 'בארכיון', className: 'bg-ink-700 text-mist-500' },
  WITH_ISSUES: { label: 'בעיה בקמפיין', className: 'bg-red-500/15 text-red-600' },
};

const TONE_STYLE: Record<RecommendationTone, string> = {
  act: 'border-brand-500/50',
  watch: 'border-ink-700',
  good: 'border-emerald-500/40',
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div className="text-center">
      <p className="text-base font-extrabold tabular-nums">{value}</p>
      <p className="mt-0.5 text-[11px] font-semibold text-mist-500">{label}</p>
    </div>
  );
}

function CampaignCard({ campaign }: { campaign: CampaignPerf }) {
  const status = STATUS_LABEL[campaign.status] ?? {
    label: campaign.status,
    className: 'bg-ink-700 text-mist-300',
  };
  const cpl =
    campaign.d30.conversations > 0 ? campaign.d30.spend / campaign.d30.conversations : null;
  return (
    <div className="rounded-card border border-ink-700 surface p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-extrabold leading-snug">{campaign.name}</p>
        <span className={`shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold ${status.className}`}>
          {status.label}
        </span>
      </div>
      <div className="mt-2.5 grid grid-cols-3 gap-2">
        <Stat label="הוצאה · 30 יום" value={formatSpend(campaign.d30.spend, currency)} />
        <Stat label="פניות" value={campaign.d30.conversations.toLocaleString('he-IL')} />
        <Stat label="עלות לפנייה" value={cpl !== null ? formatSpend(cpl, currency) : '—'} />
      </div>
      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-ink-700 pt-2">
        <Stat label="CTR" value={campaign.d30.ctr > 0 ? `${campaign.d30.ctr.toFixed(2)}%` : '—'} />
        <Stat
          label="תדירות"
          value={campaign.d30.frequency > 0 ? campaign.d30.frequency.toFixed(1) : '—'}
        />
        <Stat
          label="תקציב יומי"
          value={campaign.dailyBudget !== null ? formatSpend(campaign.dailyBudget, currency) : '—'}
        />
      </div>
    </div>
  );
}

export default function CrmAdsOptimizePage() {
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
      setError(err instanceof Error ? err.message : 'שליפת נתוני הקמפיינים נכשלה.');
    }
  }, []);

  useEffect(() => {
    if (config) void load(config);
  }, [config, load]);

  const totals = useMemo(() => {
    const source = campaigns ?? [];
    const spend = source.reduce((sum, c) => sum + c.d30.spend, 0);
    const conversations = source.reduce((sum, c) => sum + c.d30.conversations, 0);
    return { spend, conversations, cpl: conversations > 0 ? spend / conversations : null };
  }, [campaigns]);

  const recommendations = useMemo(
    () => buildRecommendations(campaigns ?? [], currency),
    [campaigns],
  );

  return (
    <CrmShell title="אופטימיזציית קמפיינים">
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
      ) : campaigns.length === 0 ? (
        <div className="rounded-card border border-ink-700 surface p-6 text-center">
          <p aria-hidden className="text-3xl">🌱</p>
          <p className="mt-2 text-sm font-bold">אין קמפיינים עם הוצאה ב‑30 הימים האחרונים</p>
          <p className="mt-1 text-sm text-mist-500">
            ברגע שקמפיין יתחיל לרוץ, הביצועים וההמלצות יופיעו כאן.
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-3 gap-2">
            {(
              [
                { label: 'הוצאה · 30 יום', value: formatSpend(totals.spend, currency), icon: WalletIcon },
                { label: 'פניות', value: totals.conversations.toLocaleString('he-IL'), icon: InboxIcon },
                {
                  label: 'עלות לפנייה',
                  value: totals.cpl !== null ? formatSpend(totals.cpl, currency) : '—',
                  icon: TargetIcon,
                },
              ] as const
            ).map((tile) => (
              <div key={tile.label} className="rounded-card border border-ink-700 surface p-3 text-center">
                <span aria-hidden className="mx-auto grid h-8 w-8 place-items-center rounded-lg bg-sky-500/10 text-brand-400">
                  <tile.icon className="h-4.5 w-4.5" />
                </span>
                <p className="mt-1.5 text-lg font-extrabold tabular-nums text-brand-400">{tile.value}</p>
                <p className="mt-0.5 text-xs font-semibold text-mist-500">{tile.label}</p>
              </div>
            ))}
          </div>

          <div className="mt-4">
            <h2 className="text-sm font-extrabold">🎛️ מה לעשות עכשיו</h2>
            <ul className="mt-2 space-y-2">
              {recommendations.map((rec, i) => (
                <li
                  key={i}
                  className={`flex gap-2 rounded-card border surface p-3 text-sm leading-relaxed ${TONE_STYLE[rec.tone]}`}
                >
                  <span aria-hidden className="shrink-0">
                    {rec.emoji}
                  </span>
                  <span>{rec.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4">
            <h2 className="text-sm font-extrabold">📊 הקמפיינים · 30 הימים האחרונים</h2>
            <div className="mt-2 space-y-2">
              {campaigns.map((campaign) => (
                <CampaignCard key={campaign.campaignId} campaign={campaign} />
              ))}
            </div>
          </div>

          <p className="mt-3 text-xs font-semibold leading-relaxed text-mist-500">
            💡 ההמלצות מחושבות מנתוני ה‑Ads Manager שלך (30 הימים האחרונים). את השינויים עצמם —
            תקציב, השהיה, קריאייטיב — מבצעים בתוך פייסבוק; המערכת כאן קוראת נתונים בלבד.
          </p>
        </>
      )}
    </CrmShell>
  );
}
