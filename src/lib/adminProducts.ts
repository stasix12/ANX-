import { supabase } from '@/lib/supabase';
import type { CategoryId, Product, SabrinaModel, SpecRow, VariantGroup } from '@/lib/products';

function requireSupabase() {
  if (!supabase) {
    throw new Error(
      'Supabase לא מוגדר — חסרים משתני הסביבה NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY.',
    );
  }
  return supabase;
}

/** What the admin form edits — everything except server-assigned fields. */
export interface ProductInput {
  slug: string;
  name: string;
  tagline: string;
  description: string;
  category: CategoryId;
  price?: number;
  salePrice?: number;
  badge?: string;
  fitsModels?: SabrinaModel[];
  compatibility: string[];
  variants: VariantGroup[];
  highlights: string[];
  specs: SpecRow[];
  /** Base-relative paths (no basePath prefix) — how they are stored in the DB. */
  images: string[];
  inStock: boolean;
  featured: boolean;
  published: boolean;
}

function toRow(input: ProductInput) {
  return {
    slug: input.slug,
    name: input.name,
    tagline: input.tagline,
    description: input.description,
    category: input.category,
    price: input.price ?? null,
    sale_price: input.salePrice ?? null,
    badge: input.badge || null,
    fits_models: input.fitsModels ?? [],
    compatibility: input.compatibility,
    variants: input.variants,
    highlights: input.highlights,
    specs: input.specs,
    images: input.images,
    in_stock: input.inStock,
    featured: input.featured,
    published: input.published,
  };
}

/** Six random hex bytes — collision odds are low enough that the slug UNIQUE
 *  constraint catching the rare clash (surfaced as a normal save error) is
 *  simpler and safer than a pre-check race. */
export function generateSlug(category: CategoryId): string {
  const bytes = new Uint8Array(6);
  crypto.getRandomValues(bytes);
  const hex = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  return `${category}-${hex}`;
}

export async function createProduct(input: ProductInput): Promise<Product> {
  const client = requireSupabase();
  const { data, error } = await client.from('products').insert(toRow(input)).select().single();
  if (error || !data) throw new Error(error?.message ?? 'שמירת המוצר נכשלה');
  return data as unknown as Product;
}

export async function updateProduct(id: string, input: ProductInput): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('products').update(toRow(input)).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function deleteProduct(id: string): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('products').delete().eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setPublished(id: string, published: boolean): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('products').update({ published }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setInStock(id: string, inStock: boolean): Promise<void> {
  const client = requireSupabase();
  const { error } = await client.from('products').update({ in_stock: inStock }).eq('id', id);
  if (error) throw new Error(error.message);
}

export async function setPrice(id: string, price?: number, salePrice?: number): Promise<void> {
  const client = requireSupabase();
  const { error } = await client
    .from('products')
    .update({ price: price ?? null, sale_price: salePrice ?? null })
    .eq('id', id);
  if (error) throw new Error(error.message);
}

/** Copies a product as an unpublished draft — safer default than cloning it live. */
export async function duplicateProduct(product: Product): Promise<Product> {
  const input: ProductInput = {
    slug: generateSlug(product.category),
    name: `${product.name} (עותק)`,
    tagline: product.tagline,
    description: product.description,
    category: product.category,
    price: product.price,
    salePrice: product.salePrice,
    badge: product.badge,
    fitsModels: product.fitsModels,
    compatibility: product.compatibility,
    variants: product.variants,
    highlights: product.highlights,
    specs: product.specs,
    // Stored images are already asset()-prefixed for reading; strip that
    // back off so the copy is written in the same base-relative form.
    images: product.images.map((src) => stripBasePath(src)),
    inStock: product.inStock,
    featured: product.featured,
    published: false,
  };
  return createProduct(input);
}

function stripBasePath(src: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  return basePath && src.startsWith(basePath) ? src.slice(basePath.length) : src;
}

/**
 * Resizes an image client-side (max 1600px on the long edge) and re-encodes
 * it as WebP before upload — keeps a multi-photo iPhone upload from shipping
 * full-resolution originals to storage and to every visitor's phone after.
 */
async function compressImage(file: File): Promise<Blob> {
  const bitmap = await createImageBitmap(file);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.round(bitmap.width * scale);
  const height = Math.round(bitmap.height * scale);

  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new Error('כשל בעיבוד התמונה');
  ctx.drawImage(bitmap, 0, 0, width, height);

  const blob = await new Promise<Blob | null>((resolve) =>
    canvas.toBlob(resolve, 'image/webp', 0.82),
  );
  return blob ?? file;
}

/** Uploads one photo to the product-images bucket and returns its base-relative path. */
export async function uploadProductImage(slug: string, file: File): Promise<string> {
  const client = requireSupabase();
  const compressed = await compressImage(file);
  const id = crypto.randomUUID();
  const path = `${slug}/${id}.webp`;

  const { error } = await client.storage.from('product-images').upload(path, compressed, {
    contentType: 'image/webp',
    upsert: false,
  });
  if (error) throw new Error(error.message);

  const { data } = client.storage.from('product-images').getPublicUrl(path);
  return data.publicUrl;
}

export async function deleteProductImage(publicUrl: string): Promise<void> {
  const client = requireSupabase();
  const marker = '/product-images/';
  const index = publicUrl.indexOf(marker);
  if (index === -1) return;
  const path = publicUrl.slice(index + marker.length);
  await client.storage.from('product-images').remove([path]);
}
