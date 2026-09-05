import type { SupabaseClient } from '@supabase/supabase-js';
import { DEFAULT_SETTINGS } from './demoData';
import { DEFAULT_AREAS } from './geo';
import { DEFAULT_SERVICES } from './services';
import type { CollectionMap, CollectionName, MarketStore } from './store';
import type { Language, PlatformSettings, Professional } from './types';

/**
 * Production adapter: the same MarketStore contract over the normalized
 * Postgres schema in supabase/marketplace-schema.sql. Selected automatically
 * once NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY are present
 * (see src/lib/supabase.ts) — apply the schema first, then enable Realtime on
 * mk_bookings, mk_booking_offers, mk_booking_events, mk_messages and
 * mk_professional_availability so cross-device updates stream in.
 *
 * The service catalogue (questions, prices) is versioned in code
 * (services.ts) and only mirrored to mk_services for SQL reporting; areas are
 * read from mk_service_areas with the code defaults as fallback until the
 * admin seeds them.
 */

type Row = Record<string, unknown>;

interface TableSpec {
  table: string;
  key: string;
  toRow: (v: Row) => Row;
  fromRow: (r: Row) => Row;
}

/** snake_case ⇄ camelCase field pairs, applied mechanically. */
function mapFields(pairs: [camel: string, snake: string][]) {
  return {
    toRow(v: Row): Row {
      const out: Row = {};
      for (const [camel, snake] of pairs) if (v[camel] !== undefined) out[snake] = v[camel];
      return out;
    },
    fromRow(r: Row): Row {
      const out: Row = {};
      for (const [camel, snake] of pairs) out[camel] = r[snake];
      return out;
    },
  };
}

const bookingMap = mapFields([
  ['id', 'id'],
  ['customerId', 'customer_id'],
  ['customerName', 'customer_name'],
  ['customerPhone', 'customer_phone'],
  ['professionalId', 'professional_id'],
  ['serviceId', 'service_id'],
  ['areaId', 'area_id'],
  ['address', 'address'],
  ['answers', 'answers'],
  ['photos', 'photos'],
  ['notes', 'notes'],
  ['scheduledFor', 'scheduled_for'],
  ['mode', 'mode'],
  ['quoteLowAgorot', 'quote_low_agorot'],
  ['quoteHighAgorot', 'quote_high_agorot'],
  ['finalPriceAgorot', 'final_price_agorot'],
  ['couponCode', 'coupon_code'],
  ['discountAgorot', 'discount_agorot'],
  ['commissionAgorot', 'commission_agorot'],
  ['paymentMethod', 'payment_method'],
  ['offeredProIds', 'offered_pro_ids'],
  ['status', 'status'],
  ['cancelReason', 'cancel_reason'],
  ['createdAt', 'created_at'],
  ['updatedAt', 'updated_at'],
]);

const SPECS: Partial<Record<CollectionName, TableSpec>> = {
  bookings: {
    table: 'mk_bookings',
    key: 'id',
    toRow: (v) => ({
      ...bookingMap.toRow(v),
      lat: (v.location as Row | null)?.lat ?? null,
      lng: (v.location as Row | null)?.lng ?? null,
    }),
    fromRow: (r) => ({
      ...bookingMap.fromRow(r),
      location: r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : null,
    }),
  },
  offers: {
    table: 'mk_booking_offers',
    key: 'id',
    ...mapFields([
      ['id', 'id'],
      ['bookingId', 'booking_id'],
      ['professionalId', 'professional_id'],
      ['kind', 'kind'],
      ['status', 'status'],
      ['expiresAt', 'expires_at'],
      ['priceAgorot', 'price_agorot'],
      ['etaMinutes', 'eta_minutes'],
      ['message', 'message'],
      ['createdAt', 'created_at'],
    ]),
  },
  events: {
    table: 'mk_booking_events',
    key: 'id',
    ...mapFields([
      ['id', 'id'],
      ['bookingId', 'booking_id'],
      ['status', 'status'],
      ['actor', 'actor'],
      ['note', 'note'],
      ['createdAt', 'created_at'],
    ]),
  },
  messages: {
    table: 'mk_messages',
    key: 'id',
    ...mapFields([
      ['id', 'id'],
      ['bookingId', 'booking_id'],
      ['sender', 'sender'],
      ['kind', 'kind'],
      ['body', 'body'],
      ['createdAt', 'created_at'],
    ]),
  },
  reviews: {
    table: 'mk_reviews',
    key: 'id',
    ...mapFields([
      ['id', 'id'],
      ['bookingId', 'booking_id'],
      ['professionalId', 'professional_id'],
      ['customerId', 'customer_id'],
      ['customerName', 'customer_name'],
      ['serviceId', 'service_id'],
      ['quality', 'quality'],
      ['punctuality', 'punctuality'],
      ['service', 'service'],
      ['price', 'price'],
      ['text', 'body_text'],
      ['photoUrl', 'photo_url'],
      ['createdAt', 'created_at'],
    ]),
  },
  wallet: {
    table: 'mk_wallet_transactions',
    key: 'id',
    ...mapFields([
      ['id', 'id'],
      ['professionalId', 'professional_id'],
      ['bookingId', 'booking_id'],
      ['kind', 'kind'],
      ['amountAgorot', 'amount_agorot'],
      ['note', 'note'],
      ['createdAt', 'created_at'],
    ]),
  },
  coupons: {
    table: 'mk_coupons',
    key: 'code',
    ...mapFields([
      ['code', 'code'],
      ['percentOff', 'percent_off'],
      ['amountOffAgorot', 'amount_off_agorot'],
      ['serviceId', 'service_id'],
      ['areaId', 'area_id'],
      ['newCustomersOnly', 'new_customers_only'],
      ['expiresAt', 'expires_at'],
      ['maxRedemptions', 'max_redemptions'],
      ['redemptions', 'redemptions'],
      ['active', 'active'],
    ]),
  },
  waitlist: {
    table: 'mk_waitlist',
    key: 'id',
    ...mapFields([
      ['id', 'id'],
      ['phone', 'phone'],
      ['areaName', 'area_name'],
      ['serviceId', 'service_id'],
      ['createdAt', 'created_at'],
    ]),
  },
  notifications: {
    table: 'mk_notifications',
    key: 'id',
    ...mapFields([
      ['id', 'id'],
      ['userId', 'user_id'],
      ['title', 'title'],
      ['body', 'body'],
      ['bookingId', 'booking_id'],
      ['read', 'read'],
      ['createdAt', 'created_at'],
    ]),
  },
  availability: {
    table: 'mk_professional_availability',
    key: 'professional_id',
    toRow: (v) => ({
      professional_id: v.professionalId,
      online: v.online,
      heartbeat_at: v.heartbeatAt,
      lat: (v.location as Row | null)?.lat ?? null,
      lng: (v.location as Row | null)?.lng ?? null,
    }),
    fromRow: (r) => ({
      professionalId: r.professional_id,
      online: r.online,
      heartbeatAt: r.heartbeat_at,
      location: r.lat != null && r.lng != null ? { lat: r.lat, lng: r.lng } : undefined,
    }),
  },
  customers: {
    table: 'mk_profiles',
    key: 'id',
    toRow: (v) => ({
      id: v.id,
      full_name: v.fullName,
      phone: v.phone,
      email: v.email,
      language: v.language,
      credit_agorot: v.creditAgorot,
      referral_code: v.referralCode,
      blocked: v.blocked,
    }),
    fromRow: (r) => ({
      id: r.id,
      fullName: r.full_name,
      phone: r.phone,
      email: r.email,
      language: (r.language as Language) ?? 'he',
      creditAgorot: r.credit_agorot ?? 0,
      referralCode: r.referral_code ?? '',
      favorites: [], // filled from mk_favorites below
      blocked: r.blocked ?? false,
      createdAt: r.created_at,
    }),
  },
  areas: {
    table: 'mk_service_areas',
    key: 'id',
    toRow: (v) => ({
      id: v.id,
      name_he: v.name,
      lat: (v.center as Row).lat,
      lng: (v.center as Row).lng,
      radius_km: v.radiusKm,
      active: v.active,
      waitlist_only: v.waitlistOnly,
    }),
    fromRow: (r) => ({
      id: r.id,
      name: r.name_he,
      center: { lat: r.lat, lng: r.lng },
      radiusKm: r.radius_km,
      active: r.active,
      waitlistOnly: r.waitlist_only,
    }),
  },
};

const proMap = mapFields([
  ['id', 'id'],
  ['slug', 'slug'],
  ['fullName', 'full_name'],
  ['businessName', 'business_name'],
  ['phone', 'phone'],
  ['email', 'email'],
  ['photoUrl', 'photo_url'],
  ['city', 'city'],
  ['bio', 'bio'],
  ['languages', 'languages'],
  ['yearsExperience', 'years_experience'],
  ['workRadiusKm', 'work_radius_km'],
  ['status', 'status'],
  ['badges', 'badges'],
  ['commissionPct', 'commission_pct'],
  ['boost', 'boost'],
  ['gallery', 'gallery'],
  ['rating', 'rating'],
  ['reviewCount', 'review_count'],
  ['jobCount', 'job_count'],
  ['acceptancePct', 'acceptance_pct'],
  ['cancelPct', 'cancel_pct'],
  ['lastJobAt', 'last_job_at'],
  ['createdAt', 'created_at'],
]);

type Listener = (col: CollectionName | 'settings') => void;

export class SupabaseStore implements MarketStore {
  private listeners = new Set<Listener>();
  private realtimeStarted = false;

  constructor(private client: SupabaseClient) {}

  private startRealtime(): void {
    if (this.realtimeStarted || typeof window === 'undefined') return;
    this.realtimeStarted = true;
    const tables: [string, CollectionName][] = [
      ['mk_bookings', 'bookings'],
      ['mk_booking_offers', 'offers'],
      ['mk_booking_events', 'events'],
      ['mk_messages', 'messages'],
      ['mk_professional_availability', 'availability'],
      ['mk_professionals', 'professionals'],
    ];
    const channel = this.client.channel('mk-live');
    for (const [table, col] of tables) {
      channel.on('postgres_changes', { event: '*', schema: 'public', table }, () => {
        for (const cb of this.listeners) cb(col);
      });
    }
    channel.subscribe();
  }

  private async listPros(): Promise<Professional[]> {
    const [pros, services, areas] = await Promise.all([
      this.client.from('mk_professionals').select('*'),
      this.client.from('mk_professional_services').select('*'),
      this.client.from('mk_professional_areas').select('*'),
    ]);
    if (pros.error) throw pros.error;
    return (pros.data ?? []).map((r: Row) => {
      const base = proMap.fromRow(r) as unknown as Professional;
      return {
        ...base,
        base: { lat: 31.25, lng: 34.79 }, // pros carry no fixed pin in prod; availability has live location
        services: (services.data ?? [])
          .filter((s: Row) => s.professional_id === r.id)
          .map((s: Row) => ({
            serviceId: s.service_id as string,
            priceAgorot: (s.price_agorot as number | null) ?? undefined,
          })),
        areaIds: (areas.data ?? [])
          .filter((a: Row) => a.professional_id === r.id)
          .map((a: Row) => a.area_id as string),
      };
    });
  }

  private async putPro(pro: Professional): Promise<void> {
    const { error } = await this.client
      .from('mk_professionals')
      .upsert(proMap.toRow(pro as unknown as Row));
    if (error) throw error;
    await this.client.from('mk_professional_services').delete().eq('professional_id', pro.id);
    if (pro.services.length > 0) {
      await this.client.from('mk_professional_services').insert(
        pro.services.map((s) => ({
          professional_id: pro.id,
          service_id: s.serviceId,
          price_agorot: s.priceAgorot ?? null,
        })),
      );
    }
    await this.client.from('mk_professional_areas').delete().eq('professional_id', pro.id);
    if (pro.areaIds.length > 0) {
      await this.client.from('mk_professional_areas').insert(
        pro.areaIds.map((areaId) => ({ professional_id: pro.id, area_id: areaId })),
      );
    }
  }

  async list<K extends CollectionName>(col: K): Promise<CollectionMap[K][]> {
    this.startRealtime();
    if (col === 'services') return DEFAULT_SERVICES as unknown as CollectionMap[K][];
    if (col === 'professionals') return (await this.listPros()) as CollectionMap[K][];
    const spec = SPECS[col];
    if (!spec) return [];
    const { data, error } = await this.client.from(spec.table).select('*');
    if (error) throw error;
    let rows = (data ?? []).map((r: Row) => spec.fromRow(r)) as unknown as CollectionMap[K][];
    if (col === 'areas' && rows.length === 0) rows = DEFAULT_AREAS as unknown as CollectionMap[K][];
    if (col === 'customers') {
      const favs = await this.client.from('mk_favorites').select('*');
      for (const c of rows as unknown as Row[]) {
        c.favorites = (favs.data ?? [])
          .filter((f: Row) => f.customer_id === c.id)
          .map((f: Row) => f.professional_id);
      }
    }
    return rows;
  }

  async get<K extends CollectionName>(col: K, rowId: string): Promise<CollectionMap[K] | null> {
    const rows = await this.list(col);
    const key = col === 'coupons' ? 'code' : col === 'availability' ? 'professionalId' : 'id';
    return rows.find((r) => (r as unknown as Row)[key] === rowId) ?? null;
  }

  async put<K extends CollectionName>(col: K, row: CollectionMap[K]): Promise<void> {
    if (col === 'services') return; // catalogue is versioned in code
    if (col === 'professionals') return this.putPro(row as unknown as Professional);
    const spec = SPECS[col];
    if (!spec) return;
    const { error } = await this.client.from(spec.table).upsert(spec.toRow(row as unknown as Row));
    if (error) throw error;
    if (col === 'customers') {
      const c = row as CollectionMap['customers'];
      await this.client.from('mk_favorites').delete().eq('customer_id', c.id);
      if (c.favorites.length > 0) {
        await this.client.from('mk_favorites').insert(
          c.favorites.map((professionalId) => ({
            customer_id: c.id,
            professional_id: professionalId,
          })),
        );
      }
    }
    for (const cb of this.listeners) cb(col);
  }

  async remove(col: CollectionName, rowId: string): Promise<void> {
    const spec =
      col === 'professionals'
        ? { table: 'mk_professionals', key: 'id' }
        : SPECS[col];
    if (!spec) return;
    const { error } = await this.client.from(spec.table).delete().eq(spec.key, rowId);
    if (error) throw error;
    for (const cb of this.listeners) cb(col);
  }

  async getSettings(): Promise<PlatformSettings> {
    const { data } = await this.client.from('mk_platform_settings').select('data').maybeSingle();
    return { ...DEFAULT_SETTINGS, ...((data?.data as Partial<PlatformSettings>) ?? {}) };
  }

  async putSettings(settings: PlatformSettings): Promise<void> {
    const { error } = await this.client
      .from('mk_platform_settings')
      .upsert({ id: true, data: settings });
    if (error) throw error;
    for (const cb of this.listeners) cb('settings');
  }

  subscribe(cb: Listener): () => void {
    this.startRealtime();
    this.listeners.add(cb);
    return () => this.listeners.delete(cb);
  }
}
