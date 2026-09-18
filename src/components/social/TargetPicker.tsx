'use client';

import { useMemo, useState } from 'react';
import { detectCity, sortCities } from '@/lib/social/cities';
import { CHANNEL_LABEL, PERMISSION_LABEL, type SocialTarget, type Variant } from '@/lib/social/types';
import { TargetAvatar } from './TargetAvatar';
import { Toggle, inputClass } from './ui';

/**
 * Multi-select of publishing targets with search, "select all / none /
 * active only" and an optional per-target variant override. Used by the post
 * editor; the groups screen reuses the same filtering idea.
 */
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
  const cityOf = (t: SocialTarget) => t.city || detectCity(t.name);
  const cities = useMemo(() => sortCities(targets.filter((t) => t.channel === 'facebook_group').map(cityOf)), [targets]);

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return targets.filter(
      (t) =>
        (channel === 'all' || t.channel === channel) &&
        (!city || cityOf(t) === city) &&
        (!q || t.name.toLowerCase().includes(q) || t.url.toLowerCase().includes(q)),
    );
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [targets, query, channel, city]);

  const approved = variants.filter((v) => v.approval === 'approved');
  const groupCount = (ids: string[]) => ids.filter((id) => targets.find((t) => t.id === id)?.channel === 'facebook_group').length;

  function toggle(id: string, on: boolean) {
    if (!on) return onChange(selected.filter((x) => x !== id));
    const next = [...selected, id];
    if (maxSelectable !== undefined && groupCount(next) > maxSelectable) return;
    onChange(next);
  }

  const selectAll = () => {
    let next = Array.from(new Set([...selected, ...visible.filter((t) => t.enabled).map((t) => t.id)]));
    if (maxSelectable !== undefined && groupCount(next) > maxSelectable) {
      const groups = next.filter((id) => targets.find((t) => t.id === id)?.channel === 'facebook_group').slice(0, maxSelectable);
      next = next.filter((id) => targets.find((t) => t.id === id)?.channel !== 'facebook_group').concat(groups);
    }
    onChange(next);
  };
  const selectNone = () => onChange(selected.filter((id) => !visible.some((t) => t.id === id)));
  const activeOnly = () => onChange(selected.filter((id) => targets.find((t) => t.id === id)?.enabled));

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <input className={`${inputClass} !w-auto grow`} placeholder="חיפוש לפי שם…" value={query} onChange={(e) => setQuery(e.target.value)} />
        <div role="group" className="flex rounded-xl bg-ink-800 p-0.5 text-xs font-bold">
          {(['all', 'facebook_page', 'facebook_group'] as const).map((c) => (
            <button key={c} type="button" aria-pressed={channel === c} onClick={() => setChannel(c)} className={`rounded-lg px-2.5 py-1.5 ${channel === c ? 'bg-brand-500 text-on-brand' : 'text-mist-300'}`}>
              {c === 'all' ? 'הכל' : c === 'facebook_page' ? 'דפים' : 'קבוצות'}
            </button>
          ))}
        </div>
      </div>
      {cities.length > 1 && (
        <div role="group" className="flex flex-wrap gap-1 rounded-xl bg-ink-800 p-0.5 text-xs font-bold">
          <button type="button" aria-pressed={!city} onClick={() => setCity('')} className={`rounded-lg px-2.5 py-1.5 ${!city ? 'bg-brand-500 text-on-brand' : 'text-mist-300'}`}>
            כל הערים
          </button>
          {cities.map((c) => (
            <button key={c} type="button" aria-pressed={city === c} onClick={() => setCity(c)} className={`rounded-lg px-2.5 py-1.5 ${city === c ? 'bg-brand-500 text-on-brand' : 'text-mist-300'}`}>
              {c} ({targets.filter((t) => t.channel === 'facebook_group' && cityOf(t) === c).length})
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-2 text-xs font-bold">
        <button type="button" className="text-brand-400" onClick={selectAll}>
          {city ? `בחר את כל ${city}` : 'בחר הכל'}
        </button>
        <span className="text-mist-500">·</span>
        <button type="button" className="text-brand-400" onClick={selectNone}>
          נקה בחירה
        </button>
        <span className="text-mist-500">·</span>
        <button type="button" className="text-brand-400" onClick={activeOnly}>
          פעילים בלבד
        </button>
        <span className="ms-auto text-mist-500">
          נבחרו {selected.length} מתוך {targets.length}
        </span>
      </div>
      {note && <p className="text-xs text-amber-700">{note}</p>}
      {visible.length === 0 && <p className="text-sm text-mist-500">אין יעדים תואמים.</p>}
      <ul className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        {visible.map((t) => {
          const on = selected.includes(t.id);
          const mapped = variantMap[t.id];
          return (
            <li key={t.id} className={`flex items-center gap-2.5 rounded-xl border px-2.5 py-2 ${!t.enabled ? 'opacity-50' : ''} ${on ? 'border-brand-500 bg-brand-500/5' : 'border-ink-600'}`}>
              <Toggle checked={on} onChange={(v) => toggle(t.id, v)} label={t.name} />
              <TargetAvatar name={t.name} imageUrl={t.image_url} channel={t.channel} size={40} />
              <div className="min-w-0 grow">
                <p className="truncate text-sm font-bold text-mist-100">{t.name}</p>
                <p className={`truncate text-xs ${t.channel === 'facebook_page' ? 'text-emerald-700' : 'text-sky-700'}`}>
                  {CHANNEL_LABEL[t.channel]} · {t.channel === 'facebook_page' ? (t.can_api_publish ? 'Graph API' : PERMISSION_LABEL[t.permission_status]) : 'worker מקומי'}
                  {!t.enabled && ' · כבוי'}
                </p>
              </div>
              {on && onVariantMap && approved.length > 0 && (
                <select
                  aria-label={`גרסה עבור ${t.name}`}
                  className="max-w-28 rounded-lg border border-ink-600 bg-ink-850 px-1.5 py-1 text-xs text-mist-100"
                  value={mapped ?? ''}
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
    </div>
  );
}
