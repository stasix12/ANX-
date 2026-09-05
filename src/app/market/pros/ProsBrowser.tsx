'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { MapCanvas } from '@/components/market/MapCanvas';
import { ProCard } from '@/components/market/ProCard';
import { EmptyState, Skeleton, inputClass } from '@/components/market/ui';
import { geocodeAddress } from '@/lib/market/geo';
import { useCollection } from '@/lib/market/hooks';
import { scorePros } from '@/lib/market/matching';

/**
 * "בחר בעל מקצוע" — the comparison path. Ranked by the same matching score
 * the auto-dispatch uses, so what the customer sees first is who the system
 * would have picked.
 */
export function ProsBrowser() {
  const router = useRouter();
  const params = useSearchParams();
  const { rows: services, loading } = useCollection('services');
  const { rows: areas } = useCollection('areas');
  const { rows: pros } = useCollection('professionals');
  const { rows: availability } = useCollection('availability');

  const [serviceId, setServiceId] = useState(params.get('service') ?? 'sofa-cleaning');
  const [address, setAddress] = useState(params.get('address') ?? 'באר שבע');
  const [onlyOnline, setOnlyOnline] = useState(false);
  const [view, setView] = useState<'list' | 'map'>('list');

  const service = services.find((s) => s.id === serviceId);

  const ranked = useMemo(() => {
    if (!service) return [];
    const { location, area } = geocodeAddress(address, areas);
    return scorePros(
      {
        serviceId,
        areaId: area?.id ?? null,
        location,
        quoteLowAgorot: service.basePriceAgorot,
        quoteHighAgorot: service.basePriceAgorot,
        offeredProIds: [],
      },
      pros,
      availability,
      service.basePriceAgorot,
      { requireOnline: onlyOnline },
    );
  }, [service, serviceId, address, areas, pros, availability, onlyOnline]);

  const center = useMemo(() => geocodeAddress(address, areas).location, [address, areas]);

  const book = (proId: string) => {
    router.push(`/market/book?service=${serviceId}&pro=${proId}&address=${encodeURIComponent(address)}`);
  };

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 px-4 py-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <Skeleton key={i} className="h-32" />
        ))}
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="text-xl font-black text-slate-900">בעלי מקצוע באזור שלך</h1>

      <div className="mt-3 flex flex-col gap-2 sm:flex-row">
        <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputClass} placeholder="עיר / כתובת" />
        <select value={serviceId} onChange={(e) => setServiceId(e.target.value)} className={`${inputClass} sm:w-48`}>
          {services.filter((s) => s.active && !s.comingSoon).map((s) => (
            <option key={s.id} value={s.id}>{s.name}</option>
          ))}
        </select>
      </div>

      <div className="mt-3 flex items-center justify-between">
        <label className="flex items-center gap-2 text-sm font-bold text-slate-600">
          <input type="checkbox" checked={onlyOnline} onChange={(e) => setOnlyOnline(e.target.checked)} className="h-4 w-4 accent-sky-600" />
          זמינים עכשיו בלבד
        </label>
        <div className="flex rounded-xl border border-slate-200 bg-white p-0.5 text-sm font-bold">
          {(['list', 'map'] as const).map((v) => (
            <button key={v} onClick={() => setView(v)} className={`rounded-lg px-3 py-1 ${view === v ? 'bg-sky-600 text-white' : 'text-slate-500'}`}>
              {v === 'list' ? 'רשימה' : 'מפה'}
            </button>
          ))}
        </div>
      </div>

      {view === 'map' && (
        <div className="mt-3">
          <MapCanvas
            center={center}
            spanKm={26}
            heightClass="h-80"
            pins={[
              { id: 'me', kind: 'customer', location: center },
              ...ranked.map((s) => ({
                id: s.pro.id,
                kind: 'pro' as const,
                online: s.online,
                label: s.pro.businessName || s.pro.fullName,
                location: availability.find((a) => a.professionalId === s.pro.id)?.location ?? s.pro.base,
              })),
            ]}
            onPinClick={book}
          />
          <p className="mt-2 text-center text-xs text-slate-400">מנקה יכול להגיע תוך 25–40 דקות ברוב האזורים הפעילים</p>
        </div>
      )}

      <div className="mt-4 space-y-3">
        {ranked.length === 0 && (
          <EmptyState icon="🔍" title="לא נמצאו בעלי מקצוע מתאימים" subtitle="נסו עיר אחרת, שירות אחר, או כבו את הסינון 'זמינים עכשיו'" />
        )}
        {ranked.map((s) => (
          <ProCard key={s.pro.id} scored={s} onBook={() => book(s.pro.id)} />
        ))}
      </div>
    </div>
  );
}
