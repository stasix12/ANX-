'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { use, useMemo, useState } from 'react';
import { HqShell } from '@/components/platform/HqShell';
import { Badge, btnPrimary, btnSecondary, inputClass, Modal, PageSkeleton } from '@/components/platform/ui';
import {
  addDaysIso,
  CATEGORIES,
  categoryName,
  cityName,
  CITIES,
  formatPrice,
  itemsLabel,
  relativeTimeHe,
  sourceLabel,
  todayIso,
} from '@/lib/platform/catalog';
import { whatsappAdapter } from '@/lib/platform/integrations';
import { roundTo5, suggestCustomerPrice, suggestFee } from '@/lib/platform/pricing';
import { leadScore, leadTier, TIER_META } from '@/lib/platform/scoring';
import { LEAD_STATUS_META, leadStatusMeta } from '@/lib/platform/stateMachine';
import { actions, usePlatform, useSession } from '@/lib/platform/store';
import type { FeeModel, Lead, LeadItem, LeadStatus, PaymentMethod } from '@/lib/platform/types';

/**
 * One lead: contact actions, quote, follow-ups, notes, activity — and the
 * "סגור עבודה" dialog where a closed sale becomes a dispatched JOB, with the
 * pricing engine suggesting the job's sale price and upsell prompts built in.
 */

const FOLLOWUP_PRESETS = [
  { label: 'עוד 10 דק׳', minutes: 10 },
  { label: 'עוד שעה', minutes: 60 },
  { label: 'עוד 3 שעות', minutes: 180 },
  { label: 'מחר ב-10:00', minutes: -1 },
];

function CloseJobDialog({ lead, onClose }: { lead: Lead; onClose: () => void }) {
  const snap = usePlatform();
  const session = useSession();
  const router = useRouter();
  const [items, setItems] = useState<LeadItem[]>(lead.items);
  const priceSuggestion = useMemo(() => suggestCustomerPrice(items, lead.condition), [items, lead.condition]);
  const [customerPrice, setCustomerPrice] = useState<number>(
    lead.quotedPrice ?? Math.round((priceSuggestion.min + priceSuggestion.max) / 2),
  );
  const [date, setDate] = useState(lead.preferredDate ?? todayIso());
  const [windowStart, setWindowStart] = useState('16:00');
  const [windowEnd, setWindowEnd] = useState('18:00');
  const [city, setCity] = useState(lead.city || '');
  const [address, setAddress] = useState(lead.address);
  const [notes, setNotes] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>('cash');
  const [feeModel, setFeeModel] = useState<FeeModel>(snap?.config.defaultFeeModel ?? 'fee');
  const [feeOverride, setFeeOverride] = useState<number | null>(null);
  const [payoutOverride, setPayoutOverride] = useState<number | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  if (!snap || !session) return null;

  const fee = suggestFee(snap.config.pricingRules, {
    customerPrice,
    categoryId: items[0]?.categoryId ?? null,
    city,
    urgent: false,
  });
  const baseFee = feeOverride ?? fee.suggested;
  const payoutAmount = payoutOverride ?? customerPrice - fee.suggested;

  // Upsell: services the customer didn't ask for, at a bundle discount.
  const upsells = CATEGORIES.filter((c) => c.active && !items.some((i) => i.categoryId === c.id)).slice(0, 4);

  const toggleUpsell = (id: string) => {
    const cat = CATEGORIES.find((c) => c.id === id)!;
    const bundle = roundTo5(cat.basePrice * 0.8);
    if (items.some((i) => i.categoryId === id)) {
      setItems(items.filter((i) => i.categoryId !== id));
      setCustomerPrice((p) => Math.max(0, p - bundle));
    } else {
      setItems([...items, { categoryId: id, qty: 1 }]);
      setCustomerPrice((p) => p + bundle);
    }
  };

  async function submit() {
    setBusy(true);
    setError('');
    try {
      await actions.closeLead(
        lead.id,
        {
          customerPrice,
          date,
          windowStart,
          windowEnd,
          address,
          city,
          notes,
          paymentMethod,
          feeModel,
          baseFee: feeModel === 'fee' ? baseFee : customerPrice - payoutAmount,
          payoutAmount: feeModel === 'payout' ? payoutAmount : null,
          items,
        },
        session!.userId ?? 'agent',
      );
      router.push('/hq/jobs');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'סגירת העבודה נכשלה');
      setBusy(false);
    }
  }

  return (
    <Modal open onClose={onClose} title="סגירת עבודה 🎯">
      <div className="space-y-4">
        {/* Items + upsell */}
        <div>
          <div className="text-sm font-bold text-mist-300">מה בעבודה</div>
          <div className="mt-1.5 flex flex-wrap gap-1.5">
            {items.map((it) => (
              <span key={it.categoryId} className="rounded-full bg-brand-500/10 px-3 py-1 text-xs font-bold text-brand-400">
                {categoryName(it.categoryId)}
                {it.qty > 1 ? ` ×${it.qty}` : ''}
              </span>
            ))}
          </div>
          <div className="mt-2 rounded-xl bg-amber-500/10 p-3">
            <div className="text-xs font-black text-amber-700">💡 Upsell — הצע ללקוח להוסיף:</div>
            <div className="mt-1.5 flex flex-wrap gap-1.5">
              {upsells.map((c) => (
                <button
                  key={c.id}
                  type="button"
                  onClick={() => toggleUpsell(c.id)}
                  className="rounded-full bg-white px-3 py-1 text-xs font-bold text-amber-700 shadow-sm"
                >
                  + {c.name.replace('ניקוי ', '')} ב-{formatPrice(roundTo5(c.basePrice * 0.8))} במקום {formatPrice(c.basePrice)}
                </button>
              ))}
            </div>
          </div>
        </div>

        {/* Price */}
        <label className="block">
          <span className="text-sm font-bold text-mist-300">
            מחיר ללקוח (מוצע: {formatPrice(priceSuggestion.min)}–{formatPrice(priceSuggestion.max)})
          </span>
          <input
            type="number"
            value={customerPrice}
            onChange={(e) => {
              setCustomerPrice(Number(e.target.value));
              setFeeOverride(null);
              setPayoutOverride(null);
            }}
            className={`${inputClass} mt-1`}
          />
        </label>

        {/* Schedule */}
        <div className="grid grid-cols-3 gap-2">
          <label className="col-span-3 block sm:col-span-1">
            <span className="text-sm font-bold text-mist-300">תאריך</span>
            <input type="date" value={date} min={todayIso()} onChange={(e) => setDate(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-mist-300">משעה</span>
            <input type="time" value={windowStart} onChange={(e) => setWindowStart(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
          <label className="block">
            <span className="text-sm font-bold text-mist-300">עד שעה</span>
            <input type="time" value={windowEnd} onChange={(e) => setWindowEnd(e.target.value)} className={`${inputClass} mt-1`} />
          </label>
        </div>

        <div className="grid grid-cols-2 gap-2">
          <select value={city} onChange={(e) => setCity(e.target.value)} className={inputClass}>
            <option value="">עיר…</option>
            {CITIES.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </select>
          <select value={paymentMethod} onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)} className={inputClass}>
            <option value="cash">מזומן</option>
            <option value="bit">Bit</option>
            <option value="card">אשראי</option>
            <option value="transfer">העברה</option>
          </select>
        </div>
        <input value={address} onChange={(e) => setAddress(e.target.value)} placeholder="כתובת מדויקת" className={inputClass} />
        <input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="הערות למנקה (חניה, קומה, בע״ח…)" className={inputClass} />

        {/* Fee model */}
        <div className="rounded-xl bg-ink-900 p-3">
          <div className="text-sm font-black text-mist-100">מודל מכירת העבודה</div>
          <div className="mt-2 grid grid-cols-2 gap-2">
            <button
              type="button"
              onClick={() => setFeeModel('fee')}
              aria-pressed={feeModel === 'fee'}
              className={`rounded-xl p-3 text-start text-xs font-bold ${feeModel === 'fee' ? 'bg-brand-500 text-on-brand' : 'bg-ink-850 text-mist-100'}`}
            >
              A · Fee Model
              <span className="block font-normal opacity-80">המנקה משלם על העבודה וגובה מהלקוח</span>
            </button>
            <button
              type="button"
              onClick={() => setFeeModel('payout')}
              aria-pressed={feeModel === 'payout'}
              className={`rounded-xl p-3 text-start text-xs font-bold ${feeModel === 'payout' ? 'bg-brand-500 text-on-brand' : 'bg-ink-850 text-mist-100'}`}
            >
              B · Payout Model
              <span className="block font-normal opacity-80">אנחנו גובים מהלקוח ומשלמים למנקה</span>
            </button>
          </div>

          {feeModel === 'fee' ? (
            <label className="mt-3 block">
              <span className="text-xs font-bold text-mist-300">
                מחיר מכירת העבודה למנקה — המנוע מציע {formatPrice(fee.min)}–{formatPrice(fee.max)} ({fee.ruleName})
              </span>
              <input
                type="number"
                value={baseFee}
                onChange={(e) => setFeeOverride(Number(e.target.value))}
                className={`${inputClass} mt-1`}
              />
              <span className="mt-1 block text-xs text-mist-500">
                נשאר למנקה: <b className="text-emerald-600">{formatPrice(customerPrice - baseFee)}</b> · אם לא תילקח — המחיר יירד אוטומטית לפי חוקי ההוזלה
              </span>
            </label>
          ) : (
            <label className="mt-3 block">
              <span className="text-xs font-bold text-mist-300">כמה המנקה יקבל על הביצוע</span>
              <input
                type="number"
                value={payoutAmount}
                onChange={(e) => setPayoutOverride(Number(e.target.value))}
                className={`${inputClass} mt-1`}
              />
              <span className="mt-1 block text-xs text-mist-500">
                נשאר לחברה: <b className="text-emerald-600">{formatPrice(customerPrice - payoutAmount)}</b>
              </span>
            </label>
          )}
        </div>

        {error && <p className="rounded-xl bg-red-500/10 p-3 text-sm font-bold text-red-700">{error}</p>}

        <button
          type="button"
          disabled={busy || customerPrice <= 0 || city === '' || items.length === 0}
          onClick={submit}
          className={`${btnPrimary} w-full py-4 text-lg`}
        >
          {busy ? 'סוגר…' : `סגור עבודה — ${formatPrice(customerPrice)} 🚀`}
        </button>
      </div>
    </Modal>
  );
}

function LeadDetail({ id }: { id: string }) {
  const snap = usePlatform();
  const session = useSession();
  const [note, setNote] = useState('');
  const [customFollowup, setCustomFollowup] = useState('');
  const [closing, setClosing] = useState(false);
  const [quote, setQuote] = useState('');

  if (!snap || !session) return <PageSkeleton />;
  const lead = snap.leads.find((l) => l.id === id);
  if (!lead) {
    return <p className="surface rounded-card p-6 text-mist-300">הליד לא נמצא.</p>;
  }

  const score = leadScore(lead);
  const tier = leadTier(score);
  const status = leadStatusMeta(lead.status);
  const by = session.name;
  const whatsappText = `היי ${lead.name.split(' ')[0]}, כאן קלין ישראל 🙂 ראינו שהתעניינת ב${itemsLabel(lead.items)} — נשמח לבדוק לך זמינות ומחיר. מתי נוח לדבר?`;

  async function scheduleFollowupPreset(minutes: number) {
    const at =
      minutes === -1
        ? new Date(`${addDaysIso(1)}T10:00:00`).toISOString()
        : new Date(Date.now() + minutes * 60000).toISOString();
    await actions.scheduleFollowup(lead!.id, at, minutes === -1 ? 'לחזור מחר בבוקר' : 'תזכורת אוטומטית', by);
  }

  return (
    <div className="crm-page">
      <Link href="/hq/leads" className="text-sm font-bold text-mist-500">
        → לכל הלידים
      </Link>

      <div className="surface mt-3 rounded-card p-5">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2">
            <Badge className={TIER_META[tier].badgeClass}>{TIER_META[tier].label} · {score}</Badge>
            <h1 className="text-xl font-black text-mist-100">{lead.name}</h1>
          </div>
          <Badge className={status.badgeClass}>{status.label}</Badge>
        </div>

        <div className="mt-3 grid gap-1.5 text-sm text-mist-100">
          <p dir="ltr" className="text-right">📞 {lead.phone}</p>
          <p>📍 {lead.address ? `${lead.address}, ` : ''}{cityName(lead.city)}</p>
          <p>🧺 {itemsLabel(lead.items)}</p>
          {lead.condition.length > 0 && <p>🏷️ {lead.condition.join(' · ')}</p>}
          <p>
            🗓️ מועד רצוי: {lead.preferred === 'today' ? 'היום' : lead.preferred === 'tomorrow' ? 'מחר' : lead.preferredDate}
          </p>
          <p className="text-mist-500">
            מקור: {sourceLabel(lead.source)}
            {lead.utm.campaign ? ` · קמפיין ${lead.utm.campaign}` : ''} · נכנס {relativeTimeHe(lead.createdAt)}
          </p>
        </div>

        {lead.photos.length > 0 && (
          <div className="mt-3 flex gap-2">
            {lead.photos.map((src, i) =>
              src.startsWith('data:') ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img key={i} src={src} alt={`תמונה ${i + 1}`} className="h-20 w-20 rounded-xl object-cover" />
              ) : (
                <span key={i} className="flex h-20 w-20 items-center justify-center rounded-xl bg-ink-800 text-2xl">📷</span>
              ),
            )}
          </div>
        )}

        {/* Contact actions */}
        <div className="mt-4 grid grid-cols-3 gap-2">
          <a
            href={`tel:${lead.phone.replace(/[^\d+]/g, '')}`}
            onClick={() => actions.addLeadActivity(lead.id, 'call', 'שיחה יוצאת ללקוח', by)}
            className="rounded-xl bg-brand-500 py-2.5 text-center font-bold text-on-brand"
          >
            📞 התקשר
          </a>
          <button
            type="button"
            onClick={async () => {
              await whatsappAdapter.send(lead.phone, whatsappText);
              await actions.addLeadActivity(lead.id, 'whatsapp', 'נשלחה הודעת WhatsApp', by);
            }}
            className="rounded-xl bg-emerald-500 py-2.5 text-center font-bold text-white"
          >
            💬 WhatsApp
          </button>
          <button
            type="button"
            onClick={() => actions.markAnswered(lead.id)}
            disabled={lead.answered}
            className="rounded-xl bg-ink-800 py-2.5 text-center font-bold text-mist-100 disabled:opacity-50"
          >
            {lead.answered ? '✓ ענה' : 'סמן שענה'}
          </button>
        </div>
      </div>

      {lead.status === 'converted' && lead.jobId ? (
        <div className="surface mt-4 rounded-card p-4 text-sm font-bold text-emerald-700">
          ✅ הליד הפך לעבודה —{' '}
          <Link href="/hq/jobs" className="underline">
            צפייה בלוח העבודות
          </Link>
        </div>
      ) : (
        <>
          {/* Status + agent */}
          <div className="mt-4 grid grid-cols-2 gap-2">
            <select
              value={lead.status}
              onChange={(e) => actions.setLeadStatus(lead.id, e.target.value as LeadStatus, by)}
              className={inputClass}
            >
              {LEAD_STATUS_META.filter((m) => m.value !== 'converted').map((m) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))}
            </select>
            <select
              value={lead.agentId ?? ''}
              onChange={(e) => actions.assignAgent(lead.id, e.target.value || null)}
              className={inputClass}
            >
              <option value="">ללא נציג</option>
              {snap.agents
                .filter((a) => a.role === 'sales_agent' || a.role === 'sales_manager')
                .map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.name}
                  </option>
                ))}
            </select>
          </div>

          {/* Quote */}
          <div className="surface mt-4 rounded-card p-4">
            <div className="text-sm font-black text-mist-100">הצעת מחיר</div>
            <div className="mt-2 flex gap-2">
              <input
                type="number"
                value={quote}
                onChange={(e) => setQuote(e.target.value)}
                placeholder={`מוצע: ${formatPrice(suggestCustomerPrice(lead.items, lead.condition).min)}–${formatPrice(suggestCustomerPrice(lead.items, lead.condition).max)}`}
                className={inputClass}
              />
              <button
                type="button"
                disabled={!quote || Number(quote) <= 0}
                onClick={async () => {
                  await actions.setLeadQuote(lead.id, Number(quote), by);
                  setQuote('');
                }}
                className={btnSecondary}
              >
                שלח
              </button>
            </div>
            {lead.quotedPrice ? (
              <p className="mt-2 text-sm font-bold text-brand-400">הוצע ללקוח: {formatPrice(lead.quotedPrice)}</p>
            ) : null}
          </div>

          {/* Follow-up */}
          <div className="surface mt-4 rounded-card p-4">
            <div className="text-sm font-black text-mist-100">
              ⏰ Follow-up
              {lead.followupAt && (
                <span className="ms-2 font-bold text-amber-600">
                  נקבע {relativeTimeHe(lead.followupAt)} · {lead.followupNote}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-wrap gap-1.5">
              {FOLLOWUP_PRESETS.map((p) => (
                <button
                  key={p.label}
                  type="button"
                  onClick={() => scheduleFollowupPreset(p.minutes)}
                  className="rounded-full bg-ink-800 px-3 py-1.5 text-xs font-bold text-mist-100"
                >
                  {p.label}
                </button>
              ))}
              <input
                type="datetime-local"
                value={customFollowup}
                onChange={(e) => setCustomFollowup(e.target.value)}
                className="rounded-full bg-ink-800 px-3 py-1.5 text-xs font-bold text-mist-100"
              />
              {customFollowup && (
                <button
                  type="button"
                  onClick={async () => {
                    await actions.scheduleFollowup(lead.id, new Date(customFollowup).toISOString(), 'מועד מותאם', by);
                    setCustomFollowup('');
                  }}
                  className="rounded-full bg-amber-500 px-3 py-1.5 text-xs font-black text-white"
                >
                  קבע
                </button>
              )}
            </div>
          </div>

          {/* The money button */}
          <button type="button" onClick={() => setClosing(true)} className={`${btnPrimary} mt-4 w-full py-4 text-lg`}>
            סגור עבודה 🎯
          </button>
        </>
      )}

      {/* Notes + activity */}
      <div className="surface mt-4 rounded-card p-4">
        <div className="text-sm font-black text-mist-100">הערות והיסטוריה</div>
        <div className="mt-2 flex gap-2">
          <input value={note} onChange={(e) => setNote(e.target.value)} placeholder="הוסף הערה…" className={inputClass} />
          <button
            type="button"
            disabled={note.trim() === ''}
            onClick={async () => {
              await actions.addLeadActivity(lead.id, 'note', note.trim(), by);
              setNote('');
            }}
            className={btnSecondary}
          >
            הוסף
          </button>
        </div>
        <ul className="mt-3 space-y-2">
          {[...lead.activities].reverse().map((a) => (
            <li key={a.id} className="rounded-xl bg-ink-900 p-2.5 text-sm">
              <span className="text-mist-100">{a.text}</span>
              <span className="block text-xs text-mist-500">
                {relativeTimeHe(a.at)} · {snap.agents.find((ag) => ag.id === a.by)?.name ?? a.by}
              </span>
            </li>
          ))}
        </ul>
      </div>

      {closing && <CloseJobDialog lead={lead} onClose={() => setClosing(false)} />}
    </div>
  );
}

export default function LeadPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  return (
    <HqShell>
      <LeadDetail id={id} />
    </HqShell>
  );
}
