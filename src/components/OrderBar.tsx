'use client';

import { useEffect, useState } from 'react';
import { useOrderList } from '@/components/OrderListProvider';
import { CloseIcon, WhatsAppIcon } from '@/components/icons';
import { WhatsAppLink } from '@/components/WhatsAppLink';
import { formatPrice } from '@/lib/products';
import {
  BULK_THRESHOLD,
  lineTotal,
  orderItemCount,
  orderLink,
  orderTotal,
} from '@/lib/order';

/**
 * Sits above everything once the list has something in it: a running count and
 * total, and one button that sends the whole list as a single WhatsApp message.
 */
export function OrderBar() {
  const { lines, setQuantity, remove, clear, ready } = useOrderList();
  const [open, setOpen] = useState(false);

  const count = orderItemCount(lines);
  const { total, complete } = orderTotal(lines);

  // Close the sheet once the list empties out, so it cannot sit open and blank.
  useEffect(() => {
    if (count === 0) setOpen(false);
  }, [count]);

  useEffect(() => {
    if (!open) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [open]);

  if (!ready || count === 0) return null;

  return (
    <>
      {open ? (
        <div className="fixed inset-0 z-60 flex items-end justify-center bg-mist-100/40 p-0 backdrop-blur-sm sm:items-center sm:p-6">
          <button
            type="button"
            aria-label="סגירת רשימת ההזמנה"
            className="absolute inset-0 cursor-default"
            onClick={() => setOpen(false)}
          />

          <div
            role="dialog"
            aria-modal="true"
            aria-label="רשימת ההזמנה"
            className="relative flex max-h-[80vh] w-full max-w-lg flex-col rounded-t-card border border-ink-700 bg-white shadow-2xl sm:rounded-card"
          >
            <div className="flex items-center justify-between border-b border-ink-700 px-5 py-4">
              <h2 className="text-lg font-extrabold">רשימת ההזמנה</h2>
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="סגירה"
                className="grid h-9 w-9 place-items-center rounded-lg text-mist-300 transition-colors hover:text-mist-100"
              >
                <CloseIcon className="h-5 w-5" />
              </button>
            </div>

            <ul className="flex-1 divide-y divide-ink-700 overflow-y-auto px-5">
              {lines.map((line) => {
                const value = lineTotal(line);
                return (
                  <li key={`${line.slug}-${line.model}`} className="flex items-start gap-3 py-4">
                    <div className="min-w-0 flex-1">
                      <p className="text-sm font-bold">{line.name}</p>
                      <p className="mt-0.5 text-xs text-mist-500">{line.model}</p>
                      <p className="mt-1 text-sm font-extrabold">
                        {value === undefined ? (
                          <span className="text-xs font-semibold text-mist-500">לתמחור בוואטסאפ</span>
                        ) : (
                          formatPrice(value)
                        )}
                      </p>
                    </div>

                    <div className="flex shrink-0 items-center gap-1">
                      <QuantityButton
                        label={`הפחתת כמות של ${line.name}`}
                        onClick={() => setQuantity(line.slug, line.model, line.quantity - 1)}
                      >
                        −
                      </QuantityButton>
                      <span
                        aria-label={`כמות: ${line.quantity}`}
                        className="w-8 text-center text-sm font-bold tabular-nums"
                      >
                        {line.quantity}
                      </span>
                      <QuantityButton
                        label={`הוספת כמות של ${line.name}`}
                        onClick={() => setQuantity(line.slug, line.model, line.quantity + 1)}
                      >
                        +
                      </QuantityButton>
                      <button
                        type="button"
                        onClick={() => remove(line.slug, line.model)}
                        aria-label={`הסרת ${line.name}`}
                        className="ms-1 grid h-8 w-8 place-items-center rounded-lg text-mist-500 transition-colors hover:text-red-600"
                      >
                        <CloseIcon className="h-4 w-4" />
                      </button>
                    </div>
                  </li>
                );
              })}
            </ul>

            <div className="border-t border-ink-700 px-5 py-4">
              {count >= BULK_THRESHOLD ? (
                <p className="mb-3 rounded-xl bg-brand-500/10 px-3 py-2 text-xs font-semibold text-brand-700">
                  {count} יחידות בהזמנה — נשמח לבדוק לכם מחיר לכמות בצ׳אט.
                </p>
              ) : null}

              <div className="flex items-baseline justify-between">
                <span className="text-sm text-mist-300">
                  {count} יחידות
                  {complete ? '' : ' · חלק מהפריטים לתמחור'}
                </span>
                <span className="text-lg font-extrabold">{formatPrice(total)}</span>
              </div>

              <WhatsAppLink
                href={orderLink(lines)}
                className="mt-3 flex items-center justify-center gap-2.5 rounded-full bg-[#25D366] px-6 py-3.5 text-base font-bold text-mist-100 transition-colors hover:bg-[#1fbe5a]"
              >
                <WhatsAppIcon className="h-5 w-5 shrink-0" />
                שליחת ההזמנה בוואטסאפ
              </WhatsAppLink>

              <button
                type="button"
                onClick={clear}
                className="mt-2 w-full rounded-lg py-2 text-xs font-semibold text-mist-500 transition-colors hover:text-mist-100"
              >
                ניקוי הרשימה
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <div className="fixed inset-x-0 bottom-0 z-50 border-t border-ink-700 bg-white/95 backdrop-blur-lg">
        <div className="mx-auto flex max-w-6xl items-center gap-3 px-4 py-3 sm:px-6">
          <button
            type="button"
            onClick={() => setOpen(true)}
            className="flex min-w-0 flex-1 items-baseline gap-2 rounded-lg text-start"
          >
            <span className="text-sm font-extrabold">{count} יחידות</span>
            <span className="truncate text-sm text-mist-300">
              {formatPrice(total)}
              {complete ? '' : '+'}
            </span>
            <span className="text-xs font-semibold text-brand-700 underline">עריכה</span>
          </button>

          <WhatsAppLink
            href={orderLink(lines)}
            className="inline-flex shrink-0 items-center gap-2 rounded-full bg-[#25D366] px-5 py-3 text-sm font-bold text-mist-100 transition-colors hover:bg-[#1fbe5a]"
          >
            <WhatsAppIcon className="h-4 w-4 shrink-0" />
            שליחת ההזמנה
          </WhatsAppLink>
        </div>
      </div>
    </>
  );
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
      className="grid h-8 w-8 place-items-center rounded-lg border border-ink-600 text-base font-bold text-mist-100 transition-colors hover:border-brand-500 hover:text-brand-700"
    >
      {children}
    </button>
  );
}
