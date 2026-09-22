'use client';

import { useState } from 'react';
import type { FaqItem } from '@/content/faq';
import { track } from '@/lib/analytics';
import { ChevronDownIcon } from '@/components/ui/icons';

/**
 * button[aria-expanded] + region, animated with the grid-rows trick. Answers
 * are always in the DOM (SEO + FAQPage schema); JS only toggles visibility.
 */
export function FaqAccordion({ items, defaultOpen = null }: { items: FaqItem[]; defaultOpen?: string | null }) {
  const [openId, setOpenId] = useState<string | null>(defaultOpen);

  return (
    <div className="divide-y divide-light-border border-y border-light-border">
      {items.map((item) => {
        const open = openId === item.id;
        const btnId = `faq-btn-${item.id}`;
        const panelId = `faq-panel-${item.id}`;
        return (
          <div key={item.id}>
            <h3>
              <button
                id={btnId}
                type="button"
                aria-expanded={open}
                aria-controls={panelId}
                onClick={() => {
                  const next = open ? null : item.id;
                  setOpenId(next);
                  if (next) track('faq_open', { question_id: item.id, question_text: item.q });
                }}
                className="flex min-h-14 w-full items-center justify-between gap-4 py-3 text-start text-[17px] font-semibold text-navy"
              >
                <span>{item.q}</span>
                <ChevronDownIcon
                  className={`h-5 w-5 shrink-0 text-navy-subtle transition-transform duration-200 ${open ? 'rotate-180' : ''}`}
                />
              </button>
            </h3>
            <div
              id={panelId}
              role="region"
              aria-labelledby={btnId}
              className="acc-panel"
              data-open={open}
              inert={!open}
            >
              <div>
                <p className="pb-5 text-base leading-relaxed text-navy-muted">{item.a}</p>
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}
