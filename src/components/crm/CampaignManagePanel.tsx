'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { SpinnerIcon } from '@/components/icons';
import {
  duplicateCampaign,
  fetchAdSets,
  formatSpend,
  searchCities,
  setAdSetBudget,
  setAdSetCities,
  setCampaignBudget,
  setCampaignStatus,
  type AdSetTargeting,
  type CampaignPerf,
  type TargetedCity,
} from '@/lib/crm/facebookAds';
import type { FbAdsConfig } from '@/lib/crm/settings';

const currency = 'ILS';

/** Budget input + save button; used for both campaign and ad set budgets. */
function BudgetEditor({
  label,
  current,
  onSave,
}: {
  label: string;
  current: number;
  onSave: (value: number) => Promise<void>;
}) {
  const [value, setValue] = useState(String(Math.round(current)));
  const [busy, setBusy] = useState(false);
  const dirty = Number(value) > 0 && Math.round(Number(value)) !== Math.round(current);
  return (
    <div className="flex items-center gap-2">
      <label className="flex-1 text-xs font-semibold text-mist-500">
        {label}
        <div className="mt-1 flex items-center gap-2">
          <div className="relative flex-1">
            <input
              type="number"
              inputMode="numeric"
              min={1}
              value={value}
              onChange={(e) => setValue(e.target.value)}
              className="w-full rounded-xl border border-ink-700 bg-ink-850 py-2 pe-2 ps-7 text-sm font-bold tabular-nums"
            />
            <span className="pointer-events-none absolute start-2.5 top-1/2 -translate-y-1/2 text-sm font-bold text-mist-500">
              ₪
            </span>
          </div>
          <button
            type="button"
            disabled={!dirty || busy}
            onClick={async () => {
              setBusy(true);
              try {
                await onSave(Number(value));
              } finally {
                setBusy(false);
              }
            }}
            className="rounded-full bg-brand-500 px-4 py-2 text-xs font-bold text-on-brand transition-colors hover:bg-brand-400 disabled:opacity-40"
          >
            {busy ? '...' : 'עדכן'}
          </button>
        </div>
      </label>
    </div>
  );
}

/** One ad set's city-targeting editor: chips + search + save. */
function AdSetCitiesEditor({
  config,
  adSet,
  onError,
  onSaved,
}: {
  config: FbAdsConfig;
  adSet: AdSetTargeting;
  onError: (message: string) => void;
  onSaved: () => void;
}) {
  const [cities, setCities] = useState<TargetedCity[]>(adSet.cities);
  const [query, setQuery] = useState('');
  const [results, setResults] = useState<TargetedCity[]>([]);
  const [searching, setSearching] = useState(false);
  const [saving, setSaving] = useState(false);
  const debounce = useRef<ReturnType<typeof setTimeout> | null>(null);

  const dirty =
    cities.length !== adSet.cities.length ||
    cities.some((c) => !adSet.cities.some((o) => o.key === c.key));

  useEffect(() => {
    if (debounce.current) clearTimeout(debounce.current);
    const q = query.trim();
    if (q.length < 2) {
      setResults([]);
      setSearching(false);
      return;
    }
    setSearching(true);
    debounce.current = setTimeout(() => {
      searchCities(config, q)
        .then((rows) => setResults(rows.filter((r) => !cities.some((c) => c.key === r.key))))
        .catch((err) => onError(err instanceof Error ? err.message : 'חיפוש הערים נכשל.'))
        .finally(() => setSearching(false));
    }, 350);
    return () => {
      if (debounce.current) clearTimeout(debounce.current);
    };
  }, [query, config, cities, onError]);

  return (
    <div className="mt-2">
      <p className="text-xs font-semibold text-mist-500">📍 מיקוד ערים</p>
      <div className="mt-1.5 flex flex-wrap gap-1.5">
        {cities.length === 0 ? (
          <span className="rounded-full bg-ink-700 px-2.5 py-1 text-xs font-bold text-mist-300">
            🇮🇱 כל הארץ
          </span>
        ) : (
          cities.map((city) => (
            <button
              key={city.key}
              type="button"
              onClick={() => setCities((list) => list.filter((c) => c.key !== city.key))}
              className="rounded-full bg-brand-500/15 px-2.5 py-1 text-xs font-bold text-brand-400"
              aria-label={`הסר את ${city.name}`}
            >
              {city.name} ✕
            </button>
          ))
        )}
      </div>
      <div className="relative mt-2">
        <input
          type="search"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="הוסף עיר — הקלד שם (למשל: חולון)"
          className="w-full rounded-xl border border-ink-700 bg-ink-850 px-3 py-2 text-sm font-semibold"
        />
        {searching ? (
          <SpinnerIcon className="absolute end-2.5 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-brand-500" />
        ) : null}
      </div>
      {results.length > 0 ? (
        <ul className="mt-1.5 overflow-hidden rounded-xl border border-ink-700">
          {results.map((city) => (
            <li key={city.key} className="border-t border-ink-700 first:border-t-0">
              <button
                type="button"
                onClick={() => {
                  setCities((list) => [...list, city]);
                  setQuery('');
                  setResults([]);
                }}
                className="flex w-full items-center justify-between px-3 py-2 text-sm font-semibold transition-colors hover:bg-ink-850"
              >
                <span>{city.name}</span>
                <span className="text-xs text-mist-500">{city.region ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {cities.length > 0 ? (
        <p className="mt-1.5 text-[11px] font-semibold text-mist-500">
          כל עיר כוללת רדיוס של ~17 ק״מ סביבה (המינימום של פייסבוק). הסרת כל הערים = חזרה לכל הארץ.
        </p>
      ) : null}
      {dirty ? (
        <button
          type="button"
          disabled={saving}
          onClick={async () => {
            setSaving(true);
            try {
              await setAdSetCities(config, adSet, cities);
              onSaved();
            } catch (err) {
              onError(err instanceof Error ? err.message : 'שמירת המיקוד נכשלה.');
            } finally {
              setSaving(false);
            }
          }}
          className="mt-2 w-full rounded-full bg-brand-500 py-2 text-sm font-bold text-on-brand transition-colors hover:bg-brand-400 disabled:opacity-60"
        >
          {saving ? 'שומר…' : cities.length ? `שמור מיקוד (${cities.length} ערים)` : 'שמור — כל הארץ'}
        </button>
      ) : null}
    </div>
  );
}

/**
 * The expandable management panel under a campaign card: pause/resume,
 * daily budget, city targeting per ad set, and duplicate-as-draft. Every
 * write goes straight to Graph and re-syncs the caller.
 */
export function CampaignManagePanel({
  config,
  campaign,
  onChanged,
}: {
  config: FbAdsConfig;
  campaign: CampaignPerf;
  /** Called after any successful write so the caller can re-fetch. */
  onChanged: () => void;
}) {
  const [adSets, setAdSets] = useState<AdSetTargeting[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    fetchAdSets(config, campaign.campaignId)
      .then(setAdSets)
      .catch((err) => setError(err instanceof Error ? err.message : 'טעינת סטי המודעות נכשלה.'));
  }, [config, campaign.campaignId]);

  useEffect(load, [load]);

  const run = async (key: string, action: () => Promise<void>, doneNotice: string) => {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
      setNotice(doneNotice);
      load();
      onChanged();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הפעולה נכשלה.');
    } finally {
      setBusy(null);
    }
  };

  const isActive = campaign.status === 'ACTIVE';

  return (
    <div className="mt-3 border-t border-ink-700 pt-3">
      <div className="grid grid-cols-2 gap-2">
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            const question = isActive
              ? `להשהות את "${campaign.name}"? המודעות יפסיקו לרוץ עד שתפעיל שוב.`
              : `להפעיל את "${campaign.name}"?`;
            if (!window.confirm(question)) return;
            void run(
              'status',
              () => setCampaignStatus(config, campaign.campaignId, isActive ? 'PAUSED' : 'ACTIVE'),
              isActive ? 'הקמפיין הושהה.' : 'הקמפיין הופעל.',
            );
          }}
          className={`rounded-full py-2 text-sm font-bold transition-colors disabled:opacity-60 ${
            isActive
              ? 'border border-ink-700 bg-ink-850 text-mist-300'
              : 'bg-emerald-600 text-white hover:bg-emerald-500'
          }`}
        >
          {busy === 'status' ? '...' : isActive ? '⏸ השהה קמפיין' : '▶️ הפעל קמפיין'}
        </button>
        <button
          type="button"
          disabled={busy !== null}
          onClick={() => {
            if (
              !window.confirm(
                `לשכפל את "${campaign.name}"? ייווצר עותק מושהה של הקמפיין כולל המודעות — תוכל לשנות לו תקציב וערים ואז להפעיל.`,
              )
            )
              return;
            void run(
              'copy',
              async () => {
                await duplicateCampaign(config, campaign.campaignId, `${campaign.name} — עותק`);
              },
              'נוצר עותק מושהה של הקמפיין. ערוך אותו ואז הפעל.',
            );
          }}
          className="rounded-full border border-ink-700 bg-ink-850 py-2 text-sm font-bold text-mist-300 transition-colors hover:bg-ink-700 disabled:opacity-60"
        >
          {busy === 'copy' ? '...' : '⧉ שכפל כקמפיין חדש'}
        </button>
      </div>

      {campaign.dailyBudget !== null ? (
        <div className="mt-3">
          <BudgetEditor
            label={`תקציב יומי לקמפיין (נוכחי: ${formatSpend(campaign.dailyBudget, currency)})`}
            current={campaign.dailyBudget}
            onSave={(value) =>
              run(
                'budget',
                () => setCampaignBudget(config, campaign.campaignId, value),
                'התקציב עודכן.',
              )
            }
          />
        </div>
      ) : null}

      {!adSets && !error ? (
        <div className="grid place-items-center py-6">
          <SpinnerIcon className="h-5 w-5 animate-spin text-brand-500" />
        </div>
      ) : null}

      {adSets?.map((adSet) => (
        <div key={adSet.adSetId} className="mt-3 rounded-xl border border-ink-700 bg-ink-850/50 p-3">
          {adSets.length > 1 || adSet.dailyBudget !== null ? (
            <p className="text-xs font-bold text-mist-300">{adSet.name}</p>
          ) : null}
          {adSet.dailyBudget !== null ? (
            <div className="mt-2">
              <BudgetEditor
                label={`תקציב יומי לסט (נוכחי: ${formatSpend(adSet.dailyBudget, currency)})`}
                current={adSet.dailyBudget}
                onSave={(value) =>
                  run(
                    `adset-budget-${adSet.adSetId}`,
                    () => setAdSetBudget(config, adSet.adSetId, value),
                    'התקציב עודכן.',
                  )
                }
              />
            </div>
          ) : null}
          <AdSetCitiesEditor
            config={config}
            adSet={adSet}
            onError={setError}
            onSaved={() => {
              setNotice('המיקוד הגאוגרפי נשמר.');
              load();
              onChanged();
            }}
          />
        </div>
      ))}

      {notice ? (
        <p className="mt-2 text-xs font-bold text-emerald-600" role="status">
          ✓ {notice}
        </p>
      ) : null}
      {error ? (
        <p className="mt-2 text-xs font-semibold text-red-600" role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
