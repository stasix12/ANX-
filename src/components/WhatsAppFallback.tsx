'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon, WhatsAppIcon } from '@/components/icons';
import { site } from '@/lib/site';

/**
 * Shown when the browser refused to hand the order off to WhatsApp — inside a
 * sandboxed preview, or in an in-app browser that swallows new windows.
 *
 * The order is finished at that point; only the delivery failed. So rather
 * than an error, this hands over the two things needed to send it by hand: the
 * exact message, and the number to send it to. Both are one tap to copy.
 */
export function WhatsAppFallback({
  message,
  href,
  onClose,
}: {
  message: string;
  href: string;
  onClose: () => void;
}) {
  const [mounted, setMounted] = useState(false);

  useEffect(() => setMounted(true), []);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [onClose]);

  if (!mounted) return null;

  return createPortal(
    <div className="fixed inset-0 z-70 flex items-end justify-center bg-mist-100/50 p-0 backdrop-blur-sm sm:items-center sm:p-6">
      <button
        type="button"
        aria-label="סגירה"
        className="absolute inset-0 cursor-default"
        onClick={onClose}
      />

      <div
        role="dialog"
        aria-modal="true"
        aria-label="שליחת ההזמנה בוואטסאפ"
        className="relative flex max-h-[85vh] w-full max-w-lg flex-col rounded-t-card border border-ink-700 bg-white shadow-2xl sm:rounded-card"
      >
        <div className="flex items-start justify-between gap-3 border-b border-ink-700 px-5 py-4">
          <div>
            <h2 className="text-lg font-extrabold">שליחת ההזמנה</h2>
            <p className="mt-1 text-sm text-mist-300">
              הדפדפן חסם את הפתיחה האוטומטית של וואטסאפ. ההזמנה מוכנה — אפשר לשלוח אותה
              בשתי לחיצות.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="סגירה"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-lg text-mist-300 transition-colors hover:text-mist-100"
          >
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto px-5 py-4">
          <Step number={1} title="העתיקו את ההזמנה">
            <pre
              dir="rtl"
              className="mt-2 max-h-56 overflow-y-auto whitespace-pre-wrap rounded-xl bg-ink-950 p-3 font-sans text-xs leading-relaxed text-mist-100"
            >
              {message}
            </pre>
            <CopyButton
              value={message}
              label="העתקת ההזמנה"
              done="ההזמנה הועתקה"
              className="mt-2 w-full bg-[#25D366] text-mist-100 hover:bg-[#1fbe5a]"
            />
          </Step>

          <Step number={2} title="שלחו לנו בוואטסאפ">
            <p
              dir="ltr"
              className="mt-2 text-center text-2xl font-extrabold tracking-wide tabular-nums"
            >
              {site.phoneDisplay}
            </p>
            <CopyButton
              value={site.phoneDisplay}
              label="העתקת המספר"
              done="המספר הועתק"
              className="mt-2 w-full border border-ink-600 text-mist-100 hover:border-brand-500 hover:text-brand-700"
            />
          </Step>
        </div>

        <div className="border-t border-ink-700 px-5 py-4">
          {/*
            Deliberately a bare anchor with no click handler: a direct tap gets
            the browser's own handling of an outbound link, which sometimes
            succeeds where a scripted window.open was refused.
          */}
          <a
            href={href}
            target="_blank"
            rel="noopener noreferrer"
            className="flex items-center justify-center gap-2.5 rounded-full border border-[#1da851]/50 px-6 py-3 text-sm font-bold text-[#1a9e4f] transition-colors hover:bg-[#25D366]/10"
          >
            <WhatsAppIcon className="h-4 w-4 shrink-0" />
            נסו שוב לפתוח את וואטסאפ
          </a>
        </div>
      </div>
    </div>,
    document.body,
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="mt-4 first:mt-0">
      <div className="flex items-center gap-2">
        <span className="grid h-6 w-6 shrink-0 place-items-center rounded-full bg-brand-500 text-xs font-extrabold text-white">
          {number}
        </span>
        <h3 className="text-sm font-bold">{title}</h3>
      </div>
      {children}
    </div>
  );
}

function CopyButton({
  value,
  label,
  done,
  className,
}: {
  value: string;
  label: string;
  done: string;
  className: string;
}) {
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    if (!copied) return;
    const timer = window.setTimeout(() => setCopied(false), 2000);
    return () => window.clearTimeout(timer);
  }, [copied]);

  return (
    <button
      type="button"
      onClick={async () => setCopied(await copyText(value))}
      className={`rounded-full px-5 py-3 text-sm font-bold transition-colors ${className}`}
    >
      {copied ? `✓ ${done}` : label}
    </button>
  );
}

/**
 * navigator.clipboard is unavailable outside a secure context and inside some
 * sandboxes — exactly the situations this whole fallback exists for — so the
 * old selection-based copy stays as a second attempt.
 */
async function copyText(value: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(value);
    return true;
  } catch {
    // Fall through to the selection-based path.
  }

  const field = document.createElement('textarea');
  field.value = value;
  field.setAttribute('readonly', '');
  field.style.position = 'fixed';
  field.style.top = '-1000px';
  document.body.appendChild(field);

  try {
    field.select();
    field.setSelectionRange(0, value.length);
    return document.execCommand('copy');
  } catch {
    return false;
  } finally {
    field.remove();
  }
}
