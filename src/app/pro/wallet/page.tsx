'use client';

import { useState } from 'react';
import { ProShell } from '@/components/platform/ProShell';
import { btnPrimary, EmptyState } from '@/components/platform/ui';
import { formatPrice, relativeTimeHe } from '@/lib/platform/catalog';
import { paymentsAdapter } from '@/lib/platform/integrations';
import { actions, usePlatform, useSession, walletBalance } from '@/lib/platform/store';
import type { WalletTxType } from '@/lib/platform/types';

/**
 * Wallet: the balance is a derived view of the ledger, never edited
 * directly. Top-up runs through the payments adapter (mock until an Israeli
 * PSP key is configured — see docs/PLATFORM.md).
 */

const TX_META: Record<WalletTxType, { label: string; emoji: string }> = {
  TOP_UP: { label: 'טעינת ארנק', emoji: '💳' },
  JOB_PURCHASE: { label: 'רכישת עבודה', emoji: '🧾' },
  REFUND: { label: 'החזר', emoji: '↩️' },
  BONUS: { label: 'בונוס', emoji: '🎁' },
  ADJUSTMENT: { label: 'התאמה', emoji: '🛠️' },
  PAYOUT: { label: 'תשלום ביצוע', emoji: '💸' },
};

const TOP_UP_AMOUNTS = [100, 200, 500];

function Wallet() {
  const snap = usePlatform();
  const session = useSession();
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState('');

  if (!snap || !session?.userId) return null;
  const myId = session.userId;
  const balance = walletBalance(snap, myId);
  const txs = snap.walletTxs.filter((t) => t.proId === myId).slice().reverse();

  async function topUp(amount: number) {
    setBusy(true);
    setMessage('');
    try {
      const charge = await paymentsAdapter.charge(amount, 'טעינת ארנק');
      if (!charge.ok) throw new Error('התשלום נכשל');
      await actions.topUpWallet(myId, amount);
      setMessage(charge.mock ? `נטענו ${formatPrice(amount)} (סליקה מדומה — חברו ספק אמיתי ב-integrations.ts)` : `נטענו ${formatPrice(amount)}`);
    } catch (e) {
      setMessage(e instanceof Error ? e.message : 'הטעינה נכשלה');
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="crm-page px-4 pt-4">
      <h1 className="text-2xl font-black text-mist-100">הארנק שלי</h1>

      <div className="mt-4 rounded-card bg-brand-500 p-6 text-on-brand">
        <div className="text-sm opacity-90">יתרה זמינה</div>
        <div className="mt-1 text-4xl font-black tabular-nums">{formatPrice(balance)}</div>
        <div className="mt-1 text-xs opacity-80">היתרה משמשת לרכישת עבודות סגורות</div>
      </div>

      <h2 className="mt-6 text-sm font-black text-mist-500">טעינת ארנק</h2>
      <div className="mt-2 grid grid-cols-3 gap-2">
        {TOP_UP_AMOUNTS.map((amount) => (
          <button
            key={amount}
            type="button"
            disabled={busy}
            onClick={() => topUp(amount)}
            className={`${btnPrimary} py-4`}
          >
            +{formatPrice(amount)}
          </button>
        ))}
      </div>
      {message && <p className="mt-3 rounded-xl bg-emerald-500/10 p-3 text-sm font-bold text-emerald-700">{message}</p>}

      <h2 className="mt-6 text-sm font-black text-mist-500">תנועות אחרונות</h2>
      {txs.length === 0 ? (
        <div className="mt-2">
          <EmptyState emoji="💰" title="אין תנועות עדיין" />
        </div>
      ) : (
        <div className="mt-2 space-y-2 pb-6">
          {txs.map((tx) => (
            <div key={tx.id} className="surface flex items-center justify-between rounded-card p-3">
              <div className="flex items-center gap-3">
                <span className="text-xl">{TX_META[tx.type].emoji}</span>
                <div>
                  <div className="text-sm font-bold text-mist-100">{tx.note || TX_META[tx.type].label}</div>
                  <div className="text-xs text-mist-500">{relativeTimeHe(tx.at)}</div>
                </div>
              </div>
              <div className="text-end">
                <div className={`font-black tabular-nums ${tx.amount >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                  {tx.amount >= 0 ? '+' : ''}
                  {formatPrice(tx.amount)}
                </div>
                <div className="text-xs text-mist-500">יתרה: {formatPrice(tx.balanceAfter)}</div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export default function WalletPage() {
  return (
    <ProShell>
      <Wallet />
    </ProShell>
  );
}
