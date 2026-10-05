'use client';

import { Fragment, useEffect, useMemo, useState } from 'react';
import { StarIcon } from '@/components/icons';
import { detectCity, sortCities } from '@/lib/social/cities';
import { agree, counted } from '@/lib/social/time';
import { type LimitsSettings, type SocialTarget, type Variant } from '@/lib/social/types';
import { TargetAvatar } from './TargetAvatar';
import { Badge, Button, MethodBadge, SegmentedControl, inputClass } from './ui';

/**
 * Choosing who receives the post. With a hundred-plus groups the useful unit
 * is not the individual tile but the set — "all of Be'er Sheva", "everything
 * starred", "everything active" — so those are one tap each and the list
 * below is for the exceptions.
 *
 * Test mode caps the number of groups; the cap is enforced here and stated
 * rather than silently swallowing taps.
 */
/*
 * How many target rows are drawn at once. Selection, the quick sets and the
 * counts all work over the whole filtered list; only the drawing is capped,
 * so a few hundred groups do not turn the post editor sluggish.
 */
const CHUNK = 60;

export function TargetPicker({
  targets,
  selected,
  onChange,
  variants = [],
  variantMap = {},
  onVariantMap,
  maxSelectable,
  note,
}: {
  targets: SocialTarget[];
  selected: string[];
  onChange: (ids: string[]) => void;
  variants?: Variant[];
  variantMap?: Record<string, string>;
  onVariantMap?: (map: Record<string, string>) => void;
  /** Test mode: at most this many group targets. */
  maxSelectable?: number;
  note?: string;
}) {
  const [query, setQuery] = useState('');
  const [channel, setChannel] = useState<'all' | 'facebook_page' | 'facebook_group'>('all');
  const [city, setCity] = useState('');
  const [category, setCategory] = useState('');
  const [shown, setShown] = useState(CHUNK);

  const cityOf = (t: SocialTarget) => t.city || detectCity(t.name);
  const cities = useMemo(() => sortCities(targets.filter((t) => t.channel === 'facebook_group').map(cityOf)), [targets]);
  const categories = useMemo(
    () => Array.from(new Set(targets.map((t) => t.category).filter(Boolean) as string[])).sort((a, b) => a.localeCompare(b, 'he')),
    [targets],
  );


  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return targets.filter(
      (t) =>
        (channel === 'all' || t.channel === channel) &&
        (!city || cityOf(t) === city) &&
        (!category || (t.category || '') === category) &&
        (!q || t.name.toLowerCase().includes(q) || t.url.toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, query, channel, city, category]);

  /* Drawn slice. `visible` stays the real filtered set everything else uses. */
  const page = useMemo(() => visible.slice(0, shown), [visible, shown]);

  /* A new filter means a new list, so start from the top again. */
  useEffect(() => {
    setShown(CHUNK);
  }, [query, channel, city, category]);

  const approved = variants.filter((v) => v.approval === 'approved');
  // 125 identical "בסיוע דפדפן" chips say nothing; the badge earns its place
  // only when the visible list holds both pages and groups.
  const mixedChannels = new Set(visible.map((t) => t.channel)).size > 1;
  const groupCount = (ids: string[]) => ids.filter((id) => targets.find((t) => t.id === id)?.channel === 'facebook_group').length;
  const atCap = maxSelectable !== undefined && groupCount(selected) >= maxSelectable;

  function toggle(id: string, on: boolean) {
    if (!on) return onChange(selected.filter((x) => x !== id));
    const next = [...selected, id];
    if (maxSelectable !== undefined && groupCount(next) > maxSelectable) return;
    onChange(next);
  }

  /** Trims a candidate list to the test-mode cap rather than refusing it whole. */
  function capped(ids: string[]): string[] {
    if (maxSelectable === undefined || groupCount(ids) <= maxSelectable) return ids;
    const groups = ids.filter((id) => targets.find((t) => t.id === id)?.channel === 'facebook_group').slice(0, maxSelectable);
    return ids.filter((id) => targets.find((t) => t.id === id)?.channel !== 'facebook_group').concat(groups);
  }

  const enabledIds = (items: SocialTarget[]) => items.filter((t) => t.enabled).map((t) => t.id);
  /** "Only Be'er Sheva" means only Be'er Sheva — it replaces, it does not merge. */
  const only = (items: SocialTarget[]) => onChange(capped(enabledIds(items)));
  const also = (items: SocialTarget[]) => onChange(capped(Array.from(new Set([...selected, ...enabledIds(items)]))));
  /*
   * TAKE A WHOLE SET OUT, leaving the rest of the selection alone.
   *
   * "תוסיף כאן גם את האופציה להסיר את הקטגוריה כמו הדוברי רוסית."
   *
   * Until now the only subtraction on this screen was "נקה הכל", which throws
   * away everything: picking 250 groups and then deciding the Russian-speaking
   * ones should not get this post meant starting the whole selection again, or
   * un-ticking them one at a time down a list of 138.
   *
   * NOT `enabledIds`. The add and replace sides deliberately skip a switched-
   * off target — there is no sense adding somewhere that cannot publish — but
   * removing one that is somehow already selected is exactly what the owner is
   * asking for, and refusing to would leave a target he can see ticked and
   * cannot untick from here. Subtraction takes the set as it is.
   *
   * NO CAP APPLIED: `capped()` trims a list down to the test-mode ceiling, and
   * a list that just got shorter cannot have crossed it.
   */
  const less = (items: SocialTarget[]) => {
    const drop = new Set(items.map((t) => t.id));
    onChange(selected.filter((id) => !drop.has(id)));
  };
  /** How many of this set are actually selected — what "−" would take away. */
  const chosenIn = (items: SocialTarget[]) => items.filter((t) => selected.includes(t.id)).length;

  /*
   * EVERYTHING EXCEPT THIS SET — the one shape of the question this screen
   * could not be asked.
   *
   * "אני רוצה לפרסם את זה בכל הקבוצות אבל לא נותן לי למחוק קטגוריות רק (רק
   *  להוסיף)."
   *
   * He is right, and "−" was not the answer. Every action here started from
   * the selection: "רק" replaces it, "+" adds to it, "−" takes out of it. From
   * an empty selection — which is where this screen opens, and what his
   * screenshot shows, "נבחרו 0" — subtraction has nothing to subtract from, so
   * "−" is correctly not drawn and the only button left on the row is an
   * additive one. "Publish to all of them except the Russian-speaking ones"
   * was reachable only by knowing to select all 269 first, then changing the
   * filter, then finding a one-character button that had appeared meanwhile.
   * Three steps, none of them visible from the state he was in. A feature
   * nobody can find is not a feature, and he reported it as missing because
   * from where he was standing it was.
   *
   * So the complement is its own action, and it starts from nothing: the set
   * on screen is named, and beside it the whole list minus that set.
   *
   * ENABLED ONLY, like "רק" and "+" and unlike "−". This one SELECTS targets,
   * and selecting somewhere that cannot publish is the thing that rule exists
   * to prevent. Subtraction is the exception there, not the model.
   */
  const complementOf = (items: SocialTarget[]) => {
    const inSet = new Set(items.map((t) => t.id));
    return enabledIds(targets.filter((t) => !inSet.has(t.id)));
  };
  const except = (items: SocialTarget[]) => {
    onChange(capped(complementOf(items)));
    /*
     * AND THE FILTER STEPS ASIDE, because it has just finished its job.
     *
     * Without this the one tap he wanted ends on a screen that looks broken:
     * every target it selected is, by definition, outside the filter that
     * named the set — so all 151 of them are hidden, and the "יעדים נבחרים לא
     * מוצגים" bar appears over a perfectly correct result, offering "הסר
     * אותם" as the fix. A warning that fires on success, beside a button that
     * undoes it, is worse than no warning at all.
     *
     * Every filter, not just the category: the complement is taken over the
     * whole list, so a city or a channel still set would hide part of it too.
     * This is exactly what that bar's own "הצג אותם" button does, done before
     * there is anything to warn about.
     */
    setQuery('');
    setCity('');
    setCategory('');
    setChannel('all');
  };

  /*
   * Selected targets the current filter hides. Without this the picker could
   * strand a selection out of sight: pick "all of Be'er Sheva" while a post
   * still carried Arad from an earlier campaign and the Arad groups stayed
   * selected, off-screen, with no checkbox to clear them.
   */
  const hiddenSelected = selected.filter((id) => !visible.some((t) => t.id === id));

  /*
   * `label` is the accessible name of the "+" button beside each set, so it
   * has to be words: with the star inside it VoiceOver announced the
   * favourites set as "white medium star מועדפות". The mark is an icon now,
   * and it is drawn, not spoken.
   */
  /*
   * WHAT THE FIRST SET IS ACTUALLY MADE OF.
   *
   * It is `visible`, which is narrowed by the city, the category, the channel
   * AND the search box — but the chip was labelled with the city alone. With
   * "דוברי רוסית" chosen it read "רק באר שבע (18)" over a set that was not
   * Be'er Sheva but the Russian-speaking part of it, and pressing it replaced
   * the whole selection with that. A button that names one thing and does
   * another is worse than a missing button.
   *
   * A search box narrows by words nobody can fit on a chip, so when one is in
   * use the label steps back to the honest "המוצגים" — what is on screen —
   * and the count beside it says how many that is.
   */
  const shownLabel = query.trim() ? 'המוצגים' : [city, category].filter(Boolean).join(' · ') || 'כל המוצגים';

  /*
   * `except` MARKS THE ONE SET WHOSE COMPLEMENT IS A DECISION, and it is a
   * flag on the set rather than "the first one" at the call site: when the
   * filter matches nothing this list drops its first entry, and an index test
   * would then start offering "הכל חוץ ממועדפות" under the filter's name.
   *
   * Only the filtered set gets it. Its membership is what he just chose on
   * screen, so "everything except that" is the other half of a choice he is
   * already making. The other two are fixed collections: "הכל חוץ מדפים" is
   * the "קבוצות" button three rows up, and "הכל חוץ ממועדפות" is a sentence
   * nobody has ever needed. Both were drawn for one commit and both were
   * clutter on a row he reads every time he sends a post.
   */
  const quickSets: { label: string; icon?: React.ReactNode; items: SocialTarget[]; except?: boolean }[] = [
    { label: shownLabel, items: visible, except: true },
    {
      label: 'מועדפות',
      icon: <StarIcon className="h-3.5 w-3.5" fill="currentColor" />,
      items: targets.filter((t) => t.favorite),
    },
    { label: 'דפים', items: targets.filter((t) => t.channel === 'facebook_page') },
  ].filter((s) => s.items.length > 0);

  return (
    <div className="min-w-0 space-y-3">
      <input type="search" className={inputClass} placeholder="חיפוש יעד…" value={query} onChange={(e) => setQuery(e.target.value)} aria-label="חיפוש יעד" />

      <div className="min-w-0 space-y-2 overflow-x-auto scrollbar-none">
        <SegmentedControl
          size="sm"
          label="סוג יעד"
          value={channel}
          onChange={setChannel}
          className="min-w-max"
          options={[
            { value: 'all', label: 'הכל', count: targets.length },
            { value: 'facebook_page', label: 'דפים', count: targets.filter((t) => t.channel === 'facebook_page').length },
            { value: 'facebook_group', label: 'קבוצות', count: targets.filter((t) => t.channel === 'facebook_group').length },
          ]}
        />
        {cities.length > 1 && (
          <SegmentedControl
            size="sm"
            label="עיר"
            value={city}
            onChange={setCity}
            className="min-w-max"
            options={[
              { value: '', label: 'כל הערים' },
              ...cities.map((c) => ({ value: c, label: c, count: targets.filter((t) => t.channel === 'facebook_group' && cityOf(t) === c).length })),
            ]}
          />
        )}
        {categories.length > 0 && (
          <SegmentedControl
            size="sm"
            label="קטגוריה"
            value={category}
            onChange={setCategory}
            className="min-w-max"
            options={[{ value: '', label: 'כל הקטגוריות' }, ...categories.map((c) => ({ value: c, label: c }))]}
          />
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {quickSets.map((q) => (
          <Fragment key={q.label}>
            <span className="inline-flex overflow-hidden rounded-xl">
              <Button size="sm" variant="secondary" className="!rounded-none" onClick={() => only(q.items)}>
                {q.icon}רק {q.label} ({q.items.length})
              </Button>
              {selected.length > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`הוסף את ${q.label} לבחירה הקיימת`}
                  title={`הוסף את ${q.label} לבחירה הקיימת`}
                  className="!rounded-none border-s border-ink-600 !px-2.5"
                  onClick={() => also(q.items)}
                >
                  +
                </Button>
              )}
              {/*
                "−", AND ONLY WHEN IT WOULD TAKE SOMETHING AWAY.
                `chosenIn` is how many of this set are currently ticked; at zero
                the button could only do nothing, and a control that does nothing
                is the one the owner presses twice and then reports as broken.
                The count is in its name rather than on its face, because the
                face has to stay the width of a "+" beside it.
              */}
              {chosenIn(q.items) > 0 && (
                <Button
                  size="sm"
                  variant="secondary"
                  aria-label={`הסר את ${q.label} מהבחירה (${chosenIn(q.items)})`}
                  title={`הסר את ${q.label} מהבחירה (${chosenIn(q.items)})`}
                  className="!rounded-none border-s border-ink-600 !px-2.5"
                  onClick={() => less(q.items)}
                >
                  −
                </Button>
              )}
            </span>
            {/*
              "הכל חוץ מ…", ITS OWN CHIP AND NOT A FOURTH SEGMENT.
              The three above are one control because they are three verbs on
              the same selection — replace it, add to it, take out of it. This
              one is a different sentence about a different set, and run
              together with them it would read as another modifier of "רק".

              DRAWN ONLY WHEN THERE IS SOMETHING LEFT OVER. With no filter on,
              the first set IS every target and its complement is empty, so the
              button would select nothing at all and the row stays as he knows
              it. The count is on its face rather than in a tooltip because it
              is the whole decision: "219" is why he would press it.
            */}
            {q.except && complementOf(q.items).length > 0 && (
              <Button size="sm" variant="secondary" onClick={() => except(q.items)}>
                הכל חוץ מ{q.label} ({complementOf(q.items).length})
              </Button>
            )}
          </Fragment>
        ))}
        {selected.length > 0 && (
          <Button size="sm" variant="ghost" onClick={() => onChange([])}>
            נקה הכל
          </Button>
        )}
        <span className="ms-auto">
          <Badge tone={selected.length ? 'brand' : 'neutral'}>
            {agree(selected.length, 'נבחר', 'נבחרו')} {selected.length}
          </Badge>
        </span>
      </div>

            {hiddenSelected.length > 0 && (
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-warning-400/30 bg-warning-400/12 px-3 py-2">
          <span className="text-xs font-bold text-warning-400">
            {counted(hiddenSelected.length, 'יעד אחד שנבחר אינו מוצג', 'יעדים נבחרים לא מוצגים', 'שני יעדים נבחרים לא מוצגים')} בסינון
            הנוכחי
          </span>
          <Button
            size="sm"
            variant="secondary"
            className="ms-auto"
            onClick={() => {
              setCity('');
              setCategory('');
              setChannel('all');
              setQuery('');
            }}
          >
            הצג אותם
          </Button>
          <Button size="sm" variant="danger" onClick={() => onChange(selected.filter((id) => visible.some((t) => t.id === id)))}>
            הסר אותם
          </Button>
        </div>
      )}

      {note && <p className="text-xs font-bold text-warning-400">{note}</p>}
      {atCap && !note && <p className="text-xs text-warning-400">הגעתם למגבלת הקבוצות של מצב הבדיקה.</p>}
      {visible.length === 0 && <p className="text-sm text-mist-500">אין יעדים תואמים לסינון.</p>}

      <ul className="grid max-h-96 gap-2 overflow-y-auto sm:grid-cols-2 lg:grid-cols-3 [&>*]:min-w-0">
        {page.map((t) => {
          const on = selected.includes(t.id);
          const blocked = !on && atCap && t.channel === 'facebook_group';
          return (
            <li
              key={t.id}
              className={`flex min-w-0 items-center gap-2.5 rounded-xl border px-2.5 py-2 transition-colors ${
                on ? 'border-brand-300 bg-brand-300/8' : 'border-ink-600'
              } ${!t.enabled || blocked ? 'opacity-50' : ''}`}
            >
              {/* The label covers the identity only — the variant select sits
                  outside it, or clicking the dropdown would toggle the row. */}
              {/* min-h-11: this row is tapped once per group when choosing
                  targets, and it measured 287x42.5 around a 20x20 checkbox —
                  1.5px under the floor, while GroupCard and the library card
                  wrap the identical checkbox in a full 44x44 label. */}
              <label className="flex min-h-11 min-w-0 grow cursor-pointer items-center gap-2.5">
                <input
                  type="checkbox"
                  className="h-5 w-5 shrink-0 accent-brand-300"
                  checked={on}
                  disabled={blocked}
                  onChange={(e) => toggle(t.id, e.target.checked)}
                  aria-label={t.name}
                />
                <TargetAvatar name={t.name} imageUrl={t.image_url} channel={t.channel} size={36} />
                <div className="min-w-0 grow">
                  {/* dir="auto" so an LTR name (Беэр-Шева…) truncates at its own
                      end; inside an RTL box it was being clipped at the START, which
                      made every Russian group render as the same "…и Негев". */}
                  <p dir="auto" className="truncate text-sm font-bold text-mist-100">
                    {t.favorite && (
                      <>
                        {/* The checkbox beside this row carries the name as
                            its accessible name, so the mark has to say itself
                            — an aria-hidden star was silent on the one flag
                            that changes how the list is used. */}
                        <span className="sr-only">מועדפת. </span>
                        <StarIcon className="me-1 inline h-3.5 w-3.5 align-[-1px] text-warning-400" fill="currentColor" aria-hidden />
                      </>
                    )}
                    {t.name}
                  </p>
                  <div className="mt-0.5 flex flex-wrap items-center gap-1">
                    {mixedChannels && <MethodBadge channel={t.channel} />}
                    {!t.enabled && <Badge tone="neutral">כבוי</Badge>}
                    {t.channel === 'facebook_page' && !t.can_api_publish && <Badge tone="warn">אין הרשאה</Badge>}
                  </div>
                </div>
              </label>
              {on && onVariantMap && approved.length > 0 && (
                <select
                  aria-label={`גרסה עבור ${t.name}`}
                  /* Was ~26px tall at text-xs: under the tap floor, and small
                     enough text that iOS Safari zooms the page on focus. */
                  className="min-h-11 max-w-28 shrink-0 rounded-xl border border-ink-600 bg-ink-900 px-2 py-1 text-base text-mist-100"
                  value={variantMap[t.id] ?? ''}
                  onChange={(e) => {
                    const next = { ...variantMap };
                    if (e.target.value) next[t.id] = e.target.value;
                    else delete next[t.id];
                    onVariantMap(next);
                  }}
                >
                  <option value="">אוטומטי</option>
                  {approved.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.label}
                    </option>
                  ))}
                </select>
              )}
            </li>
          );
        })}
      </ul>

      {visible.length > page.length && (
        <div className="flex flex-col items-center gap-1">
          <Button size="sm" variant="secondary" onClick={() => setShown((n) => n + CHUNK)}>
            הצג עוד {Math.min(CHUNK, visible.length - page.length)}
          </Button>
          <p className="text-[11px] text-mist-500">
            מוצגים {page.length} מתוך {visible.length}. &quot;רק…&quot;, &quot;הכל חוץ מ…&quot;, &quot;+&quot; ו-&quot;−&quot; פועלים על כל{' '}
            {visible.length}.
          </p>
        </div>
      )}
    </div>
  );
}
