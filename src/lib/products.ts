import { supabase } from '@/lib/supabase';
import { asset } from '@/lib/site';

export type CategoryId = 'handles' | 'hoses' | 'adapters' | 'courses';

export interface Category {
  id: CategoryId;
  name: string;
  blurb: string;
}

export interface SpecRow {
  label: string;
  value: string;
}

export interface VariantGroup {
  id: string;
  label: string;
  options: string[];
}

/**
 * The Sabrina models a part can be ordered for. Buyers pick one on the product
 * card and the choice rides along into the WhatsApp order message.
 */
export const sabrinaModels = ['סברינה מקסי', 'סברינה מיני'] as const;

export type SabrinaModel = (typeof sabrinaModels)[number];

export interface Product {
  /** Database row id — absent only for a not-yet-saved draft in the admin form. */
  id?: string;
  slug: string;
  name: string;
  /** One line for the product card. */
  tagline: string;
  /** Full paragraph for the product page. */
  description: string;
  category: CategoryId;
  /** Optional — omit and the card shows "לפרטי מחיר בוואטסאפ". */
  price?: number;
  /** Optional discounted price. Shown struck-through against `price` when set and lower. */
  salePrice?: number;
  badge?: string;
  /**
   * Which Sabrina models this part is offered for. Defaults to all of them —
   * narrow it here (e.g. `fitsModels: ['סברינה מיני']`) for a part that only
   * fits one, and the card will offer just that option.
   */
  fitsModels?: SabrinaModel[];
  compatibility: string[];
  variants: VariantGroup[];
  highlights: string[];
  specs: SpecRow[];
  /** Image paths, already prefixed for the current deployment (see asset()). */
  images: string[];
  /**
   * Optional clip of the product in use, shown under the gallery. Both formats
   * are needed — Safari plays the MP4, Chrome and Firefox take the smaller
   * WebM — and the paths are prefixed by the component, not here.
   */
  video?: { webm: string; mp4: string; poster: string };
  inStock: boolean;
  featured: boolean;
  /** Unpublished products never reach the public site — the admin list shows them, storefront queries never do. */
  published: boolean;
}

export const categories: Category[] = [
  {
    id: 'handles',
    name: 'ידיות שאיבה',
    blurb: 'ידיות בגוף שקוף עם זרימת אוויר מיטבית וסגירה אטומה.',
  },
  {
    id: 'hoses',
    name: 'צינורות',
    blurb: 'צינורות שאיבה ולחץ מחוזקים, גמישים גם בעבודה ממושכת.',
  },
  {
    id: 'adapters',
    name: 'מתאמים',
    blurb: 'מתאמים וחיבורים מהירים בין המכונה לאביזרים.',
  },
  {
    id: 'courses',
    name: 'קורסים',
    blurb: 'קורסים מקצועיים אונליין להסרת כתמים וטיפול בריפודים.',
  },
];

export const categoryName = (id: CategoryId): string =>
  categories.find((c) => c.id === id)?.name ?? '';

export const formatPrice = (price: number): string => `₪${price.toLocaleString('he-IL')}`;

/** Row shape as it comes back from the `products` table. */
interface ProductRow {
  id: string;
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: CategoryId;
  price: number | null;
  sale_price: number | null;
  badge: string | null;
  fits_models: string[] | null;
  compatibility: string[] | null;
  variants: VariantGroup[] | null;
  highlights: string[] | null;
  specs: SpecRow[] | null;
  images: string[] | null;
  video: { webm: string; mp4: string; poster: string } | null;
  in_stock: boolean;
  featured: boolean;
  published: boolean;
}

/**
 * Images are stored base-relative ("/products/slug/1.webp") so the same row
 * works whether the site sits on a GitHub Pages sub-path or a bare domain —
 * asset() applies whichever prefix this deployment needs. `video` is kept
 * unprefixed on purpose: the gallery and hero components already call
 * asset() on it themselves, same as when this data was hardcoded.
 */
function mapRow(row: ProductRow): Product {
  return {
    id: row.id,
    slug: row.slug,
    name: row.name,
    tagline: row.tagline,
    description: row.description,
    category: row.category,
    price: row.price ?? undefined,
    salePrice: row.sale_price ?? undefined,
    badge: row.badge ?? undefined,
    fitsModels: (row.fits_models ?? undefined) as SabrinaModel[] | undefined,
    compatibility: row.compatibility ?? [],
    variants: row.variants ?? [],
    highlights: row.highlights ?? [],
    specs: row.specs ?? [],
    images: (row.images ?? []).map((path) => asset(path)),
    video: row.video ?? undefined,
    inStock: row.in_stock,
    featured: row.featured,
    published: row.published,
  };
}

const SELECT_COLUMNS =
  'id, slug, name, tagline, description, category, price, sale_price, badge, fits_models, compatibility, variants, highlights, specs, images, video, in_stock, featured, published';

/** Used by the public storefront — RLS only ever returns published rows here. */
export async function fetchPublishedProducts(): Promise<Product[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('products')
    .select(SELECT_COLUMNS)
    .eq('published', true)
    .order('sort_order', { ascending: true });
  if (error || !data) return [];
  return (data as unknown as ProductRow[]).map(mapRow);
}

/** Used by the public storefront for a single product page. */
export async function fetchProductBySlug(slug: string): Promise<Product | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('products')
    .select(SELECT_COLUMNS)
    .eq('slug', slug)
    .eq('published', true)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as unknown as ProductRow);
}

/**
 * Used by the admin panel — returns every row regardless of published state.
 * Relies on RLS: this only succeeds for a signed-in admin session, and an
 * unauthenticated caller gets an empty (or error) result rather than data.
 */
export async function fetchAllProductsAdmin(): Promise<Product[]> {
  if (!supabase) return [];
  const { data, error } = await supabase
    .from('products')
    .select(SELECT_COLUMNS)
    .order('sort_order', { ascending: true });
  if (error || !data) return [];
  return (data as unknown as ProductRow[]).map(mapRow);
}

export async function fetchProductByIdAdmin(id: string): Promise<Product | null> {
  if (!supabase) return null;
  const { data, error } = await supabase
    .from('products')
    .select(SELECT_COLUMNS)
    .eq('id', id)
    .maybeSingle();
  if (error || !data) return null;
  return mapRow(data as unknown as ProductRow);
}
