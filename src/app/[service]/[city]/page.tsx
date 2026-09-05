import type { Metadata } from 'next';
import Link from 'next/link';
import { notFound } from 'next/navigation';
import { market, shekel } from '@/lib/market/config';
import { DEMO_PROS, DEMO_REVIEWS } from '@/lib/market/demoData';
import { DEFAULT_AREAS } from '@/lib/market/geo';
import { DEFAULT_SERVICES } from '@/lib/market/services';

/**
 * SEO landing pages: one per service × city (/sofa-cleaning/beer-sheva,
 * /mattress-cleaning/arad, …), statically generated with Schema.org markup,
 * FAQ and real review content, funnelling into the booking wizard. New
 * combinations appear automatically when services/areas are added.
 */

interface PageProps {
  params: Promise<{ service: string; city: string }>;
}

const bookableServices = DEFAULT_SERVICES.filter((s) => s.active);
const cities = DEFAULT_AREAS.filter((a) => a.active);

export function generateStaticParams() {
  return bookableServices.flatMap((service) =>
    cities.map((city) => ({ service: service.id, city: city.id })),
  );
}

/** Unknown two-segment URLs must 404, not render an empty template. */
export const dynamicParams = false;

function resolve(serviceId: string, cityId: string) {
  const service = bookableServices.find((s) => s.id === serviceId);
  const city = cities.find((c) => c.id === cityId);
  return service && city ? { service, city } : null;
}

export async function generateMetadata({ params }: PageProps): Promise<Metadata> {
  const { service: serviceId, city: cityId } = await params;
  const match = resolve(serviceId, cityId);
  if (!match) return {};
  const { service, city } = match;
  return {
    title: `${service.name} ב${city.name} — מחיר מיידי והזמנה תוך דקות`,
    description: `${service.name} ב${city.name} החל מ-${shekel(service.basePriceAgorot)}: בעלי מקצוע מאומתים עם דירוגים אמיתיים, מחיר סגור מראש ומעקב חי. הזמינו עכשיו ב${market.name}.`,
    alternates: { canonical: `/${service.id}/${city.id}` },
    openGraph: {
      type: 'website',
      locale: 'he_IL',
      title: `${service.name} ב${city.name} | ${market.name}`,
      description: `מקצועני ${service.name} זמינים ב${city.name} — מחיר מראש, דירוגים, הגעה מהירה.`,
    },
  };
}

const FAQS = (serviceName: string, cityName: string, priceFrom: string) => [
  {
    q: `כמה עולה ${serviceName} ב${cityName}?`,
    a: `המחיר מתחיל ב-${priceFrom} ומוצג מראש לפי מספר הפריטים ומצבם. המחיר הסופי נסגר בטווח שהוצג — בלי הפתעות.`,
  },
  {
    q: `תוך כמה זמן מגיע בעל מקצוע ב${cityName}?`,
    a: 'ברוב שעות היום מקצוען זמין מגיע תוך 25–40 דקות. אפשר גם לקבוע מועד מראש שנוח לכם.',
  },
  {
    q: 'איך אני יודע שבעל המקצוע אמין?',
    a: `כל מקצוען ב${market.name} עובר אימות זהות ובדיקת הצוות, וכל ביקורת נכתבת רק על ידי לקוח שביצע הזמנה אמיתית.`,
  },
  {
    q: 'מה אם אין מקצוען זמין כרגע?',
    a: 'המערכת תציע מיד לקבל הצעות מחיר ממקצוענים באזור, לקבוע מועד אחר או לקבל התראה כשמישהו מתפנה.',
  },
];

export default async function SeoServiceCityPage({ params }: PageProps) {
  const { service: serviceId, city: cityId } = await params;
  const match = resolve(serviceId, cityId);
  if (!match) notFound();
  const { service, city } = match;

  const localPros = DEMO_PROS.filter(
    (p) => p.status === 'active' && p.areaIds.includes(city.id) && p.services.some((s) => s.serviceId === service.id),
  );
  const localReviews = DEMO_REVIEWS.filter((r) =>
    localPros.some((p) => p.id === r.professionalId),
  ).slice(0, 3);
  const faqs = FAQS(service.name, city.name, shekel(service.basePriceAgorot));
  const avgRating =
    localPros.length > 0
      ? Math.round((localPros.reduce((s, p) => s + p.rating, 0) / localPros.length) * 10) / 10
      : null;

  const jsonLd = [
    {
      '@context': 'https://schema.org',
      '@type': 'Service',
      name: `${service.name} ב${city.name}`,
      serviceType: service.name,
      areaServed: { '@type': 'City', name: city.name },
      provider: { '@type': 'Organization', name: market.name, url: market.url },
      offers: { '@type': 'Offer', price: service.basePriceAgorot / 100, priceCurrency: 'ILS' },
      ...(avgRating && {
        aggregateRating: {
          '@type': 'AggregateRating',
          ratingValue: avgRating,
          reviewCount: localPros.reduce((s, p) => s + p.reviewCount, 0),
        },
      }),
    },
    {
      '@context': 'https://schema.org',
      '@type': 'FAQPage',
      mainEntity: faqs.map((f) => ({
        '@type': 'Question',
        name: f.q,
        acceptedAnswer: { '@type': 'Answer', text: f.a },
      })),
    },
  ];

  const bookHref = `/market/book?service=${service.id}&address=${encodeURIComponent(city.name)}`;

  return (
    <div className="relative z-10 min-h-dvh bg-slate-50 font-sans text-slate-900" dir="rtl">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-3xl items-center justify-between px-4 py-3">
          <Link href="/market" className="flex items-center gap-2 font-black">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-sky-600 text-white">✨</span>
            {market.name}
          </Link>
          <Link href={bookHref} className="rounded-xl bg-sky-600 px-4 py-2 text-sm font-bold text-white hover:bg-sky-700">
            הזמנה מיידית
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-3xl px-4 pb-16">
        <section className="pt-10 text-center">
          <span className="text-5xl">{service.icon}</span>
          <h1 className="mt-3 text-3xl font-black sm:text-4xl">
            {service.name} ב{city.name}
          </h1>
          <p className="mx-auto mt-3 max-w-xl text-slate-500">
            {service.description} מחיר החל מ-<b className="text-slate-800">{shekel(service.basePriceAgorot)}</b>,
            מוצג מראש לפני ההזמנה. {localPros.length > 0 && `${localPros.length} מקצוענים מאומתים פועלים ב${city.name} והסביבה.`}
          </p>
          <div className="mt-6 flex flex-col justify-center gap-2 sm:flex-row">
            <Link href={bookHref} className="rounded-xl bg-emerald-600 px-8 py-3.5 font-bold text-white shadow-sm hover:bg-emerald-700">
              ⚡ מצא לי מנקה ב{city.name}
            </Link>
            <Link href={`/market/pros?service=${service.id}&address=${encodeURIComponent(city.name)}`} className="rounded-xl border border-slate-300 bg-white px-8 py-3.5 font-bold text-slate-700 hover:border-sky-400">
              השוואת בעלי מקצוע
            </Link>
          </div>
          <p className="mt-3 text-xs text-slate-400">✓ אימות זהות · ✓ מחיר סגור מראש · ✓ מעקב חי · ✓ תשלום רק בסיום</p>
        </section>

        {localPros.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-3 text-xl font-black">מקצוענים מובילים ב{city.name}</h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {localPros.map((p) => (
                <Link key={p.id} href={`/pro/${p.slug}`} className="rounded-2xl border border-slate-200 bg-white p-4 transition hover:border-sky-300 hover:shadow-md">
                  <p className="font-black">{p.businessName || p.fullName}</p>
                  <p className="mt-0.5 text-sm text-slate-500">
                    <span className="font-bold text-amber-500">★ {p.rating}</span> ({p.reviewCount} ביקורות) · {p.jobCount} עבודות · ותק {p.yearsExperience} שנים
                  </p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-400">{p.bio}</p>
                </Link>
              ))}
            </div>
          </section>
        )}

        {localReviews.length > 0 && (
          <section className="mt-12">
            <h2 className="mb-3 text-xl font-black">מה אומרים לקוחות באזור</h2>
            <div className="space-y-3">
              {localReviews.map((r) => (
                <blockquote key={r.id} className="rounded-2xl border border-slate-200 bg-white p-4">
                  <p className="text-sm leading-relaxed text-slate-600">“{r.text}”</p>
                  <footer className="mt-2 text-xs font-bold text-slate-400">
                    {r.customerName} · <span className="text-amber-500">★ {((r.quality + r.punctuality + r.service + r.price) / 4).toFixed(1)}</span> · הזמנה מאומתת
                  </footer>
                </blockquote>
              ))}
            </div>
          </section>
        )}

        <section className="mt-12">
          <h2 className="mb-3 text-xl font-black">שאלות נפוצות</h2>
          <div className="space-y-2">
            {faqs.map((f) => (
              <details key={f.q} className="group rounded-2xl border border-slate-200 bg-white p-4">
                <summary className="cursor-pointer list-none font-bold text-slate-800">{f.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-slate-500">{f.a}</p>
              </details>
            ))}
          </div>
        </section>

        <section className="mt-12 rounded-3xl bg-gradient-to-l from-sky-600 to-sky-500 p-8 text-center text-white">
          <h2 className="text-2xl font-black">מוכנים? זה לוקח פחות מדקה</h2>
          <p className="mt-1 text-sky-100">בוחרים שירות, עונים על כמה שאלות ומקבלים מחיר — המערכת מוצאת לכם מקצוען פנוי.</p>
          <Link href={bookHref} className="mt-4 inline-block rounded-xl bg-white px-8 py-3 font-black text-sky-700 hover:bg-sky-50">
            הזמנת {service.name} ב{city.name}
          </Link>
        </section>

        <nav className="mt-12 text-xs text-slate-400">
          <p className="font-bold text-slate-500">{service.name} בערים נוספות:</p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {cities.filter((c) => c.id !== city.id).map((c) => (
              <Link key={c.id} href={`/${service.id}/${c.id}`} className="hover:text-sky-600 hover:underline">
                {service.name} ב{c.name}
              </Link>
            ))}
          </p>
          <p className="mt-3 font-bold text-slate-500">שירותים נוספים ב{city.name}:</p>
          <p className="mt-1 flex flex-wrap gap-x-3 gap-y-1">
            {bookableServices.filter((s) => s.id !== service.id).map((s) => (
              <Link key={s.id} href={`/${s.id}/${city.id}`} className="hover:text-sky-600 hover:underline">
                {s.name} ב{city.name}
              </Link>
            ))}
          </p>
        </nav>
      </main>

      <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(jsonLd) }} />
    </div>
  );
}
