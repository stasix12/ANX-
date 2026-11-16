'use client';

import Link from 'next/link';
import { useCallback, useEffect, useState } from 'react';
import { ErrorNote, Panel, SeoShell, Stat } from '@/components/seo/SeoShell';
import { SpinnerIcon } from '@/components/icons';
import { CITIES, WEEKLY_TOPICS } from '@/lib/seo/config';
import { callSeoApi, isConfigured, listArticles, listLogs, listRuns } from '@/lib/seo/client';
import { COST_NOTE } from '@/lib/seo/cost';
import type { Article, SeoLog, SeoRun } from '@/lib/seo/types';

/**
 * The overview screen: what the system has produced, what is waiting for a
 * human, and whether the machinery behind it is actually connected.
 *
 * Every number here is counted from real rows. Where something cannot be known
 * — no runs yet, Supabase unconfigured — the screen says so rather than
 * rendering a zero that reads like a fact.
 */
export default function SeoOverviewPage() {
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [runs, setRuns] = useState<SeoRun[]>([]);
  const [logs, setLogs] = useState<SeoLog[]>([]);
  const [error, setError] = useState('');
  const [running, setRunning] = useState(false);
  const [runMessage, setRunMessage] = useState('');

  const load = useCallback(async () => {
    if (!isConfigured()) {
      setError('Supabase לא מוגדר — הוסיפו NEXT_PUBLIC_SUPABASE_URL ו-NEXT_PUBLIC_SUPABASE_ANON_KEY');
      setArticles([]);
      return;
    }
    try {
      const [a, r, l] = await Promise.all([listArticles(), listRuns(10), listLogs(20)]);
      setArticles(a);
      setRuns(r);
      setLogs(l);
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setArticles([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  /* Fires the cycle now. The same endpoint the weekly schedule calls, so the
     manual path cannot drift from the automated one. */
  const runNow = async () => {
    setRunning(true);
    setRunMessage('');
    try {
      const result = await callSeoApi<{
        articlesCreated: number;
        topicsPlanned: number;
        failures: { topicKey: string; lang: string; error: string }[];
      }>('/api/seo/run');
      setRunMessage(
        `המחזור הסתיים: ${result.topicsPlanned} נושאים, ${result.articlesCreated} גרסאות נוצרו` +
          (result.failures.length ? ` · ${result.failures.length} כשלונות (ראו יומן)` : ''),
      );
      await load();
    } catch (e) {
      setRunMessage('');
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setRunning(false);
    }
  };

  if (articles === null) {
    return (
      <SeoShell title="סקירה">
        <div className="grid place-items-center py-20">
          <SpinnerIcon className="h-7 w-7 animate-spin text-brand-500" />
        </div>
      </SeoShell>
    );
  }

  const by = (s: Article['status']) => articles.filter((a) => a.status === s);
  const published = by('published');
  const pending = by('pending_approval');
  const drafts = by('draft');
  const lastRun = runs[0];

  /* "This week" = the last seven days, counted from the runs table. */
  const weekAgo = Date.now() - 7 * 86_400_000;
  const thisWeekRuns = runs.filter((r) => new Date(r.started_at).getTime() >= weekAgo);
  const thisWeekTopics = thisWeekRuns.reduce((a, r) => a + r.topics_planned, 0);

  return (
    <SeoShell
      title="סקירה"
      subtitle="מערכת תוכן אוטומטית לאזור הדרום — עברית ורוסית"
      action={
        <button
          type="button"
          onClick={runNow}
          disabled={running}
          className="flex items-center gap-2 rounded-full bg-brand-500 px-4 py-2 text-sm font-extrabold text-on-brand transition hover:bg-brand-600 disabled:opacity-60"
        >
          {running ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : null}
          {running ? 'המחזור רץ…' : 'הרץ מחזור עכשיו'}
        </button>
      }
    >
      <div className="space-y-5">
        {error ? <ErrorNote message={error} /> : null}
        {runMessage ? (
          <p className="rounded-2xl border border-emerald-500/40 bg-emerald-500/5 p-4 text-sm font-bold text-emerald-300">
            {runMessage}
          </p>
        ) : null}

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Stat label="פורסמו" value={String(published.length)} note="חיים באתר" />
          <Stat
            label="ממתינים לאישור"
            value={String(pending.length)}
            note={pending.length ? 'דורש החלטה שלכם' : 'התור ריק'}
          />
          <Stat label="טיוטות" value={String(drafts.length)} note="לא עברו בדיקות איכות" />
          <Stat
            label="נושאים השבוע"
            value={thisWeekRuns.length === 0 ? '—' : String(thisWeekTopics)}
            note={thisWeekRuns.length === 0 ? 'לא רץ מחזור בשבוע האחרון' : `יעד: ${WEEKLY_TOPICS} בשבוע`}
          />
        </div>

        {pending.length > 0 ? (
          <Link
            href="/crm/seo/queue"
            className="block rounded-card border border-brand-500/45 bg-brand-500/5 p-5 transition hover:bg-brand-500/10"
          >
            <p className="font-extrabold text-mist-100">
              {pending.length} מאמרים ממתינים לאישור שלכם
            </p>
            <p className="mt-1 text-sm text-mist-300">
              שום דבר לא מתפרסם לפני שתאשרו. לחצו כדי לעבור על התור ←
            </p>
          </Link>
        ) : null}

        <div className="grid gap-5 lg:grid-cols-2">
          <Panel title="פילוח לפי שפה" hint="כל נושא נכתב בשתי שפות, וכל גרסה מאושרת בנפרד">
            <ul className="space-y-2">
              {(['he', 'ru'] as const).map((lang) => {
                const all = articles.filter((a) => a.lang === lang);
                const live = all.filter((a) => a.status === 'published').length;
                return (
                  <li
                    key={lang}
                    className="flex items-center justify-between rounded-xl bg-ink-900 px-4 py-3"
                  >
                    <span className="font-bold text-mist-100">
                      {lang === 'he' ? 'עברית' : 'רוסית'}
                    </span>
                    <span className="text-sm tabular-nums text-mist-300">
                      {live} פורסמו · {all.length - live} בעבודה
                    </span>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="כיסוי ערי היעד" hint="ארבע ערי השירות בדרום. מאמרים אזוריים נספרים בנפרד">
            <ul className="space-y-2">
              {CITIES.map((c) => {
                const live = articles.filter((a) => a.city === c.slug && a.status === 'published').length;
                const queued = articles.filter((a) => a.city === c.slug && a.status !== 'published').length;
                return (
                  <li key={c.slug} className="flex items-center justify-between rounded-xl bg-ink-900 px-4 py-3">
                    <span className="font-bold text-mist-100">{c.he}</span>
                    <span className="text-sm tabular-nums text-mist-300">
                      {live} פורסמו{queued ? ` · ${queued} בעבודה` : ''}
                    </span>
                  </li>
                );
              })}
              <li className="flex items-center justify-between rounded-xl bg-ink-900 px-4 py-3">
                <span className="font-bold text-mist-100">אזורי (ללא עיר)</span>
                <span className="text-sm tabular-nums text-mist-300">
                  {articles.filter((a) => !a.city && a.status === 'published').length} פורסמו
                </span>
              </li>
            </ul>
          </Panel>
        </div>

        <Panel title="מחזור הכתיבה" hint={`יעד: ${WEEKLY_TOPICS} נושאים בשבוע × 2 שפות = 4 גרסאות`}>
          {runs.length === 0 ? (
            <p className="rounded-xl bg-ink-900 p-4 text-sm leading-relaxed text-mist-500">
              עוד לא רץ אף מחזור. לחצו על “הרץ מחזור עכשיו” כדי לייצר את הנושאים הראשונים, או
              הגדירו את התזמון השבועי (ראו docs/SEO.md).
            </p>
          ) : (
            <ul className="space-y-2">
              {runs.map((r) => (
                <li key={r.id} className="rounded-xl bg-ink-900 px-4 py-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <span className="font-bold text-mist-100">
                      {r.kind === 'weekly' ? 'מחזור שבועי' : 'הרצה ידנית'}
                    </span>
                    <span
                      className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${
                        r.status === 'succeeded'
                          ? 'bg-emerald-500/15 text-emerald-300'
                          : r.status === 'partial'
                            ? 'bg-amber-500/15 text-amber-300'
                            : r.status === 'failed'
                              ? 'bg-red-500/15 text-red-300'
                              : 'bg-ink-800 text-mist-300'
                      }`}
                    >
                      {r.status === 'succeeded'
                        ? 'הושלם'
                        : r.status === 'partial'
                          ? 'הושלם חלקית'
                          : r.status === 'failed'
                            ? 'נכשל'
                            : 'רץ'}
                    </span>
                  </div>
                  <p className="mt-1 text-sm tabular-nums text-mist-500">
                    {new Date(r.started_at).toLocaleString('he-IL')} · {r.topics_planned} נושאים ·{' '}
                    {r.articles_created} גרסאות
                  </p>
                  {r.error ? <p className="mt-1 text-xs text-red-300">{r.error}</p> : null}
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="יומן פעולות אחרון" action={<Link href="/crm/seo/logs" className="text-sm font-bold text-brand-400">הכל ←</Link>}>
          {logs.length === 0 ? (
            <p className="text-sm text-mist-500">אין רשומות ביומן.</p>
          ) : (
            <ul className="space-y-1.5">
              {logs.slice(0, 8).map((l) => (
                <li key={l.id} className="flex gap-3 rounded-lg bg-ink-900 px-3 py-2 text-sm">
                  <span
                    className={`shrink-0 font-bold ${
                      l.level === 'error'
                        ? 'text-red-300'
                        : l.level === 'warn'
                          ? 'text-amber-300'
                          : 'text-mist-500'
                    }`}
                  >
                    {l.level === 'error' ? '●' : l.level === 'warn' ? '●' : '●'}
                  </span>
                  <span className="min-w-0 flex-1 text-mist-300">{l.message || l.action}</span>
                  <span className="shrink-0 tabular-nums text-xs text-mist-500">
                    {new Date(l.created_at).toLocaleDateString('he-IL')}
                  </span>
                </li>
              ))}
            </ul>
          )}
        </Panel>

        <Panel title="עלות API משוערת" hint="הערכה בלבד, לא חיוב בפועל">
          <p className="text-sm leading-relaxed text-mist-300">{COST_NOTE}</p>
        </Panel>
      </div>
    </SeoShell>
  );
}
