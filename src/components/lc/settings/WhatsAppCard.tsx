'use client';

import { useState } from 'react';
import { supabase } from '@/lib/supabase';
import { useLc } from '@/lib/lc/context';
import { formatDateTime } from '@/lib/lc/format';
import { removeIntegration, upsertIntegration } from '@/lib/lc/ops';
import type { Integration } from '@/lib/lc/types';
import { uid } from '@/lib/lc/util';
import { CheckCircleIcon, CopyIcon, InfoIcon, WhatsAppIcon } from '../icons';
import { Field, Input } from '../ui/forms';
import { Modal } from '../ui/overlay';
import { Badge, Button, Card, CardHeader, cx } from '../ui/primitives';
import { useToast } from '../ui/toast';

/**
 * Settings → WhatsApp Business. Credentials are validated against the Graph
 * API through the server before they are saved; the browser never calls Meta.
 */
export function WhatsAppCard() {
  const { s, t, mode, run, locale } = useLc();
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const existing = s?.integrations.find((i) => i.provider === 'whatsapp_cloud');
  const [phoneNumberId, setPhoneNumberId] = useState(existing?.config.phoneNumberId ?? '');
  const [wabaId, setWabaId] = useState(existing?.config.wabaId ?? '');
  const [accessToken, setAccessToken] = useState(existing?.config.accessToken ?? '');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ displayPhone: string; verifiedName: string; qualityRating: string; webhookUrl: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  if (!s) return null;
  const connected = existing?.status === 'connected';
  const origin = typeof window !== 'undefined' ? window.location.origin : '';
  const webhookUrl = `${origin}/api/lc/whatsapp/webhook`;

  async function test() {
    if (!supabase) return;
    setBusy(true);
    setError(null);
    setResult(null);
    const { data } = await supabase.auth.getSession();
    const res = await fetch('/api/lc/whatsapp/test', { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session?.access_token ?? ''}` }, body: JSON.stringify({ organizationId: s!.organization.id, phoneNumberId: phoneNumberId.trim(), accessToken: accessToken.trim() }) });
    const body = (await res.json().catch(() => ({}))) as { ok?: boolean; error?: string; displayPhone?: string; verifiedName?: string; qualityRating?: string; webhookUrl?: string };
    setBusy(false);
    if (!body.ok) return setError(body.error ?? res.statusText);
    setResult({ displayPhone: body.displayPhone ?? '', verifiedName: body.verifiedName ?? '', qualityRating: body.qualityRating ?? '', webhookUrl: body.webhookUrl ?? webhookUrl });
  }

  function save() {
    const integration: Integration = {
      id: existing?.id ?? uid('int'),
      organizationId: s!.organization.id,
      provider: 'whatsapp_cloud',
      status: result ? 'connected' : 'error',
      config: { phoneNumberId: phoneNumberId.trim(), wabaId: wabaId.trim() || undefined, accessToken: accessToken.trim(), displayPhone: result?.displayPhone, verifiedName: result?.verifiedName, qualityRating: result?.qualityRating },
      lastError: result ? null : error,
      connectedAt: result ? new Date().toISOString() : existing?.connectedAt ?? null,
      updatedAt: new Date().toISOString(),
    };
    run((snap) => upsertIntegration(snap, integration));
    setOpen(false);
    toast.success(t('wa.connected'), result?.displayPhone);
  }

  return (
    <Card>
      <CardHeader
        title={<span className="flex items-center gap-2"><WhatsAppIcon className="h-5 w-5 text-[#25D366]" />{t('wa.title')}</span>}
        subtitle={connected ? `${existing?.config.displayPhone ?? ''} · ${existing?.config.verifiedName ?? ''}` : t('set.integrationsHint')}
        action={<Badge tone={connected ? 'success' : existing?.status === 'error' ? 'danger' : 'neutral'} dot>{connected ? t('wa.connected') : t('wa.notConnected')}</Badge>}
      />
      <div className="space-y-3 p-5">
        {mode !== 'live' ? (
          <p className="flex items-start gap-2 rounded-xl bg-lc-warning-soft p-3 text-[13px] text-lc-warning"><InfoIcon className="mt-0.5 h-4 w-4 shrink-0" />{t('wa.demoOnly')}</p>
        ) : (
          <>
            {connected && <p className="flex items-start gap-2 rounded-xl bg-lc-success-soft p-3 text-[13px] text-lc-success"><CheckCircleIcon className="mt-0.5 h-4 w-4 shrink-0" />{t('wa.live')}</p>}
            {existing?.lastError && <p className="rounded-xl bg-lc-danger-soft p-3 text-[13px] text-lc-danger">{existing.lastError}</p>}
            {existing?.connectedAt && <p className="text-xs text-lc-faint">{formatDateTime(existing.connectedAt, locale)}</p>}
            <div className="flex flex-wrap gap-2">
              <Button variant={connected ? 'secondary' : 'primary'} icon={<WhatsAppIcon className="h-4 w-4" />} onClick={() => setOpen(true)}>{connected ? t('common.edit') : t('wa.connect')}</Button>
              {existing && <Button variant="danger" onClick={() => run((snap) => removeIntegration(snap, existing.id))}>{t('wa.disconnect')}</Button>}
            </div>
          </>
        )}
      </div>

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title={t('wa.connect')}
        size="lg"
        footer={
          <>
            <Button variant="ghost" onClick={() => setOpen(false)}>{t('common.cancel')}</Button>
            <Button variant="secondary" onClick={test} loading={busy} disabled={!phoneNumberId.trim() || !accessToken.trim()}>{t('wa.test')}</Button>
            <Button onClick={save} disabled={!result}>{t('common.save')}</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="rounded-xl bg-lc-bg p-3.5 text-[13px] text-lc-muted">
            <p className="mb-1 font-semibold text-lc-text">{t('wa.howto')}</p>
            <p>{t('wa.howtoText')}</p>
          </div>
          <Field label={t('wa.phoneNumberId')}><Input value={phoneNumberId} onChange={(e) => setPhoneNumberId(e.target.value)} dir="ltr" className="font-mono" placeholder="1234567890123456" /></Field>
          <Field label={t('wa.wabaId')}><Input value={wabaId} onChange={(e) => setWabaId(e.target.value)} dir="ltr" className="font-mono" /></Field>
          <Field label={t('wa.accessToken')}><Input type="password" value={accessToken} onChange={(e) => setAccessToken(e.target.value)} dir="ltr" className="font-mono" placeholder="EAAG…" /></Field>
          <div>
            <p className="mb-1 text-[13px] font-semibold text-lc-text">{t('wa.webhookUrl')}</p>
            <div className="flex items-center gap-2">
              <code className="flex-1 truncate rounded-lg border border-lc-border bg-white px-3 py-2 text-xs" dir="ltr">{webhookUrl}</code>
              <Button variant="secondary" size="icon" onClick={() => { void navigator.clipboard.writeText(webhookUrl); toast.info(t('common.done')); }} aria-label="copy"><CopyIcon className="h-4 w-4" /></Button>
            </div>
            <p className="mt-1 text-xs text-lc-faint">{t('wa.verifyHint')}</p>
          </div>
          {error && <p className="rounded-xl bg-lc-danger-soft p-3 text-sm text-lc-danger" dir="ltr">{error}</p>}
          {result && (
            <div className={cx('rounded-xl border border-lc-success/30 bg-lc-success-soft p-3.5 text-sm')}>
              <p className="flex items-center gap-2 font-semibold text-lc-success"><CheckCircleIcon className="h-4 w-4" />{t('wa.testOk')}</p>
              <p className="mt-1 text-lc-text" dir="ltr">{result.displayPhone} · {result.verifiedName}{result.qualityRating ? ` · ${result.qualityRating}` : ''}</p>
            </div>
          )}
        </div>
      </Modal>
    </Card>
  );
}
