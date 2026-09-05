'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { Avatar, Btn, Card, Stars } from '@/components/market/ui';
import { market } from '@/lib/market/config';
import { useCollection } from '@/lib/market/hooks';
import { updateSession } from '@/lib/market/session';
import { isDemoMode } from '@/lib/market/store';

const PERKS = [
  { icon: '📲', title: 'עבודות מגיעות אליך', text: 'התראה בזמן אמת על כל עבודה שמתאימה לאזורים ולשירותים שלך — 30 שניות לתפוס אותה.' },
  { icon: '🗓️', title: 'אתה קובע מתי', text: 'זמין / לא זמין בלחיצה. אין מינימום שעות, אין התחייבות.' },
  { icon: '💳', title: 'כסף מסודר', text: 'ארנק עם כל עבודה, עמלה שקופה, ומשיכות מרוכזות.' },
  { icon: '⭐', title: 'מוניטין שעובד בשבילך', text: 'דירוגים אמיתיים ותיק עבודות ציבורי שמביא לקוחות חוזרים.' },
];

export function ProLanding() {
  const router = useRouter();
  const { rows: pros } = useCollection('professionals');

  const loginAs = (proId: string) => {
    updateSession({ activeProId: proId });
    router.push('/pro/app');
  };

  return (
    <div className="relative z-10 min-h-dvh bg-slate-50 font-sans text-slate-900" dir="rtl">
      <header className="border-b border-slate-200 bg-white">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-3">
          <Link href="/market" className="flex items-center gap-2 text-lg font-black">
            <span className="flex h-8 w-8 items-center justify-center rounded-xl bg-emerald-600 text-white">🧽</span>
            {market.name} <span className="text-emerald-600">Pro</span>
          </Link>
          <Link href="/market" className="text-sm font-bold text-slate-500 hover:text-sky-700">
            אני לקוח ←
          </Link>
        </div>
      </header>

      <section className="mx-auto max-w-3xl px-4 pt-12 text-center">
        <h1 className="text-3xl font-black leading-tight sm:text-5xl">
          תנו לעבודות הניקוי
          <span className="block bg-gradient-to-l from-emerald-600 to-sky-600 bg-clip-text text-transparent">למצוא אתכם</span>
        </h1>
        <p className="mx-auto mt-4 max-w-xl text-slate-500">
          לקוחות באזור שלכם מזמינים ניקוי ספות, מזרנים ומזגנים — והמערכת שולחת את העבודה למקצוען המתאים.
          בלי לרדוף אחרי לידים, בלי לשלם על קמפיינים.
        </p>
        <Link href="/pro/join">
          <Btn variant="success" className="mt-6 px-10 py-4 text-lg">הצטרפות עכשיו — חינם</Btn>
        </Link>
        <p className="mt-2 text-xs text-slate-400">ההרשמה לוקחת 5 דקות · הפעלה לאחר אישור קצר של הצוות</p>
      </section>

      <section className="mx-auto mt-12 grid max-w-4xl gap-3 px-4 sm:grid-cols-2">
        {PERKS.map((p) => (
          <Card key={p.title} className="p-5">
            <span className="text-3xl">{p.icon}</span>
            <p className="mt-2 font-black">{p.title}</p>
            <p className="mt-1 text-sm text-slate-500">{p.text}</p>
          </Card>
        ))}
      </section>

      {isDemoMode && (
        <section className="mx-auto mt-12 max-w-3xl px-4 pb-16">
          <Card className="p-5">
            <p className="font-black">כניסה מהירה למצב הדגמה</p>
            <p className="mt-1 text-sm text-slate-500">
              היכנסו כאחד ממקצועני הדמו כדי לחוות את צד בעל המקצוע — פתחו טאב שני כלקוח וצפו בזרימה בזמן אמת.
            </p>
            <div className="mt-4 grid gap-2 sm:grid-cols-2">
              {pros.filter((p) => p.isDemo).map((p) => (
                <button key={p.id} onClick={() => loginAs(p.id)} className="flex items-center gap-3 rounded-xl border border-slate-200 p-3 text-start transition hover:border-emerald-400 hover:bg-emerald-50/40">
                  <Avatar name={p.businessName || p.fullName} size={40} />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-sm font-black">{p.businessName || p.fullName}</span>
                    <span className="text-xs text-slate-400">
                      {p.city} · {p.status === 'pending' ? 'ממתין לאישור' : <Stars rating={p.rating} size="text-xs" />}
                    </span>
                  </span>
                  <span className="text-slate-300">←</span>
                </button>
              ))}
            </div>
          </Card>
        </section>
      )}
    </div>
  );
}
