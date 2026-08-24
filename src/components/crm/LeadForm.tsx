'use client';

import { useState } from 'react';
import { SpinnerIcon } from '@/components/icons';
import {
  SERVICE_OPTIONS,
  SOURCE_OPTIONS,
  STATUS_OPTIONS,
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
}: {
  initial?: LeadInput;
  submitLabel: string;
  onSubmit: (input: LeadInput) => Promise<void>;
}) {
  const [value, setValue] = useState<LeadInput>(initial ?? emptyInput);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const set = <K extends keyof LeadInput>(key: K, val: LeadInput[K]) =>
    setValue((prev) => ({ ...prev, [key]: val }));

  const toggleService = (service: string) =>
    setValue((prev) => ({
      ...prev,
      services: prev.services.includes(service)
        ? prev.services.filter((s) => s !== service)
        : [...prev.services, service],
    }));

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

      <div className="grid grid-cols-2 gap-3">
        <Field label="תאריך העבודה" htmlFor="lead-date">
          <input
            id="lead-date"
            type="date"
            value={value.jobDate ?? ''}
            onChange={(e) => set('jobDate', e.target.value || null)}
            className={inputClass}
          />
        </Field>
        <Field label="שעה" htmlFor="lead-time">
          <input
            id="lead-time"
            type="time"
            value={value.jobTime ?? ''}
            onChange={(e) => set('jobTime', e.target.value || null)}
            className={inputClass}
          />
        </Field>
      </div>

      <fieldset>
        <legend className="mb-1.5 block text-sm font-bold">סוג השירות</legend>
        <div className="flex flex-wrap gap-2">
          {SERVICE_OPTIONS.map((service) => {
            const selected = value.services.includes(service);
            return (
              <button
                key={service}
                type="button"
                aria-pressed={selected}
                onClick={() => toggleService(service)}
                className={`rounded-full border px-4 py-2.5 text-sm font-semibold transition-colors ${
                  selected
                    ? 'border-brand-500 bg-brand-500 text-on-brand'
                    : 'border-ink-600 bg-ink-850 text-mist-300 hover:border-ink-500'
                }`}
              >
                {service}
              </button>
            );
          })}
        </div>
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
        <p role="alert" className="rounded-xl bg-red-600/10 px-3 py-2.5 text-sm font-semibold text-red-400">
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
