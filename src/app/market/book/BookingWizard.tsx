'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { useMemo, useState } from 'react';
import { useLang } from '@/components/market/LanguageProvider';
import { Btn, Card, Field, Skeleton, inputClass } from '@/components/market/ui';
import { trackEvent } from '@/lib/market/analytics';
import { market, shekel } from '@/lib/market/config';
import { addonPriceAgorot, couponDiscount, createBooking } from '@/lib/market/engine';
import { useCollection } from '@/lib/market/hooks';
import { useMarketSession } from '@/lib/market/session';
import { computeQuote } from '@/lib/market/services';
import type { Service, ServiceQuestion } from '@/lib/market/types';

/**
 * The booking wizard: details → photos & timing → price & dispatch mode.
 * The primary CTA is always "מצא לי מנקה" (auto-matching); choosing a pro or
 * collecting bids are the secondary paths.
 */
export function BookingWizard() {
  const router = useRouter();
  const params = useSearchParams();
  const { t } = useLang();
  const session = useMarketSession();

  const { rows: services, loading } = useCollection('services');
  const { rows: coupons } = useCollection('coupons');
  const { rows: bookings } = useCollection('bookings');
  const { rows: pros } = useCollection('professionals');

  const serviceId = params.get('service') ?? 'sofa-cleaning';
  const chosenProId = params.get('pro');
  const service = services.find((s) => s.id === serviceId);
  const chosenPro = chosenProId ? pros.find((p) => p.id === chosenProId) : null;

  const [step, setStep] = useState(0);
  const [address, setAddress] = useState(params.get('address') ?? '');
  const [answers, setAnswers] = useState<Record<string, number | boolean | string>>({});
  const [photos, setPhotos] = useState<string[]>([]);
  const [notes, setNotes] = useState('');
  const [when, setWhen] = useState<'now' | 'scheduled'>('now');
  const [scheduledFor, setScheduledFor] = useState('');
  const [couponCode, setCouponCode] = useState('');
  const [couponError, setCouponError] = useState('');
  const [discount, setDiscount] = useState(0);
  const [addon, setAddon] = useState(false);
  const [creating, setCreating] = useState(false);

  const quote = useMemo(() => {
    if (!service) return null;
    const q = computeQuote(service, answers);
    trackEvent('QuoteViewed', { serviceId: service.id });
    return q;
  }, [service, answers]);

  /** The upsell: suggest a mattress add-on to sofa bookings (and vice versa). */
  const addonService = useMemo(() => {
    const target = serviceId === 'mattress-cleaning' ? 'sofa-cleaning' : 'mattress-cleaning';
    return services.find((s) => s.id === target && !s.comingSoon) ?? null;
  }, [services, serviceId]);

  if (loading || !service || !quote) {
    return (
      <div className="mx-auto max-w-lg space-y-3 px-4 py-8">
        <Skeleton className="h-10" />
        <Skeleton className="h-48" />
        <Skeleton className="h-12" />
      </div>
    );
  }

  const applyCoupon = () => {
    setCouponError('');
    setDiscount(0);
    const coupon = coupons.find((c) => c.code.toLowerCase() === couponCode.trim().toLowerCase());
    if (!coupon) {
      setCouponError('קופון לא נמצא');
      return;
    }
    const isNewCustomer = !bookings.some(
      (b) => b.customerId === session.customerId && ['paid', 'reviewed', 'completed'].includes(b.status),
    );
    const result = couponDiscount(coupon, quote.highAgorot, {
      serviceId,
      areaId: null,
      isNewCustomer,
    });
    if (result.ok) setDiscount(result.discountAgorot);
    else setCouponError(result.reason);
  };

  const addPhoto = (file: File) => {
    const reader = new FileReader();
    reader.onload = () => setPhotos((p) => [...p.slice(-3), String(reader.result)]);
    reader.readAsDataURL(file);
  };

  const submit = async (mode: 'auto' | 'chosen' | 'bidding') => {
    if (creating) return;
    setCreating(true);
    try {
      const booking = await createBooking({
        customerId: session.customerId,
        customerName: session.customerName,
        customerPhone: session.customerPhone,
        serviceId,
        address: address.trim() || 'באר שבע',
        answers,
        photos,
        notes,
        scheduledFor: when === 'scheduled' && scheduledFor ? new Date(scheduledFor).toISOString() : null,
        mode,
        chosenProId: mode === 'chosen' ? (chosenProId ?? undefined) : undefined,
        couponCode: discount > 0 ? couponCode.trim() : null,
        discountAgorot: discount,
        addonServiceId: addon && addonService ? addonService.id : null,
      });
      trackEvent('BookingCompleted', { serviceId, mode });
      router.push(`/market/orders/${booking.id}`);
    } catch {
      setCreating(false);
    }
  };

  const steps = ['פרטי העבודה', 'תמונות וזמן', 'מחיר והזמנה'];
  const addonPrice = addonService ? addonPriceAgorot(addonService.basePriceAgorot) : 0;

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      {/* Progress */}
      <div className="mb-5 flex items-center gap-2">
        <button onClick={() => (step === 0 ? router.back() : setStep(step - 1))} className="rounded-full p-2 text-slate-500 hover:bg-slate-100" aria-label={t('back')}>
          →
        </button>
        <div className="flex flex-1 gap-1.5">
          {steps.map((label, i) => (
            <div key={label} className="flex-1">
              <div className={`h-1.5 rounded-full ${i <= step ? 'bg-sky-600' : 'bg-slate-200'}`} />
              <p className={`mt-1 text-center text-[10px] font-bold ${i === step ? 'text-sky-700' : 'text-slate-400'}`}>{label}</p>
            </div>
          ))}
        </div>
      </div>

      <h1 className="mb-4 flex items-center gap-2 text-xl font-black text-slate-900">
        <span className="text-3xl">{service.icon}</span> {service.name}
        {chosenPro && <span className="text-sm font-bold text-slate-500">אצל {chosenPro.businessName}</span>}
      </h1>

      {step === 0 && (
        <Card className="space-y-4 p-4">
          <Field label="כתובת">
            <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder={t('addressPlaceholder')} className={inputClass} />
          </Field>
          {service.questions.map((q) => (
            <QuestionInput key={q.id} question={q} value={answers[q.id]} onChange={(v) => setAnswers((a) => ({ ...a, [q.id]: v }))} />
          ))}
          <Btn className="w-full py-3" onClick={() => setStep(1)} disabled={address.trim().length < 2}>
            {t('continue')}
          </Btn>
        </Card>
      )}

      {step === 1 && (
        <Card className="space-y-4 p-4">
          <Field label="תמונות (לא חובה — עוזר לתמחור מדויק)">
            <div className="flex flex-wrap gap-2">
              {photos.map((p, i) => (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={p} alt="" className="h-20 w-20 rounded-xl border border-slate-200 object-cover" />
              ))}
              <label className="flex h-20 w-20 cursor-pointer items-center justify-center rounded-xl border-2 border-dashed border-slate-300 text-2xl text-slate-400 hover:border-sky-400">
                +
                <input type="file" accept="image/*" hidden onChange={(e) => e.target.files?.[0] && addPhoto(e.target.files[0])} />
              </label>
            </div>
          </Field>
          <Field label="הערות לבעל המקצוע">
            <textarea value={notes} onChange={(e) => setNotes(e.target.value)} rows={2} className={inputClass} placeholder="קומה, חניה, פרטים על הכתמים…" />
          </Field>
          <Field label="מתי?">
            <div className="grid grid-cols-2 gap-2">
              <button onClick={() => setWhen('now')} className={`rounded-xl border-2 p-3 text-sm font-bold ${when === 'now' ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'}`}>
                ⚡ כמה שיותר מהר
              </button>
              <button onClick={() => setWhen('scheduled')} className={`rounded-xl border-2 p-3 text-sm font-bold ${when === 'scheduled' ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'}`}>
                📅 לקבוע מועד
              </button>
            </div>
            {when === 'scheduled' && (
              <input type="datetime-local" value={scheduledFor} onChange={(e) => setScheduledFor(e.target.value)} className={`${inputClass} mt-2`} />
            )}
          </Field>
          <Btn className="w-full py-3" onClick={() => setStep(2)}>
            {t('continue')}
          </Btn>
        </Card>
      )}

      {step === 2 && (
        <div className="space-y-3">
          <Card className="p-4">
            <p className="text-sm font-bold text-slate-500">{t('estimatedPrice')}</p>
            <p className="text-3xl font-black text-slate-900">
              {shekel(Math.max(0, quote.lowAgorot + (addon ? addonPrice : 0) - discount))}
              <span className="text-lg text-slate-400"> – {shekel(Math.max(0, quote.highAgorot + (addon ? addonPrice : 0) - discount))}</span>
            </p>
            <ul className="mt-3 space-y-1 border-t border-slate-100 pt-3 text-sm text-slate-600">
              {quote.breakdown.map((b, i) => (
                <li key={i} className="flex justify-between">
                  <span>{b.label}</span>
                  <span>{shekel(b.amountAgorot)}</span>
                </li>
              ))}
              {addon && addonService && (
                <li className="flex justify-between text-emerald-700">
                  <span>{addonService.name} (מבצע)</span>
                  <span>{shekel(addonPrice)}</span>
                </li>
              )}
              {discount > 0 && (
                <li className="flex justify-between font-bold text-emerald-700">
                  <span>קופון {couponCode.toUpperCase()}</span>
                  <span>-{shekel(discount)}</span>
                </li>
              )}
            </ul>
            <p className="mt-2 text-[11px] text-slate-400">המחיר הסופי נסגר עם בעל המקצוע בסיום העבודה, בתוך הטווח.</p>
          </Card>

          {addonService && (
            <Card className="flex items-center justify-between p-4">
              <label className="flex cursor-pointer items-center gap-3">
                <input type="checkbox" checked={addon} onChange={(e) => setAddon(e.target.checked)} className="h-5 w-5 accent-sky-600" />
                <span>
                  <span className="block text-sm font-black text-slate-900">
                    {addonService.icon} להוסיף {addonService.name} ב-{shekel(addonPrice)}?
                  </span>
                  <span className="text-xs text-slate-400">
                    במקום {shekel(addonService.basePriceAgorot)} — באותו ביקור
                  </span>
                </span>
              </label>
            </Card>
          )}

          <Card className="p-4">
            <div className="flex gap-2">
              <input value={couponCode} onChange={(e) => setCouponCode(e.target.value)} placeholder="קוד קופון (נסו WELCOME20)" className={inputClass} />
              <Btn variant="secondary" onClick={applyCoupon}>הפעל</Btn>
            </div>
            {couponError && <p className="mt-1 text-xs font-bold text-red-600">{couponError}</p>}
            {discount > 0 && <p className="mt-1 text-xs font-bold text-emerald-600">הקופון הופעל ✓</p>}
          </Card>

          {chosenPro ? (
            <Btn variant="success" className="w-full py-3.5 text-base" disabled={creating} onClick={() => void submit('chosen')}>
              {creating ? 'שולח…' : `הזמן את ${chosenPro.businessName || chosenPro.fullName}`}
            </Btn>
          ) : (
            <>
              <Btn variant="success" className="w-full py-3.5 text-base" disabled={creating} onClick={() => void submit('auto')}>
                {creating ? 'מחפשים…' : `⚡ ${t('findMeCleaner')}`}
              </Btn>
              <div className="grid grid-cols-2 gap-2">
                <Btn variant="secondary" disabled={creating} onClick={() => router.push(`/market/pros?service=${serviceId}&address=${encodeURIComponent(address)}`)}>
                  {t('choosePro')}
                </Btn>
                <Btn variant="secondary" disabled={creating} onClick={() => void submit('bidding')}>
                  קבל הצעות מחיר
                </Btn>
              </div>
            </>
          )}
          <p className="text-center text-[11px] text-slate-400">
            {market.name} גובה תשלום רק כשעבודה מבוצעת · ביטול חינם עד ליציאת בעל המקצוע
          </p>
        </div>
      )}
    </div>
  );
}

function QuestionInput({
  question,
  value,
  onChange,
}: {
  question: ServiceQuestion;
  value: number | boolean | string | undefined;
  onChange: (v: number | boolean | string) => void;
}) {
  if (question.type === 'count') {
    const current = typeof value === 'number' ? value : (question.included ?? question.min ?? 1);
    return (
      <Field label={question.label}>
        <div className="flex items-center gap-3">
          <button onClick={() => onChange(Math.max(question.min ?? 1, current - 1))} className="h-10 w-10 rounded-xl border border-slate-300 text-lg font-black text-slate-600 hover:border-sky-400">−</button>
          <span className="w-8 text-center text-lg font-black text-slate-900">{current}</span>
          <button onClick={() => onChange(Math.min(question.max ?? 20, current + 1))} className="h-10 w-10 rounded-xl border border-slate-300 text-lg font-black text-slate-600 hover:border-sky-400">+</button>
        </div>
      </Field>
    );
  }
  if (question.type === 'bool') {
    return (
      <Field label={question.label}>
        <div className="grid grid-cols-2 gap-2">
          {[
            { v: true, label: 'כן' },
            { v: false, label: 'לא' },
          ].map((opt) => (
            <button key={String(opt.v)} onClick={() => onChange(opt.v)} className={`rounded-xl border-2 p-2.5 text-sm font-bold ${value === opt.v ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'}`}>
              {opt.label}
            </button>
          ))}
        </div>
      </Field>
    );
  }
  return (
    <Field label={question.label}>
      <div className="flex flex-wrap gap-2">
        {question.options?.map((opt) => (
          <button key={opt.id} onClick={() => onChange(opt.id)} className={`rounded-xl border-2 px-3.5 py-2.5 text-sm font-bold ${value === opt.id ? 'border-sky-600 bg-sky-50 text-sky-700' : 'border-slate-200 text-slate-600'}`}>
            {opt.label}
          </button>
        ))}
      </div>
    </Field>
  );
}
