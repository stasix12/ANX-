'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getStore } from './store';
import type { CollectionMap, CollectionName } from './store';
import type { PlatformSettings } from './types';

/**
 * Live data hooks: read a collection once, then re-read whenever the store's
 * change feed says it moved (another tab, the simulation, Supabase Realtime —
 * the component neither knows nor cares which).
 */

export function useCollection<K extends CollectionName>(
  col: K,
): { rows: CollectionMap[K][]; loading: boolean; refresh: () => void } {
  const [rows, setRows] = useState<CollectionMap[K][]>([]);
  const [loading, setLoading] = useState(true);
  const alive = useRef(true);

  const refresh = useCallback(() => {
    getStore()
      .list(col)
      .then((data) => {
        if (alive.current) {
          setRows(data);
          setLoading(false);
        }
      })
      .catch(() => alive.current && setLoading(false));
  }, [col]);

  useEffect(() => {
    alive.current = true;
    refresh();
    const unsub = getStore().subscribe((changed) => {
      if (changed === col) refresh();
    });
    return () => {
      alive.current = false;
      unsub();
    };
  }, [col, refresh]);

  return { rows, loading, refresh };
}

export function useSettings(): PlatformSettings | null {
  const [settings, setSettings] = useState<PlatformSettings | null>(null);
  useEffect(() => {
    let alive = true;
    const load = () => getStore().getSettings().then((s) => alive && setSettings(s));
    load();
    const unsub = getStore().subscribe((changed) => {
      if (changed === 'settings') load();
    });
    return () => {
      alive = false;
      unsub();
    };
  }, []);
  return settings;
}

/** setInterval that pauses when the tab is hidden — dispatch/simulation ticks. */
export function useTicker(callback: () => void, ms: number): void {
  const saved = useRef(callback);
  saved.current = callback;
  useEffect(() => {
    const id = setInterval(() => {
      if (document.visibilityState === 'visible') saved.current();
    }, ms);
    return () => clearInterval(id);
  }, [ms]);
}
