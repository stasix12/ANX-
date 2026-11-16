'use client';

import { useCallback, useEffect, useState } from 'react';
import { SpinnerIcon } from '@/components/icons';
import { ErrorNote, Panel, SeoShell } from '@/components/seo/SeoShell';
import { isConfigured, listLogs, listRuns } from '@/lib/seo/client';
import type { SeoLog, SeoRun } from '@/lib/seo/types';

/**
 * The action and error log.
 *
 * Exists so that "why did nothing get written this week" has an answer that is
 * not a guess. Every cycle records what it did — which subjects it chose, why
 * Search Console was skipped, which generation failed and with what message —
 * and this screen is that record, newest first.
 */

const LEVEL_STYLE: Record<SeoLog['level'], string> = {
  info: 'border-ink-800 bg-ink-900',
  warn: 'border-amber-500/40 bg-amber-500/5',
  error: 'border-red-500/40 bg-red-500/5',
};

const LEVEL_LABEL: Record<SeoLog['level'], string> = {
  info: 'מידע',
  warn: 'אזהרה',
  error: 'שגיאה',
};

export default function SeoLogsPage() {
  const [logs, setLogs] = useState<SeoLog[] | null>(null);
  const [runs, setRuns] = useState<SeoRun[]>([]);
  const [error, setError] = useState('');
  const [level, setLevel] = useState<'all' | SeoLog['level']>('all');

  const load = useCallback(async () => {
    if (!isConfigured()) {
      setError('Supabase לא מוגדר');
      setLogs([]);
      return;
    }
    try {
      const [l, r] = await Promise.all([listLogs(200), listRuns(20)]);
      setLogs(l);
      setRuns(r);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setLogs([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  if (logs === null) {
    return (
      <SeoShell title="יומן">
        <div className="grid place-items-center py-20">
          <SpinnerIcon className="h-7 w-7 animate-spin text-brand-500" />
        </div>
      </SeoShell>
    );
  }

  const shown = level === 'all' ? logs : logs.filter((l) => l.level === level);
  const runKind = new Map(runs.map((r) => [r.id, r]));

  return (
    <SeoShell title="יומן" subtitle={`${logs.length} רשומות אחרונות`}>
      <div className="space-y-5">
        {error ? <ErrorNote message={error} /> : null}

        <Panel>
          <div role="group" className="flex flex-wrap gap-1">
            {(['all', 'info', 'warn', 'error'] as const).map((l) => (
              <button
                key={l}
                type="button"
                aria-pressed={level === l}
                onClick={() => setLevel(l)}
                className={`rounded-full px-4 py-2 text-sm font-bold transition ${
                  level === l ? 'bg-brand-500 text-on-brand' : 'text-mist-300 hover:bg-ink-900'
                }`}
              >
                {l === 'all' ? 'הכול' : LEVEL_LABEL[l]}
                <span className="ms-1.5 tabular-nums opacity-70">
                  {l === 'all' ? logs.length : logs.filter((x) => x.level === l).length}
                </span>
              </button>
            ))}
          </div>
        </Panel>

        {shown.length === 0 ? (
          <Panel>
            <p className="text-sm leading-relaxed text-mist-500">
              {logs.length === 0
                ? 'אין רשומות ביומן. היומן מתמלא בכל מחזור כתיבה.'
                : 'אין רשומות ברמה שנבחרה.'}
            </p>
          </Panel>
        ) : (
          <ul className="space-y-2">
            {shown.map((l) => {
              const run = l.run_id ? runKind.get(l.run_id) : undefined;
              return (
                <li key={l.id} className={`rounded-2xl border p-4 ${LEVEL_STYLE[l.level]}`}>
                  <div className="flex flex-wrap items-center gap-2">
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        l.level === 'error'
                          ? 'bg-red-500/15 text-red-300'
                          : l.level === 'warn'
                            ? 'bg-amber-500/15 text-amber-300'
                            : 'bg-ink-800 text-mist-300'
                      }`}
                    >
                      {LEVEL_LABEL[l.level]}
                    </span>
                    <span dir="ltr" className="font-mono text-xs text-mist-500">
                      {l.action}
                    </span>
                    {run ? (
                      <span className="text-xs text-mist-500">
                        · {run.kind === 'weekly' ? 'מחזור שבועי' : 'הרצה ידנית'}
                      </span>
                    ) : null}
                    <span className="ms-auto shrink-0 text-xs tabular-nums text-mist-500">
                      {new Date(l.created_at).toLocaleString('he-IL')}
                    </span>
                  </div>
                  {l.message ? (
                    <p className="mt-2 text-sm leading-relaxed text-mist-100">{l.message}</p>
                  ) : null}
                  {Object.keys(l.meta ?? {}).length > 0 ? (
                    <details className="mt-2">
                      <summary className="cursor-pointer text-xs font-bold text-mist-500">פרטים</summary>
                      <pre
                        dir="ltr"
                        className="mt-2 overflow-x-auto rounded-lg bg-ink-950 p-3 font-mono text-xs text-mist-300"
                      >
                        {JSON.stringify(l.meta, null, 2)}
                      </pre>
                    </details>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SeoShell>
  );
}
