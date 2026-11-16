import { LANGS, type Lang } from '@/lib/seo/config';
import { planWeeklyTopics, type Opportunity, type PlannedTopic } from '@/lib/seo/planner';
import { clearsGate, runQualityChecks, type Draft } from '@/lib/seo/quality';
import { authenticate, deny } from '@/lib/seo/server/auth';
import {
  MissingApiKeyError,
  generateArticle,
  sanitizeFaq,
  sanitizeLinks,
  sanitizeSlug,
  toBlocks,
} from '@/lib/seo/server/generate';
import { classifyOpportunity, detectCity, detectLang, fetchQueries } from '@/lib/seo/server/gsc';
import { supabaseAdmin } from '@/lib/seo/server/supabaseAdmin';

/**
 * The weekly content cycle.
 *
 * POST /api/seo/run — called by the weekly scheduler
 * (.github/workflows/seo-weekly.yml, presenting CRON_SECRET) or by the "run
 * the cycle now" button in /crm/seo (presenting the admin's Supabase token).
 *
 * POST rather than GET deliberately: `output: export` rejects any route handler
 * that is not force-static, and a GET handler would therefore break
 * `npm run export` — which this repo really uses, to publish the static site to
 * GitHub Pages. Next silently omits POST-only handlers from the export instead,
 * so the existing deploy keeps working and the scheduler uses POST.
 *
 * The cycle: find subjects → generate Hebrew and Russian for each → run the
 * quality gate on each → save. NOTHING is published. Every article lands as
 * `pending_approval` when it clears the gate or `draft` when it does not, and a
 * human moves it from there. There is no code path in this file that can set
 * `published` — that status is only ever written by the approval action in the
 * dashboard, which is the structural form of the spec's "no automatic
 * publishing" rule.
 *
 * Partial failure is normal and is reported as such: one language failing does
 * not roll back the other, and the run ends 'partial' with the error logged
 * against it rather than discarding three good articles because the fourth
 * broke.
 */

/** Generation is slow — four long articles. Well inside Vercel's 15-minute cap. */
export const maxDuration = 800;

type RunOutcome = {
  ok: boolean;
  runId: string | null;
  topicsPlanned: number;
  articlesCreated: number;
  failures: { topicKey: string; lang: Lang; error: string }[];
};

async function log(
  runId: string | null,
  level: 'info' | 'warn' | 'error',
  action: string,
  message: string,
  meta: Record<string, unknown> = {},
) {
  if (!supabaseAdmin) return;
  await supabaseAdmin.from('seo_logs').insert({ run_id: runId, level, action, message, meta });
}

/**
 * Pulls real Search Console demand, when the connection is configured.
 *
 * A missing or failing connection is not an error for the cycle: the planner
 * falls back to the seed backlog. The reason is logged so the dashboard can
 * show why this week's subjects came from the backlog rather than from data.
 */
async function gatherOpportunities(runId: string): Promise<Opportunity[]> {
  const result = await fetchQueries(28, 3, ['query']);
  if (!result.ok) {
    await log(
      runId,
      'warn',
      'gsc_unavailable',
      result.connection.state === 'not_configured'
        ? `Search Console לא מחובר (חסר: ${result.connection.missing.join(', ')}) — הנושאים נבחרו מהמאגר המתוכנן`
        : `שגיאה בקריאת Search Console — הנושאים נבחרו מהמאגר המתוכנן`,
      { connection: result.connection },
    );
    return [];
  }

  const opportunities: Opportunity[] = [];
  for (const row of result.rows) {
    const lang = detectLang(row.query);
    if (!lang) continue; // Unclassifiable script — never guessed into a language.
    opportunities.push({
      query: row.query,
      lang,
      city: detectCity(row.query),
      impressions: row.impressions,
      clicks: row.clicks,
      ctr: row.ctr,
      position: row.position,
      opportunity: classifyOpportunity(row),
    });
  }

  // Persist the research alongside the run, so the keyword screen has real
  // rows to show and the operator can see what drove the choice.
  if (opportunities.length && supabaseAdmin) {
    await supabaseAdmin.from('seo_keywords').upsert(
      opportunities.map((o) => ({
        query: o.query,
        lang: o.lang,
        city: o.city,
        impressions: o.impressions,
        clicks: o.clicks,
        ctr: o.ctr,
        position: o.position,
        opportunity: o.opportunity,
        source: 'gsc' as const,
        captured_for: result.endDate,
      })),
      { onConflict: 'query,lang,captured_for' },
    );
  }

  await log(runId, 'info', 'gsc_research', `נקראו ${result.rows.length} שאילתות מ-Search Console`, {
    window: `${result.startDate}..${result.endDate}`,
    actionable: opportunities.filter((o) => o.opportunity).length,
  });

  return opportunities;
}

/** Generates, grades and stores one language version. Throws on failure. */
async function produceVersion(
  runId: string,
  topic: PlannedTopic,
  lang: Lang,
  existingDrafts: Draft[],
  avoidTitles: string[],
): Promise<void> {
  if (!supabaseAdmin) throw new Error('Supabase service role not configured');

  const generated = await generateArticle({
    subject: topic.subject[lang],
    rationale: topic.rationale,
    lang,
    city: topic.city,
    avoidTitles,
  });

  const draft: Draft = {
    lang,
    city: topic.city,
    title: generated.title.trim(),
    meta_description: generated.meta_description.trim(),
    h1: generated.h1.trim(),
    body: toBlocks(generated.body),
    faq: sanitizeFaq(generated.faq),
    internal_links: sanitizeLinks(generated.internal_links),
    keywords: generated.keywords.map((k) => k.trim()).filter(Boolean),
  };

  const report = runQualityChecks(draft, existingDrafts);
  const passed = clearsGate(report);

  const { error } = await supabaseAdmin.from('seo_articles').insert({
    topic_key: topic.topicKey,
    lang,
    slug: sanitizeSlug(generated.slug, lang),
    city: topic.city,
    // The only two statuses this endpoint can write. Never 'published'.
    status: passed ? 'pending_approval' : 'draft',
    title: draft.title,
    meta_description: draft.meta_description,
    h1: draft.h1,
    body: draft.body,
    faq: draft.faq,
    internal_links: draft.internal_links,
    keywords: draft.keywords,
    quality_score: report.score,
    quality_report: report,
    run_id: runId,
  });
  if (error) throw new Error(`שמירה נכשלה: ${error.message}`);

  // Feed this version into the comparison set, so the second language and the
  // next topic are checked against it too.
  existingDrafts.push(draft);

  await log(
    runId,
    passed ? 'info' : 'warn',
    'article_created',
    passed
      ? `נוצר מאמר ב${lang === 'he' ? 'עברית' : 'רוסית'} וממתין לאישור (ציון ${report.score})`
      : `נוצר מאמר ב${lang === 'he' ? 'עברית' : 'רוסית'} אבל לא עבר את בדיקות האיכות (ציון ${report.score}) — נשמר כטיוטה`,
    {
      topicKey: topic.topicKey,
      failedChecks: report.checks.filter((c) => !c.pass).map((c) => c.id),
    },
  );
}

export async function POST(request: Request): Promise<Response> {
  const caller = await authenticate(request);
  if (caller.kind === 'denied') return deny(caller);

  if (!supabaseAdmin) {
    return Response.json(
      { ok: false, error: 'SUPABASE_SERVICE_ROLE_KEY לא מוגדר — המחזור לא יכול לשמור מאמרים' },
      { status: 503 },
    );
  }
  if (!process.env.ANTHROPIC_API_KEY) {
    return Response.json(
      { ok: false, error: 'ANTHROPIC_API_KEY לא מוגדר — מנוע הכתיבה לא זמין' },
      { status: 503 },
    );
  }

  const kind = caller.kind === 'cron' ? 'weekly' : 'manual';

  const { data: run, error: runError } = await supabaseAdmin
    .from('seo_runs')
    .insert({ kind, status: 'running' })
    .select('id')
    .single();
  if (runError || !run) {
    return Response.json(
      { ok: false, error: `לא ניתן לפתוח מחזור: ${runError?.message ?? 'unknown'}` },
      { status: 500 },
    );
  }
  const runId = run.id as string;

  const outcome: RunOutcome = {
    ok: true,
    runId,
    topicsPlanned: 0,
    articlesCreated: 0,
    failures: [],
  };

  try {
    const opportunities = await gatherOpportunities(runId);

    // Everything already in the system: topic keys for the duplicate guard,
    // and the bodies the duplication check compares against.
    const { data: existing } = await supabaseAdmin
      .from('seo_articles')
      .select('topic_key, lang, city, title, meta_description, h1, body, faq, internal_links, keywords');

    const existingRows = existing ?? [];
    const existingTopicKeys = [...new Set(existingRows.map((r) => r.topic_key as string))];
    const existingDrafts = existingRows as unknown as Draft[];
    const avoidTitles = existingRows.map((r) => r.title as string).filter(Boolean);

    const topics = planWeeklyTopics({
      opportunities,
      existingTopicKeys,
      seedCursor: existingTopicKeys.length,
    });
    outcome.topicsPlanned = topics.length;

    await supabaseAdmin.from('seo_runs').update({ topics_planned: topics.length }).eq('id', runId);
    await log(runId, 'info', 'topics_planned', `נבחרו ${topics.length} נושאים לשבוע`, {
      topics: topics.map((t) => ({ key: t.topicKey, city: t.city })),
    });

    for (const topic of topics) {
      for (const lang of LANGS) {
        try {
          await produceVersion(runId, topic, lang, existingDrafts, avoidTitles);
          outcome.articlesCreated += 1;
        } catch (error) {
          const message = error instanceof MissingApiKeyError
            ? 'ANTHROPIC_API_KEY לא מוגדר'
            : error instanceof Error
              ? error.message
              : String(error);
          outcome.failures.push({ topicKey: topic.topicKey, lang, error: message });
          await log(runId, 'error', 'article_failed', message, { topicKey: topic.topicKey, lang });
        }
      }
    }

    const status = outcome.failures.length === 0
      ? 'succeeded'
      : outcome.articlesCreated > 0
        ? 'partial'
        : 'failed';
    outcome.ok = status !== 'failed';

    await supabaseAdmin
      .from('seo_runs')
      .update({
        status,
        articles_created: outcome.articlesCreated,
        error: outcome.failures.map((f) => `${f.topicKey}/${f.lang}: ${f.error}`).join(' | '),
        finished_at: new Date().toISOString(),
      })
      .eq('id', runId);

    return Response.json(outcome, { status: outcome.ok ? 200 : 500 });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await log(runId, 'error', 'run_failed', message);
    await supabaseAdmin
      .from('seo_runs')
      .update({ status: 'failed', error: message, finished_at: new Date().toISOString() })
      .eq('id', runId);
    return Response.json({ ...outcome, ok: false, error: message }, { status: 500 });
  }
}
