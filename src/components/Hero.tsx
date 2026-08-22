import Image from 'next/image';
import Link from 'next/link';
import { WhatsAppButton } from '@/components/WhatsAppButton';
import { TruckIcon } from '@/components/icons';
import { site } from '@/lib/site';

export function Hero() {
  return (
    <section className="relative isolate overflow-hidden">
      {/* Placeholder artwork — replace public/hero/machine.svg with a real photo. */}
      <Image
        src="/hero/machine.svg"
        alt="מכונת ניקוי אקסטרקציה מקצועית בסגנון תעשייתי"
        fill
        priority
        sizes="100vw"
        className="-z-20 object-cover object-center"
      />

      {/* Darkening layers keep the Hebrew headline readable over any photo,
          while still letting the machine behind it show through. */}
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-b from-ink-950/45 via-ink-950/70 to-ink-950"
      />
      <div
        aria-hidden
        className="absolute inset-0 -z-10 bg-linear-to-l from-ink-950/85 via-ink-950/40 to-transparent"
      />
      <div
        aria-hidden
        className="absolute -top-40 start-1/4 -z-10 h-[26rem] w-[26rem] rounded-full bg-brand-600/25 blur-3xl animate-glow"
      />

      <div className="mx-auto max-w-6xl px-4 pt-14 pb-16 sm:px-6 sm:pt-20 sm:pb-24 lg:pt-28 lg:pb-32">
        <div className="max-w-2xl animate-rise">
          <p className="inline-flex items-center gap-2 rounded-full border border-brand-500/40 bg-brand-500/10 px-4 py-1.5 text-xs font-semibold tracking-[0.14em] text-brand-300 uppercase">
            {site.tagline}
          </p>

          <h1 className="mt-6 text-4xl leading-[1.12] font-extrabold tracking-tight text-balance-he sm:text-5xl lg:text-6xl">
            משדרגים את ה-<span className="text-brand-400">Sabrina</span> שלך.
          </h1>

          <p className="mt-5 max-w-xl text-lg leading-relaxed text-mist-300 sm:text-xl">
            ידיות שאיבה, צינורות ומתאמים שפותחו עבור אנשי מקצוע.
          </p>

          <div className="mt-9 flex flex-col gap-3 sm:flex-row sm:items-center">
            <Link
              href="#products"
              className="inline-flex items-center justify-center rounded-full bg-brand-500 px-8 py-4 text-lg font-bold text-white shadow-xl shadow-brand-700/35 transition-colors duration-200 hover:bg-brand-400"
            >
              לצפייה במוצרים
            </Link>
            <WhatsAppButton size="lg" label="הזמנה ב-WhatsApp" />
          </div>

          <p className="mt-8 flex items-center gap-2.5 text-sm font-medium text-mist-500">
            <TruckIcon className="h-5 w-5 shrink-0 text-brand-400" />
            <span>
              {site.shippingNote} · הזמנות בוואטסאפ{' '}
              <span dir="ltr" className="whitespace-nowrap">
                {site.phoneDisplay}
              </span>
            </span>
          </p>
        </div>
      </div>
    </section>
  );
}
