import Link from 'next/link';
import { StatusBadge } from '@/components/crm/StatusBadge';
import { formatDateHe, formatPrice, statusById, todayISO, type Lead } from '@/lib/crm/leads';

/**
 * One job/lead as a tappable card: time and customer on the first line,
 * city + services below, price and status at the edge. The start border is
 * tinted by status so a glance down a list reads like a schedule.
 */
export function LeadCard({ lead, showDate = false }: { lead: Lead; showDate?: boolean }) {
  const meta = statusById[lead.status];
  const dateLabel = lead.jobDate
    ? lead.jobDate === todayISO()
      ? 'היום'
      : formatDateHe(lead.jobDate)
    : 'ללא תאריך';

  return (
    <Link
      href={`/crm/leads/${lead.id}`}
      className="relative block overflow-hidden rounded-card border border-ink-700 surface p-4 transition-colors hover:border-ink-600"
    >
      <span aria-hidden className={`absolute inset-y-0 start-0 w-1 ${meta.dotClass}`} />
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="flex items-center gap-2 text-base font-extrabold">
            {lead.jobTime ? <span className="tabular-nums text-brand-400">{lead.jobTime}</span> : null}
            <span className="truncate">{lead.name}</span>
          </p>
          <p className="mt-1 truncate text-sm text-mist-300">
            {[showDate ? dateLabel : null, lead.city || null, lead.services.join(' · ') || null]
              .filter(Boolean)
              .join(' · ')}
          </p>
        </div>
        <div className="flex shrink-0 flex-col items-end gap-1.5">
          <span className="text-base font-extrabold tabular-nums">{formatPrice(lead.price)}</span>
          <StatusBadge status={lead.status} />
        </div>
      </div>
    </Link>
  );
}
