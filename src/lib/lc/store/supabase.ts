import type { SupabaseClient } from '@supabase/supabase-js';
import type { AgentSettings, CollectionName, CollectionRow, Organization, Snapshot, Subscription } from '../types';
import { COLLECTIONS } from '../types';
import type { LcStore } from './types';

/**
 * Supabase store — one table per collection (see supabase/leadcloser-schema.sql),
 * `organization_id` on every row, Row Level Security enforced by Postgres.
 * Column names are the snake_case form of the TypeScript fields; nested
 * objects/arrays are jsonb.
 */

const TABLE: Record<CollectionName, string> = {
  members: 'lc_organization_members',
  customers: 'lc_customers',
  leads: 'lc_leads',
  conversations: 'lc_conversations',
  messages: 'lc_messages',
  services: 'lc_services',
  pricingRules: 'lc_pricing_rules',
  quotes: 'lc_quotes',
  bookings: 'lc_bookings',
  jobs: 'lc_jobs',
  workers: 'lc_workers',
  automations: 'lc_automations',
  automationRuns: 'lc_automation_runs',
  leadSources: 'lc_lead_sources',
  activityLogs: 'lc_activity_logs',
  integrations: 'lc_integrations',
};

const snake = (s: string) => s.replace(/[A-Z]/g, (m) => `_${m.toLowerCase()}`);
const camel = (s: string) => s.replace(/_([a-z])/g, (_, c: string) => c.toUpperCase());

export function toRow(obj: Record<string, unknown>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(obj)) out[snake(k)] = v;
  return out;
}
export function fromRow<T>(row: Record<string, unknown>): T {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(row)) out[camel(k)] = v;
  return out as T;
}

export class SupabaseStore implements LcStore {
  readonly kind = 'supabase' as const;
  constructor(private client: SupabaseClient) {}

  async loadSnapshot(orgId: string): Promise<Snapshot | null> {
    const { data: org, error } = await this.client.from('lc_organizations').select('*').eq('id', orgId).maybeSingle();
    if (error) throw new Error(error.message);
    if (!org) return null;
    const [settings, subscription, ...collections] = await Promise.all([
      this.client.from('lc_ai_agent_settings').select('*').eq('organization_id', orgId).maybeSingle(),
      this.client.from('lc_subscriptions').select('*').eq('organization_id', orgId).maybeSingle(),
      ...COLLECTIONS.map((c) => this.client.from(TABLE[c]).select('*').eq('organization_id', orgId).limit(5000)),
    ]);
    const snap = {
      organization: fromRow<Organization>(org),
      settings: settings.data ? fromRow<AgentSettings>(settings.data) : null,
      subscription: subscription.data ? fromRow<Subscription>(subscription.data) : null,
    } as unknown as Snapshot;
    COLLECTIONS.forEach((c, i) => {
      const res = collections[i];
      if (res.error) throw new Error(res.error.message);
      (snap as unknown as Record<string, unknown>)[c] = (res.data ?? []).map((r) => fromRow(r as Record<string, unknown>));
    });
    return snap;
  }

  async put<K extends CollectionName>(orgId: string, collection: K, row: CollectionRow<K>) {
    const { error } = await this.client.from(TABLE[collection]).upsert(toRow({ ...(row as object), organizationId: orgId } as Record<string, unknown>));
    if (error) throw new Error(error.message);
  }
  async putMany<K extends CollectionName>(orgId: string, collection: K, rows: CollectionRow<K>[]) {
    if (!rows.length) return;
    const { error } = await this.client.from(TABLE[collection]).upsert(rows.map((r) => toRow({ ...(r as object), organizationId: orgId } as Record<string, unknown>)));
    if (error) throw new Error(error.message);
  }
  async remove(orgId: string, collection: CollectionName, id: string) {
    const { error } = await this.client.from(TABLE[collection]).delete().eq('organization_id', orgId).eq('id', id);
    if (error) throw new Error(error.message);
  }
  async saveOrganization(org: Organization) {
    const { error } = await this.client.from('lc_organizations').upsert(toRow(org as unknown as Record<string, unknown>));
    if (error) throw new Error(error.message);
  }
  async saveSettings(settings: AgentSettings) {
    const { error } = await this.client.from('lc_ai_agent_settings').upsert(toRow(settings as unknown as Record<string, unknown>), { onConflict: 'organization_id' });
    if (error) throw new Error(error.message);
  }
  async saveSubscription(sub: Subscription) {
    const { error } = await this.client.from('lc_subscriptions').upsert(toRow(sub as unknown as Record<string, unknown>), { onConflict: 'organization_id' });
    if (error) throw new Error(error.message);
  }
  async createWorkspace(snapshot: Snapshot) {
    // One atomic SECURITY DEFINER call (see leadcloser-upgrade-1.sql): the
    // organisation, the owner membership and the template rows are inserted
    // together, so a half-created workspace cannot exist.
    const rows = (xs: object[]) => xs.map((x) => toRow(x as Record<string, unknown>));
    const owner = snapshot.members.find((m) => m.role === 'owner') ?? snapshot.members[0];
    const { error } = await this.client.rpc('lc_create_workspace', {
      p_org: toRow(snapshot.organization as unknown as Record<string, unknown>),
      p_member: owner ? toRow(owner as unknown as Record<string, unknown>) : {},
      p_settings: toRow(snapshot.settings as unknown as Record<string, unknown>),
      p_subscription: toRow(snapshot.subscription as unknown as Record<string, unknown>),
      p_services: rows(snapshot.services),
      p_rules: rows(snapshot.pricingRules),
      p_automations: rows(snapshot.automations),
      p_sources: rows(snapshot.leadSources),
    });
    if (error) throw new Error(error.message);
    // Anything else the snapshot carries (demo imports) goes through the normal path.
    for (const c of COLLECTIONS) {
      if (['members', 'services', 'pricingRules', 'automations', 'leadSources'].includes(c)) continue;
      const list = snapshot[c] as CollectionRow<typeof c>[];
      if (list.length) await this.putMany(snapshot.organization.id, c, list);
    }
  }
  async destroyWorkspace(orgId: string) {
    const { error } = await this.client.from('lc_organizations').delete().eq('id', orgId);
    if (error) throw new Error(error.message);
  }

  /** Organisations the signed-in user belongs to. */
  async myOrganizations(): Promise<{ id: string; name: string }[]> {
    const { data, error } = await this.client.from('lc_organization_members').select('organization_id, lc_organizations(name)');
    if (error) throw new Error(error.message);
    return (data ?? []).map((r) => {
      const rel = r as unknown as { organization_id: string; lc_organizations: { name: string } | { name: string }[] | null };
      const org = Array.isArray(rel.lc_organizations) ? rel.lc_organizations[0] : rel.lc_organizations;
      return { id: rel.organization_id, name: org?.name ?? '' };
    });
  }
}
