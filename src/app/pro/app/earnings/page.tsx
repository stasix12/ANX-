'use client';

import { useMemo } from 'react';
import { Card, EmptyState } from '@/components/market/ui';
import { shekel } from '@/lib/market/config';
import { useCollection } from '@/lib/market/hooks';
import { useMarketSession } from '@/lib/market/session';
import type { WalletKind } from '@/lib/market/types';

const KIND_LABELS: Record<WalletKind, string> = {
  job_income: 'תשלום עבודה',
  commission: 'עמלת פלטפורמה',
  lead_fee: 'דמי ליד',
  subscription: 'מנוי',
  boost: 'קידום',
  payout: 'משיכה',
  credit: 'זיכוי',
  adjustment: 'התאמה/החזר',
};

/** Wallet: balance, commissions, and the full ledger. */
export default function EarningsPage() {
  const session = useMarketSession();
  const proId = session.activeProId;
  const { rows: wallet } = useCollection('wallet');

  const mine = useMemo(
    () => wallet.filter((w) => w.professionalId === proId).sort((a, b) => b.createdAt.localeCompare(a.createdAt)),
    [wallet, proId],
  );
  const balance = mine.reduce((s, w) => s + w.amountAgorot, 0);
  const income = mine.filter((w) => w.kind === 'job_income').reduce((s, w) => s + w.amountAgorot, 0);
  const fees = -mine.filter((w) => ['commission', 'lead_fee'].includes(w.kind)).reduce((s, w) => s + w.amountAgorot, 0);

  return (
    <div className="mx-auto max-w-lg px-4 py-6">
      <h1 className="text-xl font-black">הארנק שלי</h1>

      <Card className="mt-3 bg-gradient-to-l from-emerald-600 to-emerald-500 p-5 text-white">
        <p className="text-sm font-bold text-emerald-100">יתרה למשיכה</p>
        <p className="text-4xl font-black">{shekel(Math.max(0, balance))}</p>
        <p className="mt-2 text-xs text-emerald-100">משיכות מרוכזות פעם בשבוע · חיבור העברה בנקאית יגיע עם ספק הסליקה</p>
      </Card>

      <div className="mt-3 grid grid-cols-2 gap-3">
        <Card className="p-4 text-center">
          <p className="text-lg font-black text-slate-900">{shekel(income)}</p>
          <p className="text-xs font-bold text-slate-400">הכנסות מעבודות</p>
        </Card>
        <Card className="p-4 text-center">
          <p className="text-lg font-black text-red-600">{shekel(fees)}</p>
          <p className="text-xs font-bold text-slate-400">עמלות ודמי ליד</p>
        </Card>
      </div>

      <h2 className="mb-2 mt-6 text-sm font-black text-slate-500">תנועות</h2>
      {mine.length === 0 && <EmptyState icon="💸" title="אין תנועות עדיין" subtitle="כל עבודה שתסיימו תופיע כאן עם העמלה לצידה" />}
      <div className="space-y-2">
        {mine.map((w) => (
          <Card key={w.id} className="flex items-center justify-between p-3.5">
            <div>
              <p className="text-sm font-bold text-slate-800">{KIND_LABELS[w.kind]}</p>
              <p className="text-[11px] text-slate-400">{w.note} · {new Date(w.createdAt).toLocaleDateString('he-IL')}</p>
            </div>
            <span className={`font-black ${w.amountAgorot >= 0 ? 'text-emerald-600' : 'text-red-500'}`}>
              {w.amountAgorot >= 0 ? '+' : ''}{shekel(Math.abs(w.amountAgorot))}
            </span>
          </Card>
        ))}
      </div>
    </div>
  );
}
