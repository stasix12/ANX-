import { WhatsAppButton } from '@/components/WhatsAppButton';
import { InstagramIcon, PhoneIcon, TikTokIcon, TruckIcon } from '@/components/icons';
import { site } from '@/lib/site';

export function Contact() {
  return (
    <section id="contact" aria-labelledby="contact-title" className="scroll-mt-24 py-16 sm:py-20">
      <div className="mx-auto max-w-6xl px-4 sm:px-6">
        <div className="relative isolate overflow-hidden rounded-card border border-brand-500/30 surface p-7 sm:p-10 lg:p-14">
          <div aria-hidden className="absolute inset-0 -z-10 bg-tech-grid opacity-25" />
          <div
            aria-hidden
            className="absolute -top-24 -start-16 -z-10 h-80 w-80 rounded-full bg-brand-600/20 blur-3xl"
          />

          <div className="grid gap-10 lg:grid-cols-[1.15fr_1fr] lg:items-center">
            <div>
              <p className="text-xs font-semibold tracking-[0.18em] text-brand-700 uppercase">
                צור קשר
              </p>
              <h2
                id="contact-title"
                className="mt-3 text-3xl font-extrabold tracking-tight text-balance-he sm:text-4xl"
              >
                לא בטוחים מה מתאים למכונה שלכם?
              </h2>
              <p className="mt-4 max-w-lg text-base leading-relaxed text-mist-300 sm:text-lg">
                שלחו לנו הודעה בוואטסאפ עם תמונה של יציאת המכונה, ונגיד לכם בדיוק איזו ידית, צינור
                או מתאם מתאימים — ומה כדאי להזמין יחד.
              </p>

              <div className="mt-8 flex flex-col gap-3 sm:flex-row sm:items-center">
                <WhatsAppButton size="lg" label="דברו איתנו בוואטסאפ" />
                <a
                  href={`tel:+${site.whatsappNumber}`}
                  className="inline-flex items-center justify-center gap-2.5 rounded-full border border-ink-600 px-7 py-4 text-lg font-bold text-mist-100 transition-colors duration-200 hover:border-brand-500 hover:text-brand-700"
                >
                  <PhoneIcon className="h-5 w-5" />
                  {site.phoneDisplay}
                </a>
              </div>
            </div>

            <ul className="space-y-3">
              <li className="flex items-start gap-3.5 rounded-2xl border border-ink-700 surface p-5">
                <TruckIcon className="mt-0.5 h-6 w-6 shrink-0 text-brand-600" />
                <div>
                  <p className="font-bold">{site.shippingNote}</p>
                  <p className="mt-1 text-sm text-mist-300">
                    שולחים לכל היישובים, כולל אזורי פריפריה.
                  </p>
                </div>
              </li>
              <li className="flex items-start gap-3.5 rounded-2xl border border-ink-700 surface p-5">
                <PhoneIcon className="mt-0.5 h-6 w-6 shrink-0 text-brand-600" />
                <div>
                  <p className="font-bold">שירות ישיר, בלי מוקד</p>
                  <p className="mt-1 text-sm text-mist-300">
                    ימים א׳–ה׳ 09:00–18:00 · ו׳ 09:00–13:00
                  </p>
                </div>
              </li>
              <li className="flex items-center gap-3 rounded-2xl border border-ink-700 surface p-5">
                <span className="text-sm font-bold">עקבו אחרינו:</span>
                <a
                  href={site.instagram}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="ANX3D באינסטגרם"
                  className="grid h-10 w-10 place-items-center rounded-xl border border-ink-600 text-mist-300 transition-colors duration-200 hover:border-brand-500 hover:text-brand-700"
                >
                  <InstagramIcon className="h-5 w-5" />
                </a>
                <a
                  href={site.tiktok}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label="ANX3D בטיקטוק"
                  className="grid h-10 w-10 place-items-center rounded-xl border border-ink-600 text-mist-300 transition-colors duration-200 hover:border-brand-500 hover:text-brand-700"
                >
                  <TikTokIcon className="h-5 w-5" />
                </a>
              </li>
            </ul>
          </div>
        </div>
      </div>
    </section>
  );
}
