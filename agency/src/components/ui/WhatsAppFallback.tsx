'use client';

import { useEffect, useRef, useState } from 'react';
import { site } from '@/config/site';
import { formatPhoneDisplay } from '@/lib/phone';

/**
 * Shown only when the browser refused to open WhatsApp (sandboxed preview,
 * some in-app browsers): lets the visitor copy the message and the number.
 */
export function WhatsAppFallback({ message, href, onClose }: { message: string; href: string; onClose: () => void }) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!dialog.open) dialog.showModal();
    const onCancel = (e: Event) => {
      e.preventDefault();
      onClose();
    };
    dialog.addEventListener('cancel', onCancel);
    return () => dialog.removeEventListener('cancel', onCancel);
  }, [onClose]);

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(message);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <dialog
      ref={dialogRef}
      aria-labelledby="wa-fallback-title"
      className="m-auto w-[min(92vw,28rem)] rounded-[var(--radius-xl)] border border-border bg-surface-1 p-6 text-fg shadow-dark backdrop:bg-black/60"
      dir="rtl"
    >
      <h2 id="wa-fallback-title" className="text-lg font-bold">
        לא הצלחנו לפתוח את WhatsApp
      </h2>
      <p className="mt-2 text-sm text-muted">
        אפשר להעתיק את ההודעה ולשלוח אותה למספר{' '}
        <bdi dir="ltr" className="font-semibold text-fg">
          {formatPhoneDisplay(site.contact.whatsapp)}
        </bdi>
        , או לנסות שוב.
      </p>
      <p className="mt-4 rounded-[var(--radius-sm)] border border-border bg-surface-2 p-3 text-sm leading-relaxed whitespace-pre-wrap">
        {message}
      </p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button type="button" onClick={copy} className="btn btn-primary">
          {copied ? 'הועתק' : 'העתקת ההודעה'}
        </button>
        <a href={href} target="_blank" rel="noopener noreferrer" className="btn btn-outline">
          לנסות שוב
        </a>
        <button type="button" onClick={onClose} className="btn btn-outline">
          סגירה
        </button>
      </div>
    </dialog>
  );
}
