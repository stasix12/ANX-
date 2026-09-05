'use client';

import Link from 'next/link';
import { useMemo, useState } from 'react';
import { Shell } from '@/components/lc/Shell';
import { AreaChart, Funnel, HBarList, SOURCE_COLORS } from '@/components/lc/charts';
import { ArrowRightIcon, BotIcon, BriefcaseIcon, CheckCircleIcon, ClockIcon, InboxIcon, RepeatIcon, SparklesIcon, TargetIcon, TrendingUpIcon, UsersIcon, WalletIcon, XCircleIcon, ZapIcon } from '@/components/lc/icons';
import { ConversationStatusPill, JobStatusPill, LangFlag, SourceIcon } from '@/components/lc/shared/StatusPill';
import { Avatar, Badge, Button, Card, CardHeader, Delta, EmptyState, Segmented, Stat, cx } from '@/components/lc/ui/primitives';
import { aiGeneratedRevenue, conversationsNeedingAttention, funnel, lastMonthStats, monthStats, periodStats, recoveredStats, revenueSeries, sourceStats, todayStats } from '@/lib/lc/analytics';
import { useLc } from '@/lib/lc/context';
import { formatDate, formatMoney, formatPercent, formatTime, timeAgo } from '@/lib/lc/format';
import { sourceKey } from '@/lib/lc/i18n';
import { addDays, endOfDay, pct, startOfMonth } from '@/lib/lc/util';

type Period = '30d' | 'month';

function greeting(hour: number): 'dash.greeting.morning' | 'dash.greeting.day' | 'dash.greeting.evening' {
  if (hour < 12) return 'dash.greeting.morning';
  if (hour < 18) return 'dash.greeting.day';
  return 'dash.greeting.evening';
}

export default function DashboardPage() {
  const { s, t, locale } = useLc();
  const [period, setPeriod] = useState<Period>('30d');
  const now = useMemo(() => new Date(), []);

  const data = useMemo(() => {
    if (!s) return null;
    const from = period === '30d' ? addDays(now, -30) : startOfMonth(now);
    const to = endOfDay(now);
    const prevFrom = period === '30d' ? addDays(now, -60) : new Date(now.getFullYear(), now.getMonth() - 1, 1);
    const prevTo = period === '30d' ? addDays(now, -30) : new Date(now.getFullYear(), now.getMonth(), 0, 23, 59, 59);
    const cur = period === '30d' ? periodStats(s, from, to) : monthStats(s, now);
    const prev = period === '30d' ? periodStats(s, prevFrom, prevTo) : lastMonthStats(s, now);
    const ai = aiGeneratedRevenue(s, from, to);
    const aiPrev = aiGeneratedRevenue(s, prevFrom, prevTo);
    return {
      today: todayStats(s, now),
      cur,
      prev,
      ai,
      aiDelta: aiPrev.total ? pct(ai.total - aiPrev.total, aiPrev.total) : null,
      funnel: funnel(s, from, to),
      sources: sourceStats(s, from, to),
      recovered: recoveredStats(s, from, to),
      series: revenueSeries(s, 30, now),
      attention: conversationsNeedingAttention(s).slice(0, 6),
      upcoming: s.jobs.filter((j) => j.status !== 'completed' && j.status !== 'cancelled' && new Date(j.scheduledAt) >= addDays(now, -0.2)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).slice(0, 5),
      feed: s.activityLogs.slice(0, 8),
    };
  }, [s, period, now]);

  const delta = (a: number, b: number) => (b ? pct(a - b, b) : null);

  return (
    <Shell title={t('dash.title')}>
      {s && data && (
        <>
          <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
            <div>
              <p className="text-sm font-medium text-lc-muted">{formatDate(now, locale, 'long')}</p>
              <h1 className="mt-0.5 text-2xl font-bold tracking-tight text-lc-text sm:text-[28px]">
                {t(greeting(now.getHours()))}, {s.members[0]?.fullName.split(' ')[0] ?? ''} 👋
              </h1>
            </div>
            <Segmented value={period} onChange={setPeriod} options={[{ value: '30d', label: `30 ${t('common.days')}` }, { value: 'month', label: t('common.thisMonth') }]} />
          </div>

          {/* Money hero + today */}
          <div className="grid gap-4 lg:grid-cols-[1.15fr_1fr]">
            <Card className="lc-hero relative overflow-hidden border-0 p-6 sm:p-7">
              <div className="lc-hero-grid absolute inset-0" />
              <div className="relative flex h-full flex-col justify-between gap-6">
                <div className="flex items-start justify-between gap-3">
                  <div>
                    <p className="flex items-center gap-2 text-sm font-medium text-white/80">
                      <SparklesIcon className="h-4 w-4" /> {t('dash.moneyTitle')}
                    </p>
                    <p className="lc-tnum mt-3 text-[44px] font-bold leading-none tracking-tight sm:text-[52px]">{formatMoney(data.ai.total, locale)}</p>
                    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-white/85">
                      {data.aiDelta !== null && (
                        <span className={cx('lc-tnum inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-bold', data.aiDelta >= 0 ? 'bg-emerald-400/25 text-emerald-100' : 'bg-red-400/25 text-red-100')}>
                          {data.aiDelta >= 0 ? '▲' : '▼'} {Math.abs(data.aiDelta).toLocaleString(undefined, { maximumFractionDigits: 0 })}%
                        </span>
                      )}
                      <span>{t('common.vsLastMonth')}</span>
                    </div>
                  </div>
                  <span className="grid h-12 w-12 shrink-0 place-items-center rounded-2xl bg-white/15 backdrop-blur"><WalletIcon className="h-6 w-6" /></span>
                </div>
                <div className="grid grid-cols-3 gap-3">
                  <div className="rounded-xl bg-white/10 p-3 backdrop-blur">
                    <p className="lc-tnum text-xl font-bold">{data.ai.jobs}</p>
                    <p className="text-[11px] text-white/70">{t('dash.bookedJobs')}</p>
                  </div>
                  <div className="rounded-xl bg-white/10 p-3 backdrop-blur">
                    <p className="lc-tnum text-xl font-bold">{formatPercent(data.ai.share, locale)}</p>
                    <p className="text-[11px] text-white/70">{t('dash.aiBookedShare')}</p>
                  </div>
                  <div className="rounded-xl bg-white/10 p-3 backdrop-blur">
                    <p className="lc-tnum text-xl font-bold">{formatMoney(data.cur.avgJob, locale)}</p>
                    <p className="text-[11px] text-white/70">{t('dash.avgJob')}</p>
                  </div>
                </div>
              </div>
            </Card>

            <div>
              <div className="mb-3 flex items-center gap-2">
                <span className="lc-live h-2 w-2 rounded-full bg-lc-success" />
                <h2 className="text-sm font-bold uppercase tracking-wider text-lc-muted">{t('dash.today')}</h2>
              </div>
              <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
                <Stat label={t('dash.newLeads')} value={data.today.leads} icon={<InboxIcon />} tone="primary" />
                <Stat label={t('dash.aiConversations')} value={data.today.aiConversations} icon={<BotIcon />} tone="violet" />
                <Stat label={t('dash.bookedJobs')} value={data.today.booked} icon={<CheckCircleIcon />} tone="success" />
                <Stat label={t('dash.revenueBooked')} value={formatMoney(data.today.revenue, locale)} icon={<WalletIcon />} tone="success" />
                <Stat label={t('dash.conversionRate')} value={formatPercent(data.today.conversion, locale)} icon={<TargetIcon />} tone="info" className="col-span-2 sm:col-span-1" />
              </div>
            </div>
          </div>

          {/* Period KPIs */}
          <div className="mt-6">
            <h2 className="mb-3 text-sm font-bold uppercase tracking-wider text-lc-muted">{period === '30d' ? `30 ${t('common.days')}` : t('common.thisMonth')}</h2>
            <div className="grid grid-cols-2 gap-3 md:grid-cols-3 xl:grid-cols-6">
              <Stat label={t('dash.totalLeads')} value={data.cur.leads} delta={delta(data.cur.leads, data.prev.leads)} icon={<UsersIcon />} />
              <Stat label={t('dash.bookedJobs')} value={data.cur.booked} delta={delta(data.cur.booked, data.prev.booked)} icon={<BriefcaseIcon />} tone="success" />
              <Stat label={t('dash.lostLeads')} value={data.cur.lost} delta={delta(data.cur.lost, data.prev.lost) === null ? null : -(delta(data.cur.lost, data.prev.lost) ?? 0)} icon={<XCircleIcon />} tone="warning" />
              <Stat label={t('common.revenue')} value={formatMoney(data.cur.revenue, locale)} delta={delta(data.cur.revenue, data.prev.revenue)} icon={<WalletIcon />} tone="success" />
              <Stat label={t('dash.avgJob')} value={formatMoney(data.cur.avgJob, locale)} delta={delta(data.cur.avgJob, data.prev.avgJob)} icon={<TrendingUpIcon />} tone="violet" />
              <Stat label={t('dash.leadToBooking')} value={formatPercent(data.cur.conversion, locale)} delta={delta(data.cur.conversion, data.prev.conversion)} icon={<TargetIcon />} tone="info" />
            </div>
          </div>

          {/* Revenue chart + funnel + sources */}
          <div className="mt-6 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title={t('dash.revenueTrend')} subtitle={`${formatMoney(data.series.reduce((a, b) => a + b.revenue, 0), locale)} · ${data.series.reduce((a, b) => a + b.jobs, 0)} ${t('common.bookings').toLowerCase()}`} />
              <div className="px-3 pb-4 pt-2 sm:px-5">
                <AreaChart data={data.series.map((d) => ({ label: d.date, value: d.revenue }))} height={220} formatValue={(v) => formatMoney(v, locale)} formatLabel={(l) => formatDate(l, locale, 'short')} />
              </div>
            </Card>
            <Card>
              <CardHeader title={t('dash.funnel')} subtitle={`${formatPercent(pct(data.funnel.bookings, data.funnel.leads), locale)} ${t('dash.leadToBooking').toLowerCase()}`} />
              <div className="px-5 pb-5 pt-3">
                <Funnel steps={[{ label: t('dash.funnel.leads'), value: data.funnel.leads }, { label: t('dash.funnel.qualified'), value: data.funnel.qualified }, { label: t('dash.funnel.quotes'), value: data.funnel.quotes }, { label: t('dash.funnel.bookings'), value: data.funnel.bookings }]} className="space-y-1" />
              </div>
            </Card>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card>
              <CardHeader title={t('dash.sources')} action={<Link href="/lc/analytics" className="text-xs font-semibold text-lc-primary hover:underline">{t('common.viewAll')}</Link>} />
              <div className="px-5 pb-4 pt-1">
                <HBarList rows={data.sources.map((x) => ({ key: x.source, label: <span className="inline-flex items-center gap-1.5"><SourceIcon source={x.source} className="h-3.5 w-3.5" />{t(sourceKey(x.source))}</span>, value: x.leads, color: SOURCE_COLORS[x.source], meta: `${x.bookings} · ${formatPercent(x.conversion, locale)}` }))} />
              </div>
            </Card>

            <Card className="relative overflow-hidden">
              <div className="absolute -end-10 -top-10 h-40 w-40 rounded-full bg-lc-success-soft" />
              <div className="relative p-5">
                <span className="grid h-10 w-10 place-items-center rounded-xl bg-lc-success-soft text-lc-success"><RepeatIcon className="h-5 w-5" /></span>
                <p className="lc-tnum mt-4 text-3xl font-bold tracking-tight text-lc-text">{formatMoney(data.recovered.revenue, locale)}</p>
                <p className="mt-1 text-sm font-semibold text-lc-text">{t('dash.recovered')}</p>
                <p className="mt-1 text-[13px] text-lc-muted">{t('dash.recoveredSub')}</p>
                <div className="mt-4 flex gap-4 text-[13px]">
                  <span><b className="lc-tnum text-lc-text">{data.recovered.leads}</b> <span className="text-lc-muted">{t('auto.leadsRecovered').toLowerCase()}</span></span>
                  <span><b className="lc-tnum text-lc-text">{data.recovered.bookings}</b> <span className="text-lc-muted">{t('auto.bookingsRecovered').toLowerCase()}</span></span>
                </div>
                <Button href="/lc/automations" variant="secondary" size="sm" className="mt-4" icon={<ZapIcon className="h-3.5 w-3.5" />}>{t('nav.automations')}</Button>
              </div>
            </Card>

            <Card>
              <CardHeader title={t('dash.needsYou')} action={<Link href="/lc/inbox" className="text-xs font-semibold text-lc-primary hover:underline">{t('common.viewAll')}</Link>} />
              {data.attention.length === 0 ? (
                <EmptyState icon={<CheckCircleIcon />} title={t('common.done')} className="py-8" />
              ) : (
                <ul className="divide-y divide-lc-border px-2 pb-2 pt-2">
                  {data.attention.map((c) => {
                    const cust = s.customers.find((x) => x.id === c.customerId);
                    return (
                      <li key={c.id}>
                        <Link href={`/lc/inbox?c=${c.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-lc-bg">
                          <Avatar name={cust?.name ?? '?'} size="md" />
                          <span className="min-w-0 flex-1">
                            <span className="flex items-center gap-1.5 text-sm font-semibold text-lc-text"><LangFlag lang={c.language} />{cust?.name}</span>
                            <span className="block truncate text-xs text-lc-muted">{c.lastMessageText}</span>
                          </span>
                          <span className="flex flex-col items-end gap-1">
                            <ConversationStatusPill status={c.status} />
                            <span className="text-[11px] text-lc-faint">{timeAgo(c.lastMessageAt, locale, now)}</span>
                          </span>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
          </div>

          {/* Upcoming + feed */}
          <div className="mt-4 grid gap-4 lg:grid-cols-3">
            <Card className="lg:col-span-2">
              <CardHeader title={t('dash.upcoming')} action={<Link href="/lc/jobs" className="text-xs font-semibold text-lc-primary hover:underline">{t('common.viewAll')}</Link>} />
              {data.upcoming.length === 0 ? (
                <EmptyState icon={<BriefcaseIcon />} title={t('cal.noJobs')} className="py-8" />
              ) : (
                <ul className="divide-y divide-lc-border px-2 pb-2 pt-2">
                  {data.upcoming.map((j) => {
                    const cust = s.customers.find((x) => x.id === j.customerId);
                    const worker = s.workers.find((w) => w.id === j.workerId);
                    return (
                      <li key={j.id}>
                        <Link href={`/lc/jobs?j=${j.id}`} className="flex items-center gap-3 rounded-xl px-3 py-2.5 transition-colors hover:bg-lc-bg">
                          <span className="grid w-14 shrink-0 place-items-center rounded-lg bg-lc-bg py-1.5 text-center">
                            <span className="text-[10px] font-semibold uppercase text-lc-faint">{formatDate(j.scheduledAt, locale, 'short')}</span>
                            <span className="lc-tnum text-sm font-bold text-lc-text">{formatTime(j.scheduledAt, locale)}</span>
                          </span>
                          <span className="min-w-0 flex-1">
                            <span className="block truncate text-sm font-semibold text-lc-text">{cust?.name} · <span className="font-medium text-lc-muted">{j.city}</span></span>
                            <span className="block truncate text-xs text-lc-muted">{j.serviceSummary}{worker ? ` · ${worker.name}` : ''}</span>
                          </span>
                          <span className="lc-tnum hidden text-sm font-bold text-lc-text sm:block">{formatMoney(j.price, locale)}</span>
                          <JobStatusPill status={j.status} />
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
            </Card>
            <Card>
              <CardHeader title={t('dash.liveFeed')} />
              <ul className="space-y-3 px-5 pb-5 pt-3">
                {data.feed.map((l) => {
                  const icon = l.action === 'booking_created' ? <CheckCircleIcon className="h-3.5 w-3.5" /> : l.action === 'quote_sent' ? <WalletIcon className="h-3.5 w-3.5" /> : l.action === 'job_completed' ? <BriefcaseIcon className="h-3.5 w-3.5" /> : l.action === 'lead_lost' ? <XCircleIcon className="h-3.5 w-3.5" /> : l.action === 'handoff' ? <UsersIcon className="h-3.5 w-3.5" /> : <InboxIcon className="h-3.5 w-3.5" />;
                  const tone = l.action === 'booking_created' || l.action === 'job_completed' ? 'bg-lc-success-soft text-lc-success' : l.action === 'lead_lost' ? 'bg-slate-100 text-slate-500' : l.action === 'quote_sent' ? 'bg-lc-info-soft text-lc-info' : 'bg-lc-primary-soft text-lc-primary';
                  const label = { lead_received: { he: 'ליד חדש', ru: 'Новый лид', en: 'New lead' }, quote_sent: { he: 'הצעת מחיר נשלחה', ru: 'Отправлено предложение', en: 'Quote sent' }, booking_created: { he: 'עבודה נקבעה', ru: 'Записана работа', en: 'Job booked' }, job_completed: { he: 'עבודה הושלמה', ru: 'Работа завершена', en: 'Job completed' }, lead_lost: { he: 'ליד אבד', ru: 'Лид потерян', en: 'Lead lost' }, handoff: { he: 'העברה לאדם', ru: 'Передано человеку', en: 'Handed to human' }, takeover: { he: 'לקחתם את השיחה', ru: 'Вы взяли диалог', en: 'You took over' }, return_to_ai: { he: 'הוחזר ל-AI', ru: 'Возвращено AI', en: 'Returned to AI' } }[l.action]?.[locale] ?? l.action;
                  const amount = typeof l.payload.total === 'number' ? l.payload.total : typeof l.payload.price === 'number' ? l.payload.price : null;
                  return (
                    <li key={l.id} className="flex items-start gap-3">
                      <span className={cx('mt-0.5 grid h-7 w-7 shrink-0 place-items-center rounded-lg', tone)}>{icon}</span>
                      <span className="min-w-0 flex-1">
                        <span className="block text-[13px] font-semibold text-lc-text">{label}{amount ? <span className="lc-tnum font-bold text-lc-success"> · {formatMoney(amount, locale)}</span> : ''}</span>
                        <span className="flex items-center gap-1 text-[11px] text-lc-faint"><ClockIcon className="h-3 w-3" />{timeAgo(l.createdAt, locale, now)}{typeof l.payload.customer === 'string' ? ` · ${l.payload.customer}` : ''}</span>
                      </span>
                    </li>
                  );
                })}
              </ul>
              <div className="px-5 pb-5">
                <Link href="/lc/inbox" className="inline-flex items-center gap-1 text-xs font-semibold text-lc-primary hover:underline">{t('nav.inbox')} <ArrowRightIcon className="h-3 w-3 rtl:rotate-180" /></Link>
              </div>
            </Card>
          </div>
          <div className="mt-6 flex items-center justify-center gap-2 text-xs text-lc-faint"><Badge tone="neutral" size="sm">{s.organization.demo ? t('common.demoBadge') : s.organization.name}</Badge> · LeadCloser AI</div>
        </>
      )}
    </Shell>
  );
}
