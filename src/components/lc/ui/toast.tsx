'use client';

import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import { AlertIcon, CheckCircleIcon, InfoIcon, SparklesIcon, XIcon } from '../icons';
import { cx } from './primitives';

type Kind = 'success' | 'error' | 'info' | 'ai';
interface Toast {
  id: number;
  kind: Kind;
  title: string;
  description?: string;
}
interface ToastApi {
  push: (kind: Kind, title: string, description?: string) => void;
  success: (title: string, description?: string) => void;
  error: (title: string, description?: string) => void;
  info: (title: string, description?: string) => void;
  ai: (title: string, description?: string) => void;
}

const Ctx = createContext<ToastApi | null>(null);
let counter = 1;

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([]);
  const dismiss = useCallback((id: number) => setToasts((t) => t.filter((x) => x.id !== id)), []);
  const push = useCallback(
    (kind: Kind, title: string, description?: string) => {
      const id = counter++;
      setToasts((t) => [...t.slice(-3), { id, kind, title, description }]);
      setTimeout(() => dismiss(id), kind === 'error' ? 6000 : 4000);
    },
    [dismiss],
  );
  const api = useMemo<ToastApi>(() => ({ push, success: (t, d) => push('success', t, d), error: (t, d) => push('error', t, d), info: (t, d) => push('info', t, d), ai: (t, d) => push('ai', t, d) }), [push]);
  const icon: Record<Kind, ReactNode> = {
    success: <CheckCircleIcon className="h-5 w-5 text-lc-success" />,
    error: <AlertIcon className="h-5 w-5 text-lc-danger" />,
    info: <InfoIcon className="h-5 w-5 text-lc-info" />,
    ai: <SparklesIcon className="h-5 w-5 text-lc-primary" />,
  };
  return (
    <Ctx.Provider value={api}>
      {children}
      <div className="pointer-events-none fixed inset-x-0 bottom-[calc(4.5rem+env(safe-area-inset-bottom))] z-[90] flex flex-col items-center gap-2 px-4 sm:bottom-auto sm:top-4 sm:items-end sm:pe-4">
        {toasts.map((t) => (
          <div key={t.id} className={cx('lc-theme pointer-events-auto flex w-full max-w-sm items-start gap-3 rounded-xl border border-lc-border bg-white/95 p-3.5 shadow-lc-pop backdrop-blur animate-lc-pop')} role="status">
            <span className="mt-0.5 shrink-0">{icon[t.kind]}</span>
            <div className="min-w-0 flex-1">
              <p className="text-sm font-semibold text-lc-text">{t.title}</p>
              {t.description && <p className="mt-0.5 text-[13px] text-lc-muted">{t.description}</p>}
            </div>
            <button type="button" onClick={() => dismiss(t.id)} className="text-lc-faint hover:text-lc-text" aria-label="dismiss">
              <XIcon className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
    </Ctx.Provider>
  );
}

export function useToast(): ToastApi {
  const v = useContext(Ctx);
  if (!v) throw new Error('useToast outside ToastProvider');
  return v;
}
