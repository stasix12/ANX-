'use client';

import { useRouter } from 'next/navigation';
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { buildDemoSnapshot, DEMO_ORG_ID } from './demo/seed';
import { LOCALE_META, t as translate, type TKey } from './i18n';
import { tick, type Patch, type Write } from './ops';
import { getMode, getOrgId, getStoredLocale, hasSupabase, setMode, setOrgId, setStoredLocale, storeFor, supabaseStoreOrNull, type Mode } from './session';
import type { LcStore } from './store/types';
import type { Locale, Snapshot } from './types';

export type LcStatus = 'booting' | 'signed_out' | 'no_workspace' | 'ready';

export interface LcContextValue {
  status: LcStatus;
  mode: Mode | null;
  s: Snapshot | null;
  locale: Locale;
  dir: 'rtl' | 'ltr';
  setLocale: (l: Locale) => void;
  t: (key: TKey, vars?: Record<string, string | number>) => string;
  /** Applies an operation result: updates state and persists writes. Returns the patch's events. */
  apply: (patch: Patch) => Patch['events'];
  run: <P extends Patch>(op: (s: Snapshot) => P) => P;
  openDemo: () => Promise<void>;
  openLive: (orgId?: string) => Promise<void>;
  createLiveWorkspace: (snapshot: Snapshot) => Promise<void>;
  resetDemo: () => Promise<void>;
  signOut: () => Promise<void>;
  userEmail: string | null;
  userId: string | null;
  refresh: () => Promise<void>;
  events: Patch['events'];
  clearEvents: () => void;
}

const Ctx = createContext<LcContextValue | null>(null);

async function persist(store: LcStore, orgId: string, writes: Write[]) {
  for (const w of writes) {
    try {
      if (w.kind === 'put') await store.put(orgId, w.collection, w.row);
      else if (w.kind === 'remove') await store.remove(orgId, w.collection, w.id);
      else if (w.kind === 'settings') await store.saveSettings(w.settings);
      else if (w.kind === 'organization') await store.saveOrganization(w.organization);
      else if (w.kind === 'subscription') await store.saveSubscription(w.subscription);
    } catch (e) {
      console.error('[lc] persist failed', e);
    }
  }
}

export function LcProvider({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const [status, setStatus] = useState<LcStatus>('booting');
  const [mode, setModeState] = useState<Mode | null>(null);
  const [s, setS] = useState<Snapshot | null>(null);
  const [locale, setLocaleState] = useState<Locale>('he');
  const [userEmail, setUserEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [events, setEvents] = useState<Patch['events']>([]);
  const storeRef = useRef<LcStore | null>(null);
  const snapRef = useRef<Snapshot | null>(null);
  snapRef.current = s;

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    setStoredLocale(l);
  }, []);

  // Direction + lang follow the UI locale.
  useEffect(() => {
    const dir = LOCALE_META[locale].dir;
    document.documentElement.dir = dir;
    document.documentElement.lang = locale;
    return () => {
      document.documentElement.dir = 'rtl';
      document.documentElement.lang = 'he';
    };
  }, [locale]);

  const loadDemo = useCallback(async () => {
    const store = storeFor('demo');
    storeRef.current = store;
    let snap = await store.loadSnapshot(DEMO_ORG_ID);
    if (!snap) {
      snap = buildDemoSnapshot();
      await store.createWorkspace(snap);
    }
    setModeState('demo');
    setMode('demo');
    setOrgId(DEMO_ORG_ID);
    setS(snap);
    setLocaleState(getStoredLocale() ?? snap.organization.locale);
    setStatus('ready');
  }, []);

  const loadLive = useCallback(async (orgId?: string) => {
    const store = supabaseStoreOrNull();
    if (!store || !supabase) {
      setStatus('signed_out');
      return;
    }
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      setStatus('signed_out');
      return;
    }
    setUserEmail(data.session.user.email ?? null);
    setUserId(data.session.user.id);
    storeRef.current = store;
    setModeState('live');
    setMode('live');
    let id = orgId ?? getOrgId();
    if (!id || id === DEMO_ORG_ID) {
      const orgs = await store.myOrganizations().catch(() => []);
      id = orgs[0]?.id ?? null;
    }
    if (!id) {
      setS(null);
      setStatus('no_workspace');
      return;
    }
    const snap = await store.loadSnapshot(id).catch(() => null);
    if (!snap) {
      setS(null);
      setStatus('no_workspace');
      return;
    }
    setOrgId(id);
    setS(snap);
    setLocaleState(getStoredLocale() ?? snap.organization.locale);
    setStatus('ready');
  }, []);

  // Boot: restore the previous session.
  useEffect(() => {
    const m = getMode();
    if (m === 'demo') void loadDemo();
    else if (m === 'live' && hasSupabase) void loadLive();
    else setStatus('signed_out');
  }, [loadDemo, loadLive]);

  // React to Supabase sign-in/out.
  useEffect(() => {
    if (!supabase) return;
    const { data } = supabase.auth.onAuthStateChange((_e, session) => {
      if (!session && getMode() === 'live') {
        setS(null);
        setStatus('signed_out');
      }
    });
    return () => data.subscription.unsubscribe();
  }, []);

  const apply = useCallback((patch: Patch) => {
    setS(patch.snapshot);
    snapRef.current = patch.snapshot;
    if (storeRef.current) void persist(storeRef.current, patch.snapshot.organization.id, patch.writes);
    if (patch.events.length) setEvents((prev) => [...prev, ...patch.events]);
    return patch.events;
  }, []);

  const run = useCallback(
    <P extends Patch>(op: (snap: Snapshot) => P): P => {
      const current = snapRef.current;
      if (!current) throw new Error('No workspace loaded');
      const patch = op(current);
      apply(patch);
      return patch;
    },
    [apply],
  );

  // Automation ticker: deliver due follow-ups/reminders every 20s.
  useEffect(() => {
    if (status !== 'ready') return;
    const fire = () => {
      const current = snapRef.current;
      if (!current) return;
      const patch = tick(current);
      if (patch.writes.length) apply(patch);
    };
    fire();
    const id = setInterval(fire, 20_000);
    return () => clearInterval(id);
  }, [status, apply]);

  const value = useMemo<LcContextValue>(
    () => ({
      status,
      mode,
      s,
      locale,
      dir: LOCALE_META[locale].dir,
      setLocale,
      t: (key, vars) => translate(locale, key, vars),
      apply,
      run,
      openDemo: loadDemo,
      openLive: loadLive,
      createLiveWorkspace: async (snapshot) => {
        const store = supabaseStoreOrNull();
        if (!store) throw new Error('Supabase not configured');
        await store.createWorkspace(snapshot);
        setOrgId(snapshot.organization.id);
        await loadLive(snapshot.organization.id);
      },
      resetDemo: async () => {
        const store = storeFor('demo');
        await store.destroyWorkspace(DEMO_ORG_ID);
        const snap = buildDemoSnapshot();
        await store.createWorkspace(snap);
        setS(snap);
      },
      signOut: async () => {
        if (mode === 'live' && supabase) await supabase.auth.signOut();
        setMode(null);
        setOrgId(null);
        setS(null);
        setModeState(null);
        setStatus('signed_out');
        router.replace('/lc/login');
      },
      userEmail,
      userId,
      refresh: async () => {
        if (mode === 'demo') await loadDemo();
        else await loadLive();
      },
      events,
      clearEvents: () => setEvents([]),
    }),
    [status, mode, s, locale, setLocale, apply, run, loadDemo, loadLive, userEmail, userId, events, router],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useLc(): LcContextValue {
  const v = useContext(Ctx);
  if (!v) throw new Error('useLc must be used inside LcProvider');
  return v;
}

/** For screens that require a loaded workspace: narrows `s` to non-null. */
export function useWorkspace(): LcContextValue & { s: Snapshot } {
  const v = useLc();
  if (!v.s) throw new Error('Workspace not loaded');
  return v as LcContextValue & { s: Snapshot };
}
