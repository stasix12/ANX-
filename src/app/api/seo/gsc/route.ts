import { authenticate, deny } from '@/lib/seo/server/auth';
import { classifyOpportunity, detectCity, detectLang, fetchQueries } from '@/lib/seo/server/gsc';

/**
 * Search Console data for the dashboard.
 *
 * POST /api/seo/gsc { days } — returns the current window, the previous window
 * of the same length for comparison, and the per-query rows classified by
 * language and target city.
 *
 * POST rather than GET so that `output: export` keeps building: it rejects any
 * non-force-static route handler, and POST-only handlers are omitted from the
 * export instead of failing it.
 *
 * The Google credentials never leave the server; the browser only ever sees the
 * aggregated numbers. When the connection is not configured the response says
 * so and names the missing variables, and the dashboard renders that message
 * rather than zeros.
 */
export async function POST(request: Request): Promise<Response> {
  const caller = await authenticate(request);
  if (caller.kind === 'denied') return deny(caller);

  // A malformed or absent body simply means the default window.
  const body = await request.json().catch(() => ({}) as Record<string, unknown>);
  const requested = Number((body as { days?: unknown }).days ?? 28);
  const days = Math.min(Math.max(Number.isFinite(requested) ? requested : 28, 7), 180);

  // Current window, and the window of equal length immediately before it.
  const [current, previous] = await Promise.all([
    fetchQueries(days, 3, ['query', 'page']),
    fetchQueries(days, 3 + days, ['query']),
  ]);

  if (!current.ok) {
    return Response.json({ ok: false, connection: current.connection }, { status: 200 });
  }

  const rows = current.rows.map((r) => ({
    ...r,
    lang: detectLang(r.query),
    city: detectCity(r.query),
    opportunity: classifyOpportunity(r),
  }));

  return Response.json({
    ok: true,
    window: { startDate: current.startDate, endDate: current.endDate, days },
    totals: current.totals,
    // null rather than a zeroed object when the comparison window failed, so
    // the UI shows "no comparison" instead of a fabricated -100%.
    previousTotals: previous.ok ? previous.totals : null,
    rows,
  });
}
