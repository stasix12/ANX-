'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { t, keep } from '@/lib/social/i18n';
import { CATALOG_PAGE, catalogFacets, catalogStats, searchCatalog, type CatalogGroup } from '@/lib/social/client';
import { friendlyMessage } from '@/lib/social/errors';
import { SearchIcon, UsersIcon } from '@/components/icons';
import { Button, Notice, inputClass } from './ui';

/**
 * ─────────────────────────────────────────────────────────────────────────────
 * "מאגר ארצי" — the national catalog, read straight out of the database.
 *
 *   "כאשר משתמש פותח את מסך הקבוצות, המערכת חייבת להציג מיד את הקבוצות שכבר
 *    קיימות במסד הנתונים. אין לבצע חיפוש חיצוני בכל כניסה למסך... יעד
 *    הביצועים: הצגת תוצאות ראשוניות בתוך שנייה." — 18.11.2026
 *
 * ─── NOTHING HERE TOUCHES FACEBOOK ────────────────────────────────────────
 *
 * That is the whole of the requirement and it is worth stating as a property
 * rather than a promise: this component calls searchCatalog and nothing else.
 * No command is queued, no browser is woken, no scan is started. Opening the
 * tab is one SELECT against an indexed table. Measured on a catalog of 40,000
 * groups: 0.24ms for the first page, 3.5ms filtered by city and language, 22ms
 * for a free-text name search WITH an exact count.
 *
 * ─── AND THE FILTERING IS NOT HERE EITHER ─────────────────────────────────
 *
 * The screen beside this one holds every group in an array and filters it in
 * JavaScript. On a catalog that fails twice: PostgREST stops at a thousand
 * rows without saying so, and every count drawn beside the list is then
 * computed from a truncated array — authoritative-looking numbers about a list
 * that is not all of it. So the search, the filters, the order, the paging AND
 * the count all happen in Postgres. What crosses the wire is one page and one
 * number.
 *
 * ─── THE NUMBER IS THE DATABASE'S, NEVER THE ARRAY'S ──────────────────────
 *
 * `total` comes back from the same query that returned the page, counted by
 * Postgres over the whole match. `rows.length` is never shown as a count of
 * anything but what is drawn. This product has shipped the other kind twice.
 *
 * ─── SELECTION SURVIVES PAGING AND FILTERING ──────────────────────────────
 *
 * Held as a Map of id → group rather than a list of ids, because a selection
 * made on page one has to stay nameable after page four has replaced the rows
 * — "בחירת קבוצות מרובות" means across the whole session, not within a page.
 * ─────────────────────────────────────────────────────────────────────────────
 */

/** The languages the catalog stores, in the words a person uses for them. */
const LANGUAGE_LABEL: Record<string, string> = {
  ru: 'רוסית',
  he: 'עברית',
  ar: 'ערבית',
};

/** "12,400 חברים" — a group's size, or nothing when it was never read. */
function membersWords(n: number | null): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '';
  return `${n.toLocaleString('he-IL')} חברים`;
}

export function GroupCatalog({
  onAdd,
  busy = false,
}: {
  /**
   * Hand the chosen groups to the screen that owns adding them. This component
   * never writes: it is a reader, and "a group is selected" is not the same
   * fact as "we may publish there" — the caller keeps that distinction.
   */
  onAdd?: (groups: CatalogGroup[]) => boolean | void | Promise<boolean | void>;
  busy?: boolean;
}) {
  const [rows, setRows] = useState<CatalogGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{ total: number; unavailable: number; updatedAt: string | null } | null>(null);
  const [facets, setFacets] = useState<{ cities: string[]; languages: string[]; categories: string[]; capped: boolean } | null>(null);
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  const [language, setLanguage] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Map<string, CatalogGroup>>(new Map());

  /*
   * ONE REQUEST WINS, AND IT IS THE LAST ONE TYPED.
   *
   * A search box fires a request per keystroke-ish, and they do not come back
   * in order: "באר" can land after "באר שבע" and replace a narrow list with a
   * wide one under the owner's hands. Every load takes a ticket and only the
   * newest ticket is allowed to write state.
   */
  const ticket = useRef(0);

  const load = useCallback(
    async (opts: { append?: boolean } = {}) => {
      const mine = ticket.current + 1;
      ticket.current = mine;
      if (opts.append) setMore(true);
      else setLoading(true);
      try {
        const page = await searchCatalog({
          q: query,
          city,
          language,
          category,
          offset: opts.append ? rows.length : 0,
          limit: CATALOG_PAGE,
        });
        if (ticket.current !== mine) return;
        setRows((prev) => (opts.append ? [...prev, ...page.rows] : page.rows));
        setTotal(page.total);
        setError(null);
      } catch (err) {
        if (ticket.current !== mine) return;
        setError(friendlyMessage(err, 'טעינת המאגר נכשלה.'));
      } finally {
        if (ticket.current === mine) {
          setLoading(false);
          setMore(false);
        }
      }
    },
    [query, city, language, category, rows.length],
  );

  /* The header line and the chips are asked for once — they describe the
     catalog, not the current filter, and re-reading them on every keystroke
     would be two extra queries for an answer that did not change. */
  useEffect(() => {
    catalogStats().then(setStats).catch(() => undefined);
    catalogFacets().then(setFacets).catch(() => undefined);
  }, []);

  /*
   * DEBOUNCED ON THE PHRASE, IMMEDIATE ON THE CHIPS. Typing is a stream and
   * deserves a pause; tapping a city is a decision and deserves an answer.
   */
  useEffect(() => {
    const id = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, city, language, category]);

  const toggle = (g: CatalogGroup) =>
    setChosen((prev) => {
      const next = new Map(prev);
      if (next.has(g.external_id)) next.delete(g.external_id);
      else next.set(g.external_id, g);
      return next;
    });

  /*
   * "בחירת כל התוצאות המסוננות" — and it can only honestly offer what is ON
   * SCREEN. Selecting 12,000 rows the browser has never seen would mean
   * fetching them all, which is the thing this component exists not to do. So
   * the button says how many it is taking, and the line beside it says how
   * many the filter really matches.
   */
  const takeShown = () =>
    setChosen((prev) => {
      const next = new Map(prev);
      for (const g of rows) next.set(g.external_id, g);
      return next;
    });

  const chosenList = [...chosen.values()];
  const shownAll = rows.length >= total;

  return (
    <section data-group-catalog className="space-y-3">
      {/* ─── 1. what the catalog holds, in one compact line ──────────────── */}
      <div className="flex flex-wrap items-center justify-between gap-2 rounded-2xl border border-brand-500/20 bg-ink-850 px-3 py-2">
        <p className="text-[12px] font-bold text-mist-100">
          {t('מאגר ארצי')}:{' '}
          <span className="tabular-nums" dir="ltr">
            {(stats?.total ?? 0).toLocaleString('he-IL')}
          </span>{' '}
          {t('קבוצות')}
          {stats && stats.unavailable > 0 && (
            <span className="font-medium text-mist-500">
              {' · '}
              <span className="tabular-nums" dir="ltr">{stats.unavailable.toLocaleString('he-IL')}</span> {t('לא זמינות')}
            </span>
          )}
        </p>
        {stats?.updatedAt && (
          <p className="text-[11px] font-bold text-mist-500">
            {t('עודכן לאחרונה')}:{' '}
            <span dir="ltr">{new Date(stats.updatedAt).toLocaleDateString('he-IL')}</span>
          </p>
        )}
      </div>

      {/* ─── 2. search ──────────────────────────────────────────────────── */}
      <div className="relative">
        <SearchIcon aria-hidden className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 text-mist-500" />
        <input
          type="search"
          dir="auto"
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder={t('חיפוש קבוצה לפי שם')}
          aria-label={t('חיפוש קבוצה לפי שם')}
          className={`${inputClass} pe-9`}
        />
      </div>

      {/* ─── 3. the filters ─────────────────────────────────────────────── */}
      {/*
        Native selects, and only for values the catalog really holds — a city
        with no groups behind it is a filter that empties the screen and reads
        as broken. `[&>*]:min-w-0` is this product's standing rule for every
        multi-column grid.
      */}
      <div className="grid grid-cols-3 gap-2 [&>*]:min-w-0">
        <select aria-label={t('עיר')} value={city} onChange={(e) => setCity(e.target.value)} className={inputClass}>
          <option value="">{t('כל הערים')}</option>
          {(facets?.cities ?? []).map((c) => (
            <option key={c} value={c}>{keep(c)}</option>
          ))}
        </select>
        <select aria-label={t('שפה')} value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass}>
          <option value="">{t('כל השפות')}</option>
          {(facets?.languages ?? []).map((l) => (
            <option key={l} value={l}>{LANGUAGE_LABEL[l] ?? l}</option>
          ))}
        </select>
        <select aria-label={t('קטגוריה')} value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
          <option value="">{t('כל הקטגוריות')}</option>
          {(facets?.categories ?? []).map((c) => (
            <option key={c} value={c}>{keep(c)}</option>
          ))}
        </select>
      </div>

      {/* ─── 4. the count, and what it means ────────────────────────────── */}
      {/*
        TWO NUMBERS AND THEY SAY DIFFERENT THINGS: how many the filter matches
        in the database, and how many are drawn. A single number here would be
        the truncated-array lie this component was written to avoid.
      */}
      <p data-catalog-count className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[12px] font-bold text-mist-300">
        <span>
          <span className="tabular-nums" dir="ltr">{total.toLocaleString('he-IL')}</span> {t('תוצאות')}
        </span>
        {!shownAll && (
          <span className="font-medium text-mist-500">
            ({t('מוצגות')} <span className="tabular-nums" dir="ltr">{rows.length}</span>)
          </span>
        )}
        {rows.length > 0 && onAdd && (
          /* A CONTROL, NOT A WORD IN A SENTENCE. Written as an underlined link
             inside this line it measured 18px high — half this product's
             smallest tappable — on the screen he uses from a phone. min-h-9
             is the secondary floor the rest of the app uses for a chip beside
             text (CommentQueueCard, QuickCommentCard), and
             worker/test/catalog-screen.test.ts measures it. */
          <button
            type="button"
            onClick={takeShown}
            className="inline-flex min-h-9 items-center rounded-lg bg-ink-800 px-2.5 text-[12px] font-bold text-brand-400 transition-colors hover:bg-ink-700 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-brand-300"
          >
            {t('בחר את המוצגות')}
          </button>
        )}
      </p>

      {error && <Notice tone="error">{error}</Notice>}

      {/* ─── 5. the rows ────────────────────────────────────────────────── */}
      {loading ? (
        <p className="py-6 text-center text-sm text-mist-500">{t('טוען…')}</p>
      ) : rows.length === 0 ? (
        <p className="py-6 text-center text-sm text-mist-500">
          {stats && stats.total === 0
            ? t('המאגר עדיין ריק. הוא יתמלא מהקבוצות שהמחשב מגלה.')
            : t('אין קבוצות שמתאימות לסינון הזה.')}
        </p>
      ) : (
        <ul className="space-y-1.5">
          {rows.map((g) => {
            const on = chosen.has(g.external_id);
            return (
              <li key={g.external_id}>
                <button
                  type="button"
                  onClick={() => onAdd && toggle(g)}
                  aria-pressed={onAdd ? on : undefined}
                  disabled={!onAdd}
                  className={`flex w-full min-w-0 items-center gap-2.5 rounded-2xl border p-2 text-start transition-colors ${
                    on ? 'border-brand-500 bg-brand-500/10' : 'border-ink-700 bg-ink-900 hover:border-brand-500/40'
                  } disabled:cursor-default`}
                >
                  {g.image_url ? (
                    // eslint-disable-next-line @next/next/no-img-element
                    <img src={g.image_url} alt="" className="h-9 w-9 shrink-0 rounded-lg object-cover" />
                  ) : (
                    <span aria-hidden className="grid h-9 w-9 shrink-0 place-items-center rounded-lg bg-ink-800 text-mist-500">
                      <UsersIcon className="h-4 w-4" />
                    </span>
                  )}
                  <span className="min-w-0 flex-1">
                    {/* data-no-translate: a group's name is its own, in whatever
                        language it was written. */}
                    <span dir="auto" data-no-translate className="block truncate text-[13px] font-bold text-mist-100">
                      {g.name}
                    </span>
                    <span dir="auto" className="block truncate text-[11px] text-mist-500">
                      {[membersWords(g.members), g.city, LANGUAGE_LABEL[g.language] ?? '', g.status === 'unavailable' ? t('לא זמינה') : '']
                        .filter(Boolean)
                        .join(' · ')}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}

      {/* ─── 6. more, and only when there really is more ─────────────────── */}
      {!loading && !shownAll && (
        <Button variant="secondary" busy={more} onClick={() => void load({ append: true })} className="w-full justify-center">
          {t('טען עוד')}
        </Button>
      )}

      {/* ─── 7. and what to do with the chosen ───────────────────────────── */}
      {onAdd && chosenList.length > 0 && (
        <div className="sticky bottom-2 flex items-center justify-between gap-2 rounded-2xl border border-brand-500/30 bg-ink-850 p-2 shadow-[0_8px_20px_-12px_rgba(2,124,187,0.6)]">
          <span className="text-[12px] font-bold text-mist-100">
            <span className="tabular-nums" dir="ltr">{chosenList.length}</span> {t('נבחרו')}
          </span>
          <span className="flex gap-2">
            <Button variant="ghost" onClick={() => setChosen(new Map())} className="!min-h-9 px-3 !text-[12px]">
              {t('נקה')}
            </Button>
            {/* CLEARED ONLY ONCE IT REALLY LANDED. Emptying the bar on the tap
                would wipe a selection of sixty groups on a failed write, with
                nothing left on screen to try again with — so the caller's
                answer decides, and `false` keeps the selection. */}
            <Button
              busy={busy}
              onClick={async () => {
                const ok = await onAdd(chosenList);
                if (ok !== false) setChosen(new Map());
              }}
              className="!min-h-9 px-3 !text-[12px]"
            >
              {t('הוסף לקבוצות שלי')}
            </Button>
          </span>
        </div>
      )}
    </section>
  );
}
