import { formatPrice, type Product } from '@/lib/products';
import { whatsappLink } from '@/lib/site';

export interface OrderLine {
  slug: string;
  name: string;
  model: string;
  quantity: number;
  price?: number;
  /** The product's first gallery photo, shown as a thumbnail in the order list. */
  image?: string;
}

/** Minimum quantity that counts as a bulk order and unlocks a price conversation. */
export const BULK_THRESHOLD = 3;

export const lineTotal = (line: OrderLine): number | undefined =>
  line.price === undefined ? undefined : line.price * line.quantity;

export const orderItemCount = (lines: OrderLine[]): number =>
  lines.reduce((sum, line) => sum + line.quantity, 0);

/**
 * Sum of the lines that carry a price. Lines priced "on request" are skipped,
 * so this is explicitly an estimate and is labelled as one in the message.
 */
export function orderTotal(lines: OrderLine[]): { total: number; complete: boolean } {
  let total = 0;
  let complete = true;

  for (const line of lines) {
    const value = lineTotal(line);
    if (value === undefined) complete = false;
    else total += value;
  }
  return { total, complete };
}

/**
 * The whole list as one WhatsApp message.
 *
 * A single message is the point: ordering four parts used to mean sending four
 * separate chats, which is the friction that stops anyone ordering in bulk.
 */
export function composeOrderMessage(lines: OrderLine[]): string {
  if (lines.length === 0) return 'היי, מעוניין לקבל פרטים על הציוד ל-Sabrina';

  const items = lines
    .map((line) => `• ${line.quantity}× ${line.name} — ${line.model}`)
    .join('\n');

  const { total, complete } = orderTotal(lines);
  const count = orderItemCount(lines);

  const parts = ['היי, מעוניין להזמין:', '', items, ''];

  if (total > 0) {
    parts.push(complete ? `סה״כ: ${formatPrice(total)}` : `סה״כ חלקי: ${formatPrice(total)} (יש פריטים לתמחור)`);
  }

  if (count >= BULK_THRESHOLD) {
    parts.push(`הזמנה של ${count} יחידות — אשמח לבדוק מחיר לכמות.`);
  }

  return parts.join('\n');
}

export const orderLink = (lines: OrderLine[]): string => whatsappLink(composeOrderMessage(lines));

/** A single product ordered on its own, for the quick-order button on a card. */
export const singleLine = (product: Product, model: string, quantity = 1): OrderLine => ({
  slug: product.slug,
  name: product.name,
  model,
  quantity,
  price: product.price,
  image: product.images[0],
});
