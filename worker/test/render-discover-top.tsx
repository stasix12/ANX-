/*
 * THE TOP OF גילוי קבוצות, RENDERED SO IT CAN BE MEASURED.
 *
 * "החלק העליון עדיין לא הצטמצם" — said after a version whose commit message
 * admitted the saving there was "computed from the spacing changes and not
 * measured in a browser". This file is what makes the next claim checkable:
 * the real components, the real compiled stylesheet, one height.
 *
 * The numbers are the ones on his own screen: 155 groups already listed, five
 * saved searches, 146 results for "באר שבע" with 80 new, 46 already joined and
 * 20 whose membership the cards did not state.
 */
import { renderToStaticMarkup } from 'react-dom/server';
import { FilterRow, MyGroupsCard, ResultsCard, SearchCard } from '@/components/social/Discovery';
import { FILTER_LABEL, SORT_LABEL, type DiscoveryFilter, type DiscoverySort } from '@/lib/social/discovery';

/* The page's own two lists, which are locals there. */
const FILTERS: DiscoveryFilter[] = ['all', 'none', 'member', 'requested', 'public', 'private'];
const SORTS: DiscoverySort[] = ['relevance', 'members', 'name'];

const searches = [
  { id: '1', query: 'באר שבע', normalized: 'באר שבע', watching: false },
  { id: '2', query: 'להבים', normalized: 'להבים', watching: false },
  { id: '3', query: 'מיתר', normalized: 'מיתר', watching: false },
  { id: '4', query: 'Арад', normalized: 'арад', watching: false },
  { id: '5', query: 'Beer шева', normalized: 'beer шева', watching: false },
];
const totals = { total: 146, fresh: 80, requested: 0, member: 46, unknown: 20 };
const text = 'באר שבע';
const active = 'באר שבע';
const searching = false;
const fresh: number = 0;
const joinedNotListed: unknown[] = [{}, {}];
const activeSearch = { id: '1', query: 'באר שבע', normalized: 'באר שבע', watching: false };
const adoptAll = () => {};
const toggleWatch = (_s: unknown) => {};

/* His own screen: 155 groups found, none of them missing from the publishing
   list — which is the state this card spends almost all of its life in. */
const joined = Array.from({ length: 155 }, (_, i) => ({
  id: String(i),
  external_id: String(i),
  name: `קבוצה ${i}`,
  url: '',
  image_url: null,
  members: null,
  privacy: 'public',
  membership: 'member',
  hidden: false,
  queries: [],
  first_seen_at: '',
  last_seen_at: '',
})) as never;

const mine = (
  <MyGroupsCard
    joined={joined}
    missing={[]}
    scanning={false}
    busy={false}
    onScan={() => {}}
    onAdopt={() => {}}
    onHide={() => {}}
    busyId={null}
  />
);

const after = (
  <div className="space-y-3">
    {mine}
    <SearchCard text={text} searching={searching} searches={searches} activeQuery={active} onText={() => {}} onRun={() => {}} />
    <ResultsCard
      query={active}
      fresh={fresh}
      totals={totals}
      watching={activeSearch.watching}
      onToggleWatch={() => toggleWatch(activeSearch)}
      joinedNotListed={joinedNotListed.length}
      adoptBusy={false}
      onAdoptAll={adoptAll}
    />
    {/* The filters and the sort are part of the top too — they are the last
        thing between the search and the first result. */}
    <FilterRow
      filters={FILTERS}
      filterLabel={FILTER_LABEL}
      filter="all"
      onFilter={() => {}}
      sorts={SORTS}
      sortLabel={SORT_LABEL}
      sort="relevance"
      onSort={() => {}}
    />
  </div>
);

console.log(`<!doctype html><html lang="he" dir="rtl"><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<link rel="stylesheet" href="app.css">
<body class="bg-ink-950"><div class="social-theme" style="padding:16px">
<div class="top-after">${renderToStaticMarkup(after)}</div>
</div></body></html>`);
