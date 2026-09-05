'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useEffect, useMemo, useRef, useState } from 'react';
import { Shell } from '@/components/lc/Shell';
import { ArrowRightIcon, BotIcon, BriefcaseIcon, CameraIcon, ChevronLeftIcon, HandIcon, InboxIcon, MapPinIcon, PhoneIcon, SearchIcon, SendIcon, UserIcon, WhatsAppIcon, XCircleIcon } from '@/components/lc/icons';
import { QuoteCard } from '@/components/lc/inbox/QuoteCard';
import { ConversationStatusPill, LangFlag, SourceLabel } from '@/components/lc/shared/StatusPill';
import { Input, Select } from '@/components/lc/ui/forms';
import { Modal } from '@/components/lc/ui/overlay';
import { Avatar, Badge, Button, EmptyState, cx } from '@/components/lc/ui/primitives';
import { useToast } from '@/components/lc/ui/toast';
import { useLc } from '@/lib/lc/context';
import { formatDate, formatDateTime, formatMoney, formatTime, timeAgo } from '@/lib/lc/format';
import { customerMessage, markLost, markRead, ownerMessage, setTakeover } from '@/lib/lc/ops';
import type { Conversation, LostReason, Message } from '@/lib/lc/types';
import { pick, sameDay } from '@/lib/lc/util';

type Filter = 'all' | 'unread' | 'human';

export default function InboxPage() {
  return (
    <Suspense fallback={null}>
      <Inbox />
    </Suspense>
  );
}

function Inbox() {
  const { s, t, locale, run } = useLc();
  const params = useSearchParams();
  const router = useRouter();
  const toast = useToast();
  const selectedId = params.get('c');
  const [q, setQ] = useState('');
  const [filter, setFilter] = useState<Filter>('all');
  const [typing, setTyping] = useState(false);
  const [draft, setDraft] = useState('');
  const [customerDraft, setCustomerDraft] = useState('');
  const [lostOpen, setLostOpen] = useState(false);
  const [lostReason, setLostReason] = useState<LostReason>('no_response');
  const [now] = useState(() => new Date());
  const listRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const conversations = useMemo(() => {
    if (!s) return [];
    const custs = new Map(s.customers.map((c) => [c.id, c]));
    return [...s.conversations]
      .filter((c) => c.channel !== 'manual' || c.lastMessageText)
      .filter((c) => (filter === 'unread' ? c.unreadCount > 0 || c.status === 'new' : filter === 'human' ? c.status === 'human' : true))
      .filter((c) => {
        if (!q.trim()) return true;
        const cust = custs.get(c.customerId);
        const needle = q.trim().toLowerCase();
        return Boolean(cust && (cust.name.toLowerCase().includes(needle) || cust.phone.includes(needle) || c.lastMessageText.toLowerCase().includes(needle)));
      })
      .sort((a, b) => b.lastMessageAt.localeCompare(a.lastMessageAt))
      .slice(0, 120);
  }, [s, filter, q]);

  const conv = s?.conversations.find((c) => c.id === selectedId) ?? null;
  const customer = conv ? s?.customers.find((c) => c.id === conv.customerId) : null;
  const lead = conv ? s?.leads.find((l) => l.id === conv.leadId) : null;
  const messages = useMemo(() => (conv && s ? s.messages.filter((m) => m.conversationId === conv.id).sort((a, b) => a.createdAt.localeCompare(b.createdAt)) : []), [conv, s]);
  const quote = lead?.quoteId ? s?.quotes.find((x) => x.id === lead.quoteId) : undefined;
  const job = lead ? s?.jobs.find((j) => j.leadId === lead.id) : undefined;
  const worker = job?.workerId ? s?.workers.find((w) => w.id === job.workerId) : undefined;

  useEffect(() => {
    if (conv && conv.unreadCount > 0) run((snap) => markRead(snap, conv.id));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [conv?.id]);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ block: 'end' });
  }, [messages.length, typing, conv?.id]);

  const select = (id: string) => router.replace(`/lc/inbox?c=${id}`);

  function sendOwner() {
    if (!conv || !draft.trim()) return;
    run((snap) => ownerMessage(snap, conv.id, draft.trim()));
    setDraft('');
  }

  function sendCustomer(text: string, photo?: boolean) {
    if (!conv || (!text.trim() && !photo)) return;
    const attachments = photo ? [{ type: 'image' as const, url: `/lc/photos/item-${1 + Math.floor(Math.random() * 6)}.svg` }] : [];
    setCustomerDraft('');
    if (conv.aiPaused) {
      run((snap) => customerMessage(snap, conv.id, text.trim(), attachments));
      return;
    }
    // Show the customer's message immediately, then the agent "types" for a moment.
    setTyping(true);
    setTimeout(() => {
      run((snap) => customerMessage(snap, conv.id, text.trim(), attachments));
      setTyping(false);
    }, 700 + Math.random() * 600);
  }

  const canSimulate = Boolean(s?.organization.demo);

  return (
    <Shell title={t('inbox.title')} flush>
      <div className="flex h-[calc(100dvh-3.5rem-4.25rem-env(safe-area-inset-bottom))] lg:h-dvh">
        {/* List */}
        <aside className={cx('flex w-full flex-col border-e border-lc-border bg-white lg:w-[360px] lg:shrink-0', conv && 'hidden lg:flex')}>
          <div className="border-b border-lc-border p-3">
            <div className="relative">
              <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lc-faint" />
              <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} className="ps-9" />
            </div>
            <div className="mt-2.5 flex gap-1.5">
              {(['all', 'unread', 'human'] as Filter[]).map((f) => (
                <button key={f} type="button" aria-pressed={filter === f} onClick={() => setFilter(f)} className={cx('rounded-full px-3 py-1 text-xs font-semibold transition-colors', filter === f ? 'bg-lc-text text-white' : 'bg-lc-bg text-lc-muted hover:text-lc-text')}>
                  {t(`inbox.filter.${f}` as const)}
                </button>
              ))}
            </div>
          </div>
          <div ref={listRef} className="lc-scroll flex-1 overflow-y-auto">
            {conversations.length === 0 ? (
              <EmptyState icon={<InboxIcon />} title={t('inbox.emptyList')} />
            ) : (
              <ul>
                {conversations.map((c) => (
                  <ConversationRow key={c.id} c={c} active={c.id === selectedId} onSelect={() => select(c.id)} now={now} />
                ))}
              </ul>
            )}
          </div>
        </aside>

        {/* Conversation */}
        {!conv || !customer || !lead ? (
          <div className="hidden flex-1 lg:flex">
            <EmptyState icon={<InboxIcon />} title={t('inbox.empty')} className="m-auto" />
          </div>
        ) : (
          <section className="flex min-w-0 flex-1 flex-col bg-lc-bg">
            <header className="flex items-center gap-3 border-b border-lc-border bg-white px-3 py-2.5 sm:px-5">
              <button type="button" onClick={() => router.replace('/lc/inbox')} className="grid h-9 w-9 place-items-center rounded-lg text-lc-muted hover:bg-lc-bg lg:hidden" aria-label={t('common.back')}>
                <ChevronLeftIcon className="h-5 w-5 rtl:rotate-180" />
              </button>
              <Avatar name={customer.name} size="lg" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <h2 className="truncate text-[15px] font-bold text-lc-text">{customer.name}</h2>
                  <LangFlag lang={conv.language} />
                  <ConversationStatusPill status={conv.status} />
                </div>
                <p className="mt-0.5 flex items-center gap-2 text-xs text-lc-muted">
                  <span dir="ltr" className="lc-tnum">{customer.phone}</span>
                  {customer.city && <span>· {customer.city}</span>}
                  <span className="hidden sm:inline">· <SourceLabel source={lead.source} /></span>
                </p>
              </div>
              <div className="flex items-center gap-2">
                {conv.aiPaused ? (
                  <Button size="sm" variant="primary" icon={<BotIcon className="h-4 w-4" />} onClick={() => run((snap) => setTakeover(snap, conv.id, false))}>
                    <span className="hidden sm:inline">{t('inbox.returnToAi')}</span>
                  </Button>
                ) : (
                  <Button size="sm" variant="dark" icon={<HandIcon className="h-4 w-4" />} onClick={() => run((snap) => setTakeover(snap, conv.id, true))}>
                    <span className="hidden sm:inline">{t('inbox.takeOver')}</span>
                  </Button>
                )}
              </div>
            </header>

            <div className={cx('flex items-center justify-center gap-2 px-4 py-1.5 text-[12px] font-medium', conv.aiPaused ? 'bg-lc-pink-soft text-lc-pink' : 'bg-lc-primary-soft text-lc-primary')}>
              {conv.aiPaused ? <HandIcon className="h-3.5 w-3.5" /> : <BotIcon className="h-3.5 w-3.5" />}
              {conv.aiPaused ? t('inbox.humanActive') : t('inbox.aiActive')}
            </div>

            <div className="lc-scroll flex-1 overflow-y-auto px-3 py-4 sm:px-6">
              <div className="mx-auto max-w-3xl space-y-1.5">
                {messages.map((m, i) => (
                  <MessageBubble key={m.id} m={m} prev={messages[i - 1]} customerName={customer.name} agentName={s!.settings.agentName} />
                ))}
                {typing && (
                  <div className="flex justify-end">
                    <div className="lc-bubble-ai inline-flex items-center gap-1 rounded-2xl px-4 py-3">
                      <span className="lc-typing-dot h-1.5 w-1.5 rounded-full bg-white" />
                      <span className="lc-typing-dot h-1.5 w-1.5 rounded-full bg-white" />
                      <span className="lc-typing-dot h-1.5 w-1.5 rounded-full bg-white" />
                    </div>
                  </div>
                )}
                <div ref={bottomRef} />
              </div>
            </div>

            <footer className="border-t border-lc-border bg-white p-3 sm:px-5">
              <div className="mx-auto max-w-3xl space-y-2">
                <form
                  className="flex items-center gap-2"
                  onSubmit={(e) => {
                    e.preventDefault();
                    sendOwner();
                  }}
                >
                  <Avatar name={s!.members[0]?.fullName ?? 'Owner'} size="sm" color="bg-lc-text text-white" />
                  <Input value={draft} onChange={(e) => setDraft(e.target.value)} placeholder={t('inbox.typeMessage')} className="flex-1 rounded-full" />
                  <Button type="submit" size="icon" variant="dark" disabled={!draft.trim()} aria-label={t('inbox.send')}>
                    <SendIcon className="h-4 w-4 rtl:-scale-x-100" />
                  </Button>
                </form>
                {canSimulate && (
                  <form
                    className="flex items-center gap-2 rounded-2xl border border-dashed border-lc-border-strong bg-lc-bg p-1.5 ps-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      sendCustomer(customerDraft);
                    }}
                  >
                    <UserIcon className="h-4 w-4 shrink-0 text-lc-faint" />
                    <input value={customerDraft} onChange={(e) => setCustomerDraft(e.target.value)} placeholder={t('inbox.simulateCustomer')} className="h-8 flex-1 bg-transparent text-sm text-lc-text placeholder:text-lc-faint focus:outline-none" />
                    <button type="button" onClick={() => sendCustomer(customerDraft, true)} className="grid h-8 w-8 place-items-center rounded-lg text-lc-muted hover:bg-white hover:text-lc-text" title={t('inbox.attachPhoto')}>
                      <CameraIcon className="h-4 w-4" />
                    </button>
                    <Button type="submit" size="sm" variant="secondary" disabled={!customerDraft.trim()}>{t('inbox.send')}</Button>
                  </form>
                )}
              </div>
            </footer>
          </section>
        )}

        {/* Side panel */}
        {conv && customer && lead && (
          <aside className="lc-scroll hidden w-[300px] shrink-0 overflow-y-auto border-s border-lc-border bg-white p-4 xl:block">
            <h3 className="text-xs font-bold uppercase tracking-wider text-lc-faint">{t('inbox.leadDetails')}</h3>
            <div className="mt-3 space-y-2 text-[13px]">
              <Row label={t('common.source')}><SourceLabel source={lead.source} /></Row>
              <Row label={t('common.language')}><span className="inline-flex items-center gap-1"><LangFlag lang={conv.language} /> {conv.language.toUpperCase()}</span></Row>
              <Row label={t('common.date')}>{formatDateTime(lead.createdAt, locale)}</Row>
              <Row label={t('common.status')}><ConversationStatusPill status={conv.status} /></Row>
              {conv.followUpStage > 0 && <Row label={t('auto.followups')}><Badge tone="warning" size="sm">{conv.followUpStage}/3</Badge></Row>}
            </div>

            <h3 className="mt-6 text-xs font-bold uppercase tracking-wider text-lc-faint">{t('inbox.collected')}</h3>
            <ul className="mt-3 space-y-1.5 text-[13px]">
              <Known ok={lead.qualification.items.length > 0} label={t('common.service')} value={lead.qualification.items.map((i) => `${pick(s!.services.find((x) => x.id === i.serviceId)?.name, locale)}${i.quantity > 1 ? ` ×${i.quantity}` : ''}`).join(', ')} />
              <Known ok={Boolean(lead.qualification.city || customer.city)} label={t('common.city')} value={lead.qualification.city || customer.city} />
              <Known ok={Boolean(lead.qualification.address || customer.addresses[0]?.street)} label={t('common.address')} value={lead.qualification.address || customer.addresses[0]?.street} />
              <Known ok={Boolean(lead.qualification.condition)} label={{ he: 'מצב/כתמים', ru: 'Состояние/пятна', en: 'Condition' }[locale]} value={lead.qualification.condition} />
              <Known ok={lead.qualification.photos.length > 0} label={t('common.photos')} value={lead.qualification.photos.length ? String(lead.qualification.photos.length) : undefined} />
              <Known ok={Boolean(lead.qualification.preferredDate)} label={t('common.date')} value={lead.qualification.preferredDate ? formatDate(lead.qualification.preferredDate, locale, 'weekday') : undefined} />
            </ul>
            {lead.qualification.photos.length > 0 && (
              <div className="mt-3 grid grid-cols-3 gap-1.5">
                {lead.qualification.photos.slice(0, 6).map((p, i) => (
                  <img key={i} src={p} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />
                ))}
              </div>
            )}

            {quote && <QuoteCard quote={quote} className="mt-6" />}

            {job && (
              <div className="mt-4 rounded-xl border border-lc-success/30 bg-lc-success-soft p-3.5 text-[13px]">
                <div className="flex items-center justify-between">
                  <span className="font-semibold text-lc-success">{t('inbox.booking')}</span>
                  <span className="lc-tnum font-bold text-lc-text">{formatMoney(job.price, locale)}</span>
                </div>
                <p className="mt-1 font-semibold text-lc-text">{formatDateTime(job.scheduledAt, locale)}</p>
                <p className="text-lc-muted">{job.serviceSummary}</p>
                {worker && <p className="mt-1 text-lc-muted">{t('common.worker')}: {worker.name}</p>}
                <Link href={`/lc/jobs?j=${job.id}`} className="mt-2 inline-flex items-center gap-1 text-xs font-semibold text-lc-primary hover:underline">
                  {t('inbox.openJob')} <ArrowRightIcon className="h-3 w-3 rtl:rotate-180" />
                </Link>
              </div>
            )}

            <div className="mt-6 grid grid-cols-2 gap-2">
              <Button variant="secondary" size="sm" href={`tel:${customer.phone}`} icon={<PhoneIcon className="h-3.5 w-3.5" />}>{t('jobs.call')}</Button>
              <Button variant="secondary" size="sm" href={`https://wa.me/972${customer.phone.replace(/\D/g, '').replace(/^0/, '')}`} icon={<WhatsAppIcon className="h-3.5 w-3.5 text-[#25D366]" />}>WhatsApp</Button>
              <Button variant="secondary" size="sm" href={`/lc/customers?id=${customer.id}`} icon={<UserIcon className="h-3.5 w-3.5" />}>{t('nav.customers')}</Button>
              {lead.status !== 'lost' && lead.status !== 'booked' && (
                <Button variant="danger" size="sm" onClick={() => setLostOpen(true)} icon={<XCircleIcon className="h-3.5 w-3.5" />}>{t('inbox.markLost')}</Button>
              )}
            </div>
          </aside>
        )}
      </div>

      <Modal
        open={lostOpen}
        onClose={() => setLostOpen(false)}
        title={t('inbox.markLost')}
        footer={
          <>
            <Button variant="ghost" onClick={() => setLostOpen(false)}>{t('common.cancel')}</Button>
            <Button
              variant="danger"
              onClick={() => {
                if (lead) run((snap) => markLost(snap, lead.id, lostReason));
                setLostOpen(false);
                toast.info(t('inbox.markLost'));
              }}
            >
              {t('common.confirm')}
            </Button>
          </>
        }
      >
        <Select value={lostReason} onChange={(e) => setLostReason(e.target.value as LostReason)}>
          {(['no_response', 'price', 'competitor', 'timing', 'not_relevant', 'other'] as LostReason[]).map((r) => (
            <option key={r} value={r}>{t(`lost.${r}` as const)}</option>
          ))}
        </Select>
      </Modal>
    </Shell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between gap-3">
      <span className="text-lc-muted">{label}</span>
      <span className="text-end font-medium text-lc-text">{children}</span>
    </div>
  );
}

function Known({ ok, label, value }: { ok: boolean; label: string; value?: string }) {
  return (
    <li className="flex items-start gap-2">
      <span className={cx('mt-1 h-2 w-2 shrink-0 rounded-full', ok ? 'bg-lc-success' : 'bg-slate-200')} />
      <span className="min-w-0 flex-1">
        <span className="text-lc-muted">{label}</span>
        {ok && value && <span className="block truncate font-medium text-lc-text">{value}</span>}
      </span>
    </li>
  );
}

function ConversationRow({ c, active, onSelect, now }: { c: Conversation; active: boolean; onSelect: () => void; now: Date }) {
  const { s, locale } = useLc();
  const cust = s?.customers.find((x) => x.id === c.customerId);
  const unread = c.unreadCount > 0 || c.status === 'new';
  return (
    <li>
      <button type="button" onClick={onSelect} className={cx('relative flex w-full items-start gap-3 border-b border-lc-border px-3 py-3 text-start transition-colors hover:bg-lc-bg', active && 'bg-lc-primary-soft/60 hover:bg-lc-primary-soft/60')}>
        {active && <span className="absolute inset-y-2 start-0 w-1 rounded-full bg-lc-primary" />}
        <div className="relative">
          <Avatar name={cust?.name ?? '?'} size="lg" />
          <span className="absolute -bottom-0.5 -end-0.5 grid h-4.5 w-4.5 place-items-center rounded-full bg-white text-[10px] shadow-sm"><LangFlag lang={c.language} /></span>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center justify-between gap-2">
            <span className={cx('truncate text-sm', unread ? 'font-bold text-lc-text' : 'font-semibold text-lc-text')}>{cust?.name}</span>
            <span className="lc-tnum shrink-0 text-[11px] text-lc-faint">{timeAgo(c.lastMessageAt, locale, now)}</span>
          </div>
          <p className={cx('mt-0.5 truncate text-[13px]', unread ? 'font-medium text-lc-text' : 'text-lc-muted')}>{c.lastMessageText || '📷'}</p>
          <div className="mt-1.5 flex items-center justify-between gap-2">
            <ConversationStatusPill status={c.status} />
            {unread && <span className="lc-live h-2.5 w-2.5 rounded-full bg-lc-primary" />}
          </div>
        </div>
      </button>
    </li>
  );
}

function MessageBubble({ m, prev, customerName, agentName }: { m: Message; prev?: Message; customerName: string; agentName: string }) {
  const { locale, t } = useLc();
  const showDate = !prev || !sameDay(prev.createdAt, m.createdAt);
  if (m.sender === 'system') {
    return (
      <>
        {showDate && <DateSep iso={m.createdAt} />}
        <div className="flex justify-center py-1"><span className="rounded-full bg-lc-bg px-3 py-1 text-[11px] font-medium text-lc-muted">{m.text}</span></div>
      </>
    );
  }
  const mine = m.sender !== 'customer';
  const bubble = m.sender === 'customer' ? 'lc-bubble-customer text-lc-text' : m.sender === 'ai' ? 'lc-bubble-ai' : 'lc-bubble-owner';
  const isAuto = m.meta.kind === 'followup' || (m.meta.kind === 'note' && m.meta.automationKey);
  return (
    <>
      {showDate && <DateSep iso={m.createdAt} />}
      <div className={cx('flex flex-col', mine ? 'items-end' : 'items-start')}>
        {(!prev || prev.sender !== m.sender) && (
          <span className="mb-1 flex items-center gap-1 px-1 text-[11px] font-semibold text-lc-faint">
            {m.sender === 'ai' && <BotIcon className="h-3 w-3" />}
            {m.sender === 'customer' ? customerName : m.sender === 'ai' ? agentName : t('common.human')}
          </span>
        )}
        <div className={cx('max-w-[85%] rounded-2xl px-3.5 py-2.5 text-[14px] leading-relaxed shadow-[0_1px_2px_rgba(15,23,42,0.06)] sm:max-w-[70%]', bubble)}>
          {m.attachments.length > 0 && (
            <div className={cx('grid gap-1.5', m.attachments.length > 1 ? 'grid-cols-2' : 'grid-cols-1', m.text && 'mb-2')}>
              {m.attachments.map((a, i) => (
                <figure key={i}>
                  <img src={a.url} alt="" className="w-56 max-w-full rounded-xl object-cover" />
                  {a.analysis && <figcaption className={cx('mt-1 flex items-center gap-1 text-[11px]', mine ? 'text-white/80' : 'text-lc-muted')}><CameraIcon className="h-3 w-3" /> {t('inbox.photoAnalysis')}: {a.analysis.label}</figcaption>}
                </figure>
              ))}
            </div>
          )}
          {m.text && <p className="whitespace-pre-line">{m.text}</p>}
          <div className={cx('mt-1 flex items-center justify-end gap-1.5 text-[10px]', mine ? 'text-white/65' : 'text-lc-faint')}>
            {isAuto && <span className="rounded bg-white/20 px-1 font-semibold">{m.meta.kind === 'followup' ? t('auto.followups') : t('nav.automations')}</span>}
            {m.meta.kind === 'quote' && <span className="rounded bg-white/20 px-1 font-semibold">{t('inbox.quote')}</span>}
            {m.meta.kind === 'booking' && <span className="rounded bg-white/20 px-1 font-semibold">✓ {t('inbox.booking')}</span>}
            <span className="lc-tnum">{formatTime(m.createdAt, locale)}</span>
          </div>
        </div>
      </div>
    </>
  );
}

function DateSep({ iso }: { iso: string }) {
  const { locale } = useLc();
  return (
    <div className="flex items-center gap-3 py-3 text-[11px] font-semibold uppercase tracking-wider text-lc-faint">
      <span className="h-px flex-1 bg-lc-border" />
      {formatDate(iso, locale, 'weekday')}
      <span className="h-px flex-1 bg-lc-border" />
    </div>
  );
}

export { BriefcaseIcon, MapPinIcon };
