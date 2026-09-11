import { WaButton } from '@/components/hamavrik/CtaLinks';
import { Reveal } from '@/components/hamavrik/Reveal';
import { CheckIcon } from '@/components/icons';
import { priceDisclaimer, priceIncludes, priceList } from '@/lib/hamavrik/config';
import { waLinkFor } from '@/lib/hamavrik/links';


/**
 * A price list that reads in three seconds: the anchor row (sofa, 299 ₪)
 * is highlighted, everything else is a starting price or "by quote", and
 * the disclaimer sits right under it — no surprises, which is the whole
 * pitch. The card next to it says what every price includes.
 */
export function Pricing() {
  return (
    <div className="grid gap-5 lg:grid-cols-[1.25fr_0.75fr] lg:items-start">
      <Reveal>
        <ul className="surface overflow-hidden rounded-2xl">
          {priceList.map((row) => (
            <li
              key={row.label}
              className={`flex items-center justify-between gap-4 border-b border-ink-800 px-4 py-3 last:border-0 sm:px-6 sm:py-4 ${
                row.highlight ? 'bg-brand-300/30' : ''
              }`}
            >
              <div className="min-w-0">
                <p className="text-base font-black sm:text-lg">{row.label}</p>
                {row.note ? <p className="text-xs text-mist-500 sm:text-sm">{row.note}</p> : null}
              </div>
              <p className="shrink-0 text-end tabular-nums">
                {row.from !== null ? (
                  <>
                    <span className="me-1 text-[11px] font-bold text-mist-500">החל מ-</span>
                    <span className="text-[1.7rem] font-black leading-none text-brand-400 sm:text-3xl">{row.from}₪</span>
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
        <p className="mt-3 px-1 text-xs leading-relaxed text-mist-500 sm:text-sm">{priceDisclaimer}</p>
      </Reveal>

      <Reveal delay={120}>
        <div className="shine-hero relative overflow-hidden rounded-2xl p-5 sm:p-7">
          <p className="text-base font-black sm:text-lg">מה כלול בכל מחיר?</p>
          <ul className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 lg:grid-cols-1">
            {priceIncludes.map((line) => (
              <li key={line} className="flex items-center gap-2 text-sm font-bold text-white/90">
                <span className="grid h-5 w-5 shrink-0 place-items-center rounded-full bg-wa-500 text-white">
                  <CheckIcon className="h-3 w-3" />
                </span>
                {line}
              </li>
            ))}
          </ul>
          <WaButton location="pricing" href={waLinkFor('מצרפ/ת תמונה לקבלת מחיר 📷')} className="mt-4 w-full">
            שלחו תמונה וקבלו מחיר
          </WaButton>
        </div>
      </Reveal>
    </div>
  );
}
