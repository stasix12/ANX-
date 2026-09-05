'use client';

import { useRouter } from 'next/navigation';
import { useMemo } from 'react';
import { ProCard } from '@/components/market/ProCard';
import { EmptyState } from '@/components/market/ui';
import { useCollection } from '@/lib/market/hooks';
import { scorePros } from '@/lib/market/matching';
import { useMarketSession } from '@/lib/market/session';

/** Saved pros — one-tap rebooking. */
export default function FavoritesPage() {
  const router = useRouter();
  const session = useMarketSession();
  const { rows: customers } = useCollection('customers');
  const { rows: pros } = useCollection('professionals');
  const { rows: availability } = useCollection('availability');
  const { rows: services } = useCollection('services');

  const me = customers.find((c) => c.id === session.customerId);
  const favorites = useMemo(() => {
    if (!me) return [];
    const favPros = pros.filter((p) => me.favorites.includes(p.id));
    const base = services.find((s) => s.id === 'sofa-cleaning')?.basePriceAgorot ?? 29900;
    return scorePros(
      { serviceId: 'sofa-cleaning', areaId: null, location: null, quoteLowAgorot: base, quoteHighAgorot: base, offeredProIds: [] },
      favPros,
      availability,
      base,
      { requireOnline: false },
    );
  }, [me, pros, availability, services]);

  return (
    <div className="mx-auto max-w-2xl px-4 py-6">
      <h1 className="mb-4 text-xl font-black text-slate-900">מועדפים</h1>
      {favorites.length === 0 && (
        <EmptyState icon="⭐" title="אין מועדפים עדיין" subtitle="אחרי עבודה מוצלחת אפשר לשמור את המקצוען ולהזמין אותו שוב בלחיצה" />
      )}
      <div className="space-y-3">
        {favorites.map((s) => (
          <ProCard
            key={s.pro.id}
            scored={s}
            onBook={() => router.push(`/market/book?service=${s.pro.services[0]?.serviceId ?? 'sofa-cleaning'}&pro=${s.pro.id}`)}
          />
        ))}
      </div>
    </div>
  );
}
