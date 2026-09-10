'use client';

import { useState } from 'react';
import { HqShell } from '@/components/platform/HqShell';
import { Badge, btnPrimary, inputClass, Modal } from '@/components/platform/ui';
import { cityName, formatPrice, itemsLabel, relativeTimeHe } from '@/lib/platform/catalog';
import { LEVEL_META, proLevel, proScore } from '@/lib/platform/scoring';
import { actions, usePlatform, walletBalance } from '@/lib/platform/store';
import type { Complaint } from '@/lib/platform/types';

/** Professionals admin: approval queue, quality scores, and complaints. */

const COMPLAINT_LABELS: Record<Complaint['category'], string> = {
  no_show: 'לא הגיע',
  late: 'איחר',
  quality: 'איכות עבודה',
  damage: 'נזק',
  price: 'מחיר',
  behavior: 'התנהגות',
  other: 'אחר',
};

function ProsAdmin() {
  const snap = usePlatform();
  const [resolving, setResolving] = useState<Complaint | null>(null);
  const [resolution, setResolution] = useState('');

  if (!snap) return null;

  const pending = snap.professionals.filter((p) => !p.approved);
  const approved = snap.professionals
    .filter((p) => p.approved)
    .map((p) => ({ pro: p, score: proScore(p) }))
    .sort((a, b) => b.score - a.score);
  const complaints = snap.complaints.slice().sort((a, b) => b.at.localeCompare(a.at));

  return (
    <div className="crm-page">
      <h1 className="text-2xl font-black text-mist-100">בעלי מקצוע</h1>

      {pending.length > 0 && (
        <>
          <h2 className="mt-4 text-sm font-black text-amber-600">⏳ ממתינים לאישור ({pending.length})</h2>
          <div className="mt-2 space-y-2">
            {pending.map((p) => (
              <div key={p.id} className="surface flex flex-wrap items-center justify-between gap-3 rounded-card p-4">
                <div>
                  <div className="font-black text-mist-100">{p.name}</div>
                  <div className="text-xs text-mist-500">
                    {p.businessName} · {cityName(p.city)} · {p.yearsExperience} שנות ניסיון · נרשם {relativeTimeHe(p.createdAt)}
                  </div>
                </div>
                <button type="button" onClick={() => actions.updatePro(p.id, { approved: true })} className={btnPrimary}>
                  ✓ אשר חשבון
                </button>
              </div>
            ))}
          </div>
        </>
      )}

      <h2 className="mt-5 text-sm font-black text-mist-500">רשת המנקים ({approved.length})</h2>
      <div className="mt-2 grid gap-3 lg:grid-cols-2">
        {approved.map(({ pro, score }) => {
          const level = LEVEL_META[proLevel(pro)];
          const completion = pro.totalTaken > 0 ? Math.round((pro.completedJobs / pro.totalTaken) * 100) : 100;
          return (
            <div key={pro.id} className="surface rounded-card p-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <span className={`h-2.5 w-2.5 rounded-full ${pro.online ? 'bg-emerald-500' : 'bg-ink-600'}`} />
                  <span className="font-black text-mist-100">{pro.name}</span>
                  <span className="text-xs">{level.emoji}</span>
                </div>
                <Badge className={score >= 75 ? 'bg-emerald-500/15 text-emerald-700' : score >= 50 ? 'bg-amber-500/15 text-amber-700' : 'bg-red-500/15 text-red-600'}>
                  Score {score}
                </Badge>
              </div>
              <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-mist-500">
                <span>{cityName(pro.city)} (+{pro.areas.length} אזורים)</span>
                <span>⭐ {pro.rating || '—'} ({pro.ratingCount})</span>
                <span>{pro.completedJobs} הושלמו · {completion}%</span>
                <span className={pro.cancelledJobs > 3 ? 'font-bold text-red-600' : ''}>ביטולים: {pro.cancelledJobs}</span>
                <span>ארנק: {formatPrice(walletBalance(snap, pro.id))}</span>
                {pro.complaintsCount > 0 && <span className="font-bold text-red-600">תלונות: {pro.complaintsCount}</span>}
              </div>
            </div>
          );
        })}
      </div>

      <h2 className="mt-6 text-sm font-black text-mist-500">📣 תלונות ({complaints.filter((c) => c.status !== 'resolved').length} פתוחות)</h2>
      <div className="mt-2 space-y-2 pb-6">
        {complaints.length === 0 && <p className="surface rounded-card p-4 text-sm text-mist-500">אין תלונות 🎉</p>}
        {complaints.map((c) => {
          const job = snap.jobs.find((j) => j.id === c.jobId);
          return (
            <div key={c.id} className="surface rounded-card p-4">
              <div className="flex items-center justify-between">
                <span className="font-bold text-mist-100">
                  {COMPLAINT_LABELS[c.category]} · {job ? itemsLabel(job.items) : c.jobId}
                </span>
                <Badge className={c.status === 'resolved' ? 'bg-emerald-500/15 text-emerald-700' : 'bg-red-500/15 text-red-600'}>
                  {c.status === 'resolved' ? 'טופלה' : 'פתוחה'}
                </Badge>
              </div>
              <p className="mt-1 text-sm text-mist-300">“{c.text}”</p>
              <p className="mt-1 text-xs text-mist-500">
                {job ? `${job.customerName} · מנקה: ${snap.professionals.find((p) => p.id === job.assignedProId)?.name ?? '—'} · ` : ''}
                {relativeTimeHe(c.at)}
              </p>
              {c.status === 'resolved' ? (
                <p className="mt-1 text-xs font-bold text-emerald-700">פתרון: {c.resolution}</p>
              ) : (
                <button
                  type="button"
                  onClick={() => { setResolution(''); setResolving(c); }}
                  className="mt-2 rounded-full bg-ink-800 px-3 py-1.5 text-xs font-bold text-mist-100"
                >
                  טפל בתלונה
                </button>
              )}
            </div>
          );
        })}
      </div>

      <Modal open={Boolean(resolving)} onClose={() => setResolving(null)} title="טיפול בתלונה">
        {resolving && (
          <div className="space-y-3">
            <input value={resolution} onChange={(e) => setResolution(e.target.value)} placeholder="מה סוכם / איך טופל" className={inputClass} />
            <button
              type="button"
              disabled={resolution.trim().length < 3}
              onClick={async () => {
                await actions.resolveComplaint(resolving.id, resolution.trim());
                setResolving(null);
              }}
              className={`${btnPrimary} w-full`}
            >
              סמן כטופלה
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}

export default function ProsPage() {
  return (
    <HqShell>
      <ProsAdmin />
    </HqShell>
  );
}
