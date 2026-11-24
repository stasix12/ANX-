'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { ils } from '@/lib/shop/logic';
import { orderWhatsappLink, PAYMENT_LABEL } from '@/lib/shop/payments';
import { ORDER_STATUS_LABEL, useCurrentUser, useShop } from '@/lib/shop/store';
import type { Order, OrderStatus } from '@/lib/shop/types';
import { ShopFrame } from '../Chrome';
import { IconCheck, IconClose, IconOrders } from '../icons';
import { btn, EmptyState, Img } from '../ui';

const CONFIRMED: OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered'];

const CONFETTI = Array.from({ length: 22 }, (_, i) => {
  const a = (i / 22) * Math.PI * 2;
  const r = 95 + (i % 4) * 30;
  return {
    dx: `${Math.cos(a) * r}px`,
    dy: `${Math.sin(a) * r * 0.75 - 10}px`,
    rot: `${(i * 67) % 360}deg`,
    color: ['#22c55e', '#3b82f6', '#a855f7', '#facc15', '#ec4899', '#14b8a6'][i % 6],
    delay: `${(i % 6) * 40}ms`,
    w: i % 3 === 0 ? 4 : 6,
  };
});

export function OrderSuccessWithParams() {
  const id = useSearchParams().get('id');
  return <OrderSuccess id={id} />;
}

/** Shown only for an order the payment provider has confirmed. */
export function OrderSuccess({ id }: { id: string | null }) {
  const s = useShop();
  const order = id ? s.db.orders.find((o) => o.id === id) : undefined;

  if (!s.ready) return <ShopFrame dark header="dark" nav="home">{null}</ShopFrame>;

  if (order?.status === 'pending_payment') {
    return <AwaitingPayment order={order} shippingName={s.db.settings.shippingMethods.find((m) => m.id === order.shippingMethod)?.name} />;
  }

  if (!order || !CONFIRMED.includes(order.status)) {
    return (
      <ShopFrame dark header="dark" nav="home">
        <div className="mx-auto flex max-w-sm flex-col items-center px-6 py-20 text-center">
          <span className="grid size-20 place-items-center rounded-full bg-white/10 text-white">
            <IconClose size={34} />
          </span>
          <h1 className="mt-5 text-[22px] font-black">
            {!order ? 'ההזמנה לא נמצאה' : 'ההזמנה בוטלה'}
          </h1>
          <p className="mt-2 text-white/70">
            {!order ? 'לא מצאנו הזמנה עם המזהה הזה.' : 'ההזמנה לא הושלמה ולא בוצע חיוב. אפשר לחזור לעגלה ולנסות שוב.'}
          </p>
          <Link href="/shop/cart" className={`${btn.primary} mt-7 h-13 w-full`}>
            חזרה לעגלה
          </Link>
        </div>
      </ShopFrame>
    );
  }

  return (
    <ShopFrame dark header="dark" nav="home">
      <div className="relative mx-auto flex min-h-[calc(100dvh-160px)] max-w-md flex-col items-center px-6 pt-10 text-center lg:pt-16">
        <div className="relative grid h-36 w-full place-items-center">
          {CONFETTI.map((c, i) => (
            <span
              key={i}
              aria-hidden="true"
              className="absolute top-1/2 left-1/2 rounded-[2px]"
              style={
                {
                  width: c.w,
                  height: c.w * 2,
                  background: c.color,
                  '--dx': c.dx,
                  '--dy': c.dy,
                  '--rot': c.rot,
                  animation: `x-confetti 1.6s ${c.delay} cubic-bezier(0.2,0.7,0.3,1) both`,
                } as React.CSSProperties
              }
            />
          ))}
          <span className="grid size-[88px] place-items-center rounded-full bg-linear-to-b from-[#34d36a] to-[#1fa651] text-white animate-x-pop [animation:x-pop_0.6s_cubic-bezier(0.34,1.56,0.64,1)_both,x-ring_1.4s_0.5s_ease-out_2]">
            <IconCheck size={46} strokeWidth={2.6} />
          </span>
        </div>
        <h1 className="mt-2 text-[27px] font-black animate-x-fade">ההזמנה בוצעה בהצלחה!</h1>
        <p dir="ltr" className="mt-2 text-[19px] font-bold text-white/90">
          #{order.number}
        </p>
        <p className="mt-3 text-[15px] leading-relaxed text-white/75">
          קיבלנו את ההזמנה שלך ומתחילים בהכנה.
          <br />
          פרטי ההזמנה יישלחו למייל {order.email}.
        </p>
        <p className="mt-2 text-[12px] text-white/45">סה&quot;כ שולם: {ils(order.total)} · אסמכתא: {order.paymentRef}</p>
        <Link href={`/shop/track?id=${encodeURIComponent(order.id)}`} className={`${btn.primary} mt-8 h-14 w-full rounded-full from-[#8a4efc]! to-[#6c46fb]! text-[17px]`}>
          מעקב אחר ההזמנה
        </Link>
        <Link href="/" className="mt-3 inline-flex h-14 w-full items-center justify-center rounded-full border border-white/30 text-[17px] font-bold text-white hover:bg-white/5">
          המשך קנייה
        </Link>
      </div>
    </ShopFrame>
  );
}

/**
 * The order is placed and has a number; payment is done on WhatsApp with
 * Bit / PayBox. The button opens a chat prefilled with the full order.
 */
function AwaitingPayment({ order, shippingName }: { order: Order; shippingName?: string }) {
  const wa = orderWhatsappLink(order, shippingName);
  return (
    <ShopFrame dark header="dark" nav="home">
      <div className="mx-auto flex max-w-md flex-col items-center px-6 pt-8 pb-6 text-center lg:pt-14">
        <span className="grid size-[76px] place-items-center rounded-full bg-linear-to-b from-[#34d36a] to-[#1fa651] text-white [animation:x-pop_0.6s_cubic-bezier(0.34,1.56,0.64,1)_both]">
          <IconCheck size={40} strokeWidth={2.6} />
        </span>
        <h1 className="mt-4 text-[25px] font-black">ההזמנה נקלטה!</h1>
        <p className="mt-1 text-[15px] text-white/75">מספר ההזמנה שלך:</p>
        <p dir="ltr" className="mt-2 rounded-2xl border border-white/20 bg-white/10 px-6 py-2 text-[34px] font-black tracking-wider">
          #{order.number}
        </p>

        <div className="mt-6 w-full rounded-[20px] bg-white/[0.06] p-4 text-right ring-1 ring-white/10">
          <p className="text-[16px] font-black">נשאר רק לשלם</p>
          <p className="mt-1 text-[14px] leading-relaxed text-white/75">
            שלחו לנו את מספר ההזמנה בוואטסאפ, ונשלח לכם את פרטי התשלום ב-
            <b className="text-white">{PAYMENT_LABEL[order.paymentMethod]}</b>.
          </p>
          <div className="mt-3 flex items-center justify-between border-t border-white/10 pt-3">
            <span className="text-[14px] text-white/70">סה&quot;כ לתשלום</span>
            <span className="text-[22px] font-black">{ils(order.total)}</span>
          </div>
        </div>

        <a
          href={wa}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-5 flex h-14 w-full items-center justify-center gap-2.5 rounded-full bg-[#25d366] text-[17px] font-black text-white shadow-[0_8px_22px_rgba(37,211,102,0.35)] transition hover:brightness-105 active:scale-[0.99]"
        >
          <svg width="24" height="24" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
            <path d="M12 2a10 10 0 0 0-8.6 15.1L2 22l5-1.3A10 10 0 1 0 12 2Zm0 18.2c-1.6 0-3.1-.4-4.4-1.2l-.3-.2-3 .8.8-2.9-.2-.3A8.2 8.2 0 1 1 12 20.2Zm4.5-6.1c-.2-.1-1.5-.7-1.7-.8-.2-.1-.4-.1-.6.1l-.8 1c-.1.2-.3.2-.5.1-.2-.1-1-.4-2-1.2-.7-.6-1.2-1.4-1.3-1.6-.1-.2 0-.4.1-.5l.4-.4.2-.4v-.4l-.8-1.9c-.2-.5-.4-.4-.6-.4h-.5c-.2 0-.4.1-.7.3-.2.2-.9.9-.9 2.2s.9 2.5 1 2.7c.1.2 1.8 2.8 4.4 3.9 1.6.7 2.3.8 3.1.6.5-.1 1.5-.6 1.7-1.2.2-.6.2-1.1.2-1.2-.1-.1-.3-.2-.5-.3Z" />
          </svg>
          שליחת ההזמנה בוואטסאפ לתשלום
        </a>
        <p className="mt-2 text-[12px] text-white/50">ההודעה כבר כוללת את מספר ההזמנה, המוצרים והסכום</p>

        <Link href={`/shop/track?id=${encodeURIComponent(order.id)}`} className="mt-6 text-[14px] font-bold text-white/80 underline underline-offset-4">
          לפרטי ההזמנה
        </Link>
        <Link href="/" className="mt-4 inline-flex h-12 w-full items-center justify-center rounded-full border border-white/30 text-[16px] font-bold text-white hover:bg-white/5">
          המשך קנייה
        </Link>
      </div>
    </ShopFrame>
  );
}

const TIMELINE: OrderStatus[] = ['paid', 'processing', 'shipped', 'delivered'];

export function TrackWithParams() {
  const id = useSearchParams().get('id');
  return <TrackOrder id={id} />;
}

export function TrackOrder({ id }: { id: string | null }) {
  const s = useShop();
  const order = id ? s.db.orders.find((o) => o.id === id) : undefined;
  if (!s.ready) return <ShopFrame nav="profile" back="/shop/account/orders">{null}</ShopFrame>;
  if (!order) {
    return (
      <ShopFrame nav="profile" back="/shop/account/orders">
        <EmptyState icon={<IconOrders size={34} />} title="ההזמנה לא נמצאה" action={{ label: 'להזמנות שלי', href: '/shop/account/orders' }} />
      </ShopFrame>
    );
  }
  return (
    <ShopFrame nav="profile" back="/shop/account/orders">
      <div className="mx-auto max-w-2xl px-4 lg:pt-8">
        <OrderDetail order={order} />
      </div>
    </ShopFrame>
  );
}

export function OrderDetail({ order }: { order: Order }) {
  const reached = (st: OrderStatus) => order.history.some((h) => h.status === st);
  const fmt = (iso: string) => new Date(iso).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' });
  return (
    <div>
      <div className="flex items-baseline justify-between">
        <h1 className="text-[24px] font-black">
          הזמנה <span dir="ltr">#{order.number}</span>
        </h1>
        <span className="rounded-full bg-x-blue-50 px-3 py-1 text-[13px] font-bold text-x-blue">{ORDER_STATUS_LABEL[order.status]}</span>
      </div>
      <p className="mt-1 text-[13px] text-x-muted">{fmt(order.createdAt)}</p>

      {order.status === 'pending_payment' && (
        <div className="mt-5 rounded-2xl bg-x-blue-50 p-4">
          <p className="text-[15px] font-black">ממתינה לתשלום ב-{PAYMENT_LABEL[order.paymentMethod]}</p>
          <p className="mt-1 text-[13.5px] text-x-ink-2">שלחו לנו את מספר ההזמנה בוואטסאפ ונשלח לכם את פרטי התשלום.</p>
          <a
            href={orderWhatsappLink(order)}
            target="_blank"
            rel="noopener noreferrer"
            className="mt-3 flex h-12 items-center justify-center rounded-full bg-[#25d366] text-[15px] font-black text-white"
          >
            שליחת ההזמנה בוואטסאפ לתשלום
          </a>
        </div>
      )}

      {order.status !== 'cancelled' && order.status !== 'pending_payment' && (
        <ol className="mt-6 space-y-0">
          {TIMELINE.map((st, i) => {
            const on = reached(st) || TIMELINE.indexOf(order.status) >= i;
            const at = order.history.find((h) => h.status === st)?.at;
            return (
              <li key={st} className="relative flex gap-3 pb-6 last:pb-0">
                {i < TIMELINE.length - 1 && <span className={`absolute top-8 right-[15px] h-[calc(100%-32px)] w-0.5 ${on ? 'bg-x-blue' : 'bg-x-line'}`} />}
                <span className={`grid size-8 shrink-0 place-items-center rounded-full ${on ? 'bg-x-blue text-white' : 'bg-x-soft text-x-faint'}`}>
                  <IconCheck size={16} />
                </span>
                <span>
                  <span className={`block text-[15px] font-bold ${on ? '' : 'text-x-faint'}`}>{ORDER_STATUS_LABEL[st]}</span>
                  {at && <span className="block text-[12px] text-x-muted">{fmt(at)}</span>}
                </span>
              </li>
            );
          })}
        </ol>
      )}

      <ul className="mt-6 divide-y divide-x-line rounded-2xl ring-1 ring-x-line">
        {order.lines.map((l, i) => (
          <li key={i} className="flex items-center gap-3 p-3">
            <span className="size-14 shrink-0 overflow-hidden rounded-xl bg-x-soft">
              <Img path={l.image} alt="" className="size-full object-cover" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block truncate text-[14px] font-bold">{l.name}</span>
              <span className="block text-[12px] text-x-muted">
                {l.colorName ? `צבע: ${l.colorName} · ` : ''}
                {l.optionsText ? `${l.optionsText} · ` : ''}כמות: {l.qty}
              </span>
            </span>
            <span className="text-[14px] font-extrabold">{ils(l.unitPrice * l.qty)}</span>
          </li>
        ))}
      </ul>
      <dl className="mt-4 space-y-1.5 text-[14px]">
        <div className="flex justify-between">
          <dt className="text-x-muted">סכום ביניים</dt>
          <dd>{ils(order.subtotal)}</dd>
        </div>
        {order.discount > 0 && (
          <div className="flex justify-between text-x-green">
            <dt>הנחה ({order.couponCode})</dt>
            <dd>- {ils(order.discount)}</dd>
          </div>
        )}
        <div className="flex justify-between">
          <dt className="text-x-muted">משלוח</dt>
          <dd>{order.shipping ? ils(order.shipping) : 'חינם'}</dd>
        </div>
        <div className="flex justify-between border-t border-x-line pt-2 text-[16px] font-black">
          <dt>סה&quot;כ</dt>
          <dd>{ils(order.total)}</dd>
        </div>
      </dl>
      <div className="mt-5 rounded-2xl bg-x-soft p-4 text-[13px] leading-relaxed">
        <p className="font-bold">משלוח אל</p>
        <p>
          {order.address.fullName} · <span dir="ltr">{order.address.phone}</span>
        </p>
        {order.address.street && (
          <p>
            {order.address.street}, {order.address.city} {order.address.zip}
          </p>
        )}
        {order.address.notes && <p className="text-x-muted">הערות: {order.address.notes}</p>}
      </div>
    </div>
  );
}

export function useMyOrders() {
  const s = useShop();
  const user = useCurrentUser();
  return user ? s.db.orders.filter((o) => o.userId === user.id) : [];
}
