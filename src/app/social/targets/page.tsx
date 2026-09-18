'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { SocialShell } from '@/components/social/SocialShell';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Loading,
  MethodBadge,
  Notice,
  SkeletonList,
  Toggle,
  useConfirm,
  useToast,
} from '@/components/social/ui';
import { callSocialApi, listTargets, updateTarget } from '@/lib/social/client';
import { formatDateTimeHe } from '@/lib/social/time';
import { PERMISSION_LABEL, REQUIRED_SCOPES, type SocialAccount, type SocialTarget } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';

interface Status {
  configured: { facebookApp: boolean; serviceRole: boolean; encryptionKey: boolean; cronSecret: boolean };
  account: SocialAccount | null;
}

export default function TargetsPage() {
  return (
    <Suspense fallback={<SocialShell title="דפי פייסבוק"><Loading /></SocialShell>}>
      <TargetsScreen />
    </Suspense>
  );
}

function TargetsScreen() {
  const params = useSearchParams();
  const [targets, setTargets] = useState<SocialTarget[] | null>(null);
  const [status, setStatus] = useState<Status | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [flash, setFlash] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();

  const load = useCallback(async () => {
    const [t, s] = await Promise.all([listTargets(), callSocialApi<Status>('/api/social/status', { method: 'GET' })]);
    setTargets(t);
    setStatus(s);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(friendlyMessage(err, 'טעינה נכשלה.')));
    const connect = params.get('connect');
    if (connect === 'ok') setFlash(`פייסבוק חובר בהצלחה. סונכרנו ${params.get('pages') ?? '0'} דפים.`);
    if (connect === 'declined') setFlash('ההתחברות בוטלה בפייסבוק — לא ניתנו הרשאות.');
    if (connect === 'state') setFlash('בדיקת האבטחה (state) נכשלה. נסו להתחבר שוב מהדפדפן הזה.');
    if (connect === 'error') setFlash(`ההתחברות נכשלה: ${params.get('message') ?? ''}`);
  }, [load, params]);

  async function connect() {
    setBusy('connect');
    try {
      const { url } = await callSocialApi<{ url: string }>('/api/social/facebook/connect');
      window.location.href = url;
    } catch (err) {
      setError(friendlyMessage(err, 'ההתחברות נכשלה.'));
      setBusy(null);
    }
  }

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (done) toast(done);
      await load();
    } catch (err) {
      toast(friendlyMessage(err, 'הפעולה נכשלה.'), 'error');
    } finally {
      setBusy(null);
    }
  }

  const account = status?.account ?? null;
  const missing = account ? REQUIRED_SCOPES.filter((s) => !account.granted_scopes.includes(s)) : [];
  const envMissing = status
    ? [
        !status.configured.facebookApp && 'FACEBOOK_APP_ID / FACEBOOK_APP_SECRET',
        !status.configured.serviceRole && 'SUPABASE_SERVICE_ROLE_KEY',
        !status.configured.encryptionKey && 'SOCIAL_ENCRYPTION_KEY',
        !status.configured.cronSecret && 'SOCIAL_CRON_SECRET',
      ].filter(Boolean)
    : [];

  const pages = (targets ?? []).filter((t) => t.channel === 'facebook_page');
  const groups = (targets ?? []).filter((t) => t.channel === 'facebook_group' || t.channel === 'facebook_group_manual');

  return (
    <SocialShell title="דפי פייסבוק">
      <div className="space-y-5">
        {flash && <Notice tone="info">{flash}</Notice>}
        {error && <Notice tone="error">{error}</Notice>}
        {envMissing.length > 0 && (
          <Notice tone="warn">
            חסרים משתני סביבה בשרת: <code dir="ltr">{envMissing.join(', ')}</code>. ראו docs/SOCIAL.md.
          </Notice>
        )}

        <Card title="חשבון פייסבוק">
          {!status && <Loading />}
          {status && !account && (
            <div className="space-y-3">
              <p className="text-sm text-mist-300">
                ההתחברות היא דרך Facebook Login הרשמי של Meta. המערכת לא רואה ולא שומרת סיסמה — רק טוקן גישה מוצפן, בצד השרת, עם ההרשאות המינימליות:{' '}
                <code dir="ltr">{REQUIRED_SCOPES.join(', ')}</code>.
              </p>
              <Button busy={busy === 'connect'} onClick={connect} disabled={!status.configured.facebookApp}>
                התחבר עם פייסבוק
              </Button>
            </div>
          )}
          {account && (
            <div className="space-y-3">
              <div className="grid gap-2 text-sm sm:grid-cols-2 [&>*]:min-w-0">
                <p>
                  <span className="text-mist-500">מחובר בתור:</span> <strong className="text-mist-100">{account.name}</strong>
                </p>
                <p>
                  <span className="text-mist-500">תוקף הטוקן:</span> <strong className="text-mist-100">{account.token_expires_at ? formatDateTimeHe(account.token_expires_at) : 'ללא תפוגה'}</strong>
                </p>
                <p>
                  <span className="text-mist-500">סנכרון אחרון:</span> <strong className="text-mist-100">{formatDateTimeHe(account.last_synced_at)}</strong>
                </p>
                <p>
                  <span className="text-mist-500">הרשאות:</span>{' '}
                  {REQUIRED_SCOPES.map((s) => (
                    <span key={s} dir="ltr" className={`me-1 inline-block rounded px-1.5 text-xs font-bold ${account.granted_scopes.includes(s) ? 'bg-emerald-100 text-emerald-700' : 'bg-rose-100 text-rose-700'}`}>
                      {s}
                    </span>
                  ))}
                </p>
              </div>
              {missing.length > 0 && (
                <Notice tone="warn">
                  Meta לא אישרה: <code dir="ltr">{missing.join(', ')}</code>. בלי pages_manage_posts אי אפשר לפרסם לדפים דרך API — התחברו מחדש ואשרו את כל ההרשאות.
                </Notice>
              )}
              <div className="flex flex-wrap gap-2">
                <Button variant="secondary" busy={busy === 'sync'} onClick={() => act('sync', () => callSocialApi('/api/social/targets/sync'), 'היעדים סונכרנו.')}>
                  סנכרן דפים והרשאות
                </Button>
                <Button variant="secondary" busy={busy === 'connect'} onClick={connect}>
                  התחבר מחדש
                </Button>
                <Button
                  variant="danger"
                  busy={busy === 'revoke'}
                  onClick={async () => {
                    const ok = await confirm.ask({
                      title: 'לנתק את פייסבוק?',
                      body: 'ההרשאה תבוטל אצל Meta וכל הטוקנים יימחקו מהשרת. פרסום לדפים ייפסק עד שתתחברו שוב. פרסום בקבוצות לא מושפע.',
                      confirmLabel: 'נתק ומחק טוקנים',
                      danger: true,
                    });
                    if (ok) act('revoke', () => callSocialApi('/api/social/facebook/revoke'), 'החיבור נותק והטוקנים נמחקו.');
                  }}
                >
                  נתק ומחק טוקנים
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card title={`דפים שאתם מנהלים (${pages.length})`} subtitle="מתפרסמים דרך Graph API הרשמי של Meta">
          {targets === null && <SkeletonList rows={2} />}
          {targets && pages.length === 0 && (
            <EmptyState
              icon="🏷️"
              title="אין דפים מחוברים"
              description='התחברו לפייסבוק ולחצו "סנכרן". מוצגים רק דפים שאתם מנהלים ושנתתם להם הרשאת פרסום.'
            />
          )}
          {pages.length > 0 && (
            <ul className="divide-y divide-ink-700">
              {pages.map((t) => (
                <li key={t.id} className="flex items-center gap-3 py-3">
                  <div className="min-w-0 grow">
                    <a href={t.url || undefined} target="_blank" rel="noreferrer" dir="auto" className="block truncate font-bold text-mist-100 hover:text-brand-400">
                      {t.name}
                    </a>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <MethodBadge method="api" />
                      <Badge tone={t.permission_status === 'ok' ? 'good' : t.permission_status === 'manual_only' ? 'brand' : 'bad'}>
                        {PERMISSION_LABEL[t.permission_status]}
                      </Badge>
                      {!t.can_api_publish && <Badge tone="warn">אין הרשאת פרסום</Badge>}
                    </div>
                    {t.tasks.length > 0 && (
                      <p className="mt-0.5 truncate font-mono text-[11px] text-mist-500" dir="ltr">
                        {t.tasks.join(', ')}
                      </p>
                    )}
                  </div>
                  <Toggle checked={t.enabled} onChange={(v) => act(t.id, () => updateTarget(t.id, { enabled: v }))} label={`הפעל ${t.name}`} />
                </li>
              ))}
            </ul>
          )}
        </Card>

        <Card
          title={`קבוצות (${groups.length})`}
          subtitle="מתפרסמות בסיוע דפדפן מקומי — לא דרך API רשמי"
          action={
            <Link href="/social/groups" className="text-sm font-bold text-brand-400">
              ניהול ←
            </Link>
          }
        >
          <div className="flex flex-wrap items-center gap-1.5">
            <MethodBadge method="browser" />
            <Badge tone="neutral">{groups.filter((g) => g.enabled).length} פעילות</Badge>
          </div>
          <p className="mt-2 text-sm leading-relaxed text-mist-300">
            Meta ביטלה את ה-Groups API באפריל 2024. לכן קבוצות מתפרסמות דרך חלון Chrome על המחשב שלכם, מהחשבון שלכם — לא דרך אינטגרציה
            רשמית של פייסבוק. ניהול הקבוצות, הסטטוסים והשגיאות נמצא במסך הקבוצות.
          </p>
        </Card>
      </div>
      {confirm.dialog}
    </SocialShell>
  );
}
