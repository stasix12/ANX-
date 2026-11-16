'use client';

import Link from 'next/link';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { SpinnerIcon } from '@/components/icons';
import { ErrorNote, Panel, SeoShell } from '@/components/seo/SeoShell';
import { isConfigured, listArticles } from '@/lib/seo/client';
import { CITIES, LANG_META, cityBySlug } from '@/lib/seo/config';
import type { Article, ArticleStatus } from '@/lib/seo/types';

/**
 * The approval queue — the screen that stands between generated text and the
 * public website.
 *
 * Ordered so the decisions that matter come first: articles waiting for a human
 * are at the top, then drafts that failed the gate, then what is already live.
 * Nothing here publishes anything; every action happens on an article's own
 * screen, after its content and quality report have actually been looked at.
 */

const STATUS_LABEL: Record<ArticleStatus, string> = {
  pending_approval: 'ממתין לאישור',
  draft: 'טיוטה',
  published: 'פורסם',
  rejected: 'נדחה',
  quality_check: 'בבדיקה',
};

const STATUS_STYLE: Record<ArticleStatus, string> = {
  pending_approval: 'bg-brand-500/15 text-brand-400',
  draft: 'bg-amber-500/15 text-amber-300',
  published: 'bg-emerald-500/15 text-emerald-300',
  rejected: 'bg-red-500/15 text-red-300',
  quality_check: 'bg-ink-800 text-mist-300',
};

/** Queue order: decisions first, archive last. */
const ORDER: ArticleStatus[] = ['pending_approval', 'draft', 'quality_check', 'published', 'rejected'];

type Filter = { status: ArticleStatus | 'all'; lang: 'he' | 'ru' | 'all'; city: string };

export default function SeoQueuePage() {
  const [articles, setArticles] = useState<Article[] | null>(null);
  const [error, setError] = useState('');
  const [filter, setFilter] = useState<Filter>({ status: 'all', lang: 'all', city: 'all' });

  const load = useCallback(async () => {
    if (!isConfigured()) {
      setError('Supabase לא מוגדר — אין ממה לטעון את התור');
      setArticles([]);
      return;
    }
    try {
      setArticles(await listArticles());
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setArticles([]);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const shown = useMemo(() => {
    if (!articles) return [];
    return articles
      .filter((a) => filter.status === 'all' || a.status === filter.status)
      .filter((a) => filter.lang === 'all' || a.lang === filter.lang)
      .filter((a) => filter.city === 'all' || (filter.city === 'none' ? !a.city : a.city === filter.city))
      .sort((a, b) => {
        const byStatus = ORDER.indexOf(a.status) - ORDER.indexOf(b.status);
        if (byStatus !== 0) return byStatus;
        return new Date(b.created_at).getTime() - new Date(a.created_at).getTime();
      });
  }, [articles, filter]);

  if (articles === null) {
    return (
      <SeoShell title="תור אישור">
        <div className="grid place-items-center py-20">
          <SpinnerIcon className="h-7 w-7 animate-spin text-brand-500" />
        </div>
      </SeoShell>
    );
  }

  const pendingCount = articles.filter((a) => a.status === 'pending_approval').length;

  return (
    <SeoShell
      title="תור אישור"
      subtitle={
        pendingCount
          ? `${pendingCount} מאמרים ממתינים להחלטה שלכם`
          : 'אין מאמרים שממתינים לאישור'
      }
    >
      <div className="space-y-5">
        {error ? <ErrorNote message={error} /> : null}

        <Panel>
          <div className="flex flex-wrap gap-4">
            <label className="flex-1 min-w-[9rem]">
              <span className="mb-1 block text-xs font-bold text-mist-500">סטטוס</span>
              <select
                value={filter.status}
                onChange={(e) => setFilter((f) => ({ ...f, status: e.target.value as Filter['status'] }))}
                className="w-full rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5 text-base font-bold text-mist-100"
              >
                <option value="all">הכול</option>
                {ORDER.map((s) => (
                  <option key={s} value={s}>
                    {STATUS_LABEL[s]}
                  </option>
                ))}
              </select>
            </label>
            <label className="flex-1 min-w-[9rem]">
              <span className="mb-1 block text-xs font-bold text-mist-500">שפה</span>
              <select
                value={filter.lang}
                onChange={(e) => setFilter((f) => ({ ...f, lang: e.target.value as Filter['lang'] }))}
                className="w-full rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5 text-base font-bold text-mist-100"
              >
                <option value="all">שתי השפות</option>
                <option value="he">עברית</option>
                <option value="ru">רוסית</option>
              </select>
            </label>
            <label className="flex-1 min-w-[9rem]">
              <span className="mb-1 block text-xs font-bold text-mist-500">עיר</span>
              <select
                value={filter.city}
                onChange={(e) => setFilter((f) => ({ ...f, city: e.target.value }))}
                className="w-full rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5 text-base font-bold text-mist-100"
              >
                <option value="all">כל האזור</option>
                {CITIES.map((c) => (
                  <option key={c.slug} value={c.slug}>
                    {c.he}
                  </option>
                ))}
                <option value="none">אזורי (ללא עיר)</option>
              </select>
            </label>
          </div>
          {/* The spec is explicit that a city filter describes which city the
              CONTENT is about — not where the searcher was. Said plainly here
              so nobody reads these counts as geography. */}
          <p className="mt-3 text-xs leading-relaxed text-mist-500">
            הסינון לפי עיר מתייחס לשיוך התוכן לעיר, לא למיקום הגיאוגרפי של המחפש.
          </p>
        </Panel>

        {shown.length === 0 ? (
          <Panel>
            <p className="text-sm leading-relaxed text-mist-500">
              {articles.length === 0
                ? 'עוד לא נוצרו מאמרים. הריצו מחזור מהמסך הראשי.'
                : 'אין מאמרים שתואמים את הסינון.'}
            </p>
          </Panel>
        ) : (
          <ul className="space-y-3">
            {shown.map((a) => {
              const city = cityBySlug(a.city);
              const failed = Array.isArray(a.quality_report?.checks)
                ? a.quality_report.checks.filter((c) => !c.pass)
                : [];
              return (
                <li key={a.id}>
                  <Link
                    href={`/crm/seo/article/${a.id}`}
                    className="block rounded-card border border-ink-800 bg-ink-850 p-5 transition hover:border-brand-500/45"
                  >
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span className={`rounded-full px-2.5 py-0.5 text-xs font-bold ${STATUS_STYLE[a.status]}`}>
                        {STATUS_LABEL[a.status]}
                      </span>
                      <span className="rounded-full border border-ink-800 px-2.5 py-0.5 text-xs font-bold text-mist-500">
                        {LANG_META[a.lang].label}
                      </span>
                      {city ? (
                        <span className="rounded-full bg-brand-500/10 px-2.5 py-0.5 text-xs font-bold text-brand-400">
                          {city.he}
                        </span>
                      ) : null}
                      {a.quality_score !== null ? (
                        <span
                          className={`ms-auto rounded-full px-2.5 py-0.5 text-xs font-bold tabular-nums ${
                            a.quality_score >= 90
                              ? 'bg-emerald-500/15 text-emerald-300'
                              : a.quality_score >= 70
                                ? 'bg-brand-500/15 text-brand-400'
                                : 'bg-red-500/15 text-red-300'
                          }`}
                        >
                          ציון פנימי {a.quality_score}
                        </span>
                      ) : null}
                    </div>

                    <p
                      className="font-extrabold leading-snug text-mist-100"
                      lang={LANG_META[a.lang].htmlLang}
                      dir={LANG_META[a.lang].dir}
                    >
                      {a.title || '(ללא כותרת)'}
                    </p>

                    {failed.length ? (
                      <p className="mt-2 text-sm text-amber-300">
                        נכשל ב: {failed.map((c) => c.label).join(', ')}
                      </p>
                    ) : null}

                    <p className="mt-2 text-xs tabular-nums text-mist-500">
                      נוצר {new Date(a.created_at).toLocaleString('he-IL')}
                    </p>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </div>
    </SeoShell>
  );
}
