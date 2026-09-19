'use client';

import { useState } from 'react';
import { CheckIcon, PlusIcon, SearchIcon } from '@/components/icons';
import { Button, Field, inputClass } from '@/components/social/ui';
import { KNOWN_CITIES, OTHER_CITY } from '@/lib/social/cities';
import { DISCOVERY_DOMAINS, buildKeywords, facebookGroupSearchUrl } from '@/lib/social/discovery';

/**
 * Step 1 of the discovery flow: turn "a city + the kinds of groups I want"
 * into a list of search phrases, and turn each phrase into one tap on
 * Facebook's own group search.
 *
 * Nothing here talks to Meta. The phrases are generated locally and each one
 * is a plain https://www.facebook.com/search/groups/?q=… link that the owner
 * follows in their own browser — the same thing they would type by hand, with
 * the typing done for them. The screen never claims to know what came back
 * from a search: a phrase is "opened" or "not opened", never "N results".
 */
export function DiscoverySearchBuilder({
  cityOptions,
  city,
  onCity,
  customCity,
  onCustomCity,
  effectiveCity,
  domains,
  onDomains,
  phrases,
  onPhrases,
  opened,
  onOpen,
}: {
  /** The business's own cities, offered first. */
  cityOptions: string[];
  city: string;
  onCity: (v: string) => void;
  customCity: string;
  onCustomCity: (v: string) => void;
  /** What the page will actually search for and stamp on captured rows. */
  effectiveCity: string;
  domains: string[];
  onDomains: (v: string[]) => void;
  phrases: string[];
  onPhrases: (v: string[]) => void;
  /** Phrases already opened in this session, so the owner keeps their place. */
  opened: string[];
  onOpen: (phrase: string) => void;
}) {
  const [draft, setDraft] = useState('');

  function toggleDomain(id: string) {
    onDomains(domains.includes(id) ? domains.filter((d) => d !== id) : [...domains, id]);
  }

  function generate() {
    const next = buildKeywords(effectiveCity, domains);
    // Anything the owner typed themselves survives a re-generate.
    const manual = phrases.filter((p) => !next.includes(p));
    onPhrases([...next, ...manual]);
  }

  function addDraft() {
    const value = draft.trim();
    if (!value || phrases.includes(value)) {
      setDraft('');
      return;
    }
    onPhrases([...phrases, value]);
    setDraft('');
  }

  return (
    <div className="space-y-4">
      <div>
        <p className="mb-1.5 text-sm font-bold text-mist-300">עיר</p>
        <div className="flex flex-wrap gap-1.5">
          {[...cityOptions, OTHER_CITY].map((c) => {
            const active = c === city;
            return (
              <button
                key={c}
                type="button"
                aria-pressed={active}
                onClick={() => onCity(c)}
                className={`inline-flex min-h-11 items-center rounded-xl px-3.5 text-sm font-bold transition-colors ${
                  active ? 'bg-brand-500 text-on-brand' : 'bg-ink-800 text-mist-300'
                }`}
              >
                {c === OTHER_CITY ? 'עיר אחרת' : c}
              </button>
            );
          })}
        </div>
        {city === OTHER_CITY && (
          <div className="mt-2.5">
            <Field label="שם העיר" hint="אפשר לבחור מהרשימה או לכתוב כל עיר אחרת.">
              <input
                className={inputClass}
                value={customCity}
                onChange={(e) => onCustomCity(e.target.value)}
                placeholder="למשל: אופקים"
                list="discovery-cities"
              />
              <datalist id="discovery-cities">
                {KNOWN_CITIES.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>
        )}
      </div>

      <div>
        <p className="mb-1.5 text-sm font-bold text-mist-300">סוגי קבוצות</p>
        <div className="flex flex-wrap gap-1.5">
          {DISCOVERY_DOMAINS.map((d) => {
            const active = domains.includes(d.id);
            return (
              <button
                key={d.id}
                type="button"
                aria-pressed={active}
                onClick={() => toggleDomain(d.id)}
                className={`inline-flex min-h-11 items-center gap-1.5 rounded-xl px-3.5 text-sm font-bold transition-colors ${
                  active ? 'bg-brand-500 text-on-brand' : 'bg-ink-800 text-mist-300'
                }`}
              >
                {active && <CheckIcon className="h-4 w-4" />}
                {d.label}
              </button>
            );
          })}
        </div>
        <p className="mt-1.5 text-xs text-mist-500">
          אפשר לבחור כמה סוגים יחד. ביטויי הסוגים נוצרים בעברית; באנגלית נוצרים שמות העיר עצמה, כשיש לנו את האיות שלה.
        </p>
      </div>

      <div>
        <Button size="lg" className="w-full" onClick={generate} disabled={!effectiveCity.trim()}>
          <SearchIcon className="h-4 w-4" />
          צור חיפושים
        </Button>
        {/* Never a dead control without a stated reason. */}
        {!effectiveCity.trim() && (
          <p className="mt-1.5 text-xs text-mist-500">
            {city === OTHER_CITY ? 'כתבו את שם העיר למעלה כדי ליצור ביטויי חיפוש.' : 'בחרו עיר כדי ליצור ביטויי חיפוש.'}
          </p>
        )}
      </div>

      {phrases.length > 0 && (
        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <p className="text-sm font-bold text-mist-300">
              ביטויי החיפוש ({phrases.length})
            </p>
            <button type="button" className="min-h-10 px-1 text-xs font-bold text-mist-500" onClick={() => onPhrases([])}>
              נקה הכל
            </button>
          </div>
          <ul className="space-y-1.5">
            {phrases.map((p) => {
              const isOpen = opened.includes(p);
              return (
                <li key={p} className="flex min-w-0 items-center gap-1.5">
                  <a
                    href={facebookGroupSearchUrl(p)}
                    target="_blank"
                    rel="noreferrer"
                    onClick={() => onOpen(p)}
                    className={`flex min-h-11 min-w-0 grow items-center gap-2 rounded-xl border px-3 text-sm font-bold transition-colors ${
                      isOpen ? 'border-ink-600 bg-ink-800 text-mist-500' : 'border-brand-500/30 bg-ink-850 text-brand-500'
                    }`}
                  >
                    {isOpen ? <CheckIcon className="h-4 w-4 shrink-0" /> : <SearchIcon className="h-4 w-4 shrink-0" />}
                    <span dir="auto" className="min-w-0 grow truncate">
                      {p}
                    </span>
                    <span className="shrink-0 text-[11px] font-bold text-mist-500">{isOpen ? 'נפתח' : 'חפש'}</span>
                  </a>
                  <button
                    type="button"
                    aria-label={`הסר את ${p}`}
                    onClick={() => onPhrases(phrases.filter((x) => x !== p))}
                    className="grid h-11 w-11 shrink-0 place-items-center rounded-xl text-lg font-extrabold text-mist-500 hover:bg-ink-800"
                  >
                    ×
                  </button>
                </li>
              );
            })}
          </ul>
          <p className="mt-2 text-xs text-mist-500">
            כל לחיצה פותחת את חיפוש הקבוצות של פייסבוק בלשונית חדשה. הסימון &quot;נפתח&quot; הוא רק תזכורת איפה עצרתם — המערכת לא רואה מה הופיע בחיפוש.
          </p>
        </div>
      )}

      <div>
        <Field label="הוספת ביטוי משלכם" hint="למשל: לוח מודעות באר שבע, או שם של שכונה.">
          <div className="flex min-w-0 gap-1.5">
            <input
              className={inputClass}
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  e.preventDefault();
                  addDraft();
                }
              }}
              placeholder="ביטוי חיפוש"
            />
            <Button variant="secondary" onClick={addDraft} disabled={!draft.trim()} aria-label="הוסף ביטוי">
              <PlusIcon className="h-4 w-4" />
            </Button>
          </div>
        </Field>
      </div>
    </div>
  );
}
