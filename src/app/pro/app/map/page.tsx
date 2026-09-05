'use client';

import { MapCanvas } from '@/components/market/MapCanvas';
import { Card, EmptyState } from '@/components/market/ui';
import { useCollection } from '@/lib/market/hooks';
import { useMarketSession } from '@/lib/market/session';

/** The pro's day on a map: their base + every open job pin. */
export default function ProMapPage() {
  const session = useMarketSession();
  const proId = session.activeProId;
  const { rows: pros } = useCollection('professionals');
  const { rows: bookings } = useCollection('bookings');

  const pro = pros.find((p) => p.id === proId);
  if (!pro) return null;

  const jobs = bookings.filter(
    (b) => b.professionalId === proId && b.location && ['accepted', 'en_route', 'arrived', 'in_progress'].includes(b.status),
  );

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="mb-3 text-xl font-black">מפת העבודות</h1>
      <MapCanvas
        center={pro.base}
        spanKm={Math.max(14, pro.workRadiusKm * 1.6)}
        heightClass="h-[26rem]"
        pins={[
          { id: 'base', kind: 'pro', online: true, label: 'הבסיס שלי', location: pro.base },
          ...jobs.map((b) => ({ id: b.id, kind: 'job' as const, label: b.address, location: b.location! })),
        ]}
      />
      {jobs.length === 0 ? (
        <EmptyState icon="🗺️" title="אין עבודות פתוחות על המפה" />
      ) : (
        <Card className="mt-3 p-4 text-sm text-slate-600">
          {jobs.length} עבודות פתוחות · אזורי העבודה שלך: {pro.areaIds.join(', ')} · רדיוס {pro.workRadiusKm} ק"מ
        </Card>
      )}
    </div>
  );
}
