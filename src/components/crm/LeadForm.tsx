'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LightbulbIcon, RepeatIcon, SpinnerIcon } from '@/components/icons';
import {
  SERVICE_OPTIONS,
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
  formatDateHe,
  formatPrice,
  listLeadsByPhone,
  parseService,
  serviceEntry,
  type Lead,
  type LeadInput,
  type LeadSource,
  type LeadStatus,
} from '@/lib/crm/leads';

const inputClass =
  'w-full rounded-xl border border-ink-600 bg-ink-850 px-4 py-3.5 text-base outline-none transition-colors focus:border-brand-500';

function Field({
  label,
  htmlFor,
  children,
}: {
  label: string;
  htmlFor?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <label htmlFor={htmlFor} className="mb-1.5 block text-sm font-bold">
        {label}
      </label>
      {children}
    </div>
  );
}

const emptyInput: LeadInput = {
  name: '',
  phone: '',
  address: '',
  city: '',
  jobDate: null,
  jobTime: null,
  jobTimeEnd: null,
  services: [],
  price: null,
  notes: '',
  source: 'other',
  status: 'new',
};

/**
 * The one form behind both "ליד חדש" and עריכה. Controlled fields over a
 * LeadInput value; the caller decides what save means (insert or update).
 */
export function LeadForm({
  initial,
  submitLabel,
  onSubmit,
  excludeId,
}: {
  initial?: LeadInput;
  submitLabel: string;
  onSubmit: (input: LeadInput) => Promise<void>;
  /** When editing, the lead's own id — so it doesn't match itself as "returning". */
  excludeId?: string;
}) {
  const [value, setValue] = useState<LeadInput>(initial ?? emptyInput);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [returning, setReturning] = useState<Lead[]>([]);

  // Recognize a returning customer as the phone number is typed — the moment
  // it looks like a full number, look up their previous jobs.
  useEffect(() => {
    const digits = value.phone.replace(/\D/g, '');
    if (digits.length < 9) {
      setReturning([]);
      return;
    }
    const timer = setTimeout(() => {
      listLeadsByPhone(value.phone, excludeId)
        .then(setReturning)
        .catch(() => setReturning([]));
    }, 400);
    return () => clearTimeout(timer);
  }, [value.phone, excludeId]);

  const set = <K extends keyof LeadInput>(key: K, val: LeadInput[K]) =>
    setValue((prev) => ({ ...prev, [key]: val }));

  const serviceQty = (name: string): number =>
    value.services.map(parseService).find((s) => s.name === name)?.qty ?? 0;

  const setServiceQty = (name: string, qty: number) =>
    setValue((prev) => {
      const others = prev.services.filter((s) => parseService(s).name !== name);
      return { ...prev, services: qty <= 0 ? others : [...others, serviceEntry(name, qty)] };
    });

  async function handleSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!value.name.trim()) {
      setError('חסר שם לקוח.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await onSubmit(value);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה. נסו שוב.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      <Field label="שם הלקוח" htmlFor="lead-name">
        <input
          id="lead-name"
          type="text"
          required
          autoComplete="off"
          value={value.name}
          onChange={(e) => set('name', e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="מספר טלפון" htmlFor="lead-phone">
        <input
          id="lead-phone"
          type="tel"
          inputMode="tel"
          autoComplete="off"
          placeholder="050-0000000"
          value={value.phone}
          onChange={(e) => set('phone', e.target.value)}
          className={inputClass}
          dir="ltr"
        />
        {returning.length > 0 ? (
          <Link
            href={`/crm/leads/${returning[0].id}`}
            className="mt-2 flex items-center gap-2 rounded-xl border border-teal-600/40 bg-teal-500/10 px-3 py-2.5 text-sm font-bold text-teal-800"
          >
            <RepeatIcon className="h-4 w-4 shrink-0" />
            לקוח חוזר — {returning.length === 1 ? 'עבודה קודמת אחת' : `${returning.length} עבודות קודמות`}
            {returning[0].jobDate
              ? `, האחרונה ב-${formatDateHe(returning[0].jobDate)} (${formatPrice(returning[0].price)})`
              : ''}
          </Link>
        ) : null}
      </Field>

      <Field label="כתובת מלאה" htmlFor="lead-address">
        <input
          id="lead-address"
          type="text"
          autoComplete="off"
          placeholder="רחוב ומספר בית"
          value={value.address}
          onChange={(e) => set('address', e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="עיר" htmlFor="lead-city">
        <input
          id="lead-city"
          type="text"
          autoComplete="off"
          value={value.city}
          onChange={(e) => set('city', e.target.value)}
          className={inputClass}
        />
      </Field>

      <Field label="תאריך העבודה" htmlFor="lead-date">
        <input
          id="lead-date"
          type="date"
          value={value.jobDate ?? ''}
          onChange={(e) => set('jobDate', e.target.value || null)}
          className={inputClass}
        />
      </Field>

      {/* An arrival window: "בין 13:00 ל-15:00". The end hour is optional —
          left empty it behaves like a single fixed hour. */}
      <div className="grid grid-cols-2 gap-3">
        <Field label="הגעה משעה" htmlFor="lead-time">
          <input
            id="lead-time"
            type="time"
            value={value.jobTime ?? ''}
            onChange={(e) => set('jobTime', e.target.value || null)}
            className={inputClass}
          />
        </Field>
        <Field label="עד שעה (אופציונלי)" htmlFor="lead-time-end">
          <input
            id="lead-time-end"
            type="time"
            min={value.jobTime ?? undefined}
            value={value.jobTimeEnd ?? ''}
            onChange={(e) => set('jobTimeEnd', e.target.value || null)}
            className={inputClass}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-bold">סוג השירות</legend>
        <div className="flex flex-wrap gap-2">
          {SERVICE_OPTIONS.map((service) => {
            const qty = serviceQty(service);
            if (qty === 0) {
              return (
                <button
                  key={service}
                  type="button"
                  aria-pressed={false}
                  onClick={() => setServiceQty(service, 1)}
                  className="rounded-full border border-ink-600 bg-ink-850 px-4 py-2.5 text-sm font-semibold text-mist-300 transition-colors hover:border-ink-500"
                >
                  {service}
                </button>
              );
            }
            // Selected: the chip grows −/+ steppers for the quantity
            // (2 מזגנים, 3 ספות...); minus below 1 deselects.
            return (
              <div
                key={service}
                className="flex items-stretch overflow-hidden rounded-full border border-brand-500 bg-brand-500 text-on-brand"
              >
                <button
                  type="button"
                  aria-label={`פחות ${service}`}
                  onClick={() => setServiceQty(service, qty - 1)}
                  className="px-3 text-lg font-bold leading-none transition-colors hover:bg-brand-400"
                >
                  −
                </button>
                <button
                  type="button"
                  aria-pressed
                  aria-label={`הסר ${service}`}
                  onClick={() => setServiceQty(service, 0)}
                  className="py-2.5 text-sm font-semibold"
                >
                  {service}
                  {qty > 1 ? <span className="font-extrabold tabular-nums"> ×{qty}</span> : null}
                </button>
                <button
                  type="button"
                  aria-label={`עוד ${service}`}
                  onClick={() => setServiceQty(service, qty + 1)}
                  className="px-3 text-lg font-bold leading-none transition-colors hover:bg-brand-400"
                >
                  +
                </button>
              </div>
            );
          })}
        </div>
        <p className="mt-1.5 flex items-center gap-1.5 text-xs font-semibold text-mist-500">
          <LightbulbIcon className="h-4 w-4 shrink-0 text-amber-600" />
          בחרת שירות? כפתורי − ו-+ קובעים כמה פריטים (למשל 2 מזגנים).
        </p>
      </fieldset>

      <Field label="מחיר שסוכם (₪)" htmlFor="lead-price">
        <input
          id="lead-price"
          type="number"
          inputMode="decimal"
          min="0"
          step="any"
          value={value.price ?? ''}
          onChange={(e) => set('price', e.target.value === '' ? null : Number(e.target.value))}
          className={inputClass}
          dir="ltr"
        />
      </Field>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-bold">מקור הליד</legend>
        <div className="flex flex-wrap gap-2">
          {SOURCE_OPTIONS.map((source) => {
            const selected = value.source === source.value;
            return (
              <button
                key={source.value}
                type="button"
                aria-pressed={selected}
                onClick={() => set('source', source.value as LeadSource)}
                className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${
                  selected
                    ? 'border-brand-500 bg-brand-500 text-on-brand'
                    : 'border-ink-600 bg-ink-850 text-mist-300 hover:border-ink-500'
                }`}
              >
                {source.label}
              </button>
            );
          })}
        </div>
      </fieldset>

      <Field label="סטטוס" htmlFor="lead-status">
        <select
          id="lead-status"
          value={value.status}
          onChange={(e) => set('status', e.target.value as LeadStatus)}
          className={inputClass}
        >
          {STATUS_OPTIONS.map((status) => (
            <option key={status.value} value={status.value}>
              {status.label}
            </option>
          ))}
        </select>
      </Field>

      <Field label="הערות" htmlFor="lead-notes">
        <textarea
          id="lead-notes"
          rows={3}
          value={value.notes}
          onChange={(e) => set('notes', e.target.value)}
          className={inputClass}
        />
      </Field>

      {error ? (
        <p role="alert" className="rounded-xl bg-red-600/10 px-3 py-2.5 text-sm font-semibold text-red-600">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-4 text-lg font-bold text-on-brand transition-colors hover:bg-brand-400 disabled:opacity-60"
      >
        {saving ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : null}
        {submitLabel}
      </button>
    </form>
  );
}
