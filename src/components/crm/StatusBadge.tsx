import { statusById, type LeadStatus } from '@/lib/crm/leads';

export function StatusBadge({ status, className = '' }: { status: LeadStatus; className?: string }) {
  const meta = statusById[status];
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-full px-2.5 py-1 text-xs font-bold ${meta.badgeClass} ${className}`}
    >
      <span aria-hidden className={`h-1.5 w-1.5 rounded-full ${meta.dotClass}`} />
      {meta.label}
    </span>
  );
}
