'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { categoryHref } from '@/lib/shop/logic';
import { STATIC_CATEGORY_SLUGS } from '@/lib/shop/static';
import { useCurrentUser, useShop } from '@/lib/shop/store';
import {
  CategoryGlyph,
  IconCart,
  IconChevron,
  IconClose,
  IconGrid,
  IconHeart,
  IconHome,
  IconMenu,
  IconSearch,
  IconUser,
} from './icons';
import { Logo } from './Logo';
import { Toaster } from './ui';

/* ---------------------------------------------------------------- badge */

function CartBadge({ count, dark }: { count: number; dark?: boolean }) {
  if (!count) return null;
  return (
    <span
      className={`absolute -top-1.5 -right-2 grid h-[18px] min-w-[18px] place-items-center rounded-full bg-x-violet px-1 text-[10px] font-bold leading-none text-white ring-2 ${dark ? 'ring-x-night' : 'ring-white'}`}
    >
      {count > 99 ? '99+' : count}
    </span>
  );
}

function useCartCount() {
  const s = useShop();
  return s.cart.lines.reduce((n, l) => n + l.qty, 0);
}

/* --------------------------------------------------------------- header */

export type HeaderTone = 'light' | 'dark' | 'overlay';

const DESKTOP_LINKS = [
  { href: '/shop', label: 'בית' },
  { href: '/shop/categories', label: 'קטגוריות' },
  { href: '/shop/c/all', label: 'כל המוצרים' },
  { href: '/shop/favorites', label: 'מועדפים' },
];

export function ShopHeader({
  tone = 'light',
  back,
  title,
  onMenu,
}: {
  tone?: HeaderTone;
  /** Shows the back chevron in place of the menu; the href is the fallback when there is no history. */
  back?: string;
  /** Replaces the wordmark (checkout shows "תשלום"). */
  title?: string;
  onMenu: () => void;
}) {
  const router = useRouter();
  const pathname = usePathname();
  const count = useCartCount();
  const user = useCurrentUser();
  const dark = tone !== 'light';
  const iconCls = dark ? 'text-white' : 'text-x-ink';

  const goBack = () => {
    if (window.history.length > 1 && document.referrer.startsWith(window.location.origin)) router.back();
    else if (back) router.push(back);
    else router.back();
  };

  const bar =
    tone === 'overlay'
      ? 'absolute inset-x-0 top-0 bg-transparent'
      : tone === 'dark'
        ? 'sticky top-0 bg-x-night/90 backdrop-blur-md'
        : 'sticky top-0 bg-white/92 backdrop-blur-md lg:border-b lg:border-x-line';

  return (
    <header className={`${bar} z-40 pt-[env(safe-area-inset-top)]`}>
      {/* Mobile / tablet: menu|back · wordmark · search + cart — positions as in the design. */}
      <div dir="ltr" className="mx-auto grid h-14 max-w-3xl grid-cols-[1fr_auto_1fr] items-center px-4 lg:hidden">
        <div className="flex">
          {back ? (
            <button type="button" onClick={goBack} aria-label="חזרה" className={`-ml-2 grid size-10 place-items-center ${iconCls}`}>
              <IconChevron dir="left" size={26} />
            </button>
          ) : (
            <button type="button" onClick={onMenu} aria-label="תפריט" className={`-ml-2 grid size-10 place-items-center ${iconCls}`}>
              <IconMenu size={26} />
            </button>
          )}
        </div>
        <Link href="/shop" aria-label="ANX3D — דף הבית" className="justify-self-center">
          {title ? (
            <span dir="rtl" className={`text-[22px] font-extrabold ${dark ? 'text-white' : 'text-x-ink'}`}>
              {title}
            </span>
          ) : (
            <Logo tone={dark ? 'light' : 'dark'} className="text-[29px]" />
          )}
        </Link>
        <div className="flex items-center justify-end gap-1">
          <Link href="/shop/search" aria-label="חיפוש" className={`grid size-10 place-items-center ${iconCls}`}>
            <IconSearch size={24} />
          </Link>
          <Link href="/shop/cart" aria-label={`עגלת קניות, ${count} פריטים`} className={`relative -mr-1 grid size-10 place-items-center ${iconCls}`}>
            <span className="relative">
              <IconCart size={26} />
              <CartBadge count={count} dark={dark} />
            </span>
          </Link>
        </div>
      </div>

      {/* Desktop: a real top bar instead of a stretched phone header. */}
      <div className="mx-auto hidden h-18 max-w-7xl items-center gap-8 px-8 lg:flex">
        <Link href="/shop" aria-label="ANX3D — דף הבית">
          <Logo tone={dark ? 'light' : 'dark'} className="text-[32px]" />
        </Link>
        <nav aria-label="ניווט ראשי" className="flex items-center gap-1">
          {DESKTOP_LINKS.map((l) => {
            const active = l.href === '/shop' ? pathname === '/shop' : pathname?.startsWith(l.href);
            return (
              <Link
                key={l.href}
                href={l.href}
                className={`rounded-full px-4 py-2 text-[15px] font-semibold transition ${
                  active ? (dark ? 'bg-white/15 text-white' : 'bg-x-blue-50 text-x-blue') : dark ? 'text-white/85 hover:bg-white/10' : 'text-x-ink-2 hover:bg-x-soft'
                }`}
              >
                {l.label}
              </Link>
            );
          })}
        </nav>
        <form
          action="/shop/search"
          onSubmit={(e) => {
            e.preventDefault();
            const q = new FormData(e.currentTarget).get('q');
            router.push(`/shop/search?q=${encodeURIComponent(String(q ?? ''))}`);
          }}
          className="ms-auto flex h-11 w-80 items-center gap-2 rounded-full bg-x-soft px-4 text-x-muted focus-within:ring-2 focus-within:ring-x-blue-100"
        >
          <IconSearch size={20} />
          <input name="q" placeholder="חיפוש מוצרים, קטגוריות..." className="w-full bg-transparent text-sm text-x-ink outline-none placeholder:text-x-faint" />
        </form>
        <div className={`flex items-center gap-1 ${iconCls}`}>
          <Link href="/shop/favorites" aria-label="מועדפים" className={`grid size-11 place-items-center rounded-full ${dark ? 'hover:bg-white/10' : 'hover:bg-x-soft'}`}>
            <IconHeart size={24} />
          </Link>
          <Link href={user ? '/shop/account' : '/shop/login'} aria-label="פרופיל" className={`grid size-11 place-items-center rounded-full ${dark ? 'hover:bg-white/10' : 'hover:bg-x-soft'}`}>
            <IconUser size={24} />
          </Link>
          <Link href="/shop/cart" aria-label={`עגלת קניות, ${count} פריטים`} className={`relative grid size-11 place-items-center rounded-full ${dark ? 'hover:bg-white/10' : 'hover:bg-x-soft'}`}>
            <span className="relative">
              <IconCart size={26} />
              <CartBadge count={count} dark={dark} />
            </span>
          </Link>
        </div>
      </div>
    </header>
  );
}

/* ----------------------------------------------------------- bottom nav */

export type NavKey = 'home' | 'categories' | 'favorites' | 'cart' | 'profile';

export function BottomNav({ active }: { active?: NavKey }) {
  const count = useCartCount();
  const user = useCurrentUser();
  const items: { key: NavKey; href: string; label: string; Icon: typeof IconHome }[] = [
    { key: 'home', href: '/shop', label: 'בית', Icon: IconHome },
    { key: 'categories', href: '/shop/categories', label: 'קטגוריות', Icon: IconGrid },
    { key: 'favorites', href: '/shop/favorites', label: 'מועדפים', Icon: IconHeart },
    { key: 'cart', href: '/shop/cart', label: 'עגלה', Icon: IconCart },
    { key: 'profile', href: user ? '/shop/account' : '/shop/login', label: 'פרופיל', Icon: IconUser },
  ];
  return (
    <nav
      aria-label="ניווט תחתון"
      className="fixed inset-x-0 bottom-0 z-40 rounded-t-[22px] border-t border-x-line/70 bg-white/97 pb-[env(safe-area-inset-bottom)] shadow-[0_-6px_24px_rgb(15_17_21/0.06)] backdrop-blur-md lg:hidden"
    >
      <ul dir="ltr" className="mx-auto grid h-[66px] max-w-3xl grid-cols-5 px-2">
        {items.map(({ key, href, label, Icon }) => {
          const on = key === active;
          return (
            <li key={key}>
              <Link
                href={href}
                aria-current={on ? 'page' : undefined}
                className={`flex h-full flex-col items-center justify-center gap-1 text-[11.5px] font-semibold ${on ? 'text-x-blue' : 'text-x-ink-2'}`}
              >
                <span className="relative">
                  <Icon size={25} filled={on && key !== 'cart'} />
                  {key === 'cart' && <CartBadge count={count} />}
                </span>
                {label}
              </Link>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

/* --------------------------------------------------------------- drawer */

function Drawer({ open, onClose }: { open: boolean; onClose: () => void }) {
  const s = useShop();
  const user = useCurrentUser();
  const pathname = usePathname();
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && onClose();
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);
  // Close on navigation.
  useEffect(() => onClose(), [pathname, onClose]);

  if (!open) return null;
  const cats = [...s.db.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  const row = 'flex items-center gap-3 rounded-xl px-3 py-3 text-[15px] font-semibold hover:bg-x-soft';
  return (
    <div className="fixed inset-0 z-50" role="dialog" aria-modal="true" aria-label="תפריט">
      <button type="button" aria-label="סגירת התפריט" onClick={onClose} className="absolute inset-0 bg-x-ink/40 animate-x-fade" />
      <div className="absolute inset-y-0 left-0 flex w-[86%] max-w-sm flex-col overflow-y-auto bg-white pt-[env(safe-area-inset-top)] shadow-x-pop">
        <div dir="ltr" className="flex h-14 items-center justify-between px-4">
          <button type="button" onClick={onClose} aria-label="סגירה" className="-ml-2 grid size-10 place-items-center">
            <IconClose size={24} />
          </button>
          <Logo className="text-[26px]" />
          <span className="size-10" />
        </div>
        <div className="px-3 pb-6">
          <Link href={user ? '/shop/account' : '/shop/login'} className="mb-3 flex items-center gap-3 rounded-2xl bg-x-soft p-3">
            <span className="grid size-11 place-items-center rounded-full bg-linear-to-br from-[#5b8bff] to-x-blue text-white">
              <IconUser size={22} />
            </span>
            <span className="min-w-0">
              <span className="block truncate font-bold">{user ? user.name : 'התחברות / הרשמה'}</span>
              <span className="block truncate text-xs text-x-muted">{user ? user.email : 'לשמירת הזמנות, כתובות ומועדפים'}</span>
            </span>
          </Link>
          <nav aria-label="תפריט ראשי">
            <Link href="/shop" className={row}>
              <IconHome size={22} /> דף הבית
            </Link>
            <Link href="/shop/c/all" className={row}>
              <CategoryGlyph icon="all" size={22} /> כל המוצרים
            </Link>
            <Link href="/shop/search" className={row}>
              <IconSearch size={22} /> חיפוש
            </Link>
            <Link href="/shop/favorites" className={row}>
              <IconHeart size={22} /> מועדפים
            </Link>
            <Link href="/shop/cart" className={row}>
              <IconCart size={22} /> עגלת קניות
            </Link>
            <p className="mt-4 mb-1 px-3 text-xs font-bold text-x-faint">קטגוריות</p>
            {cats.map((c) => (
              <Link key={c.slug} href={categoryHref(c.slug, STATIC_CATEGORY_SLUGS)} className={row}>
                <CategoryGlyph icon={c.icon} size={22} /> {c.name}
              </Link>
            ))}
            {user?.role === 'admin' && (
              <>
                <p className="mt-4 mb-1 px-3 text-xs font-bold text-x-faint">ניהול</p>
                <Link href="/shop/admin" className={row}>
                  <IconGrid size={22} /> ניהול החנות
                </Link>
              </>
            )}
          </nav>
          {s.db.settings.sampleDataNotice && (
            <p className="mt-6 rounded-xl bg-x-blue-50 p-3 text-xs leading-relaxed text-x-ink-2">
              האתר בשלב פיתוח: המוצרים, המחירים, הדירוגים והמלאי המוצגים הם נתוני דוגמה, והתשלום פועל במצב הדגמה ללא חיוב.
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------- frame */

export function SampleRibbon({ dark }: { dark?: boolean }) {
  const s = useShop();
  if (!s.db.settings.sampleDataNotice) return null;
  return (
    <p
      className={`px-4 py-1 text-center text-[11px] font-medium ${dark ? 'bg-white/8 text-white/70' : 'bg-x-soft text-x-muted'}`}
    >
      גרסת פיתוח · מוצרים, מחירים, דירוגים ומלאי הם נתוני דוגמה
    </p>
  );
}

export function ShopFrame({
  children,
  nav,
  header = 'light',
  back,
  title,
  hideHeader,
  dark,
}: {
  children: React.ReactNode;
  /** Bottom-nav tab to highlight; `false` hides the bar (product, checkout, search). */
  nav?: NavKey | false;
  header?: HeaderTone;
  back?: string;
  title?: string;
  hideHeader?: boolean;
  dark?: boolean;
}) {
  const [menu, setMenu] = useState(false);
  const close = useState(() => () => setMenu(false))[0];
  return (
    <div className={`relative min-h-dvh ${dark ? 'bg-x-night text-white' : 'bg-white'}`}>
      {!hideHeader && <ShopHeader tone={header} back={back} title={title} onMenu={() => setMenu(true)} />}
      <main id="main" className={nav === false ? 'pb-8' : 'pb-[calc(92px+env(safe-area-inset-bottom))] lg:pb-16'}>
        {children}
      </main>
      {nav !== false && <BottomNav active={nav} />}
      <Drawer open={menu} onClose={close} />
      <Toaster />
    </div>
  );
}
