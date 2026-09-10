'use client';

import { useState } from 'react';
import { ProShell } from '@/components/platform/ProShell';
import { Badge, btnDanger, btnPrimary, EmptyState, inputClass, Modal } from '@/components/platform/ui';
import {
  cityName,
  formatDateHe,
  formatPrice,
  itemsLabel,
  todayIso,
  windowLabel,
} from '@/lib/platform/catalog';
import {
  ACTIVE_STATUSES,
  DONE_STATUSES,
  JOB_STATUS_LABELS,
  PRO_NEXT_STATUS,
} from '@/lib/platform/stateMachine';
import { actions, usePlatform, useSession } from '@/lib/platform/store';
import type { Job } from '@/lib/platform/types';

/** The professional's active jobs (with the status-advance flow) + history. */

function telHref(phone: string) {
  return `tel:${phone.replace(/[^\d+]/g, '')}`;
}

function wazeHref(address: string) {
  return `https://waze.com/ul?q=${encodeURIComponent(address)}&navigate=yes`;
}

function MyJobs() {
  const snap = usePlatform();
  const session = useSession();
  const [cancelling, setCancelling] = useState<Job | null>(null);
  const [reason, setReason] = useState('');
  const [busy, setBusy] = useState(false);

  if (!snap || !session?.userId) return null;
  const myId = session.userId;

  const active = snap.jobs
    .filter((j) => j.assignedProId === myId && ACTIVE_STATUSES.includes(j.status))
    .sort((a, b) => a.date.localeCompare(b.date) || a.windowStart.localeCompare(b.windowStart));
  const history = snap.jobs
    .filter((j) => j.assignedProId === myId && DONE_STATUSES.includes(j.status))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));

  return (
    <div className="crm-page px-4 pt-4">
      <h1 className="text-2xl font-black text-mist-100">העבודות שלי</h1>

      <h2 className="mt-4 text-sm font-black text-mist-500">פעילות ({active.length})</h2>
      {active.length === 0 ? (
        <div className="mt-2">
          <EmptyState emoji="🧰" title="אין עבודות פעילות" subtitle="עבודות שתיקח מהלוח יופיעו כאן" />
        </div>
      ) : (
        <div className="mt-2 space-y-4">
          {active.map((job) => {
            const next = PRO_NEXT_STATUS[job.status];
            return (
              <article key={job.id} className="surface rounded-card p-4">
                <div className="flex items-center justify-between">
                  <span className="font-black text-mist-100">{itemsLabel(job.items)}</span>
                  <Badge className="bg-brand-500/10 text-brand-400">{JOB_STATUS_LABELS[job.status]}</Badge>
                </div>
                <div className="mt-2 space-y-1 text-sm text-mist-100">
                  <p>👤 {job.customerName}</p>
                  <p>📍 {job.address || cityName(job.city)}</p>
                  <p>
                    🗓️ {job.date === todayIso() ? 'היום' : formatDateHe(job.date)} ·{' '}
                    {windowLabel(job.windowStart, job.windowEnd)}
                  </p>
                  <p>
                    💵 לגבות: <b>{formatPrice(job.customerPrice)}</b>
                    {job.feeModel === 'payout' && (
                      <span className="text-mist-500"> (מודל תשלום — התשלום שלך {formatPrice(job.payoutAmount ?? 0)})</span>
                    )}
                  </p>
                  {job.notes && <p className="text-mist-300">📝 {job.notes}</p>}
                </div>
                <div className="mt-3 flex gap-2">
                  <a href={telHref(job.customerPhone)} className="flex-1 rounded-xl bg-ink-800 py-2.5 text-center font-bold text-mist-100">
                    📞 חייג
                  </a>
                  <a
                    href={wazeHref(job.address || cityName(job.city))}
                    target="_blank"
                    rel="noreferrer"
                    className="flex-1 rounded-xl bg-ink-800 py-2.5 text-center font-bold text-mist-100"
                  >
                    🚗 Waze
                  </a>
                </div>
                {next && (
                  <button
                    type="button"
                    onClick={() => actions.advanceJob(job.id, next.next, myId)}
                    className={`${btnPrimary} mt-3 w-full`}
                  >
                    {next.label} ←
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => { setReason(''); setCancelling(job); }}
                  className="mt-2 w-full text-center text-xs font-bold text-red-700"
                >
                  ביטול עבודה
                </button>
              </article>
            );
          })}
        </div>
      )}

      <h2 className="mt-8 text-sm font-black text-mist-500">היסטוריה ({history.length})</h2>
      <div className="mt-2 space-y-2 pb-6">
        {history.map((job) => (
          <div key={job.id} className="surface flex items-center justify-between rounded-card p-3 text-sm">
            <div>
              <div className="font-bold text-mist-100">{itemsLabel(job.items)}</div>
              <div className="text-xs text-mist-500">
                {cityName(job.city)} · {formatDateHe(job.date)}
                {job.review ? ` · ⭐ ${job.review.stars}` : ''}
              </div>
            </div>
            <div className="text-end">
              <div className="font-black text-emerald-600">
                {formatPrice(job.feeModel === 'payout' ? job.payoutAmount ?? 0 : job.customerPrice - (job.purchaseFee ?? 0))}
              </div>
              <div className="text-xs text-mist-500">{JOB_STATUS_LABELS[job.status]}</div>
            </div>
          </div>
        ))}
      </div>

      <Modal open={Boolean(cancelling)} onClose={() => setCancelling(null)} title="ביטול עבודה">
        {cancelling && (
          <div className="space-y-3">
            <p className="rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-700">
              שים לב: ביטול עבודה שנרכשה אינו מזכה בהחזר, פוגע בציון שלך, והעבודה תוצע מיד למנקים אחרים.
            </p>
            <input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="סיבת הביטול"
              className={inputClass}
            />
            <button
              type="button"
              disabled={reason.trim().length < 3 || busy}
              onClick={async () => {
                setBusy(true);
                try {
                  await actions.cancelJob(cancelling.id, 'professional', reason.trim(), myId);
                  setCancelling(null);
                } finally {
                  setBusy(false);
                }
              }}
              className={`${btnDanger} w-full`}
            >
              {busy ? 'מבטל…' : 'אישור ביטול'}
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function ProJobsPage() {
  return (
    <ProShell>
      <MyJobs />
    </ProShell>
  );
}
