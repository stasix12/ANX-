import 'server-only';
import type { SupabaseClient } from '@supabase/supabase-js';
import type { Attachment, Integration, Snapshot } from '../types';
import type { Write } from '../ops';
import { fromRow, SupabaseStore } from '../store/supabase';
import { uid } from '../util';
import type { InboundDeps } from './inbound';
import { serviceClient } from './index';
import { downloadMedia, sendText, waConfigOf, type InboundWa } from './whatsapp';

/** Production wiring of the inbound pipeline: Supabase for state, Meta for messages. */
export function supabaseInboundDeps(): InboundDeps | null {
  const client = serviceClient();
  if (!client) return null;
  const store = new SupabaseStore(client);
  return {
    async loadByPhoneNumberId(phoneNumberId) {
      const { data } = await client.from('lc_integrations').select('organization_id').eq('provider', 'whatsapp_cloud').eq('status', 'connected').eq('config->>phoneNumberId', phoneNumberId).maybeSingle();
      if (!data) return null;
      return store.loadSnapshot((data as { organization_id: string }).organization_id);
    },
    async persist(orgId, writes: Write[]) {
      for (const w of writes) {
        if (w.kind === 'put') await store.put(orgId, w.collection, w.row);
        else if (w.kind === 'remove') await store.remove(orgId, w.collection, w.id);
        else if (w.kind === 'settings') await store.saveSettings(w.settings);
        else if (w.kind === 'organization') await store.saveOrganization(w.organization);
        else if (w.kind === 'subscription') await store.saveSubscription(w.subscription);
      }
    },
    async storeMedia(snapshot, media: InboundWa['media']) {
      const cfg = waConfigOf(snapshot.integrations.find((i) => i.provider === 'whatsapp_cloud'));
      if (!cfg) return [];
      return storeMediaFiles(client, snapshot.organization.id, cfg, media);
    },
    async send(snapshot, to, text) {
      const cfg = waConfigOf(snapshot.integrations.find((i) => i.provider === 'whatsapp_cloud'));
      if (!cfg) return;
      await sendText(cfg, to, text);
    },
  };
}

async function storeMediaFiles(client: SupabaseClient, orgId: string, cfg: NonNullable<ReturnType<typeof waConfigOf>>, media: InboundWa['media']): Promise<Attachment[]> {
  const out: Attachment[] = [];
  for (const m of media) {
    if (!m.mimeType.startsWith('image/')) continue;
    const file = await downloadMedia(cfg, m.id);
    if (!file) continue;
    const ext = m.mimeType.split('/')[1]?.split(';')[0] ?? 'jpg';
    const path = `${orgId}/${uid('wa')}.${ext}`;
    const { error } = await client.storage.from('lc-photos').upload(path, file.bytes, { contentType: m.mimeType, upsert: false });
    if (error) continue;
    const { data } = client.storage.from('lc-photos').getPublicUrl(path);
    out.push({ type: 'image', url: data.publicUrl, caption: m.caption });
  }
  return out;
}

/** Loads the integration row of an organisation (service role). */
export async function loadIntegration(client: SupabaseClient, orgId: string, provider: Integration['provider']): Promise<Integration | null> {
  const { data } = await client.from('lc_integrations').select('*').eq('organization_id', orgId).eq('provider', provider).maybeSingle();
  return data ? fromRow<Integration>(data as Record<string, unknown>) : null;
}

/** Resolves the signed-in user from a bearer token and checks org membership. */
export async function requireMember(client: SupabaseClient, authorization: string | null, orgId: string): Promise<{ userId: string } | null> {
  const token = authorization?.replace(/^Bearer\s+/i, '');
  if (!token) return null;
  const { data, error } = await client.auth.getUser(token);
  if (error || !data.user) return null;
  const { data: member } = await client.from('lc_organization_members').select('id').eq('organization_id', orgId).eq('user_id', data.user.id).maybeSingle();
  return member ? { userId: data.user.id } : null;
}

export type { Snapshot };
