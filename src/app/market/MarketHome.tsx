'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { useLang } from '@/components/market/LanguageProvider';
import { MapCanvas } from '@/components/market/MapCanvas';
import { Btn, Card, EmptyState, Sheet, Skeleton, Stars, inputClass } from '@/components/market/ui';
import { trackEvent } from '@/lib/market/analytics';
import { shekel } from '@/lib/market/config';
import { areaForPoint, geocodeAddress } from '@/lib/market/geo';
import { useCollection } from '@/lib/market/hooks';
import { getStore, nowIso, uid } from '@/lib/market/store';
import type { Service, ServiceArea } from '@/lib/market/types';

/**
 * The customer landing: address → service → straight into the booking
 * wizard. The primary CTA path never forces choosing a pro — "מצא לי מנקה"
 * does the matching; comparison shoppers can switch to the pros list.
 */
export function MarketHome() {
  const router = useRouter();
  const { t } = useLang();
  const { rows: services, loading: servicesLoading } = useCollection('services');
  const { rows: areas } = useCollection('areas');
  const { rows: pros } = useCollection('professionals');
  const { rows: availability } = useCollection('availability');
  const { rows: reviews } = useCollection('reviews');

  const [address, setAddress] = useState('');
  const [waitlistArea, setWaitlistArea] = useState<ServiceArea | null>(null);

  useEffect(() => trackEvent('LandingViewed'), []);

  const resolved = useMemo(() => {
    if (address.trim().length < 2) return null;
    return geocodeAddress(address, areas);
  }, [address, areas]);
  const area = resolved?.area ?? null;

  const onlinePros = useMemo(() => {
    const online = new Set(availability.filter((a) => a.online).map((a) => a.professionalId));
    return pros.filter(
      (p) =>
        p.status === 'active' &&
        online.has(p.id) &&
        (!area || p.areaIds.includes(area.id)),
    );
  }, [pros, availability, area]);

  const useMyLocation = () => {
    if (!navigator.geolocation) return;
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const point = { lat: pos.coords.latitude, lng: pos.coords.longitude };
        const nearest = areaForPoint(point, areas) ?? areas[0];
        if (nearest) {
          setAddress(nearest.name);
          trackEvent('LocationSelected', { area: nearest.id, via: 'gps' });
        }
      },
      // The demo sandbox has no GPS — fall back to the launch city.
      () => setAddress('באר שבע'),
    );
  };

  const pickService = (service: Service) => {
    if (service.comingSoon) return;
    trackEvent('ServiceSelected', { serviceId: service.id });
    if (area?.waitlistOnly) {
      setWaitlistArea(area);
      return;
    }
    const query = new URLSearchParams({ service: service.id });
    if (address.trim()) query.set('address', address.trim());
    router.push(`/market/book?${query.toString()}`);
  };

  const latestReviews = [...reviews].sort((a, b) => b.createdAt.localeCompare(a.createdAt)).slice(0, 3);

  return (
    <div className="mx-auto max-w-5xl px-4">
      {/* Hero */}
      <section className="pt-8 text-center sm:pt-14">
        <h1 className="text-3xl font-black leading-tight text-slate-900 sm:text-5xl">
          {t('heroTitle')}
          <span className="mt-1 block bg-gradient-to-l from-sky-600 to-emerald-500 bg-clip-text text-transparent">
            {t('heroSubtitle')}
          </span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-sm text-slate-500 sm:text-base">
          מחיר מראש · בעלי מקצוע מאומתים · מעקב חי כמו באפליקציות המשלוחים
        </p>

        <div className="mx-auto mt-6 flex max-w-xl flex-col gap-2 sm:flex-row">
          <input
            value={address}
            onChange={(e) => {
              setAddress(e.target.value);
              if (e.target.value.trim().length > 1) trackEvent('LocationSelected', { via: 'typed' });
            }}
            placeholder={t('addressPlaceholder')}
            list="market-cities"
            className={`${inputClass} py-3.5 text-base shadow-sm`}
          />
          <datalist id="market-cities">
            {areas.filter((a) => a.active).map((a) => (
              <option key={a.id} value={a.name} />
            ))}
          </datalist>
          <Btn variant="secondary" onClick={useMyLocation} className="whitespace-nowrap py-3.5">
            📍 {t('useMyLocation')}
          </Btn>
        </div>

        {area && !area.waitlistOnly && (
          <p className="mt-3 text-sm font-bold text-emerald-600">
            ✓ אנחנו פעילים ב{area.name} — {onlinePros.length} מקצוענים זמינים עכשיו
          </p>
        )}
        {area?.waitlistOnly && (
          <p className="mt-3 text-sm font-bold text-amber-600">
            אנחנו מגיעים בקרוב ל{area.name} —{' '}
            <button className="underline" onClick={() => setWaitlistArea(area)}>
              הצטרפו לרשימת ההמתנה
            </button>
          </p>
        )}
      </section>

      {/* Services */}
      <section className="mt-10">
        <h2 className="mb-3 text-lg font-black text-slate-900">{t('chooseService')}</h2>
        {servicesLoading ? (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-32" />
            ))}
          </div>
        ) : (
          <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 md:grid-cols-4">
            {[...services]
              .filter((s) => s.active)
              .sort((a, b) => Number(a.comingSoon) - Number(b.comingSoon))
              .map((service) => (
                <Card
                  key={service.id}
                  onClick={() => pickService(service)}
                  className={`relative p-4 text-center ${service.comingSoon ? 'opacity-60' : ''}`}
                >
                  {service.comingSoon && (
                    <span className="absolute end-2 top-2 rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-bold text-slate-500">
                      {t('comingSoon')}
                    </span>
                  )}
                  <span className="text-4xl">{service.icon}</span>
                  <p className="mt-2 font-black text-slate-900">{service.name}</p>
                  <p className="mt-1 line-clamp-2 text-[11px] leading-snug text-slate-400">{service.description}</p>
                  <p className="mt-2 text-sm font-black text-sky-700">
                    {t('from')}
                    {shekel(service.basePriceAgorot)}
                  </p>
                </Card>
              ))}
          </div>
        )}
      </section>

      {/* Live map preview */}
      {area && !area.waitlistOnly && (
        <section className="mt-10">
          <div className="mb-3 flex items-center justify-between">
            <h2 className="text-lg font-black text-slate-900">מקצוענים סביבך עכשיו</h2>
            <Link href="/market/pros" className="text-sm font-bold text-sky-700 hover:underline">
              לכל בעלי המקצוע ←
            </Link>
          </div>
          <MapCanvas
            center={resolved?.location ?? area.center}
            spanKm={area.radiusKm * 2.2}
            pins={[
              { id: 'me', kind: 'customer', location: resolved?.location ?? area.center },
              ...onlinePros.map((p) => ({
                id: p.id,
                kind: 'pro' as const,
                online: true,
                label: p.businessName || p.fullName,
                location: availability.find((a) => a.professionalId === p.id)?.location ?? p.base,
              })),
            ]}
            onPinClick={() => router.push('/market/pros')}
          />
          {onlinePros.length === 0 && (
            <EmptyState icon="🕐" title="כרגע אין מנקה זמין באזור" subtitle="אפשר לקבל הצעות מחיר או לקבוע למועד אחר — בוחרים שירות וממשיכים" />
          )}
        </section>
      )}

      {/* Social proof */}
      {latestReviews.length > 0 && (
        <section className="mt-10">
          <h2 className="mb-3 text-lg font-black text-slate-900">לקוחות מספרים</h2>
          <div className="grid gap-3 md:grid-cols-3">
            {latestReviews.map((r) => (
              <Card key={r.id} className="p-4">
                <div className="flex items-center justify-between">
                  <p className="font-bold text-slate-800">{r.customerName}</p>
                  <Stars rating={(r.quality + r.punctuality + r.service + r.price) / 4} />
                </div>
                <p className="mt-2 text-sm leading-relaxed text-slate-600">“{r.text}”</p>
              </Card>
            ))}
          </div>
        </section>
      )}

      {/* Referral + pro CTA */}
      <section className="mb-10 mt-10 grid gap-3 md:grid-cols-2">
        <Card className="bg-gradient-to-l from-sky-50 to-white p-5">
          <p className="font-black text-slate-900">חבר מביא חבר 🎁</p>
          <p className="mt-1 text-sm text-slate-500">
            הזמינו חברים וקבלו 30 ₪ קרדיט על כל חבר שמבצע הזמנה ראשונה.
          </p>
          <Link href="/market/profile" className="mt-3 inline-block text-sm font-bold text-sky-700 hover:underline">
            לקוד ההזמנה שלי ←
          </Link>
        </Card>
        <Card className="bg-gradient-to-l from-emerald-50 to-white p-5">
          <p className="font-black text-slate-900">בעלי מקצוע — תנו לעבודות למצוא אתכם 🧽</p>
          <p className="mt-1 text-sm text-slate-500">
            הצטרפו לפלטפורמה, קבלו התראות על עבודות באזור שלכם וגדלו בלי לשלם על פרסום.
          </p>
          <Link href="/pro" className="mt-3 inline-block text-sm font-bold text-emerald-700 hover:underline">
            הצטרפות כבעל מקצוע ←
          </Link>
        </Card>
      </section>

      {waitlistArea && (
        <WaitlistSheet area={waitlistArea} onClose={() => setWaitlistArea(null)} />
      )}
    </div>
  );
}

function WaitlistSheet({ area, onClose }: { area: ServiceArea; onClose: () => void }) {
  const [phone, setPhone] = useState('');
  const [sent, setSent] = useState(false);
  const join = async () => {
    if (phone.trim().length < 8) return;
    await getStore().put('waitlist', {
      id: uid(),
      phone: phone.trim(),
      areaName: area.name,
      serviceId: null,
      createdAt: nowIso(),
    });
    setSent(true);
  };
  return (
    <Sheet title={`אנחנו מגיעים בקרוב ל${area.name}`} onClose={onClose}>
      {sent ? (
        <EmptyState icon="💌" title="נרשמת!" subtitle="נודיע לך ברגע שנשיק את השירות באזור שלך" />
      ) : (
        <div className="space-y-3">
          <p className="text-sm text-slate-500">
            עדיין אין לנו מספיק בעלי מקצוע ב{area.name}. השאירו טלפון ונעדכן ברגע שאפשר להזמין.
          </p>
          <input
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
            placeholder="מספר טלפון"
            type="tel"
            className={inputClass}
          />
          <Btn onClick={() => void join()} className="w-full">
            עדכנו אותי
          </Btn>
        </div>
      )}
    </Sheet>
  );
}
