'use client';

import { useRouter } from 'next/navigation';
import { useState } from 'react';
import { ImageUploader } from '@/components/admin/ImageUploader';
import { PlusIcon, SpinnerIcon, TrashIcon } from '@/components/icons';
import { createProduct, generateSlug, updateProduct, type ProductInput } from '@/lib/adminProducts';
import { categories, sabrinaModels, type CategoryId, type Product, type SabrinaModel, type SpecRow, type VariantGroup } from '@/lib/products';

function toBaseRelative(src: string): string {
  const basePath = process.env.NEXT_PUBLIC_BASE_PATH ?? '';
  if (/^https?:\/\//.test(src)) return src;
  return basePath && src.startsWith(basePath) ? src.slice(basePath.length) : src;
}

function inputFromProduct(product: Product | null, freshSlug: string): ProductInput {
  if (!product) {
    return {
      slug: freshSlug,
      name: '',
      tagline: '',
      description: '',
      category: 'handles',
      compatibility: [],
      variants: [],
      highlights: [],
      specs: [],
      images: [],
      inStock: true,
      featured: false,
      published: false,
    };
  }
  return {
    slug: product.slug,
    name: product.name,
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
    images: product.images.map(toBaseRelative),
    inStock: product.inStock,
    featured: product.featured,
    published: product.published,
  };
}

export function ProductForm({ product }: { product: Product | null }) {
  const router = useRouter();
  const [slug] = useState(() => (product === null ? generateSlug('handles') : product.slug));
  const [form, setForm] = useState<ProductInput>(() => inputFromProduct(product, slug));
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function set<K extends keyof ProductInput>(key: K, value: ProductInput[K]) {
    setForm((f) => ({ ...f, [key]: value }));
  }

  async function onSubmit(event: React.FormEvent) {
    event.preventDefault();
    if (!form.name.trim()) {
      setError('שם המוצר הוא שדה חובה.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      if (product?.id) {
        await updateProduct(product.id, form);
      } else {
        await createProduct(form);
      }
      router.push('/admin/products');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה.');
      setSaving(false);
    }
  }

  return (
    <form onSubmit={onSubmit} className="space-y-5 pb-6">
      <Field label="שם המוצר" required>
        <input
          value={form.name}
          onChange={(e) => set('name', e.target.value)}
          required
          className={inputClass}
        />
      </Field>

      <Field label="תיאור קצר לכרטיס המוצר">
        <input value={form.tagline} onChange={(e) => set('tagline', e.target.value)} className={inputClass} />
      </Field>

      <Field label="תיאור מלא">
        <textarea
          value={form.description}
          onChange={(e) => set('description', e.target.value)}
          rows={5}
          className={`${inputClass} resize-y`}
        />
      </Field>

      <Field label="קטגוריה">
        <select
          value={form.category}
          onChange={(e) => set('category', e.target.value as CategoryId)}
          className={inputClass}
        >
          {categories.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
      </Field>

      <div className="grid grid-cols-2 gap-3">
        <Field label="מחיר (₪)">
          <input
            type="number"
            inputMode="decimal"
            value={form.price ?? ''}
            onChange={(e) => set('price', e.target.value === '' ? undefined : Number(e.target.value))}
            placeholder="ריק = בוואטסאפ"
            className={inputClass}
          />
        </Field>
        <Field label="מחיר מבצע (₪)">
          <input
            type="number"
            inputMode="decimal"
            value={form.salePrice ?? ''}
            onChange={(e) => set('salePrice', e.target.value === '' ? undefined : Number(e.target.value))}
            className={inputClass}
          />
        </Field>
      </div>

      <Field label="תג (אופציונלי, למשל 'חדש' או 'הנמכר ביותר')">
        <input value={form.badge ?? ''} onChange={(e) => set('badge', e.target.value)} className={inputClass} />
      </Field>

      <Field label="מתאים לדגמים (ריק = הכל)">
        <div className="flex flex-wrap gap-2">
          {sabrinaModels.map((model) => {
            const checked = form.fitsModels?.includes(model) ?? false;
            return (
              <label
                key={model}
                className="flex cursor-pointer items-center gap-2 rounded-full border border-ink-600 px-3.5 py-2 text-sm font-semibold has-[:checked]:border-brand-500 has-[:checked]:bg-brand-500/10 has-[:checked]:text-brand-700"
              >
                <input
                  type="checkbox"
                  checked={checked}
                  onChange={(e) => {
                    const current = new Set(form.fitsModels ?? []);
                    if (e.target.checked) current.add(model);
                    else current.delete(model);
                    set('fitsModels', current.size === 0 ? undefined : (Array.from(current) as SabrinaModel[]));
                  }}
                  className="sr-only"
                />
                {model}
              </label>
            );
          })}
        </div>
      </Field>

      <div className="grid grid-cols-3 gap-2">
        <ToggleField label="במלאי" checked={form.inStock} onChange={(v) => set('inStock', v)} />
        <ToggleField label="מומלץ" checked={form.featured} onChange={(v) => set('featured', v)} />
        <ToggleField label="מפורסם" checked={form.published} onChange={(v) => set('published', v)} />
      </div>

      <Field label="תמונות">
        <ImageUploader slug={slug} images={form.images} onChange={(images) => set('images', images)} />
      </Field>

      <StringListField label="יתרונות" items={form.highlights} onChange={(v) => set('highlights', v)} />
      <StringListField label="התאמה למכונות" items={form.compatibility} onChange={(v) => set('compatibility', v)} />
      <SpecsField specs={form.specs} onChange={(v) => set('specs', v)} />
      <VariantsField variants={form.variants} onChange={(v) => set('variants', v)} />

      {error ? (
        <p role="alert" className="rounded-xl bg-red-600/10 px-3 py-2.5 text-sm font-semibold text-red-600">
          {error}
        </p>
      ) : null}

      <button
        type="submit"
        disabled={saving}
        className="flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3.5 text-base font-bold text-on-brand transition-colors hover:bg-brand-400 disabled:opacity-60"
      >
        {saving ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : null}
        {product ? 'שמירת שינויים' : 'פרסום מוצר'}
      </button>
    </form>
  );
}

const inputClass =
  'w-full rounded-xl border border-ink-600 bg-ink-850 px-4 py-3.5 text-base outline-none transition-colors focus:border-brand-500';

function Field({ label, required, children }: { label: string; required?: boolean; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1.5 block text-sm font-bold">
        {label}
        {required ? <span className="text-red-600"> *</span> : null}
      </label>
      {children}
    </div>
  );
}

function ToggleField({ label, checked, onChange }: { label: string; checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`rounded-xl border px-3 py-3 text-center text-xs font-bold transition-colors ${
        checked ? 'border-brand-500 bg-brand-500/10 text-brand-700' : 'border-ink-600 text-mist-500'
      }`}
    >
      {label}
    </button>
  );
}

function StringListField({
  label,
  items,
  onChange,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
}) {
  return (
    <Field label={label}>
      <div className="space-y-2">
        {items.map((item, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={item}
              onChange={(e) => {
                const next = [...items];
                next[index] = e.target.value;
                onChange(next);
              }}
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => onChange(items.filter((_, i) => i !== index))}
              aria-label="מחיקת שורה"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-ink-600 text-mist-500"
            >
              <TrashIcon className="h-4.5 w-4.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...items, ''])}
          className="flex items-center gap-1.5 text-sm font-bold text-brand-700"
        >
          <PlusIcon className="h-4 w-4" />
          הוספת שורה
        </button>
      </div>
    </Field>
  );
}

function SpecsField({ specs, onChange }: { specs: SpecRow[]; onChange: (specs: SpecRow[]) => void }) {
  return (
    <Field label="מפרט טכני">
      <div className="space-y-2">
        {specs.map((spec, index) => (
          <div key={index} className="flex gap-2">
            <input
              value={spec.label}
              onChange={(e) => {
                const next = [...specs];
                next[index] = { ...next[index], label: e.target.value };
                onChange(next);
              }}
              placeholder="שם השדה"
              className={inputClass}
            />
            <input
              value={spec.value}
              onChange={(e) => {
                const next = [...specs];
                next[index] = { ...next[index], value: e.target.value };
                onChange(next);
              }}
              placeholder="ערך"
              className={inputClass}
            />
            <button
              type="button"
              onClick={() => onChange(specs.filter((_, i) => i !== index))}
              aria-label="מחיקת שורה"
              className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-ink-600 text-mist-500"
            >
              <TrashIcon className="h-4.5 w-4.5" />
            </button>
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...specs, { label: '', value: '' }])}
          className="flex items-center gap-1.5 text-sm font-bold text-brand-700"
        >
          <PlusIcon className="h-4 w-4" />
          הוספת שורה
        </button>
      </div>
    </Field>
  );
}

function VariantsField({ variants, onChange }: { variants: VariantGroup[]; onChange: (variants: VariantGroup[]) => void }) {
  return (
    <Field label="אפשרויות בחירה (למשל: צבע — שחור, ירוק)">
      <div className="space-y-3">
        {variants.map((group, index) => (
          <div key={index} className="space-y-2 rounded-xl border border-ink-700 p-3">
            <div className="flex gap-2">
              <input
                value={group.label}
                onChange={(e) => {
                  const next = [...variants];
                  next[index] = { ...next[index], label: e.target.value, id: e.target.value };
                  onChange(next);
                }}
                placeholder="שם הבחירה (למשל: צבע)"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() => onChange(variants.filter((_, i) => i !== index))}
                aria-label="מחיקת קבוצה"
                className="grid h-12 w-12 shrink-0 place-items-center rounded-xl border border-ink-600 text-mist-500"
              >
                <TrashIcon className="h-4.5 w-4.5" />
              </button>
            </div>
            <input
              value={group.options.join(', ')}
              onChange={(e) => {
                const next = [...variants];
                next[index] = {
                  ...next[index],
                  options: e.target.value.split(',').map((s) => s.trim()).filter(Boolean),
                };
                onChange(next);
              }}
              placeholder="אפשרויות מופרדות בפסיק"
              className={inputClass}
            />
          </div>
        ))}
        <button
          type="button"
          onClick={() => onChange([...variants, { id: '', label: '', options: [] }])}
          className="flex items-center gap-1.5 text-sm font-bold text-brand-700"
        >
          <PlusIcon className="h-4 w-4" />
          הוספת קבוצת בחירה
        </button>
      </div>
    </Field>
  );
}
