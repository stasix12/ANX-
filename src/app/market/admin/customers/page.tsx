'use client';

import { useState } from 'react';
import { Avatar, Btn, Card, inputClass } from '@/components/market/ui';
import { shekel } from '@/lib/market/config';
import { useCollection } from '@/lib/market/hooks';
import { getStore } from '@/lib/market/store';

/** Admin: customers — history, spend, credit, block. */
export default function AdminCustomersPage() {
  const { rows: customers } = useCollection('customers');
  const { rows: bookings } = useCollection('bookings');
  const [query, setQuery] = useState('');

  const list = customers.filter((c) => `${c.fullName} ${c.phone}`.includes(query));

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-black">לקוחות</h1>
      <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="חיפוש…" className={inputClass} />
      <div className="space-y-3">
        {list.map((c) => {
          const mine = bookings.filter((b) => b.customerId === c.id);
          const spent = mine.reduce((s, b) => s + (['paid', 'reviewed'].includes(b.status) ? (b.finalPriceAgorot ?? 0) : 0), 0);
          return (
            <Card key={c.id} className="flex flex-wrap items-center gap-3 p-4">
              <Avatar name={c.fullName} size={40} />
              <div className="min-w-0 flex-1">
                <p className="font-black">
                  {c.fullName}
                  {c.blocked && <span className="ms-2 rounded-full bg-red-50 px-2 py-0.5 text-[10px] font-black text-red-600">חסום</span>}
                </p>
                <p className="text-xs text-slate-500">
                  {c.phone} · {mine.length} הזמנות · סה"כ הוצאות {shekel(spent)} · קרדיט {shekel(c.creditAgorot)} · קוד הפניה {c.referralCode}
                </p>
              </div>
              <div className="flex gap-2">
                <Btn
                  variant="secondary"
                  onClick={async () => {
                    const amount = Number(window.prompt('כמה קרדיט להוסיף (₪)?', '30') ?? 0);
                    if (amount) await getStore().put('customers', { ...c, creditAgorot: c.creditAgorot + amount * 100 });
                  }}
                >
                  + קרדיט
                </Btn>
                <Btn variant={c.blocked ? 'secondary' : 'danger'} onClick={() => void getStore().put('customers', { ...c, blocked: !c.blocked })}>
                  {c.blocked ? 'שחרור' : 'חסימה'}
                </Btn>
              </div>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
