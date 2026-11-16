'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useState } from 'react';
import { ArticleBody } from '@/components/seo/ArticleBody';
import { ErrorNote, Panel, SeoShell } from '@/components/seo/SeoShell';
import { CheckIcon, SpinnerIcon, XCircleIcon } from '@/components/icons';
import {
  getArticle,
  listVersions,
  publishArticle,
  recheckArticle,
  rejectArticle,
  restoreVersion,
  returnForFixes,
  saveArticleEdit,
  unpublishArticle,
  type EditableFields,
} from '@/lib/seo/client';
import { useAdminSession } from '@/lib/adminAuth';
import { LANG_META, cityBySlug } from '@/lib/seo/config';
import { QUALITY_PASS } from '@/lib/seo/config';
import { BLOCKING_CHECKS } from '@/lib/seo/quality';
import type { Article } from '@/lib/seo/types';

/**
 * One article: preview, quality report, edit, and the approval decision.
 *
 * This screen is the only place in the product from which an article can go
 * live. Publishing re-runs the quality gate at the moment of the click (see
 * publishArticle) rather than trusting the stored score, so an article that
 * stopped passing — because the checks tightened, or because a near-duplicate
 * got published first — cannot slip through on a stale verdict.
 */
export default function SeoArticlePage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { session } = useAdminSession();
  const userId = session?.user?.id ?? null;

  const [article, setArticle] = useState<Article | null | undefined>(undefined);
  const [versions, setVersions] = useState<{ id: string; snapshot: Article; reason: string; created_at: string }[]>([]);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [editing, setEditing] = useState(false);
  const [form, setForm] = useState<{ title: string; meta_description: string; h1: string; keywords: string }>({
    title: '',
    meta_description: '',
    h1: '',
    keywords: '',
  });

  const load = useCallback(async () => {
    try {
      const a = await getArticle(params.id);
      setArticle(a);
      if (a) {
        setForm({
          title: a.title,
          meta_description: a.meta_description,
          h1: a.h1,
          keywords: a.keywords.join(', '),
        });
        setVersions(await listVersions(a.id));
      }
      setError('');
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setArticle(null);
    }
  }, [params.id]);

  useEffect(() => {
    void load();
  }, [load]);

  /** Wraps every mutation so errors surface and the view always refreshes. */
  const act = async (label: string, fn: () => Promise<unknown>) => {
    setBusy(label);
    setError('');
    try {
      await fn();
      await load();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    } finally {
      setBusy('');
    }
  };

  if (article === undefined) {
    return (
      <SeoShell title="מאמר">
        <div className="grid place-items-center py-20">
          <SpinnerIcon className="h-7 w-7 animate-spin text-brand-500" />
        </div>
      </SeoShell>
    );
  }

  if (article === null) {
    return (
      <SeoShell title="מאמר">
        <div className="space-y-4">
          {error ? <ErrorNote message={error} /> : <ErrorNote message="המאמר לא נמצא." />}
          <Link href="/crm/seo/queue" className="inline-block font-bold text-brand-400">
            ← חזרה לתור
          </Link>
        </div>
      </SeoShell>
    );
  }

  const meta = LANG_META[article.lang];
  const city = cityBySlug(article.city);
  const report = Array.isArray(article.quality_report?.checks) ? article.quality_report : null;
  const failedChecks = report ? report.checks.filter((c) => !c.pass) : [];
  const blockedBy = failedChecks.filter((c) => (BLOCKING_CHECKS as readonly string[]).includes(c.id));
  const canPublish = blockedBy.length === 0 && (article.quality_score ?? 0) >= QUALITY_PASS;

  const saveEdit = () => {
    const fields: EditableFields = {
      title: form.title.trim(),
      meta_description: form.meta_description.trim(),
      h1: form.h1.trim(),
      body: article.body,
      faq: article.faq,
      internal_links: article.internal_links,
      keywords: form.keywords.split(',').map((k) => k.trim()).filter(Boolean),
    };
    return act('save', async () => {
      await saveArticleEdit(article, fields, userId);
      setEditing(false);
    });
  };

  const ask = (message: string): string | null => {
    const reason = window.prompt(message);
    return reason && reason.trim() ? reason.trim() : null;
  };

  return (
    <SeoShell
      title={article.status === 'published' ? 'מאמר שפורסם' : 'מאמר לאישור'}
      subtitle={`${meta.label}${city ? ` · ${city.he}` : ' · אזורי'}`}
      action={
        <Link
          href="/crm/seo/queue"
          className="rounded-full border border-ink-800 px-3 py-2 text-sm font-bold text-mist-300 transition hover:bg-ink-900"
        >
          ← לתור
        </Link>
      }
    >
      <div className="space-y-5">
        {error ? <ErrorNote message={error} /> : null}

        {/* ── Decision bar ──────────────────────────────────────────────── */}
        <Panel
          title="החלטה"
          hint={
            article.status === 'published'
              ? 'המאמר חי באתר כרגע'
              : canPublish
                ? 'עבר את כל הבדיקות החוסמות — אפשר לפרסם'
                : 'לא ניתן לפרסם עד שהליקויים החוסמים יתוקנו'
          }
        >
          {blockedBy.length ? (
            <ul className="mb-4 space-y-1.5">
              {blockedBy.map((c) => (
                <li key={c.id} className="flex gap-2 rounded-xl bg-red-500/5 px-3 py-2 text-sm text-red-300">
                  <XCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />
                  <span>
                    <b>{c.label}:</b> {c.detail}
                  </span>
                </li>
              ))}
            </ul>
          ) : null}

          <div className="flex flex-wrap gap-2">
            {article.status !== 'published' ? (
              <button
                type="button"
                disabled={!canPublish || busy !== ''}
                onClick={() => act('publish', () => publishArticle(article, userId))}
                className="flex items-center gap-2 rounded-full bg-emerald-500 px-5 py-2.5 text-sm font-extrabold text-white transition hover:bg-emerald-600 disabled:opacity-50"
              >
                {busy === 'publish' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : <CheckIcon className="h-4 w-4" />}
                אשר ופרסם
              </button>
            ) : (
              <>
                <Link
                  href={`/articles/${article.slug}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-full bg-brand-500 px-5 py-2.5 text-sm font-extrabold text-on-brand transition hover:bg-brand-600"
                >
                  צפייה בעמוד החי ↗
                </Link>
                <button
                  type="button"
                  disabled={busy !== ''}
                  onClick={() => act('unpublish', () => unpublishArticle(article, userId))}
                  className="rounded-full border border-ink-800 px-5 py-2.5 text-sm font-bold text-mist-300 transition hover:bg-ink-900 disabled:opacity-50"
                >
                  הסר מהאתר
                </button>
              </>
            )}

            <button
              type="button"
              disabled={busy !== ''}
              onClick={() => setEditing((v) => !v)}
              className="rounded-full border border-ink-800 px-5 py-2.5 text-sm font-bold text-mist-300 transition hover:bg-ink-900 disabled:opacity-50"
            >
              {editing ? 'בטל עריכה' : 'ערוך'}
            </button>

            <button
              type="button"
              disabled={busy !== ''}
              onClick={() => {
                const reason = ask('מה צריך לתקן?');
                if (reason) void act('return', () => returnForFixes(article, reason, userId));
              }}
              className="rounded-full border border-ink-800 px-5 py-2.5 text-sm font-bold text-amber-300 transition hover:bg-ink-900 disabled:opacity-50"
            >
              החזר לתיקון
            </button>

            <button
              type="button"
              disabled={busy !== ''}
              onClick={() => {
                const reason = ask('למה המאמר נדחה?');
                if (reason) void act('reject', () => rejectArticle(article, reason, userId));
              }}
              className="rounded-full border border-ink-800 px-5 py-2.5 text-sm font-bold text-red-300 transition hover:bg-ink-900 disabled:opacity-50"
            >
              דחה
            </button>

            <button
              type="button"
              disabled={busy !== ''}
              onClick={() => act('recheck', () => recheckArticle(article, userId))}
              className="rounded-full border border-ink-800 px-5 py-2.5 text-sm font-bold text-mist-500 transition hover:bg-ink-900 disabled:opacity-50"
            >
              הרץ בדיקות מחדש
            </button>
          </div>

          {article.rejection_reason ? (
            <p className="mt-4 rounded-xl bg-ink-900 p-3 text-sm text-mist-300">
              <b>הערה:</b> {article.rejection_reason}
            </p>
          ) : null}
        </Panel>

        {/* ── Quality report ───────────────────────────────────────────── */}
        <Panel
          title="בדיקות איכות"
          hint={
            report
              ? `ציון פנימי ${report.score}/100 — ציון של המערכת שלנו, לא ציון של גוגל`
              : 'לא הורצו בדיקות'
          }
        >
          {report ? (
            <ul className="space-y-1.5">
              {report.checks.map((c) => {
                const blocking = (BLOCKING_CHECKS as readonly string[]).includes(c.id);
                return (
                  <li
                    key={c.id}
                    className={`flex gap-3 rounded-xl px-3 py-2.5 text-sm ${
                      c.pass ? 'bg-ink-900' : blocking ? 'bg-red-500/5' : 'bg-amber-500/5'
                    }`}
                  >
                    <span className="mt-0.5 shrink-0">
                      {c.pass ? (
                        <CheckIcon className="h-4 w-4 text-emerald-400" />
                      ) : (
                        <XCircleIcon className={`h-4 w-4 ${blocking ? 'text-red-400' : 'text-amber-400'}`} />
                      )}
                    </span>
                    <span className="min-w-0">
                      <b className="text-mist-100">{c.label}</b>
                      {blocking && !c.pass ? (
                        <span className="ms-2 rounded-full bg-red-500/15 px-2 py-0.5 text-xs font-bold text-red-300">
                          חוסם פרסום
                        </span>
                      ) : null}
                      <span className="mt-0.5 block text-mist-300">{c.detail}</span>
                    </span>
                  </li>
                );
              })}
            </ul>
          ) : (
            <p className="text-sm text-mist-500">הריצו בדיקות כדי לראות דוח.</p>
          )}
        </Panel>

        {/* ── SEO fields, editable ─────────────────────────────────────── */}
        <Panel title="שדות SEO" hint="כל שינוי מריץ מחדש את בדיקות האיכות ועלול לשנות את הסטטוס">
          {editing ? (
            <div className="space-y-4">
              {([
                ['title', 'Title', 'אורך מומלץ 25–65 תווים'],
                ['h1', 'H1', 'הכותרת הראשית בעמוד'],
                ['meta_description', 'Meta Description', 'אורך מומלץ 70–160 תווים'],
                ['keywords', 'ביטויי מטרה', 'מופרדים בפסיק. הראשון הוא הביטוי המרכזי'],
              ] as const).map(([key, label, hint]) => (
                <label key={key} className="block">
                  <span className="mb-1 block text-xs font-bold text-mist-500">
                    {label} <span className="font-medium">· {hint}</span>
                  </span>
                  {key === 'meta_description' ? (
                    <textarea
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      rows={3}
                      dir={meta.dir}
                      className="w-full rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5 text-base text-mist-100"
                    />
                  ) : (
                    <input
                      value={form[key]}
                      onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
                      dir={key === 'keywords' ? meta.dir : meta.dir}
                      className="w-full rounded-xl border border-ink-800 bg-ink-900 px-3 py-2.5 text-base text-mist-100"
                    />
                  )}
                  <span className="mt-1 block text-xs tabular-nums text-mist-500">
                    {form[key].length} תווים
                  </span>
                </label>
              ))}
              <button
                type="button"
                disabled={busy !== ''}
                onClick={saveEdit}
                className="flex items-center gap-2 rounded-full bg-brand-500 px-5 py-2.5 text-sm font-extrabold text-on-brand transition hover:bg-brand-600 disabled:opacity-50"
              >
                {busy === 'save' ? <SpinnerIcon className="h-4 w-4 animate-spin" /> : null}
                שמור ובדוק מחדש
              </button>
            </div>
          ) : (
            <dl className="space-y-3 text-sm" dir={meta.dir}>
              {([
                ['Title', article.title],
                ['H1', article.h1],
                ['Meta Description', article.meta_description],
                ['ביטויי מטרה', article.keywords.join(' · ')],
                ['כתובת', `/articles/${article.slug}`],
              ] as const).map(([label, value]) => (
                <div key={label} className="rounded-xl bg-ink-900 px-3 py-2.5">
                  <dt className="text-xs font-bold text-mist-500" dir="rtl">{label}</dt>
                  <dd className="mt-0.5 text-mist-100">{value || '—'}</dd>
                </div>
              ))}
            </dl>
          )}
        </Panel>

        {/* ── Preview, in the article's own direction ──────────────────── */}
        <Panel title="צפייה מקדימה" hint="כך ייראה המאמר לקורא">
          <div
            className="rounded-2xl bg-ink-900 p-5"
            lang={meta.htmlLang}
            dir={meta.dir}
          >
            <h3 className="text-2xl font-black leading-tight text-mist-100">{article.h1 || article.title}</h3>
            <div className="mt-6">
              <ArticleBody body={article.body} />
            </div>
            {article.faq.length ? (
              <div className="mt-8 border-t border-ink-800 pt-6">
                <h4 className="font-extrabold text-mist-100">
                  {article.lang === 'he' ? 'שאלות ותשובות' : 'Вопросы и ответы'}
                </h4>
                <dl className="mt-3 space-y-3">
                  {article.faq.map((f) => (
                    <div key={f.q}>
                      <dt className="font-bold text-mist-100">{f.q}</dt>
                      <dd className="mt-1 leading-relaxed text-mist-300">{f.a}</dd>
                    </div>
                  ))}
                </dl>
              </div>
            ) : null}
            {article.internal_links.length ? (
              <ul className="mt-6 space-y-1 border-t border-ink-800 pt-4">
                {article.internal_links.map((l) => (
                  <li key={l.href} className="text-sm">
                    <span className="font-bold text-brand-400">{l.anchor}</span>
                    <span className="ms-2 text-mist-500" dir="ltr">{l.href}</span>
                  </li>
                ))}
              </ul>
            ) : null}
          </div>
        </Panel>

        {/* ── History ─────────────────────────────────────────────────── */}
        <Panel title="היסטוריית גרסאות" hint="כל שינוי נשמר וניתן לשחזור">
          {versions.length === 0 ? (
            <p className="text-sm text-mist-500">אין גרסאות קודמות.</p>
          ) : (
            <ul className="space-y-2">
              {versions.map((v) => (
                <li
                  key={v.id}
                  className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-ink-900 px-3 py-2.5 text-sm"
                >
                  <span className="text-mist-300">
                    <b className="text-mist-100">{v.reason}</b> ·{' '}
                    <span className="tabular-nums">{new Date(v.created_at).toLocaleString('he-IL')}</span>
                  </span>
                  <button
                    type="button"
                    disabled={busy !== ''}
                    onClick={() => act('restore', () => restoreVersion(article, v.snapshot, userId))}
                    className="rounded-full border border-ink-800 px-3 py-1.5 text-xs font-bold text-mist-300 transition hover:bg-ink-850 disabled:opacity-50"
                  >
                    שחזר
                  </button>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </SeoShell>
  );
}
