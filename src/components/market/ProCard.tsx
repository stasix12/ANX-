'use client';

import Link from 'next/link';
import { shekel } from '@/lib/market/config';
import type { ScoredPro } from '@/lib/market/matching';
import { LANGUAGES } from '@/lib/market/i18n';
import { Avatar, BadgeChip, Btn, Card, Stars } from './ui';

/** The full professional card the customer compares and books from. */
export function ProCard({
  scored,
  onBook,
  compact = false,
}: {
  scored: ScoredPro;
  onBook?: () => void;
  compact?: boolean;
}) {
  const { pro } = scored;
  const years = pro.yearsExperience;
  return (
    <Card className="p-4">
      <div className="flex items-start gap-3">
        <Link href={`/pro/${pro.slug}`} className="shrink-0">
          <Avatar name={pro.businessName || pro.fullName} photoUrl={pro.photoUrl} size={compact ? 44 : 56} />
        </Link>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
            <Link href={`/pro/${pro.slug}`} className="truncate font-black text-slate-900 hover:text-sky-700">
              {pro.businessName || pro.fullName}
            </Link>
            <Stars rating={pro.rating} />
            <span className="text-xs text-slate-400">({pro.reviewCount} ביקורות)</span>
          </div>
          <p className="mt-0.5 text-xs text-slate-500">
            {pro.jobCount} עבודות · {years > 0 ? `ותק ${years} שנים · ` : ''}
            {pro.city}
            {!scored.online && ' · לא זמין כעת'}
          </p>
          {!compact && (
            <div className="mt-1.5 flex flex-wrap gap-1">
              {pro.badges.slice(0, 3).map((b) => (
                <BadgeChip key={b} badge={b} />
              ))}
              {pro.languages.length > 1 && (
                <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
                  {pro.languages.map((l) => LANGUAGES.find((x) => x.id === l)?.label).join(' · ')}
                </span>
              )}
            </div>
          )}
        </div>
        <div className="flex flex-col items-end gap-1 text-end">
          <span className="text-lg font-black text-slate-900">{shekel(scored.priceAgorot)}</span>
          <span className="text-[11px] font-bold text-emerald-600">
            {scored.online ? `הגעה ~${scored.etaMinutes} דק'` : 'בתיאום מראש'}
          </span>
          <span className="text-[11px] text-slate-400">{scored.distanceKm} ק"מ</span>
        </div>
      </div>
      {onBook && (
        <div className="mt-3 flex gap-2">
          <Btn onClick={onBook} className="flex-1">
            הזמן
          </Btn>
          <Link
            href={`/pro/${pro.slug}`}
            className="rounded-xl border border-slate-300 px-4 py-2.5 text-sm font-bold text-slate-700 hover:border-sky-400"
          >
            לפרופיל ולתיק עבודות
          </Link>
        </div>
      )}
    </Card>
  );
}
