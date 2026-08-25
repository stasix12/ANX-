'use client';

import { useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { CrmShell } from '@/components/crm/CrmShell';
import { LeadCard } from '@/components/crm/LeadCard';
import { SearchIcon, SpinnerIcon } from '@/components/icons';
import { STATUS_OPTIONS, type LeadStatus } from '@/lib/crm/leads';
import { useLeads } from '@/lib/crm/useLeads';

function LeadsList() {
  const { leads, loading, error } = useLeads();
  const searchParams = useSearchParams();
  const initialStatus = searchParams.get('status') as LeadStatus | null;

  const [query, setQuery] = useState('');
  const [status, setStatus] = useState<LeadStatus | 'all'>(
    initialStatus && STATUS_OPTIONS.some((s) => s.value === initialStatus) ? initialStatus : 'all',
  );

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return leads.filter((lead) => {
      if (status !== 'all' && lead.status !== status) return false;
      if (!needle) return true;
      return [lead.name, lead.phone, lead.address, lead.city]
        .some((field) => field.toLowerCase().includes(needle));
    });
  }, [leads, query, status]);

  return (
    <>
      <div className="relative">
        <SearchIcon className="pointer-events-none absolute start-4 top-1/2 h-5 w-5 -translate-y-1/2 text-mist-500" />
        <input
          type="search"
          placeholder="חיפוש לפי שם, טלפון, כתובת או עיר…"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          className="w-full rounded-full border border-ink-600 bg-ink-850 py-3.5 pe-4 ps-12 text-base outline-none transition-colors focus:border-brand-500"
        />
      </div>

      <div className="mt-3 flex gap-2 overflow-x-auto pb-1" role="group" aria-label="סינון לפי סטטוס">
        {[{ value: 'all' as const, label: 'הכל' }, ...STATUS_OPTIONS].map((option) => {
          const selected = status === option.value;
          return (
            <button
              key={option.value}
              type="button"
              aria-pressed={selected}
              onClick={() => setStatus(option.value)}
              className={`shrink-0 rounded-full border px-4 py-2 text-sm font-semibold transition-colors ${
                selected
                  ? 'border-brand-500 bg-brand-500 text-on-brand'
                  : 'border-ink-600 bg-ink-850 text-mist-300 hover:border-ink-500'
              }`}
            >
              {option.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <div className="grid place-items-center py-20">
          <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      ) : error ? (
        <p role="alert" className="mt-4 rounded-card bg-red-600/10 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      ) : filtered.length === 0 ? (
        <p className="mt-8 text-center text-sm font-semibold text-mist-500">
          {leads.length === 0 ? 'עדיין אין לידים — הוסיפו את הראשון בכפתור ליד חדש.' : 'לא נמצאו תוצאות.'}
        </p>
      ) : (
        <div className="mt-4 space-y-3">
          {filtered.map((lead) => (
            <LeadCard key={lead.id} lead={lead} showDate />
          ))}
        </div>
      )}
    </>
  );
}

export default function CrmLeadsPage() {
  return (
    <CrmShell title="לקוחות ולידים">
      {/* useSearchParams requires a Suspense boundary around the reading component. */}
      <Suspense fallback={null}>
        <LeadsList />
      </Suspense>
    </CrmShell>
  );
}
