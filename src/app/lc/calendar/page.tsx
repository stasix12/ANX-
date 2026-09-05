'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import { Shell } from '@/components/lc/Shell';
import { BookingModal } from '@/components/lc/calendar/BookingModal';
import { ChevronLeftIcon, ChevronRightIcon, ClockIcon, PlusIcon, XCircleIcon } from '@/components/lc/icons';
import { Field, Input } from '@/components/lc/ui/forms';
import { Modal } from '@/components/lc/ui/overlay';
import { Badge, Button, Card, PageHeader, Segmented, cx } from '@/components/lc/ui/primitives';
import { useToast } from '@/components/lc/ui/toast';
import { useLc } from '@/lib/lc/context';
import { formatDate, formatMonth, formatMoney, formatTime, weekdayShort } from '@/lib/lc/format';
import { saveSettings } from '@/lib/lc/ops';
import { availableSlots } from '@/lib/lc/scheduling';
import type { Job } from '@/lib/lc/types';
import { addDays, fromDateTimeKeys, sameDay, startOfWeek, toDateKey } from '@/lib/lc/util';

type View = 'day' | 'week' | 'month';
const START_H = 7;
const END_H = 21;
const HOUR_PX = 56;

export const WORKER_COLORS: Record<string, { bg: string; text: string; border: string; hex: string }> = {
  indigo: { bg: 'bg-indigo-100', text: 'text-indigo-800', border: 'border-indigo-300', hex: '#4f46e5' },
  teal: { bg: 'bg-teal-100', text: 'text-teal-800', border: 'border-teal-300', hex: '#0d9488' },
  amber: { bg: 'bg-amber-100', text: 'text-amber-800', border: 'border-amber-300', hex: '#d97706' },
  pink: { bg: 'bg-pink-100', text: 'text-pink-800', border: 'border-pink-300', hex: '#db2777' },
  sky: { bg: 'bg-sky-100', text: 'text-sky-800', border: 'border-sky-300', hex: '#0284c7' },
  none: { bg: 'bg-slate-100', text: 'text-slate-700', border: 'border-slate-300', hex: '#64748b' },
};

export default function CalendarPage() {
  const { s, t, locale, run } = useLc();
  const router = useRouter();
  const toast = useToast();
  const [view, setView] = useState<View>('week');
  const [cursor, setCursor] = useState(() => new Date());
  const [bookingOpen, setBookingOpen] = useState(false);
  const [blockOpen, setBlockOpen] = useState(false);
  const [block, setBlock] = useState({ date: toDateKey(new Date()), start: '12:00', end: '14:00', label: '' });
  const now = useMemo(() => new Date(), []);

  const jobs = useMemo(() => (s ? s.jobs.filter((j) => j.status !== 'cancelled') : []), [s]);
  const workerOf = (id: string | null) => s?.workers.find((w) => w.id === id);
  const colorOf = (j: Job) => WORKER_COLORS[workerOf(j.workerId)?.color ?? 'none'] ?? WORKER_COLORS.none;
  const custName = (j: Job) => s?.customers.find((c) => c.id === j.customerId)?.name ?? '';

  const move = (dir: -1 | 1) => {
    const d = new Date(cursor);
    if (view === 'day') d.setDate(d.getDate() + dir);
    else if (view === 'week') d.setDate(d.getDate() + dir * 7);
    else d.setMonth(d.getMonth() + dir);
    setCursor(d);
  };

  const weekDays = useMemo(() => {
    const start = view === 'day' ? new Date(cursor) : startOfWeek(cursor);
    return Array.from({ length: view === 'day' ? 1 : 7 }, (_, i) => addDays(start, i));
  }, [cursor, view]);

  const title = view === 'month' ? formatMonth(cursor, locale) : view === 'day' ? formatDate(cursor, locale, 'long') : `${formatDate(weekDays[0], locale, 'short')} – ${formatDate(weekDays[6], locale, 'short')}`;

  const daySlots = useMemo(() => {
    if (!s || view !== 'day') return [];
    return availableSlots({ from: cursor, days: 1, durationMin: 60, settings: s.settings, bookings: s.bookings, workers: s.workers, now });
  }, [s, view, cursor, now]);

  const openJob = (j: Job) => router.push(`/lc/jobs?j=${j.id}`);

  return (
    <Shell title={t('cal.title')} wide>
      {s && (
        <>
          <PageHeader
            title={t('cal.title')}
            actions={
              <>
                <Button variant="secondary" icon={<XCircleIcon className="h-4 w-4" />} onClick={() => setBlockOpen(true)}>{t('cal.blockTime')}</Button>
                <Button icon={<PlusIcon className="h-4 w-4" />} onClick={() => setBookingOpen(true)}>{t('cal.newBooking')}</Button>
              </>
            }
          />

          <Card className="overflow-hidden">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-lc-border px-4 py-3">
              <div className="flex items-center gap-2">
                <button type="button" onClick={() => move(-1)} className="grid h-9 w-9 place-items-center rounded-lg border border-lc-border text-lc-muted hover:bg-lc-bg" aria-label="prev"><ChevronLeftIcon className="h-4 w-4 rtl:rotate-180" /></button>
                <button type="button" onClick={() => setCursor(new Date())} className="h-9 rounded-lg border border-lc-border px-3 text-sm font-semibold text-lc-text hover:bg-lc-bg">{t('common.today')}</button>
                <button type="button" onClick={() => move(1)} className="grid h-9 w-9 place-items-center rounded-lg border border-lc-border text-lc-muted hover:bg-lc-bg" aria-label="next"><ChevronRightIcon className="h-4 w-4 rtl:rotate-180" /></button>
                <h2 className="ms-2 text-[15px] font-bold text-lc-text sm:text-lg">{title}</h2>
              </div>
              <div className="flex items-center gap-3">
                <div className="hidden items-center gap-3 md:flex">
                  {s.workers.filter((w) => w.active).map((w) => (
                    <span key={w.id} className="inline-flex items-center gap-1.5 text-xs font-medium text-lc-muted"><span className="h-2.5 w-2.5 rounded-full" style={{ background: (WORKER_COLORS[w.color] ?? WORKER_COLORS.none).hex }} />{w.name}</span>
                  ))}
                </div>
                <Segmented value={view} onChange={setView} options={[{ value: 'day', label: t('cal.day') }, { value: 'week', label: t('cal.week') }, { value: 'month', label: t('cal.month') }]} size="sm" />
              </div>
            </div>

            {view === 'month' ? (
              <MonthGrid cursor={cursor} jobs={jobs} colorOf={colorOf} custName={custName} onDay={(d) => { setCursor(d); setView('day'); }} now={now} blocked={s.settings.blockedTimes.map((b) => b.date)} />
            ) : (
              <div className={cx('grid', view === 'day' ? 'lg:grid-cols-[1fr_300px]' : '')}>
                <TimeGrid days={weekDays} jobs={jobs} colorOf={colorOf} custName={custName} onJob={openJob} now={now} />
                {view === 'day' && (
                  <aside className="border-t border-lc-border bg-lc-bg/60 p-4 lg:border-s lg:border-t-0">
                    <h3 className="flex items-center gap-2 text-sm font-bold text-lc-text"><ClockIcon className="h-4 w-4 text-lc-primary" />{t('cal.availableSlots')}</h3>
                    {daySlots.length === 0 ? (
                      <p className="mt-3 text-sm text-lc-muted">{t('cal.closed')}</p>
                    ) : (
                      <div className="mt-3 flex flex-wrap gap-1.5">
                        {daySlots.map((sl) => (
                          <Badge key={sl.start.toISOString()} tone="primary" className="lc-tnum">{formatTime(sl.start, locale)}</Badge>
                        ))}
                      </div>
                    )}
                    <h3 className="mt-6 text-sm font-bold text-lc-text">{t('cal.jobsCount')} · {jobs.filter((j) => sameDay(j.scheduledAt, cursor)).length}</h3>
                    <ul className="mt-2 space-y-2">
                      {jobs.filter((j) => sameDay(j.scheduledAt, cursor)).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt)).map((j) => (
                        <li key={j.id}>
                          <button type="button" onClick={() => openJob(j)} className="flex w-full items-center gap-3 rounded-xl border border-lc-border bg-white p-2.5 text-start hover:border-lc-primary-ring">
                            <span className="lc-tnum text-sm font-bold text-lc-text">{formatTime(j.scheduledAt, locale)}</span>
                            <span className="min-w-0 flex-1">
                              <span className="block truncate text-sm font-semibold text-lc-text">{custName(j)}</span>
                              <span className="block truncate text-xs text-lc-muted">{j.serviceSummary}</span>
                            </span>
                            <span className="lc-tnum text-sm font-bold text-lc-success">{formatMoney(j.price, locale)}</span>
                          </button>
                        </li>
                      ))}
                    </ul>
                  </aside>
                )}
              </div>
            )}
          </Card>

          <BookingModal open={bookingOpen} onClose={() => setBookingOpen(false)} date={cursor} />
          <Modal
            open={blockOpen}
            onClose={() => setBlockOpen(false)}
            title={t('cal.blockTime')}
            size="sm"
            footer={
              <>
                <Button variant="ghost" onClick={() => setBlockOpen(false)}>{t('common.cancel')}</Button>
                <Button
                  onClick={() => {
                    run((snap) => saveSettings(snap, { ...snap.settings, blockedTimes: [...snap.settings.blockedTimes, { ...block, label: block.label || t('cal.blocked') }] }));
                    setBlockOpen(false);
                    toast.success(t('toast.saved'));
                  }}
                >
                  {t('common.confirm')}
                </Button>
              </>
            }
          >
            <div className="grid gap-3">
              <Field label={t('common.date')}><Input type="date" value={block.date} onChange={(e) => setBlock({ ...block, date: e.target.value })} dir="ltr" /></Field>
              <div className="grid grid-cols-2 gap-3">
                <Field label={t('cal.from')}><Input type="time" value={block.start} onChange={(e) => setBlock({ ...block, start: e.target.value })} dir="ltr" /></Field>
                <Field label={t('cal.to')}><Input type="time" value={block.end} onChange={(e) => setBlock({ ...block, end: e.target.value })} dir="ltr" /></Field>
              </div>
              <Field label={t('cal.label')}><Input value={block.label} onChange={(e) => setBlock({ ...block, label: e.target.value })} /></Field>
            </div>
          </Modal>
        </>
      )}
    </Shell>
  );
}

function TimeGrid({ days, jobs, colorOf, custName, onJob, now }: { days: Date[]; jobs: Job[]; colorOf: (j: Job) => (typeof WORKER_COLORS)[string]; custName: (j: Job) => string; onJob: (j: Job) => void; now: Date }) {
  const { s, locale } = useLc();
  const hours = Array.from({ length: END_H - START_H }, (_, i) => START_H + i);
  const top = (d: Date) => ((d.getHours() + d.getMinutes() / 60 - START_H) / (END_H - START_H)) * 100;
  return (
    <div className="lc-scroll overflow-x-auto">
      <div className={cx('grid min-w-[640px]', days.length === 1 ? 'grid-cols-[56px_1fr]' : 'grid-cols-[56px_repeat(7,minmax(0,1fr))]')}>
        <div className="border-b border-lc-border" />
        {days.map((d) => {
          const today = sameDay(d, now);
          return (
            <div key={d.toISOString()} className={cx('border-b border-s border-lc-border px-2 py-2 text-center', today && 'bg-lc-primary-soft/50')}>
              <p className="text-[11px] font-semibold uppercase text-lc-faint">{weekdayShort(d.getDay(), locale)}</p>
              <p className={cx('lc-tnum mx-auto mt-0.5 grid h-7 w-7 place-items-center rounded-full text-sm font-bold', today ? 'bg-lc-primary text-white' : 'text-lc-text')}>{d.getDate()}</p>
            </div>
          );
        })}
        <div className="relative" style={{ height: hours.length * HOUR_PX }}>
          {hours.map((h) => (
            <div key={h} className="lc-tnum absolute -translate-y-1/2 pe-2 text-end text-[11px] text-lc-faint" style={{ top: ((h - START_H) / (END_H - START_H)) * 100 + '%', insetInlineEnd: 0 }}>
              {String(h).padStart(2, '0')}:00
            </div>
          ))}
        </div>
        {days.map((d) => {
          const key = toDateKey(d);
          const wd = s?.settings.workingHours[d.getDay()];
          const dayJobs = jobs.filter((j) => toDateKey(j.scheduledAt) === key);
          const blocks = s?.settings.blockedTimes.filter((b) => b.date === key) ?? [];
          const nowTop = sameDay(d, now) ? top(now) : null;
          return (
            <div key={key} className="relative border-s border-lc-border" style={{ height: hours.length * HOUR_PX }}>
              {hours.map((h) => (
                <div key={h} className="absolute inset-x-0 border-t border-lc-border/70" style={{ top: ((h - START_H) / (END_H - START_H)) * 100 + '%' }} />
              ))}
              {/* Outside working hours */}
              {wd?.enabled ? (
                <>
                  <div className="absolute inset-x-0 top-0 bg-slate-50/90" style={{ height: top(fromDateTimeKeys(key, wd.start)) + '%' }} />
                  <div className="absolute inset-x-0 bottom-0 bg-slate-50/90" style={{ top: top(fromDateTimeKeys(key, wd.end)) + '%' }} />
                </>
              ) : (
                <div className="absolute inset-0 bg-[repeating-linear-gradient(135deg,transparent,transparent_8px,rgba(15,23,42,0.03)_8px,rgba(15,23,42,0.03)_16px)]" />
              )}
              {blocks.map((b, i) => (
                <div key={i} className="absolute inset-x-1 rounded-lg border border-dashed border-slate-300 bg-[repeating-linear-gradient(135deg,#f1f5f9,#f1f5f9_6px,#e2e8f0_6px,#e2e8f0_12px)] px-2 py-1 text-[11px] font-semibold text-slate-500" style={{ top: top(fromDateTimeKeys(b.date, b.start)) + '%', height: top(fromDateTimeKeys(b.date, b.end)) - top(fromDateTimeKeys(b.date, b.start)) + '%' }}>
                  {b.label}
                </div>
              ))}
              {dayJobs.map((j) => {
                const start = new Date(j.scheduledAt);
                const end = new Date(start.getTime() + j.durationMin * 60000);
                const c = colorOf(j);
                const overlapIdx = dayJobs.filter((o) => o.id !== j.id && new Date(o.scheduledAt) < end && new Date(new Date(o.scheduledAt).getTime() + o.durationMin * 60000) > start && o.id < j.id).length;
                return (
                  <button
                    key={j.id}
                    type="button"
                    onClick={() => onJob(j)}
                    className={cx('absolute overflow-hidden rounded-lg border-s-[3px] px-2 py-1 text-start shadow-[0_1px_2px_rgba(15,23,42,0.08)] transition-transform hover:z-10 hover:scale-[1.02]', c.bg, c.text, c.border, j.status === 'completed' && 'opacity-70')}
                    style={{ top: top(start) + '%', height: Math.max(3.5, top(end) - top(start)) + '%', insetInlineStart: `calc(${overlapIdx * 30}% + 3px)`, insetInlineEnd: 3 }}
                  >
                    <p className="lc-tnum text-[11px] font-bold leading-tight">{formatTime(start, locale)}</p>
                    <p className="truncate text-[12px] font-semibold leading-tight">{custName(j)}</p>
                    <p className="truncate text-[11px] leading-tight opacity-80">{j.serviceSummary}</p>
                  </button>
                );
              })}
              {nowTop !== null && nowTop >= 0 && nowTop <= 100 && (
                <div className="pointer-events-none absolute inset-x-0 z-10 flex items-center" style={{ top: nowTop + '%' }}>
                  <span className="h-2.5 w-2.5 -translate-x-1/2 rounded-full bg-lc-danger rtl:translate-x-1/2" />
                  <span className="h-px flex-1 bg-lc-danger" />
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}

function MonthGrid({ cursor, jobs, colorOf, custName, onDay, now, blocked }: { cursor: Date; jobs: Job[]; colorOf: (j: Job) => (typeof WORKER_COLORS)[string]; custName: (j: Job) => string; onDay: (d: Date) => void; now: Date; blocked: string[] }) {
  const { locale, t } = useLc();
  const first = new Date(cursor.getFullYear(), cursor.getMonth(), 1);
  const start = startOfWeek(first);
  const cells = Array.from({ length: 42 }, (_, i) => addDays(start, i));
  return (
    <div>
      <div className="grid grid-cols-7 border-b border-lc-border">
        {[0, 1, 2, 3, 4, 5, 6].map((d) => (
          <div key={d} className="py-2 text-center text-[11px] font-semibold uppercase text-lc-faint">{weekdayShort(d, locale)}</div>
        ))}
      </div>
      <div className="grid grid-cols-7">
        {cells.map((d) => {
          const key = toDateKey(d);
          const inMonth = d.getMonth() === cursor.getMonth();
          const dayJobs = jobs.filter((j) => toDateKey(j.scheduledAt) === key).sort((a, b) => a.scheduledAt.localeCompare(b.scheduledAt));
          const today = sameDay(d, now);
          const busy = dayJobs.length >= 4;
          return (
            <button key={key} type="button" onClick={() => onDay(d)} className={cx('min-h-[104px] border-b border-e border-lc-border p-1.5 text-start align-top transition-colors hover:bg-lc-bg sm:min-h-[120px]', !inMonth && 'bg-slate-50/60 text-lc-faint')}>
              <div className="flex items-center justify-between">
                <span className={cx('lc-tnum grid h-6 w-6 place-items-center rounded-full text-xs font-bold', today ? 'bg-lc-primary text-white' : inMonth ? 'text-lc-text' : 'text-lc-faint')}>{d.getDate()}</span>
                {busy && <span className="rounded-full bg-lc-warning-soft px-1.5 text-[10px] font-bold text-lc-warning">{dayJobs.length} {t('cal.jobsCount')}</span>}
                {blocked.includes(key) && <span className="h-1.5 w-1.5 rounded-full bg-slate-400" />}
              </div>
              <ul className="mt-1 space-y-0.5">
                {dayJobs.slice(0, 3).map((j) => {
                  const c = colorOf(j);
                  return (
                    <li key={j.id} className={cx('truncate rounded px-1.5 py-0.5 text-[11px] font-medium', c.bg, c.text)}>
                      <span className="lc-tnum font-bold">{formatTime(j.scheduledAt, locale)}</span> {custName(j)}
                    </li>
                  );
                })}
                {dayJobs.length > 3 && <li className="px-1 text-[11px] font-semibold text-lc-muted">+{dayJobs.length - 3}</li>}
              </ul>
            </button>
          );
        })}
      </div>
    </div>
  );
}
