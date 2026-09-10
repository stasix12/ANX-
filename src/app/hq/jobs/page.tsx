'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { HqShell } from '@/components/platform/HqShell';
import { Badge, btnDanger, EmptyState, inputClass, Modal } from '@/components/platform/ui';
import { jobProfit } from '@/lib/platform/analytics';
import {
  cityName,
  formatDateHe,
  formatPrice,
  itemsLabel,
  relativeTimeHe,
  todayIso,
  windowLabel,
} from '@/lib/platform/catalog';
import { eligiblePros, rankPros, waveState } from '@/lib/platform/dispatch';
import { currentFee } from '@/lib/platform/pricing';
import {
  ACTIVE_STATUSES,
  DONE_STATUSES,
  JOB_STATUS_LABELS,
  OPEN_STATUSES,
} from '@/lib/platform/stateMachine';
import { actions, usePlatform, useSession } from '@/lib/platform/store';
import type { Job } from '@/lib/platform/types';

/**
 * The jobs board + live dispatch monitor: which wave each open job is in,
 * how many pros can see it, what the fee has decayed to — plus per-job
 * profitability on completed work.
 */

function JobEconomics({ job }: { job: Job }) {
  const p = jobProfit(job);
  return (
    <div className="mt-2 grid grid-cols-4 gap-1 rounded-xl bg-ink-900 p-2 text-center text-xs">
      <div>
        <div className="text-mist-500">הכנסה</div>
        <div className="font-black text-mist-100">{formatPrice(p.revenue)}</div>
      </div>
      <div>
        <div className="text-mist-500">פרסום</div>
        <div className="font-black text-mist-100">{formatPrice(p.advertisingCost)}</div>
      </div>
      <div>
        <div className="text-mist-500">עמלות/החזרים</div>
        <div className="font-black text-mist-100">{formatPrice(p.otherCosts)}</div>
      </div>
      <div>
        <div className="text-mist-500">רווח</div>
        <div className={`font-black ${p.grossProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
          {formatPrice(p.grossProfit)}
        </div>
      </div>
    </div>
  );
}

function JobsBoard() {
  const snap = usePlatform();
  const session = useSession();
  const [cancelling, setCancelling] = useState<Job | null>(null);
  const [reason, setReason] = useState('');
  const [copied, setCopied] = useState('');
  const [, setTick] = useState(0);

  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  if (!snap || !session) return null;

  const open = snap.jobs.filter((j) => OPEN_STATUSES.includes(j.status));
  const active = snap.jobs.filter((j) => ACTIVE_STATUSES.includes(j.status));
  const done = snap.jobs.filter((j) => DONE_STATUSES.includes(j.status)).slice(0, 15);
  const cancelled = snap.jobs.filter((j) => j.status === 'CANCELLED' || j.status === 'REFUNDED');
  const proName = (id: string | null) => snap.professionals.find((p) => p.id === id)?.name ?? '—';

  return (
    <div className="crm-page">
      <h1 className="text-2xl font-black text-mist-100">לוח עבודות</h1>

      {/* Open — the dispatch monitor */}
      <h2 className="mt-4 flex items-center gap-2 text-sm font-black text-mist-500">
        📡 בהפצה כרגע ({open.length})
      </h2>
      {open.length === 0 ? (
        <p className="surface mt-2 rounded-card p-4 text-sm text-mist-500">אין עבודות בהפצה ✅</p>
      ) : (
        <div className="mt-2 grid gap-3 lg:grid-cols-2">
          {open.map((job) => {
            const eligible = eligiblePros(job, snap.professionals);
            const ranked = rankPros(job, eligible, snap.config.dispatch);
            const wave = waveState(job, ranked, snap.config.dispatch);
            const fee = job.feeModel === 'fee' ? currentFee(job) : 0;
            return (
              <article key={job.id} className={`surface rounded-card p-4 ${job.urgent ? 'ring-2 ring-red-500' : ''}`}>
                <div className="flex items-center justify-between">
                  <span className="font-black text-mist-100">
                    {itemsLabel(job.items)} · {cityName(job.city)}
                  </span>
                  {job.urgent && <Badge className="bg-red-500/15 text-red-600">🚨 URGENT</Badge>}
                </div>
                <div className="mt-1 text-sm text-mist-300">
                  {job.date === todayIso() ? 'היום' : formatDateHe(job.date)} · {windowLabel(job.windowStart, job.windowEnd)} ·{' '}
                  {formatPrice(job.customerPrice)} ללקוח
                </div>
                <div className="mt-2 rounded-xl bg-ink-900 p-3 text-sm">
                  <div className="flex flex-wrap items-center gap-x-4 gap-y-1">
                    <span className="font-black text-brand-400">Wave {wave.waveIndex + 1}</span>
                    <span className="text-mist-300">👁️ {wave.visible.length} מנקים רואים · {eligible.length} זכאים</span>
                    {wave.nextWaveInSec !== null && (
                      <span className="text-mist-500">הרחבה בעוד {wave.nextWaveInSec} שנ׳</span>
                    )}
                    {job.redispatchCount > 0 && <span className="text-amber-600">↻ הופץ מחדש ×{job.redispatchCount}</span>}
                  </div>
                  {job.feeModel === 'fee' && (
                    <div className="mt-1.5 text-mist-100">
                      מחיר נוכחי למנקה:{' '}
                      {fee < job.baseFee && (
                        <span className="me-1 text-xs text-mist-500 line-through">{formatPrice(job.baseFee)}</span>
                      )}
                      <b className="text-brand-400">{formatPrice(fee)}</b>
                      <span className="text-xs text-mist-500"> (רצפה: {formatPrice(job.decaySteps[job.decaySteps.length - 1]?.fee ?? job.baseFee)})</span>
                    </div>
                  )}
                  {eligible.length === 0 && (
                    <div className="mt-1.5 font-bold text-red-600">⚠️ אין מנקים זכאים Online — ראו מפה/גיוס</div>
                  )}
                </div>
                <div className="mt-2 flex gap-2 text-xs">
                  <button
                    type="button"
                    onClick={() => { setReason(''); setCancelling(job); }}
                    className="rounded-full bg-red-500/10 px-3 py-1.5 font-bold text-red-700"
                  >
                    ביטול עבודה
                  </button>
                  <span className="text-mist-500 self-center">בהפצה {job.dispatchStartedAt ? relativeTimeHe(job.dispatchStartedAt) : ''}</span>
                </div>
              </article>
            );
          })}
        </div>
      )}

      {/* Active */}
      <h2 className="mt-6 text-sm font-black text-mist-500">🚗 בביצוע ({active.length})</h2>
      <div className="mt-2 grid gap-3 lg:grid-cols-2">
        {active.map((job) => (
          <article key={job.id} className="surface rounded-card p-4">
            <div className="flex items-center justify-between">
              <span className="font-black text-mist-100">{itemsLabel(job.items)} · {cityName(job.city)}</span>
              <Badge className="bg-brand-500/10 text-brand-400">{JOB_STATUS_LABELS[job.status]}</Badge>
            </div>
            <div className="mt-1 text-sm text-mist-300">
              🧽 {proName(job.assignedProId)} · {job.date === todayIso() ? 'היום' : formatDateHe(job.date)} ·{' '}
              {windowLabel(job.windowStart, job.windowEnd)}
            </div>
            <div className="mt-1 text-sm text-mist-300">
              👤 {job.customerName} · {formatPrice(job.customerPrice)}
              {job.feeModel === 'fee'
                ? ` · נמכרה ב-${formatPrice(job.purchaseFee ?? 0)}`
                : ` · Payout ${formatPrice(job.payoutAmount ?? 0)}`}
            </div>
            <button
              type="button"
              onClick={() => { setReason(''); setCancelling(job); }}
              className="mt-2 rounded-full bg-red-500/10 px-3 py-1.5 text-xs font-bold text-red-700"
            >
              ביטול (לקוח/מנהל)
            </button>
          </article>
        ))}
        {active.length === 0 && <p className="surface rounded-card p-4 text-sm text-mist-500">אין עבודות בביצוע כרגע</p>}
      </div>

      {/* Done */}
      <h2 className="mt-6 text-sm font-black text-mist-500">✅ הושלמו לאחרונה</h2>
      <div className="mt-2 grid gap-3 lg:grid-cols-2">
        {done.map((job) => (
          <article key={job.id} className="surface rounded-card p-4">
            <div className="flex items-center justify-between">
              <span className="font-black text-mist-100">{itemsLabel(job.items)} · {cityName(job.city)}</span>
              {job.review ? (
                <Badge className="bg-amber-500/15 text-amber-700">⭐ {job.review.stars}</Badge>
              ) : (
                <Badge className="bg-ink-800 text-mist-500">ממתין לדירוג</Badge>
              )}
            </div>
            <div className="mt-1 text-sm text-mist-300">
              🧽 {proName(job.assignedProId)} · {formatDateHe(job.date)} · {job.feeModel === 'payout' ? 'Payout Model' : 'Fee Model'}
            </div>
            <JobEconomics job={job} />
            {!job.review && (
              <button
                type="button"
                onClick={async () => {
                  const url = `${window.location.origin}/clean/review/${job.id}`;
                  try {
                    await navigator.clipboard.writeText(url);
                    setCopied(job.id);
                  } catch {
                    window.prompt('קישור הדירוג:', url);
                  }
                }}
                className="mt-2 rounded-full bg-ink-800 px-3 py-1.5 text-xs font-bold text-mist-100"
              >
                {copied === job.id ? '✓ הקישור הועתק' : '🔗 העתק קישור דירוג ללקוח'}
              </button>
            )}
          </article>
        ))}
      </div>

      {/* Cancelled */}
      {cancelled.length > 0 && (
        <>
          <h2 className="mt-6 text-sm font-black text-mist-500">🚫 בוטלו</h2>
          <div className="mt-2 space-y-2">
            {cancelled.map((job) => (
              <div key={job.id} className="surface flex flex-wrap items-center justify-between gap-2 rounded-card p-3 text-sm">
                <span className="text-mist-100">
                  {itemsLabel(job.items)} · {cityName(job.city)} · {job.cancellation?.reason}
                </span>
                <span className="flex items-center gap-2">
                  <Badge className="bg-red-500/15 text-red-600">{JOB_STATUS_LABELS[job.status]}</Badge>
                  <button
                    type="button"
                    onClick={() => actions.redispatchJob(job.id)}
                    className="rounded-full bg-brand-500/10 px-3 py-1 text-xs font-bold text-brand-400"
                  >
                    ↻ החזר להפצה
                  </button>
                </span>
              </div>
            ))}
          </div>
        </>
      )}

      {snap.jobs.length === 0 && <EmptyState emoji="🧾" title="אין עבודות עדיין" />}

      <Modal open={Boolean(cancelling)} onClose={() => setCancelling(null)} title="ביטול עבודה">
        {cancelling && (
          <div className="space-y-3">
            <p className="text-sm text-mist-300">
              ביטול ע״י לקוח/מנהל לפני יציאת המנקה מחזיר לו אוטומטית את דמי העבודה.
            </p>
            <input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="סיבת הביטול" className={inputClass} />
            <button
              type="button"
              disabled={reason.trim().length < 3}
              onClick={async () => {
                await actions.cancelJob(cancelling.id, 'customer', reason.trim(), session.userId ?? 'admin');
                setCancelling(null);
              }}
              className={`${btnDanger} w-full`}
            >
              אישור ביטול
            </button>
          </div>
        )}
      </Modal>

      <p className="mt-8 text-center text-xs text-mist-500">
        טיפ: פתחו את <Link href="/pro" className="font-bold text-brand-400">/pro</Link> בלשונית נוספת כדי לראות את הצד של המנקה
      </p>
    </div>
  );
}

export default function JobsPage() {
  return (
    <HqShell>
      <JobsBoard />
    </HqShell>
  );
}
