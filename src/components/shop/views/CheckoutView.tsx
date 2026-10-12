'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { CITIES } from '@/lib/shop/cities';
import { ils, isEmail, isPhone, priceCart } from '@/lib/shop/logic';
import { activeProvider, demoReference, PAYMENT_METHODS } from '@/lib/shop/payments';
import { actions, useCurrentUser, useShop, type CheckoutInput } from '@/lib/shop/store';
import type { Order, PaymentMethodId, ShippingMethodId } from '@/lib/shop/types';
import { ShopFrame } from '../Chrome';
import { IconBox, IconCart, IconCheck, IconChevron, IconLock, IconWallet } from '../icons';
import { btn, EmptyState, Img, inputCls, Price } from '../ui';

type Step = 'shipping' | 'payment';
const OTHER = '__other';

const STEPS = [
  { key: 'shipping', label: 'משלוח', Icon: IconBox },
  { key: 'payment', label: 'תשלום', Icon: IconWallet },
  { key: 'done', label: 'אישור', Icon: IconCheck },
] as const;

function Stepper({ step }: { step: Step }) {
  const at = step === 'shipping' ? 0 : 1;
  return (
    <ol className="mx-auto flex max-w-[300px] items-start justify-between">
      {STEPS.map(({ key, label, Icon }, i) => {
        const done = i < at;
        const cur = i === at;
        return (
          <li key={key} className="relative flex flex-1 flex-col items-center gap-1.5">
            {i < STEPS.length - 1 && (
              <span className={`absolute top-[19px] right-[calc(50%+22px)] left-[calc(-50%+22px)] h-0.5 ${i < at ? 'bg-x-blue' : 'bg-x-line'}`} />
            )}
            <span
              aria-current={cur ? 'step' : undefined}
              className={`grid size-10 place-items-center rounded-full border-2 ${
                cur ? 'border-x-blue bg-x-blue text-white shadow-[0_4px_12px_rgb(47_93_251/0.35)]' : done ? 'border-x-blue bg-white text-x-blue' : 'border-x-line bg-white text-x-muted'
              }`}
            >
              {done ? <IconCheck size={19} /> : <Icon size={19} />}
            </span>
            <span className={`text-[12px] font-semibold ${cur || done ? 'text-x-ink' : 'text-x-muted'}`}>{label}</span>
          </li>
        );
      })}
    </ol>
  );
}

export function CheckoutView() {
  const s = useShop();
  const user = useCurrentUser();
  const router = useRouter();
  const { settings } = s.db;
  const [step, setStep] = useState<Step>('shipping');
  const [form, setForm] = useState<CheckoutInput>({
    fullName: '',
    email: '',
    phone: '',
    city: '',
    street: '',
    zip: '',
    notes: '',
    shippingMethod: 'standard',
    paymentMethod: 'card',
    saveAddress: true,
  });
  const [cityChoice, setCityChoice] = useState('');
  const [errors, setErrors] = useState<Partial<Record<keyof CheckoutInput, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [agree, setAgree] = useState(false);
  const [pending, setPending] = useState<Order | null>(null);

  // Prefill from the signed-in account (and its first saved address).
  useEffect(() => {
    if (!user) return;
    const a = user.addresses[0];
    setForm((f) => ({
      ...f,
      fullName: f.fullName || user.name,
      email: f.email || user.email,
      phone: f.phone || a?.phone || user.phone,
      city: f.city || a?.city || '',
      street: f.street || a?.street || '',
      zip: f.zip || a?.zip || '',
    }));
    if (a?.city) setCityChoice(CITIES.includes(a.city) ? a.city : OTHER);
  }, [user]);

  const totals = priceCart(s.cart.lines, s.db.products, s.cart.coupon, settings.coupons, settings.shippingMethods, form.shippingMethod);
  const needsAddress = !totals.allDigital && form.shippingMethod !== 'pickup';
  const set = <K extends keyof CheckoutInput>(k: K, v: CheckoutInput[K]) => {
    setForm((f) => ({ ...f, [k]: v }));
    setErrors((e) => ({ ...e, [k]: undefined }));
  };

  if (s.ready && !totals.lines.length && !pending) {
    return (
      <ShopFrame nav={false} back="/shop/cart" title="תשלום">
        <EmptyState icon={<IconCart size={34} />} title="העגלה ריקה" text="אין מה לשלם עליו עדיין." action={{ label: 'לחנות', href: '/shop/c/all' }} />
      </ShopFrame>
    );
  }

  const validateShipping = () => {
    const e: typeof errors = {};
    if (form.fullName.trim().length < 2) e.fullName = 'נא להזין שם מלא';
    if (!isPhone(form.phone)) e.phone = 'מספר טלפון לא תקין';
    if (!isEmail(form.email)) e.email = 'כתובת אימייל לא תקינה';
    if (needsAddress && !form.street.trim()) e.street = 'נא להזין כתובת';
    if (needsAddress && !form.city.trim()) e.city = 'נא לבחור עיר';
    setErrors(e);
    return Object.keys(e).length === 0;
  };

  const pay = () => {
    setFormError(null);
    if (!agree) return setFormError('יש לאשר את תנאי השימוש ומדיניות הפרטיות');
    const r = actions.createOrder(form);
    if (!r.ok) return setFormError(r.error);
    // Real provider: redirect to its hosted page here. Demo: an explicit step.
    setPending(r.value);
  };

  return (
    <ShopFrame nav={false} back="/shop/cart" title="תשלום">
      <div className="mx-auto max-w-6xl px-4 pt-2 lg:px-8 lg:pt-8">
        <Stepper step={step} />
        <div className="mt-6 lg:grid lg:grid-cols-[1fr_380px] lg:items-start lg:gap-10">
          <div>
            {step === 'shipping' ? (
              <form
                noValidate
                onSubmit={(e) => {
                  e.preventDefault();
                  if (validateShipping()) {
                    setStep('payment');
                    window.scrollTo({ top: 0 });
                  }
                }}
                className="space-y-3"
              >
                <h1 className="mb-4 text-left text-[24px] font-black">פרטי משלוח</h1>
                {user && user.addresses.length > 1 && (
                  <div className="flex flex-wrap gap-2">
                    {user.addresses.map((a) => (
                      <button
                        key={a.id}
                        type="button"
                        onClick={() => {
                          setForm((f) => ({ ...f, city: a.city, street: a.street, zip: a.zip, phone: a.phone || f.phone }));
                          setCityChoice(CITIES.includes(a.city) ? a.city : OTHER);
                        }}
                        className={`rounded-full px-3.5 py-2 text-[13px] font-semibold ${form.street === a.street && form.city === a.city ? 'bg-x-blue-50 text-x-blue' : 'bg-x-soft'}`}
                      >
                        {a.label}: {a.street}, {a.city}
                      </button>
                    ))}
                  </div>
                )}
                <Input label="שם מלא" value={form.fullName} onChange={(v) => set('fullName', v)} error={errors.fullName} autoComplete="name" />
                <Input label="טלפון" value={form.phone} onChange={(v) => set('phone', v)} error={errors.phone} autoComplete="tel" inputMode="tel" type="tel" />
                <Input label="אימייל (לאישור ההזמנה)" value={form.email} onChange={(v) => set('email', v)} error={errors.email} autoComplete="email" inputMode="email" type="email" dir="ltr" />
                {needsAddress && (
                  <>
                    <Input label="כתובת (רחוב ומספר בית)" value={form.street} onChange={(v) => set('street', v)} error={errors.street} autoComplete="street-address" />
                    <label className="block">
                      <span className="sr-only">עיר</span>
                      <div className="relative">
                        <select
                          value={cityChoice}
                          onChange={(e) => {
                            setCityChoice(e.target.value);
                            set('city', e.target.value === OTHER ? '' : e.target.value);
                          }}
                          aria-invalid={!!errors.city}
                          className={`${inputCls} appearance-none ${cityChoice ? '' : 'text-x-faint'} ${errors.city ? 'border-x-red' : ''}`}
                        >
                          <option value="">עיר — בחר עיר</option>
                          {CITIES.map((c) => (
                            <option key={c} value={c}>
                              {c}
                            </option>
                          ))}
                          <option value={OTHER}>עיר / יישוב אחר…</option>
                        </select>
                        <IconChevron dir="down" size={18} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-x-ink" />
                      </div>
                      {errors.city && <span className="mt-1 block text-xs font-medium text-x-red">{errors.city}</span>}
                    </label>
                    {cityChoice === OTHER && <Input label="שם היישוב" value={form.city} onChange={(v) => set('city', v)} autoComplete="address-level2" />}
                    <Input label="מיקוד (אופציונלי)" value={form.zip} onChange={(v) => set('zip', v)} autoComplete="postal-code" inputMode="numeric" />
                  </>
                )}
                <label className="block">
                  <span className="sr-only">הערות (אופציונלי)</span>
                  <textarea
                    value={form.notes}
                    onChange={(e) => set('notes', e.target.value)}
                    placeholder="הערות (אופציונלי)"
                    rows={2}
                    className={`${inputCls} h-auto min-h-13 py-3.5`}
                  />
                </label>
                {!totals.allDigital && (
                  <fieldset className="pt-2">
                    <legend className="mb-2 text-[15px] font-extrabold">שיטת משלוח</legend>
                    <div className="space-y-2">
                      {settings.shippingMethods.map((m) => {
                        const on = form.shippingMethod === m.id;
                        const cost = priceCart(s.cart.lines, s.db.products, s.cart.coupon, settings.coupons, settings.shippingMethods, m.id).shipping;
                        return (
                          <label
                            key={m.id}
                            className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-3.5 transition ${on ? 'border-x-blue bg-x-blue-50/60' : 'border-x-line'}`}
                          >
                            <input type="radio" name="ship" checked={on} onChange={() => set('shippingMethod', m.id as ShippingMethodId)} className="size-4.5 accent-x-blue" />
                            <span className="flex-1">
                              <span className="block text-[15px] font-bold">{m.name}</span>
                              <span className="block text-[12px] text-x-muted">{m.eta}</span>
                            </span>
                            <span className="text-[15px] font-extrabold">{cost === 0 ? 'חינם' : ils(cost)}</span>
                          </label>
                        );
                      })}
                    </div>
                  </fieldset>
                )}
                {user && needsAddress && (
                  <label className="flex items-center gap-2 text-[14px]">
                    <input type="checkbox" checked={form.saveAddress} onChange={(e) => set('saveAddress', e.target.checked)} className="size-4 accent-x-blue" />
                    שמירת הכתובת בחשבון שלי
                  </label>
                )}
                {!user && (
                  <p className="rounded-2xl bg-x-soft px-4 py-3 text-[13px] text-x-muted">
                    יש לך חשבון?{' '}
                    <Link href="/shop/login?next=/shop/checkout" className="font-bold text-x-blue">
                      התחברות
                    </Link>{' '}
                    לשמירת ההזמנה וכתובות. אפשר גם להמשיך כאורח.
                  </p>
                )}
                <button type="submit" className={`${btn.primary} mt-3 h-14 w-full text-[18px]`}>
                  המשך לתשלום
                </button>
              </form>
            ) : (
              <div className="space-y-5">
                <div className="flex items-center justify-between">
                  <h1 className="text-[24px] font-black">אמצעי תשלום</h1>
                  <button type="button" onClick={() => setStep('shipping')} className="text-[14px] font-bold text-x-blue">
                    עריכת פרטי משלוח
                  </button>
                </div>
                <div className="rounded-2xl bg-x-soft px-4 py-3 text-[13px] leading-relaxed text-x-ink-2">
                  <b>{form.fullName}</b> · <span dir="ltr">{form.phone}</span>
                  <br />
                  {needsAddress ? `${form.street}, ${form.city}` : form.shippingMethod === 'pickup' ? 'איסוף עצמי' : 'מוצר דיגיטלי — נשלח במייל'} · {form.email}
                </div>
                <fieldset>
                  <legend className="sr-only">בחירת אמצעי תשלום</legend>
                  <div className="space-y-2">
                    {PAYMENT_METHODS.map((m) => {
                      const on = form.paymentMethod === m.id;
                      return (
                        <label
                          key={m.id}
                          className={`flex cursor-pointer items-center gap-3 rounded-2xl border px-4 py-4 transition ${on ? 'border-x-blue bg-x-blue-50/60' : 'border-x-line'}`}
                        >
                          <input type="radio" name="pay" checked={on} onChange={() => set('paymentMethod', m.id as PaymentMethodId)} className="size-4.5 accent-x-blue" />
                          <span className="flex-1">
                            <span className="block text-[15px] font-bold">{m.name}</span>
                            <span className="block text-[12px] text-x-muted">{m.note}</span>
                          </span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <p className="flex items-start gap-2 text-[13px] text-x-muted">
                  <IconLock size={18} className="mt-0.5 shrink-0 text-x-green" />
                  פרטי כרטיס האשראי מוזנים רק בעמוד המאובטח של חברת הסליקה ואינם נשמרים באתר.
                </p>
                {!activeProvider.live && (
                  <p className="rounded-2xl border border-dashed border-x-violet/50 bg-[#f5f2ff] px-4 py-3 text-[13px] font-semibold text-x-violet-600">
                    {activeProvider.label}. עד לחיבור ספק סליקה מאושר, אישור התשלום מתבצע בחלון הדגמה.
                  </p>
                )}
                <label className="flex items-start gap-2 text-[14px]">
                  <input type="checkbox" checked={agree} onChange={(e) => setAgree(e.target.checked)} className="mt-1 size-4 accent-x-blue" />
                  <span>קראתי ואני מסכים/ה לתנאי השימוש ולמדיניות הפרטיות</span>
                </label>
                {formError && (
                  <p role="alert" className="rounded-xl bg-[#fdeced] px-4 py-3 text-[14px] font-semibold text-x-red">
                    {formError}
                  </p>
                )}
                <button type="button" onClick={pay} className={`${btn.primary} h-14 w-full text-[18px]`}>
                  <IconLock size={20} />
                  לתשלום מאובטח · {ils(totals.total)}
                </button>
              </div>
            )}
          </div>

          <aside className="mt-8 rounded-[22px] bg-x-soft-2 p-4 ring-1 ring-x-line/60 lg:sticky lg:top-24 lg:mt-0 lg:bg-white lg:p-6 lg:shadow-x-card">
            <h2 className="mb-3 text-[17px] font-extrabold">סיכום הזמנה</h2>
            <ul className="space-y-3">
              {totals.lines.map((l) => (
                <li key={l.key} className="flex items-center gap-3">
                  <span className="relative size-14 shrink-0 overflow-hidden rounded-xl bg-white">
                    <Img path={l.image} alt="" className="size-full object-cover" />
                    <span className="absolute -top-0 -left-0 grid size-5 place-items-center rounded-br-lg bg-x-ink text-[11px] font-bold text-white">{l.qty}</span>
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-[14px] font-bold">{l.product.name}</span>
                    {l.colorName && <span className="block text-[12px] text-x-muted">צבע: {l.colorName}</span>}
                  </span>
                  <Price value={l.lineTotal} className="text-[14px]" />
                </li>
              ))}
            </ul>
            <dl className="mt-4 space-y-2 border-t border-x-line pt-3 text-[14px]">
              <div className="flex justify-between">
                <dt className="text-x-muted">סכום ביניים</dt>
                <dd className="font-bold">{ils(totals.subtotal)}</dd>
              </div>
              {totals.discount > 0 && (
                <div className="flex justify-between text-x-green">
                  <dt>הנחה ({totals.coupon?.code})</dt>
                  <dd className="font-bold">- {ils(totals.discount)}</dd>
                </div>
              )}
              {!totals.allDigital && (
                <div className="flex justify-between">
                  <dt className="text-x-muted">משלוח</dt>
                  <dd className="font-bold">{totals.shipping ? ils(totals.shipping) : 'חינם'}</dd>
                </div>
              )}
              <div className="flex items-center justify-between border-t border-x-line pt-3">
                <dt className="text-[16px] font-black">סה&quot;כ לתשלום</dt>
                <dd>
                  <Price value={totals.total} className="text-[22px]" />
                </dd>
              </div>
            </dl>
          </aside>
        </div>
      </div>

      {pending && (
        <DemoPaymentDialog
          order={pending}
          onApprove={() => {
            const r = actions.confirmPayment(pending.id, demoReference(pending));
            if (r.ok) router.replace(`/shop/order?id=${encodeURIComponent(pending.id)}`);
            else setFormError(r.error);
          }}
          onFail={(reason) => {
            actions.cancelPendingOrder(pending.id);
            setPending(null);
            setFormError(reason);
          }}
        />
      )}
    </ShopFrame>
  );
}

function Input({
  label,
  value,
  onChange,
  error,
  ...rest
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  error?: string;
} & Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'>) {
  return (
    <label className="block">
      <span className="sr-only">{label}</span>
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={label}
        aria-invalid={!!error}
        className={`${inputCls} ${rest.dir === 'ltr' ? 'text-right placeholder:text-right' : ''} ${error ? 'border-x-red' : ''}`}
        {...rest}
      />
      {error && <span className="mt-1 block text-xs font-medium text-x-red">{error}</span>}
    </label>
  );
}

/**
 * Stands in for the payment provider's hosted page until one is connected.
 * Nothing here collects card data; it only lets the tester approve or
 * decline, exactly as the provider's callback would.
 */
function DemoPaymentDialog({ order, onApprove, onFail }: { order: Order; onApprove: () => void; onFail: (reason: string) => void }) {
  const [busy, setBusy] = useState(false);
  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-x-ink/50 p-4 animate-x-fade" role="dialog" aria-modal="true" aria-labelledby="pay-title">
      <div className="w-full max-w-sm rounded-[24px] bg-white p-6 text-center shadow-x-pop">
        <span className="mx-auto grid size-14 place-items-center rounded-full bg-x-blue-50 text-x-blue">
          <IconLock size={28} />
        </span>
        <h2 id="pay-title" className="mt-3 text-[20px] font-black">
          עמוד תשלום מאובטח
        </h2>
        <p className="mt-1 text-[13px] font-semibold text-x-violet-600">מצב הדגמה — לא מתבצע חיוב אמיתי</p>
        <p className="mt-4 text-[14px] text-x-muted">הזמנה #{order.number}</p>
        <p className="text-[30px] font-black">
          <span dir="rtl">{ils(order.total)}</span>
        </p>
        <button
          type="button"
          disabled={busy}
          onClick={() => {
            setBusy(true);
            // Simulates the provider's round-trip before its callback arrives.
            setTimeout(onApprove, 900);
          }}
          className={`${btn.primary} mt-5 h-13 w-full text-[16px]`}
        >
          {busy ? 'מאשר תשלום…' : 'אישור תשלום (הדגמה)'}
        </button>
        <div className="mt-3 flex gap-2">
          <button type="button" disabled={busy} onClick={() => onFail('התשלום נדחה על ידי חברת הסליקה (בדיקה). לא בוצע חיוב — אפשר לנסות שוב.')} className={`${btn.ghost} h-11 flex-1 text-[14px]`}>
            סירוב (בדיקה)
          </button>
          <button type="button" disabled={busy} onClick={() => onFail('התשלום בוטל. ההזמנה לא בוצעה.')} className={`${btn.ghost} h-11 flex-1 text-[14px]`}>
            ביטול
          </button>
        </div>
      </div>
    </div>
  );
}
