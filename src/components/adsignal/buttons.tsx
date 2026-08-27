'use client';

import { useRouter } from 'next/navigation';
import { useState, useTransition } from 'react';
import { analyzeAdAction, runSyncAction } from '@/lib/adsignal/actions';

export function AnalyzeButton({ adId, hasAnalysis }: { adId: string; hasAnalysis: boolean }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
      <button
        className="as-btn"
        disabled={pending}
        onClick={() =>
          startTransition(async () => {
            setError(null);
            const result = await analyzeAdAction(adId);
            if (!result.ok) setError(result.error ?? 'הניתוח נכשל');
            else router.refresh();
          })
        }
      >
        {pending ? 'מנתח…' : hasAnalysis ? '✦ נתח מחדש עם AI' : '✦ Analyze with AI'}
      </button>
      {error && <span style={{ fontSize: 12.5, color: 'var(--as-red)' }}>{error}</span>}
    </div>
  );
}

export function SyncButton() {
  const router = useRouter();
  const [state, setState] = useState<'idle' | 'running' | 'done' | 'error'>('idle');
  const [message, setMessage] = useState<string | null>(null);

  async function run() {
    setState('running');
    setMessage(null);
    try {
      const result = await runSyncAction();
      if (!result.ok) {
        setState('error');
        setMessage(result.error ?? 'הסנכרון נכשל');
        return;
      }
      setState('done');
      setMessage(result.summary ?? 'הסתיים');
      router.refresh();
    } catch (err) {
      setState('error');
      setMessage(err instanceof Error ? err.message : 'שגיאת רשת');
    }
  }

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <button className="as-btn solid" disabled={state === 'running'} onClick={run}>
        {state === 'running' ? 'מסנכרן… (זה יכול לקחת דקות)' : '🔄 הרץ סנכרון עכשיו'}
      </button>
      {message && (
        <span style={{ fontSize: 12.5, color: state === 'error' ? 'var(--as-red)' : 'var(--as-muted)' }}>
          {message}
        </span>
      )}
    </div>
  );
}
