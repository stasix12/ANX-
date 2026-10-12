import type {
  CartLine,
  Category,
  Coupon,
  Filters,
  Product,
  ShippingMethod,
  ShippingMethodId,
  SortKey,
} from './types';

/** Pure catalogue / cart math — shared by the UI, the store and checkout. */

/** "89 ₪" — inside RTL text this renders as the design's "₪ 89". */
export const ils = (n: number) => `${Number.isInteger(n) ? n : n.toFixed(2)} ₪`;

export const lineKey = (productId: string, colorId: string | null, options: Record<string, string> = {}) =>
  [productId, colorId ?? '-', ...Object.keys(options).sort().map((k) => `${k}=${options[k]}`)].join('::');

/** "קוטר חיבור: 36 מ״מ" — variant selections as one line for cart and orders. */
export function optionsText(p: Product, options: Record<string, string>): string {
  return p.variants
    .filter((v) => options[v.id])
    .map((v) => `${v.label}: ${options[v.id]}`)
    .join(' · ');
}

/** Has a price, is published and in stock — i.e. can go into the cart. */
export function purchasable(p: Product): boolean {
  return p.published && p.price !== null && inStock(p);
}

export function cardImage(p: Product): string {
  return p.cardImage ?? p.images[0] ?? '';
}

export function galleryFor(p: Product, colorId: string | null): string[] {
  const c = p.colors.find((x) => x.id === colorId);
  return c?.images?.length ? c.images : p.images;
}

export function inStock(p: Product): boolean {
  return p.stock === null || p.stock > 0;
}

export function maxQty(p: Product): number {
  if (p.digital) return 1;
  return p.stock === null ? 99 : Math.max(0, Math.min(99, p.stock));
}

export function productHref(p: Pick<Product, 'slug'>, staticSlugs?: Set<string>): string {
  // Seed products have pre-rendered (SEO) pages; products added later from
  // the admin panel are served by the client-side /shop/item route until the
  // next build gives them a static page too.
  if (!staticSlugs || staticSlugs.has(p.slug)) return `/shop/p/${p.slug}`;
  return `/shop/item?s=${encodeURIComponent(p.slug)}`;
}

export function categoryHref(slug: string, staticSlugs?: Set<string>): string {
  if (!staticSlugs || staticSlugs.has(slug)) return `/shop/c/${slug}`;
  return `/shop/c/all?cat=${encodeURIComponent(slug)}`;
}

/* ---------------------------------------------------------------- search */

/** Lower-cases and strips Hebrew niqqud/geresh so "ג׳ויסטיק" ≈ "גויסטיק". */
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[֑-ׇ]/g, '')
    .replace(/[׳״'"`\-–—_.,]/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

function score(p: Product, cats: Category[], q: string): number {
  const name = normalize(p.name);
  if (name === q) return 100;
  let s = 0;
  if (name.startsWith(q)) s += 60;
  else if (name.includes(q)) s += 40;
  const words = q.split(' ').filter(Boolean);
  const hay = [
    name,
    normalize(p.description),
    ...p.tags.map(normalize),
    ...p.categories.map((slug) => normalize(cats.find((c) => c.slug === slug)?.name ?? '')),
    ...p.colors.map((c) => normalize(c.name)),
  ].join(' ');
  if (words.every((w) => hay.includes(w))) s += 20 + words.length;
  else return s;
  if (p.tags.some((t) => normalize(t).startsWith(q))) s += 10;
  return s;
}

export function searchProducts(products: Product[], cats: Category[], query: string): Product[] {
  const q = normalize(query);
  if (!q) return [];
  return products
    .filter((p) => p.published)
    .map((p) => ({ p, s: score(p, cats, q) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s || b.p.reviewCount - a.p.reviewCount)
    .map((x) => x.p);
}

/** Autocomplete rows: matching product names, then matching categories. */
export function suggestions(products: Product[], cats: Category[], query: string, limit = 8) {
  const q = normalize(query);
  if (!q) return [];
  const prod = searchProducts(products, cats, query).map((p) => ({ kind: 'product' as const, label: p.name, slug: p.slug }));
  const cat = cats
    .filter((c) => normalize(c.name).includes(q))
    .map((c) => ({ kind: 'category' as const, label: c.name, slug: c.slug }));
  return [...prod, ...cat].slice(0, limit);
}

/* --------------------------------------------------------------- filters */

export function priceBounds(products: Product[]): [number, number] {
  const prices = products.filter((p) => p.published && p.price !== null).map((p) => p.price as number);
  if (!prices.length) return [0, 300];
  return [0, Math.max(300, Math.ceil(Math.max(...prices) / 50) * 50)];
}

export function emptyFilters(products: Product[]): Filters {
  const [min, max] = priceBounds(products);
  return { minPrice: min, maxPrice: max, categories: [], colors: [], minRating: 0, inStockOnly: false };
}

export function activeFilterCount(f: Filters, products: Product[]): number {
  const [min, max] = priceBounds(products);
  return (
    (f.minPrice > min || f.maxPrice < max ? 1 : 0) +
    f.categories.length +
    f.colors.length +
    (f.minRating > 0 ? 1 : 0) +
    (f.inStockOnly ? 1 : 0)
  );
}

export function applyFilters(products: Product[], f: Filters): Product[] {
  return products.filter(
    (p) =>
      p.published &&
      // Products without a price yet only drop out once a minimum is set.
      (p.price === null ? f.minPrice <= 0 : p.price >= f.minPrice && p.price <= f.maxPrice) &&
      (!f.categories.length || p.categories.some((c) => f.categories.includes(c))) &&
      (!f.colors.length || p.colors.some((c) => f.colors.includes(c.id))) &&
      p.rating >= f.minRating &&
      (!f.inStockOnly || inStock(p)),
  );
}

export function sortProducts(products: Product[], sort: SortKey): Product[] {
  const list = [...products];
  switch (sort) {
    case 'price-asc':
      return list.sort((a, b) => (a.price ?? Infinity) - (b.price ?? Infinity));
    case 'price-desc':
      return list.sort((a, b) => (b.price ?? -Infinity) - (a.price ?? -Infinity));
    case 'rating':
      return list.sort((a, b) => b.rating - a.rating || b.reviewCount - a.reviewCount);
    case 'newest':
      return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    default:
      return list.sort((a, b) => Number(b.featured) - Number(a.featured) || a.sortOrder - b.sortOrder);
  }
}

export const SORT_LABELS: Record<SortKey, string> = {
  recommended: 'מומלץ',
  'price-asc': 'מחיר: מהנמוך לגבוה',
  'price-desc': 'מחיר: מהגבוה לנמוך',
  rating: 'דירוג',
  newest: 'חדשים',
};

/* ------------------------------------------------------------------ cart */

export interface PricedLine extends CartLine {
  product: Product;
  colorName: string | null;
  optionsText: string;
  image: string;
  unitPrice: number;
  lineTotal: number;
  /** Set when the line can no longer be bought as-is. */
  problem: string | null;
}

export interface CartTotals {
  lines: PricedLine[];
  itemCount: number;
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  coupon: Coupon | null;
  couponError: string | null;
  allDigital: boolean;
}

export function evaluateCoupon(
  code: string | null,
  coupons: Coupon[],
  subtotal: number,
): { coupon: Coupon | null; error: string | null } {
  if (!code) return { coupon: null, error: null };
  const c = coupons.find((x) => x.code.toUpperCase() === code.trim().toUpperCase());
  if (!c || !c.active) return { coupon: null, error: 'קוד הקופון אינו בתוקף' };
  if (subtotal < c.minSubtotal) return { coupon: null, error: `הקופון תקף בקנייה מעל ${ils(c.minSubtotal)}` };
  return { coupon: c, error: null };
}

export function shippingCost(method: ShippingMethod | undefined, subtotal: number): number {
  if (!method) return 0;
  if (method.freeFrom !== null && subtotal >= method.freeFrom) return 0;
  return method.price;
}

export function priceCart(
  lines: CartLine[],
  products: Product[],
  couponCode: string | null,
  coupons: Coupon[],
  methods: ShippingMethod[],
  methodId: ShippingMethodId = 'standard',
): CartTotals {
  const priced: PricedLine[] = [];
  for (const l of lines) {
    const product = products.find((p) => p.id === l.productId);
    if (!product) continue;
    const color = product.colors.find((c) => c.id === l.colorId) ?? null;
    let problem: string | null = null;
    if (!product.published) problem = 'המוצר אינו זמין יותר';
    else if (product.price === null) problem = 'המחיר טרם נקבע — להזמנה בוואטסאפ';
    else if (!inStock(product)) problem = 'אזל מהמלאי';
    else if (l.qty > maxQty(product)) problem = `נותרו ${maxQty(product)} יחידות במלאי`;
    priced.push({
      ...l,
      product,
      colorName: color?.name ?? null,
      optionsText: optionsText(product, l.options ?? {}),
      image: color?.images?.[0] ?? cardImage(product),
      unitPrice: product.price ?? 0,
      lineTotal: (product.price ?? 0) * l.qty,
      problem,
    });
  }
  const subtotal = priced.reduce((s, l) => s + l.lineTotal, 0);
  const allDigital = priced.length > 0 && priced.every((l) => l.product.digital);
  const { coupon, error } = evaluateCoupon(couponCode, coupons, subtotal);
  const method = methods.find((m) => m.id === methodId) ?? methods[0];
  let shipping = priced.length && !allDigital ? shippingCost(method, subtotal) : 0;
  let discount = 0;
  if (coupon?.kind === 'percent') discount = Math.round(subtotal * coupon.value) / 100;
  if (coupon?.kind === 'fixed') discount = Math.min(subtotal, coupon.value);
  if (coupon?.kind === 'shipping') shipping = 0;
  return {
    lines: priced,
    itemCount: priced.reduce((s, l) => s + l.qty, 0),
    subtotal,
    discount,
    shipping,
    total: Math.max(0, Math.round((subtotal - discount + shipping) * 100) / 100),
    coupon,
    couponError: error,
    allDigital,
  };
}

/* ------------------------------------------------------------ validation */

export const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(s.trim());
/** Israeli mobile/landline, with or without +972 / dashes. */
export const isPhone = (s: string) => /^(\+972|0)([23489]|5\d|7\d)\d{7}$/.test(s.replace(/[\s-]/g, ''));
