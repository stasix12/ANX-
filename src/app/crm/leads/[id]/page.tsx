'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useCallback, useEffect, useState } from 'react';
import { CrmShell } from '@/components/crm/CrmShell';
import { StatusBadge } from '@/components/crm/StatusBadge';
import {
  CheckIcon,
  CloseIcon,
  MapPinIcon,
  NavigationIcon,
  PencilIcon,
  PhoneIcon,
  SpinnerIcon,
  TrashIcon,
  WhatsAppIcon,
} from '@/components/icons';
import {
  STATUS_OPTIONS,
  deleteLead,
  formatDateHe,
  formatDateLongHe,
  formatPrice,
  getLead,
  listLeadsByPhone,
  relativeTimeHe,
  setLeadStatus,
  sourceLabel,
  telUrl,
  wazeUrl,
  whatsAppUrl,
  type Lead,
  type LeadStatus,
} from '@/lib/crm/leads';

/**
 * One-tap WhatsApp openers with the message pre-filled (and still editable
 * before sending) — the four messages this business sends all day.
 */
function messageTemplates(lead: Lead): { label: string; text: string }[] {
  const first = lead.name.trim().split(/\s+/)[0] || lead.name;
  const when = lead.jobDate
    ? ` ב-${formatDateHe(lead.jobDate)}${lead.jobTime ? ` בשעה ${lead.jobTime}` : ''}`
    : '';
  return [
    { label: '🗓️ אישור עבודה', text: `היי ${first}, מאשר את עבודת הניקיון${when}. נתראה! 🙂` },
    { label: '🔔 תזכורת', text: `היי ${first}, תזכורת לעבודת הניקיון${when}. אשמח לאישור 🙂` },
    { label: '🚗 בדרך אליך', text: `היי ${first}, אני בדרך אליך! מגיע בעוד כ-30 דקות 🚗` },
    {
      label: '🙏 סיום ותודה',
      text: `תודה רבה ${first}! שמחתי לנקות אצלך 🧽 אם היית מרוצה — אשמח להמלצה קצרה. יום נהדר!`,
    },
  ];
}

function DetailRow({ label, value, dir }: { label: string; value: React.ReactNode; dir?: 'ltr' }) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-ink-700/60 py-3 last:border-b-0">
      <dt className="shrink-0 text-sm font-semibold text-mist-500">{label}</dt>
      <dd className="text-end text-sm font-bold" dir={dir}>
        {value}
      </dd>
    </div>
  );
}

export default function LeadDetailPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [lead, setLead] = useState<Lead | null>(null);
  const [history, setHistory] = useState<Lead[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [mutating, setMutating] = useState(false);

  const load = useCallback(async () => {
    try {
      const found = await getLead(id);
      setLead(found);
      setHistory(found?.phone ? await listLeadsByPhone(found.phone, found.id) : []);
      setError(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'טעינת הליד נכשלה.');
    } finally {
      setLoading(false);
    }
  }, [id]);

  useEffect(() => {
    void load();
  }, [load]);

  async function changeStatus(status: LeadStatus) {
    if (!lead) return;
    setMutating(true);
    try {
      await setLeadStatus(lead.id, status);
      setLead({ ...lead, status });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'עדכון הסטטוס נכשל.');
    } finally {
      setMutating(false);
    }
  }

  async function onDelete() {
    if (!lead) return;
    if (!window.confirm(`למחוק את הליד של ${lead.name} לצמיתות?`)) return;
    setMutating(true);
    try {
      await deleteLead(lead.id);
      router.replace('/crm/leads');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'המחיקה נכשלה.');
      setMutating(false);
    }
  }

  return (
    <CrmShell title="פרטי עבודה">
      {loading ? (
        <div className="grid place-items-center py-20">
          <SpinnerIcon className="h-8 w-8 animate-spin text-brand-500" />
        </div>
      ) : !lead ? (
        <p className="mt-8 text-center text-sm font-semibold text-mist-500">הליד לא נמצא.</p>
      ) : (
        <>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-2xl font-extrabold">{lead.name}</h2>
              {lead.jobDate ? (
                <p className="mt-1 text-sm font-semibold text-mist-300">
                  {formatDateLongHe(lead.jobDate)}
                  {lead.jobTime ? ` · ${lead.jobTime}` : ''}
                </p>
              ) : (
                <p className="mt-1 text-sm font-semibold text-mist-500">טרם נקבע מועד</p>
              )}
            </div>
            <StatusBadge status={lead.status} />
          </div>

          {/* Quick actions — the three things done standing next to the van. */}
          <div className="mt-5 grid grid-cols-3 gap-3">
            <a
              href={whatsAppUrl(lead.phone)}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex flex-col items-center gap-1.5 rounded-card bg-emerald-600 py-3.5 text-sm font-bold text-white transition-colors hover:bg-emerald-500 ${lead.phone ? '' : 'pointer-events-none opacity-40'}`}
            >
              <WhatsAppIcon className="h-6 w-6" />
              WhatsApp
            </a>
            <a
              href={telUrl(lead.phone)}
              className={`flex flex-col items-center gap-1.5 rounded-card bg-sky-600 py-3.5 text-sm font-bold text-white transition-colors hover:bg-sky-500 ${lead.phone ? '' : 'pointer-events-none opacity-40'}`}
            >
              <PhoneIcon className="h-6 w-6" />
              התקשר
            </a>
            <a
              href={wazeUrl(lead.address, lead.city)}
              target="_blank"
              rel="noopener noreferrer"
              className={`flex flex-col items-center gap-1.5 rounded-card bg-indigo-600 py-3.5 text-sm font-bold text-white transition-colors hover:bg-indigo-500 ${lead.address || lead.city ? '' : 'pointer-events-none opacity-40'}`}
            >
              <NavigationIcon className="h-6 w-6" />
              Waze
            </a>
          </div>

          {lead.phone ? (
            <div className="mt-4">
              <p className="mb-2 text-sm font-bold text-mist-300">הודעה מהירה בוואטסאפ</p>
              <div className="flex gap-2 overflow-x-auto pb-1">
                {messageTemplates(lead).map((template) => (
                  <a
                    key={template.label}
                    href={whatsAppUrl(lead.phone, template.text)}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="shrink-0 rounded-full border border-emerald-600/40 bg-emerald-500/10 px-4 py-2 text-sm font-bold text-emerald-700 transition-colors hover:bg-emerald-500/20"
                  >
                    {template.label}
                  </a>
                ))}
              </div>
            </div>
          ) : null}

          <dl className="mt-5 rounded-card border border-ink-700 surface px-4">
            <DetailRow label="טלפון" value={lead.phone || '—'} dir="ltr" />
            <DetailRow
              label="כתובת"
              value={
                <span className="inline-flex items-center gap-1.5">
                  <MapPinIcon className="h-4 w-4 text-mist-500" />
                  {[lead.address, lead.city].filter(Boolean).join(', ') || '—'}
                </span>
              }
            />
            <DetailRow label="שירות" value={lead.services.join(', ') || '—'} />
            <DetailRow label="מחיר" value={formatPrice(lead.price)} />
            <DetailRow label="מקור הליד" value={sourceLabel(lead.source)} />
            {lead.notes ? <DetailRow label="הערות" value={lead.notes} /> : null}
          </dl>

          <p className="mt-2 text-center text-xs font-semibold text-mist-500">
            נוצר {relativeTimeHe(lead.createdAt)}
            {lead.updatedAt !== lead.createdAt ? ` · עודכן ${relativeTimeHe(lead.updatedAt)}` : ''}
          </p>

          <fieldset className="mt-5" disabled={mutating}>
            <legend className="mb-2 text-sm font-bold text-mist-300">עדכון סטטוס</legend>
            <div className="flex flex-wrap gap-2">
              {STATUS_OPTIONS.map((option) => {
                const selected = lead.status === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    aria-pressed={selected}
                    onClick={() => changeStatus(option.value)}
                    className={`rounded-full border px-4 py-2 text-sm font-semibold transition-colors disabled:opacity-60 ${
                      selected
                        ? 'border-brand-500 bg-brand-500 text-on-brand'
                        : 'border-ink-600 bg-ink-850 text-mist-300 hover:border-ink-500'
                    }`}
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          </fieldset>

          <div className="mt-5 space-y-3">
            {lead.status !== 'completed' ? (
              <button
                type="button"
                disabled={mutating}
                onClick={() => changeStatus('completed')}
                className="flex w-full items-center justify-center gap-2 rounded-full bg-emerald-600 px-6 py-3.5 text-base font-bold text-white transition-colors hover:bg-emerald-500 disabled:opacity-60"
              >
                <CheckIcon className="h-5 w-5" />
                סמן כהושלם
              </button>
            ) : null}
            <div className="grid grid-cols-2 gap-3">
              <Link
                href={`/crm/leads/${lead.id}/edit`}
                className="flex items-center justify-center gap-2 rounded-full border border-ink-600 bg-ink-850 px-6 py-3.5 text-base font-bold transition-colors hover:border-ink-500"
              >
                <PencilIcon className="h-5 w-5" />
                ערוך
              </Link>
              {lead.status !== 'canceled' ? (
                <button
                  type="button"
                  disabled={mutating}
                  onClick={() => changeStatus('canceled')}
                  className="flex items-center justify-center gap-2 rounded-full border border-red-500/40 bg-red-600/10 px-6 py-3.5 text-base font-bold text-red-600 transition-colors hover:bg-red-600/20 disabled:opacity-60"
                >
                  <CloseIcon className="h-5 w-5" />
                  בטל עבודה
                </button>
              ) : (
                <button
                  type="button"
                  disabled={mutating}
                  onClick={onDelete}
                  className="flex items-center justify-center gap-2 rounded-full border border-red-500/40 bg-red-600/10 px-6 py-3.5 text-base font-bold text-red-600 transition-colors hover:bg-red-600/20 disabled:opacity-60"
                >
                  <TrashIcon className="h-5 w-5" />
                  מחק ליד
                </button>
              )}
            </div>
            {lead.status !== 'canceled' ? (
              <button
                type="button"
                disabled={mutating}
                onClick={onDelete}
                className="w-full py-2 text-center text-sm font-semibold text-mist-500 transition-colors hover:text-red-600 disabled:opacity-60"
              >
                מחיקת הליד לצמיתות
              </button>
            ) : null}
          </div>

          {error ? (
            <p role="alert" className="mt-4 rounded-card bg-red-600/10 px-4 py-3 text-sm font-semibold text-red-600">
              {error}
            </p>
          ) : null}

          {history.length > 0 ? (
            <section className="mt-8">
              <h3 className="mb-3 text-base font-extrabold">היסטוריית עבודות של הלקוח</h3>
              <div className="space-y-3">
                {history.map((job) => (
                  <Link
                    key={job.id}
                    href={`/crm/leads/${job.id}`}
                    className="flex items-center justify-between gap-3 rounded-card border border-ink-700 surface p-4 transition-colors hover:border-ink-600"
                  >
                    <div>
                      <p className="text-sm font-bold">
                        {job.jobDate ? formatDateHe(job.jobDate) : 'ללא תאריך'}
                      </p>
                      <p className="mt-0.5 text-sm text-mist-300">{job.services.join(' · ') || '—'}</p>
                    </div>
                    <div className="flex shrink-0 flex-col items-end gap-1.5">
                      <span className="text-sm font-extrabold tabular-nums">{formatPrice(job.price)}</span>
                      <StatusBadge status={job.status} />
                    </div>
                  </Link>
                ))}
              </div>
            </section>
          ) : null}
        </>
      )}
    </CrmShell>
  );
}
