'use client';

import Link from 'next/link';
import { use, useState } from 'react';
import { btnPrimary, inputClass, Modal, PageSkeleton, Stars } from '@/components/platform/ui';
import { itemsLabel } from '@/lib/platform/catalog';
import { actions, usePlatform } from '@/lib/platform/store';
import type { ComplaintCategory } from '@/lib/platform/types';

/**
 * The rating link the customer receives after the job is completed. Also
 * carries the "פתח תלונה" escape hatch, so problems reach support instead
 * of Google reviews.
 */

const COMPLAINT_CATEGORIES: { value: ComplaintCategory; label: string }[] = [
  { value: 'no_show', label: 'לא הגיע' },
  { value: 'late', label: 'איחר' },
  { value: 'quality', label: 'איכות העבודה' },
  { value: 'damage', label: 'נזק' },
  { value: 'price', label: 'מחיר' },
  { value: 'behavior', label: 'התנהגות' },
  { value: 'other', label: 'אחר' },
];

export default function ReviewPage({ params }: { params: Promise<{ jobId: string }> }) {
  const { jobId } = use(params);
  const snap = usePlatform();
  const [stars, setStars] = useState(0);
  const [subs, setSubs] = useState({ quality: 0, service: 0, punctuality: 0, professionalism: 0 });
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');
  const [complaintOpen, setComplaintOpen] = useState(false);
  const [complaintCat, setComplaintCat] = useState<ComplaintCategory>('quality');
  const [complaintText, setComplaintText] = useState('');
  const [complaintSent, setComplaintSent] = useState(false);

  if (!snap) return <PageSkeleton />;
  const job = snap.jobs.find((j) => j.id === jobId);

  if (!job) {
    return (
      <div className="mx-auto max-w-md px-4 py-16 text-center text-mist-300">
        הקישור אינו תקין או שהעבודה לא נמצאה.
      </div>
    );
  }

  if (job.review || done) {
    return (
      <div className="crm-page mx-auto max-w-md px-4 py-16 text-center">
        <div className="text-5xl">💙</div>
        <h1 className="mt-4 text-2xl font-black text-mist-100">תודה על הדירוג!</h1>
        <p className="mt-2 text-mist-300">
          קיבלתם <b>₪25 קרדיט</b> להזמנה הבאה — נשמח לרענן לכם את הבית שוב.
        </p>
        <Link href="/clean/quote" className={`${btnPrimary} mt-8`}>
          הזמינו ניקוי נוסף
        </Link>
      </div>
    );
  }

  const canSubmit = stars > 0;

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await actions.submitReview(jobId, {
        stars,
        quality: subs.quality || stars,
        service: subs.service || stars,
        punctuality: subs.punctuality || stars,
        professionalism: subs.professionalism || stars,
        text: text.trim(),
      });
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'שליחת הדירוג נכשלה');
    } finally {
      setBusy(false);
    }
  }

  const subFields: { key: keyof typeof subs; label: string }[] = [
    { key: 'quality', label: 'איכות הניקוי' },
    { key: 'service', label: 'שירות' },
    { key: 'punctuality', label: 'עמידה בזמנים' },
    { key: 'professionalism', label: 'מקצועיות' },
  ];

  return (
    <div className="crm-page mx-auto max-w-md px-4 pb-16 pt-8">
      <div className="text-center">
        <div className="text-sm font-black text-brand-400">✨ קלין ישראל</div>
        <h1 className="mt-3 text-2xl font-black text-mist-100">איך היה הניקוי?</h1>
        <p className="mt-1 text-sm text-mist-500">{itemsLabel(job.items)}</p>
      </div>

      <div className="surface mt-6 rounded-card p-5 text-center">
        <div className="text-sm font-bold text-mist-300">דירוג כללי</div>
        <div className="mt-2 flex justify-center">
          <Stars value={stars} onChange={setStars} size="text-4xl" />
        </div>
      </div>

      <div className="surface mt-4 space-y-3 rounded-card p-5">
        {subFields.map(({ key, label }) => (
          <div key={key} className="flex items-center justify-between">
            <span className="text-sm font-bold text-mist-100">{label}</span>
            <Stars value={subs[key]} onChange={(n) => setSubs({ ...subs, [key]: n })} size="text-xl" />
          </div>
        ))}
      </div>

      <textarea
        value={text}
        onChange={(e) => setText(e.target.value)}
        placeholder="ספרו לנו עוד (רשות)"
        rows={3}
        className={`${inputClass} mt-4`}
      />

      {error && <p className="mt-3 rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-700">{error}</p>}

      <button type="button" disabled={!canSubmit || busy} onClick={submit} className={`${btnPrimary} mt-4 w-full`}>
        {busy ? 'שולח…' : 'שליחת דירוג'}
      </button>

      <button
        type="button"
        onClick={() => setComplaintOpen(true)}
        className="mt-6 w-full text-center text-sm font-bold text-red-700"
      >
        נתקלתם בבעיה? פתחו תלונה
      </button>

      <Modal open={complaintOpen} onClose={() => setComplaintOpen(false)} title="פתיחת תלונה">
        {complaintSent ? (
          <p className="text-mist-100">התלונה התקבלה — צוות השירות שלנו יחזור אליכם בהקדם. 🙏</p>
        ) : (
          <div className="space-y-3">
            <div className="flex flex-wrap gap-2">
              {COMPLAINT_CATEGORIES.map((c) => (
                <button
                  key={c.value}
                  type="button"
                  onClick={() => setComplaintCat(c.value)}
                  aria-pressed={complaintCat === c.value}
                  className={`rounded-full px-3 py-1.5 text-sm font-bold ${
                    complaintCat === c.value ? 'bg-red-600 text-white' : 'bg-ink-800 text-mist-100'
                  }`}
                >
                  {c.label}
                </button>
              ))}
            </div>
            <textarea
              value={complaintText}
              onChange={(e) => setComplaintText(e.target.value)}
              placeholder="מה קרה?"
              rows={3}
              className={inputClass}
            />
            <button
              type="button"
              disabled={complaintText.trim().length < 3}
              onClick={async () => {
                await actions.openComplaint(jobId, complaintCat, complaintText.trim());
                setComplaintSent(true);
              }}
              className={`${btnPrimary} w-full`}
            >
              שליחת תלונה
            </button>
          </div>
        )}
      </Modal>
    </div>
  );
}
