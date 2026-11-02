'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { CrmShell } from '@/components/crm/CrmShell';
import { InboxIcon, SpinnerIcon, TargetIcon, WalletIcon } from '@/components/icons';
import { InsightIcon } from '@/components/crm/InsightIcon';
import { buildRecommendations, type RecommendationTone } from '@/lib/crm/adsOptimizer';
import {
  duplicateCampaign,
  fetchCampaignDetail,
  fetchCampaignPerf,
  formatSpend,
  setAdSetDailyBudget,
  setAdStatus,
  setCampaignDailyBudget,
  setCampaignStatus,
  type CampaignDetail,
  type CampaignPerf,
} from '@/lib/crm/facebookAds';
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

function CampaignCard({
  campaign,
  config,
  onChanged,
}: {
  campaign: CampaignPerf;
  config: FbAdsConfig;
  onChanged: () => void;
}) {
  const status = STATUS_LABEL[campaign.status] ?? {
    label: campaign.status,
    className: 'bg-ink-700 text-mist-300',
  };
  const cpl =
    campaign.d30.conversations > 0 ? campaign.d30.spend / campaign.d30.conversations : null;
  const isActive = campaign.status === 'ACTIVE';
  const [busy, setBusy] = useState<null | 'status' | 'budget' | 'copy'>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [budgetDraft, setBudgetDraft] = useState(
    campaign.dailyBudget !== null ? String(campaign.dailyBudget) : '',
  );
  const [detail, setDetail] = useState<CampaignDetail | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);
  const [detailLoading, setDetailLoading] = useState(false);

  async function loadDetail() {
    setDetailLoading(true);
    setActionError(null);
    try {
      setDetail(await fetchCampaignDetail(config, campaign.campaignId));
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'שליפת המודעות נכשלה.');
      setDetailOpen(false);
    } finally {
      setDetailLoading(false);
    }
  }

  function toggleDetail() {
    if (detailOpen) {
      setDetailOpen(false);
      return;
    }
    setDetailOpen(true);
    if (!detail) void loadDetail();
  }

  async function run(kind: 'status' | 'budget' | 'copy', action: () => Promise<void>) {
    setBusy(kind);
    setActionError(null);
    try {
      await action();
      onChanged();
    } catch (err) {
      setActionError(err instanceof Error ? err.message : 'הפעולה נכשלה. נסו שוב.');
    } finally {
      setBusy(null);
    }
  }

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

      {/* The Ads Manager controls, in-app: pause/resume, daily budget, and a
          deep copy that lands PAUSED so nothing spends unreviewed. */}
      <div className="mt-2.5 flex flex-wrap items-center gap-2 border-t border-ink-700 pt-2.5">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (isActive && !window.confirm(`להשהות את "${campaign.name}"? הוא יפסיק להוציא כסף.`)) return;
            if (!isActive && !window.confirm(`להפעיל את "${campaign.name}"? הוא יתחיל להוציא כסף.`)) return;
            void run('status', () => setCampaignStatus(config, campaign.campaignId, !isActive));
          }}
          className={`flex items-center gap-1.5 rounded-full px-4 py-2 text-xs font-bold transition-colors disabled:opacity-50 ${
            isActive
              ? 'border border-ink-600 bg-ink-850 text-mist-300 hover:border-ink-500'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {busy === 'status' ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : null}
          {isActive ? '⏸ השהה' : '▶ הפעל'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (!window.confirm(`לשכפל את "${campaign.name}"? העותק ייווצר מושהה ולא יוציא כסף עד שתפעיל אותו.`)) return;
            void run('copy', () => duplicateCampaign(config, campaign.campaignId));
          }}
          className="flex items-center gap-1.5 rounded-full border border-ink-600 bg-ink-850 px-4 py-2 text-xs font-bold text-mist-300 transition-colors hover:border-ink-500 disabled:opacity-50"
        >
          {busy === 'copy' ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : null}
          שכפול
        </button>
        <button
          type="button"
          onClick={toggleDetail}
          className="flex items-center gap-1 rounded-full border border-ink-600 bg-ink-850 px-4 py-2 text-xs font-bold text-brand-400 transition-colors hover:border-ink-500"
        >
          מודעות {detailOpen ? '▴' : '▾'}
        </button>
        {campaign.dailyBudget !== null ? (
          <span className="ms-auto flex items-center gap-1.5">
            <input
              type="number"
              inputMode="decimal"
              min="1"
              aria-label="תקציב יומי בשקלים"
              value={budgetDraft}
              onChange={(e) => setBudgetDraft(e.target.value)}
              className="w-20 rounded-lg border border-ink-600 bg-ink-850 px-2 py-1.5 text-sm font-bold tabular-nums outline-none focus:border-brand-500"
              dir="ltr"
            />
            <span className="text-xs font-bold text-mist-500">₪/יום</span>
            <button
              type="button"
              disabled={
                busy !== null ||
                !budgetDraft ||
                Number(budgetDraft) <= 0 ||
                Number(budgetDraft) === campaign.dailyBudget
              }
              onClick={() =>
                void run('budget', () =>
                  setCampaignDailyBudget(config, campaign.campaignId, Number(budgetDraft)),
                )
              }
              className="flex items-center gap-1 rounded-full bg-brand-500 px-3.5 py-2 text-xs font-bold text-on-brand transition-colors hover:bg-brand-400 disabled:opacity-40"
            >
              {busy === 'budget' ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin" /> : null}
              עדכן
            </button>
          </span>
        ) : (
          <span className="ms-auto text-[11px] font-semibold text-mist-500">
            התקציב מנוהל ברמת סט המודעות
          </span>
        )}
      </div>
      {detailOpen ? (
        <div className="mt-2.5 border-t border-ink-700 pt-2.5">
          {detailLoading || !detail ? (
            <div className="grid place-items-center py-4">
              <SpinnerIcon className="h-5 w-5 animate-spin text-brand-500" />
            </div>
          ) : (
            <>
              {/* Ad-set budgets — editable when the campaign budgets there. */}
              {campaign.dailyBudget === null && detail.adsets.some((a) => a.dailyBudget !== null) ? (
                <div className="space-y-2">
                  {detail.adsets.map((adset) => (
                    <AdSetRow
                      key={adset.adsetId}
                      adset={adset}
                      config={config}
                      disabled={busy !== null}
                      onChanged={() => void loadDetail()}
                    />
                  ))}
                </div>
              ) : null}

              {detail.ads.length === 0 ? (
                <p className="py-3 text-center text-xs font-semibold text-mist-500">
                  אין מודעות בקמפיין הזה.
                </p>
              ) : (
                <div className="mt-2 space-y-2">
                  {detail.ads.map((ad) => (
                    <AdRow
                      key={ad.adId}
                      ad={ad}
                      config={config}
                      onChanged={() => void loadDetail()}
                    />
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      ) : null}
      {actionError ? (
        <p role="alert" className="mt-2 rounded-lg bg-red-600/10 px-3 py-2 text-xs font-semibold text-red-600">
          {actionError}
        </p>
      ) : null}
    </div>
  );
}

/** One ad inside the drill-down: thumbnail, results, and its own toggle. */
function AdRow({
  ad,
  config,
  onChanged,
}: {
  ad: import('@/lib/crm/facebookAds').AdInfo;
  config: FbAdsConfig;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const isActive = ad.status === 'ACTIVE';
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-2">
      <div className="flex items-center gap-2.5">
        {ad.thumbnailUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={ad.thumbnailUrl}
            alt=""
            className="h-12 w-12 shrink-0 rounded-lg border border-ink-700 object-cover"
          />
        ) : (
          <span aria-hidden className="grid h-12 w-12 shrink-0 place-items-center rounded-lg bg-ink-800 text-lg">
            🖼️
          </span>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-bold">{ad.name}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-mist-500">
            {formatSpend(ad.spend, currency)} · {ad.conversations} פניות
            {ad.conversations > 0 ? ` · ${formatSpend(ad.spend / ad.conversations, currency)} לפנייה` : ''}
          </p>
        </div>
        <button
          type="button"
          disabled={busy}
          onClick={async () => {
            if (isActive && !window.confirm(`להשהות את המודעה "${ad.name}"?`)) return;
            if (!isActive && !window.confirm(`להפעיל את המודעה "${ad.name}"? היא תתחיל להוציא כסף.`)) return;
            setBusy(true);
            setError(null);
            try {
              await setAdStatus(config, ad.adId, !isActive);
              onChanged();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'הפעולה נכשלה.');
            } finally {
              setBusy(false);
            }
          }}
          className={`shrink-0 rounded-full px-3 py-1.5 text-[11px] font-bold transition-colors disabled:opacity-50 ${
            isActive
              ? 'border border-ink-600 bg-ink-850 text-mist-300'
              : 'bg-emerald-600 text-white hover:bg-emerald-700'
          }`}
        >
          {busy ? '···' : isActive ? '⏸ השהה' : '▶ הפעל'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-[11px] font-semibold text-red-600">
          {error}
        </p>
      ) : null}
    </div>
  );
}

/** An ad set's budget line, editable in place. */
function AdSetRow({
  adset,
  config,
  disabled,
  onChanged,
}: {
  adset: import('@/lib/crm/facebookAds').AdSetInfo;
  config: FbAdsConfig;
  disabled: boolean;
  onChanged: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [draft, setDraft] = useState(adset.dailyBudget !== null ? String(adset.dailyBudget) : '');
  if (adset.dailyBudget === null) return null;
  return (
    <div className="rounded-xl border border-ink-700 bg-ink-900/60 p-2">
      <div className="flex items-center gap-2">
        <p className="min-w-0 flex-1 truncate text-xs font-bold">סט: {adset.name}</p>
        <input
          type="number"
          inputMode="decimal"
          min="1"
          aria-label={`תקציב יומי לסט ${adset.name}`}
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          className="w-20 rounded-lg border border-ink-600 bg-ink-850 px-2 py-1.5 text-sm font-bold tabular-nums outline-none focus:border-brand-500"
          dir="ltr"
        />
        <span className="text-[11px] font-bold text-mist-500">₪/יום</span>
        <button
          type="button"
          disabled={disabled || busy || !draft || Number(draft) <= 0 || Number(draft) === adset.dailyBudget}
          onClick={async () => {
            setBusy(true);
            setError(null);
            try {
              await setAdSetDailyBudget(config, adset.adsetId, Number(draft));
              onChanged();
            } catch (err) {
              setError(err instanceof Error ? err.message : 'הפעולה נכשלה.');
            } finally {
              setBusy(false);
            }
          }}
          className="shrink-0 rounded-full bg-brand-500 px-3 py-1.5 text-[11px] font-bold text-on-brand transition-colors hover:bg-brand-400 disabled:opacity-40"
        >
          {busy ? '···' : 'עדכן'}
        </button>
      </div>
      {error ? (
        <p role="alert" className="mt-1.5 text-[11px] font-semibold text-red-600">
          {error}
        </p>
      ) : null}
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
                  <InsightIcon emoji={rec.emoji} className="mt-0.5 h-4.5 w-4.5" />
                  <span>{rec.text}</span>
                </li>
              ))}
            </ul>
          </div>

          <div className="mt-4">
            <h2 className="text-sm font-extrabold">📊 הקמפיינים · 30 הימים האחרונים</h2>
            <div className="mt-2 space-y-2">
              {campaigns.map((campaign) => (
                <CampaignCard
                  key={campaign.campaignId}
                  campaign={campaign}
                  config={config}
                  onChanged={() => void load(config)}
                />
              ))}
            </div>
          </div>

          <p className="mt-3 text-xs font-semibold leading-relaxed text-mist-500">
            💡 השהיה, הפעלה, תקציב יומי ושכפול מתבצעים כאן ישירות מול פייסבוק (נדרש טוקן עם
            הרשאת ads_management). יצירת מודעות חדשות עם תמונות וטקסטים — בינתיים בתוך פייסבוק.
          </p>
        </>
      )}
    </CrmShell>
  );
}
