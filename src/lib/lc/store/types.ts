import type { AgentSettings, CollectionName, CollectionRow, Organization, Snapshot, Subscription } from '../types';

/**
 * Persistence contract. Deliberately tiny: the client keeps the whole
 * organisation snapshot in memory (MVP scale is a few thousand rows) and
 * persists changes row-by-row. Both stores implement exactly this.
 */
export interface LcStore {
  readonly kind: 'local' | 'supabase';
  loadSnapshot(organizationId: string): Promise<Snapshot | null>;
  put<K extends CollectionName>(organizationId: string, collection: K, row: CollectionRow<K>): Promise<void>;
  putMany<K extends CollectionName>(organizationId: string, collection: K, rows: CollectionRow<K>[]): Promise<void>;
  remove(organizationId: string, collection: CollectionName, id: string): Promise<void>;
  saveOrganization(org: Organization): Promise<void>;
  saveSettings(settings: AgentSettings): Promise<void>;
  saveSubscription(sub: Subscription): Promise<void>;
  /** Writes a complete snapshot (used when creating a workspace / seeding). */
  createWorkspace(snapshot: Snapshot): Promise<void>;
  /** Removes everything for the organisation (demo reset). */
  destroyWorkspace(organizationId: string): Promise<void>;
}
