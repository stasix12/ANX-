'use client';

import { useEffect, useState } from 'react';
import type { Session } from '@supabase/supabase-js';
import { supabase } from '@/lib/supabase';

export type SessionState = { session: Session | null; loading: boolean };

/**
 * Tracks the Supabase auth session client-side. This is a UX convenience
 * only — the real gate is Row Level Security on the `products` table, which
 * rejects writes from anyone without a valid session regardless of what this
 * hook or the admin UI does. Losing this file could make the admin screens
 * render when they shouldn't; it could never make an unauthorized write
 * succeed.
 */
/*
 * The last resolved session, cached at module level: every screen mounts its
 * own useAdminSession, and without the cache each navigation started at
 * loading=true — flashing a full-page spinner on every tab switch. With it,
 * only the first mount ever waits; later mounts render instantly and still
 * track live auth changes.
 */
let cachedSession: Session | null = null;
let sessionResolved = false;

export function useAdminSession(): SessionState {
  const [state, setState] = useState<SessionState>(() =>
    sessionResolved ? { session: cachedSession, loading: false } : { session: null, loading: true },
  );

  useEffect(() => {
    if (!supabase) {
      sessionResolved = true;
      cachedSession = null;
      setState({ session: null, loading: false });
      return;
    }

    supabase.auth.getSession().then(({ data }) => {
      sessionResolved = true;
      cachedSession = data.session;
      setState({ session: data.session, loading: false });
    });

    const { data: subscription } = supabase.auth.onAuthStateChange((_event, session) => {
      sessionResolved = true;
      cachedSession = session;
      setState({ session, loading: false });
    });

    return () => subscription.subscription.unsubscribe();
  }, []);

  return state;
}

export async function signIn(email: string, password: string): Promise<string | null> {
  if (!supabase) return 'המערכת אינה מחוברת ל-Supabase.';
  const { error } = await supabase.auth.signInWithPassword({ email, password });
  return error ? translateAuthError(error.message) : null;
}

export async function signOut(): Promise<void> {
  if (!supabase) return;
  await supabase.auth.signOut();
}

function translateAuthError(message: string): string {
  if (/invalid login credentials/i.test(message)) return 'אימייל או סיסמה שגויים.';
  if (/email not confirmed/i.test(message)) return 'יש לאשר את כתובת האימייל תחילה.';
  return 'ההתחברות נכשלה. נסו שוב.';
}
