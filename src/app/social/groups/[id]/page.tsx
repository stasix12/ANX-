'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { PublicationItem } from '@/components/social/PublicationItem';
import { SocialShell } from '@/components/social/SocialShell';
import { TargetAvatar } from '@/components/social/TargetAvatar';
import {
  Badge,
  Button,
  Card,
  EmptyState,
  Field,
  Loading,
  MethodBadge,
  Notice,
  Tile,
  Toggle,
  inputClass,
  useConfirm,
  useToast,
  ButtonLink,
} from '@/components/social/ui';
import {
  bulkDeleteTargets,
  cancelQueueItem,
  getTarget,
  listCampaigns,
  requestGroupRefresh,
  retryQueueItem,
  screenshotUrl,
  targetQueue,
  updateTarget,
  type QueueRow,
} from '@/lib/social/client';
import { KNOWN_CITIES, OTHER_CITY, detectCity, sortCities } from '@/lib/social/cities';
import { formatDateTimeHe } from '@/lib/social/time';
import { CHANNEL_LABEL, type Campaign, type SocialTarget } from '@/lib/social/types';
import { friendlyMessage } from '@/lib/social/errors';
import { ClockIcon, SearchIcon } from '@/components/icons';

/**
 * One group's whole story: how it is configured, how many times we published
 * to it, which campaigns used it, and every publication with its outcome.
 * It is also where the group's own settings are edited — city, category,
 * notes — which is why those controls are no longer crowding the grid.
 */
export default function GroupProfilePage() {
  const { id } = useParams<{ id: string }>();
  const router = useRouter();
  const [group, setGroup] = useState<SocialTarget | null>(null);
  const [rows, setRows] = useState<QueueRow[] | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const toast = useToast();
  const confirm = useConfirm();
  /* Distinct from `group`: a finished fetch that found nothing is not loading. */
  const [loaded, setLoaded] = useState(false);

  const load = useCallback(async () => {
    try {
      const [t, q, c] = await Promise.all([getTarget(id), targetQueue(id), listCampaigns()]);
      setGroup(t);
      setRows(q);
      setCampaigns(c);
      setNotes(t?.notes ?? '');
      setError(null);
    } catch (err) {
      setError(friendlyMessage(err, 'טעינה נכשלה.'));
    } finally {
      setLoaded(true);
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  const stats = useMemo(() => {
    const list = rows ?? [];
    const published = list.filter((r) => r.status === 'published');
    return {
      total: list.length,
      published: published.length,
      failed: list.filter((r) => r.status === 'failed').length,
      skipped: list.filter((r) => r.status === 'skipped').length,
      pending: list.filter((r) => r.status === 'scheduled').length,
      last: published.map((r) => r.published_at).filter(Boolean).sort().reverse()[0] ?? null,
      campaignIds: Array.from(new Set(list.map((r) => r.campaign_id).filter(Boolean) as string[])),
    };
  }, [rows]);

  async function act(key: string, fn: () => Promise<unknown>, done?: string) {
    setBusy(key);
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

  if (!group && !error && !loaded) {
    return (
      <SocialShell title="קבוצה">
        <Loading />
      </SocialShell>
    );
  }
  if (!group) {
    /* A group that is simply gone is not an error the owner caused — say so
       plainly and offer the way back, rather than a red banner. */
    return (
      <SocialShell title="קבוצה">
        {error ? (
          <Notice tone="error">{error}</Notice>
        ) : (
          <EmptyState
            icon={<SearchIcon className="h-5 w-5" />}
            title="הקבוצה הזו לא קיימת"
            description="ייתכן שהיא הוסרה מרשימת היעדים, או שהקישור ישן."
            action={
              <ButtonLink href="/social/groups" size="lg">לכל הקבוצות</ButtonLink>
            }
          />
        )}
      </SocialShell>
    );
  }

  const city = group.city || detectCity(group.name);
  const cityOptions = sortCities(Array.from(new Set([...KNOWN_CITIES, city, OTHER_CITY])));
  const categories = Array.from(new Set(campaigns.map((c) => c.service).filter(Boolean)));

  return (
    <SocialShell
      title={group.name}
      headerAction={
        <ButtonLink href={`/social/posts/new?targets=${group.id}`}>
          + פוסט
        </ButtonLink>
      }
    >
      <div className="space-y-5">
        {error && <Notice tone="error">{error}</Notice>}

        <Card>
          <div className="flex items-start gap-3">
            <TargetAvatar name={group.name} imageUrl={group.image_url} channel={group.channel} size={72} />
            <div className="min-w-0 grow">
              <h2 dir="auto" className="text-lg font-extrabold leading-tight text-mist-100">
                {group.favorite && <span aria-hidden>⭐ </span>}
                {group.name}
              </h2>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <Badge tone={group.enabled ? 'good' : 'neutral'}>{group.enabled ? 'פעילה' : 'מושהית'}</Badge>
                <Badge tone="neutral">{city}</Badge>
                {group.category && <Badge tone="brand">{group.category}</Badge>}
                <MethodBadge channel={group.channel} />
              </div>
              <p className="mt-1.5 text-xs text-mist-500">{CHANNEL_LABEL[group.channel]}</p>
            </div>
            <Toggle checked={group.enabled} onChange={(v) => act('enabled', () => updateTarget(group.id, { enabled: v }), v ? 'הקבוצה הופעלה.' : 'הקבוצה הושהתה.')} label="פעילה" />
          </div>

          <div className="mt-3 flex flex-wrap gap-2">
            <a href={group.url} target="_blank" rel="noreferrer" className="inline-flex min-h-11 items-center rounded-xl bg-ink-800 px-4 text-sm font-bold text-brand-400">
              פתח בפייסבוק ↗
            </a>
            <Button variant="secondary" busy={busy === 'fav'} onClick={() => act('fav', () => updateTarget(group.id, { favorite: !group.favorite }))}>
              {group.favorite ? '☆ הסר ממועדפות' : '⭐ הוסף למועדפות'}
            </Button>
            <Button variant="secondary" busy={busy === 'sync'} onClick={() => act('sync', () => requestGroupRefresh([group.id]), 'ה-worker ימשוך שם ותמונה מחדש.')}>
              🔄 רענן פרטים
            </Button>
          </div>
        </Card>

        <div className="grid grid-cols-2 gap-2 sm:grid-cols-4 [&>*]:min-w-0">
          <Tile label="סך פרסומים" value={stats.published} tone={stats.published ? 'good' : 'default'} />
          <Tile label="ממתינים" value={stats.pending} />
          <Tile label="נכשלו" value={stats.failed} tone={stats.failed ? 'bad' : 'default'} />
          <Tile label="דולגו" value={stats.skipped} />
        </div>

        <Card title="פרטים">
          <dl className="grid gap-x-4 gap-y-2 sm:grid-cols-2 [&>*]:min-w-0">
            <Row label="פרסום אחרון">{stats.last ? formatDateTimeHe(stats.last) : 'טרם פורסם'}</Row>
            <Row label="נוספה למערכת">{formatDateTimeHe(group.created_at)}</Row>
            <Row label="עודכנה מפייסבוק">{group.last_synced_at ? formatDateTimeHe(group.last_synced_at) : 'טרם'}</Row>
            <Row label="מזהה בפייסבוק">
              <span dir="ltr" className="font-mono text-xs">
                {group.external_id || '—'}
              </span>
            </Row>
          </dl>

          <div className="mt-4 grid gap-3 sm:grid-cols-2 [&>*]:min-w-0">
            <Field label="עיר / אזור" hint="משמש לסינון ולבחירה קבוצתית">
              <select className={inputClass} value={city} onChange={(e) => act('city', () => updateTarget(group.id, { city: e.target.value }), 'העיר עודכנה.')}>
                {cityOptions.map((c) => (
                  <option key={c} value={c}>
                    {c}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="קטגוריה" hint="קבוצה חופשית משלכם — למשל 'לוחות מכירה'">
              <input
                className={inputClass}
                defaultValue={group.category ?? ''}
                list="profile-categories"
                onBlur={(e) => {
                  if (e.target.value !== (group.category ?? '')) act('category', () => updateTarget(group.id, { category: e.target.value.trim() }), 'הקטגוריה עודכנה.');
                }}
              />
              <datalist id="profile-categories">
                {categories.map((c) => (
                  <option key={c} value={c} />
                ))}
              </datalist>
            </Field>
          </div>

          <div className="mt-3">
            <Field label="הערות" hint="לעצמכם — כללי הקבוצה, ימים מותרים, איש קשר">
              <textarea className={`${inputClass} min-h-20`} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
            {notes !== (group.notes ?? '') && (
              <Button className="mt-2" busy={busy === 'notes'} onClick={() => act('notes', () => updateTarget(group.id, { notes }), 'ההערות נשמרו.')}>
                שמור הערות
              </Button>
            )}
          </div>
        </Card>

        {stats.campaignIds.length > 0 && (
          <Card title="סבבי פרסום שהשתמשו בקבוצה">
            <ul className="flex flex-wrap gap-2">
              {stats.campaignIds.map((cid) => {
                const c = campaigns.find((x) => x.id === cid);
                return (
                  <li key={cid}>
                    <Link href={`/social/campaigns/${cid}`} className="inline-flex min-h-9 items-center rounded-full bg-ink-800 px-3 text-sm font-bold text-brand-400">
                      {c?.name ?? 'סבב'}
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Card>
        )}

        <Card title={`היסטוריית פרסומים (${stats.total})`}>
          {!rows && <Loading />}
          {rows && rows.length === 0 && (
            <EmptyState
              icon={<ClockIcon className="h-5 w-5" />}
              title="עוד לא פרסמנו לקבוצה הזו"
              description="ברגע שתתזמנו פוסט אליה, כל פרסום יופיע כאן עם הסטטוס והשעה."
              action={
                <ButtonLink href={`/social/posts/new?targets=${group.id}`}>צור פוסט לקבוצה</ButtonLink>
              }
            />
          )}
          {rows && rows.length > 0 && (
            <ul className="divide-y divide-ink-700">
              {rows.map((r) => (
                <PublicationItem
                  key={r.id}
                  row={r}
                  showDate
                  actions={{
                    onRetry: (row) => act(`retry-${row.id}`, () => retryQueueItem(row.id), 'הוחזר לתור.'),
                    onCancel: (row) => act(`cancel-${row.id}`, () => cancelQueueItem(row.id), 'בוטל.'),
                    onScreenshot: (row) => row.screenshot_path && screenshotUrl(row.screenshot_path).then((u) => u && window.open(u, '_blank', 'noreferrer')),
                  }}
                />
              ))}
            </ul>
          )}
        </Card>

        <div className="flex justify-center pb-2">
          <Button
            variant="ghost"
            size="sm"
            className="text-rose-600"
            busy={busy === 'delete'}
            onClick={async () => {
              const ok = await confirm.ask({
                title: `להסיר את "${group.name}"?`,
                body: 'הקבוצה תוסר מרשימת היעדים ולא תקבל עוד פרסומים. היסטוריית הפרסומים נשמרת.',
                confirmLabel: 'הסר קבוצה',
                danger: true,
              });
              if (!ok) return;
              await act('delete', () => bulkDeleteTargets([group.id]));
              router.push('/social/groups');
            }}
          >
            הסר את הקבוצה מהרשימה
          </Button>
        </div>
      </div>
      {confirm.dialog}
    </SocialShell>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 border-b border-ink-700 py-1.5 last:border-0">
      <dt className="text-xs font-bold text-mist-500">{label}</dt>
      <dd className="text-sm font-bold text-mist-100">{children}</dd>
    </div>
  );
}
