import { MachineIcon, ShieldIcon, TruckIcon, WhatsAppIcon } from '@/components/icons';

/**
 * One thin row answering the four objections that stop a professional
 * ordering: will it fit, will it last, will it reach me, and can I ask
 * someone first. Kept to a single line of height so it does not push the
 * catalog down.
 */
const points = [
  { Icon: MachineIcon, label: 'מתאים למכונות Sabrina' },
  { Icon: ShieldIcon, label: 'אחריות 12 חודשים' },
  { Icon: TruckIcon, label: 'משלוחים לכל הארץ' },
  { Icon: WhatsAppIcon, label: 'שירות ישיר בוואטסאפ' },
];

export function TrustStrip() {
  return (
    <div className="border-y border-ink-700 bg-ink-850/70">
      <ul className="mx-auto grid max-w-6xl grid-cols-2 gap-x-4 gap-y-2 px-4 py-3 sm:grid-cols-4 sm:px-6">
        {points.map(({ Icon, label }) => (
          <li key={label} className="flex items-center gap-2 text-[11px] font-semibold text-mist-300 sm:text-xs">
            <Icon className="h-4 w-4 shrink-0 text-brand-600" />
            <span>{label}</span>
          </li>
        ))}
      </ul>
    </div>
  );
}
