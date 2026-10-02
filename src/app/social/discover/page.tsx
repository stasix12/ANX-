'use client';

import { useCallback, useEffect, useMemo, useState } from 'react';
import { SocialShell } from '@/components/social/SocialShell';
import { FilterRow, GroupRow, MyGroupsCard, ResultsCard, SearchCard, WalkThrough } from '@/components/social/Discovery';
import {
  Button,
  ButtonLink,
  CARD_ELEVATED,
  Card,
  EmptyState,
  ErrorState,
  Notice,
  SkeletonList,
  useConfirm,
  useToast,
} from '@/components/social/ui';
import {
  adoptDiscovered,
  hideDiscovered,
  listDiscovered,
  listSearches,
  listJoined,
  listTargetExternalIds,
  listTargetPictures,
  listWorkers,
  startDiscovery,
  startJoinGroups,
  startJoinedScan,
  watchSearch,
  waitForWorkerCommand,
} from '@/lib/social/client';
import {
  FILTER_LABEL,
  JOINED_QUERY,
  SORT_LABEL,
  matchesFilter,
  newSince,
  normalizeQuery,
  queryProblem,
  sortGroups,
  summarize,
  type DiscoveryFilter,
  type DiscoverySort,
} from '@/lib/social/discovery';
import { friendlyMessage } from '@/lib/social/errors';
import { relativeHe } from '@/lib/social/time';
import type { DiscoveredGroupRow, DiscoverySearchRow } from '@/lib/social/types';
import { CloseIcon, EyeIcon, SearchIcon, UsersIcon } from '@/components/icons';

/**
 * גילוי קבוצות — "מצא קבוצות חדשות שמתאימות לעסק שלך".
 *
 * WHAT THIS SCREEN IS FOR. Every group in this product arrived the same way
 * until now: the owner found it on Facebook himself, copied the link, pasted
 * it in. That works for the first ten and it is why the list stopped growing
 * at a hundred and thirty-four. He types "באר שבע", the machine reads
 * Facebook's own search as the account that is already signed in, and the rows
 * come back here.
 *
 * WHAT IT WILL NOT DO, and this is the part worth being deliberate about:
 *
 *   IT DOES NOT JOIN ANYTHING. Not one group, not in a batch, not "in the
 *   background". Every path out of this screen ends at a link that opens the
 *   group in a new tab, where Facebook's own join button is, and a person
 *   presses it. He asked for that — "לא לשלוח באופן אגרסיבי בקשות הצטרפות
 *   למספר רב של קבוצות ללא פעולה של המשתמש" — and it is also the only version
 *   worth shipping: a script that joins a hundred groups is the behaviour that
 *   gets an account restricted, and it is his account with his business on it.
 *
 *   IT DOES NOT GUESS. "חבר בקבוצה" is shown when the search result said so,
 *   and when it did not the row says nothing rather than the likeliest answer.
 *   The alternative is offering a join button for a group he has been
 *   publishing to for a year, which is the kind of wrong that costs trust in
 *   everything else on the screen.
 *
 * NOTHING ELSE IN THE PRODUCT CHANGES. This reads two tables of its own and
 * writes to social_targets only through addGroup(), the same function the
 * "+ הוסף" sheet on the groups screen has always called.
 */

/** How the rows are asked for. Membership first, then the two privacies. */
const FILTERS: DiscoveryFilter[] = ['all', 'none', 'member', 'requested', 'public', 'private'];
const SORTS: DiscoverySort[] = ['relevance', 'members', 'name'];

/* The run's own ceiling, mirroring worker/facebook/join.ts. Fifteen groups at
   roughly a minute and a half each is a little over twenty minutes, so the
   screen waits half an hour before it stops watching — and says the run
   continues rather than that it failed. */
const JOIN_RUN_CAP = 15;
const JOIN_WAIT_MS = 30 * 60_000;

/*
 * HOW LONG THE SCREEN WATCHES A SCAN, and why the default was the wrong number.
 *
 * waitForWorkerCommand gives up after 150 seconds. A group search is not a
 * 150-second job and never was: it scrolls the results, then walks back
 * through them to let each card render its picture and its member count (up
 * to two minutes of budget on its own), then uploads a thumbnail per group.
 * The joined scan does the same over four hundred groups.
 *
 * What made that a BUG rather than a short wait is what the screen did next:
 * it re-read the table anyway — before the worker had written anything — and
 * installed the PREVIOUS run's rows, under a message promising that the list
 * would update when the machine finished. Nothing on this page ever re-reads,
 * so it never did. Two correct fixes to the scan landed and the owner saw no
 * change, because he was looking at the scan before them.
 */
const SCAN_WAIT_MS = 10 * 60_000;

export default function DiscoverPage() {
  const [text, setText] = useState('');
  /** The phrase the rows on screen belong to. Not the same as `text`, which
      changes on every keystroke and must not re-filter the list under him. */
  const [active, setActive] = useState('');
  const [rows, setRows] = useState<DiscoveredGroupRow[] | null>(null);
  const [searches, setSearches] = useState<DiscoverySearchRow[]>([]);
  const [inSystem, setInSystem] = useState<Set<string>>(new Set());
  const [filter, setFilter] = useState<DiscoveryFilter>('all');
  const [sort, setSort] = useState<DiscoverySort>('relevance');
  const [picked, setPicked] = useState<Set<string>>(new Set());
  const [walk, setWalk] = useState<DiscoveredGroupRow[] | null>(null);
  const [walkAt, setWalkAt] = useState(0);
  /*
   * "הקבוצות שלי שעוד לא במערכת" — read off Facebook's OWN list of the groups
   * this account is in, which is a different question from anything a search
   * can answer and is kept apart from the search results on screen.
   */
  const [joined, setJoined] = useState<DiscoveredGroupRow[] | null>(null);
  /* Pictures the publishing list already holds, keyed by the group's Facebook
     id — the fallback behind every row that has none of its own. */
  const [targetPics, setTargetPics] = useState<Map<string, string>>(new Map());
  const [scanning, setScanning] = useState(false);
  const [searching, setSearching] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [workerOnline, setWorkerOnline] = useState<boolean | null>(null);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const toast = useToast();
  /* The product's own dialog, not window.confirm: a join run is the one action
     here that changes his Facebook account, and the browser's native box is
     unstyled, untranslated and blocked outright in some webviews. */
  const confirm = useConfirm();

  /* The search that produced what is on screen, for "חדשות מאז החיפוש האחרון". */
  const activeSearch = useMemo(
    () => searches.find((s) => s.normalized === normalizeQuery(active)) ?? null,
    [searches, active],
  );

  const load = useCallback(async (phrase: string) => {
    const [found, saved, targets, workers, pics] = await Promise.all([
      phrase ? listDiscovered(phrase) : Promise.resolve([]),
      listSearches(),
      listTargetExternalIds(),
      listWorkers(),
      listTargetPictures(),
    ]);
    setRows(found);
    setSearches(saved);
    setInSystem(targets);
    setTargetPics(pics);
    setWorkerOnline(workers.some((w) => w.online));
    setWorkerId(workers.find((w) => w.online)?.id ?? workers[0]?.id ?? null);
  }, []);

  /* On arrival: the chips and the machine's state, and the newest search's
     results if there is one, so the screen is not empty for somebody coming
     back to it. */
  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const [saved, targets, workers, mine, pics] = await Promise.all([
          listSearches(),
          listTargetExternalIds(),
          listWorkers(),
          listJoined(),
          listTargetPictures(),
        ]);
        if (!alive) return;
        setSearches(saved);
        setInSystem(targets);
        setTargetPics(pics);
        setJoined(mine);
        setWorkerOnline(workers.some((w) => w.online));
        setWorkerId(workers.find((w) => w.online)?.id ?? workers[0]?.id ?? null);
        /* listSearches already drops the reserved phrase; this is belt. The
           screen loading a phrase into the box by itself is how "@joined"
           reached Facebook at all. */
        const last = saved.find((s) => s.last_run_at && s.normalized !== JOINED_QUERY);
        if (last) {
          setActive(last.query);
          setText(last.query);
          const found = await listDiscovered(last.query);
          if (alive) setRows(found);
        } else {
          setRows([]);
        }
      } catch (err) {
        if (!alive) return;
        setError(friendlyMessage(err, 'טעינה נכשלה.'));
        /* Out of 'טוען…', which is the one state with no way out: the card
           reads `joined === null` as "still loading" and nothing on the page
           sets it again. An empty list plus the error banner is the truth. */
        setJoined((was) => was ?? []);
        setRows((was) => was ?? []);
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  /**
   * ASK THE MACHINE, THEN READ THE ROWS IT LEFT.
   *
   * The command is the only part that touches Facebook, and it takes as long
   * as it takes — a minute is normal for six passes of scrolling. The screen
   * stays usable throughout ("לא להקפיא את כל הממשק בזמן החיפוש"): the
   * previous results, the chips and every button on them keep working, and
   * only the search field's own button shows the wait.
   */
  const run = useCallback(
    async (phrase: string) => {
      const problem = queryProblem(phrase);
      if (problem) {
        toast(problem, 'error');
        return;
      }
      if (searching) return;
      if (workerOnline === false) {
        toast('התוכנה במחשב לא פועלת, ולכן אי אפשר לחפש קבוצות עכשיו.', 'error');
        return;
      }
      setSearching(true);
      setError(null);
      try {
        const { id } = await startDiscovery(workerId, phrase);
        const done = await waitForWorkerCommand(id, SCAN_WAIT_MS);
        setActive(phrase);
        setPicked(new Set());
        /*
         * THE TABLE IS READ ONLY ONCE THE MACHINE HAS WRITTEN TO IT.
         *
         * Reading it on a timeout put the previous run's rows on screen under
         * a line saying the list would update — the same groups, the same
         * missing counts, the same missing pictures. That is what "עדיין יש
         * קבוצות שלא מראה את המספר חברים" looked like after the scan itself
         * had already been fixed.
         */
        if (!done) {
          toast('החיפוש עדיין רץ במחשב. פתחו את המסך שוב בעוד כמה דקות — התוצאות יהיו כאן.', 'info');
        } else {
          await load(phrase);
          if (done.status === 'failed') toast(done.result || 'החיפוש נכשל.', 'error');
          else if (done.result) toast(done.result, 'success');
        }
      } catch (err) {
        setError(friendlyMessage(err, 'החיפוש נכשל.'));
      } finally {
        setSearching(false);
      }
    },
    [load, searching, toast, workerId, workerOnline],
  );

  const shown = useMemo(() => {
    if (!rows) return [];
    const listed = rows.filter((r) => !r.hidden).map((r) => ({ ...r, privacy: r.privacy, membership: r.membership }));
    return sortGroups(listed.filter((r) => matchesFilter(r, filter)), sort);
  }, [rows, filter, sort]);

  const totals = useMemo(() => summarize((rows ?? []).filter((r) => !r.hidden)), [rows]);
  const fresh = useMemo(
    () => newSince((rows ?? []).filter((r) => !r.hidden), activeSearch?.previous_run_at ?? null),
    [rows, activeSearch],
  );

  /*
   * "הוסף את כל הקבוצות שאתה חבר בהן" — the ones this tap would really add.
   *
   * MEMBER ONLY, AND NOT 'unknown'. The per-row button offers itself for
   * unknown too, because there he is looking at one group and knows the answer
   * about it. A bulk button cannot borrow that: sweeping in every row the
   * search could not read would put groups he has never joined into the
   * publishing list, and each of them would then fail one publication at a
   * time. The button's own label is the promise, so the set has to match it.
   */
  const joinedNotListed = useMemo(
    () => (rows ?? []).filter((r) => !r.hidden && r.membership === 'member' && !r.target_id && !inSystem.has(r.external_id)),
    [rows, inSystem],
  );

  /* His own groups that the publishing list does not have. The set difference
     that this whole card exists to compute. */
  const joinedMissing = useMemo(
    () => (joined ?? []).filter((r) => !r.hidden && !r.target_id && !inSystem.has(r.external_id)),
    [joined, inSystem],
  );

  const hiddenCount = (rows ?? []).filter((r) => r.hidden).length;

  /* Watched searches nobody has run for half a day. See toggleWatch. */
  const STALE_AFTER = 12 * 60 * 60 * 1000;
  const stale = useMemo(
    () =>
      searches.filter(
        (x) => x.watching && (!x.last_run_at || Date.now() - Date.parse(x.last_run_at) > STALE_AFTER),
      ),
    [searches, STALE_AFTER],
  );

  const toggle = (id: string) =>
    setPicked((was) => {
      const next = new Set(was);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });

  /**
   * "מעקב אחרי קבוצות חדשות" — remember this phrase.
   *
   * WHAT WATCHING DOES AND WHAT IT DELIBERATELY DOES NOT. It marks the search,
   * and when the screen opens it offers to re-run the ones that have not been
   * run for a while. It does NOT re-run them by itself.
   *
   * That is not laziness. Every search drives the real Chrome on his machine
   * through Facebook's own search, six scrolls deep. Firing that off every
   * time a page opens turns one deliberate action into a hundred automatic
   * ones — which is exactly the shape of traffic the groups screen's own
   * "בדוק הכל" refuses to make, in almost these words, and exactly what gets a
   * Facebook account looked at. One tap, and it runs.
   */
  async function toggleWatch(search: DiscoverySearchRow) {
    try {
      await watchSearch(search.id, !search.watching);
      setSearches((was) => was.map((x) => (x.id === search.id ? { ...x, watching: !x.watching } : x)));
      toast(
        search.watching
          ? `הפסקנו לעקוב אחרי "${search.query}".`
          : `נעקוב אחרי "${search.query}" — בכניסה למסך נציע לבדוק אם נוספו קבוצות חדשות.`,
        'success',
      );
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    }
  }

  /**
   * All of them into the publishing list, one press.
   *
   * SEQUENTIAL AND NOT PARALLEL. Each of these is an insert that first asks
   * whether the group is already there, and firing thirty of those at once
   * against PostgREST is how two of them race, both see "not there", and one
   * dies on the unique index with an error he did not earn. It is also slower
   * than it looks only in theory — these are small writes.
   *
   * A group that is ALREADY in the list counts as a success, not a failure:
   * the sentence on the toast is about what is true afterwards, and afterwards
   * it is in the list.
   */
  async function adoptAll() {
    if (!joinedNotListed.length || busyId === 'all') return;
    setBusyId('all');
    let added = 0;
    let failed = 0;
    for (const row of joinedNotListed) {
      try {
        await adoptDiscovered(row);
        added += 1;
        setInSystem((was) => new Set(was).add(row.external_id));
      } catch (err) {
        if (/כבר קיימת/.test(friendlyMessage(err, ''))) {
          setInSystem((was) => new Set(was).add(row.external_id));
          added += 1;
        } else {
          failed += 1;
        }
      }
    }
    setBusyId(null);
    toast(
      failed
        ? `${added} קבוצות נוספו לרשימה, ו-${failed} לא הצליחו. נסו אותן אחת-אחת.`
        : `${added} ${added === 1 ? 'קבוצה נוספה' : 'קבוצות נוספו'} לרשימת הקבוצות שלך.`,
      failed ? 'error' : 'success',
    );
  }

  /**
   * Read Facebook's list of this account's groups and show what is missing.
   *
   * NOT A SEARCH, and that is the whole value of it: every group on that page
   * is one he is in, by construction, so "which of mine is not in the
   * publishing list" is a set difference rather than a guess about wording.
   * The membership parser has been wrong about this twice; this cannot be.
   */
  async function scanJoined() {
    if (scanning || workerOnline === false) {
      if (workerOnline === false) toast('התוכנה במחשב לא פועלת, ולכן אי אפשר לקרוא את הקבוצות שלך.', 'error');
      return;
    }
    setScanning(true);
    try {
      const { id } = await startJoinedScan(workerId);
      const done = await waitForWorkerCommand(id, SCAN_WAIT_MS);
      /*
       * THE SEARCH RESULTS ARE RE-READ TOO, because the scan now writes to
       * them. reconcileJoined lowers the membership of rows that are no longer
       * on Facebook's list, and one of those rows can be sitting in the list
       * below this card — still showing "הוסף לרשימה" on a group the machine
       * has just established he is not in.
       */
      const [mine, targets, found, pics] = await Promise.all([
        listJoined(),
        listTargetExternalIds(),
        active ? listDiscovered(active) : Promise.resolve(null),
        listTargetPictures(),
      ]);
      /* Same rule as the search above: nothing is read back until the machine
         has written, so a slow scan cannot repaint the screen with what was
         there before it started. */
      if (!done) {
        toast('הקריאה עדיין רצה במחשב. פתחו את המסך שוב בעוד כמה דקות.', 'info');
      } else {
        setJoined(mine);
        setInSystem(targets);
        setTargetPics(pics);
        if (found) setRows(found);
        if (done.status === 'failed') toast(done.result || 'הקריאה נכשלה.', 'error');
        else if (done.result) toast(done.result, 'success');
      }
    } catch (err) {
      toast(friendlyMessage(err, 'הקריאה נכשלה.'), 'error');
    } finally {
      setScanning(false);
    }
  }

  /** All of the missing ones into the publishing list, one press. */
  async function adoptJoined() {
    if (!joinedMissing.length || busyId === 'joined') return;
    setBusyId('joined');
    let added = 0;
    let failed = 0;
    for (const row of joinedMissing) {
      try {
        await adoptDiscovered(row);
        added += 1;
        setInSystem((was) => new Set(was).add(row.external_id));
      } catch (err) {
        if (/כבר קיימת/.test(friendlyMessage(err, ''))) {
          setInSystem((was) => new Set(was).add(row.external_id));
          added += 1;
        } else {
          failed += 1;
        }
      }
    }
    setBusyId(null);
    toast(
      failed
        ? `${added} קבוצות נוספו, ו-${failed} לא הצליחו. נסו אותן אחת-אחת.`
        : `${added} ${added === 1 ? 'קבוצה נוספה' : 'קבוצות נוספו'} לרשימת הקבוצות שלך.`,
      failed ? 'error' : 'success',
    );
  }

  /** Everything hidden for this phrase, back on screen. Nothing was deleted. */
  async function unhideAll() {
    const buried = (rows ?? []).filter((r) => r.hidden);
    if (!buried.length) return;
    try {
      await Promise.all(buried.map((r) => hideDiscovered(r.id, false)));
      setRows((was) => (was ?? []).map((r) => (r.hidden ? { ...r, hidden: false } : r)));
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    }
  }

  async function adopt(row: DiscoveredGroupRow) {
    setBusyId(row.id);
    try {
      await adoptDiscovered(row);
      setInSystem((was) => new Set(was).add(row.external_id));
      toast(`"${row.name}" נוספה לרשימת הקבוצות שלך.`, 'success');
    } catch (err) {
      toast(friendlyMessage(err, 'ההוספה נכשלה.'), 'error');
    } finally {
      setBusyId(null);
    }
  }

  /**
   * "זאת לא קבוצה שלי" — one name off the card, without waiting for a fix.
   *
   * The card once filled with ninety-three groups he had never joined, and
   * every lock that stops that is a rule I wrote: four of them now, each
   * checked by a test, and the one before them was also checked by a test. So
   * the card gets the thing none of them can give it — a way for the person
   * looking at a wrong name to remove it himself, the same minute he sees it,
   * from the same list the bulk button promises.
   *
   * Hidden rather than deleted, like every other dismissal here: the row stays,
   * so a later scan does not bring it back and nothing he taught the app is
   * thrown away. Its own state, because the card reads `joined` and the search
   * results read `rows` — the same database row can be in both.
   */
  async function hideJoined(row: DiscoveredGroupRow) {
    setBusyId(row.id);
    try {
      await hideDiscovered(row.id, true);
      setJoined((was) => (was ?? []).map((r) => (r.id === row.id ? { ...r, hidden: true } : r)));
      setRows((was) => (was ?? []).map((r) => (r.id === row.id ? { ...r, hidden: true } : r)));
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    } finally {
      setBusyId(null);
    }
  }

  async function hide(row: DiscoveredGroupRow) {
    setBusyId(row.id);
    try {
      await hideDiscovered(row.id, true);
      setRows((was) => (was ?? []).map((r) => (r.id === row.id ? { ...r, hidden: true } : r)));
      setPicked((was) => {
        const next = new Set(was);
        next.delete(row.id);
        return next;
      });
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    } finally {
      setBusyId(null);
    }
  }

  const pickedRows = shown.filter((r) => picked.has(r.id));

  /*
   * ───────── הצטרפות אוטומטית לקבוצות שסומנו ──────────────────────────────
   *
   * "תוסיף לי אופציה שאני יכול לסמן את הקבוצות האלה שאני לא נמצא בהם, ושהתוכנה
   *  תפתח קבוצה קבוצה ותצרתף אוטומטי."
   *
   * ONLY THE ONES HE IS NOT IN. A selection made on this screen can hold groups
   * he already belongs to — he ticks a row to walk through it — and sending
   * those would spend the run's cap on pages where there is no button to press.
   *
   * AND HE IS TOLD THE PRICE BEFORE IT STARTS. Joining is the fastest way there
   * is to collect a temporary block on a Facebook account, and a block costs
   * him the publishing too. So the confirmation says the pace and the cap in
   * words rather than starting quietly and explaining afterwards.
   */
  /*
   * EVERYTHING HE TICKED IS SENT — "אני רוצה לכל מה שאני מסמן".
   *
   * This used to strip the rows whose membership says 'member' before sending,
   * so three ticks arrived at the machine as one and the button read "הצטרף
   * ל-1" with nothing on screen saying why. Two things were wrong with that.
   * It hid the arithmetic from him, and it trusted the membership flag — which
   * this file's own notes record as having been wrong about his groups twice.
   *
   * So the whole selection goes, with the ones we believe he is NOT in first:
   * the run's cap counts groups it actually pressed (see joinGroups), a group
   * he is already in costs nothing and no gap, and the order is what makes
   * sure the cap is spent on the ones that need it.
   */
  const joinOrder = [...pickedRows].sort(
    (a, b) => Number(a.membership === 'member') - Number(b.membership === 'member'),
  );
  const alreadyMine = pickedRows.filter((r) => r.membership === 'member').length;

  async function joinPicked() {
    if (!joinOrder.length || busyId === 'join') return;
    if (workerOnline === false) {
      toast('התוכנה במחשב לא פועלת, ולכן אי אפשר להצטרף לקבוצות.', 'error');
      return;
    }
    const fresh = joinOrder.length - alreadyMine;
    const take = Math.min(Math.max(fresh, 1), JOIN_RUN_CAP);
    const ok = await confirm.ask({
      title: `להצטרף ל-${take} קבוצות?`,
      body:
        `התוכנה תפתח קבוצה אחרי קבוצה ותלחץ "הצטרפות" — לאט, עם הפסקה של דקה עד שתיים בין אחת לשנייה, ` +
        `כדי שפייסבוק לא יחסום את החשבון. זה ייקח בערך ${Math.max(1, Math.round(take * 1.5))} דקות והכל ירוץ ברקע.\n\n` +
        /* The arithmetic in words, because the button's number is otherwise a
           mystery: he ticked three and it offered one. */
        (alreadyMine ? `סימנת ${joinOrder.length}; ב-${alreadyMine} אתה כבר חבר, אז אין שם מה ללחוץ.\n\n` : '') +
        `קבוצה שמבקשת לענות על שאלות הצטרפות — נדלג עליה ותענה בעצמך. אם פייסבוק יגביל, נעצור מיד.` +
        (fresh > JOIN_RUN_CAP ? `\n\n${JOIN_RUN_CAP} זו המכסה לריצה אחת — הרץ שוב להמשך.` : ''),
      confirmLabel: 'התחל',
    });
    if (!ok) return;
    setBusyId('join');
    try {
      const { id } = await startJoinGroups(workerId, joinOrder.map((r) => r.url));
      const done = await waitForWorkerCommand(id, JOIN_WAIT_MS);
      const [found, mine] = await Promise.all([active ? listDiscovered(active) : Promise.resolve(null), listJoined()]);
      if (found) setRows(found);
      setJoined(mine);
      setPicked(new Set());
      if (done?.status === 'failed') toast(done.result || 'ההצטרפות נכשלה.', 'error');
      else if (!done) toast('ההצטרפות רצה ברקע — היא לוקחת כמה דקות, והרשימה תתעדכן בהמשך.', 'info');
      else if (done.result) toast(done.result, 'success');
    } catch (err) {
      toast(friendlyMessage(err, 'ההצטרפות נכשלה.'), 'error');
    } finally {
      setBusyId(null);
    }
  }


  return (
    <SocialShell
      title="גילוי קבוצות"
      lede="מצא קבוצות חדשות שמתאימות לעסק שלך"
      /* The reference puts an illustration beside the page title. `headerAction`
         is the shell's own slot for what sits there, so the shared page header
         every other screen uses is untouched. Decoration: aria-hidden, no
         handler, nothing to press. */
      headerAction={
        /* 56px → 44px, and the glow halved. It read as a button at the old
           size — a round filled badge beside a title is exactly what a control
           looks like — so the halo is fainter, the magnifier badge is flat
           rather than filled with the primary gradient, and the whole thing
           sits on the title's own line. Decoration: aria-hidden, no handler. */
        <span aria-hidden className="relative grid h-11 w-11 shrink-0 place-items-center self-center">
          <span className="absolute inset-0 rounded-full bg-brand-300/[0.08]" />
          <UsersIcon className="relative h-6 w-6 text-brand-300" />
          <span className="absolute bottom-0 end-0 grid h-5 w-5 place-items-center rounded-full border-2 border-ink-950 bg-brand-400 text-on-brand">
            <SearchIcon className="h-2.5 w-2.5" />
          </span>
        </span>
      }
    >
      {/* 16px → 12px between the blocks of this screen. Four gaps above the
          results, so it is 16px of the height this pass is winning back, and
          the one saving that costs nothing inside any card. */}
      <div className="space-y-3">
        {error && <ErrorState message={error} onRetry={() => (active ? run(active) : undefined)} />}

        {workerOnline === false && (
          <Notice tone="warn">
            החיפוש נעשה מהדפדפן שעל המחשב שלכם, והתוכנה שם לא פועלת כרגע. פתחו אותה והשאירו אותה פתוחה — ואז אפשר לחפש.
          </Notice>
        )}

        {/* ───────────────── a watched search that has gone stale ──────────────

            "מעקב אחרי קבוצות חדשות". One tap, not an automatic run — see
            toggleWatch above for why a page open must not drive his Chrome
            through Facebook's search. Twelve hours because new groups appear
            over weeks, not minutes, and a prompt that is always there is a
            prompt nobody reads. */}
        {stale.length > 0 && !searching && (
          <Card padded={false} className="px-3 py-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-mist-100">במעקב: {stale.map((x) => x.query).join(' · ')}</p>
                <p className="mt-0.5 text-xs text-mist-500">
                  {stale[0].last_run_at ? `נבדק לאחרונה ${relativeHe(stale[0].last_run_at)}` : 'עוד לא נבדק'} — אפשר לבדוק אם נוספו קבוצות חדשות.
                </p>
              </div>
              <Button size="sm" variant="secondary" onClick={() => run(stale[0].query)}>
                בדוק מה חדש
              </Button>
            </div>
          </Card>
        )}

        {/* Its own component so worker/test/render-discovery.tsx can put the
            REAL card in a browser and measure it — see MyGroupsCard. */}
        <MyGroupsCard
          joined={joined}
          missing={joinedMissing}
          scanning={scanning}
          busy={busyId === 'joined'}
          onScan={scanJoined}
          onAdopt={adoptJoined}
          onHide={hideJoined}
          busyId={busyId}
          pictures={targetPics}
        />

        {/* ─────────────────────────── the search box ─────────────────────── */}
        {/* Its markup moved to Discovery.tsx so a browser can measure it — see
            the component's own comment for why an estimate was not enough.
            Every value and handler below is the one that was here. */}
        <SearchCard
          text={text}
          searching={searching}
          searches={searches}
          activeQuery={active}
          onText={setText}
          onRun={run}
        />

        {/* ─────────────────────────── while it runs ──────────────────────── */}
        {searching && (
          <Card padded={false} className="px-3 py-4">
            <div className="flex items-center gap-3">
              {/* The magnifier sweeps rather than spins: a spinner here would
                  be the fourth on this screen and says only "wait". */}
              <span className="relative grid h-11 w-11 shrink-0 place-items-center rounded-xl bg-brand-400/12">
                <SearchIcon aria-hidden className="h-5 w-5 text-brand-400 motion-safe:animate-pulse" />
              </span>
              <div className="min-w-0">
                <p className="text-sm font-extrabold text-mist-100">מחפש קבוצות מתאימות…</p>
                <p className="mt-0.5 text-xs leading-4 text-mist-500">
                  הדפדפן שבמחשב פותח את החיפוש של פייסבוק וגולל בתוצאות. זה לוקח כדקה, ואפשר להמשיך לעבוד כאן בינתיים.
                </p>
              </div>
            </div>
          </Card>
        )}

        {/* ────────────────────────── what was found ──────────────────────── */}
        {rows === null && <SkeletonList rows={4} />}

        {rows !== null && active && totals.total > 0 && (
          <ResultsCard
            query={active}
            fresh={fresh}
            totals={totals}
            watching={activeSearch?.watching}
            onToggleWatch={activeSearch ? () => toggleWatch(activeSearch) : undefined}
            joinedNotListed={joinedNotListed.length}
            adoptBusy={busyId === 'all'}
            onAdoptAll={adoptAll}
          />
        )}

        {/* ──────────────────────── filters and sorting ─────────────────────

            NOT sticky. The shell's header already is, and pinning a second
            strip under it needs the header's exact height as a magic number —
            which would be wrong on the one device nobody tested. The chips
            scroll with the list, like every other filter row in this product. */}
        {rows !== null && totals.total > 0 && (
          <FilterRow
            filters={FILTERS}
            filterLabel={FILTER_LABEL}
            filter={filter}
            onFilter={setFilter}
            sorts={SORTS}
            sortLabel={SORT_LABEL}
            sort={sort}
            onSort={setSort}
          />
        )}

        {/* ───────────────────────────── the list ─────────────────────────── */}
        {rows !== null && shown.length > 0 && (
          <div className="space-y-2">
            {shown.map((row) => (
              <GroupRow
                key={row.id}
                row={row}
                picked={picked.has(row.id)}
                already={inSystem.has(row.external_id) || !!row.target_id}
                busy={busyId === row.id}
                fallbackImage={targetPics.get(row.external_id) ?? null}
                onToggle={() => toggle(row.id)}
                onAdopt={() => adopt(row)}
                onHide={() => hide(row)}
              />
            ))}
          </div>
        )}

        {rows !== null && !active && (
          <EmptyState
            icon={<SearchIcon aria-hidden className="h-6 w-6" />}
            title="הקלידו עיר, אזור או נושא"
            description="למשל “באר שבע”. המערכת תפתח את החיפוש של פייסבוק במחשב שלכם ותראה לכם אילו קבוצות קיימות, באילו אתם כבר חברים ולאילו כדאי להצטרף."
          />
        )}

        {rows !== null && active && totals.total === 0 && !searching && (
          <EmptyState
            icon={<SearchIcon aria-hidden className="h-6 w-6" />}
            title="לא נמצאו קבוצות"
            description="נסו מילה אחרת — שם העיר לבדו לרוב מוצא הכי הרבה, ואפשר גם לנסות שם של שכונה או של אזור."
          />
        )}

        {rows !== null && totals.total > 0 && shown.length === 0 && (
          <EmptyState
            icon={<UsersIcon aria-hidden className="h-6 w-6" />}
            title="אין קבוצות בסינון הזה"
            description={`נמצאו ${totals.total} קבוצות, אבל אף אחת מהן לא ${FILTER_LABEL[filter]}. בחרו "הכל" כדי לראות את כולן.`}
          />
        )}

        {/* NOTHING HERE IS DELETED, so there is always a way back. "לא רלוונטי"
            sets a flag, and this is the row that undoes it — without it a
            mis-tap on a phone loses a group silently and the next search
            cannot bring it back, because the row already exists. */}
        {hiddenCount > 0 && (
          <button
            type="button"
            onClick={unhideAll}
            className="flex min-h-11 w-full items-center justify-center gap-1.5 text-xs font-bold text-mist-500 hover:text-mist-300"
          >
            <EyeIcon aria-hidden className="h-4 w-4" />
            {hiddenCount === 1 ? 'קבוצה אחת הוסתרה — הצג אותה' : `${hiddenCount} קבוצות הוסתרו — הצג אותן`}
          </button>
        )}

        {/* The sticky bar floats over the list; without this the last row sits
            under it and cannot be reached. */}
        {picked.size > 0 && <div aria-hidden className="h-20" />}
      </div>

      {/* ───────────────────── sticky bar for a selection ──────────────────

          The same position the groups and library selection bars use, down to
          the expression: above the tab bar, clear of the home indicator, and
          `data-overlay` so the page's entrance transform does not drag it. */}
      {picked.size > 0 && (
        <div data-overlay className="fixed inset-x-0 bottom-[calc(4.5rem+var(--safe-b))] z-40 px-3 md:bottom-4">
          {/* Same two controls, same handlers, same count. The brief's skin:
              a purple gradient bar with softer top corners, lifted off the
              list rather than sitting in it. */}
          <div className="mx-auto flex max-w-3xl items-center justify-between gap-2 rounded-sheet bg-gradient-to-l from-brand-600 to-brand-500 px-2.5 py-2.5 shadow-[0_8px_28px_-6px_rgba(46,16,101,0.45)]">
            <div className="flex min-w-0 items-center gap-1.5">
              <button
                type="button"
                aria-label="בטל את הבחירה"
                onClick={() => setPicked(new Set())}
                className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-on-brand/80 transition-colors hover:bg-white/15 hover:text-on-brand"
              >
                <CloseIcon aria-hidden className="h-4 w-4" />
              </button>
              {/* The count, and — when the two differ — why the button offers
                  fewer. "נבחרו 3" over a button saying 1 is the screen keeping
                  its own arithmetic to itself. */}
              <p className="truncate text-sm font-extrabold text-on-brand">
                נבחרו {picked.size}
                {alreadyMine > 0 && <span className="font-bold text-on-brand/75"> · ב-{alreadyMine} כבר חבר</span>}
              </p>
            </div>
            <div className="flex shrink-0 items-center gap-1.5">
              {/*
                הצטרפות אוטומטית — offered only when the selection actually
                holds groups he is not in. A button that would open fifteen
                pages and find no button to press on any of them is worse than
                no button: it spends the run's cap and reports nothing.
              */}
              {joinOrder.length > alreadyMine && (
                <Button
                  busy={busyId === 'join'}
                  variant="secondary"
                  className="border-transparent bg-ink-900 text-brand-400 hover:bg-ink-800"
                  onClick={joinPicked}
                >
                  הצטרף ל-{Math.min(joinOrder.length - alreadyMine, JOIN_RUN_CAP)}
                </Button>
              )}
              <Button
                variant="secondary"
                className="border-transparent bg-ink-900 text-brand-400 hover:bg-ink-800"
                onClick={() => {
                  setWalk(pickedRows);
                  setWalkAt(0);
                }}
              >
                עבור על הקבוצות
              </Button>
            </div>
          </div>
        </div>
      )}

      {confirm.dialog}

      {/* ───────────────────────── one group at a time ───────────────────── */}
      {walk && walk.length > 0 && (
        <WalkThrough
          rows={walk}
          at={walkAt}
          already={inSystem}
          pictures={targetPics}
          onNext={() => {
            if (walkAt + 1 >= walk.length) {
              setWalk(null);
              setPicked(new Set());
              toast('עברתם על כל הקבוצות שבחרתם.', 'success');
            } else {
              setWalkAt(walkAt + 1);
            }
          }}
          onClose={() => setWalk(null)}
        />
      )}
    </SocialShell>
  );
}
