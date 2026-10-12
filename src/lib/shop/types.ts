/**
 * Domain model of the ANX3D 3D-print store (/shop).
 *
 * Everything the storefront shows — products, categories, stock, prices,
 * images — is data, editable from /shop/admin without a code change. The
 * same shapes map 1:1 onto supabase/shop-schema.sql.
 */

export type CategoryIcon =
  | 'all'
  | 'figurine'
  | 'decor'
  | 'gaming'
  | 'stand'
  | 'tools'
  | 'animals'
  | 'parts'
  | 'stl';

export interface Category {
  slug: string;
  name: string;
  /** Short label for the round icon chips on the home page. */
  shortName: string;
  icon: CategoryIcon;
  /** Background photo of the large tile on /shop/categories. */
  image: string;
  sortOrder: number;
}

export interface ColorOption {
  id: string;
  name: string;
  /** One or two CSS colors; two render as the split swatch from the design. */
  swatch: [string] | [string, string];
  /** Gallery shown while this color is selected; falls back to the product's. */
  images?: string[];
}

export interface Product {
  id: string;
  slug: string;
  name: string;
  description: string;
  /** Category slugs; the first one is the primary (breadcrumb) category. */
  categories: string[];
  price: number;
  compareAtPrice?: number;
  images: string[];
  /** Square shot for product cards; defaults to images[0]. */
  cardImage?: string;
  colors: ColorOption[];
  /** Units on hand. 0 = out of stock. null = made to order / digital. */
  stock: number | null;
  rating: number;
  reviewCount: number;
  featured: boolean;
  published: boolean;
  digital: boolean;
  material: string;
  /** Search keywords beyond the name (synonyms, English names). */
  tags: string[];
  createdAt: string;
  sortOrder: number;
}

export interface CartLine {
  /** productId + colorId — the same product in two colors is two lines. */
  key: string;
  productId: string;
  colorId: string | null;
  qty: number;
}

export type ShippingMethodId = 'standard' | 'express' | 'pickup';

export interface ShippingMethod {
  id: ShippingMethodId;
  name: string;
  eta: string;
  price: number;
  /** Order subtotal from which this method becomes free; null = never. */
  freeFrom: number | null;
}

export type PaymentMethodId = 'card' | 'bit' | 'paypal';

export interface Coupon {
  code: string;
  kind: 'percent' | 'fixed' | 'shipping';
  value: number;
  minSubtotal: number;
  active: boolean;
  label: string;
}

export interface Address {
  id: string;
  label: string;
  fullName: string;
  phone: string;
  city: string;
  street: string;
  zip: string;
  notes: string;
}

export interface User {
  id: string;
  email: string;
  name: string;
  phone: string;
  /** Demo backend only: salted SHA-256, never the plain password. */
  passwordHash: string;
  role: 'customer' | 'admin';
  addresses: Address[];
  marketingOptIn: boolean;
  createdAt: string;
}

export type OrderStatus = 'pending_payment' | 'paid' | 'processing' | 'shipped' | 'delivered' | 'cancelled';

export interface OrderLine {
  productId: string;
  name: string;
  colorName: string | null;
  image: string;
  unitPrice: number;
  qty: number;
}

export interface Order {
  id: string;
  /** Human order number shown to the customer, e.g. 10245. */
  number: number;
  userId: string | null;
  email: string;
  customer: { fullName: string; phone: string };
  address: Omit<Address, 'id' | 'label'>;
  lines: OrderLine[];
  subtotal: number;
  discount: number;
  shipping: number;
  total: number;
  couponCode: string | null;
  shippingMethod: ShippingMethodId;
  paymentMethod: PaymentMethodId;
  /** Reference returned by the payment provider once it confirms the charge. */
  paymentRef: string | null;
  status: OrderStatus;
  createdAt: string;
  history: { status: OrderStatus; at: string }[];
}

export interface ShopSettings {
  /** Shows the "sample data" ribbon. Turn off once real catalog data is in. */
  sampleDataNotice: boolean;
  shippingMethods: ShippingMethod[];
  coupons: Coupon[];
  nextOrderNumber: number;
}

export interface ShopDB {
  version: number;
  products: Product[];
  categories: Category[];
  users: User[];
  orders: Order[];
  settings: ShopSettings;
}

export interface Filters {
  minPrice: number;
  maxPrice: number;
  categories: string[];
  colors: string[];
  minRating: number;
  inStockOnly: boolean;
}

export type SortKey = 'recommended' | 'price-asc' | 'price-desc' | 'rating' | 'newest';
