'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useRef, useState } from 'react';
import { useOrderList } from '@/components/OrderListProvider';
import { Price } from '@/components/Price';
import { ArrowEndIcon, CartIcon, CloseIcon, WhatsAppIcon } from '@/components/icons';
import { WhatsAppLink } from '@/components/WhatsAppLink';
import {
  BULK_THRESHOLD,
  lineTotal,
  orderItemCount,
  orderLink,
  orderTotal,
} from '@/lib/order';

/**
 * The order list, presented as a basket: a slim summary bar fixed to the
 * bottom once something is in it ("2 מוצרים | ₪1,500 · צפייה בהזמנה"), and a
 * sheet that reviews the lines and sends the whole list as a single WhatsApp
 * message. Checkout stays WhatsApp — the bar only opens the review, so the
 * order is looked over before it goes.
 *
 * The sheet is also opened from the header cart, so it has an empty state.
 */
export function OrderBar() {
  const { lines, setQuantity, remove, clear, ready, sheetOpen: open, setSheetOpen: setOpen } = useOrderList();
  const dialogRef = useRef<HTMLDivElement>(null);
  const [bump, setBump] = useState(false);
  const previousCount = useRef(0);

  const count = orderItemCount(lines);
  const { total, complete } = orderTotal(lines);

  // A short lift on the bar whenever the count goes up — the store-like
  // "it went in" beat, felt at the bottom of the screen where the list lives.
  useEffect(() => {
    if (!ready) return;
    if (count > previousCount.current && previousCount.current > 0) {
      setBump(true);
      const timer = window.setTimeout(() => setBump(false), 260);
      previousCount.current = count;
      return () => window.clearTimeout(timer);
    }
    previousCount.current = count;
  }, [count, ready]);

  // Escape closes; focus moves into the sheet on open, is kept inside it while
  // open, and goes back to whatever opened it on close.
  useEffect(() => {
    if (!open) return;
    const opener = document.activeElement as HTMLElement | null;
    const dialog = dialogRef.current;
    dialog?.focus();

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        return;
      }
      if (event.key !== 'Tab' || !dialog) return;
      const focusable = dialog.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (focusable.length === 0) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialog)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      opener?.focus?.();
    };
  }, [open, setOpen]);

  if (!ready) return null;

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-60 flex items-end justify-center bg-black/30 backdrop-blur-[2px] sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="סגירת ההזמנה"
            tabIndex={-1}
            className="absolute inset-0 cursor-default"
            onClick={() => setOpen(false)}
          />

          <div
            ref={dialogRef}
            tabIndex={-1}
            role="dialog"
            aria-modal="true"
            aria-labelledby="order-sheet-title"
            className="relative flex max-h-[85dvh] w-full max-w-lg flex-col rounded-t-2xl bg-white pb-[env(safe-area-inset-bottom)] shadow-[0_-8px_40px_rgb(0_0_0/0.12)] outline-none sm:rounded-2xl sm:pb-0"
          >
            <div className="flex items-center justify-between border-b border-ink-700 py-3 ps-5 pe-3">
              <h2 id="order-sheet-title" className="text-lg font-extrabold">
                ההזמנה שלך
              </h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="סגירה"
                className="grid h-11 w-11 place-items-center rounded-xl text-mist-500 transition-colors hover:bg-ink-800 hover:text-mist-100"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            {count === 0 ? (
              <div className="px-5 py-12 text-center">
                <span className="mx-auto grid h-14 w-14 place-items-center rounded-full bg-ink-900 text-mist-500">
                  <CartIcon className="h-7 w-7" />
                </span>
                <p className="mt-4 font-bold">ההזמנה ריקה</p>
                <p className="mt-1 text-sm text-mist-500">מוסיפים מוצרים מהקטלוג ושולחים הכל בהודעה אחת.</p>
                <Link
                  href="/#products"
                  onClick={() => setOpen(false)}
                  className="mt-6 inline-flex h-12 items-center justify-center rounded-xl bg-brand-500 px-7 font-bold text-on-brand transition-colors duration-200 hover:bg-brand-600"
                >
                  צפייה במוצרים
                </Link>
              </div>
            ) : (
              <>
                <ul className="flex-1 divide-y divide-ink-700 overflow-y-auto px-5">
                  {lines.map((line) => {
                    const value = lineTotal(line);
                    return (
                      <li key={`${line.slug}-${line.model}`} className="flex items-start gap-3 py-4">
                        {/* Older lines saved before thumbnails shipped have no
                            image — the tile still holds its place. */}
                        <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-ink-700 bg-ink-900">
                          {line.image ? (
                            <Image src={line.image} alt="" width={64} height={64} className="h-full w-full object-cover" />
                          ) : null}
                        </div>

                        <div className="min-w-0 flex-1">
                          <p className="text-sm leading-snug font-bold break-words">{line.name}</p>
                          <p className="mt-0.5 text-xs text-mist-500">{line.model}</p>
                          <p className="mt-1.5 text-[15px] font-extrabold">
                            {value === undefined ? (
                              <span className="text-xs font-semibold text-mist-500">מחיר לפי הזמנה</span>
                            ) : (
                              <Price value={value} />
                            )}
                          </p>
                        </div>

                        <div className="flex shrink-0 flex-col items-end gap-1.5">
                          <div className="flex items-center rounded-xl border border-ink-700">
                            <QuantityButton
                              label={`הפחתת כמות של ${line.name}`}
                              onClick={() => setQuantity(line.slug, line.model, line.quantity - 1)}
                            >
                              −
                            </QuantityButton>
                            <span
                              aria-label={`כמות: ${line.quantity}`}
                              className="w-7 text-center text-sm font-bold tabular-nums"
                            >
                              {line.quantity}
                            </span>
                            <QuantityButton
                              label={`הוספת כמות של ${line.name}`}
                              onClick={() => setQuantity(line.slug, line.model, line.quantity + 1)}
                            >
                              +
                            </QuantityButton>
                          </div>
                          <button
                            type="button"
                            onClick={() => remove(line.slug, line.model)}
                            aria-label={`הסרת ${line.name}`}
                            className="rounded-lg px-2 py-1.5 text-xs font-semibold text-mist-500 transition-colors hover:text-red-600"
                          >
                            הסרה
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>

                <div className="border-t border-ink-700 bg-ink-900/60 px-5 pt-4 pb-4 sm:rounded-b-2xl">
                  {count >= BULK_THRESHOLD ? (
                    <p className="mb-3 rounded-xl border border-brand-500/25 bg-brand-500/[0.07] px-3 py-2 text-xs font-semibold text-brand-700">
                      {count} יחידות בהזמנה — נשמח לבדוק לכם מחיר לכמות בצ׳אט.
                    </p>
                  ) : null}

                  <div className="flex items-baseline justify-between gap-4">
                    <span className="text-sm text-mist-500">
                      סה״כ · {count} יחידות
                      {complete ? '' : ' · חלק מהפריטים לתמחור'}
                    </span>
                    <span className="text-xl font-extrabold">
                      <Price value={total} suffix={complete ? '' : '+'} />
                    </span>
                  </div>

                  <p className="mt-2 text-xs leading-relaxed text-mist-500">
                    ההזמנה נשלחת אלינו בוואטסאפ — מאשרים איתכם התאמה, משלוח ותשלום.
                  </p>

                  <WhatsAppLink
                    href={orderLink(lines)}
                    className="mt-3 flex h-12 items-center justify-center gap-2.5 rounded-xl bg-[#25D366] px-6 text-base font-bold text-mist-100 transition-colors duration-200 hover:bg-[#1fbe5a]"
                  >
                    <WhatsAppIcon className="h-5 w-5 shrink-0" />
                    שליחת ההזמנה בוואטסאפ
                  </WhatsAppLink>

                  <div className="mt-2 flex items-center justify-between">
                    <button
                      type="button"
                      onClick={() => setOpen(false)}
                      className="rounded-lg py-2.5 text-sm font-bold text-mist-100 transition-colors hover:text-brand-700"
                    >
                      המשך בקנייה
                    </button>
                    <button
                      type="button"
                      onClick={clear}
                      className="rounded-lg py-2.5 text-xs font-semibold text-mist-500 transition-colors hover:text-red-600"
                    >
                      ניקוי הרשימה
                    </button>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      ) : null}

      {count > 0 ? (
        <div className="order-bar-in fixed inset-x-0 bottom-0 z-50 border-t border-ink-700 bg-white/95 pb-[env(safe-area-inset-bottom)] shadow-[0_-4px_20px_rgb(0_0_0/0.06)] backdrop-blur-lg">
          <div className="mx-auto max-w-7xl px-3 py-2.5 sm:px-6 lg:px-8">
            <button
              type="button"
              onClick={() => setOpen(true)}
              aria-label={`צפייה בהזמנה — ${count} מוצרים`}
              className={`flex h-12 w-full items-center gap-3 rounded-xl text-start transition-transform duration-200 sm:ms-auto sm:max-w-md ${
                bump ? 'scale-[1.02]' : ''
              }`}
            >
              <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-ink-900 text-mist-100">
                <CartIcon className="h-[22px] w-[22px]" />
              </span>
              <span className="min-w-0 flex-1 leading-tight">
                <span className="block text-sm font-bold">{count} מוצרים</span>
                <span className="block text-sm font-extrabold text-mist-100">
                  <Price value={total} suffix={complete ? '' : '+'} />
                </span>
              </span>
              <span className="inline-flex h-11 shrink-0 items-center gap-1.5 rounded-xl bg-brand-500 px-4 text-sm font-bold text-on-brand transition-colors duration-200 hover:bg-brand-600">
                צפייה בהזמנה
                <ArrowEndIcon className="h-4 w-4" />
              </span>
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}

/** Page-end space the height of the order bar, rendered only while it shows. */
export function OrderBarSpacer() {
  const { lines, ready } = useOrderList();
  if (!ready || orderItemCount(lines) === 0) return null;
  return <div aria-hidden className="h-[calc(4.25rem+env(safe-area-inset-bottom))]" />;
}

function QuantityButton({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={label}
      className="grid h-10 w-10 place-items-center rounded-xl text-lg font-bold text-mist-100 transition-colors hover:bg-ink-800"
    >
      {children}
    </button>
  );
}
