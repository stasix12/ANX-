'use client';

import { useEffect, type ReactNode } from 'react';
import { XIcon } from '../icons';
import { cx } from './primitives';

/**
 * Modal that becomes a bottom sheet on phones. Escape and backdrop close it.
 */
export function Modal({ open, onClose, title, subtitle, children, footer, size = 'md' }: { open: boolean; onClose: () => void; title?: ReactNode; subtitle?: ReactNode; children: ReactNode; footer?: ReactNode; size?: 'sm' | 'md' | 'lg' }) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  if (!open) return null;
  const width = { sm: 'sm:max-w-md', md: 'sm:max-w-lg', lg: 'sm:max-w-2xl' }[size];
  return (
    <div className="fixed inset-0 z-[80] flex items-end justify-center sm:items-center sm:p-4" role="dialog" aria-modal>
      <div className="absolute inset-0 bg-slate-900/40 backdrop-blur-[2px] animate-lc-fade" onClick={onClose} />
      <div className={cx('lc-theme relative flex max-h-[92dvh] w-full flex-col overflow-hidden rounded-t-3xl bg-white shadow-lc-pop animate-lc-pop sm:rounded-2xl', width)}>
        {(title || subtitle) && (
          <div className="flex items-start justify-between gap-4 border-b border-lc-border px-5 py-4">
            <div>
              {title && <h2 className="text-base font-semibold text-lc-text">{title}</h2>}
              {subtitle && <p className="mt-0.5 text-[13px] text-lc-muted">{subtitle}</p>}
            </div>
            <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-lc-muted hover:bg-lc-bg hover:text-lc-text" aria-label="close">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        )}
        <div className="lc-scroll flex-1 overflow-y-auto px-5 py-4">{children}</div>
        {footer && <div className="flex items-center justify-end gap-2 border-t border-lc-border bg-lc-bg/60 px-5 py-3 pb-[calc(0.75rem+env(safe-area-inset-bottom))] sm:pb-3">{footer}</div>}
      </div>
    </div>
  );
}

export function Popover({ open, onClose, children, className }: { open: boolean; onClose: () => void; children: ReactNode; className?: string }) {
  if (!open) return null;
  return (
    <>
      <div className="fixed inset-0 z-[60]" onClick={onClose} />
      <div className={cx('absolute z-[70] mt-2 min-w-[180px] rounded-xl border border-lc-border bg-white p-1.5 shadow-lc-pop animate-lc-pop', className)}>{children}</div>
    </>
  );
}

export function MenuItem({ onClick, children, danger, icon }: { onClick: () => void; children: ReactNode; danger?: boolean; icon?: ReactNode }) {
  return (
    <button type="button" onClick={onClick} className={cx('flex w-full items-center gap-2.5 rounded-lg px-3 py-2 text-start text-sm font-medium transition-colors', danger ? 'text-lc-danger hover:bg-lc-danger-soft' : 'text-lc-text hover:bg-lc-bg')}>
      {icon && <span className="[&>svg]:h-4 [&>svg]:w-4 text-lc-muted">{icon}</span>}
      {children}
    </button>
  );
}
