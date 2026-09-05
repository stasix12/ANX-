'use client';

import { useMemo } from 'react';
import { Shell } from '@/components/lc/Shell';
import { CheckIcon, CreditCardIcon, SparklesIcon } from '@/components/lc/icons';
import { Badge, Button, Card, CardHeader, PageHeader, Progress, cx } from '@/components/lc/ui/primitives';
import { useToast } from '@/components/lc/ui/toast';
import { useLc } from '@/lib/lc/context';
import { formatDate } from '@/lib/lc/format';
import { changePlan } from '@/lib/lc/ops';
import { PLANS, planByKey } from '@/lib/lc/plans';
import { pick, startOfMonth } from '@/lib/lc/util';

export default function BillingPage() {
  const { s, t, locale, run } = useLc();
  const toast = useToast();
  const now = useMemo(() => new Date(), []);
  const plan = s ? planByKey(s.subscription.plan) : null;
  const usage = useMemo(() => {
    if (!s) return null;
    const from = startOfMonth(now);
    return { leads: s.leads.filter((l) => new Date(l.createdAt) >= from).length, workers: s.workers.filter((w) => w.active).length, automations: s.automations.filter((a) => a.enabled).length, languages: s.settings.languages.length };
  }, [s, now]);

  return (
    <Shell title={t('bill.title')}>
      {s && plan && usage && (
        <>
          <PageHeader title={t('bill.title')} subtitle={t('bill.note')} />
          <Card className="mb-6">
            <CardHeader title={t('bill.current')} action={<Badge tone={s.subscription.status === 'trialing' ? 'warning' : 'success'} dot>{s.subscription.status}</Badge>} />
            <div className="grid gap-5 p-5 md:grid-cols-[220px_1fr]">
              <div>
                <p className="text-3xl font-bold text-lc-text">{plan.name}</p>
                <p className="lc-tnum mt-1 text-lc-muted">₪{plan.price}{t('common.perMonth')}</p>
                <p className="mt-2 text-xs text-lc-faint">{formatDate(s.subscription.periodEnd, locale, 'medium')}</p>
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <Usage label={t('bill.leadsLimit')} value={usage.leads} max={plan.limits.leadsPerMonth} t={t} />
                <Usage label={t('bill.workersLimit')} value={usage.workers} max={plan.limits.workers} t={t} />
                <Usage label={t('nav.automations')} value={usage.automations} max={plan.limits.automations} t={t} />
                <Usage label={t('common.language')} value={usage.languages} max={plan.limits.languages} t={t} />
              </div>
            </div>
          </Card>

          <div className="grid gap-4 lg:grid-cols-3">
            {PLANS.map((p) => {
              const current = p.key === s.subscription.plan;
              return (
                <Card key={p.key} className={cx('relative flex flex-col p-6', p.popular && 'ring-2 ring-lc-primary')}>
                  {p.popular && <Badge tone="primary" className="absolute -top-3 start-6"><SparklesIcon className="h-3 w-3" />{t('bill.popular')}</Badge>}
                  <p className="text-lg font-bold text-lc-text">{p.name}</p>
                  <p className="mt-1 text-sm text-lc-muted">{pick(p.tagline, locale)}</p>
                  <p className="lc-tnum mt-4 text-4xl font-bold tracking-tight text-lc-text">₪{p.price}<span className="text-base font-medium text-lc-muted">{t('common.perMonth')}</span></p>
                  <ul className="mt-5 flex-1 space-y-2.5">
                    {p.features.map((f, i) => (
                      <li key={i} className="flex items-start gap-2 text-sm text-lc-text"><CheckIcon className="mt-0.5 h-4 w-4 shrink-0 text-lc-success" strokeWidth={3} />{pick(f, locale)}</li>
                    ))}
                  </ul>
                  <Button className="mt-6 w-full" variant={current ? 'secondary' : p.popular ? 'primary' : 'dark'} disabled={current} icon={<CreditCardIcon className="h-4 w-4" />} onClick={() => { run((snap) => changePlan(snap, p.key)); toast.success(`${p.name} ✓`); }}>
                    {current ? t('bill.currentBtn') : t('bill.choose')}
                  </Button>
                </Card>
              );
            })}
          </div>
        </>
      )}
    </Shell>
  );
}

function Usage({ label, value, max, t }: { label: string; value: number; max: number | null; t: ReturnType<typeof useLc>['t'] }) {
  const pctv = max ? Math.min(100, (value / max) * 100) : 8;
  return (
    <div>
      <div className="mb-1 flex items-center justify-between text-[13px]"><span className="text-lc-muted">{label}</span><span className="lc-tnum font-semibold text-lc-text">{value} / {max ?? t('bill.unlimited')}</span></div>
      <Progress value={pctv} tone={pctv > 90 ? 'danger' : pctv > 70 ? 'warning' : 'primary'} />
    </div>
  );
}
