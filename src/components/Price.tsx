import { formatPrice } from '@/lib/products';

/**
 * A price, isolated from the Hebrew around it.
 *
 * "₪" and the digits are both weak bidi characters, so dropped straight into
 * right-to-left text they take their direction from whatever sits next to
 * them — a trailing "+", a struck-through old price, a "|" separator — and
 * can come out as "+₪1,500" or with the sign on the wrong side. <bdi dir="ltr">
 * fixes the run as "₪1,500" whatever surrounds it, and tabular figures keep
 * prices from shifting width as they change.
 */
export function Price({
  value,
  suffix = '',
  className = '',
}: {
  value: number;
  /** Rendered inside the isolate, e.g. "+" for a partial total. */
  suffix?: string;
  className?: string;
}) {
  return (
    <bdi dir="ltr" className={`tabular-nums ${className}`}>
      {formatPrice(value)}
      {suffix}
    </bdi>
  );
}
