import { CheckIcon, IsraelFlagIcon, TruckIcon, WhatsAppIcon } from '@/components/icons';

/**
 * Right under the hero: the four things that stop a professional ordering —
 * who made it, will it reach me, can I ask someone, will it fit.
 *
 * Every line here is a promise the shop has to keep, so each one is either
 * verifiable or something the shop stated. "Made in Israel" is moulded into
 * the parts themselves and visible in the photographs.
 */
const points = [
  { Icon: IsraelFlagIcon, label: 'מיוצר בישראל', detail: 'ישירות מהיצרן', flag: true },
  { Icon: TruckIcon, label: 'משלוחים לכל הארץ', detail: 'לבית או לעסק' },
  { Icon: WhatsAppIcon, label: 'שירות ישיר בוואטסאפ', detail: 'מענה ממי שמייצר' },
  { Icon: CheckIcon, label: 'מתאים למכונות Sabrina', detail: 'מקסי ומיני' },
];

export function TrustStrip() {
  return (
    <div className="border-b border-ink-700 bg-white">
      <ul className="mx-auto grid max-w-7xl grid-cols-2 gap-x-4 gap-y-5 px-4 py-6 sm:px-6 lg:grid-cols-4 lg:px-8 lg:py-7">
        {points.map(({ Icon, label, detail, flag }) => (
          <li key={label} className="flex items-center gap-3">
            <span className="grid h-10 w-10 shrink-0 place-items-center rounded-xl bg-ink-900 text-mist-100">
              {/* The flag keeps its own colours and its own 11:8; the line icons
                  take the text colour and are square. */}
              <Icon className={flag ? 'h-3.5 w-[19px] rounded-[2px] ring-1 ring-ink-700' : 'h-5 w-5'} />
            </span>
            <span className="min-w-0 leading-tight">
              <span className="block text-[13px] font-bold text-mist-100 sm:text-sm">{label}</span>
              <span className="mt-0.5 block text-xs text-mist-500">{detail}</span>
            </span>
          </li>
        ))}
      </ul>
    </div>
  );
}
