import { WaButton } from '@/components/hamavrik/CtaLinks';
import { Reveal } from '@/components/hamavrik/Reveal';
import { CheckIcon } from '@/components/icons';
import { priceDisclaimer, priceList } from '@/lib/hamavrik/config';
import { waLinkFor } from '@/lib/hamavrik/links';

const INCLUDED = ['הגעה לבית הלקוח', 'ניקוי עמוק בהזרקה-יניקה', 'טיפול בכתמים', 'נטרול ריחות', 'שאיבה לייבוש מהיר'];

/**
 * A price list that reads in three seconds: the anchor row (sofa, 299 ₪)
 * is highlighted, everything else is a starting price or "by quote", and
 * the disclaimer sits right under it — no surprises, which is the whole
 * pitch. The card next to it says what every price includes.
 */
export function Pricing() {
  return (
    <div className="grid gap-6 lg:grid-cols-[1.25fr_0.75fr] lg:items-start">
      <Reveal>
        <ul className="surface overflow-hidden rounded-[1.5rem]">
          {priceList.map((row) => (
            <li
              key={row.label}
              className={`flex items-center justify-between gap-4 border-b border-ink-800 px-5 py-4 last:border-0 sm:px-7 ${
                row.highlight ? 'bg-brand-300/30' : ''
              }`}
            >
              <div>
                <p className="text-lg font-black">{row.label}</p>
                {row.note ? <p className="text-sm text-mist-500">{row.note}</p> : null}
              </div>
              <p className="shrink-0 text-end">
                {row.from !== null ? (
                  <>
                    <span className="block text-xs font-bold text-mist-500">החל מ-</span>
                    <span className="text-2xl font-black text-brand-400 sm:text-3xl">{row.from} ₪</span>
                  </>
                ) : (
                  <span className="rounded-full bg-ink-900 px-3 py-1.5 text-sm font-extrabold text-mist-300">
                    לפי הצעת מחיר
                  </span>
                )}
              </p>
            </li>
          ))}
        </ul>
        <p className="mt-4 px-2 text-sm leading-relaxed text-mist-500">{priceDisclaimer}</p>
      </Reveal>

      <Reveal delay={120}>
        <div className="shine-hero relative overflow-hidden rounded-[1.5rem] p-6 sm:p-8">
          <p className="text-lg font-black">מה כלול בכל מחיר?</p>
          <ul className="mt-4 space-y-2.5">
            {INCLUDED.map((line) => (
              <li key={line} className="flex items-center gap-3 font-bold text-white/90">
                <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-wa-500 text-white">
                  <CheckIcon className="h-3.5 w-3.5" />
                </span>
                {line}
              </li>
            ))}
          </ul>
          <WaButton location="pricing" href={waLinkFor('מצרפ/ת תמונה לקבלת מחיר 📷')} size="lg" className="mt-7 w-full">
            שלחו תמונה וקבלו מחיר
          </WaButton>
          <p className="mt-3 text-center text-xs text-white/60">המחיר נסגר מראש — לפני שהגענו.</p>
        </div>
      </Reveal>
    </div>
  );
}
