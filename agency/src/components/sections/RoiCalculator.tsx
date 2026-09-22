'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { roi as copy } from '@/content/copy';
import { track } from '@/lib/analytics';
import { formatNumber } from '@/lib/format';
import { setRoiContext } from '@/lib/intent';
import { CtaLink } from '@/components/ui/CtaLink';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { ArrowEndIcon, WhatsAppIcon } from '@/components/ui/icons';

const DEFAULT_VALUE = 1000;
const DEFAULT_CUSTOMERS = 10;

/** "כמה לקוח חדש שווה לעסק שלכם?" — live, no button, honest disclaimer. */
export function RoiCalculator() {
  const id = useId();
  const [value, setValue] = useState<string>(String(DEFAULT_VALUE));
  const [customers, setCustomers] = useState<string>(String(DEFAULT_CUSTOMERS));
  const [flash, setFlash] = useState(false);
  const firstChange = useRef(true);
  const debounce = useRef<number>(0);

  const v = Number(value);
  const c = Number(customers);
  const valid = Number.isFinite(v) && Number.isFinite(c) && v > 0 && c > 0;
  const monthly = valid ? Math.round(v * c) : 0;
  const yearly = monthly * 12;
  const contextString = valid ? `${formatNumber(c)} × ${formatNumber(v)} ₪ = ${formatNumber(monthly)} ₪` : '';

  const flashTimer = useRef<number>(0);
  useEffect(() => () => window.clearTimeout(flashTimer.current), []);

  const onChange = () => {
    setFlash(true);
    window.clearTimeout(flashTimer.current);
    flashTimer.current = window.setTimeout(() => setFlash(false), 320);
    window.clearTimeout(debounce.current);
    const fire = () => track('roi_calculate', { deal_value: v, customers: c, monthly_result: monthly });
    if (firstChange.current) {
      firstChange.current = false;
      fire();
    } else {
      debounce.current = window.setTimeout(fire, 800);
    }
  };

  const rememberContext = () => {
    if (valid) setRoiContext(contextString);
  };

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
            min={0}
            step={50}
            dir="ltr"
            value={value}
            aria-describedby={`${id}-value-help`}
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
            min={0}
            step={1}
            dir="ltr"
            value={customers}
            aria-describedby={`${id}-customers-help`}
            onChange={(e) => {
              setCustomers(e.target.value);
              onChange();
            }}
          />
          <input
            type="range"
            min={1}
            max={50}
            step={1}
            value={Math.min(50, Math.max(1, Number(customers) || 1))}
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
                <bdi dir="ltr">{formatNumber(monthly)} ₪</bdi>
              </p>
              <p className="mt-3 text-sm text-navy-muted">
                <bdi dir="ltr">
                  {formatNumber(c)} × {formatNumber(v)} ₪
                </bdi>
                {' · '}
                <bdi dir="ltr">≈ {formatNumber(yearly)} ₪</bdi> {copy.yearly}
              </p>
            </>
          ) : (
            <p className="mt-2 text-[15px] text-navy-muted">{copy.empty}</p>
          )}
        </div>
        <p className="mt-3 text-[13px] leading-relaxed text-navy-subtle">{copy.disclaimer}</p>

        <div className="mt-5 flex flex-col gap-3 sm:flex-row lg:mt-auto lg:pt-5">
          <CtaLink location="roi" label={copy.cta} href="#contact" className="btn btn-primary" intent={undefined}>
            <span onClick={rememberContext} className="contents">
              {copy.cta}
            </span>
            <ArrowEndIcon className="h-4 w-4" />
          </CtaLink>
          <WhatsAppLink context="roi" location="roi" className="btn btn-outline-light">
            <WhatsAppIcon className="h-5 w-5 text-whatsapp" />
            WhatsApp
          </WhatsAppLink>
        </div>
      </div>
    </div>
  );
}
