'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useRef, useState } from 'react';
import type { AccountSection } from '@/lib/shop/account';
import { CITIES } from '@/lib/shop/cities';
import { ils } from '@/lib/shop/logic';
import { actions, ORDER_STATUS_LABEL, useCurrentUser, useShop } from '@/lib/shop/store';
import type { Address } from '@/lib/shop/types';
import { ShopFrame } from '../Chrome';
import {
  IconBell,
  IconCardId,
  IconChevron,
  IconGear,
  IconGrid,
  IconHeart,
  IconLock,
  IconOrders,
  IconPin,
  IconTrash,
  IconUser,
  IconWallet,
} from '../icons';
import { btn, EmptyState, inputCls, toast } from '../ui';
import { useMyOrders } from './OrderViews';


const MENU: { href: string; label: string; Icon: typeof IconUser }[] = [
  { href: '/shop/account/orders', label: 'הזמנות שלי', Icon: IconOrders },
  { href: '/shop/favorites', label: 'מועדפים', Icon: IconHeart },
  { href: '/shop/account/addresses', label: 'כתובות משלוח', Icon: IconPin },
  { href: '/shop/account/details', label: 'פרטים אישיים', Icon: IconUser },
  { href: '/shop/account/payments', label: 'שיטות תשלום', Icon: IconWallet },
  { href: '/shop/account/notifications', label: 'הודעות', Icon: IconBell },
  { href: '/shop/account/settings', label: 'הגדרות', Icon: IconGear },
];

/** Sends signed-out visitors to the login screen, then back here. */
function useRequireUser(path: string) {
  const s = useShop();
  const user = useCurrentUser();
  const router = useRouter();
  // After a sign-out on this page the caller navigates away itself.
  const hadUser = useRef(false);
  if (user) hadUser.current = true;
  useEffect(() => {
    if (s.ready && !user && !hadUser.current) router.replace(`/shop/login?next=${encodeURIComponent(path)}`);
  }, [s.ready, user, router, path]);
  return s.ready ? user : null;
}

export function AccountView() {
  const user = useRequireUser('/shop/account');
  const router = useRouter();
  return (
    <ShopFrame nav="profile" back="/shop">
      {user && (
        <div className="mx-auto max-w-2xl px-4 lg:pt-8">
          <h1 className="sr-only">אזור אישי</h1>
          <Link href="/shop/account/details" dir="ltr" className="flex items-center gap-4 rounded-2xl py-2">
            <span className="grid size-[68px] shrink-0 place-items-center rounded-full bg-linear-to-b from-[#6aa0ff] to-[#3c6dfb] text-white">
              <IconUser size={34} />
            </span>
            <span dir="rtl" className="min-w-0 flex-1 text-left">
              <span className="block truncate text-[19px] font-black">{user.name}</span>
              <span dir="ltr" className="block truncate text-[14px] text-x-muted">
                {user.email}
              </span>
            </span>
            <IconChevron dir="right" size={22} className="text-x-ink" />
          </Link>

          <ul className="mt-4 divide-y divide-x-line border-t border-x-line">
            {[...MENU, ...(user.role === 'admin' ? [{ href: '/shop/admin', label: 'ניהול החנות', Icon: IconGrid }] : [])].map(({ href, label, Icon }) => (
              <li key={href}>
                <Link href={href} dir="ltr" className="flex items-center gap-4 py-4 hover:bg-x-soft-2">
                  <Icon size={22} className="text-x-ink" />
                  <span dir="rtl" className="flex-1 text-left text-[16px] font-semibold">
                    {label}
                  </span>
                  <IconChevron dir="right" size={20} className="text-x-ink" />
                </Link>
              </li>
            ))}
          </ul>
          <button
            type="button"
            onClick={() => {
              actions.logout();
              router.replace('/shop');
            }}
            className="mt-6 h-13 w-full rounded-2xl border border-x-line text-[16px] font-bold text-x-red hover:bg-[#fdeced]"
          >
            התנתק
          </button>
        </div>
      )}
    </ShopFrame>
  );
}

const TITLES: Record<AccountSection, string> = {
  orders: 'הזמנות שלי',
  addresses: 'כתובות משלוח',
  details: 'פרטים אישיים',
  payments: 'שיטות תשלום',
  notifications: 'הודעות',
  settings: 'הגדרות',
};

export function AccountSectionView({ section }: { section: AccountSection }) {
  const user = useRequireUser(`/shop/account/${section}`);
  return (
    <ShopFrame nav="profile" back="/shop/account">
      {user && (
        <div className="mx-auto max-w-2xl px-4 lg:pt-8">
          <h1 className="mb-5 text-[24px] font-black">{TITLES[section]}</h1>
          {section === 'orders' && <Orders />}
          {section === 'addresses' && <Addresses />}
          {section === 'details' && <Details />}
          {section === 'payments' && <Payments />}
          {section === 'notifications' && <Notifications />}
          {section === 'settings' && <Settings />}
        </div>
      )}
    </ShopFrame>
  );
}

function Orders() {
  const orders = useMyOrders();
  if (!orders.length)
    return <EmptyState icon={<IconOrders size={34} />} title="אין עדיין הזמנות" text="ההזמנות שתבצעו יופיעו כאן." action={{ label: 'לחנות', href: '/shop/c/all' }} />;
  return (
    <ul className="space-y-3">
      {orders.map((o) => (
        <li key={o.id}>
          <Link href={`/shop/track?id=${encodeURIComponent(o.id)}`} className="flex items-center gap-3 rounded-2xl p-4 shadow-x-card ring-1 ring-x-line/60 hover:ring-x-blue-100">
            <span className="grid size-11 place-items-center rounded-xl bg-x-blue-50 text-x-blue">
              <IconOrders size={22} />
            </span>
            <span className="flex-1">
              <span className="block font-extrabold">
                הזמנה <span dir="ltr">#{o.number}</span>
              </span>
              <span className="block text-[12px] text-x-muted">
                {new Date(o.createdAt).toLocaleDateString('he-IL')} · {o.lines.reduce((n, l) => n + l.qty, 0)} פריטים · {ils(o.total)}
              </span>
            </span>
            <span className="rounded-full bg-x-soft px-2.5 py-1 text-[12px] font-bold">{ORDER_STATUS_LABEL[o.status]}</span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

const emptyAddress = { label: 'בית', fullName: '', phone: '', city: '', street: '', zip: '', notes: '' };

function Addresses() {
  const user = useCurrentUser()!;
  const [edit, setEdit] = useState<(Omit<Address, 'id'> & { id?: string }) | null>(null);
  const [err, setErr] = useState<string | null>(null);
  return (
    <div>
      <ul className="space-y-3">
        {user.addresses.map((a) => (
          <li key={a.id} className="flex items-start gap-3 rounded-2xl p-4 ring-1 ring-x-line">
            <IconPin size={22} className="mt-0.5 text-x-blue" />
            <div className="flex-1 text-[14px]">
              <p className="font-extrabold">{a.label}</p>
              <p>
                {a.street}, {a.city} {a.zip}
              </p>
              {a.phone && <p dir="ltr" className="text-right text-x-muted">{a.phone}</p>}
            </div>
            <button type="button" onClick={() => setEdit(a)} className="text-[13px] font-bold text-x-blue">
              עריכה
            </button>
            <button type="button" aria-label="מחיקת הכתובת" onClick={() => actions.deleteAddress(a.id)} className="text-x-muted hover:text-x-red">
              <IconTrash size={19} />
            </button>
          </li>
        ))}
      </ul>
      {!user.addresses.length && !edit && <p className="mb-4 text-[14px] text-x-muted">אין כתובות שמורות.</p>}
      {edit ? (
        <form
          className="mt-4 space-y-3 rounded-2xl bg-x-soft-2 p-4 ring-1 ring-x-line"
          onSubmit={(e) => {
            e.preventDefault();
            const r = actions.saveAddress({ ...edit, fullName: edit.fullName || user.name });
            if (!r.ok) return setErr(r.error);
            setEdit(null);
            setErr(null);
            toast('הכתובת נשמרה');
          }}
        >
          <input aria-label="שם הכתובת" placeholder="שם הכתובת (בית, עבודה…)" value={edit.label} onChange={(e) => setEdit({ ...edit, label: e.target.value })} className={inputCls} />
          <input aria-label="רחוב ומספר" placeholder="רחוב ומספר בית" value={edit.street} onChange={(e) => setEdit({ ...edit, street: e.target.value })} className={inputCls} />
          <input aria-label="עיר" placeholder="עיר" list="cities" value={edit.city} onChange={(e) => setEdit({ ...edit, city: e.target.value })} className={inputCls} />
          <datalist id="cities">
            {CITIES.map((c) => (
              <option key={c} value={c} />
            ))}
          </datalist>
          <input aria-label="מיקוד" placeholder="מיקוד (אופציונלי)" inputMode="numeric" value={edit.zip} onChange={(e) => setEdit({ ...edit, zip: e.target.value })} className={inputCls} />
          <input aria-label="טלפון" placeholder="טלפון" type="tel" value={edit.phone} onChange={(e) => setEdit({ ...edit, phone: e.target.value })} className={inputCls} />
          {err && <p className="text-[13px] font-semibold text-x-red">{err}</p>}
          <div className="flex gap-2">
            <button type="submit" className={`${btn.blue} h-12 flex-1`}>
              שמירה
            </button>
            <button type="button" onClick={() => setEdit(null)} className={`${btn.ghost} h-12 flex-1`}>
              ביטול
            </button>
          </div>
        </form>
      ) : (
        <button type="button" onClick={() => setEdit({ ...emptyAddress })} className={`${btn.ghost} mt-4 h-12 w-full`}>
          + הוספת כתובת
        </button>
      )}
    </div>
  );
}

function Details() {
  const user = useCurrentUser()!;
  const [name, setName] = useState(user.name);
  const [phone, setPhone] = useState(user.phone);
  const [pw, setPw] = useState({ current: '', next: '' });
  const [msg, setMsg] = useState<{ ok: boolean; text: string } | null>(null);
  const [pwMsg, setPwMsg] = useState<{ ok: boolean; text: string } | null>(null);
  return (
    <div className="space-y-8">
      <form
        className="space-y-3"
        onSubmit={(e) => {
          e.preventDefault();
          const r = actions.updateProfile({ name, phone });
          setMsg(r.ok ? { ok: true, text: 'הפרטים נשמרו' } : { ok: false, text: r.error });
        }}
      >
        <label className="block text-[13px] font-semibold text-x-muted">
          שם מלא
          <input value={name} onChange={(e) => setName(e.target.value)} className={`${inputCls} mt-1`} autoComplete="name" />
        </label>
        <label className="block text-[13px] font-semibold text-x-muted">
          טלפון
          <input value={phone} onChange={(e) => setPhone(e.target.value)} className={`${inputCls} mt-1`} type="tel" autoComplete="tel" />
        </label>
        <label className="block text-[13px] font-semibold text-x-muted">
          אימייל
          <input value={user.email} disabled dir="ltr" className={`${inputCls} mt-1 bg-x-soft text-right`} />
        </label>
        {msg && <p className={`text-[13px] font-semibold ${msg.ok ? 'text-x-green' : 'text-x-red'}`}>{msg.text}</p>}
        <button type="submit" className={`${btn.blue} h-12 w-full`}>
          שמירת פרטים
        </button>
      </form>
      <form
        className="space-y-3"
        onSubmit={async (e) => {
          e.preventDefault();
          const r = await actions.changePassword(pw.current, pw.next);
          setPwMsg(r.ok ? { ok: true, text: 'הסיסמה עודכנה' } : { ok: false, text: r.error });
          if (r.ok) setPw({ current: '', next: '' });
        }}
      >
        <h2 className="flex items-center gap-2 text-[17px] font-extrabold">
          <IconLock size={20} /> שינוי סיסמה
        </h2>
        <input type="password" aria-label="סיסמה נוכחית" placeholder="סיסמה נוכחית" autoComplete="current-password" value={pw.current} onChange={(e) => setPw({ ...pw, current: e.target.value })} className={inputCls} />
        <input type="password" aria-label="סיסמה חדשה" placeholder="סיסמה חדשה (לפחות 8 תווים)" autoComplete="new-password" value={pw.next} onChange={(e) => setPw({ ...pw, next: e.target.value })} className={inputCls} />
        {pwMsg && <p className={`text-[13px] font-semibold ${pwMsg.ok ? 'text-x-green' : 'text-x-red'}`}>{pwMsg.text}</p>}
        <button type="submit" className={`${btn.ghost} h-12 w-full`}>
          עדכון סיסמה
        </button>
      </form>
    </div>
  );
}

function Payments() {
  return (
    <div className="rounded-2xl bg-x-soft p-5 text-[14px] leading-relaxed">
      <IconCardId size={30} className="text-x-blue" />
      <p className="mt-3 font-bold">אנחנו לא שומרים פרטי כרטיסי אשראי.</p>
      <p className="mt-1 text-x-muted">
        בכל הזמנה בוחרים אמצעי תשלום (כרטיס אשראי, Bit או PayPal) והתשלום עצמו מתבצע בעמוד המאובטח של חברת הסליקה. כרטיסים שמורים, אם יופעלו, יישמרו אצל
        חברת הסליקה בלבד.
      </p>
    </div>
  );
}

function Notifications() {
  const s = useShop();
  const user = useCurrentUser()!;
  const orders = s.db.orders.filter((o) => o.userId === user.id && o.status !== 'pending_payment');
  const items = orders.flatMap((o) => o.history.filter((h) => h.status !== 'pending_payment').map((h) => ({ o, h }))).sort((a, b) => b.h.at.localeCompare(a.h.at));
  if (!items.length) return <EmptyState icon={<IconBell size={34} />} title="אין הודעות חדשות" text="עדכונים על ההזמנות שלך יופיעו כאן." />;
  return (
    <ul className="divide-y divide-x-line">
      {items.map(({ o, h }, i) => (
        <li key={i}>
          <Link href={`/shop/track?id=${encodeURIComponent(o.id)}`} className="flex gap-3 py-3.5">
            <IconBell size={20} className="mt-0.5 text-x-blue" />
            <span className="flex-1 text-[14px]">
              הזמנה <span dir="ltr">#{o.number}</span>: <b>{ORDER_STATUS_LABEL[h.status]}</b>
              <span className="block text-[12px] text-x-muted">{new Date(h.at).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</span>
            </span>
          </Link>
        </li>
      ))}
    </ul>
  );
}

function Settings() {
  const user = useCurrentUser()!;
  return (
    <div className="space-y-3">
      <label className="flex items-center justify-between rounded-2xl px-4 py-4 ring-1 ring-x-line">
        <span>
          <span className="block font-bold">עדכונים ומבצעים במייל</span>
          <span className="block text-[12px] text-x-muted">מוצרים חדשים והנחות לחברי מועדון</span>
        </span>
        <input
          type="checkbox"
          checked={user.marketingOptIn}
          onChange={(e) => {
            actions.updateProfile({ marketingOptIn: e.target.checked });
            toast('ההגדרה נשמרה');
          }}
          className="size-5 accent-x-blue"
        />
      </label>
      <p className="px-1 text-[12px] text-x-muted">שפה: עברית · מטבע: ש&quot;ח (₪)</p>
    </div>
  );
}
