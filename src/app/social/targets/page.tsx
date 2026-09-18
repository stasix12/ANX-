'use client';

import Link from 'next/link';
import { useSearchParams } from 'next/navigation';
import { Suspense, useCallback, useEffect, useState } from 'react';
import { SocialShell } from '@/components/social/SocialShell';
import { Button, Card, Empty, Loading, Notice, Toggle } from '@/components/social/ui';
import { callSocialApi, listTargets, updateTarget } from '@/lib/social/client';
import { formatDateTimeHe } from '@/lib/social/time';
import { CHANNEL_LABEL, PERMISSION_LABEL, REQUIRED_SCOPES, type SocialAccount, type SocialTarget } from '@/lib/social/types';

interface Status {
  configured: { facebookApp: boolean; serviceRole: boolean; encryptionKey: boolean; cronSecret: boolean };
  account: SocialAccount | null;
}

export default function TargetsPage() {
  return (
    <Suspense fallback={<SocialShell title="יעדי פרסום"><Loading /></SocialShell>}>
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

  const load = useCallback(async () => {
    const [t, s] = await Promise.all([listTargets(), callSocialApi<Status>('/api/social/status', { method: 'GET' })]);
    setTargets(t);
    setStatus(s);
  }, []);

  useEffect(() => {
    load().catch((err) => setError(err instanceof Error ? err.message : 'טעינה נכשלה.'));
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
      setError(err instanceof Error ? err.message : 'ההתחברות נכשלה.');
      setBusy(null);
    }
  }

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
    setError(null);
    try {
      await fn();
      if (done) setFlash(done);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'הפעולה נכשלה.');
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
    <SocialShell title="יעדי פרסום">
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
              <div className="grid gap-2 text-sm sm:grid-cols-2">
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
                  onClick={() => {
                    if (window.confirm('לנתק את פייסבוק? ההרשאה תבוטל אצל Meta וכל הטוקנים יימחקו.'))
                      act('revoke', () => callSocialApi('/api/social/facebook/revoke'), 'החיבור נותק והטוקנים נמחקו.');
                  }}
                >
                  נתק ומחק טוקנים
                </Button>
              </div>
            </div>
          )}
        </Card>

        <Card title={`דפי פייסבוק (${pages.length})`}>
          {targets === null && <Loading />}
          {targets && pages.length === 0 && <Empty>אין דפים. אחרי ההתחברות לחצו "סנכרן". מוצגים רק דפים שאתם מנהלים.</Empty>}
          {pages.length > 0 && <TargetTable rows={pages} busy={busy} onToggle={(t, v) => act(t.id, () => updateTarget(t.id, { enabled: v }))} />}
        </Card>

        <Card title={`קבוצות פייסבוק (${groups.length})`} action={<Link href="/social/groups" className="text-sm font-bold text-brand-400">ניהול קבוצות ←</Link>}>
          <p className="text-sm text-mist-300">
            Meta ביטלה את ה-Groups API באפריל 2024, ולכן קבוצות מתפרסמות דרך ה-worker המקומי (Playwright בדפדפן שלכם). ניהול הקבוצות, הסטטוסים והשגיאות — במסך הקבוצות.
          </p>
        </Card>
      </div>
    </SocialShell>
  );
}

function TargetTable({
  rows,
  busy,
  onToggle,
  onDelete,
}: {
  rows: SocialTarget[];
  busy: string | null;
  onToggle: (t: SocialTarget, v: boolean) => void;
  onDelete?: (t: SocialTarget) => void;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead className="text-xs text-mist-500">
          <tr className="text-start">
            <th className="py-2 text-start font-bold">שם</th>
            <th className="py-2 text-start font-bold">מזהה</th>
            <th className="py-2 text-start font-bold">סטטוס הרשאה</th>
            <th className="py-2 text-start font-bold">פרסום דרך API</th>
            <th className="py-2 text-start font-bold">פעיל</th>
            {onDelete && <th />}
          </tr>
        </thead>
        <tbody className="divide-y divide-ink-700">
          {rows.map((t) => (
            <tr key={t.id} className={t.enabled ? '' : 'opacity-60'}>
              <td className="py-2.5 pe-3">
                <a href={t.url || undefined} target="_blank" rel="noreferrer" className="font-bold text-mist-100 hover:text-brand-400">
                  {t.name}
                </a>
                <p className="text-xs text-mist-500">{CHANNEL_LABEL[t.channel]}</p>
              </td>
              <td className="py-2.5 pe-3 font-mono text-xs text-mist-300" dir="ltr">
                {t.external_id || '—'}
              </td>
              <td className="py-2.5 pe-3">
                <span className={`rounded-full px-2 py-0.5 text-xs font-bold ${t.permission_status === 'ok' ? 'bg-emerald-100 text-emerald-700' : t.permission_status === 'manual_only' ? 'bg-violet-100 text-violet-700' : 'bg-rose-100 text-rose-700'}`}>
                  {PERMISSION_LABEL[t.permission_status]}
                </span>
                {t.tasks.length > 0 && <p className="mt-0.5 text-[11px] text-mist-500" dir="ltr">{t.tasks.join(', ')}</p>}
              </td>
              <td className="py-2.5 pe-3 font-bold">{t.can_api_publish ? <span className="text-emerald-700">כן</span> : <span className="text-violet-700">לא — ידני</span>}</td>
              <td className="py-2.5 pe-3">
                <Toggle checked={t.enabled} onChange={(v) => onToggle(t, v)} label={`הפעל ${t.name}`} />
              </td>
              {onDelete && (
                <td className="py-2.5">
                  <button type="button" disabled={busy === t.id} onClick={() => onDelete(t)} className="text-xs font-bold text-rose-600">
                    מחק
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
