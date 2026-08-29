'use client';

import Link from 'next/link';
import { useCallback, useState } from 'react';
import { CrmShell } from '@/components/crm/CrmShell';
import {
  CAMPAIGN_BLUEPRINT,
  type AdSetPlan,
  type CreativePlan,
} from '@/lib/crm/campaignBlueprint';

const plan = CAMPAIGN_BLUEPRINT;

function CopyButton({ text, label = 'העתקה' }: { text: string; label?: string }) {
  const [copied, setCopied] = useState(false);
  const copy = useCallback(() => {
    navigator.clipboard
      .writeText(text)
      .then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
      })
      .catch(() => {});
  }, [text]);
  return (
    <button
      type="button"
      onClick={copy}
      className={`shrink-0 rounded-full px-3 py-1.5 text-xs font-bold transition-colors ${
        copied
          ? 'bg-emerald-500/15 text-emerald-600'
          : 'bg-brand-500 text-on-brand hover:bg-brand-400'
      }`}
    >
      {copied ? '✓ הועתק' : `📋 ${label}`}
    </button>
  );
}

function SectionTitle({ emoji, children }: { emoji: string; children: React.ReactNode }) {
  return (
    <h2 className="mt-5 text-sm font-extrabold">
      <span aria-hidden>{emoji}</span> {children}
    </h2>
  );
}

function CreativeCard({ creative }: { creative: CreativePlan }) {
  const [briefOpen, setBriefOpen] = useState(false);
  return (
    <div className="rounded-card border border-ink-700 surface p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-extrabold leading-snug">
          <span aria-hidden>{creative.emoji}</span> {creative.name}
        </p>
        <span className="shrink-0 rounded-full bg-ink-700 px-2 py-0.5 text-[11px] font-bold text-mist-300">
          {creative.format}
        </span>
      </div>
      <p className="mt-1.5 text-xs leading-relaxed text-mist-500">{creative.inspiration}</p>

      <div className="mt-2.5 rounded-lg border border-ink-700 bg-ink-950/40 p-2.5">
        <div className="flex items-start justify-between gap-2">
          <p className="text-[11px] font-bold text-mist-500">טקסט המודעה</p>
          <CopyButton text={creative.primaryText} />
        </div>
        <p className="mt-1.5 whitespace-pre-line text-sm leading-relaxed">{creative.primaryText}</p>
      </div>

      <div className="mt-2 grid gap-2 sm:grid-cols-2">
        <div className="flex items-center justify-between gap-2 rounded-lg border border-ink-700 p-2.5">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-mist-500">כותרת</p>
            <p className="truncate text-sm font-semibold">{creative.headline}</p>
          </div>
          <CopyButton text={creative.headline} />
        </div>
        <div className="flex items-center justify-between gap-2 rounded-lg border border-ink-700 p-2.5">
          <div className="min-w-0">
            <p className="text-[11px] font-bold text-mist-500">תיאור + כפתור</p>
            <p className="truncate text-sm font-semibold">
              {creative.description} · {creative.cta}
            </p>
          </div>
          <CopyButton text={creative.description} />
        </div>
      </div>

      <button
        type="button"
        onClick={() => setBriefOpen((v) => !v)}
        className="mt-2 text-xs font-bold text-brand-400"
      >
        {briefOpen ? '▲ הסתרת בריף הצילום' : '▼ בריף צילום — איך מפיקים את זה'}
      </button>
      {briefOpen ? (
        <ul className="mt-1.5 space-y-1">
          {creative.shotList.map((shot) => (
            <li key={shot} className="flex gap-1.5 text-xs leading-relaxed text-mist-300">
              <span aria-hidden className="shrink-0">
                🎬
              </span>
              <span>{shot}</span>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

function AdSetCard({ adSet }: { adSet: AdSetPlan }) {
  const creativeNames = adSet.creativeIds
    .map((id) => plan.creatives.find((c) => c.id === id))
    .filter(Boolean)
    .map((c) => `${c!.emoji} ${c!.name}`);
  return (
    <div className="rounded-card border border-ink-700 surface p-3">
      <div className="flex items-start justify-between gap-2">
        <p className="text-sm font-extrabold">
          <span aria-hidden>{adSet.emoji}</span> {adSet.name}
        </p>
        <span className="shrink-0 rounded-full bg-brand-500/15 px-2 py-0.5 text-[11px] font-bold text-brand-400">
          {plan.currencySymbol}
          {adSet.dailyBudget}/יום
        </span>
      </div>
      <dl className="mt-2 space-y-1.5 text-xs leading-relaxed">
        <div>
          <dt className="font-bold text-mist-500">קהל</dt>
          {adSet.audience.map((line) => (
            <dd key={line} className="text-mist-300">
              · {line}
            </dd>
          ))}
        </div>
        <div>
          <dt className="font-bold text-mist-500">אזור</dt>
          {adSet.geo.map((line) => (
            <dd key={line} className="text-mist-300">
              · {line}
            </dd>
          ))}
        </div>
        <div>
          <dt className="font-bold text-mist-500">מודעות</dt>
          <dd className="text-mist-300">{creativeNames.join(' · ')}</dd>
        </div>
      </dl>
      <p className="mt-2 border-t border-ink-700 pt-2 text-xs leading-relaxed text-mist-500">
        💡 {adSet.notes}
      </p>
    </div>
  );
}

export default function CrmAdsCampaignPage() {
  return (
    <CrmShell title="קמפיין באר שבע">
      <div className="rounded-card border border-brand-500/50 surface p-4">
        <p className="text-base font-extrabold">🛋️ {plan.name}</p>
        <p className="mt-1 text-sm leading-relaxed text-mist-300">
          קמפיין מוכן להשקה, בנוי על מה שמוכח בשוק הרוסי — השוק הגדול והתחרותי בעולם בניקוי
          ספות עד הבית. כל הטקסטים כאן בהעתק‑הדבק לאד‑מנג׳ר.
        </p>
        <div className="mt-3 grid grid-cols-3 gap-2 border-t border-ink-700 pt-3 text-center">
          <div>
            <p className="text-sm font-extrabold text-blue-700">{plan.objective}</p>
            <p className="mt-0.5 text-[11px] font-semibold text-mist-500">מטרת הקמפיין</p>
          </div>
          <div>
            <p className="text-sm font-extrabold tabular-nums text-blue-700">
              {plan.currencySymbol}
              {plan.totalDailyBudget}/יום
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-mist-500">תקציב פתיחה</p>
          </div>
          <div>
            <p className="text-sm font-extrabold tabular-nums text-blue-700">
              עד {plan.currencySymbol}
              {plan.cplTargets.good}
            </p>
            <p className="mt-0.5 text-[11px] font-semibold text-mist-500">יעד עלות לפנייה</p>
          </div>
        </div>
        <p className="mt-2 text-xs leading-relaxed text-mist-500">{plan.objectiveWhy}</p>
      </div>

      <SectionTitle emoji="🇷🇺">מה עובד ברוסיה — ולמה זה יעבוד גם כאן</SectionTitle>
      <ul className="mt-2 space-y-2">
        {plan.russianPlaybook.map((item) => (
          <li key={item.title} className="rounded-card border border-ink-700 surface p-3">
            <p className="text-sm font-extrabold">
              <span aria-hidden>{item.emoji}</span> {item.title}
            </p>
            <p className="mt-1 text-xs leading-relaxed text-mist-300">{item.detail}</p>
          </li>
        ))}
      </ul>

      <SectionTitle emoji="📍">איפה מפרסמים</SectionTitle>
      <div className="mt-2 rounded-card border border-ink-700 surface p-3">
        <p className="text-xs leading-relaxed text-mist-300">{plan.geoSummary}</p>
        <div className="mt-2 flex items-start justify-between gap-2">
          <p className="text-sm font-semibold leading-relaxed">{plan.cities.join(' · ')}</p>
          <CopyButton text={plan.cities.join(', ')} label="ערים" />
        </div>
      </div>

      <SectionTitle emoji="🧩">מבנה הקמפיין</SectionTitle>
      <div className="mt-2 space-y-2">
        {plan.adSets.map((adSet) => (
          <AdSetCard key={adSet.id} adSet={adSet} />
        ))}
      </div>

      <SectionTitle emoji="📝">המודעות — מוכנות להעתקה</SectionTitle>
      <div className="mt-2 space-y-3">
        {plan.creatives.map((creative) => (
          <CreativeCard key={creative.id} creative={creative} />
        ))}
      </div>

      <SectionTitle emoji="🚀">צ׳קליסט השקה</SectionTitle>
      <ol className="mt-2 space-y-2">
        {plan.launchChecklist.map((step, i) => (
          <li key={step} className="flex gap-2 rounded-card border border-ink-700 surface p-3 text-sm leading-relaxed">
            <span className="shrink-0 font-extrabold text-brand-400">{i + 1}.</span>
            <span>{step}</span>
          </li>
        ))}
      </ol>

      <SectionTitle emoji="🗓️">הניהול השוטף — הלופ השבועי</SectionTitle>
      <ul className="mt-2 space-y-2">
        {plan.weeklyRoutine.map((step) => (
          <li key={step} className="flex gap-2 rounded-card border border-ink-700 surface p-3 text-sm leading-relaxed">
            <span aria-hidden className="shrink-0">
              🔄
            </span>
            <span>{step}</span>
          </li>
        ))}
      </ul>

      <Link
        href="/crm/ads/optimize"
        className="mt-4 flex items-center justify-center gap-2 rounded-full bg-brand-500 py-2.5 text-sm font-bold text-on-brand transition-colors hover:bg-brand-400"
      >
        🎛️ לאופטימיזציית הקמפיינים — ההמלצות מתעדכנות אוטומטית
      </Link>

      <p className="mt-3 text-xs font-semibold leading-relaxed text-mist-500">
        💡 אחרי ההשקה, עמוד האופטימיזציה קורא את הביצועים מפייסבוק ומתרגם אותם לצעד השבועי —
        זה מנוע הניהול השוטף של הקמפיין הזה.
      </p>
    </CrmShell>
  );
}
