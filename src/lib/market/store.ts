import { supabase } from '@/lib/supabase';
import { SupabaseStore } from './storeSupabase';
import {
  DEFAULT_SETTINGS,
  DEMO_COUPONS,
  DEMO_CUSTOMER,
  DEMO_PROS,
  DEMO_REVIEWS,
} from './demoData';
import { DEFAULT_AREAS } from './geo';
import { DEFAULT_SERVICES } from './services';
import type {
  AppNotification,
  Availability,
  Booking,
  BookingEvent,
  BookingOffer,
  Coupon,
  CustomerProfile,
  Message,
  PlatformSettings,
  Professional,
  Review,
  Service,
  ServiceArea,
  WaitlistEntry,
  WalletTransaction,
} from './types';

/**
 * The one data-access seam of the marketplace. Every screen and the booking
 * engine talk to a MarketStore; which one they get depends on configuration:
 *
 *  - No Supabase keys (this repo's default dev sandbox): DemoStore —
 *    localStorage persistence seeded with Israeli demo data, and a
 *    BroadcastChannel so a customer tab and a pro tab on the same machine see
 *    each other's changes in real time. The whole product is testable with
 *    zero external accounts.
 *
 *  - NEXT_PUBLIC_SUPABASE_URL + NEXT_PUBLIC_SUPABASE_ANON_KEY set and
 *    supabase/marketplace-schema.sql applied: SupabaseStore
 *    (./storeSupabase.ts) — Postgres + RLS + Supabase Realtime.
 */

export interface CollectionMap {
  professionals: Professional;
  availability: Availability;
  bookings: Booking;
  offers: BookingOffer;
  events: BookingEvent;
  messages: Message;
  reviews: Review;
  wallet: WalletTransaction;
  coupons: Coupon;
  customers: CustomerProfile;
  waitlist: WaitlistEntry;
  notifications: AppNotification;
  areas: ServiceArea;
  services: Service;
}

export type CollectionName = keyof CollectionMap;

/** The primary-key field per collection (coupons key on their code, …). */
const KEY_FIELD: Record<CollectionName, string> = {
  professionals: 'id',
  availability: 'professionalId',
  bookings: 'id',
  offers: 'id',
  events: 'id',
  messages: 'id',
  reviews: 'id',
  wallet: 'id',
  coupons: 'code',
  customers: 'id',
  waitlist: 'id',
  notifications: 'id',
  areas: 'id',
  services: 'id',
};

export interface MarketStore {
  list<K extends CollectionName>(col: K): Promise<CollectionMap[K][]>;
  get<K extends CollectionName>(col: K, id: string): Promise<CollectionMap[K] | null>;
  put<K extends CollectionName>(col: K, row: CollectionMap[K]): Promise<void>;
  remove(col: CollectionName, id: string): Promise<void>;
  getSettings(): Promise<PlatformSettings>;
  putSettings(settings: PlatformSettings): Promise<void>;
  /** Coarse change feed: fires with the collection that changed (any row). */
  subscribe(cb: (col: CollectionName | 'settings') => void): () => void;
}

/** UUID when available so demo-created rows are portable to Postgres as-is. */
export function uid(): string {
  if (typeof crypto !== 'undefined' && 'randomUUID' in crypto) return crypto.randomUUID();
  return `id-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

export function nowIso(): string {
  return new Date().toISOString();
}

// ---------------------------------------------------------------------------
// DemoStore
// ---------------------------------------------------------------------------

const LS_PREFIX = 'cleango:';
const CHANNEL = 'cleango-sync';

const SEEDS: { [K in CollectionName]: CollectionMap[K][] } = {
  professionals: DEMO_PROS,
  availability: DEMO_PROS.filter((p) => p.status === 'active').map((p) => ({
    professionalId: p.id,
    online: true,
    heartbeatAt: nowIso(),
    location: p.base,
  })),
  bookings: [],
  offers: [],
  events: [],
  messages: [],
  reviews: DEMO_REVIEWS,
  wallet: [],
  coupons: DEMO_COUPONS,
  customers: [DEMO_CUSTOMER],
  waitlist: [],
  notifications: [],
  areas: DEFAULT_AREAS,
  services: DEFAULT_SERVICES,
};

type Listener = (col: CollectionName | 'settings') => void;

class DemoStore implements MarketStore {
  private listeners = new Set<Listener>();
  private channel: BroadcastChannel | null = null;
  /** SSR-side in-memory fallback so server components can render seed data. */
  private memory = new Map<string, unknown[]>();

  constructor() {
    if (typeof window !== 'undefined' && 'BroadcastChannel' in window) {
      this.channel = new BroadcastChannel(CHANNEL);
      this.channel.onmessage = (e) => this.emit(e.data as CollectionName, false);
      // storage events cover tabs that predate BroadcastChannel support.
      window.addEventListener('storage', (e) => {
        if (e.key?.startsWith(LS_PREFIX)) {
          this.emit(e.key.slice(LS_PREFIX.length) as CollectionName, false);
        }
      });
    }
  }

  private read<K extends CollectionName>(col: K): CollectionMap[K][] {
    if (typeof window === 'undefined') {
      if (!this.memory.has(col)) this.memory.set(col, structuredClone(SEEDS[col]));
      return this.memory.get(col) as CollectionMap[K][];
    }
    const raw = window.localStorage.getItem(LS_PREFIX + col);
    if (raw === null) {
      const seed = SEEDS[col];
      window.localStorage.setItem(LS_PREFIX + col, JSON.stringify(seed));
      return structuredClone(seed);
    }
    try {
      return JSON.parse(raw) as CollectionMap[K][];
    } catch {
      return structuredClone(SEEDS[col]);
    }
  }

  private write<K extends CollectionName>(col: K, rows: CollectionMap[K][]): void {
    if (typeof window === 'undefined') {
      this.memory.set(col, rows);
      return;
    }
    window.localStorage.setItem(LS_PREFIX + col, JSON.stringify(rows));
    this.emit(col, true);
  }

  private emit(col: CollectionName | 'settings', broadcast: boolean): void {
    for (const cb of this.listeners) cb(col);
    if (broadcast) this.channel?.postMessage(col);
  }

  async list<K extends CollectionName>(col: K): Promise<CollectionMap[K][]> {
    return this.read(col);
  }

  async get<K extends CollectionName>(col: K, id: string): Promise<CollectionMap[K] | null> {
    const key = KEY_FIELD[col];
    return (
      this.read(col).find((row) => (row as unknown as Record<string, unknown>)[key] === id) ?? null
    );
  }

  async put<K extends CollectionName>(col: K, row: CollectionMap[K]): Promise<void> {
    const key = KEY_FIELD[col];
    const id = (row as unknown as Record<string, unknown>)[key];
    const rows = this.read(col);
    const index = rows.findIndex((r) => (r as unknown as Record<string, unknown>)[key] === id);
    if (index >= 0) rows[index] = row;
    else rows.push(row);
    this.write(col, rows);
  }

  async remove(col: CollectionName, id: string): Promise<void> {
    const key = KEY_FIELD[col];
    this.write(
      col,
      this.read(col).filter((r) => (r as unknown as Record<string, unknown>)[key] !== id),
    );
  }

  async getSettings(): Promise<PlatformSettings> {
    if (typeof window === 'undefined') return DEFAULT_SETTINGS;
    const raw = window.localStorage.getItem(LS_PREFIX + 'settings');
    if (!raw) return structuredClone(DEFAULT_SETTINGS);
    try {
      return { ...DEFAULT_SETTINGS, ...(JSON.parse(raw) as Partial<PlatformSettings>) };
    } catch {
      return structuredClone(DEFAULT_SETTINGS);
    }
  }

  async putSettings(settings: PlatformSettings): Promise<void> {
    if (typeof window === 'undefined') return;
    window.localStorage.setItem(LS_PREFIX + 'settings', JSON.stringify(settings));
    this.emit('settings', true);
  }

  subscribe(cb: Listener): () => void {
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}

// ---------------------------------------------------------------------------
// Store selection
// ---------------------------------------------------------------------------

let instance: MarketStore | null = null;

export function getStore(): MarketStore {
  if (instance) return instance;
  instance = supabase ? new SupabaseStore(supabase) : new DemoStore();
  return instance;
}

/** True when running against the local demo store (no Supabase configured). */
export const isDemoMode = supabase === null;
