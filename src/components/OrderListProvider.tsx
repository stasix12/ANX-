'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react';
import type { OrderLine } from '@/lib/order';

const STORAGE_KEY = 'anx3d.order';

interface OrderListValue {
  lines: OrderLine[];
  add: (line: OrderLine) => void;
  setQuantity: (slug: string, model: string, quantity: number) => void;
  remove: (slug: string, model: string) => void;
  clear: () => void;
  /** False until the stored list has been read, so SSR and first paint agree. */
  ready: boolean;
}

const OrderListContext = createContext<OrderListValue | null>(null);

/** Same product in a different Sabrina fit is a separate line. */
const sameLine = (a: OrderLine, slug: string, model: string) =>
  a.slug === slug && a.model === model;

export function OrderListProvider({ children }: { children: React.ReactNode }) {
  const [lines, setLines] = useState<OrderLine[]>([]);
  const [ready, setReady] = useState(false);

  /*
   * Read on mount rather than during render: the server has no localStorage, so
   * seeding initial state from it would make the first client render disagree
   * with the server HTML and get thrown away as a hydration mismatch.
   */
  useEffect(() => {
    try {
      const stored = window.localStorage.getItem(STORAGE_KEY);
      if (stored) {
        const parsed: unknown = JSON.parse(stored);
        if (Array.isArray(parsed)) setLines(parsed as OrderLine[]);
      }
    } catch {
      // Private mode, blocked storage, or corrupt JSON — start empty.
    }
    setReady(true);
  }, []);

  useEffect(() => {
    if (!ready) return;
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(lines));
    } catch {
      // Persisting is a convenience; the list still works for this visit.
    }
  }, [lines, ready]);

  const add = useCallback((line: OrderLine) => {
    setLines((current) => {
      const index = current.findIndex((item) => sameLine(item, line.slug, line.model));
      if (index === -1) return [...current, line];

      const next = [...current];
      next[index] = { ...next[index], quantity: next[index].quantity + line.quantity };
      return next;
    });
  }, []);

  const setQuantity = useCallback((slug: string, model: string, quantity: number) => {
    setLines((current) =>
      quantity <= 0
        ? current.filter((item) => !sameLine(item, slug, model))
        : current.map((item) => (sameLine(item, slug, model) ? { ...item, quantity } : item)),
    );
  }, []);

  const remove = useCallback((slug: string, model: string) => {
    setLines((current) => current.filter((item) => !sameLine(item, slug, model)));
  }, []);

  const clear = useCallback(() => setLines([]), []);

  const value = useMemo(
    () => ({ lines, add, setQuantity, remove, clear, ready }),
    [lines, add, setQuantity, remove, clear, ready],
  );

  return <OrderListContext.Provider value={value}>{children}</OrderListContext.Provider>;
}

export function useOrderList() {
  const context = useContext(OrderListContext);
  if (!context) throw new Error('useOrderList must be used inside OrderListProvider');
  return context;
}
