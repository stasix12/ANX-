import { whatsappLink } from '@/lib/site';
import { ils } from './logic';
import type { Order, PaymentMethodId } from './types';

/**
 * How the shop is paid: the customer places the order on the site and gets an
 * order number, then sends that number to the owner on WhatsApp and pays with
 * Bit or PayBox there. The site never collects or stores card details.
 * The order stays "pending_payment" until the owner marks it paid in the admin.
 */

export const PAYMENT_METHODS: { id: PaymentMethodId; name: string; note: string }[] = [
  { id: 'bit', name: 'Bit', note: 'פרטי התשלום נשלחים אליך בוואטסאפ' },
  { id: 'paybox', name: 'PayBox', note: 'פרטי התשלום נשלחים אליך בוואטסאפ' },
];

export const PAYMENT_LABEL: Record<PaymentMethodId, string> = {
  bit: 'Bit',
  paybox: 'PayBox',
  card: 'כרטיס אשראי',
  paypal: 'PayPal',
};

/** Order numbers are created in the customer's browser, so they are random rather than sequential. */
export function newOrderNumber(taken: number[]): number {
  let n = 0;
  do n = 100000 + Math.floor(Math.random() * 900000);
  while (taken.includes(n));
  return n;
}

/** The WhatsApp message that hands the order to the owner for payment. */
export function orderWhatsappText(order: Order, shippingName?: string): string {
  const lines = order.lines.map((l) => {
    const extra = [l.colorName, l.optionsText].filter(Boolean).join(', ');
    return `• ${l.name}${extra ? ` (${extra})` : ''} × ${l.qty} – ${ils(l.unitPrice * l.qty)}`;
  });
  const address = order.address.street ? `${order.address.street}, ${order.address.city}` : '';
  return [
    'היי, ביצעתי הזמנה באתר ANX3D',
    `מספר הזמנה: #${order.number}`,
    '',
    ...lines,
    order.discount ? `הנחה: -${ils(order.discount)}` : null,
    shippingName ? `משלוח: ${shippingName}${order.shipping ? ` – ${ils(order.shipping)}` : ''}` : null,
    `סה"כ לתשלום: ${ils(order.total)}`,
    `אמצעי תשלום: ${PAYMENT_LABEL[order.paymentMethod]}`,
    '',
    `שם: ${order.customer.fullName}`,
    `טלפון: ${order.customer.phone}`,
    address ? `כתובת: ${address}` : null,
    order.address.notes ? `הערות: ${order.address.notes}` : null,
    '',
    'אשמח לקבל את פרטי התשלום 🙏',
  ]
    .filter((l) => l !== null)
    .join('\n');
}

export function orderWhatsappLink(order: Order, shippingName?: string): string {
  return whatsappLink(orderWhatsappText(order, shippingName));
}
