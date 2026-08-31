'use client';

import { useMemo, useState } from 'react';
import { CrmShell } from '@/components/crm/CrmShell';
import { LeadCard } from '@/components/crm/LeadCard';
import { SpinnerIcon } from '@/components/icons';
import {
  addDaysISO,
  formatDateLongHe,
  statusById,
  toISODate,
  todayISO,
  weekRangeISO,
  type Lead,
} from '@/lib/crm/leads';
import { shiftFor } from '@/lib/crm/shifts';
import { useLeads } from '@/lib/crm/useLeads';

type CalendarView = 'day' | 'week' | 'month';

const VIEWS: { value: CalendarView; label: string }[] = [
  { value: 'day', label: 'יומי' },
  { value: 'week', label: 'שבועי' },
  { value: 'month', label: 'חודשי' },
];

const DAY_LETTERS = ['א', 'ב', 'ג', 'ד', 'ה', 'ו', 'ש'];

const byTime = (a: Lead, b: Lead) => (a.jobTime ?? '99').localeCompare(b.jobTime ?? '99');

/** The month grid: full Sunday-based weeks covering the month of `iso`. */
function monthGrid(iso: string): string[][] {
  const first = `${iso.slice(0, 7)}-01`;
  const start = weekRangeISO(first).start;
  const weeks: string[][] = [];
  let cursor = start;
  for (let w = 0; w < 6; w++) {
    const week = Array.from({ length: 7 }, (_, i) => addDaysISO(cursor, i));
    // Stop once a whole week falls outside the month.
    if (w > 0 && week[0].slice(0, 7) > iso.slice(0, 7)) break;
    weeks.push(week);
    cursor = addDaysISO(cursor, 7);
  }
  return weeks;
}

function monthTitle(iso: string): string {
  return new Date(`${iso}T12:00:00`).toLocaleDateString('he-IL', { month: 'long', year: 'numeric' });
}

function DayJobs({ date, jobs }: { date: string; jobs: Lead[] }) {
  const shift = shiftFor(date);
  return (
    <section className="mt-4">
      <h3 className="mb-3 flex flex-wrap items-center gap-2 text-base font-extrabold">
        <span>
          {formatDateLongHe(date)}
          {date === todayISO() ? ' (היום)' : ''}
        </span>
        <span className={`rounded-full bg-ink-850 px-2.5 py-0.5 text-xs font-bold ${shift.textClass}`}>
          משמרת: {shift.label}
        </span>
      </h3>
      {jobs.length === 0 ? (
        <p className="rounded-card border border-ink-700 surface p-5 text-center text-sm font-semibold text-mist-500">
          אין עבודות ביום זה.
        </p>
      ) : (
        <div className="space-y-3">
          {jobs.map((lead) => (
            <LeadCard key={lead.id} lead={lead} />
          ))}
        </div>
      )}
    </section>
  );
}

export default function CrmCalendarPage() {
  const { leads, loading, error } = useLeads();
  const [view, setView] = useState<CalendarView>('day');
  const [selected, setSelected] = useState(todayISO());

  const jobsByDate = useMemo(() => {
    const map = new Map<string, Lead[]>();
    for (const lead of leads) {
      if (!lead.jobDate) continue;
      const list = map.get(lead.jobDate) ?? [];
      list.push(lead);
      map.set(lead.jobDate, list);
    }
    for (const list of map.values()) list.sort(byTime);
    return map;
  }, [leads]);

  const jobsOn = (date: string) => jobsByDate.get(date) ?? [];

  function shift(direction: 1 | -1) {
    if (view === 'day') setSelected(addDaysISO(selected, direction));
    else if (view === 'week') setSelected(addDaysISO(selected, 7 * direction));
    else {
      const date = new Date(`${selected.slice(0, 7)}-15T12:00:00`);
      date.setMonth(date.getMonth() + direction);
      setSelected(toISODate(date).slice(0, 7) + '-01');
    }
  }

  const week = weekRangeISO(selected);

  return (
    <CrmShell title="יומן עבודות">
      <div className="flex rounded-full border border-ink-700 bg-ink-850 p-1" role="group" aria-label="תצוגת יומן">
        {VIEWS.map((option) => (
          <button
            key={option.value}
            type="button"
            aria-pressed={view === option.value}
            onClick={() => setView(option.value)}
            className={`flex-1 rounded-full py-2 text-sm font-bold transition-colors ${
              view === option.value ? 'bg-brand-500 text-on-brand' : 'text-mist-300'
            }`}
          >
            {option.label}
          </button>
        ))}
      </div>

      <div className="mt-4 flex items-center justify-between">
        {/* In RTL, "next" points left — text arrows follow the reading direction. */}
        <button
          type="button"
          onClick={() => shift(-1)}
          className="rounded-full border border-ink-600 bg-ink-850 px-4 py-2 text-sm font-bold transition-colors hover:border-ink-500"
        >
          → הקודם
        </button>
        <button
          type="button"
          onClick={() => setSelected(todayISO())}
          className="rounded-full px-4 py-2 text-sm font-bold text-brand-400 transition-colors hover:text-brand-300"
        >
          היום
        </button>
        <button
          type="button"
          onClick={() => shift(1)}
          className="rounded-full border border-ink-600 bg-ink-850 px-4 py-2 text-sm font-bold transition-colors hover:border-ink-500"
        >
          הבא ←
        </button>
      </div>

      {loading ? (
        <div className="grid place-items-center py-20">
          <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      ) : error ? (
        <p role="alert" className="mt-4 rounded-card bg-red-600/10 px-4 py-3 text-sm font-semibold text-red-600">
          {error}
        </p>
      ) : view === 'day' ? (
        <DayJobs date={selected} jobs={jobsOn(selected)} />
      ) : view === 'week' ? (
        <div className="mt-4 space-y-5">
          {Array.from({ length: 7 }, (_, i) => addDaysISO(week.start, i)).map((date) => {
            const jobs = jobsOn(date);
            if (jobs.length === 0) return null;
            return <DayJobs key={date} date={date} jobs={jobs} />;
          })}
          {Array.from({ length: 7 }, (_, i) => addDaysISO(week.start, i)).every(
            (date) => jobsOn(date).length === 0,
          ) ? (
            <p className="rounded-card border border-ink-700 surface p-5 text-center text-sm font-semibold text-mist-500">
              אין עבודות בשבוע זה.
            </p>
          ) : null}
        </div>
      ) : (
        <>
          <p className="mt-4 text-center text-base font-extrabold">{monthTitle(selected)}</p>
          <div className="mt-2 grid grid-cols-7 gap-1 text-center">
            {DAY_LETTERS.map((letter) => (
              <span key={letter} className="py-1 text-xs font-bold text-mist-500">
                {letter}
              </span>
            ))}
            {monthGrid(selected)
              .flat()
              .map((date) => {
                const inMonth = date.slice(0, 7) === selected.slice(0, 7);
                const jobs = jobsOn(date);
                const isSelected = date === selected;
                const isToday = date === todayISO();
                const shift = shiftFor(date);
                return (
                  <button
                    key={date}
                    type="button"
                    onClick={() => setSelected(date)}
                    aria-pressed={isSelected}
                    className={`flex min-h-14 flex-col items-center justify-start gap-0.5 rounded-xl border py-1 transition-colors ${
                      isSelected
                        ? 'border-brand-500 bg-brand-500/15'
                        : 'border-transparent hover:border-ink-600'
                    } ${inMonth ? '' : 'opacity-35'}`}
                  >
                    <span className={`text-[9px] font-bold leading-tight ${shift.textClass}`}>
                      {shift.label}
                    </span>
                    <span
                      className={`flex h-6 w-6 items-center justify-center rounded-full text-sm font-bold tabular-nums ${
                        isToday ? 'bg-brand-500 text-on-brand' : ''
                      }`}
                    >
                      {Number(date.slice(8, 10))}
                    </span>
                    {/* One dot per job; a crowded day collapses to its count.
                        The row keeps a fixed height so all cells stay level. */}
                    <span className="flex h-2 items-center gap-0.5">
                      {jobs.length > 6 ? (
                        <span aria-hidden className="text-[10px] font-extrabold leading-none text-brand-400">
                          {jobs.length}
                        </span>
                      ) : (
                        jobs.map((job) => (
                          <span
                            key={job.id}
                            aria-hidden
                            className={`h-1.5 w-1.5 rounded-full ${statusById[job.status].dotClass}`}
                          />
                        ))
                      )}
                    </span>
                  </button>
                );
              })}
          </div>
          <DayJobs date={selected} jobs={jobsOn(selected)} />
        </>
      )}
    </CrmShell>
  );
}
