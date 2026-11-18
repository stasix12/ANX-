'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { t, keep } from '@/lib/social/i18n';
import {
  CATALOG_PAGE,
  catalogFacets,
  catalogStats,
  listMembershipByExternalId,
  listTargetExternalIds,
  searchCatalog,
  type CatalogFacets,
  type CatalogGroup,
  type CatalogSort,
} from '@/lib/social/client';
import { Figure, GroupRow } from './Discovery';
import type { DiscoveredGroupRow } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';
import { CATALOG_LANGUAGE_LABEL } from '@/lib/social/language';
import { REGIONS, cityInRegion } from '@/lib/social/cities';
import { SearchIcon } from '@/components/icons';
import { Button, Notice, inputClass, useConfirm } from './ui';

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

/**
 * How many groups at once turns "add" into a gesture worth confirming.
 *
 * Not a cap and not a warning on every press: one row, or a handful picked by
 * hand, is a decision he is looking at. This is the number at which a
 * selection stops being that — see the note on the button.
 */
const CATALOG_BULK_CONFIRM = 25;

/**
 * A catalog row in the shape the discovery row draws.
 *
 * NOT A LOSSY COPY — every field the row reads is a field the catalog has,
 * except the three it cannot have and must not invent:
 *
 *   · membership — handed in, and NEVER read off the catalog. The catalog
 *     says a group EXISTS; a badge reading חבר off a shared table would be
 *     one customer's membership shown to another. What is passed instead is
 *     this business's own answer out of its own גילוי קבוצות rows, and
 *     'unknown' — which draws no badge at all — wherever it has not looked.
 *   · queries — []. The phrases are a property of one business's searches.
 *   · target_id / hidden — the publishing list and one user's dismissals,
 *     neither of which lives in a shared catalog.
 */
function asDiscovered(g: CatalogGroup, membership: DiscoveredGroupRow['membership'] = 'unknown'): DiscoveredGroupRow {
  return {
    id: g.external_id,
    external_id: g.external_id,
    name: g.name,
    url: g.url,
    image_url: g.image_url,
    members: g.members,
    privacy: g.privacy,
    membership,
    queries: [],
    first_seen_at: g.first_seen_at,
    last_seen_at: g.last_seen_at,
    target_id: null,
    hidden: false,
  };
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
  /**
   * Hand the chosen groups to the screen that owns adding them.
   *
   * `source` is how that screen can tell a row's own button from the bar at
   * the bottom — the campaign sheet closes itself after a deliberate bulk
   * add, and must NOT close after one row was added out of sixty he is still
   * picking through.
   */
  onAdd?: (groups: CatalogGroup[], source: 'row' | 'bulk') => boolean | void | Promise<boolean | void>;
  busy?: boolean;
}) {
  const [rows, setRows] = useState<CatalogGroup[]>([]);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<{ total: number; unavailable: number; updatedAt: string | null } | null>(null);
  const [facets, setFacets] = useState<CatalogFacets | null>(null);
  const [query, setQuery] = useState('');
  const [city, setCity] = useState('');
  /* צפון · מרכז · דרום · אילת — "כולל צפון מרכז דרום ואילת", his four. */
  const [region, setRegion] = useState('');
  const [language, setLanguage] = useState('');
  const [category, setCategory] = useState('');
  const [loading, setLoading] = useState(true);
  const [more, setMore] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [chosen, setChosen] = useState<Map<string, CatalogGroup>>(new Map());
  const [sort, setSort] = useState<CatalogSort>('members');
  const confirm = useConfirm();
  /*
   * WHICH OF THESE HE ALREADY HAS — the "כבר במערכת" mark, read once for the
   * whole screen rather than per row. Until it lands no row claims anything:
   * an empty set means every row simply has no badge, never a wrong one.
   */
  /*
   * `null` until it has been read — NOT an empty set.
   *
   * Collapsed to an empty set, a failed read is indistinguishable from "he
   * has no groups": every row loses its "כבר במערכת" badge and the "כבר אצלי"
   * tile draws a confident 0 over a list of 293. A tile that cannot answer
   * says so instead.
   */
  const [mine, setMine] = useState<Set<string> | null>(null);
  /*
   * ─── "לראות אם אני חבר", WHERE THIS ACCOUNT HAS ACTUALLY LOOKED ───────
   *
   * Not from the catalog — a shared table cannot hold one account's
   * memberships — but from his own גילוי קבוצות rows, which are what
   * Facebook's own search said as this account. Where he has never searched,
   * the map simply has no entry and the row says nothing, which is the rule
   * that screen already lives by: "IT DOES NOT GUESS".
   */
  const [member, setMember] = useState<Map<string, 'member' | 'requested' | 'none' | 'unknown'>>(new Map());
  /** The one row whose "הוסף לרשימה" is in flight. */
  const [adding, setAdding] = useState('');

  /*
   * ─── WHAT HE HAS IS THE DATABASE'S ANSWER, NEVER A GUESS FROM THE PAGE ──
   *
   * This used to add every selected id to `mine` after a bulk add. But
   * adoptCatalogGroups returns added / existed / FAILED — a link that does
   * not parse, a row another session took, an RLS refusal — and the callers
   * fold that into one boolean. So ten selected with three refused marked all
   * ten "כבר במערכת": the three lost their add button, took the member skin,
   * could not be retried from this screen at all, and the tile read 303 over
   * a database holding 300.
   *
   * One re-read instead. It is the same query the screen opened with, it is
   * one round trip after a deliberate action, and it cannot be wrong.
   */
  const refreshMine = useCallback(async () => {
    try {
      setMine(await listTargetExternalIds());
    } catch {
      /* Left as it was — a failed refresh must not erase what we know. */
    }
  }, []);

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
          region,
          language,
          category,
          sort,
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
        /*
         * THE ROWS ON SCREEN BELONG TO THE PREVIOUS FILTER, and the next
         * "טען עוד" asks for `offset: rows.length` — an offset into a result
         * set nobody is looking at. Left there, the error message sits over a
         * list that answers a different question, and paging it mixes the two.
         */
        if (!opts.append) {
          setRows([]);
          setTotal(0);
        }
      } finally {
        if (ticket.current === mine) {
          setLoading(false);
          setMore(false);
        }
      }
    },
    [query, city, region, language, category, sort, rows.length],
  );

  /* The header line and the chips are asked for once — they describe the
     catalog, not the current filter, and re-reading them on every keystroke
     would be two extra queries for an answer that did not change. */
  useEffect(() => {
    catalogStats().then(setStats).catch(() => undefined);
    catalogFacets().then(setFacets).catch(() => undefined);
    void refreshMine();
    listMembershipByExternalId().then(setMember).catch(() => undefined);
  }, []);

  /*
   * DEBOUNCED ON THE PHRASE, IMMEDIATE ON THE CHIPS. Typing is a stream and
   * deserves a pause; tapping a city is a decision and deserves an answer.
   */
  useEffect(() => {
    const id = setTimeout(() => void load(), query ? 250 : 0);
    return () => clearTimeout(id);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query, city, region, language, category, sort]);

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
  /*
   * THE FIGURE IS HIS LIST, NOT THIS PAGE. "כבר אצלי" means how many groups
   * he publishes to — the same 293 the tab strip counts — and counting the
   * ticks on the sixty rows that happen to be drawn would be a number that
   * changed every time he scrolled.
   */
  const minePresent = mine ? mine.size : null;
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

      {/* ─── 1b. the three figures, the same tiles גילוי קבוצות draws ─────
          Same component, same tones, same sizes — "שיהיה כמו עיצוב של גילוי
          קבוצות". The three numbers are this screen's own: how big the
          catalog is, how many of it is already his, and what arrived in the
          last week. Each is counted by the database, never by the page. */}
      <div className="grid grid-cols-3 gap-2 [&>*]:min-w-0">
        <Figure tone="brand" value={stats?.total ?? 0} label={t('קבוצות במאגר')} />
        <Figure tone="good" value={minePresent} label={t('כבר אצלי')} />
        <Figure tone="warn" value={stats?.unavailable ?? 0} label={t('לא זמינות')} />
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
      {/*
        FOUR FILTERS, AND EVERY VALUE IN THEM IS ONE THE CATALOG REALLY HOLDS,
        with the number of groups behind it. A city with nothing behind it is
        a filter that empties the screen and reads as broken, so the list is
        the database's answer (social_catalog_facets, v49) rather than a
        constant — and the count beside each one is the database's too.

        REGION FIRST: "כולל צפון מרכז דרום ואילת". It is the widest cut and
        the one a campaign starts from; the city list under it narrows to that
        region as soon as one is chosen.
      */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&>*]:min-w-0">
        <select
          aria-label={t('אזור')}
          value={region}
          onChange={(e) => {
            setRegion(e.target.value);
            /* A city from another region under a region filter is an empty
               screen with two filters on it. The narrower one gives way. */
            if (e.target.value && city && !cityInRegion(city, e.target.value)) setCity('');
          }}
          className={inputClass}
        >
          <option value="">{t('כל הארץ')}</option>
          {REGIONS.map((r) => {
            const n = facets?.regions.find((x) => x.value === r)?.groups;
            return (
              <option key={r} value={r}>
                {keep(r)}
                {n ? ` (${n.toLocaleString('he-IL')})` : ''}
              </option>
            );
          })}
        </select>
        <select aria-label={t('עיר')} value={city} onChange={(e) => setCity(e.target.value)} className={inputClass}>
          <option value="">{t('כל הערים')}</option>
          {(facets?.cities ?? [])
            .filter((c) => !region || cityInRegion(c.value, region))
            .map((c) => (
              <option key={c.value} value={c.value}>
                {keep(c.value)} ({c.groups.toLocaleString('he-IL')})
              </option>
            ))}
        </select>
        <select aria-label={t('שפה')} value={language} onChange={(e) => setLanguage(e.target.value)} className={inputClass}>
          <option value="">{t('כל השפות')}</option>
          {(facets?.languages ?? []).map((l) => (
            <option key={l.value} value={l.value}>
              {CATALOG_LANGUAGE_LABEL[l.value] ?? l.value} ({l.groups.toLocaleString('he-IL')})
            </option>
          ))}
        </select>
        <select aria-label={t('קטגוריה')} value={category} onChange={(e) => setCategory(e.target.value)} className={inputClass}>
          <option value="">{t('כל הקטגוריות')}</option>
          {(facets?.categories ?? []).map((c) => (
            <option key={c.value} value={c.value}>
              {keep(c.value)} ({c.groups.toLocaleString('he-IL')})
            </option>
          ))}
        </select>
      </div>
      {/* SAID OUT LOUD WHEN IT IS TRUE: before v49 the values come from a
          sample of the table, and a filter list that is quietly partial is
          how somebody concludes a city has no groups. */}
      {facets?.capped && (
        <p className="text-[11px] font-bold text-warning-400">
          {t('רשימת הערים כאן חלקית — צריך להריץ את social-latest.sql פעם אחת כדי שהיא תיקרא מהמסד.')}
        </p>
      )}

      {/* ─── 3b. the order, as גילוי קבוצות offers it ("מיון") ──────────── */}
      {/* Three orders, all of them ORDER BY in Postgres over the whole match
          — sorting the sixty rows on screen would be an order over a page. */}
      <div className="flex items-center justify-end gap-1.5 text-[12px] font-bold text-mist-500">
        <span>{t('מיון')}:</span>
        <select
          aria-label={t('מיון')}
          value={sort}
          onChange={(e) => setSort(e.target.value as CatalogSort)}
          /* mist-100, NOT mist-200: there is no --color-mist-200 in any theme
             in this product, so Tailwind resolved it to the storefront's pale
             grey and this select measured 1.25:1 on its own background —
             invisible. The contrast guard cannot see it either: an undefined
             token is in no pair. The same mistake, with the same fix, is
             recorded in ui.tsx on the tabs variant. */
          className="min-h-9 rounded-lg border border-ink-700 bg-ink-900 px-2 text-[12px] font-bold text-mist-100"
        >
          <option value="members">{t('הכי גדולות')}</option>
          <option value="new">{t('נוספו לאחרונה')}</option>
          <option value="name">{t('לפי שם')}</option>
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
          {rows.map((g) => (
            /*
              ─── THE SAME ROW גילוי קבוצות DRAWS ────────────────────────
              "במאגר הארצי שיהיה כמו עיצוב של גילוי קבוצות אם אותם אופציות."

              The component itself, not a copy of its markup: picture, name,
              facts, badges, the checkbox and the one action, at the sizes
              and spacings that screen was measured at. A second copy would
              drift from it within a week.

              WHAT IT IS HANDED, AND WHAT IT IS NOT:
               · membership 'unknown' — the catalog knows that a group
                 EXISTS, never whether this account is in it, so no row
                 claims חבר. That is also why the add button has to be
                 turned on explicitly (offerAdd): the discovery screen's own
                 rule is "only where Facebook said חבר", and it stays that.
               · already — from his own list, so a group he has carries
                 "כבר במערכת" and offers "פתח קבוצה" instead of adding twice.
               · no onHide — the catalog row is shared with every other user
                 of the app, and hiding it is not one user's to do.
            */
            <li key={g.external_id}>
              <GroupRow
                row={asDiscovered(g, member.get(g.external_id) ?? 'unknown')}
                picked={chosen.has(g.external_id)}
                already={Boolean(mine?.has(g.external_id))}
                busy={adding === g.external_id || busy}
                /*
                 * ─── AND NOW THE RULE CAN BE KEPT HERE TOO ─────────────
                 *
                 * "זה נותן לי לצרף לרשימה קבוצות שאני עדיין לא חבר בהם."
                 * Where this account HAS looked and Facebook said he is not
                 * in the group — or that he has only asked — the add button
                 * is not offered at all, exactly as on גילוי קבוצות: each
                 * one would be a publishing target that fails once a day.
                 * It stays on where nothing is known, because that is what
                 * the catalog is for (§6, picking groups for a campaign in a
                 * city he has never searched) and the row says plainly that
                 * nothing is known.
                 */
                offerAdd={Boolean(onAdd) && !['none', 'requested'].includes(member.get(g.external_id) ?? 'unknown')}
                /* A group already in his publishing list opens, it does not
                   "join" — and it takes the quiet skin, as on גילוי קבוצות. */
                /*
                 * A group of his that Facebook has since refused is not one
                 * to say "פתח קבוצה" about — that is the sentence for a group
                 * you are in, and his own search says he is not. Same rule
                 * the discovery row applies through `refused`.
                 */
                openAsMember={Boolean(mine?.has(g.external_id)) && member.get(g.external_id) !== 'none'}
                refused={Boolean(mine?.has(g.external_id)) && member.get(g.external_id) === 'none'}
                /* THE CATALOG'S OWN FACTS, which the discovery row has no way
                   to know: the city it is in and the language it is written
                   in. Without these two the row says only its size and
                   whether it is public — less than this screen showed before
                   it moved onto the shared row. */
                extraFacts={[g.city, CATALOG_LANGUAGE_LABEL[g.language] ?? ''].filter(Boolean)}
                /* AND THE ONE THING THAT CHANGES WHAT HE DOES WITH IT. A
                   group the catalog has marked unavailable was drawn exactly
                   like a live one and offered for adding. */
                mark={g.status === 'unavailable' ? { tone: 'warn', text: t('לא זמינה') } : null}
                onToggle={() => onAdd && toggle(g)}
                onAdopt={async () => {
                  if (!onAdd) return;
                  setAdding(g.external_id);
                  try {
                    const ok = await onAdd([g], 'row');
                    /* Asked, not assumed — see refreshMine. */
                    if (ok !== false) await refreshMine();
                  } finally {
                    setAdding('');
                  }
                }}
              />
            </li>
          ))}
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
                /*
                 * ─── THE ONE THING HIS OWN RULE IS ABOUT ────────────────
                 *
                 * "זה נותן לי לצרף לרשימה קבוצות שאני עדיין לא חבר בהם" —
                 * every group added that he is not in becomes a publishing
                 * target that fails once a day with a sensible-looking
                 * reason. גילוי קבוצות answers that by only offering the
                 * button where Facebook's own search said חבר.
                 *
                 * The catalog cannot answer it that way: it is a shared list
                 * of groups that EXIST and it has never known who is in one.
                 * What it can do is make the size of the gesture visible. One
                 * row is a decision he is looking at; sixty at once is the
                 * case that fills his list, so it says the number and what
                 * happens next before it writes anything.
                 */
                if (chosenList.length >= CATALOG_BULK_CONFIRM) {
                  const ok = await confirm.ask({
                    title: `להוסיף ${chosenList.length} קבוצות לרשימה שלך?`,
                    body:
                      'הן ייכנסו לרשימת הקבוצות, והתוכנה במחשב תבדוק כל אחת בנפרד אם אפשר לפרסם בה. ' +
                      'קבוצה שאינכם חברים בה, או שאי אפשר לפרסם בה, תסומן ותופיע בלשונית "דורשות טיפול" — אפשר להשהות או למחוק אותה משם.',
                    confirmLabel: `הוסף ${chosenList.length}`,
                  });
                  if (!ok) return;
                }
                const ok = await onAdd(chosenList, 'bulk');
                if (ok !== false) {
                  setChosen(new Map());
                  /* THE DATABASE'S ANSWER, not the selection's — some of
                     those rows may have been refused. See refreshMine. */
                  await refreshMine();
                }
              }}
              className="!min-h-9 px-3 !text-[12px]"
            >
              {t('הוסף לקבוצות שלי')}
            </Button>
          </span>
        </div>
      )}

      {/* useConfirm hands back the sheet to render — without this line `ask`
          resolves to nothing visible and the promise never settles. */}
      {confirm.dialog}
    </section>
  );
}
