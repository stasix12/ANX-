'use client';

import { useEffect, useState } from 'react';
import { DEMO_CUSTOMER } from './demoData';
import { isDemoMode } from './store';

/**
 * Who is this browser? The marketplace has three hats — customer, pro,
 * admin — and one browser can wear all of them (that's how you demo the
 * whole flow on one machine: customer tab + pro tab side by side).
 *
 * Demo mode: identity lives in localStorage, "login" is instant.
 * With Supabase configured, real authentication goes through Supabase Auth
 * (see /market/login) and this session simply mirrors the signed-in user id;
 * RLS is what actually protects the data either way.
 */

export interface MarketSession {
  customerId: string;
  customerName: string;
  customerPhone: string;
  /** The professional this browser is signed in as (null = not a pro). */
  activeProId: string | null;
  adminAuthed: boolean;
}

const KEY = 'cleango:session';
const EVENT = 'cleango-session-changed';

const DEFAULT_SESSION: MarketSession = {
  customerId: DEMO_CUSTOMER.id,
  customerName: DEMO_CUSTOMER.fullName,
  customerPhone: DEMO_CUSTOMER.phone,
  activeProId: null,
  adminAuthed: false,
};

export function getSession(): MarketSession {
  if (typeof window === 'undefined') return DEFAULT_SESSION;
  try {
    const raw = window.localStorage.getItem(KEY);
    return raw ? { ...DEFAULT_SESSION, ...(JSON.parse(raw) as Partial<MarketSession>) } : DEFAULT_SESSION;
  } catch {
    return DEFAULT_SESSION;
  }
}

export function updateSession(patch: Partial<MarketSession>): MarketSession {
  const next = { ...getSession(), ...patch };
  if (typeof window !== 'undefined') {
    window.localStorage.setItem(KEY, JSON.stringify(next));
    window.dispatchEvent(new Event(EVENT));
  }
  return next;
}

/**
 * Demo admin gate. In demo mode the password is fixed and documented (this is
 * sample data on your own machine); with Supabase the admin panel requires a
 * signed-in user whose mk_profiles.role is admin/super_admin — RLS enforces
 * it on every query regardless of this client-side check.
 */
export const DEMO_ADMIN_PASSWORD = 'cleango-admin';

export function tryAdminLogin(password: string): boolean {
  if (isDemoMode && password === DEMO_ADMIN_PASSWORD) {
    updateSession({ adminAuthed: true });
    return true;
  }
  return false;
}

export function useMarketSession(): MarketSession {
  const [session, setSession] = useState<MarketSession>(DEFAULT_SESSION);
  useEffect(() => {
    const sync = () => setSession(getSession());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener('storage', sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener('storage', sync);
    };
  }, []);
  return session;
}
