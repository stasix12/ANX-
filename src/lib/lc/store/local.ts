import type { AgentSettings, CollectionName, CollectionRow, Organization, Snapshot, Subscription } from '../types';
import type { LcStore } from './types';

const KEY = (orgId: string) => `lc:ws:${orgId}`;

function read(orgId: string): Snapshot | null {
  if (typeof window === 'undefined') return null;
  try {
    const raw = window.localStorage.getItem(KEY(orgId));
    if (!raw) return null;
    const snap = JSON.parse(raw) as Snapshot;
    // Forward-compatibility for workspaces saved before a collection existed.
    snap.integrations ??= [];
    return snap;
  } catch {
    return null;
  }
}

function write(snapshot: Snapshot) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY(snapshot.organization.id), JSON.stringify(snapshot));
  } catch {
    /* quota exceeded — keep running in memory */
  }
}

/**
 * Browser store: the whole workspace lives in localStorage. Used for the demo
 * workspace and as an offline fallback. Writes are coalesced per tick so a
 * burst of updates (an agent turn touches 5 collections) costs one serialise.
 */
export class LocalStore implements LcStore {
  readonly kind = 'local' as const;
  private cache = new Map<string, Snapshot>();
  private pending = new Set<string>();

  private snap(orgId: string): Snapshot | null {
    const cached = this.cache.get(orgId);
    if (cached) return cached;
    const loaded = read(orgId);
    if (loaded) this.cache.set(orgId, loaded);
    return loaded;
  }

  private flush(orgId: string) {
    if (this.pending.has(orgId)) return;
    this.pending.add(orgId);
    const run = () => {
      this.pending.delete(orgId);
      const s = this.cache.get(orgId);
      if (s) write(s);
    };
    if (typeof queueMicrotask === 'function') queueMicrotask(run);
    else run();
  }

  async loadSnapshot(orgId: string) {
    return this.snap(orgId);
  }

  async put<K extends CollectionName>(orgId: string, collection: K, row: CollectionRow<K>) {
    const s = this.snap(orgId);
    if (!s) return;
    const rows = s[collection] as unknown as { id: string }[];
    const idx = rows.findIndex((r) => r.id === (row as { id: string }).id);
    if (idx >= 0) rows[idx] = row as unknown as { id: string };
    else rows.push(row as unknown as { id: string });
    this.flush(orgId);
  }

  async putMany<K extends CollectionName>(orgId: string, collection: K, rows: CollectionRow<K>[]) {
    for (const r of rows) await this.put(orgId, collection, r);
  }

  async remove(orgId: string, collection: CollectionName, id: string) {
    const s = this.snap(orgId);
    if (!s) return;
    const rows = s[collection] as unknown as { id: string }[];
    const idx = rows.findIndex((r) => r.id === id);
    if (idx >= 0) rows.splice(idx, 1);
    this.flush(orgId);
  }

  async saveOrganization(org: Organization) {
    const s = this.snap(org.id);
    if (!s) return;
    s.organization = org;
    this.flush(org.id);
  }
  async saveSettings(settings: AgentSettings) {
    const s = this.snap(settings.organizationId);
    if (!s) return;
    s.settings = settings;
    this.flush(settings.organizationId);
  }
  async saveSubscription(sub: Subscription) {
    const s = this.snap(sub.organizationId);
    if (!s) return;
    s.subscription = sub;
    this.flush(sub.organizationId);
  }
  async createWorkspace(snapshot: Snapshot) {
    this.cache.set(snapshot.organization.id, snapshot);
    write(snapshot);
  }
  async destroyWorkspace(orgId: string) {
    this.cache.delete(orgId);
    if (typeof window !== 'undefined') window.localStorage.removeItem(KEY(orgId));
  }
}
