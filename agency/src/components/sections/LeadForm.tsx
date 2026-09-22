'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { site } from '@/config/site';
import { form as copy } from '@/content/copy';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { getIntent, onIntentChange } from '@/lib/intent';
import { afterSubmitWhatsAppHref, hasLeadEndpoint, leadWhatsAppHref, postLead, type Interest } from '@/lib/leads';
import { openWhatsApp } from '@/lib/openExternal';
import { formatPhoneDisplay, isValidIsraeliPhone, telHref } from '@/lib/phone';
import { hasPhone, hasWhatsApp } from '@/lib/whatsapp';
import { PhoneLink } from '@/components/ui/PhoneLink';
import { WhatsAppFallback } from '@/components/ui/WhatsAppFallback';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { CheckCircleIcon, CheckIcon, SpinnerIcon, WhatsAppIcon } from '@/components/ui/icons';

type Errors = Partial<Record<'name' | 'phone' | 'interest', string>>;
type Status = 'idle' | 'submitting' | 'success' | 'error';

const MIN_FILL_MS = 2500;

/**
 * Three fields + one choice. Posts to NEXT_PUBLIC_LEAD_ENDPOINT when set;
 * otherwise (or on failure) hands the details to WhatsApp so a lead is never
 * lost. Pre-selects the package the visitor clicked on the way here.
 */
export function LeadForm() {
  const id = useId();
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [business, setBusiness] = useState('');
  const [interest, setInterest] = useState<Interest | ''>('');
  const [roiContext, setRoiContext] = useState<string | undefined>();
  const [intentSource, setIntentSource] = useState<string | undefined>();
  const [errors, setErrors] = useState<Errors>({});
  const [touched, setTouched] = useState<Record<string, boolean>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [blocked, setBlocked] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');
  const started = useRef(false);
  const loadedAt = useRef<number>(0);
  const successRef = useRef<HTMLHeadingElement>(null);
  const summaryRef = useRef<HTMLParagraphElement>(null);

  // Pick up intent from CTAs (pricing / services / ROI) — on mount and live.
  useEffect(() => {
    loadedAt.current = Date.now();
    const apply = (p: ReturnType<typeof getIntent>) => {
      if (!p) return;
      if (p.intent) setInterest(p.intent);
      setIntentSource(p.source);
      if (p.roiContext) setRoiContext(p.roiContext);
    };
    apply(getIntent());
    return onIntentChange(apply);
  }, []);

  const validate = (over: { name?: string; phone?: string; interest?: Interest | '' } = {}): Errors => {
    const n = over.name ?? name;
    const p = over.phone ?? phone;
    const i = over.interest ?? interest;
    const next: Errors = {};
    if (!n.trim()) next.name = copy.errors.required;
    else if (n.trim().length < 2) next.name = copy.errors.nameShort;
    if (!p.trim()) next.phone = copy.errors.required;
    else if (!isValidIsraeliPhone(p)) next.phone = copy.errors.phoneInvalid;
    if (!i) next.interest = copy.errors.interest;
    return next;
  };

  const onFirstInteraction = () => {
    if (started.current) return;
    started.current = true;
    track('form_start', { location: 'form', intent_source: intentSource });
  };

  const blur = (field: keyof Errors) => {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors(validate());
  };

  const visibleErrors = Object.fromEntries(Object.entries(errors).filter(([k]) => touched[k])) as Errors;

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next = validate();
    setTouched({ name: true, phone: true, interest: true });
    setErrors(next);
    const count = Object.keys(next).length;
    if (count > 0) {
      for (const [field] of Object.entries(next)) track('form_error', { field });
      const first = document.getElementById(`${id}-${Object.keys(next)[0]}`);
      first?.focus();
      summaryRef.current?.focus();
      return;
    }

    const input = { name, phone, business, interest: interest as Interest, roiContext, intentSource };

    // Bots: honeypot filled or submitted faster than a human could type.
    if (honeypot || Date.now() - loadedAt.current < MIN_FILL_MS) {
      setStatus('success');
      return;
    }

    setStatus('submitting');
    if (hasLeadEndpoint) {
      try {
        await postLead(input);
        track('form_submit', {
          package: interest,
          method: 'endpoint',
          has_business_name: Boolean(business.trim()),
          has_roi_context: Boolean(roiContext),
          intent_source: intentSource,
        });
        setStatus('success');
        return;
      } catch {
        track('form_submit_error', { error_code: 'endpoint' });
        if (!hasWhatsApp) {
          setStatus('error');
          return;
        }
        // fall through to WhatsApp so the lead is not lost
      }
    }

    if (hasWhatsApp) {
      const href = leadWhatsAppHref(input);
      track('form_submit', {
        package: interest,
        method: 'whatsapp_fallback',
        has_business_name: Boolean(business.trim()),
        has_roi_context: Boolean(roiContext),
        intent_source: intentSource,
      });
      track('whatsapp_click', { location: 'form', context: 'form_fallback', package: interest });
      openWhatsApp(href, () => setBlocked(href));
      setStatus('success');
      return;
    }

    setStatus('error');
  };

  useEffect(() => {
    if (status === 'success') successRef.current?.focus();
  }, [status]);

  const reset = () => {
    setName('');
    setPhone('');
    setBusiness('');
    setInterest('');
    setErrors({});
    setTouched({});
    setStatus('idle');
    started.current = false;
    loadedAt.current = Date.now();
  };

  const submitLabel =
    status === 'submitting' ? copy.submitting : hasLeadEndpoint || !hasWhatsApp ? copy.submit : copy.submitWhatsApp;
  const errorCount = Object.keys(visibleErrors).length;

  if (status === 'success') {
    return (
      <div className="card-dark p-6 sm:p-10" role="status" aria-live="polite" style={{ minHeight: 420 }}>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          <CheckCircleIcon className="h-7 w-7" />
        </span>
        <h3 ref={successRef} tabIndex={-1} className="mt-5 text-2xl font-semibold text-fg outline-none">
          {copy.success.title}
        </h3>
        <p className="mt-3 max-w-[34rem] text-base leading-relaxed text-muted">{copy.success.text}</p>
        <div className="mt-6 flex flex-col gap-3 sm:flex-row">
          {hasWhatsApp ? (
            <WhatsAppLink
              href={afterSubmitWhatsAppHref(name || '—')}
              location="confirmation"
              context="default"
              className="btn btn-whatsapp"
            >
              <WhatsAppIcon className="h-5 w-5" />
              {copy.success.whatsappCta}
            </WhatsAppLink>
          ) : null}
          <button type="button" onClick={reset} className="btn btn-outline">
            {copy.success.again}
          </button>
        </div>
        {blocked ? (
          <WhatsAppFallback
            message={decodeURIComponent(new URL(blocked).searchParams.get('text') ?? '')}
            href={blocked}
            onClose={() => setBlocked(null)}
          />
        ) : null}
      </div>
    );
  }

  return (
    <form
      className="card-dark p-6 sm:p-10"
      noValidate
      onSubmit={onSubmit}
      onFocus={onFirstInteraction}
      style={{ minHeight: 420 }}
    >
      <p
        ref={summaryRef}
        tabIndex={-1}
        aria-live="assertive"
        className={cn(
          'mb-4 rounded-[var(--radius-sm)] border px-3 py-2 text-sm text-error outline-none',
          errorCount ? 'border-error/40' : 'sr-only',
        )}
      >
        {errorCount ? copy.errors.summary(errorCount) : ''}
      </p>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="field">
          <label htmlFor={`${id}-name`}>
            <span className="req" aria-hidden />
            {copy.name.label}
          </label>
          <input
            id={`${id}-name`}
            name="name"
            className="input"
            type="text"
            autoComplete="name"
            placeholder={copy.name.placeholder}
            value={name}
            required
            aria-required="true"
            aria-invalid={Boolean(visibleErrors.name)}
            aria-describedby={visibleErrors.name ? `${id}-name-err` : undefined}
            onChange={(e) => {
              setName(e.target.value);
              if (touched.name) setErrors(validate({ name: e.target.value }));
            }}
            onBlur={() => blur('name')}
          />
          {visibleErrors.name ? (
            <p id={`${id}-name-err`} className="text-[13px] text-error">
              {visibleErrors.name}
            </p>
          ) : null}
        </div>

        <div className="field">
          <label htmlFor={`${id}-phone`}>
            <span className="req" aria-hidden />
            {copy.phone.label}
          </label>
          <input
            id={`${id}-phone`}
            name="phone"
            className="input tabular text-end"
            type="tel"
            inputMode="tel"
            autoComplete="tel"
            dir="ltr"
            placeholder={copy.phone.placeholder}
            value={phone}
            required
            aria-required="true"
            aria-invalid={Boolean(visibleErrors.phone)}
            aria-describedby={visibleErrors.phone ? `${id}-phone-err` : undefined}
            onChange={(e) => {
              setPhone(e.target.value);
              if (touched.phone) setErrors(validate({ phone: e.target.value }));
            }}
            onBlur={() => blur('phone')}
          />
          {visibleErrors.phone ? (
            <p id={`${id}-phone-err`} className="text-[13px] text-error">
              {visibleErrors.phone}
            </p>
          ) : null}
        </div>

        <div className="field sm:col-span-2">
          <label htmlFor={`${id}-business`}>
            {copy.business.label} <span className="text-subtle">{copy.business.optional}</span>
          </label>
          <input
            id={`${id}-business`}
            name="business"
            className="input"
            type="text"
            autoComplete="organization"
            placeholder={copy.business.placeholder}
            value={business}
            maxLength={80}
            onChange={(e) => setBusiness(e.target.value)}
          />
        </div>

        <fieldset
          className="sm:col-span-2"
          aria-describedby={visibleErrors.interest ? `${id}-interest-err` : undefined}
        >
          <legend className="mb-2 inline-flex items-center gap-1.5 text-sm font-medium text-muted">
            <span className="req" aria-hidden />
            {copy.interestLabel}
          </legend>
          <div id={`${id}-interest`} className="grid gap-2 sm:grid-cols-3" tabIndex={-1}>
            {copy.interests.map((opt) => {
              const checked = interest === opt.value;
              return (
                <label
                  key={opt.value}
                  className={cn(
                    'flex min-h-12 cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border px-3.5 text-[15px] font-medium transition-colors',
                    checked
                      ? 'border-accent bg-accent/10 text-fg'
                      : 'border-border bg-surface-2 text-muted hover:border-border-strong',
                  )}
                >
                  <input
                    type="radio"
                    name="interest"
                    value={opt.value}
                    checked={checked}
                    className="sr-only"
                    onChange={() => {
                      setInterest(opt.value as Interest);
                      setTouched((t) => ({ ...t, interest: true }));
                      setErrors(validate({ interest: opt.value as Interest }));
                    }}
                  />
                  <span
                    aria-hidden
                    className={cn(
                      'flex h-5 w-5 shrink-0 items-center justify-center rounded-full border',
                      checked ? 'border-accent bg-accent text-white' : 'border-border-strong',
                    )}
                  >
                    {checked ? <CheckIcon className="h-3 w-3" strokeWidth={3} /> : null}
                  </span>
                  {opt.label}
                </label>
              );
            })}
          </div>
          {visibleErrors.interest ? (
            <p id={`${id}-interest-err`} className="mt-2 text-[13px] text-error">
              {visibleErrors.interest}
            </p>
          ) : null}
        </fieldset>
      </div>

      {/* Honeypot — invisible to people, tempting to bots. */}
      <div className="absolute -start-[9999px] h-px w-px overflow-hidden" aria-hidden>
        <label htmlFor={`${id}-website`}>Website</label>
        <input
          id={`${id}-website`}
          name="company_website"
          type="text"
          tabIndex={-1}
          autoComplete="off"
          value={honeypot}
          onChange={(e) => setHoneypot(e.target.value)}
        />
      </div>

      {status === 'error' ? (
        <p
          role="alert"
          className="mt-5 rounded-[var(--radius-sm)] border border-error/40 bg-error/5 px-3 py-2 text-sm text-error"
        >
          {copy.errors.network}
        </p>
      ) : null}

      <div className="mt-6">
        <button
          type="submit"
          className="btn btn-primary btn-lg btn-block"
          disabled={status === 'submitting'}
          aria-busy={status === 'submitting'}
        >
          {status === 'submitting' ? <SpinnerIcon className="h-4 w-4" /> : null}
          {submitLabel}
        </button>
        {!hasLeadEndpoint && hasWhatsApp ? (
          <p className="mt-2 text-center text-[13px] text-subtle">{copy.fallbackNote}</p>
        ) : null}
        <p className="mt-3 text-[13px] leading-relaxed text-subtle">
          {copy.consent}{' '}
          <Link href="/privacy" className="underline hover:text-fg">
            {copy.privacyLink}
          </Link>
        </p>
      </div>

      {hasWhatsApp || hasPhone ? (
        <p className="mt-6 flex flex-wrap items-center gap-x-2 gap-y-1 border-t border-border pt-5 text-sm text-muted">
          {hasWhatsApp ? (
            <>
              {copy.altWhatsApp}
              <WhatsAppLink
                location="form"
                className="inline-flex items-center gap-1.5 font-semibold text-accent-soft hover:underline"
              >
                <WhatsAppIcon className="h-4 w-4 text-whatsapp" />
                {copy.altWhatsAppCta}
              </WhatsAppLink>
            </>
          ) : null}
          {hasPhone ? (
            <>
              {copy.altPhone}
              <PhoneLink
                href={telHref(site.contact.phone)}
                location="form"
                className="font-semibold text-fg hover:underline"
              >
                <bdi dir="ltr" className="tabular">
                  {formatPhoneDisplay(site.contact.phone)}
                </bdi>
              </PhoneLink>
            </>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
