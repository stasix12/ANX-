'use client';

import Link from 'next/link';
import { useState } from 'react';
import { HqShell } from '@/components/platform/HqShell';
import { Badge, EmptyState, inputClass } from '@/components/platform/ui';
import { cityName, formatPrice, itemsLabel, relativeTimeHe, sourceLabel } from '@/lib/platform/catalog';
import { leadScore, leadTier, leadValue, TIER_META } from '@/lib/platform/scoring';
import { LEAD_STATUS_META, leadStatusMeta, OPEN_LEAD_STATUSES } from '@/lib/platform/stateMachine';
import { usePlatform, useSession } from '@/lib/platform/store';
import type { LeadStatus } from '@/lib/platform/types';

/** The sales pipeline: HOT leads float to the top, one tap into the lead. */

function LeadsBoard() {
  const snap = usePlatform();
  const session = useSession();
  const [filter, setFilter] = useState<LeadStatus | 'open' | 'all'>('open');
  const [query, setQuery] = useState('');
  const [onlyMine, setOnlyMine] = useState(false);

  if (!snap || !session) return null;

  const counts = new Map<string, number>();
  for (const l of snap.leads) counts.set(l.status, (counts.get(l.status) ?? 0) + 1);

  const q = query.trim();
  const leads = snap.leads
    .filter((l) =>
      filter === 'all' ? true : filter === 'open' ? OPEN_LEAD_STATUSES.includes(l.status) : l.status === filter,
    )
    .filter((l) => !onlyMine || l.agentId === session.userId)
    .filter(
      (l) =>
        q === '' ||
        l.name.includes(q) ||
        l.phone.includes(q) ||
        cityName(l.city).includes(q) ||
        l.address.includes(q),
    )
    .map((l) => ({ lead: l, score: leadScore(l) }))
    .sort((a, b) => b.score - a.score || b.lead.createdAt.localeCompare(a.lead.createdAt));

  return (
    <div className="crm-page">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-black text-mist-100">לידים</h1>
        <label className="flex items-center gap-2 text-sm font-bold text-mist-300">
          <input type="checkbox" checked={onlyMine} onChange={(e) => setOnlyMine(e.target.checked)} className="h-4 w-4 accent-brand-500" />
          רק שלי
        </label>
      </div>

      <input
        value={query}
        onChange={(e) => setQuery(e.target.value)}
        placeholder="חיפוש לפי שם, טלפון, עיר…"
        className={`${inputClass} mt-3`}
      />

      <div className="scrollbar-none -mx-4 mt-3 flex gap-1.5 overflow-x-auto px-4">
        {[
          { value: 'open' as const, label: `פתוחים (${snap.leads.filter((l) => OPEN_LEAD_STATUSES.includes(l.status)).length})` },
          { value: 'all' as const, label: 'הכול' },
          ...LEAD_STATUS_META.map((m) => ({
            value: m.value,
            label: `${m.label} (${counts.get(m.value) ?? 0})`,
          })),
        ].map((chip) => (
          <button
            key={chip.value}
            type="button"
            onClick={() => setFilter(chip.value)}
            aria-pressed={filter === chip.value}
            className={`shrink-0 rounded-full px-3.5 py-1.5 text-xs font-bold ${
              filter === chip.value ? 'bg-brand-500 text-on-brand' : 'surface text-mist-100'
            }`}
          >
            {chip.label}
          </button>
        ))}
      </div>

      {leads.length === 0 ? (
        <div className="mt-4">
          <EmptyState emoji="👥" title="אין לידים בסינון הזה" />
        </div>
      ) : (
        <div className="mt-4 space-y-2">
          {leads.map(({ lead, score }) => {
            const tier = leadTier(score);
            const status = leadStatusMeta(lead.status);
            const agent = snap.agents.find((a) => a.id === lead.agentId);
            const followupDue = lead.followupAt && new Date(lead.followupAt).getTime() <= Date.now();
            return (
              <Link key={lead.id} href={`/hq/leads/${lead.id}`} className="surface block rounded-card p-4">
                <div className="flex items-center justify-between gap-2">
                  <div className="flex items-center gap-2">
                    <Badge className={TIER_META[tier].badgeClass}>{TIER_META[tier].label}</Badge>
                    <span className="font-black text-mist-100">{lead.name}</span>
                  </div>
                  <Badge className={status.badgeClass}>{status.label}</Badge>
                </div>
                <div className="mt-1.5 text-sm text-mist-300">
                  {itemsLabel(lead.items)} · {cityName(lead.city)}
                </div>
                <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-mist-500">
                  <span>{sourceLabel(lead.source)}{lead.utm.campaign ? ` · ${lead.utm.campaign}` : ''}</span>
                  <span>שווי משוער: {formatPrice(leadValue(lead))}</span>
                  {lead.quotedPrice ? <span className="font-bold text-brand-400">הוצע: {formatPrice(lead.quotedPrice)}</span> : null}
                  {lead.photos.length > 0 && <span>📷 {lead.photos.length}</span>}
                  {agent && <span>נציג: {agent.name.split(' ')[0]}</span>}
                  <span>{relativeTimeHe(lead.createdAt)}</span>
                  {followupDue && <span className="font-black text-amber-600">⏰ Follow-up עכשיו!</span>}
                </div>
              </Link>
            );
          })}
        </div>
      )}
    </div>
  );
}

export default function LeadsPage() {
  return (
    <HqShell>
      <LeadsBoard />
    </HqShell>
  );
}
