'use client';

import { useMemo, useState } from 'react';
import { Shell } from '@/components/lc/Shell';
import { ColumnChart, Donut, HBarList, SOURCE_COLORS } from '@/components/lc/charts';
import { BotIcon, HandIcon, TargetIcon, TrendingUpIcon, WalletIcon, ZapIcon } from '@/components/lc/icons';
import { SourceIcon } from '@/components/lc/shared/StatusPill';
import { Input } from '@/components/lc/ui/forms';
import { Avatar, Badge, Card, CardHeader, PageHeader, Segmented, Stat, cx } from '@/components/lc/ui/primitives';
import { aiVsHuman, bestTimes, cityStats, lostReasons, periodStats, servicePopularity, sourceStats, workerPerformance } from '@/lib/lc/analytics';
import { useLc } from '@/lib/lc/context';
import { formatMoney, formatPercent, weekdayShort } from '@/lib/lc/format';
import { sourceKey } from '@/lib/lc/i18n';
import { setAdSpend } from '@/lib/lc/ops';
import { addDays, pick } from '@/lib/lc/util';

type Range = '30' | '90';

export default function AnalyticsPage() {
  const { s, t, locale, run } = useLc();
  const [range, setRange] = useState<Range>('30');
  const now = useMemo(() => new Date(), []);
  const d = useMemo(() => {
    if (!s) return null;
    const from = addDays(now, -Number(range));
    return { stats: periodStats(s, from, now), sources: sourceStats(s, from, now), ai: aiVsHuman(s, from, now), lost: lostReasons(s, from, now), workers: workerPerformance(s, from, now), services: servicePopularity(s, from, now), cities: cityStats(s, from, now), times: bestTimes(s, from, now) };
  }, [s, range, now]);

  return (
    <Shell title={t('an.title')} wide>
      {s && d && (
        <>
          <PageHeader title={t('an.title')} actions={<Segmented value={range} onChange={setRange} options={[{ value: '30', label: `30 ${t('common.days')}` }, { value: '90', label: `90 ${t('common.days')}` }]} />} />
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <Stat label={t('common.leads')} value={d.stats.leads} icon={<TargetIcon />} tone="primary" />
            <Stat label={t('common.conversion')} value={formatPercent(d.stats.conversion, locale)} icon={<TrendingUpIcon />} tone="info" />
            <Stat label={t('common.revenue')} value={formatMoney(d.stats.revenue, locale)} icon={<WalletIcon />} tone="success" />
            <Stat label={t('dash.avgJob')} value={formatMoney(d.stats.avgJob, locale)} icon={<WalletIcon />} tone="violet" />
          </div>

          {/* Sources table */}
          <Card className="mt-5 overflow-hidden">
            <CardHeader title={t('an.sources')} subtitle={t('an.roasHint')} />
            <div className="lc-scroll mt-3 overflow-x-auto">
              <table className="w-full min-w-[720px] text-sm">
                <thead className="bg-lc-bg text-[11px] font-bold uppercase tracking-wider text-lc-faint">
                  <tr>
                    <th className="px-5 py-2.5 text-start">{t('common.source')}</th>
                    <th className="px-4 py-2.5 text-end">{t('common.leads')}</th>
                    <th className="px-4 py-2.5 text-end">{t('common.bookings')}</th>
                    <th className="px-4 py-2.5 text-end">{t('common.conversion')}</th>
                    <th className="px-4 py-2.5 text-end">{t('common.revenue')}</th>
                    <th className="px-4 py-2.5 text-end">{t('an.adSpend')} / {t('common.thisMonth').toLowerCase()}</th>
                    <th className="px-4 py-2.5 text-end">ROAS</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-lc-border">
                  {d.sources.map((x) => (
                    <tr key={x.source}>
                      <td className="px-5 py-3"><span className="inline-flex items-center gap-2 font-semibold text-lc-text"><span className="h-2.5 w-2.5 rounded-full" style={{ background: SOURCE_COLORS[x.source] }} /><SourceIcon source={x.source} />{t(sourceKey(x.source))}</span></td>
                      <td className="lc-tnum px-4 py-3 text-end font-semibold">{x.leads}</td>
                      <td className="lc-tnum px-4 py-3 text-end">{x.bookings}</td>
                      <td className="px-4 py-3 text-end"><Badge tone={x.conversion >= 40 ? 'success' : x.conversion >= 25 ? 'warning' : 'neutral'} size="sm" className="lc-tnum">{formatPercent(x.conversion, locale)}</Badge></td>
                      <td className="lc-tnum px-4 py-3 text-end font-bold text-lc-success">{formatMoney(x.revenue, locale)}</td>
                      <td className="px-4 py-3 text-end"><Input type="number" min={0} className="lc-tnum ms-auto h-8 w-28 text-end" value={x.adSpend || ''} placeholder="₪0" onChange={(e) => run((snap) => setAdSpend(snap, x.source, Number(e.target.value)))} dir="ltr" /></td>
                      <td className="lc-tnum px-4 py-3 text-end font-bold text-lc-text">{x.roas !== null ? `×${x.roas}` : '—'}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader title={t('an.aiVsHuman')} />
              <div className="flex items-center gap-5 p-5">
                <Donut size={132} segments={[{ value: d.ai.ai.booked, color: '#4f46e5' }, { value: d.ai.human.booked, color: '#db2777' }]} center={<div><p className="lc-tnum text-2xl font-bold text-lc-text">{d.ai.ai.booked + d.ai.human.booked}</p><p className="text-[10px] text-lc-muted">{t('common.bookings')}</p></div>} />
                <ul className="flex-1 space-y-3 text-sm">
                  <li><p className="flex items-center gap-2 font-semibold text-lc-text"><BotIcon className="h-4 w-4 text-lc-primary" />{t('an.aiBookingRate')}</p><p className="lc-tnum text-2xl font-bold text-lc-primary">{formatPercent(d.ai.ai.rate, locale)}</p><p className="text-xs text-lc-muted">{d.ai.ai.booked}/{d.ai.ai.leads}</p></li>
                  <li><p className="flex items-center gap-2 font-semibold text-lc-text"><HandIcon className="h-4 w-4 text-lc-pink" />{t('an.humanBookingRate')}</p><p className="lc-tnum text-2xl font-bold text-lc-pink">{formatPercent(d.ai.human.rate, locale)}</p><p className="text-xs text-lc-muted">{d.ai.human.booked}/{d.ai.human.leads}</p></li>
                </ul>
              </div>
            </Card>
            <Card>
              <CardHeader title={t('an.lostReasons')} subtitle={`${d.stats.lost} ${t('dash.lostLeads').toLowerCase()}`} />
              <div className="px-5 pb-4 pt-1"><HBarList rows={d.lost.map((x) => ({ key: x.reason, label: t(`lost.${x.reason}` as const), value: x.count, color: '#94a0b8' }))} /></div>
            </Card>
            <Card>
              <CardHeader title={t('an.servicePop')} />
              <div className="px-5 pb-4 pt-1"><HBarList rows={d.services.slice(0, 6).map((x) => ({ key: x.service.id, label: pick(x.service.name, locale), value: x.count, color: '#4f46e5', meta: formatMoney(x.revenue, locale) }))} /></div>
            </Card>
          </div>

          <div className="mt-5 grid gap-5 lg:grid-cols-3">
            <Card>
              <CardHeader title={t('an.workerPerf')} />
              <ul className="divide-y divide-lc-border px-5 pb-3 pt-2">
                {d.workers.map((w) => (
                  <li key={w.worker.id} className="flex items-center gap-3 py-2.5">
                    <Avatar name={w.worker.name} />
                    <span className="min-w-0 flex-1"><span className="block text-sm font-semibold text-lc-text">{w.worker.name}</span><span className="text-xs text-lc-muted">{w.completed}/{w.jobs} {t('js.completed').toLowerCase()}</span></span>
                    <span className="lc-tnum text-sm font-bold text-lc-success">{formatMoney(w.revenue, locale)}</span>
                  </li>
                ))}
              </ul>
            </Card>
            <Card>
              <CardHeader title={t('an.cities')} />
              <div className="px-5 pb-4 pt-1"><HBarList rows={d.cities.map((x) => ({ key: x.city, label: x.city, value: x.revenue, color: '#0d9488', meta: `${x.jobs}` }))} formatValue={(v) => formatMoney(v, locale)} /></div>
            </Card>
            <Card>
              <CardHeader title={t('an.bestHours')} />
              <div className="space-y-4 p-5">
                <ColumnChart data={d.times.byDay.map((x) => ({ label: weekdayShort(x.day, locale), value: x.rate }))} height={90} highlightMax formatValue={(v) => formatPercent(v, locale)} />
                <ColumnChart data={d.times.byHour.filter((x) => x.hour >= 6).map((x) => ({ label: `${x.hour}`, value: x.rate }))} height={90} color="#0d9488" highlightMax formatValue={(v) => formatPercent(v, locale)} />
              </div>
            </Card>
          </div>
          <p className={cx('mt-4 flex items-center gap-2 text-xs text-lc-faint')}><ZapIcon className="h-3.5 w-3.5" />{t('an.roas')} · {t('set.integrationsHint')}</p>
        </>
      )}
    </Shell>
  );
}
