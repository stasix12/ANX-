'use client';

import Link from 'next/link';
import { useState } from 'react';
import { ils, maxQty, priceCart, productHref } from '@/lib/shop/logic';
import { STATIC_PRODUCT_SLUGS } from '@/lib/shop/static';
import { actions, useShop } from '@/lib/shop/store';
import { ShopFrame } from '../Chrome';
import { IconCart, IconClose, IconTrash } from '../icons';
import { btn, EmptyState, Img, Price, QtyStepper } from '../ui';

export function CartView() {
  const s = useShop();
  const { settings } = s.db;
  const totals = priceCart(s.cart.lines, s.db.products, s.cart.coupon, settings.coupons, settings.shippingMethods, 'standard');
  const standard = settings.shippingMethods.find((m) => m.id === 'standard');
  const [code, setCode] = useState('');
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const blocked = totals.lines.some((l) => l.problem);

  return (
    <ShopFrame nav="cart" back="/shop">
      <div className="mx-auto max-w-6xl px-4 lg:px-8 lg:pt-8">
        <h1 dir="ltr" className="mb-4 text-[26px] font-black lg:text-3xl">
          <span dir="rtl">העגלה שלי</span>
        </h1>

        {!s.ready ? null : !totals.lines.length ? (
          <EmptyState icon={<IconCart size={34} />} title="העגלה ריקה" text="הוסיפו מוצרים מהחנות והם יופיעו כאן." action={{ label: 'להתחיל לקנות', href: '/shop/c/all' }} />
        ) : (
          <div className="lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-10">
            <ul className="space-y-3">
              {totals.lines.map((l) => (
                <li key={l.key} dir="ltr" className="flex gap-3.5 rounded-[18px] bg-white p-2.5 shadow-x-card ring-1 ring-x-line/60">
                  <Link href={productHref(l.product, STATIC_PRODUCT_SLUGS)} className="block size-[92px] shrink-0 overflow-hidden rounded-[12px] bg-x-soft sm:size-[110px]">
                    <Img path={l.image} alt={l.product.name} className="size-full object-cover" />
                  </Link>
                  <div dir="rtl" className="flex min-w-0 flex-1 flex-col">
                    <div dir="ltr" className="flex items-start justify-between gap-2">
                      <div dir="rtl" className="min-w-0 text-left">
                        <Link href={productHref(l.product, STATIC_PRODUCT_SLUGS)} className="block truncate text-[16px] font-extrabold">
                          {l.product.name}
                        </Link>
                        {l.colorName && <p className="text-[12px] text-x-muted">צבע: {l.colorName}</p>}
                      </div>
                    </div>
                    <div dir="ltr" className="mt-0.5">
                      <Price value={l.unitPrice} className="text-[18px]" />
                    </div>
                    <div dir="ltr" className="mt-auto flex items-center justify-between pt-1.5">
                      {l.product.digital ? (
                        <span className="text-[12px] font-semibold text-x-muted">קובץ דיגיטלי · 1</span>
                      ) : (
                        <QtyStepper size="sm" value={l.qty} max={Math.max(1, maxQty(l.product))} onChange={(n) => actions.setQty(l.key, n)} />
                      )}
                      <button
                        type="button"
                        aria-label={`הסרת ${l.product.name} מהעגלה`}
                        onClick={() => actions.removeLine(l.key)}
                        className="grid size-10 place-items-center rounded-full border border-x-line text-x-muted hover:border-x-red hover:text-x-red"
                      >
                        <IconTrash size={19} />
                      </button>
                    </div>
                    {l.problem && <p className="mt-1 text-[12px] font-bold text-x-red">{l.problem}</p>}
                  </div>
                </li>
              ))}
            </ul>

            <div className="mt-6 lg:sticky lg:top-24 lg:mt-0 lg:rounded-[22px] lg:p-6 lg:shadow-x-card lg:ring-1 lg:ring-x-line/60">
              <p className="mb-2.5 text-[16px] font-extrabold">יש לך קוד קופון?</p>
              {totals.coupon ? (
                <div className="flex items-center justify-between rounded-2xl bg-x-blue-50 px-4 py-3">
                  <span className="text-[14px] font-bold text-x-blue">
                    {totals.coupon.code} · {totals.coupon.label}
                  </span>
                  <button type="button" aria-label="הסרת הקופון" onClick={() => actions.removeCoupon()} className="text-x-blue">
                    <IconClose size={18} />
                  </button>
                </div>
              ) : (
                <form
                  dir="ltr"
                  className="flex gap-2.5"
                  onSubmit={(e) => {
                    e.preventDefault();
                    const r = actions.applyCoupon(code);
                    setMsg(r.ok ? { ok: true, text: `הקופון הופעל: ${r.value}` } : { ok: false, text: r.error });
                    if (r.ok) setCode('');
                  }}
                >
                  <button type="submit" className={`${btn.blue} h-12 w-[30%] shrink-0 rounded-[14px] text-[15px]`}>
                    הפעל
                  </button>
                  <input
                    dir="rtl"
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="הכנס קוד קופון"
                    aria-label="קוד קופון"
                    className="h-12 min-w-0 flex-1 rounded-[14px] border border-x-line px-4 text-[15px] outline-none placeholder:text-x-faint focus:border-x-blue"
                  />
                </form>
              )}
              {msg && !totals.coupon && <p className={`mt-2 text-[13px] font-semibold ${msg.ok ? 'text-x-green' : 'text-x-red'}`}>{msg.text}</p>}
              {totals.couponError && s.cart.coupon && <p className="mt-2 text-[13px] font-semibold text-x-red">{totals.couponError}</p>}

              <dl className="mt-5 space-y-2.5 border-t border-x-line pt-4 text-[16px]">
                <Row label="סכום ביניים" value={totals.subtotal} />
                {totals.discount > 0 && <Row label="הנחת קופון" value={-totals.discount} accent />}
                {!totals.allDigital && (
                  <Row label={`משלוח${standard ? ` (${standard.eta})` : ''}`} value={totals.shipping} free={totals.shipping === 0} />
                )}
              </dl>
              <div className="mt-4 flex items-center justify-between border-t border-x-line pt-4">
                <span className="text-[18px] font-black">סה&quot;כ לתשלום</span>
                <Price value={totals.total} className="text-[28px]" />
              </div>
              <Link
                href="/shop/checkout"
                aria-disabled={blocked}
                onClick={(e) => blocked && e.preventDefault()}
                className={`${btn.primary} mt-4 h-14 w-full text-[18px] ${blocked ? 'pointer-events-none opacity-50' : ''}`}
              >
                המשך לתשלום
              </Link>
              {blocked && <p className="mt-2 text-center text-[13px] font-semibold text-x-red">יש לעדכן את הפריטים המסומנים לפני התשלום</p>}
              <p className="mt-3 text-center text-[12px] text-x-faint">המחירים כוללים מע&quot;מ · משלוח מחושב לפי שיטת המשלוח בתשלום</p>
            </div>
          </div>
        )}
      </div>
    </ShopFrame>
  );
}

function Row({ label, value, accent, free }: { label: string; value: number; accent?: boolean; free?: boolean }) {
  return (
    <div className="flex items-center justify-between">
      <dt className="text-x-muted">{label}</dt>
      <dd className={`font-extrabold tabular-nums ${accent ? 'text-x-green' : ''}`}>
        {free ? 'חינם' : <span dir="rtl">{value < 0 ? `- ${ils(-value)}` : ils(value)}</span>}
      </dd>
    </div>
  );
}
