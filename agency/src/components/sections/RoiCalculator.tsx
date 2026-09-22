'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { roi as copy } from '@/content/copy';
import { track } from '@/lib/analytics';
import { formatNumber } from '@/lib/format';
import { setRoiContext } from '@/lib/intent';
import { hasWhatsApp, whatsappHref } from '@/lib/whatsapp';
import { CtaLink } from '@/components/ui/CtaLink';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { ArrowEndIcon, WhatsAppIcon } from '@/components/ui/icons';

const VALUE = { default: 1000, min: 100, max: 50000, step: 50 };
const CUSTOMERS = { default: 10, min: 1, max: 100, step: 1 };

const clamp = (n: number, min: number, max: number) => Math.min(max, Math.max(min, n));

/** "כמה לקוח חדש שווה לעסק שלכם?" — live, no button, honest disclaimer. */
export function RoiCalculator() {
  const id = useId();
  const [value, setValue] = useState<string>(String(VALUE.default));
  const [customers, setCustomers] = useState<string>(String(CUSTOMERS.default));
  const [flash, setFlash] = useState(false);
  const touched = useRef(false);
  const firstEvent = useRef(true);
  const debounce = useRef<number>(0);
  const flashTimer = useRef<number>(0);

  const v = Number(value);
  const c = Number(customers);
  const filled = value.trim() !== '' && customers.trim() !== '';
  const valid = Number.isFinite(v) && Number.isFinite(c) && v > 0 && c > 0;
  const monthly = valid ? Math.round(v * c) : 0;
  const yearly = monthly * 12;
  const contextString = valid ? `${formatNumber(c)} לקוחות × ${formatNumber(v)} ₪ = ${formatNumber(monthly)} ₪` : '';

  // Tracking reads the derived values after the render that produced them —
  // never the stale closure from the change handler.
  useEffect(() => {
    if (!touched.current || !valid) return;
    window.clearTimeout(debounce.current);
    const fire = () => track('roi_calculate', { deal_value: v, customers: c, monthly_result: monthly });
    if (firstEvent.current) {
      firstEvent.current = false;
      fire();
    } else {
      debounce.current = window.setTimeout(fire, 800);
    }
    return () => window.clearTimeout(debounce.current);
  }, [v, c, monthly, valid]);

  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const onChange = () => {
    touched.current = true;
    setFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 320);
  };

  const rememberContext = () => {
    if (valid) setRoiContext(contextString);
  };

  const whatsappText = valid
    ? copy.whatsappMessage(formatNumber(monthly), formatNumber(c), formatNumber(v))
    : undefined;

  return (
    <div className="mx-auto max-w-[880px] rounded-[var(--radius-xl)] border border-light-border bg-white p-5 shadow-card sm:p-8 lg:grid lg:grid-cols-[5fr_4fr] lg:gap-10">
      <div className="grid gap-6">
        <div className="field">
          <label htmlFor={`${id}-value`} className="!text-navy">
            {copy.valueLabel}
          </label>
          <input
            id={`${id}-value`}
            className="input input-light tabular"
            type="number"
            inputMode="decimal"
            min={VALUE.min}
            max={VALUE.max}
            step={VALUE.step}
            dir="ltr"
            value={value}
            aria-describedby={`${id}-value-help`}
            onChange={(e) => {
              setValue(e.target.value);
              onChange();
            }}
            onBlur={() => {
              if (value.trim() !== '' && Number.isFinite(v)) setValue(String(clamp(v, VALUE.min, VALUE.max)));
            }}
          />
          <input
            type="range"
            min={VALUE.min}
            max={VALUE.max}
            step={VALUE.step}
            value={clamp(Number(value) || VALUE.min, VALUE.min, VALUE.max)}
            aria-label={copy.valueLabel}
            className="w-full accent-[#2563eb]"
            onChange={(e) => {
              setValue(e.target.value);
              onChange();
            }}
          />
          <p id={`${id}-value-help`} className="text-[13px] text-navy-subtle">
            {copy.valueHelper}
          </p>
        </div>

        <div className="field">
          <label htmlFor={`${id}-customers`} className="!text-navy">
            {copy.customersLabel}
          </label>
          <input
            id={`${id}-customers`}
            className="input input-light tabular"
            type="number"
            inputMode="numeric"
            min={CUSTOMERS.min}
            max={CUSTOMERS.max}
            step={CUSTOMERS.step}
            dir="ltr"
            value={customers}
            aria-describedby={`${id}-customers-help`}
            onChange={(e) => {
              setCustomers(e.target.value);
              onChange();
            }}
            onBlur={() => {
              if (customers.trim() !== '' && Number.isFinite(c)) {
                setCustomers(String(clamp(Math.round(c), CUSTOMERS.min, CUSTOMERS.max)));
              }
            }}
          />
          <input
            type="range"
            min={CUSTOMERS.min}
            max={50}
            step={CUSTOMERS.step}
            value={clamp(Number(customers) || CUSTOMERS.min, CUSTOMERS.min, 50)}
            aria-label={copy.customersLabel}
            className="w-full accent-[#2563eb]"
            onChange={(e) => {
              setCustomers(e.target.value);
              onChange();
            }}
          />
          <p id={`${id}-customers-help`} className="text-[13px] text-navy-subtle">
            {copy.customersHelper}
          </p>
        </div>
      </div>

      <div className="mt-6 flex flex-col lg:mt-0">
        <div
          className={`rounded-[var(--radius-lg)] bg-light p-6 ${flash ? 'result-flash' : ''}`}
          role="status"
          aria-live="polite"
          style={{ minHeight: 168 }}
        >
          <p className="text-sm text-navy-subtle">{copy.resultLabel}</p>
          {valid ? (
            <>
              <p className="tabular mt-2 text-4xl font-bold leading-none text-navy">
                <bdi>{formatNumber(monthly)} ₪</bdi>
              </p>
              <p className="tabular mt-3 text-sm text-navy-muted">
                {formatNumber(c)} {copy.customersUnit} × <bdi>{formatNumber(v)} ₪</bdi>
              </p>
              <p className="tabular mt-1 text-sm text-navy-muted">
                כ-<bdi>{formatNumber(yearly)} ₪</bdi> {copy.yearly}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[15px] text-navy-muted">{filled ? copy.invalid : copy.empty}</p>
          )}
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-navy-subtle">{copy.disclaimer}</p>

        <div className="mt-5 lg:mt-auto lg:pt-5">
          {valid ? (
            <p className="mb-3 text-[15px] font-semibold text-navy">{copy.dynamicCta(formatNumber(c))}</p>
          ) : null}
          <div className="flex flex-col gap-3 sm:flex-row">
            <CtaLink
              location="roi"
              label={copy.cta}
              events={['roi_cta_click']}
              extra={{ monthly_result: monthly }}
              onBeforeNavigate={rememberContext}
              className="btn btn-primary"
            >
              {copy.cta}
              <ArrowEndIcon className="h-4 w-4" />
            </CtaLink>
            {hasWhatsApp ? (
              <WhatsAppLink
                context="roi"
                href={whatsappText ? whatsappHref(whatsappText) : undefined}
                location="roi"
                events={['roi_cta_click']}
                extra={{ monthly_result: monthly }}
                className="btn btn-outline-light"
              >
                <WhatsAppIcon className="h-5 w-5 text-whatsapp" />
                {copy.whatsappCta}
              </WhatsAppLink>
            ) : null}
          </div>
        </div>
      </div>
    </div>
  );
}
