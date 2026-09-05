'use client';

import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { Shell } from '@/components/lc/Shell';
import { BriefcaseIcon, CheckCircleIcon, ChevronLeftIcon, InboxIcon, MapPinIcon, MessageIcon, PhoneIcon, SearchIcon, StarIcon, UsersIcon, WalletIcon, WhatsAppIcon } from '@/components/lc/icons';
import { LangFlag, SourceLabel } from '@/components/lc/shared/StatusPill';
import { Input, Textarea } from '@/components/lc/ui/forms';
import { Avatar, Button, Card, EmptyState, PageHeader, cx } from '@/components/lc/ui/primitives';
import { useLc } from '@/lib/lc/context';
import { formatDateTime, formatMoney, timeAgo } from '@/lib/lc/format';
import { updateCustomer } from '@/lib/lc/ops';
import type { Customer } from '@/lib/lc/types';

export default function CustomersPage() {
  return (
    <Suspense fallback={null}>
      <Customers />
    </Suspense>
  );
}

function Customers() {
  const { s, t, locale } = useLc();
  const params = useSearchParams();
  const router = useRouter();
  const id = params.get('id');
  const [q, setQ] = useState('');
  const now = useMemo(() => new Date(), []);

  const list = useMemo(() => {
    if (!s) return [];
    const n = q.trim().toLowerCase();
    return [...s.customers]
      .filter((c) => !n || c.name.toLowerCase().includes(n) || c.phone.includes(n) || c.city.toLowerCase().includes(n))
      .sort((a, b) => b.lastContactAt.localeCompare(a.lastContactAt))
      .slice(0, 200);
  }, [s, q]);
  const selected = s?.customers.find((c) => c.id === id) ?? null;

  return (
    <Shell title={t('cust.title')} wide>
      {s && (
        <>
          <PageHeader title={t('cust.title')} subtitle={`${s.customers.length} · ${formatMoney(s.customers.reduce((a, c) => a + c.lifetimeValue, 0), locale)} ${t('cust.ltv').toLowerCase()}`} />
          <div className={cx('grid gap-5', selected ? 'lg:grid-cols-[1fr_460px]' : '')}>
            <div className={cx(selected && 'hidden lg:block')}>
              <div className="relative mb-4 w-full sm:w-80">
                <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lc-faint" />
                <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} className="ps-9" />
              </div>
              {list.length === 0 ? (
                <Card><EmptyState icon={<UsersIcon />} title={t('cust.empty')} /></Card>
              ) : (
                <Card className="overflow-hidden">
                  <table className="w-full text-start text-sm">
                    <thead className="bg-lc-bg text-[11px] font-bold uppercase tracking-wider text-lc-faint">
                      <tr>
                        <th className="px-4 py-2.5 text-start">{t('common.name')}</th>
                        <th className="hidden px-4 py-2.5 text-start md:table-cell">{t('common.city')}</th>
                        <th className="hidden px-4 py-2.5 text-start lg:table-cell">{t('common.source')}</th>
                        <th className="px-4 py-2.5 text-end">{t('cust.jobs')}</th>
                        <th className="px-4 py-2.5 text-end">{t('cust.ltv')}</th>
                        <th className="hidden px-4 py-2.5 text-end sm:table-cell">{t('cust.lastContact')}</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-lc-border">
                      {list.map((c) => {
                        const jobs = s.jobs.filter((j) => j.customerId === c.id && j.status !== 'cancelled').length;
                        return (
                          <tr key={c.id} onClick={() => router.replace(`/lc/customers?id=${c.id}`)} className={cx('cursor-pointer transition-colors hover:bg-lc-bg', c.id === id && 'bg-lc-primary-soft/60')}>
                            <td className="px-4 py-2.5">
                              <span className="flex items-center gap-3">
                                <Avatar name={c.name} />
                                <span className="min-w-0">
                                  <span className="flex items-center gap-1.5 font-semibold text-lc-text"><span className="truncate">{c.name}</span><LangFlag lang={c.language} /></span>
                                  <span className="lc-tnum block text-xs text-lc-muted" dir="ltr">{c.phone}</span>
                                </span>
                              </span>
                            </td>
                            <td className="hidden px-4 py-2.5 text-lc-muted md:table-cell">{c.city}</td>
                            <td className="hidden px-4 py-2.5 lg:table-cell"><SourceLabel source={c.source} /></td>
                            <td className="lc-tnum px-4 py-2.5 text-end font-semibold text-lc-text">{jobs}</td>
                            <td className="lc-tnum px-4 py-2.5 text-end font-bold text-lc-success">{formatMoney(c.lifetimeValue, locale)}</td>
                            <td className="hidden px-4 py-2.5 text-end text-xs text-lc-faint sm:table-cell">{timeAgo(c.lastContactAt, locale, now)}</td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </Card>
              )}
            </div>
            {selected && <CustomerProfile c={selected} onClose={() => router.replace('/lc/customers')} />}
          </div>
        </>
      )}
    </Shell>
  );
}

function CustomerProfile({ c, onClose }: { c: Customer; onClose: () => void }) {
  const { s, t, locale, run } = useLc();
  const [notes, setNotes] = useState(c.notes);
  const leads = s!.leads.filter((l) => l.customerId === c.id);
  const jobs = s!.jobs.filter((j) => j.customerId === c.id).sort((a, b) => b.scheduledAt.localeCompare(a.scheduledAt));
  const photos = jobs.flatMap((j) => j.photos);
  const timeline = useMemo(() => {
    const items: { at: string; kind: 'lead_received' | 'conversation' | 'quote' | 'booking' | 'job_completed' | 'review_requested'; text: string; href?: string; amount?: number }[] = [];
    for (const l of leads) {
      const conv = s!.conversations.find((x) => x.id === l.conversationId);
      items.push({ at: l.createdAt, kind: 'lead_received', text: `${t(`src.${l.source}` as const)}`, href: conv ? `/lc/inbox?c=${conv.id}` : undefined });
      if (conv) {
        const count = s!.messages.filter((m) => m.conversationId === conv.id).length;
        if (count > 1) items.push({ at: conv.lastMessageAt, kind: 'conversation', text: `${count} ${t('nav.inbox').toLowerCase()}`, href: `/lc/inbox?c=${conv.id}` });
      }
      const q = s!.quotes.find((x) => x.id === l.quoteId);
      if (q) items.push({ at: q.createdAt, kind: 'quote', text: q.lines.map((x) => x.label).join(', '), amount: q.total });
      const b = s!.bookings.find((x) => x.id === l.bookingId);
      if (b) items.push({ at: b.createdAt, kind: 'booking', text: formatDateTime(b.startAt, locale) });
    }
    for (const j of jobs) {
      if (j.completedAt) items.push({ at: j.completedAt, kind: 'job_completed', text: j.serviceSummary, amount: j.price, href: `/lc/jobs?j=${j.id}` });
      const review = s!.automationRuns.find((r) => r.entityId === j.id && r.automationKey === 'review_request' && r.status === 'sent');
      if (review) items.push({ at: review.sentAt!, kind: 'review_requested', text: '⭐ Google' });
    }
    return items.sort((a, b) => b.at.localeCompare(a.at));
  }, [leads, jobs, s, t, locale]);

  const icon = { lead_received: <InboxIcon className="h-3.5 w-3.5" />, conversation: <MessageIcon className="h-3.5 w-3.5" />, quote: <WalletIcon className="h-3.5 w-3.5" />, booking: <BriefcaseIcon className="h-3.5 w-3.5" />, job_completed: <CheckCircleIcon className="h-3.5 w-3.5" />, review_requested: <StarIcon className="h-3.5 w-3.5" /> };
  const tone = { lead_received: 'bg-lc-primary-soft text-lc-primary', conversation: 'bg-slate-100 text-slate-600', quote: 'bg-lc-info-soft text-lc-info', booking: 'bg-violet-50 text-lc-violet', job_completed: 'bg-lc-success-soft text-lc-success', review_requested: 'bg-lc-warning-soft text-lc-warning' };

  return (
    <Card className="lg:sticky lg:top-8 lg:self-start">
      <div className="flex items-start gap-3 border-b border-lc-border p-4">
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-lc-muted hover:bg-lc-bg lg:hidden"><ChevronLeftIcon className="h-5 w-5 rtl:rotate-180" /></button>
        <Avatar name={c.name} size="xl" />
        <div className="min-w-0 flex-1">
          <h2 className="flex items-center gap-2 text-lg font-bold text-lc-text">{c.name} <LangFlag lang={c.language} /></h2>
          <p className="lc-tnum text-sm text-lc-muted" dir="ltr">{c.phone}</p>
          <p className="mt-1 flex flex-wrap items-center gap-2 text-xs text-lc-muted">
            <span className="inline-flex items-center gap-1"><MapPinIcon className="h-3 w-3" />{c.addresses[0]?.street ? `${c.addresses[0].street}, ` : ''}{c.city}</span>
            <SourceLabel source={c.source} />
          </p>
        </div>
      </div>
      <div className="grid grid-cols-3 divide-x divide-lc-border border-b border-lc-border rtl:divide-x-reverse">
        <div className="p-3 text-center"><p className="lc-tnum text-xl font-bold text-lc-success">{formatMoney(c.lifetimeValue, locale)}</p><p className="text-[11px] text-lc-muted">{t('cust.ltv')}</p></div>
        <div className="p-3 text-center"><p className="lc-tnum text-xl font-bold text-lc-text">{jobs.filter((j) => j.status !== 'cancelled').length}</p><p className="text-[11px] text-lc-muted">{t('cust.jobs')}</p></div>
        <div className="p-3 text-center"><p className="lc-tnum text-xl font-bold text-lc-text">{leads.length}</p><p className="text-[11px] text-lc-muted">{t('common.leads')}</p></div>
      </div>
      <div className="space-y-4 p-4">
        <div className="grid grid-cols-2 gap-2">
          <Button variant="secondary" size="sm" href={`tel:${c.phone}`} icon={<PhoneIcon className="h-3.5 w-3.5" />}>{t('jobs.call')}</Button>
          <Button variant="secondary" size="sm" href={`https://wa.me/972${c.phone.replace(/\D/g, '').replace(/^0/, '')}`} icon={<WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" />}>WhatsApp</Button>
        </div>
        <div>
          <p className="mb-1 text-[13px] font-semibold text-lc-text">{t('common.notes')}</p>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== c.notes && run((snap) => updateCustomer(snap, { ...c, notes }))} className="min-h-[60px]" />
        </div>
        {photos.length > 0 && (
          <div className="grid grid-cols-4 gap-1.5">
            {photos.slice(0, 8).map((p, i) => <img key={i} src={p.url} alt="" className="aspect-square w-full rounded-lg object-cover" />)}
          </div>
        )}
        <div>
          <p className="mb-2 text-[13px] font-semibold text-lc-text">{t('cust.timeline')}</p>
          <ol className="relative space-y-3 border-s-2 border-lc-border ps-4">
            {timeline.map((it, i) => (
              <li key={i} className="relative">
                <span className={cx('absolute -start-[25px] top-0.5 grid h-5 w-5 place-items-center rounded-full ring-2 ring-white', tone[it.kind])}>{icon[it.kind]}</span>
                <p className="text-[13px] font-semibold text-lc-text">
                  {it.href ? <a href={it.href} className="hover:underline">{t(`tl.${it.kind}` as const)}</a> : t(`tl.${it.kind}` as const)}
                  {it.amount ? <span className="lc-tnum text-lc-success"> · {formatMoney(it.amount, locale)}</span> : null}
                </p>
                <p className="truncate text-xs text-lc-muted">{it.text}</p>
                <p className="text-[11px] text-lc-faint">{formatDateTime(it.at, locale)}</p>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </Card>
  );
}
