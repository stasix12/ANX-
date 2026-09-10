'use client';

import { useEffect, useRef, useState } from 'react';
import {
  deviceLocation,
  suggestAddresses,
  type AddressSuggestion,
} from '@/lib/geocode';

/**
 * A text input that pops real address suggestions while typing, biased to
 * the device location (asked once, on first focus) and to an optional
 * caller-supplied point such as the already-chosen city. Used by the CRM
 * lead form, the customer funnel and the close-job dialog.
 */
export function AddressAutocompleteInput({
  id,
  value,
  onChangeText,
  onSelect,
  placeholder,
  inputClassName,
  bias = null,
}: {
  id?: string;
  value: string;
  onChangeText: (text: string) => void;
  onSelect?: (s: AddressSuggestion) => void;
  placeholder?: string;
  inputClassName: string;
  /** Extra bias point, e.g. the chosen city's coordinates. */
  bias?: { lat: number; lng: number } | null;
}) {
  const [suggestions, setSuggestions] = useState<AddressSuggestion[]>([]);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(-1);
  const [loading, setLoading] = useState(false);
  const abortRef = useRef<AbortController | null>(null);
  const deviceRef = useRef<{ lat: number; lng: number } | null>(null);
  // Suppresses the lookup that would otherwise re-fire from the controlled
  // value change right after a suggestion is picked.
  const justPickedRef = useRef(false);

  useEffect(() => {
    if (justPickedRef.current) {
      justPickedRef.current = false;
      return;
    }
    const q = value.trim();
    if (q.length < 2) {
      setSuggestions([]);
      setOpen(false);
      return;
    }
    const timer = setTimeout(async () => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;
      setLoading(true);
      try {
        const results = await suggestAddresses(q, bias ?? deviceRef.current, controller.signal);
        if (!controller.signal.aborted) {
          setSuggestions(results);
          setOpen(results.length > 0);
          setActive(-1);
        }
      } catch {
        // Aborted by newer keystroke — nothing to show.
      } finally {
        if (!controller.signal.aborted) setLoading(false);
      }
    }, 300);
    return () => clearTimeout(timer);
  }, [value, bias]);

  function pick(s: AddressSuggestion) {
    justPickedRef.current = true;
    onChangeText(s.addressLine || s.label);
    onSelect?.(s);
    setOpen(false);
    setSuggestions([]);
  }

  return (
    <div className="relative">
      <input
        id={id}
        type="text"
        autoComplete="off"
        role="combobox"
        aria-expanded={open}
        aria-autocomplete="list"
        placeholder={placeholder}
        value={value}
        onChange={(e) => onChangeText(e.target.value)}
        onFocus={() => {
          // Warm the location cache so the first lookup is already biased.
          void deviceLocation().then((loc) => {
            deviceRef.current = loc;
          });
          if (suggestions.length > 0) setOpen(true);
        }}
        onBlur={() => {
          // Delay so a tap on a suggestion lands before the list closes.
          setTimeout(() => setOpen(false), 150);
        }}
        onKeyDown={(e) => {
          if (!open) return;
          if (e.key === 'ArrowDown') {
            e.preventDefault();
            setActive((a) => Math.min(a + 1, suggestions.length - 1));
          } else if (e.key === 'ArrowUp') {
            e.preventDefault();
            setActive((a) => Math.max(a - 1, 0));
          } else if (e.key === 'Enter' && active >= 0) {
            e.preventDefault();
            pick(suggestions[active]);
          } else if (e.key === 'Escape') {
            setOpen(false);
          }
        }}
        className={inputClassName}
      />
      {loading && (
        <span
          aria-hidden
          className="pointer-events-none absolute end-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin rounded-full border-2 border-ink-600 border-t-transparent"
        />
      )}
      {open && suggestions.length > 0 && (
        <ul
          role="listbox"
          className="absolute inset-x-0 top-full z-30 mt-1 max-h-64 overflow-y-auto rounded-xl border border-ink-600 bg-ink-850 py-1 shadow-xl"
        >
          {suggestions.map((s, i) => (
            <li key={s.label} role="option" aria-selected={i === active}>
              <button
                type="button"
                // pointerdown beats the input's blur timeout on touch too.
                onPointerDown={(e) => {
                  e.preventDefault();
                  pick(s);
                }}
                className={`flex w-full items-center gap-2 px-4 py-2.5 text-start text-base ${
                  i === active ? 'bg-brand-500/10' : ''
                }`}
              >
                <span aria-hidden className="shrink-0 text-sm">📍</span>
                <span className="min-w-0">
                  <span className="block truncate font-bold">{s.addressLine || s.label}</span>
                  {s.city && s.city !== (s.addressLine || s.label) ? (
                    <span className="block truncate text-xs opacity-70">{s.city}</span>
                  ) : null}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
