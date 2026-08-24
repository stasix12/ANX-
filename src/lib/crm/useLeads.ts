'use client';

import { useCallback, useEffect, useState } from 'react';
import { listLeads, type Lead } from '@/lib/crm/leads';

export interface LeadsState {
  leads: Lead[];
  loading: boolean;
  error: string | null;
  /** Re-fetches after a mutation (status change, delete). */
  reload: () => Promise<void>;
}

/**
 * Loads the full lead list once per screen. The whole business fits in a few
 * hundred rows, so filtering client-side (today / week / search / stats)
 * keeps every screen instant and needs just one query.
 */
export function useLeads(): LeadsState {
  const [leads, setLeads] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const reload = useCallback(async () => {
    try {
      setLeads(await listLeads());
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'טעינת הנתונים נכשלה.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void reload();
  }, [reload]);

  return { leads, loading, error, reload };
}
