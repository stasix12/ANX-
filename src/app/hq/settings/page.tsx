'use client';

import { useEffect, useState } from 'react';
import { HqShell, useIsAdmin } from '@/components/platform/HqShell';
import { btnPrimary, inputClass } from '@/components/platform/ui';
import { CATEGORIES, CITIES, formatPrice } from '@/lib/platform/catalog';
import { suggestFee } from '@/lib/platform/pricing';
import { uid, actions, usePlatform } from '@/lib/platform/store';
import type { DispatchWeights, PlatformConfig, PricingRule } from '@/lib/platform/types';

/**
 * The control room: pricing engine rules, price-decay ladder, dispatch waves
 * and weights, fee model default. Nothing in the engine is hardcoded — it
 * all reads from what this screen writes.
 */

const WEIGHT_LABELS: Record<keyof DispatchWeights, string> = {
  distance: 'מרחק',
  score: 'ציון איכות',
  completion: 'אחוז השלמה',
  cancellations: 'ביטולים',
  response: 'מהירות תגובה',
  recentLoad: 'איזון עומס',
  affinity: 'התאמה אישית',
};

function Settings() {
  const snap = usePlatform();
  const isAdmin = useIsAdmin();
  const [config, setConfig] = useState<PlatformConfig | null>(null);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    if (snap && !config) setConfig(structuredClone(snap.config));
  }, [snap, config]);

  if (!snap || !config) return null;
  if (!isAdmin) {
    return <p className="surface rounded-card p-6 text-mist-300">מסך זה זמין למנהלים בלבד.</p>;
  }

  const previewPrices = [300, 400, 600, 1000];

  const patchRule = (id: string, patch: Partial<PricingRule>) =>
    setConfig({
      ...config,
      pricingRules: config.pricingRules.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    });

  async function save() {
    await actions.updateConfig(config!);
    setSaved(true);
    setTimeout(() => setSaved(false), 2500);
  }

  return (
    <div className="crm-page pb-10">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-mist-100">הגדרות מנוע</h1>
        <button type="button" onClick={save} className={btnPrimary}>
          {saved ? '✓ נשמר' : 'שמירת הגדרות'}
        </button>
      </div>

      {/* Fee model default */}
      <section className="surface mt-4 rounded-card p-4">
        <h2 className="font-black text-mist-100">מודל ברירת מחדל למכירת עבודה</h2>
        <div className="mt-2 grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={config.defaultFeeModel === 'fee'}
            onClick={() => setConfig({ ...config, defaultFeeModel: 'fee' })}
            className={`rounded-xl p-3 text-start text-sm font-bold ${config.defaultFeeModel === 'fee' ? 'bg-brand-500 text-on-brand' : 'bg-ink-800 text-mist-100'}`}
          >
            A · Fee Model — המנקה משלם ולוקח
          </button>
          <button
            type="button"
            aria-pressed={config.defaultFeeModel === 'payout'}
            onClick={() => setConfig({ ...config, defaultFeeModel: 'payout' })}
            className={`rounded-xl p-3 text-start text-sm font-bold ${config.defaultFeeModel === 'payout' ? 'bg-brand-500 text-on-brand' : 'bg-ink-800 text-mist-100'}`}
          >
            B · Payout — החברה גובה ומשלמת ביצוע
          </button>
        </div>
      </section>

      {/* Pricing rules */}
      <section className="surface mt-4 rounded-card p-4">
        <h2 className="font-black text-mist-100">Pricing Engine — חוקי תמחור עבודה</h2>
        <div className="mt-3 space-y-3">
          {config.pricingRules
            .slice()
            .sort((a, b) => b.priority - a.priority)
            .map((rule) => (
              <div key={rule.id} className="rounded-xl bg-ink-900 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <input
                    value={rule.name}
                    onChange={(e) => patchRule(rule.id, { name: e.target.value })}
                    className="min-w-40 flex-1 rounded-lg bg-ink-850 px-2 py-1 text-sm font-bold text-mist-100"
                  />
                  <label className="flex items-center gap-1.5 text-xs font-bold text-mist-300">
                    <input
                      type="checkbox"
                      checked={rule.active}
                      onChange={(e) => patchRule(rule.id, { active: e.target.checked })}
                      className="h-4 w-4 accent-brand-500"
                    />
                    פעיל
                  </label>
                </div>
                <div className="mt-2 grid grid-cols-2 gap-2 sm:grid-cols-6">
                  <select
                    value={rule.mode}
                    onChange={(e) => patchRule(rule.id, { mode: e.target.value as PricingRule['mode'] })}
                    className="rounded-lg bg-ink-850 px-2 py-1.5 text-xs text-mist-100"
                  >
                    <option value="percent_range">טווח אחוזים</option>
                    <option value="percent">אחוז קבוע</option>
                    <option value="fixed">סכום קבוע</option>
                  </select>
                  {rule.mode === 'fixed' ? (
                    <label className="text-xs text-mist-500">
                      ₪
                      <input type="number" value={rule.amount} onChange={(e) => patchRule(rule.id, { amount: Number(e.target.value) })} className="w-full rounded-lg bg-ink-850 px-2 py-1 text-mist-100" />
                    </label>
                  ) : (
                    <>
                      <label className="text-xs text-mist-500">
                        % מינ׳
                        <input type="number" value={rule.percentMin} onChange={(e) => patchRule(rule.id, { percentMin: Number(e.target.value) })} className="w-full rounded-lg bg-ink-850 px-2 py-1 text-mist-100" />
                      </label>
                      {rule.mode === 'percent_range' && (
                        <label className="text-xs text-mist-500">
                          % מקס׳
                          <input type="number" value={rule.percentMax} onChange={(e) => patchRule(rule.id, { percentMax: Number(e.target.value) })} className="w-full rounded-lg bg-ink-850 px-2 py-1 text-mist-100" />
                        </label>
                      )}
                    </>
                  )}
                  <select
                    value={rule.categoryId ?? ''}
                    onChange={(e) => patchRule(rule.id, { categoryId: e.target.value || null })}
                    className="rounded-lg bg-ink-850 px-2 py-1.5 text-xs text-mist-100"
                  >
                    <option value="">כל קטגוריה</option>
                    {CATEGORIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <select
                    value={rule.city ?? ''}
                    onChange={(e) => patchRule(rule.id, { city: e.target.value || null })}
                    className="rounded-lg bg-ink-850 px-2 py-1.5 text-xs text-mist-100"
                  >
                    <option value="">כל עיר</option>
                    {CITIES.map((c) => (
                      <option key={c.id} value={c.id}>
                        {c.name}
                      </option>
                    ))}
                  </select>
                  <label className="text-xs text-mist-500">
                    עדיפות
                    <input type="number" value={rule.priority} onChange={(e) => patchRule(rule.id, { priority: Number(e.target.value) })} className="w-full rounded-lg bg-ink-850 px-2 py-1 text-mist-100" />
                  </label>
                </div>
              </div>
            ))}
        </div>
        <button
          type="button"
          onClick={() =>
            setConfig({
              ...config,
              pricingRules: [
                ...config.pricingRules,
                {
                  id: uid('rule'), name: 'חוק חדש', categoryId: null, city: null, urgent: null,
                  minCustomerPrice: null, maxCustomerPrice: null, mode: 'percent_range',
                  percentMin: 20, percentMax: 28, amount: 0, priority: 5, active: true,
                },
              ],
            })
          }
          className="mt-3 rounded-full bg-ink-800 px-4 py-2 text-sm font-bold text-mist-100"
        >
          + הוסף חוק
        </button>

        {/* Live preview */}
        <div className="mt-4 rounded-xl bg-brand-500/5 p-3">
          <div className="text-xs font-black text-brand-400">תצוגה חיה — מה המנוע יציע:</div>
          <div className="mt-1.5 grid grid-cols-2 gap-1.5 text-xs text-mist-100 sm:grid-cols-4">
            {previewPrices.map((p) => {
              const s = suggestFee(config.pricingRules, { customerPrice: p, categoryId: null, city: null, urgent: false });
              return (
                <span key={p} className="rounded-lg bg-ink-850 px-2 py-1.5 text-center">
                  עבודה {formatPrice(p)} → <b>{formatPrice(s.min)}–{formatPrice(s.max)}</b>
                </span>
              );
            })}
          </div>
        </div>
      </section>

      {/* Decay */}
      <section className="surface mt-4 rounded-card p-4">
        <h2 className="font-black text-mist-100">מנגנון מחיר יורד</h2>
        <div className="mt-2 space-y-2">
          {config.decay.steps.map((step, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-mist-300">
              אחרי
              <input
                type="number"
                value={step.afterMinutes}
                onChange={(e) => {
                  const steps = config.decay.steps.map((s, j) => (j === i ? { ...s, afterMinutes: Number(e.target.value) } : s));
                  setConfig({ ...config, decay: { ...config.decay, steps } });
                }}
                className="w-20 rounded-lg bg-ink-850 px-2 py-1 text-mist-100"
              />
              דקות → רדו ל-
              <input
                type="number"
                value={step.percentOfBase}
                onChange={(e) => {
                  const steps = config.decay.steps.map((s, j) => (j === i ? { ...s, percentOfBase: Number(e.target.value) } : s));
                  setConfig({ ...config, decay: { ...config.decay, steps } });
                }}
                className="w-20 rounded-lg bg-ink-850 px-2 py-1 text-mist-100"
              />
              % מהמחיר
            </div>
          ))}
          <div className="flex flex-wrap gap-4 pt-1 text-sm text-mist-300">
            <label>
              רצפה (%){' '}
              <input
                type="number"
                value={config.decay.floorPercent}
                onChange={(e) => setConfig({ ...config, decay: { ...config.decay, floorPercent: Number(e.target.value) } })}
                className="w-20 rounded-lg bg-ink-850 px-2 py-1 text-mist-100"
              />
            </label>
            <label>
              פתיחת URGENT (%){' '}
              <input
                type="number"
                value={config.decay.urgentStartPercent}
                onChange={(e) => setConfig({ ...config, decay: { ...config.decay, urgentStartPercent: Number(e.target.value) } })}
                className="w-20 rounded-lg bg-ink-850 px-2 py-1 text-mist-100"
              />
            </label>
          </div>
        </div>
      </section>

      {/* Dispatch */}
      <section className="surface mt-4 rounded-card p-4">
        <h2 className="font-black text-mist-100">Dispatch — גלים ומשקולות</h2>
        <div className="mt-2 space-y-2">
          {config.dispatch.waves.map((wave, i) => (
            <div key={i} className="flex items-center gap-2 text-sm text-mist-300">
              Wave {i + 1}: נפתח אחרי
              <input
                type="number"
                value={wave.afterSeconds}
                onChange={(e) => {
                  const waves = config.dispatch.waves.map((w, j) => (j === i ? { ...w, afterSeconds: Number(e.target.value) } : w));
                  setConfig({ ...config, dispatch: { ...config.dispatch, waves } });
                }}
                className="w-20 rounded-lg bg-ink-850 px-2 py-1 text-mist-100"
              />
              שניות · ל-
              <input
                type="number"
                value={wave.size}
                onChange={(e) => {
                  const waves = config.dispatch.waves.map((w, j) => (j === i ? { ...w, size: Number(e.target.value) } : w));
                  setConfig({ ...config, dispatch: { ...config.dispatch, waves } });
                }}
                className="w-20 rounded-lg bg-ink-850 px-2 py-1 text-mist-100"
              />
              מנקים (-1 = כולם)
            </div>
          ))}
        </div>
        <div className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
          {(Object.keys(config.dispatch.weights) as (keyof DispatchWeights)[]).map((k) => (
            <label key={k} className="text-xs font-bold text-mist-300">
              {WEIGHT_LABELS[k]} ({config.dispatch.weights[k]})
              <input
                type="range"
                min={0}
                max={40}
                value={config.dispatch.weights[k]}
                onChange={(e) =>
                  setConfig({
                    ...config,
                    dispatch: { ...config.dispatch, weights: { ...config.dispatch.weights, [k]: Number(e.target.value) } },
                  })
                }
                className="mt-1 w-full accent-brand-500"
              />
            </label>
          ))}
        </div>
        <div className="mt-3 flex flex-wrap gap-4 text-sm text-mist-300">
          <label>
            סף URGENT (דקות לפני חלון){' '}
            <input
              type="number"
              value={config.dispatch.urgentThresholdMinutes}
              onChange={(e) => setConfig({ ...config, dispatch: { ...config.dispatch, urgentThresholdMinutes: Number(e.target.value) } })}
              className="w-24 rounded-lg bg-ink-850 px-2 py-1 text-mist-100"
            />
          </label>
          <label>
            Minimum Balance (₪){' '}
            <input
              type="number"
              value={config.dispatch.minBalance}
              onChange={(e) => setConfig({ ...config, dispatch: { ...config.dispatch, minBalance: Number(e.target.value) } })}
              className="w-24 rounded-lg bg-ink-850 px-2 py-1 text-mist-100"
            />
          </label>
          <label>
            Re-activation (חודשים){' '}
            <input
              type="number"
              value={config.reactivationMonths}
              onChange={(e) => setConfig({ ...config, reactivationMonths: Number(e.target.value) })}
              className="w-24 rounded-lg bg-ink-850 px-2 py-1 text-mist-100"
            />
          </label>
        </div>
      </section>

      <button type="button" onClick={save} className={`${btnPrimary} mt-5 w-full py-4`}>
        {saved ? '✓ ההגדרות נשמרו' : 'שמירת כל ההגדרות'}
      </button>
      <p className="sr-only" aria-live="polite">{saved ? 'ההגדרות נשמרו' : ''}</p>
    </div>
  );
}

export default function SettingsPage() {
  return (
    <HqShell>
      <Settings />
    </HqShell>
  );
}
