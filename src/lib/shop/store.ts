'use client';

import { useSyncExternalStore } from 'react';
import { buildSeedDB, DB_VERSION } from './seed';
import { inStock, isEmail, isPhone, lineKey, maxQty, priceCart } from './logic';
import type {
  Address,
  CartLine,
  Category,
  Order,
  OrderStatus,
  PaymentMethodId,
  Product,
  ShippingMethodId,
  ShopDB,
  ShopSettings,
  User,
} from './types';

/**
 * Client-side store of the /shop storefront (demo backend).
 *
 * The catalogue, users and orders live in a localStorage snapshot so the
 * whole store works end to end on a static host with no keys — the same
 * approach the /clean platform takes. supabase/shop-schema.sql holds the
 * production tables; swapping the backend means re-implementing the
 * `actions` below against them, the UI only talks to this module.
 *
 * Never stored here: card numbers. Payment goes through the provider's own
 * hosted page (src/lib/shop/payments.ts); we only keep its reference.
 */

const DB_KEY = 'anx3d-shop-db-v1';
const CART_KEY = 'anx3d-shop-cart-v1';
const FAV_KEY = 'anx3d-shop-favs-v1';
const SESSION_KEY = 'anx3d-shop-session-v1';

export interface ShopState {
  db: ShopDB;
  cart: { lines: CartLine[]; coupon: string | null };
  favorites: string[];
  userId: string | null;
  /** False during prerender/hydration, true once localStorage was read. */
  ready: boolean;
}

const SERVER_STATE: ShopState = {
  db: buildSeedDB(),
  cart: { lines: [], coupon: null },
  favorites: [],
  userId: null,
  ready: false,
};

let state: ShopState | null = null;
const listeners = new Set<() => void>();

function read<T>(key: string, fallback: T, valid: (v: unknown) => boolean): T {
  try {
    const raw = window.localStorage.getItem(key);
    if (raw) {
      const v = JSON.parse(raw);
      if (valid(v)) return v as T;
    }
  } catch {
    // Blocked or corrupt storage — start fresh in memory.
  }
  return fallback;
}

function load(): ShopState {
  const db = read<ShopDB>(DB_KEY, buildSeedDB(), (v) => {
    const d = v as ShopDB;
    return !!d && d.version === DB_VERSION && Array.isArray(d.products) && !!d.settings;
  });
  const cart = read(CART_KEY, { lines: [], coupon: null }, (v) => Array.isArray((v as ShopState['cart'])?.lines));
  const favorites = read<string[]>(FAV_KEY, [], Array.isArray);
  const userId = read<string | null>(SESSION_KEY, null, (v) => typeof v === 'string');
  return { db, cart, favorites, userId: db.users.some((u) => u.id === userId) ? userId : null, ready: true };
}

function get(): ShopState {
  if (!state) state = load();
  return state;
}

function write(key: string, value: unknown) {
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Quota exceeded (e.g. large uploaded images) — keep running in memory.
  }
}

function commit(next: Partial<ShopState>) {
  const prev = get();
  state = { ...prev, ...next };
  if (next.db && next.db !== prev.db) write(DB_KEY, state.db);
  if (next.cart && next.cart !== prev.cart) write(CART_KEY, state.cart);
  if (next.favorites && next.favorites !== prev.favorites) write(FAV_KEY, state.favorites);
  if ('userId' in next && next.userId !== prev.userId) write(SESSION_KEY, state.userId);
  for (const fn of listeners) fn();
}

function subscribe(fn: () => void) {
  listeners.add(fn);
  const onStorage = (e: StorageEvent) => {
    if (e.key && e.key.startsWith('anx3d-shop-')) {
      state = load();
      for (const l of listeners) l();
    }
  };
  if (listeners.size === 1) window.addEventListener('storage', onStorage);
  return () => {
    listeners.delete(fn);
    if (listeners.size === 0) window.removeEventListener('storage', onStorage);
  };
}

export function useShop(): ShopState {
  return useSyncExternalStore(subscribe, get, () => SERVER_STATE);
}

export function useShopSelector<T>(select: (s: ShopState) => T): T {
  const s = useShop();
  return select(s);
}

export function useCurrentUser(): User | null {
  const s = useShop();
  return s.userId ? (s.db.users.find((u) => u.id === s.userId) ?? null) : null;
}

const now = () => new Date().toISOString();
const uid = (prefix: string) =>
  `${prefix}-${typeof crypto !== 'undefined' && 'randomUUID' in crypto ? crypto.randomUUID().slice(0, 8) : Math.random().toString(36).slice(2, 10)}`;

async function hashPassword(email: string, password: string): Promise<string> {
  const data = new TextEncoder().encode(`anx3d-shop:${email.trim().toLowerCase()}:${password}`);
  const buf = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(buf), (b) => b.toString(16).padStart(2, '0')).join('');
}

function updateDB(fn: (db: ShopDB) => ShopDB) {
  commit({ db: fn(get().db) });
}

type Result<T = void> = { ok: true; value: T } | { ok: false; error: string };
const ok = <T>(value: T): Result<T> => ({ ok: true, value });
const fail = (error: string): Result<never> => ({ ok: false, error });

export interface CheckoutInput {
  fullName: string;
  email: string;
  phone: string;
  city: string;
  street: string;
  zip: string;
  notes: string;
  shippingMethod: ShippingMethodId;
  paymentMethod: PaymentMethodId;
  saveAddress: boolean;
}

export const actions = {
  /* ------------------------------------------------------------- cart */
  addToCart(productId: string, colorId: string | null, qty = 1): Result<number> {
    const s = get();
    const p = s.db.products.find((x) => x.id === productId);
    if (!p || !p.published) return fail('המוצר אינו זמין');
    if (!inStock(p)) return fail('המוצר אזל מהמלאי');
    const key = lineKey(productId, colorId);
    const existing = s.cart.lines.find((l) => l.key === key);
    const want = Math.min(maxQty(p), (existing?.qty ?? 0) + qty);
    const lines = existing
      ? s.cart.lines.map((l) => (l.key === key ? { ...l, qty: want } : l))
      : [...s.cart.lines, { key, productId, colorId, qty: want }];
    commit({ cart: { ...s.cart, lines } });
    return ok(want);
  },
  setQty(key: string, qty: number) {
    const s = get();
    const line = s.cart.lines.find((l) => l.key === key);
    const p = line && s.db.products.find((x) => x.id === line.productId);
    if (!line || !p) return;
    if (qty <= 0) return actions.removeLine(key);
    commit({ cart: { ...s.cart, lines: s.cart.lines.map((l) => (l.key === key ? { ...l, qty: Math.min(qty, Math.max(1, maxQty(p))) } : l)) } });
  },
  removeLine(key: string) {
    const s = get();
    commit({ cart: { ...s.cart, lines: s.cart.lines.filter((l) => l.key !== key) } });
  },
  applyCoupon(code: string): Result<string> {
    const s = get();
    const trimmed = code.trim();
    if (!trimmed) return fail('הזינו קוד קופון');
    const totals = priceCart(s.cart.lines, s.db.products, trimmed, s.db.settings.coupons, s.db.settings.shippingMethods);
    if (!totals.coupon) return fail(totals.couponError ?? 'קוד הקופון אינו בתוקף');
    commit({ cart: { ...s.cart, coupon: totals.coupon.code } });
    return ok(totals.coupon.label);
  },
  removeCoupon() {
    const s = get();
    commit({ cart: { ...s.cart, coupon: null } });
  },
  clearCart() {
    commit({ cart: { lines: [], coupon: null } });
  },

  /* -------------------------------------------------------- favorites */
  toggleFavorite(productId: string): boolean {
    const s = get();
    const has = s.favorites.includes(productId);
    commit({ favorites: has ? s.favorites.filter((id) => id !== productId) : [...s.favorites, productId] });
    return !has;
  },

  /* ------------------------------------------------------------- auth */
  async register(input: { name: string; email: string; phone: string; password: string }): Promise<Result<User>> {
    const email = input.email.trim().toLowerCase();
    if (input.name.trim().length < 2) return fail('נא להזין שם מלא');
    if (!isEmail(email)) return fail('כתובת האימייל אינה תקינה');
    if (input.phone && !isPhone(input.phone)) return fail('מספר הטלפון אינו תקין');
    if (input.password.length < 8) return fail('הסיסמה צריכה להכיל לפחות 8 תווים');
    if (get().db.users.some((u) => u.email === email)) return fail('כבר קיים חשבון עם האימייל הזה');
    const user: User = {
      id: uid('u'),
      email,
      name: input.name.trim(),
      phone: input.phone.trim(),
      passwordHash: await hashPassword(email, input.password),
      role: 'customer',
      addresses: [],
      marketingOptIn: false,
      createdAt: now(),
    };
    const db = get().db;
    commit({ db: { ...db, users: [...db.users, user] }, userId: user.id });
    return ok(user);
  },
  async login(emailRaw: string, password: string): Promise<Result<User>> {
    const email = emailRaw.trim().toLowerCase();
    const user = get().db.users.find((u) => u.email === email);
    if (!user || user.passwordHash !== (await hashPassword(email, password))) return fail('אימייל או סיסמה שגויים');
    commit({ userId: user.id });
    return ok(user);
  },
  logout() {
    commit({ userId: null });
  },
  updateProfile(patch: Partial<Pick<User, 'name' | 'phone' | 'marketingOptIn'>>): Result<void> {
    const s = get();
    if (!s.userId) return fail('יש להתחבר');
    if (patch.name !== undefined && patch.name.trim().length < 2) return fail('נא להזין שם מלא');
    if (patch.phone && !isPhone(patch.phone)) return fail('מספר הטלפון אינו תקין');
    updateDB((db) => ({ ...db, users: db.users.map((u) => (u.id === s.userId ? { ...u, ...patch } : u)) }));
    return ok(undefined);
  },
  async changePassword(current: string, next: string): Promise<Result<void>> {
    const s = get();
    const user = s.db.users.find((u) => u.id === s.userId);
    if (!user) return fail('יש להתחבר');
    if (user.passwordHash !== (await hashPassword(user.email, current))) return fail('הסיסמה הנוכחית שגויה');
    if (next.length < 8) return fail('הסיסמה החדשה צריכה להכיל לפחות 8 תווים');
    const passwordHash = await hashPassword(user.email, next);
    updateDB((db) => ({ ...db, users: db.users.map((u) => (u.id === user.id ? { ...u, passwordHash } : u)) }));
    return ok(undefined);
  },
  saveAddress(address: Omit<Address, 'id'> & { id?: string }): Result<void> {
    const s = get();
    if (!s.userId) return fail('יש להתחבר');
    if (!address.city.trim() || !address.street.trim()) return fail('נא למלא עיר ורחוב');
    const a: Address = { ...address, id: address.id ?? uid('a') };
    updateDB((db) => ({
      ...db,
      users: db.users.map((u) =>
        u.id === s.userId
          ? { ...u, addresses: u.addresses.some((x) => x.id === a.id) ? u.addresses.map((x) => (x.id === a.id ? a : x)) : [...u.addresses, a] }
          : u,
      ),
    }));
    return ok(undefined);
  },
  deleteAddress(id: string) {
    const s = get();
    updateDB((db) => ({
      ...db,
      users: db.users.map((u) => (u.id === s.userId ? { ...u, addresses: u.addresses.filter((a) => a.id !== id) } : u)),
    }));
  },

  /* ----------------------------------------------------------- orders */
  /**
   * Validates the cart against live stock and prices and records the order
   * as pending_payment. The order is NOT considered placed until the payment
   * provider confirms it (confirmPayment) — the success screen checks that.
   */
  createOrder(input: CheckoutInput): Result<Order> {
    const s = get();
    const { settings, products } = s.db;
    if (input.fullName.trim().length < 2) return fail('נא להזין שם מלא');
    if (!isEmail(input.email)) return fail('כתובת האימייל אינה תקינה');
    if (!isPhone(input.phone)) return fail('מספר הטלפון אינו תקין');
    const totals = priceCart(s.cart.lines, products, s.cart.coupon, settings.coupons, settings.shippingMethods, input.shippingMethod);
    if (!totals.lines.length) return fail('הסל ריק');
    const problem = totals.lines.find((l) => l.problem);
    if (problem) return fail(`${problem.product.name}: ${problem.problem}`);
    const needsAddress = !totals.allDigital && input.shippingMethod !== 'pickup';
    if (needsAddress && (!input.city.trim() || !input.street.trim())) return fail('נא למלא כתובת למשלוח');
    const at = now();
    const order: Order = {
      id: uid('o'),
      number: settings.nextOrderNumber,
      userId: s.userId,
      email: input.email.trim().toLowerCase(),
      customer: { fullName: input.fullName.trim(), phone: input.phone.trim() },
      address: {
        fullName: input.fullName.trim(),
        phone: input.phone.trim(),
        city: input.city.trim(),
        street: input.street.trim(),
        zip: input.zip.trim(),
        notes: input.notes.trim(),
      },
      lines: totals.lines.map((l) => ({
        productId: l.productId,
        name: l.product.name,
        colorName: l.colorName,
        image: l.image,
        unitPrice: l.unitPrice,
        qty: l.qty,
      })),
      subtotal: totals.subtotal,
      discount: totals.discount,
      shipping: totals.shipping,
      total: totals.total,
      couponCode: totals.coupon?.code ?? null,
      shippingMethod: totals.allDigital ? 'pickup' : input.shippingMethod,
      paymentMethod: input.paymentMethod,
      paymentRef: null,
      status: 'pending_payment',
      createdAt: at,
      history: [{ status: 'pending_payment', at }],
    };
    let db: ShopDB = {
      ...s.db,
      orders: [order, ...s.db.orders],
      settings: { ...settings, nextOrderNumber: settings.nextOrderNumber + 1 },
    };
    if (input.saveAddress && s.userId && needsAddress) {
      db = {
        ...db,
        users: db.users.map((u) =>
          u.id === s.userId && !u.addresses.some((a) => a.street === order.address.street && a.city === order.address.city)
            ? { ...u, addresses: [...u.addresses, { id: uid('a'), label: 'בית', ...order.address }] }
            : u,
        ),
      };
    }
    commit({ db });
    return ok(order);
  },
  /** Called only with a reference the payment provider returned. */
  confirmPayment(orderId: string, paymentRef: string): Result<Order> {
    const s = get();
    const order = s.db.orders.find((o) => o.id === orderId);
    if (!order) return fail('ההזמנה לא נמצאה');
    if (order.status !== 'pending_payment') return ok(order);
    const at = now();
    const paid: Order = { ...order, status: 'paid', paymentRef, history: [...order.history, { status: 'paid', at }] };
    const products = s.db.products.map((p) => {
      const sold = order.lines.filter((l) => l.productId === p.id).reduce((n, l) => n + l.qty, 0);
      return sold && p.stock !== null ? { ...p, stock: Math.max(0, p.stock - sold) } : p;
    });
    commit({
      db: { ...s.db, products, orders: s.db.orders.map((o) => (o.id === orderId ? paid : o)) },
      cart: { lines: [], coupon: null },
    });
    return ok(paid);
  },
  cancelPendingOrder(orderId: string) {
    updateDB((db) => ({
      ...db,
      orders: db.orders.map((o) =>
        o.id === orderId && o.status === 'pending_payment'
          ? { ...o, status: 'cancelled', history: [...o.history, { status: 'cancelled', at: now() }] }
          : o,
      ),
    }));
  },

  /* ------------------------------------------------------------ admin */
  upsertProduct(p: Product): Result<void> {
    const db = get().db;
    if (!p.name.trim()) return fail('חסר שם מוצר');
    if (!/^[a-z0-9-]+$/.test(p.slug)) return fail('מזהה URL: אותיות באנגלית קטנות, ספרות ומקפים בלבד');
    if (db.products.some((x) => x.slug === p.slug && x.id !== p.id)) return fail('מזהה ה-URL כבר בשימוש');
    if (!(p.price >= 0)) return fail('מחיר לא תקין');
    if (!p.images.length) return fail('יש להוסיף לפחות תמונה אחת');
    if (!p.categories.length) return fail('יש לבחור קטגוריה');
    const exists = db.products.some((x) => x.id === p.id);
    commit({ db: { ...db, products: exists ? db.products.map((x) => (x.id === p.id ? p : x)) : [...db.products, p] } });
    return ok(undefined);
  },
  deleteProduct(id: string) {
    updateDB((db) => ({ ...db, products: db.products.filter((p) => p.id !== id) }));
  },
  upsertCategory(c: Category, previousSlug?: string): Result<void> {
    const db = get().db;
    if (!c.name.trim()) return fail('חסר שם קטגוריה');
    if (!/^[a-z0-9-]+$/.test(c.slug)) return fail('מזהה URL: אותיות באנגלית קטנות, ספרות ומקפים בלבד');
    const key = previousSlug ?? c.slug;
    if (db.categories.some((x) => x.slug === c.slug && x.slug !== key)) return fail('מזהה ה-URL כבר בשימוש');
    const exists = db.categories.some((x) => x.slug === key);
    const categories = exists ? db.categories.map((x) => (x.slug === key ? c : x)) : [...db.categories, c];
    const products =
      previousSlug && previousSlug !== c.slug
        ? db.products.map((p) => ({ ...p, categories: p.categories.map((s) => (s === previousSlug ? c.slug : s)) }))
        : db.products;
    commit({ db: { ...db, categories, products } });
    return ok(undefined);
  },
  deleteCategory(slug: string): Result<void> {
    const db = get().db;
    if (db.products.some((p) => p.categories.includes(slug))) return fail('יש מוצרים בקטגוריה — העבירו אותם קודם');
    commit({ db: { ...db, categories: db.categories.filter((c) => c.slug !== slug) } });
    return ok(undefined);
  },
  updateSettings(patch: Partial<ShopSettings>) {
    updateDB((db) => ({ ...db, settings: { ...db.settings, ...patch } }));
  },
  setOrderStatus(orderId: string, status: OrderStatus) {
    updateDB((db) => ({
      ...db,
      orders: db.orders.map((o) => (o.id === orderId ? { ...o, status, history: [...o.history, { status, at: now() }] } : o)),
    }));
  },
  resetDemo() {
    commit({ db: buildSeedDB(), cart: { lines: [], coupon: null }, favorites: [], userId: null });
  },
};

export const ORDER_STATUS_LABEL: Record<OrderStatus, string> = {
  pending_payment: 'ממתינה לתשלום',
  paid: 'שולמה',
  processing: 'בהכנה',
  shipped: 'נשלחה',
  delivered: 'נמסרה',
  cancelled: 'בוטלה',
};

export function newProductDraft(): Product {
  return {
    id: uid('p'),
    slug: '',
    name: '',
    description: '',
    categories: [],
    price: 0,
    images: [],
    colors: [],
    stock: 0,
    rating: 0,
    reviewCount: 0,
    featured: false,
    published: true,
    digital: false,
    material: 'PLA',
    tags: [],
    createdAt: now(),
    sortOrder: 100,
  };
}
