'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { ProShell } from '@/components/platform/ProShell';
import { Badge, btnPrimary, EmptyState, Modal } from '@/components/platform/ui';
import {
  cityName,
  formatDateHe,
  formatPrice,
  itemsLabel,
  todayIso,
  windowLabel,
} from '@/lib/platform/catalog';
import { jobVisibleToPro } from '@/lib/platform/dispatch';
import { currentFee } from '@/lib/platform/pricing';
import { OPEN_STATUSES } from '@/lib/platform/stateMachine';
import { actions, usePlatform, useSession, walletBalance } from '@/lib/platform/store';
import type { Job } from '@/lib/platform/types';
import { friendlyMessage } from '@/lib/social/errors';

/**
 * The internal marketplace: only CLOSED jobs, customer identity masked until
 * purchase. Waves and price decay are recomputed every few seconds, so a
 * job's fee visibly drops while it waits.
 */

function JobsFeed() {
  const snap = usePlatform();
  const session = useSession();
  const [confirming, setConfirming] = useState<Job | null>(null);
  const [taken, setTaken] = useState<Job | null>(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [, setTick] = useState(0);

  // Re-render every 10s: decay steps advance and waves open without reloads.
  useEffect(() => {
    const t = setInterval(() => setTick((x) => x + 1), 10_000);
    return () => clearInterval(t);
  }, []);

  if (!snap || !session?.userId) return null;
  const me = snap.professionals.find((p) => p.id === session.userId);
  if (!me) return null;

  const balance = walletBalance(snap, me.id);
  const unread = snap.notifications.filter((n) => n.toId === me.id && !n.read).length;

  const openJobs = snap.jobs
    .filter((j) => OPEN_STATUSES.includes(j.status))
    .map((job) => ({ job, vis: jobVisibleToPro(job, me, snap.professionals, snap.config.dispatch) }))
    .filter((x) => (me.online ? x.vis.visible : false))
    .sort((a, b) => Number(b.job.urgent) - Number(a.job.urgent) || a.vis.distanceKm - b.vis.distanceKm);

  async function take(job: Job) {
    setBusy(true);
    setError('');
    try {
      const result = await actions.takeJob(job.id, me!.id);
      setConfirming(null);
      setTaken(result);
    } catch (e) {
      setError(friendlyMessage(e, 'קבלת העבודה נכשלה'));
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crm-page px-4 pt-4">
      <header className="flex items-center justify-between">
        <div>
          <div className="text-lg font-black text-mist-100">שלום, {me.name.split(' ')[0]} 👋</div>
          <div className="text-xs text-mist-500">
            יתרת ארנק: <b className="text-emerald-600">{formatPrice(balance)}</b>
          </div>
        </div>
        <button
          type="button"
          aria-label="התראות"
          onClick={() => actions.markNotificationsRead(me.id)}
          className="relative rounded-full bg-ink-800 px-3 py-2"
        >
          🔔
          {unread > 0 && (
            <span className="absolute -left-1 -top-1 flex h-5 w-5 items-center justify-center rounded-full bg-red-600 text-xs font-black text-white">
              {unread}
            </span>
          )}
        </button>
      </header>

      {/* Online toggle — the big switch. */}
      <button
        type="button"
        onClick={() => actions.updatePro(me.id, { online: !me.online })}
        aria-pressed={me.online}
        className={`mt-4 flex w-full items-center justify-between rounded-card p-5 font-black transition-colors ${
          me.online ? 'bg-emerald-500 text-white' : 'surface text-mist-100'
        }`}
      >
        <span className="text-lg">{me.online ? '✅ זמין לקבל עבודות' : '💤 לא זמין כרגע'}</span>
        <span
          className={`flex h-8 w-14 items-center rounded-full p-1 transition-colors ${
            me.online ? 'justify-end bg-white/30' : 'justify-start bg-ink-700'
          }`}
        >
          <span className="h-6 w-6 rounded-full bg-white shadow" />
        </span>
      </button>

      <h1 className="mt-6 text-xl font-black text-mist-100">
        עבודות באזור שלך {openJobs.length > 0 && <span className="text-brand-400">({openJobs.length})</span>}
      </h1>

      {!me.online ? (
        <div className="mt-4">
          <EmptyState emoji="💤" title="אתה במצב לא זמין" subtitle="הפעל זמינות למעלה כדי לראות ולקבל עבודות" />
        </div>
      ) : openJobs.length === 0 ? (
        <div className="mt-4">
          <EmptyState emoji="🕊️" title="אין עבודות פתוחות כרגע" subtitle="נשלח לך התראה ברגע שתיכנס עבודה באזור שלך" />
        </div>
      ) : (
        <div className="mt-4 space-y-4">
          {openJobs.map(({ job, vis }) => {
            const fee = job.feeModel === 'fee' ? currentFee(job) : 0;
            const keep = job.feeModel === 'fee' ? job.customerPrice - fee : (job.payoutAmount ?? 0);
            const decayed = job.feeModel === 'fee' && fee < job.baseFee;
            return (
              <article key={job.id} className={`surface rounded-card p-4 ${job.urgent ? 'ring-2 ring-red-500' : ''}`}>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    {job.urgent ? (
                      <Badge className="bg-red-500/15 text-red-600">🚨 דחוף</Badge>
                    ) : (
                      <Badge className="bg-brand-500/10 text-brand-400">🔥 חדש</Badge>
                    )}
                    <span className="font-black text-mist-100">{cityName(job.city)}</span>
                  </div>
                  <span className="text-xs font-bold text-mist-500">📍 {vis.distanceKm.toFixed(1)} ק״מ</span>
                </div>

                <div className="mt-3 text-lg font-bold text-mist-100">{itemsLabel(job.items)}</div>
                <div className="mt-1 text-sm text-mist-300">
                  {job.date === todayIso() ? 'היום' : formatDateHe(job.date)} · {windowLabel(job.windowStart, job.windowEnd)}
                </div>
                {job.condition.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-1.5">
                    {job.condition.map((c) => (
                      <span key={c} className="rounded-full bg-ink-800 px-2 py-0.5 text-xs text-mist-300">
                        {c}
                      </span>
                    ))}
                  </div>
                )}
                {job.photos.length > 0 && (
                  <div className="mt-2 text-xs text-mist-500">📷 {job.photos.length} תמונות מצורפות</div>
                )}

                <div className="mt-3 grid grid-cols-3 gap-2 rounded-xl bg-ink-900 p-3 text-center">
                  <div>
                    <div className="text-xs text-mist-500">מחיר ללקוח</div>
                    <div className="font-black text-mist-100">{formatPrice(job.customerPrice)}</div>
                  </div>
                  <div>
                    <div className="text-xs text-mist-500">
                      {job.feeModel === 'fee' ? 'מחיר העבודה' : 'מודל'}
                    </div>
                    <div className="font-black text-brand-400">
                      {job.feeModel === 'fee' ? (
                        <>
                          {decayed && (
                            <span className="me-1 text-xs font-bold text-mist-500 line-through">
                              {formatPrice(job.baseFee)}
                            </span>
                          )}
                          {formatPrice(fee)}
                        </>
                      ) : (
                        'תשלום ביצוע'
                      )}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs text-mist-500">נשאר לך</div>
                    <div className="font-black text-emerald-600">{formatPrice(keep)}</div>
                  </div>
                </div>

                <button type="button" onClick={() => { setError(''); setConfirming(job); }} className={`${btnPrimary} mt-3 w-full text-lg`}>
                  קח את העבודה 🤝
                </button>
              </article>
            );
          })}
        </div>
      )}

      {/* Purchase confirmation */}
      <Modal open={Boolean(confirming)} onClose={() => setConfirming(null)} title="אישור קבלת עבודה">
        {confirming && (
          <div className="space-y-3">
            <p className="text-mist-100">
              <b>{itemsLabel(confirming.items)}</b> · {cityName(confirming.city)}
            </p>
            {confirming.feeModel === 'fee' ? (
              <p className="rounded-xl bg-ink-900 p-3 text-sm text-mist-100">
                הארנק שלך יחויב ב-<b className="text-brand-400">{formatPrice(currentFee(confirming))}</b>.
                <br />
                יתרה נוכחית: <b>{formatPrice(balance)}</b> → לאחר החיוב:{' '}
                <b className="text-emerald-600">{formatPrice(balance - currentFee(confirming))}</b>
              </p>
            ) : (
              <p className="rounded-xl bg-ink-900 p-3 text-sm text-mist-100">
                עבודה במודל תשלום: החברה גובה מהלקוח ואתה מקבל{' '}
                <b className="text-emerald-600">{formatPrice(confirming.payoutAmount ?? 0)}</b> על הביצוע.
              </p>
            )}
            <p className="text-xs text-mist-500">מיד לאחר האישור ייחשפו פרטי הלקוח המלאים.</p>
            {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-700">{error}</p>}
            <button type="button" disabled={busy} onClick={() => take(confirming)} className={`${btnPrimary} w-full`}>
              {busy ? 'מבצע…' : 'אישור — קח את העבודה'}
            </button>
          </div>
        )}
      </Modal>

      {/* Post-purchase reveal */}
      <Modal open={Boolean(taken)} onClose={() => setTaken(null)} title="העבודה שלך! 🎉">
        {taken && (
          <div className="space-y-3">
            <p className="rounded-xl bg-emerald-500/10 p-3 font-bold text-emerald-700">פרטי הלקוח נפתחו:</p>
            <div className="space-y-1 text-mist-100">
              <p>👤 {taken.customerName}</p>
              <p dir="ltr" className="text-right">📞 {taken.customerPhone}</p>
              <p>📍 {taken.address}</p>
              <p>
                🗓️ {taken.date === todayIso() ? 'היום' : formatDateHe(taken.date)} ·{' '}
                {windowLabel(taken.windowStart, taken.windowEnd)}
              </p>
              <p>💵 לגבות מהלקוח: <b>{formatPrice(taken.customerPrice)}</b></p>
            </div>
            <Link href="/pro/jobs" className={`${btnPrimary} w-full`}>
              לעבודות שלי ←
            </Link>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function ProHome() {
  return (
    <ProShell>
      <JobsFeed />
    </ProShell>
  );
}
