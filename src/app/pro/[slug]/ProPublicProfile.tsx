'use client';

import Link from 'next/link';
import { Avatar, BadgeChip, Btn, Card, EmptyState, Skeleton, Stars } from '@/components/market/ui';
import { market, shekel } from '@/lib/market/config';
import { LANGUAGES } from '@/lib/market/i18n';
import { useCollection } from '@/lib/market/hooks';

/** The public page a pro shares — gallery, reviews, prices, book-now. */
export function ProPublicProfile({ slug }: { slug: string }) {
  const { rows: pros, loading } = useCollection('professionals');
  const { rows: services } = useCollection('services');
  const { rows: areas } = useCollection('areas');
  const { rows: reviews } = useCollection('reviews');

  const pro = pros.find((p) => p.slug === slug);

  if (loading) {
    return (
      <div className="mx-auto max-w-2xl space-y-3 px-4 py-8" dir="rtl">
        <Skeleton className="h-32" />
        <Skeleton className="h-48" />
      </div>
    );
  }
  if (!pro || pro.status === 'blocked') {
    return (
      <div dir="rtl">
        <EmptyState icon="🤷" title="הפרופיל לא נמצא" />
      </div>
    );
  }

  const name = pro.businessName || pro.fullName;
  const proReviews = reviews
    .filter((r) => r.professionalId === pro.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  const defaultService = pro.services[0]?.serviceId ?? 'sofa-cleaning';

  return (
    <div className="relative z-10 min-h-dvh bg-slate-50 pb-28 font-sans text-slate-900" dir="rtl">
      <div className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-2xl items-center justify-between px-4 py-3">
          <Link href="/market" className="text-sm font-bold text-slate-500 hover:text-sky-700">→ {market.name}</Link>
          <Link href="/market/pros" className="text-sm font-bold text-sky-700 hover:underline">כל בעלי המקצוע</Link>
        </div>
      </div>

      <div className="mx-auto max-w-2xl space-y-4 px-4 py-6">
        <Card className="p-5">
          <div className="flex items-start gap-4">
            <Avatar name={name} photoUrl={pro.photoUrl} size={72} />
            <div className="flex-1">
              <h1 className="text-2xl font-black">{name}</h1>
              <p className="text-sm text-slate-500">{pro.city} · ותק {pro.yearsExperience} שנים · {pro.jobCount} עבודות</p>
              <div className="mt-1 flex items-center gap-2">
                <Stars rating={pro.rating} size="text-base" />
                <span className="text-xs text-slate-400">({pro.reviewCount} ביקורות)</span>
              </div>
            </div>
          </div>
          <div className="mt-3 flex flex-wrap gap-1.5">
            {pro.badges.map((b) => <BadgeChip key={b} badge={b} />)}
            <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] font-bold text-slate-600">
              {pro.languages.map((l) => LANGUAGES.find((x) => x.id === l)?.label).join(' · ')}
            </span>
          </div>
          {pro.bio && <p className="mt-3 text-sm leading-relaxed text-slate-600">{pro.bio}</p>}
        </Card>

        <Card className="p-5">
          <h2 className="font-black">שירותים ומחירים</h2>
          <ul className="mt-2 divide-y divide-slate-100">
            {pro.services.map((link) => {
              const s = services.find((x) => x.id === link.serviceId);
              if (!s) return null;
              return (
                <li key={link.serviceId} className="flex items-center justify-between py-2.5">
                  <span className="text-sm font-bold text-slate-700">{s.icon} {s.name}</span>
                  <span className="font-black">{shekel(link.priceAgorot ?? s.basePriceAgorot)}</span>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-slate-400">
            אזורי שירות: {pro.areaIds.map((id) => areas.find((a) => a.id === id)?.name ?? id).join(', ')} · רדיוס {pro.workRadiusKm} ק"מ
          </p>
        </Card>

        {pro.gallery.length > 0 && (
          <Card className="p-5">
            <h2 className="font-black">תיק עבודות</h2>
            <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-4">
              {pro.gallery.map((g, i) => (
                <figure key={i} className="relative">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={g.url} alt={g.caption ?? 'עבודה'} className="h-28 w-full rounded-xl object-cover" />
                  {g.kind && g.kind !== 'plain' && (
                    <figcaption className={`absolute bottom-1.5 start-1.5 rounded-full px-2 py-0.5 text-[10px] font-black text-white ${g.kind === 'before' ? 'bg-slate-700/90' : 'bg-emerald-600/90'}`}>
                      {g.kind === 'before' ? 'לפני' : 'אחרי'}
                    </figcaption>
                  )}
                </figure>
              ))}
            </div>
          </Card>
        )}

        <Card className="p-5">
          <h2 className="font-black">ביקורות ({proReviews.length})</h2>
          {proReviews.length === 0 && <p className="mt-2 text-sm text-slate-400">אין ביקורות עדיין</p>}
          <div className="mt-3 space-y-3">
            {proReviews.slice(0, 6).map((r) => (
              <div key={r.id} className="rounded-xl bg-slate-50 p-3">
                <div className="flex items-center justify-between">
                  <p className="text-sm font-black text-slate-800">{r.customerName}</p>
                  <Stars rating={(r.quality + r.punctuality + r.service + r.price) / 4} size="text-xs" />
                </div>
                {r.text && <p className="mt-1 text-sm text-slate-600">“{r.text}”</p>}
                <p className="mt-1 text-[10px] text-slate-400">{new Date(r.createdAt).toLocaleDateString('he-IL')} · הזמנה מאומתת ✓</p>
              </div>
            ))}
          </div>
        </Card>
      </div>

      {/* Sticky book-now */}
      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 p-3 backdrop-blur">
        <div className="mx-auto max-w-2xl">
          <Link href={`/market/book?service=${defaultService}&pro=${pro.id}`}>
            <Btn variant="success" className="w-full py-3.5 text-base">הזמן עכשיו את {name}</Btn>
          </Link>
        </div>
      </div>
    </div>
  );
}
