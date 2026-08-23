import { IsraelFlagIcon, MachineIcon, TruckIcon, WhatsAppIcon } from '@/components/icons';

/**
 * One thin row answering the four questions that stop a professional
 * ordering: will it fit, who made it, will it reach me, and can I ask someone
 * first. Kept to a single line of height so it does not push the catalogue
 * down.
 *
 * Every line here is a promise the shop has to keep, so each one is either
 * verifiable or something the shop stated. "Made in Israel" is moulded into
 * the parts themselves and visible in the photographs.
 */
const points = [
  { Icon: MachineIcon, label: 'מתאים למכונות Sabrina' },
  { Icon: IsraelFlagIcon, label: 'מיוצר בישראל', flag: true },
  { Icon: TruckIcon, label: 'משלוחים לכל הארץ' },
  { Icon: WhatsAppIcon, label: 'שירות ישיר בוואטסאפ' },
];

export function TrustStrip() {
  return (
    <div className="border-y border-ink-700 bg-ink-850/70">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-4 sm:px-6">
        {points.map(({ Icon, label, flag }) => (
          <li
            key={label}
            className="flex items-center gap-2 text-[11px] font-semibold text-mist-300 sm:text-xs"
          >
            {/* The flag keeps its own colours and its own 11:8; the line icons
                take the text colour and are square. */}
            <Icon
              className={
                flag
                  ? 'h-3.5 w-[19px] shrink-0 rounded-[2px] ring-1 ring-ink-700'
                  : 'h-4 w-4 shrink-0 text-brand-600'
              }
            />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
