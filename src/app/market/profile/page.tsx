'use client';

import Link from 'next/link';
import { useEffect, useState } from 'react';
import { LanguageSwitcher } from '@/components/market/LanguageProvider';
import { Btn, Card, Field, inputClass } from '@/components/market/ui';
import { shekel } from '@/lib/market/config';
import { useCollection } from '@/lib/market/hooks';
import { updateSession, useMarketSession } from '@/lib/market/session';
import { getStore, isDemoMode } from '@/lib/market/store';

/** Customer profile: contact details, credit, referral code, language. */
export default function ProfilePage() {
  const session = useMarketSession();
  const { rows: customers } = useCollection('customers');
  const me = customers.find((c) => c.id === session.customerId);

  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [saved, setSaved] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setName(session.customerName);
    setPhone(session.customerPhone);
  }, [session.customerName, session.customerPhone]);

  const save = async () => {
    updateSession({ customerName: name, customerPhone: phone });
    if (me) await getStore().put('customers', { ...me, fullName: name, phone });
    setSaved(true);
    setTimeout(() => setSaved(false), 1500);
  };

  return (
    <div className="mx-auto max-w-lg space-y-4 px-4 py-6">
      <h1 className="text-xl font-black text-slate-900">הפרופיל שלי</h1>

      <Card className="space-y-3 p-4">
        <Field label="שם מלא">
          <input value={name} onChange={(e) => setName(e.target.value)} className={inputClass} />
        </Field>
        <Field label="טלפון">
          <input value={phone} onChange={(e) => setPhone(e.target.value)} type="tel" className={inputClass} />
        </Field>
        <Btn onClick={() => void save()} className="w-full">{saved ? 'נשמר ✓' : 'שמירה'}</Btn>
      </Card>

      <Card className="flex items-center justify-between p-4">
        <div>
          <p className="font-black text-slate-900">קרדיט זמין</p>
          <p className="text-xs text-slate-400">מתקזז אוטומטית בהזמנה הבאה</p>
        </div>
        <span className="text-2xl font-black text-emerald-600">{shekel(me?.creditAgorot ?? 0)}</span>
      </Card>

      <Card className="p-4">
        <p className="font-black text-slate-900">חבר מביא חבר 🎁</p>
        <p className="mt-1 text-sm text-slate-500">
          שתפו את הקוד — החבר מקבל 20% הנחה בהזמנה ראשונה (WELCOME20) ואתם 30 ₪ קרדיט.
        </p>
        <div className="mt-3 flex gap-2">
          <code className="flex-1 rounded-xl bg-slate-100 px-3 py-2.5 text-center font-black tracking-widest text-slate-800">
            {me?.referralCode ?? 'DEMO30'}
          </code>
          <Btn
            variant="secondary"
            onClick={() => {
              void navigator.clipboard?.writeText(me?.referralCode ?? 'DEMO30');
              setCopied(true);
              setTimeout(() => setCopied(false), 1500);
            }}
          >
            {copied ? 'הועתק ✓' : 'העתק'}
          </Btn>
        </div>
      </Card>

      <Card className="flex items-center justify-between p-4">
        <p className="font-black text-slate-900">שפת הממשק</p>
        <LanguageSwitcher />
      </Card>

      <Card className="space-y-2 p-4">
        <Link href="/market/favorites" className="block text-sm font-bold text-sky-700 hover:underline">⭐ המועדפים שלי</Link>
        <Link href="/pro" className="block text-sm font-bold text-sky-700 hover:underline">🧽 מעבר לאזור בעלי המקצוע</Link>
        <Link href="/market/admin" className="block text-sm font-bold text-sky-700 hover:underline">🛠️ פאנל ניהול (אדמין)</Link>
      </Card>

      {isDemoMode && (
        <Card className="p-4">
          <p className="text-sm font-bold text-slate-700">מצב הדגמה</p>
          <p className="mt-1 text-xs text-slate-400">
            כל הנתונים נשמרים בדפדפן הזה בלבד. איפוס מחזיר את נתוני הדמו המקוריים.
          </p>
          <Btn
            variant="danger"
            className="mt-3"
            onClick={() => {
              Object.keys(window.localStorage)
                .filter((k) => k.startsWith('cleango:'))
                .forEach((k) => window.localStorage.removeItem(k));
              window.location.reload();
            }}
          >
            איפוס נתוני הדמו
          </Btn>
        </Card>
      )}
    </div>
  );
}
