'use client';

import Link from 'next/link';
import { useEffect, useId, useRef, useState, type FormEvent } from 'react';
import { site } from '@/config/site';
import { form as copy } from '@/content/copy';
import { track } from '@/lib/analytics';
import { cn } from '@/lib/cn';
import { getIntent, onIntentChange } from '@/lib/intent';
import { afterSubmitWhatsAppHref, hasLeadEndpoint, leadWhatsAppHref, postLead, type Interest } from '@/lib/leads';
import { messageFromLink, openWhatsApp } from '@/lib/openExternal';
import { formatPhoneDisplay, isValidIsraeliPhone, telHref } from '@/lib/phone';
import { hasPhone, hasWhatsApp } from '@/lib/whatsapp';
import { PhoneLink } from '@/components/ui/PhoneLink';
import { WhatsAppFallback } from '@/components/ui/WhatsAppFallback';
import { WhatsAppLink } from '@/components/ui/WhatsAppLink';
import { CheckCircleIcon, CheckIcon, SpinnerIcon, WhatsAppIcon } from '@/components/ui/icons';

type Field = 'name' | 'phone' | 'interest';
type ErrorType = 'empty' | 'invalid' | 'too_short';
type FieldError = { type: ErrorType; message: string };
type Errors = Partial<Record<Field, FieldError>>;
/**
 * success  — the endpoint accepted the lead.
 * handoff  — the details were handed to WhatsApp; nothing is received until
 *            the visitor presses Send there, so the copy says exactly that.
 * error    — the endpoint failed; a fresh-gesture WhatsApp button is offered.
 */
type Status = 'idle' | 'submitting' | 'success' | 'handoff' | 'error';

const MIN_FILL_MS = 2500;
const now = () => Date.now();

/**
 * Three fields + one choice. Posts to NEXT_PUBLIC_LEAD_ENDPOINT when set;
 * otherwise hands the details to WhatsApp so a lead is never lost.
 * Pre-selects the package the visitor clicked on the way here.
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
  const [touched, setTouched] = useState<Partial<Record<Field, boolean>>>({});
  const [status, setStatus] = useState<Status>('idle');
  const [blocked, setBlocked] = useState<string | null>(null);
  const [honeypot, setHoneypot] = useState('');
  const started = useRef(false);
  const loadedAt = useRef<number>(0);
  const interestTouched = useRef(false);
  const headingRef = useRef<HTMLHeadingElement>(null);

  // Pick up intent from CTAs (pricing / services / ROI) — on mount and live.
  // Once the visitor chose a package by hand, later CTAs no longer override it.
  useEffect(() => {
    loadedAt.current = now();
    const apply = (p: ReturnType<typeof getIntent>) => {
      if (!p) return;
      if (p.intent && !interestTouched.current) setInterest(p.intent);
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
    if (!n.trim()) next.name = { type: 'empty', message: copy.errors.nameEmpty };
    else if (n.trim().length < 2) next.name = { type: 'too_short', message: copy.errors.nameShort };
    if (!p.trim()) next.phone = { type: 'empty', message: copy.errors.phoneEmpty };
    else if (!isValidIsraeliPhone(p)) next.phone = { type: 'invalid', message: copy.errors.phoneInvalid };
    if (!i) next.interest = { type: 'empty', message: copy.errors.interest };
    return next;
  };

  const onFirstInteraction = () => {
    if (started.current) return;
    started.current = true;
    track('form_start', { location: 'form', intent_source: intentSource });
  };

  const blur = (field: Field) => {
    setTouched((t) => ({ ...t, [field]: true }));
    setErrors(validate());
  };

  const visibleErrors = Object.fromEntries(Object.entries(errors).filter(([k]) => touched[k as Field])) as Errors;

  const input = { name, phone, business, interest: interest as Interest, roiContext, intentSource };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const next = validate();
    setTouched({ name: true, phone: true, interest: true });
    setErrors(next);
    const fields = Object.keys(next) as Field[];
    if (fields.length > 0) {
      for (const field of fields) track('form_error', { field, error_type: next[field]?.type });
      document.getElementById(`${id}-${fields[0]}`)?.focus();
      return;
    }

    // Bots: honeypot filled or submitted faster than a human could type.
    if (honeypot || now() - loadedAt.current < MIN_FILL_MS) {
      setStatus('success');
      return;
    }

    const submitParams = {
      package: interest,
      has_business_name: Boolean(business.trim()),
      has_roi_context: Boolean(roiContext),
      intent_source: intentSource,
    };

    if (hasLeadEndpoint) {
      setStatus('submitting');
      try {
        await postLead(input);
        track('form_submit', { ...submitParams, method: 'endpoint' });
        setStatus('success');
      } catch {
        track('form_submit_error', { error_code: 'endpoint' });
        // No automatic WhatsApp here: after an await we are outside the user
        // gesture and window.open would be blocked. The error state offers a
        // button instead.
        setStatus('error');
      }
      return;
    }

    if (hasWhatsApp) {
      // Still inside the click gesture — safe to open WhatsApp directly.
      const href = leadWhatsAppHref(input);
      track('form_submit', { ...submitParams, method: 'whatsapp_fallback' });
      track('whatsapp_click', { location: 'form', context: 'form_fallback', package: interest });
      openWhatsApp(href, () => setBlocked(href));
      setStatus('handoff');
      return;
    }

    setStatus('error');
  };

  useEffect(() => {
    if (status === 'success' || status === 'handoff') headingRef.current?.focus();
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
    interestTouched.current = false;
    // A repeat enquiry (e.g. a corrected phone number) is never a bot.
    loadedAt.current = now() - MIN_FILL_MS;
  };

  const submitLabel =
    status === 'submitting' ? copy.submitting : hasLeadEndpoint || !hasWhatsApp ? copy.submit : copy.submitWhatsApp;
  const errorCount = Object.keys(visibleErrors).length;
  const panel = 'card-dark rounded-[var(--radius-xl)] p-6 sm:p-10';

  if (status === 'success' || status === 'handoff') {
    const handoff = status === 'handoff';
    return (
      <div className={panel} role="status" aria-live="polite" style={{ minHeight: 420 }}>
        <span className="flex h-12 w-12 items-center justify-center rounded-full bg-accent/15 text-accent">
          {handoff ? <WhatsAppIcon className="h-6 w-6 text-whatsapp" /> : <CheckCircleIcon className="h-7 w-7" />}
        </span>
        <h3 ref={headingRef} tabIndex={-1} className="mt-5 text-2xl font-semibold text-fg outline-none">
          {handoff ? copy.handoff.title : copy.success.title}
        </h3>
        <p className="mt-3 max-w-[34rem] text-base leading-relaxed text-muted">
          {handoff ? copy.handoff.text : copy.success.text}
        </p>
        {!handoff ? (
          <>
            <p className="mt-6 text-sm font-semibold text-fg">{copy.success.whatNext}</p>
            <ol className="mt-2 grid gap-2 text-sm text-muted">
              {copy.success.steps.map((step, i) => (
                <li key={step} className="flex items-start gap-2.5">
                  <span className="tabular flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-surface-2 text-xs font-bold text-fg">
                    {i + 1}
                  </span>
                  <span className="pt-0.5">{step}</span>
                </li>
              ))}
            </ol>
          </>
        ) : null}
        <div className="mt-6 flex flex-col gap-3 sm:flex-row sm:flex-wrap">
          {handoff ? (
            <WhatsAppLink
              href={leadWhatsAppHref(input)}
              location="confirmation"
              context="form_fallback"
              packageId={interest || undefined}
              className="btn btn-whatsapp"
            >
              <WhatsAppIcon className="h-5 w-5" />
              {copy.handoff.reopen}
            </WhatsAppLink>
          ) : hasWhatsApp ? (
            <WhatsAppLink
              href={afterSubmitWhatsAppHref(name || '—')}
              location="confirmation"
              context="after_submit"
              packageId={interest || undefined}
              className="btn btn-whatsapp"
            >
              <WhatsAppIcon className="h-5 w-5" />
              {copy.success.whatsappCta}
            </WhatsAppLink>
          ) : null}
          {handoff && hasPhone ? (
            <PhoneLink href={telHref(site.contact.phone)} location="confirmation" className="btn btn-outline">
              {copy.handoff.call}{' '}
              <bdi dir="ltr" className="tabular">
                {formatPhoneDisplay(site.contact.phone)}
              </bdi>
            </PhoneLink>
          ) : null}
          <button type="button" onClick={reset} className="btn btn-outline">
            {copy.success.again}
          </button>
        </div>
        {blocked ? (
          <WhatsAppFallback message={messageFromLink(blocked)} href={blocked} onClose={() => setBlocked(null)} />
        ) : null}
      </div>
    );
  }

  return (
    <form className={panel} noValidate onSubmit={onSubmit} onInput={onFirstInteraction} style={{ minHeight: 420 }}>
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
            aria-describedby={`${id}-name-err`}
            onChange={(e) => {
              setName(e.target.value);
              if (touched.name) setErrors(validate({ name: e.target.value }));
            }}
            onBlur={() => blur('name')}
          />
          <p id={`${id}-name-err`} className="min-h-5 text-[13px] leading-5 text-error">
            {visibleErrors.name?.message}
          </p>
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
            aria-describedby={`${id}-phone-err`}
            onChange={(e) => {
              setPhone(e.target.value);
              if (touched.phone) setErrors(validate({ phone: e.target.value }));
            }}
            onBlur={() => blur('phone')}
          />
          <p id={`${id}-phone-err`} className="min-h-5 text-[13px] leading-5 text-error">
            {visibleErrors.phone?.message}
          </p>
        </div>

        <div className="field sm:col-span-2">
          <label htmlFor={`${id}-business`}>
            {copy.business.label}
            <span className="text-subtle">{copy.business.optional}</span>
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

        <fieldset className="sm:col-span-2" aria-describedby={`${id}-interest-err`}>
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
                    'chip-radio flex min-h-12 cursor-pointer items-center gap-2.5 rounded-[var(--radius-sm)] border px-3.5 text-[15px] font-medium transition-colors',
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
                      interestTouched.current = true;
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
          <p id={`${id}-interest-err`} className="mt-2 min-h-5 text-[13px] leading-5 text-error">
            {visibleErrors.interest?.message}
          </p>
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
        <div
          role="alert"
          className="mt-5 rounded-[var(--radius-sm)] border border-error/40 bg-error/5 px-3 py-3 text-sm text-error"
        >
          <p>{hasWhatsApp ? copy.errors.network : copy.errors.networkNoWhatsApp}</p>
          {hasWhatsApp ? (
            <WhatsAppLink
              href={leadWhatsAppHref(input)}
              location="form"
              context="form_fallback"
              packageId={interest || undefined}
              className="btn btn-whatsapp mt-3"
            >
              <WhatsAppIcon className="h-5 w-5" />
              {copy.errors.networkWhatsAppCta}
            </WhatsAppLink>
          ) : null}
        </div>
      ) : null}

      <div className="mt-6">
        <p aria-live="assertive" className="mb-3 min-h-6 text-sm leading-6 text-error">
          {errorCount ? copy.errors.summary(errorCount) : ''}
        </p>
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
