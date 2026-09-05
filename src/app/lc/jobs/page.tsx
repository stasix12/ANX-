'use client';

import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import { Suspense, useMemo, useState } from 'react';
import { Shell } from '@/components/lc/Shell';
import { ArrowRightIcon, BriefcaseIcon, ChevronLeftIcon, EyeOffIcon, MapPinIcon, MessageIcon, NavigationIcon, PhoneIcon, SearchIcon, XCircleIcon } from '@/components/lc/icons';
import { JobStatusPill, LangFlag, PAY_TONE, SourceLabel } from '@/components/lc/shared/StatusPill';
import { Input, Select, Textarea, Toggle } from '@/components/lc/ui/forms';
import { Avatar, Badge, Button, Card, EmptyState, PageHeader, Segmented, cx } from '@/components/lc/ui/primitives';
import { useToast } from '@/components/lc/ui/toast';
import { useLc } from '@/lib/lc/context';
import { formatDate, formatDateTime, formatDuration, formatMoney, formatTime } from '@/lib/lc/format';
import { jobStatusKey } from '@/lib/lc/i18n';
import { JOB_FLOW, updateJob } from '@/lib/lc/ops';
import type { Job, JobStatus, PaymentStatus } from '@/lib/lc/types';
import { JOB_STATUSES } from '@/lib/lc/types';
import { sameDay, toDateKey } from '@/lib/lc/util';

type Range = 'upcoming' | 'today' | 'past' | 'all';

export default function JobsPage() {
  return (
    <Suspense fallback={null}>
      <Jobs />
    </Suspense>
  );
}

function Jobs() {
  const { s, t, locale, run } = useLc();
  const params = useSearchParams();
  const router = useRouter();
  const jobId = params.get('j');
  const [range, setRange] = useState<Range>('upcoming');
  const [status, setStatus] = useState<JobStatus | 'all'>('all');
  const [q, setQ] = useState('');
  const [workerView, setWorkerView] = useState(false);
  const now = useMemo(() => new Date(), []);

  const jobs = useMemo(() => {
    if (!s) return [];
    const custs = new Map(s.customers.map((c) => [c.id, c]));
    return s.jobs
      .filter((j) => {
        const d = new Date(j.scheduledAt);
        if (range === 'today') return sameDay(d, now);
        if (range === 'upcoming') return d >= new Date(now.getTime() - 2 * 3600000) && j.status !== 'completed' && j.status !== 'cancelled';
        if (range === 'past') return j.status === 'completed' || j.status === 'cancelled' || d < now;
        return true;
      })
      .filter((j) => status === 'all' || j.status === status)
      .filter((j) => {
        if (!q.trim()) return true;
        const c = custs.get(j.customerId);
        const n = q.toLowerCase();
        return Boolean(c?.name.toLowerCase().includes(n) || c?.phone.includes(n) || j.city.toLowerCase().includes(n) || j.serviceSummary.toLowerCase().includes(n));
      })
      .sort((a, b) => (range === 'past' ? b.scheduledAt.localeCompare(a.scheduledAt) : a.scheduledAt.localeCompare(b.scheduledAt)))
      .slice(0, 150);
  }, [s, range, status, q, now]);

  const job = s?.jobs.find((j) => j.id === jobId) ?? null;

  const groups = useMemo(() => {
    const m = new Map<string, Job[]>();
    for (const j of jobs) {
      const k = toDateKey(j.scheduledAt);
      m.set(k, [...(m.get(k) ?? []), j]);
    }
    return [...m.entries()];
  }, [jobs]);

  return (
    <Shell title={t('jobs.title')} wide>
      {s && (
        <>
          <PageHeader
            title={t('jobs.title')}
            subtitle={`${jobs.length} · ${formatMoney(jobs.reduce((a, j) => a + (j.status === 'cancelled' ? 0 : j.price), 0), locale)}`}
            actions={
              <div className="flex items-center gap-2 rounded-xl border border-lc-border bg-white px-3 py-1.5">
                <EyeOffIcon className="h-4 w-4 text-lc-faint" />
                <span className="text-xs font-semibold text-lc-muted">{t('jobs.workerView')}</span>
                <Toggle size="sm" checked={workerView} onChange={setWorkerView} />
              </div>
            }
          />
          <div className={cx('grid gap-5', job ? 'lg:grid-cols-[1fr_420px]' : '')}>
            <div className={cx(job && 'hidden lg:block')}>
              <div className="mb-4 flex flex-wrap items-center gap-2">
                <Segmented value={range} onChange={setRange} options={[{ value: 'upcoming', label: t('jobs.upcoming') }, { value: 'today', label: t('common.today') }, { value: 'past', label: t('jobs.past') }, { value: 'all', label: t('common.all') }]} size="sm" />
                <Select value={status} onChange={(e) => setStatus(e.target.value as JobStatus | 'all')} className="h-9 w-44">
                  <option value="all">{t('common.status')}: {t('common.all')}</option>
                  {JOB_STATUSES.map((st) => (
                    <option key={st} value={st}>{t(jobStatusKey(st))}</option>
                  ))}
                </Select>
                <div className="relative ms-auto w-full sm:w-64">
                  <SearchIcon className="pointer-events-none absolute start-3 top-1/2 h-4 w-4 -translate-y-1/2 text-lc-faint" />
                  <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder={t('common.search')} className="h-9 ps-9" />
                </div>
              </div>

              {groups.length === 0 ? (
                <Card><EmptyState icon={<BriefcaseIcon />} title={t('jobs.empty')} /></Card>
              ) : (
                <div className="space-y-5">
                  {groups.map(([day, list]) => (
                    <section key={day}>
                      <h3 className="mb-2 flex items-center gap-2 text-[13px] font-bold text-lc-muted">
                        <span className={cx('rounded-md px-2 py-0.5', sameDay(day, now) ? 'bg-lc-primary text-white' : 'bg-lc-bg')}>{sameDay(day, now) ? t('common.today') : formatDate(day, locale, 'weekday')}</span>
                        <span className="text-lc-faint">{list.length}</span>
                      </h3>
                      <Card className="divide-y divide-lc-border overflow-hidden">
                        {list.map((j) => <JobRow key={j.id} job={j} active={j.id === jobId} hidePrice={workerView} onOpen={() => router.replace(`/lc/jobs?j=${j.id}`)} />)}
                      </Card>
                    </section>
                  ))}
                </div>
              )}
            </div>
            {job && <JobDetail job={job} hidePrice={workerView} onClose={() => router.replace('/lc/jobs')} />}
          </div>
        </>
      )}
    </Shell>
  );
}

function JobRow({ job, active, hidePrice, onOpen }: { job: Job; active: boolean; hidePrice: boolean; onOpen: () => void }) {
  const { s, locale } = useLc();
  const cust = s?.customers.find((c) => c.id === job.customerId);
  const worker = s?.workers.find((w) => w.id === job.workerId);
  return (
    <button type="button" onClick={onOpen} className={cx('flex w-full items-center gap-3 px-4 py-3 text-start transition-colors hover:bg-lc-bg', active && 'bg-lc-primary-soft/60')}>
      <span className="grid w-14 shrink-0 place-items-center rounded-lg bg-lc-bg py-1.5">
        <span className="lc-tnum text-sm font-bold text-lc-text">{formatTime(job.scheduledAt, locale)}</span>
        <span className="text-[10px] text-lc-faint">{formatDuration(job.durationMin, locale)}</span>
      </span>
      <Avatar name={cust?.name ?? '?'} />
      <span className="min-w-0 flex-1">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-lc-text"><span className="truncate">{cust?.name}</span>{cust && <LangFlag lang={cust.language} />}</span>
        <span className="block truncate text-xs text-lc-muted">{job.serviceSummary} · <MapPinIcon className="inline h-3 w-3" /> {job.city}</span>
      </span>
      {worker && <span className="hidden text-xs font-medium text-lc-muted md:block">{worker.name}</span>}
      {!hidePrice && <span className="lc-tnum hidden text-sm font-bold text-lc-text sm:block">{formatMoney(job.price, locale)}</span>}
      <JobStatusPill status={job.status} />
    </button>
  );
}

function JobDetail({ job, hidePrice, onClose }: { job: Job; hidePrice: boolean; onClose: () => void }) {
  const { s, t, locale, run } = useLc();
  const toast = useToast();
  const cust = s!.customers.find((c) => c.id === job.customerId);
  const worker = s!.workers.find((w) => w.id === job.workerId);
  const conv = s!.conversations.find((c) => c.leadId === job.leadId);
  const [notes, setNotes] = useState(job.internalNotes);
  const idx = JOB_FLOW.indexOf(job.status);
  const next = idx >= 0 && idx < JOB_FLOW.length - 1 ? JOB_FLOW[idx + 1] : null;
  const patch = (p: Partial<Job>) => run((snap) => updateJob(snap, job.id, p));
  const showPrice = !hidePrice || worker?.canSeePrices !== false;

  return (
    <Card className="lg:sticky lg:top-8 lg:self-start">
      <div className="flex items-center gap-3 border-b border-lc-border p-4">
        <button type="button" onClick={onClose} className="grid h-8 w-8 place-items-center rounded-lg text-lc-muted hover:bg-lc-bg lg:hidden"><ChevronLeftIcon className="h-5 w-5 rtl:rotate-180" /></button>
        <Avatar name={cust?.name ?? '?'} size="lg" />
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-base font-bold text-lc-text">{cust?.name}</h2>
          <p className="lc-tnum text-xs text-lc-muted" dir="ltr">{cust?.phone}</p>
        </div>
        <JobStatusPill status={job.status} size="md" />
      </div>

      {/* Stepper */}
      <div className="px-4 pt-4">
        <ol className="flex items-center gap-1">
          {JOB_FLOW.map((st, i) => (
            <li key={st} className="flex flex-1 flex-col items-center gap-1">
              <span className={cx('h-1.5 w-full rounded-full', i <= idx && job.status !== 'cancelled' ? 'bg-lc-primary' : 'bg-slate-200')} />
              <span className={cx('text-[10px] font-semibold', i === idx ? 'text-lc-primary' : 'text-lc-faint')}>{t(jobStatusKey(st))}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="space-y-4 p-4">
        <div className="rounded-xl bg-lc-bg p-3.5">
          <p className="text-sm font-bold text-lc-text">{formatDateTime(job.scheduledAt, locale)} <span className="font-medium text-lc-muted">· {formatDuration(job.durationMin, locale)}</span></p>
          <p className="mt-1 text-sm text-lc-text">{job.serviceSummary}</p>
          <p className="mt-1 flex items-center gap-1 text-[13px] text-lc-muted"><MapPinIcon className="h-3.5 w-3.5" />{job.address ? `${job.address}, ` : ''}{job.city}</p>
          <div className="mt-2 flex items-center gap-2"><SourceLabel source={job.leadSource} /></div>
        </div>

        {showPrice ? (
          <div className="flex items-center justify-between rounded-xl border border-lc-border p-3.5">
            <div>
              <p className="text-xs text-lc-muted">{t('common.price')}</p>
              <p className="lc-tnum text-2xl font-bold text-lc-text">{formatMoney(job.price, locale)}</p>
            </div>
            <div className="text-end">
              <p className="text-xs text-lc-muted">{t('jobs.payment')}</p>
              <Select value={job.paymentStatus} onChange={(e) => patch({ paymentStatus: e.target.value as PaymentStatus })} className="mt-1 h-8 w-32">
                {(['unpaid', 'deposit', 'paid', 'refunded'] as PaymentStatus[]).map((p) => (
                  <option key={p} value={p}>{t(`pay.${p}` as const)}</option>
                ))}
              </Select>
              <Badge tone={PAY_TONE[job.paymentStatus]} size="sm" className="mt-1">{t(`pay.${job.paymentStatus}` as const)}</Badge>
            </div>
          </div>
        ) : (
          <div className="flex items-center gap-2 rounded-xl border border-dashed border-lc-border p-3 text-[13px] text-lc-muted"><EyeOffIcon className="h-4 w-4" />{t('jobs.hiddenPrice')}</div>
        )}

        <div>
          <p className="mb-1.5 text-[13px] font-semibold text-lc-text">{t('jobs.assign')}</p>
          <Select value={job.workerId ?? ''} onChange={(e) => { patch({ workerId: e.target.value || null }); toast.success(t('toast.saved')); }}>
            <option value="">{t('common.unassigned')}</option>
            {s!.workers.filter((w) => w.active).map((w) => (
              <option key={w.id} value={w.id}>{w.name}{w.serviceAreas.length ? ` · ${w.serviceAreas.slice(0, 2).join(', ')}` : ''}</option>
            ))}
          </Select>
        </div>

        {job.customerNotes && (
          <div>
            <p className="mb-1 text-[13px] font-semibold text-lc-text">{t('jobs.customerNotes')}</p>
            <p className="rounded-lg bg-lc-warning-soft p-2.5 text-[13px] text-lc-text">{job.customerNotes}</p>
          </div>
        )}

        <div>
          <p className="mb-1 text-[13px] font-semibold text-lc-text">{t('jobs.internalNotes')}</p>
          <Textarea value={notes} onChange={(e) => setNotes(e.target.value)} onBlur={() => notes !== job.internalNotes && patch({ internalNotes: notes })} className="min-h-[64px]" />
        </div>

        {job.photos.length > 0 && (
          <div>
            <p className="mb-1.5 text-[13px] font-semibold text-lc-text">{t('common.photos')}</p>
            <div className="grid grid-cols-3 gap-1.5">
              {job.photos.map((p, i) => <img key={i} src={p.url} alt="" className="aspect-[4/3] w-full rounded-lg object-cover" />)}
            </div>
          </div>
        )}

        <div className="grid grid-cols-3 gap-2">
          <Button variant="secondary" size="sm" href={`tel:${cust?.phone}`} icon={<PhoneIcon className="h-3.5 w-3.5" />}>{t('jobs.call')}</Button>
          <Button variant="secondary" size="sm" href={`https://waze.com/ul?q=${encodeURIComponent(`${job.address} ${job.city}`)}&navigate=yes`} icon={<NavigationIcon className="h-3.5 w-3.5" />}>{t('jobs.navigate')}</Button>
          {conv && <Button variant="secondary" size="sm" href={`/lc/inbox?c=${conv.id}`} icon={<MessageIcon className="h-3.5 w-3.5" />}>{t('jobs.openChat')}</Button>}
        </div>

        {job.status !== 'completed' && job.status !== 'cancelled' && (
          <div className="flex gap-2 border-t border-lc-border pt-4">
            {next && (
              <Button className="flex-1" variant={next === 'completed' ? 'success' : 'primary'} icon={<ArrowRightIcon className="h-4 w-4 rtl:rotate-180" />} onClick={() => { patch({ status: next }); toast.success(t(jobStatusKey(next))); }}>
                {t('jobs.advance')}: {t(jobStatusKey(next))}
              </Button>
            )}
            <Button variant="danger" icon={<XCircleIcon className="h-4 w-4" />} onClick={() => patch({ status: 'cancelled' })}>{t('jobs.cancel')}</Button>
          </div>
        )}
        {cust && <Link href={`/lc/customers?id=${cust.id}`} className="block text-center text-xs font-semibold text-lc-primary hover:underline">{t('nav.customers')} →</Link>}
      </div>
    </Card>
  );
}
