'use client';

import Link from 'next/link';
import { usePathname, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type ReactNode } from 'react';
import { useLc } from '@/lib/lc/context';
import { LOCALE_META, type TKey } from '@/lib/lc/i18n';
import { createLead } from '@/lib/lc/ops';
import { planByKey } from '@/lib/lc/plans';
import type { Locale } from '@/lib/lc/types';
import { BotIcon, BriefcaseIcon, CalendarIcon, ChartIcon, CreditCardIcon, HomeIcon, InboxIcon, LogOutIcon, MoreIcon, SettingsIcon, SparklesIcon, TagIcon, UsersIcon, WrenchIcon, XIcon, ZapIcon } from './icons';
import { Badge, Button, Skeleton, cx } from './ui/primitives';
import { useToast } from './ui/toast';

type Item = { href: string; key: TKey; icon: (p: { className?: string }) => ReactNode; exact?: boolean };
const WORK: Item[] = [
  { href: '/lc', key: 'nav.home', icon: HomeIcon, exact: true },
  { href: '/lc/inbox', key: 'nav.inbox', icon: InboxIcon },
  { href: '/lc/jobs', key: 'nav.jobs', icon: BriefcaseIcon },
  { href: '/lc/calendar', key: 'nav.calendar', icon: CalendarIcon },
  { href: '/lc/customers', key: 'nav.customers', icon: UsersIcon },
];
const GROW: Item[] = [
  { href: '/lc/agent', key: 'nav.agent', icon: BotIcon },
  { href: '/lc/automations', key: 'nav.automations', icon: ZapIcon },
  { href: '/lc/analytics', key: 'nav.analytics', icon: ChartIcon },
];
const SETUP: Item[] = [
  { href: '/lc/pricing', key: 'nav.pricing', icon: TagIcon },
  { href: '/lc/workers', key: 'nav.workers', icon: WrenchIcon },
  { href: '/lc/billing', key: 'nav.billing', icon: CreditCardIcon },
  { href: '/lc/settings', key: 'nav.settings', icon: SettingsIcon },
];
const MOBILE: Item[] = [WORK[0], WORK[1], WORK[2], WORK[3]];

export function Logo({ compact }: { compact?: boolean }) {
  return (
    <Link href="/lc" className="flex items-center gap-2.5">
      <span className="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-lc-primary to-lc-violet text-white shadow-lc-primary">
        <SparklesIcon className="h-5 w-5" />
      </span>
      {!compact && (
        <span className="leading-tight">
          <span className="block text-[15px] font-bold tracking-tight text-lc-text">LeadCloser AI</span>
        </span>
      )}
    </Link>
  );
}

export function LocaleSwitch({ compact }: { compact?: boolean }) {
  const { locale, setLocale } = useLc();
  return (
    <div role="group" className="inline-flex items-center rounded-lg bg-slate-100 p-0.5">
      {(['he', 'ru', 'en'] as Locale[]).map((l) => (
        <button key={l} type="button" aria-pressed={locale === l} onClick={() => setLocale(l)} className={cx('rounded-md px-2 py-1 text-[11px] font-bold uppercase transition-all', locale === l ? 'bg-white text-lc-text shadow-[0_1px_2px_rgba(15,23,42,0.12)]' : 'text-lc-faint hover:text-lc-text')} title={LOCALE_META[l].label}>
          {compact ? l : LOCALE_META[l].native}
        </button>
      ))}
    </div>
  );
}

function useInboxBadge() {
  const { s } = useLc();
  return useMemo(() => (s ? s.conversations.filter((c) => c.unreadCount > 0 || c.status === 'new').length : 0), [s]);
}

function NavList({ items, onNavigate }: { items: Item[]; onNavigate?: () => void }) {
  const pathname = usePathname();
  const { t } = useLc();
  const badge = useInboxBadge();
  return (
    <ul className="space-y-0.5">
      {items.map((it) => {
        const active = it.exact ? pathname === it.href : pathname?.startsWith(it.href);
        return (
          <li key={it.href}>
            <Link href={it.href} onClick={onNavigate} aria-current={active ? 'page' : undefined} className={cx('group flex items-center gap-3 rounded-xl px-3 py-2 text-[14px] font-medium transition-colors', active ? 'bg-lc-primary-soft text-lc-primary' : 'text-lc-muted hover:bg-lc-bg hover:text-lc-text')}>
              <it.icon className={cx('h-[18px] w-[18px]', active ? 'text-lc-primary' : 'text-lc-faint group-hover:text-lc-text')} />
              <span className="flex-1">{t(it.key)}</span>
              {it.href === '/lc/inbox' && badge > 0 && <span className="lc-tnum grid h-5 min-w-5 place-items-center rounded-full bg-lc-primary px-1.5 text-[11px] font-bold text-white">{badge}</span>}
            </Link>
          </li>
        );
      })}
    </ul>
  );
}

function Section({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div>
      <p className="mb-1.5 px-3 text-[11px] font-bold uppercase tracking-wider text-lc-faint">{label}</p>
      {children}
    </div>
  );
}

function SimulateLeadButton({ compact }: { compact?: boolean }) {
  const { run, t, s } = useLc();
  const toast = useToast();
  if (!s?.organization.demo) return null;
  const openers = [
    { text: 'היי, כמה עולה לנקות ספה פינתית?', name: 'אורית שמש', lang: 'he' as Locale, source: 'google' as const },
    { text: 'Здравствуйте! Сколько стоит почистить матрас и два кресла?', name: 'Анна Гуревич', lang: 'ru' as Locale, source: 'facebook' as const },
    { text: 'שלום, יש לי ספה תלת מושבית עם כתמים של הכלב', name: 'מיכאל ורדי', lang: 'he' as Locale, source: 'instagram' as const },
    { text: 'Hi! How much for a corner sofa and a rug?', name: 'Daniel Ross', lang: 'en' as Locale, source: 'website' as const },
  ];
  return (
    <Button
      variant="secondary"
      size={compact ? 'sm' : 'md'}
      icon={<ZapIcon className="h-4 w-4 text-lc-warning" />}
      onClick={() => {
        const o = openers[Math.floor(Math.random() * openers.length)];
        const r = run((snap) => createLead(snap, { name: o.name, phone: `05${Math.floor(10000000 + Math.random() * 89999999)}`, source: o.source, channel: o.source === 'website' ? 'website' : 'whatsapp', text: o.text, language: o.lang }));
        toast.ai(t('toast.newLead'), o.name);
        void r;
      }}
    >
      {compact ? null : t('shell.simulateLead')}
    </Button>
  );
}

function Sidebar() {
  const { s, t, signOut, mode } = useLc();
  const plan = s ? planByKey(s.subscription.plan) : null;
  return (
    <aside className="fixed inset-y-0 start-0 z-40 hidden w-[264px] flex-col border-e border-lc-border bg-white/80 backdrop-blur-xl lg:flex">
      <div className="flex h-16 items-center px-5">
        <Logo />
      </div>
      <nav className="lc-scroll flex-1 space-y-6 overflow-y-auto px-3 py-2">
        <Section label={t('nav.section.work')}>
          <NavList items={WORK} />
        </Section>
        <Section label={t('nav.section.grow')}>
          <NavList items={GROW} />
        </Section>
        <Section label={t('nav.section.setup')}>
          <NavList items={SETUP} />
        </Section>
      </nav>
      <div className="space-y-3 border-t border-lc-border p-4">
        <SimulateLeadButton />
        {s && (
          <div className="rounded-xl border border-lc-border bg-lc-bg p-3">
            <div className="flex items-center justify-between gap-2">
              <div className="min-w-0">
                <p className="truncate text-sm font-semibold text-lc-text">{s.organization.name}</p>
                <p className="mt-0.5 flex items-center gap-1.5 text-[11px] text-lc-muted">
                  <span className={cx('h-1.5 w-1.5 rounded-full', s.organization.active ? 'bg-lc-success' : 'bg-lc-faint')} />
                  {s.organization.active ? t('shell.agentLive') : t('shell.agentOff')}
                </p>
              </div>
              {plan && <Badge tone={s.organization.demo ? 'warning' : 'primary'} size="sm">{s.organization.demo ? t('common.demoBadge') : plan.name}</Badge>}
            </div>
          </div>
        )}
        <div className="flex items-center justify-between gap-2">
          <LocaleSwitch />
          <button type="button" onClick={() => void signOut()} className="grid h-8 w-8 place-items-center rounded-lg text-lc-faint hover:bg-lc-bg hover:text-lc-text" title={t('nav.logout')}>
            <LogOutIcon className="h-4 w-4" />
          </button>
        </div>
        {mode === 'live' && <p className="text-[10px] text-lc-faint">Supabase · RLS</p>}
      </div>
    </aside>
  );
}

function BottomNav() {
  const pathname = usePathname();
  const { t } = useLc();
  const badge = useInboxBadge();
  const [more, setMore] = useState(false);
  const moreActive = [...GROW, ...SETUP, WORK[4]].some((i) => pathname?.startsWith(i.href));
  return (
    <>
      <nav aria-label="main" className="fixed inset-x-0 bottom-0 z-40 border-t border-lc-border bg-white/90 pb-[env(safe-area-inset-bottom)] backdrop-blur-xl lg:hidden">
        <ul className="mx-auto flex max-w-lg items-stretch">
          {MOBILE.map((it) => {
            const active = it.exact ? pathname === it.href : pathname?.startsWith(it.href);
            return (
              <li key={it.href} className="flex flex-1">
                <Link href={it.href} aria-current={active ? 'page' : undefined} className={cx('relative flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-semibold transition-colors', active ? 'text-lc-primary' : 'text-lc-faint')}>
                  <span className={cx('relative grid h-7 w-12 place-items-center rounded-full transition-all', active && 'bg-lc-primary-soft')}>
                    <it.icon className="h-[22px] w-[22px]" />
                    {it.href === '/lc/inbox' && badge > 0 && <span className="lc-live lc-tnum absolute -end-0.5 -top-1 grid h-4.5 min-w-4.5 place-items-center rounded-full bg-lc-primary px-1 text-[10px] font-bold text-white">{badge}</span>}
                  </span>
                  {t(it.key)}
                </Link>
              </li>
            );
          })}
          <li className="flex flex-1">
            <button type="button" onClick={() => setMore(true)} className={cx('flex flex-1 flex-col items-center gap-0.5 pb-1.5 pt-2 text-[11px] font-semibold', moreActive ? 'text-lc-primary' : 'text-lc-faint')}>
              <span className={cx('grid h-7 w-12 place-items-center rounded-full', moreActive && 'bg-lc-primary-soft')}>
                <MoreIcon className="h-[22px] w-[22px]" />
              </span>
              {t('nav.more')}
            </button>
          </li>
        </ul>
      </nav>
      {more && (
        <div className="fixed inset-0 z-[80] lg:hidden">
          <div className="absolute inset-0 bg-slate-900/40 animate-lc-fade" onClick={() => setMore(false)} />
          <div className="lc-theme absolute inset-x-0 bottom-0 rounded-t-3xl bg-white p-4 pb-[calc(1rem+env(safe-area-inset-bottom))] shadow-lc-pop animate-lc-pop">
            <div className="mb-3 flex items-center justify-between">
              <Logo />
              <button type="button" onClick={() => setMore(false)} className="grid h-8 w-8 place-items-center rounded-lg text-lc-muted hover:bg-lc-bg">
                <XIcon className="h-4 w-4" />
              </button>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <Section label={t('nav.section.grow')}>
                <NavList items={[WORK[4], ...GROW]} onNavigate={() => setMore(false)} />
              </Section>
              <Section label={t('nav.section.setup')}>
                <NavList items={SETUP} onNavigate={() => setMore(false)} />
              </Section>
            </div>
            <div className="mt-4 flex items-center justify-between border-t border-lc-border pt-3">
              <LocaleSwitch />
              <SimulateLeadButton compact />
            </div>
          </div>
        </div>
      )}
    </>
  );
}

function BootScreen() {
  return (
    <div className="min-h-dvh bg-lc-bg p-6 lg:ps-[264px]">
      <div className="mx-auto max-w-6xl space-y-4">
        <Skeleton className="h-9 w-48" />
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-28 rounded-2xl" />
          ))}
        </div>
        <Skeleton className="h-64 rounded-2xl" />
      </div>
    </div>
  );
}

/** Wraps every authenticated screen: auth gate, sidebar / bottom nav, page transition. */
export function Shell({ children, title, wide, flush }: { children: ReactNode; title?: string; wide?: boolean; flush?: boolean }) {
  const { status, s, events, clearEvents, t } = useLc();
  const router = useRouter();
  const pathname = usePathname();
  const toast = useToast();

  useEffect(() => {
    if (status === 'signed_out') router.replace('/lc/login');
    if (status === 'no_workspace') router.replace('/lc/onboarding');
    if (status === 'ready' && s && !s.organization.active && !s.organization.demo && !pathname?.startsWith('/lc/onboarding')) router.replace('/lc/onboarding');
  }, [status, s, router, pathname]);

  useEffect(() => {
    if (!events.length) return;
    for (const e of events) {
      if (e.type === 'booked') toast.success(t('toast.booked'), `${e.payload?.customer ?? ''} · ₪${e.payload?.total ?? ''}`);
      else if (e.type === 'handoff') toast.info(t('toast.handoff'));
    }
    clearEvents();
  }, [events, clearEvents, toast, t]);

  if (status !== 'ready' || !s) return <BootScreen />;

  return (
    <div className="min-h-dvh bg-lc-bg">
      <Sidebar />
      <header className="sticky top-0 z-30 flex h-14 items-center justify-between border-b border-lc-border bg-white/85 px-4 pt-[env(safe-area-inset-top)] backdrop-blur-xl lg:hidden">
        {title ? <h1 className="text-[17px] font-bold tracking-tight text-lc-text">{title}</h1> : <Logo />}
        <div className="flex items-center gap-2">
          {s.organization.demo && <Badge tone="warning" size="sm">{t('common.demoBadge')}</Badge>}
          <LocaleSwitch compact />
        </div>
      </header>
      <main className={cx('lg:ps-[264px]', flush ? '' : 'pb-[calc(5.5rem+env(safe-area-inset-bottom))] lg:pb-10')}>
        <div key={pathname} className={cx(flush ? 'lc-page' : 'lc-page mx-auto px-4 py-5 sm:px-6 lg:px-8 lg:py-8', !flush && (wide ? 'max-w-[1600px]' : 'max-w-[1240px]'))}>{children}</div>
      </main>
      <BottomNav />
    </div>
  );
}
