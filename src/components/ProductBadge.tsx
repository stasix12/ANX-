/**
 * Badges are free text from the admin panel. Orange is kept for the two that
 * are genuinely news or proof ("חדש", "הנמכר ביותר"); everything else — "סט
 * מלא", "סט 6 יחידות", "שדרוג מומלץ", "חוסך זמן" — is a quiet white label, so
 * orange badges do not compete with the orange buttons under them.
 */
const loudBadges = /^חדש|הנמכר/;

export function ProductBadge({ label, className = '' }: { label: string; className?: string }) {
  const loud = loudBadges.test(label);
  return (
    <span
      className={`rounded-md px-2 py-1 text-[11px] leading-none font-bold ${
        loud
          ? 'bg-brand-500 text-on-brand'
          : 'bg-white/95 text-mist-100 shadow-[0_1px_2px_rgb(0_0_0/0.08)] ring-1 ring-ink-700'
      } ${className}`}
    >
      {label}
    </span>
  );
}
