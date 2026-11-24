'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { whatsappLink } from '@/lib/site';

/**
 * Accessibility toolbar (text size, grayscale, contrast, light background,
 * link highlighting, readable font, stop animations). Settings are applied as
 * classes / a filter on <html> and remembered on this device. It complements,
 * not replaces, the accessible markup of the site itself (IS 5568).
 */

type Prefs = {
  size: number; // -1 … 3
  gray: boolean;
  contrast: boolean;
  invert: boolean;
  light: boolean;
  links: boolean;
  font: boolean;
  still: boolean;
};
const OFF: Prefs = { size: 0, gray: false, contrast: false, invert: false, light: false, links: false, font: false, still: false };
const KEY = 'anx3d-a11y';

function apply(p: Prefs) {
  const html = document.documentElement;
  const f = [p.gray && 'grayscale(1)', p.contrast && 'contrast(1.45)', p.invert && 'invert(1) hue-rotate(180deg)'].filter(Boolean).join(' ');
  html.style.filter = f;
  html.style.setProperty('--a11y-zoom', String(1 + p.size * 0.12));
  html.classList.toggle('a11y-zoom', p.size !== 0);
  html.classList.toggle('a11y-invert', p.invert);
  html.classList.toggle('a11y-light', p.light);
  html.classList.toggle('a11y-links', p.links);
  html.classList.toggle('a11y-font', p.font);
  html.classList.toggle('a11y-still', p.still);
}

function load(): Prefs {
  try {
    return { ...OFF, ...JSON.parse(localStorage.getItem(KEY) || '{}') };
  } catch {
    return OFF;
  }
}

const I = {
  wheel: (
    <svg width="30" height="30" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.9} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <circle cx="12" cy="4" r="1.8" fill="currentColor" stroke="none" />
      <path d="M12 7.5v6h5l2.5 5" />
      <path d="M12 10h4.5" />
      <path d="M9 10.6a5.6 5.6 0 1 0 6.9 7.2" />
    </svg>
  ),
};

function Icon({ d }: { d: string }) {
  return (
    <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
      <path d={d} />
    </svg>
  );
}

export function A11yWidget() {
  const [open, setOpen] = useState(false);
  const [p, setP] = useState<Prefs>(OFF);

  useEffect(() => {
    const saved = load();
    setP(saved);
    apply(saved);
  }, []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [open]);

  const update = (next: Prefs) => {
    setP(next);
    apply(next);
    try {
      localStorage.setItem(KEY, JSON.stringify(next));
    } catch {}
  };
  const toggle = (k: Exclude<keyof Prefs, 'size'>) => update({ ...p, [k]: !p[k] });

  const rows: { label: string; d: string; on?: boolean; act: () => void }[] = [
    { label: 'הגדלת טקסט', d: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm0 4v6m-3-3h6m5 9-4-4', act: () => update({ ...p, size: Math.min(3, p.size + 1) }), on: p.size > 0 },
    { label: 'הקטנת טקסט', d: 'M11 4a7 7 0 1 0 0 14 7 7 0 0 0 0-14Zm-3 7h6m5 9-4-4', act: () => update({ ...p, size: Math.max(-1, p.size - 1) }), on: p.size < 0 },
    { label: 'גווני אפור', d: 'M4 5v14M7 5v14M10 5v14M13 5v14M16 5v14M19 5v14', act: () => toggle('gray'), on: p.gray },
    { label: 'ניגודיות גבוהה', d: 'M12 3a9 9 0 1 0 0 18V3Z M12 3a9 9 0 0 1 0 18', act: () => toggle('contrast'), on: p.contrast },
    { label: 'ניגודיות הפוכה', d: 'M2 12s3.5-6.5 10-6.5S22 12 22 12s-3.5 6.5-10 6.5S2 12 2 12Zm10-3a3 3 0 1 0 0 6 3 3 0 0 0 0-6Z', act: () => toggle('invert'), on: p.invert },
    { label: 'רקע בהיר', d: 'M9 18h6m-5 3h4M12 3a6 6 0 0 0-3.5 10.9c.6.5 1 1.2 1 2V16h5v-.1c0-.8.4-1.5 1-2A6 6 0 0 0 12 3Z', act: () => toggle('light'), on: p.light },
    { label: 'הדגשת קישורים', d: 'M10 14a4 4 0 0 0 5.7 0l3-3a4 4 0 0 0-5.7-5.7l-1 1M14 10a4 4 0 0 0-5.7 0l-3 3a4 4 0 0 0 5.7 5.7l1-1', act: () => toggle('links'), on: p.links },
    { label: 'פונט קריא', d: 'M5 20 12 4l7 16M8 14h8', act: () => toggle('font'), on: p.font },
    { label: 'עצירת אנימציות', d: 'M9 5v14M15 5v14', act: () => toggle('still'), on: p.still },
  ];

  return (
    <div id="a11y-root" dir="rtl">
      <button
        type="button"
        onClick={() => setOpen((o) => !o)}
        aria-expanded={open}
        aria-controls="a11y-panel"
        aria-label="כלי נגישות"
        className="fixed top-[42%] left-0 z-[60] grid h-12 w-11 place-items-center rounded-r-[12px] bg-[#3348b8] text-white shadow-[0_4px_14px_rgb(0_0_0/0.25)] focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-[#ffbf00]"
      >
        {I.wheel}
      </button>
      {open && (
        <>
          <button type="button" aria-label="סגירת כלי הנגישות" onClick={() => setOpen(false)} className="fixed inset-0 z-[60] bg-black/20" />
          <section
            id="a11y-panel"
            role="dialog"
            aria-modal="true"
            aria-labelledby="a11y-title"
            className="fixed top-1/2 left-0 z-[61] max-h-[86dvh] w-[272px] -translate-y-1/2 overflow-y-auto rounded-r-[16px] border-2 border-l-0 border-[#3348b8] bg-white text-[#111] shadow-[0_10px_40px_rgb(0_0_0/0.3)]"
          >
            <div className="flex items-center justify-between border-b border-[#e5e7ef] px-4 py-3">
              <h2 id="a11y-title" className="text-[18px] font-black">
                כלי נגישות
              </h2>
              <button type="button" onClick={() => setOpen(false)} aria-label="סגירה" className="grid size-9 place-items-center rounded-full text-[22px] leading-none hover:bg-[#f1f3f8]">
                ×
              </button>
            </div>
            <ul className="px-2 py-2">
              {rows.map((r) => (
                <li key={r.label}>
                  <button
                    type="button"
                    aria-pressed={!!r.on}
                    onClick={r.act}
                    className={`flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-start text-[15.5px] font-semibold ${r.on ? 'bg-[#e8ecff] text-[#1f2f8a]' : 'hover:bg-[#f4f5f9]'}`}
                  >
                    <Icon d={r.d} />
                    <span className="underline underline-offset-4">{r.label}</span>
                  </button>
                </li>
              ))}
              <li>
                <button type="button" onClick={() => update(OFF)} className="flex w-full items-center gap-3 rounded-[10px] px-3 py-2.5 text-start text-[15.5px] font-semibold hover:bg-[#f4f5f9]">
                  <Icon d="M4 12a8 8 0 1 0 2.3-5.7M4 4v4h4" />
                  <span className="underline underline-offset-4">איפוס</span>
                </button>
              </li>
            </ul>
            <div className="border-t border-[#e5e7ef] px-2 py-2">
              <Link href="/shop/legal/accessibility" onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15.5px] font-semibold hover:bg-[#f4f5f9]">
                <Icon d="M12 21a9 9 0 1 0 0-18 9 9 0 0 0 0 18Zm-2.5-11.5a2.5 2.5 0 1 1 3.5 2.3c-.6.3-1 .9-1 1.6v.6m0 3h.01" />
                <span className="underline underline-offset-4">הצהרת נגישות</span>
              </Link>
              <a
                href={whatsappLink('שלום, יש לי פנייה בנושא נגישות באתר ANX3D')}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center gap-3 rounded-[10px] px-3 py-2.5 text-[15.5px] font-semibold hover:bg-[#f4f5f9]"
              >
                <Icon d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.7A8 8 0 1 1 21 12Z" />
                <span className="underline underline-offset-4">פנייה בנושא נגישות</span>
              </a>
            </div>
          </section>
        </>
      )}
    </div>
  );
}
