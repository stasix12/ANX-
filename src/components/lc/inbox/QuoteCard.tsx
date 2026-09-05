'use client';

import { useLc } from '@/lib/lc/context';
import { formatMoney } from '@/lib/lc/format';
import type { Quote } from '@/lib/lc/types';
import { cx } from '../ui/primitives';

export function QuoteCard({ quote, compact, className }: { quote: Quote; compact?: boolean; className?: string }) {
  const { t, locale } = useLc();
  return (
    <div className={cx('rounded-xl border border-lc-border bg-white p-3.5 text-[13px]', className)}>
      <div className="mb-2 flex items-center justify-between">
        <span className="font-semibold text-lc-text">{t('inbox.quote')}</span>
        <span className={cx('rounded-full px-2 py-0.5 text-[11px] font-bold', quote.status === 'accepted' ? 'bg-lc-success-soft text-lc-success' : quote.status === 'sent' ? 'bg-lc-info-soft text-lc-info' : 'bg-slate-100 text-slate-500')}>{quote.status}</span>
      </div>
      <ul className="space-y-1">
        {quote.lines.map((l, i) => (
          <li key={i} className="flex justify-between gap-2 text-lc-muted">
            <span className="truncate">{l.label}{l.quantity > 1 ? ` ×${l.quantity}` : ''}</span>
            <span className="lc-tnum shrink-0 text-lc-text">{formatMoney(l.total, locale)}</span>
          </li>
        ))}
        {!compact &&
          quote.adjustments.map((a, i) => (
            <li key={`a${i}`} className="flex justify-between gap-2 text-lc-muted">
              <span className="truncate">{a.label}</span>
              <span className={cx('lc-tnum shrink-0', a.amount < 0 ? 'text-lc-success' : 'text-lc-text')}>{a.amount < 0 ? '−' : '+'}{formatMoney(Math.abs(a.amount), locale)}</span>
            </li>
          ))}
      </ul>
      <div className="mt-2 flex justify-between border-t border-dashed border-lc-border pt-2 font-bold text-lc-text">
        <span>{t('common.total')}</span>
        <span className="lc-tnum">{formatMoney(quote.total, locale)}</span>
      </div>
    </div>
  );
}
