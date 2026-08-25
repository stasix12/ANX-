'use client';

/* eslint-disable @next/next/no-img-element */

import { useCallback, useEffect, useRef, useState } from 'react';
import { SpinnerIcon } from '@/components/icons';
import {
  duplicateCampaign,
  fetchAds,
  fetchAdSets,
  formatSpend,
  searchCities,
  setAdSetBudget,
  setAdSetCities,
  setCampaignBudget,
  setObjectStatus,
  type AdInfo,
  type AdSetTargeting,
  type CampaignPerf,
  type TargetedCity,
} from '@/lib/crm/facebookAds';
import type { FbAdsConfig } from '@/lib/crm/settings';

const currency = 'ILS';

const isOn = (status: string) => status === 'ACTIVE';

/**
 * Friendly on/off switch for any ad object. Pausing asks first; the switch
 * shows a spinner while Graph works.
 */
function StatusToggle({
  status,
  label,
  onFlip,
}: {
  status: string;
  /** What gets paused — for the confirm question. */
  label: string;
  onFlip: (next: 'ACTIVE' | 'PAUSED') => Promise<void>;
}) {
  const [busy, setBusy] = useState(false);
  const on = isOn(status);
  return (
    <button
      type="button"
      role="switch"
      aria-checked={on}
      aria-label={`${on ? 'השהה' : 'הפעל'} ${label}`}
      disabled={busy}
      onClick={async () => {
        if (on && !window.confirm(`להשהות את ${label}? זה יפסיק את הרצת המודעות עד הפעלה מחדש.`))
          return;
        setBusy(true);
        try {
          await onFlip(on ? 'PAUSED' : 'ACTIVE');
        } finally {
          setBusy(false);
        }
      }}
      className={`relative h-7 w-12 shrink-0 rounded-full transition-colors ${
        on ? 'bg-emerald-500' : 'bg-ink-700'
      } disabled:opacity-60`}
    >
      <span
        className={`absolute top-0.5 grid h-6 w-6 place-items-center rounded-full bg-white shadow transition-all ${
          on ? 'start-[calc(100%-1.625rem)]' : 'start-0.5'
        }`}
      >
        {busy ? <SpinnerIcon className="h-3.5 w-3.5 animate-spin text-brand-500" /> : null}
      </span>
    </button>
  );
}

/** Budget input + save button; used for campaign and ad set budgets alike. */
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
    <label className="block text-xs font-semibold text-mist-500">
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
  );
}

/** One ad set's city-targeting editor: chips + search + save. */
function CitiesEditor({
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
    <div className="mt-2.5">
      <p className="text-xs font-semibold text-mist-500">📍 באילו ערים המודעות רצות</p>
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
                <span>+ {city.name}</span>
                <span className="text-xs text-mist-500">{city.region ?? ''}</span>
              </button>
            </li>
          ))}
        </ul>
      ) : null}
      {cities.length > 0 ? (
        <p className="mt-1.5 text-[11px] font-semibold text-mist-500">
          כל עיר כוללת רדיוס של ~17 ק״מ סביבה (המינימום של פייסבוק). הסרת כל הערים = חזרה לכל
          הארץ.
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

/** One ad row: thumbnail, name, and its own on/off switch. */
function AdRow({
  config,
  ad,
  onError,
  onChanged,
}: {
  config: FbAdsConfig;
  ad: AdInfo;
  onError: (message: string) => void;
  onChanged: () => void;
}) {
  return (
    <div className="flex items-center gap-2.5 border-t border-ink-700 py-2 first:border-t-0">
      {ad.thumbnailUrl ? (
        <img
          src={ad.thumbnailUrl}
          alt=""
          className="h-10 w-10 shrink-0 rounded-lg border border-ink-700 object-cover"
        />
      ) : (
        <span
          aria-hidden
          className="grid h-10 w-10 shrink-0 place-items-center rounded-lg border border-ink-700 bg-ink-850 text-base"
        >
          🖼️
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="truncate text-xs font-bold">{ad.name}</p>
        <p className="text-[11px] font-semibold text-mist-500">
          {isOn(ad.status) ? 'רצה עכשיו' : 'מושהית'}
        </p>
      </div>
      <StatusToggle
        status={ad.status}
        label={`המודעה "${ad.name}"`}
        onFlip={async (next) => {
          try {
            await setObjectStatus(config, ad.adId, next);
            onChanged();
          } catch (err) {
            onError(err instanceof Error ? err.message : 'שינוי הסטטוס נכשל.');
          }
        }}
      />
    </div>
  );
}

/**
 * The manage tab's campaign card: status switch, budget, and an expandable
 * drill-down into ad sets (budget + city targeting) and their ads (each
 * with its own switch) — the whole Ads Manager tree, phone-friendly.
 */
export function ManageCampaignCard({
  config,
  campaign,
  onChanged,
}: {
  config: FbAdsConfig;
  campaign: CampaignPerf;
  /** Called after any successful write so the caller re-fetches. */
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [adSets, setAdSets] = useState<AdSetTargeting[] | null>(null);
  const [adsBySet, setAdsBySet] = useState<Record<string, AdInfo[]>>({});
  const [error, setError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [copying, setCopying] = useState(false);

  const loadTree = useCallback(() => {
    setError(null);
    fetchAdSets(config, campaign.campaignId)
      .then(async (sets) => {
        setAdSets(sets);
        const pairs = await Promise.all(
          sets.map(async (s) => [s.adSetId, await fetchAds(config, s.adSetId)] as const),
        );
        setAdsBySet(Object.fromEntries(pairs));
      })
      .catch((err) => setError(err instanceof Error ? err.message : 'טעינת הקמפיין נכשלה.'));
  }, [config, campaign.campaignId]);

  useEffect(() => {
    if (open && !adSets) loadTree();
  }, [open, adSets, loadTree]);

  const afterWrite = (doneNotice: string) => {
    setNotice(doneNotice);
    loadTree();
    onChanged();
  };

  const cpl =
    campaign.d30.conversations > 0 ? campaign.d30.spend / campaign.d30.conversations : null;

  return (
    <div className="rounded-card border border-ink-700 surface p-3">
      <div className="flex items-center gap-2.5">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-extrabold">{campaign.name}</p>
          <p className="mt-0.5 text-[11px] font-semibold text-mist-500">
            {isOn(campaign.status) ? '🟢 פעיל' : '⚪ מושהה'}
            {campaign.dailyBudget !== null
              ? ` · ${formatSpend(campaign.dailyBudget, currency)}/יום`
              : ''}
          </p>
        </div>
        <StatusToggle
          status={campaign.status}
          label={`הקמפיין "${campaign.name}"`}
          onFlip={async (next) => {
            try {
              await setObjectStatus(config, campaign.campaignId, next);
              afterWrite(next === 'PAUSED' ? 'הקמפיין הושהה.' : 'הקמפיין הופעל.');
            } catch (err) {
              setError(err instanceof Error ? err.message : 'שינוי הסטטוס נכשל.');
            }
          }}
        />
      </div>

      <div className="mt-2 grid grid-cols-3 gap-2 border-t border-ink-700 pt-2 text-center">
        <div>
          <p className="text-sm font-extrabold tabular-nums">
            {formatSpend(campaign.d30.spend, currency)}
          </p>
          <p className="text-[11px] font-semibold text-mist-500">הוצאה · 30 יום</p>
        </div>
        <div>
          <p className="text-sm font-extrabold tabular-nums">
            {campaign.d30.conversations.toLocaleString('he-IL')}
          </p>
          <p className="text-[11px] font-semibold text-mist-500">פניות</p>
        </div>
        <div>
          <p className="text-sm font-extrabold tabular-nums">
            {cpl !== null ? formatSpend(cpl, currency) : '—'}
          </p>
          <p className="text-[11px] font-semibold text-mist-500">עלות לפנייה</p>
        </div>
      </div>

      <button
        type="button"
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
        className={`mt-2.5 w-full rounded-full border py-2 text-sm font-bold transition-colors ${
          open
            ? 'border-brand-500 bg-brand-500 text-on-brand'
            : 'border-ink-700 bg-ink-850 text-mist-300 hover:bg-ink-700'
        }`}
      >
        {open ? 'סגור עריכה ▴' : 'עריכה: תקציב · ערים · מודעות ▾'}
      </button>

      {open ? (
        <div className="mt-3 space-y-3">
          {campaign.dailyBudget !== null ? (
            <BudgetEditor
              label={`תקציב יומי לקמפיין (נוכחי: ${formatSpend(campaign.dailyBudget, currency)})`}
              current={campaign.dailyBudget}
              onSave={async (value) => {
                try {
                  await setCampaignBudget(config, campaign.campaignId, value);
                  afterWrite('התקציב עודכן.');
                } catch (err) {
                  setError(err instanceof Error ? err.message : 'עדכון התקציב נכשל.');
                }
              }}
            />
          ) : null}

          {!adSets && !error ? (
            <div className="grid place-items-center py-5">
              <SpinnerIcon className="h-5 w-5 animate-spin text-brand-500" />
            </div>
          ) : null}

          {adSets?.map((adSet) => {
            const ads = adsBySet[adSet.adSetId];
            return (
              <div key={adSet.adSetId} className="rounded-xl border border-ink-700 bg-ink-850/50 p-3">
                <div className="flex items-center gap-2.5">
                  <p className="min-w-0 flex-1 truncate text-xs font-bold text-mist-300">
                    🎯 {adSet.name}
                  </p>
                  <StatusToggle
                    status={adSet.status}
                    label={`קבוצת המודעות "${adSet.name}"`}
                    onFlip={async (next) => {
                      try {
                        await setObjectStatus(config, adSet.adSetId, next);
                        afterWrite(next === 'PAUSED' ? 'הקבוצה הושהתה.' : 'הקבוצה הופעלה.');
                      } catch (err) {
                        setError(err instanceof Error ? err.message : 'שינוי הסטטוס נכשל.');
                      }
                    }}
                  />
                </div>

                {adSet.dailyBudget !== null ? (
                  <div className="mt-2">
                    <BudgetEditor
                      label={`תקציב יומי (נוכחי: ${formatSpend(adSet.dailyBudget, currency)})`}
                      current={adSet.dailyBudget}
                      onSave={async (value) => {
                        try {
                          await setAdSetBudget(config, adSet.adSetId, value);
                          afterWrite('התקציב עודכן.');
                        } catch (err) {
                          setError(err instanceof Error ? err.message : 'עדכון התקציב נכשל.');
                        }
                      }}
                    />
                  </div>
                ) : null}

                <CitiesEditor
                  config={config}
                  adSet={adSet}
                  onError={setError}
                  onSaved={() => afterWrite('המיקוד הגאוגרפי נשמר.')}
                />

                {ads?.length ? (
                  <div className="mt-2.5">
                    <p className="text-xs font-semibold text-mist-500">🖼️ המודעות בקבוצה</p>
                    <div className="mt-1">
                      {ads.map((ad) => (
                        <AdRow
                          key={ad.adId}
                          config={config}
                          ad={ad}
                          onError={setError}
                          onChanged={() => afterWrite('סטטוס המודעה עודכן.')}
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
              </div>
            );
          })}

          <button
            type="button"
            disabled={copying}
            onClick={async () => {
              if (
                !window.confirm(
                  `לשכפל את "${campaign.name}"? ייווצר עותק מושהה של הקמפיין כולל המודעות — משנים לו תקציב וערים ואז מפעילים.`,
                )
              )
                return;
              setCopying(true);
              setError(null);
              try {
                await duplicateCampaign(config, campaign.campaignId, `${campaign.name} — עותק`);
                afterWrite('נוצר עותק מושהה של הקמפיין — הוא מופיע עכשיו ברשימה.');
              } catch (err) {
                setError(err instanceof Error ? err.message : 'השכפול נכשל.');
              } finally {
                setCopying(false);
              }
            }}
            className="w-full rounded-full border border-ink-700 bg-ink-850 py-2 text-sm font-bold text-mist-300 transition-colors hover:bg-ink-700 disabled:opacity-60"
          >
            {copying ? 'משכפל…' : '⧉ שכפל כקמפיין חדש'}
          </button>
        </div>
      ) : null}

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
