'use client';

import Image from 'next/image';
import Link from 'next/link';
import { useEffect, useMemo, useState } from 'react';
import { AdminShell } from '@/components/admin/AdminShell';
import { PriceSheet } from '@/components/admin/PriceSheet';
import {
  BoxIcon,
  CopyIcon,
  EyeIcon,
  EyeOffIcon,
  PencilIcon,
  PlusIcon,
  SearchIcon,
  SpinnerIcon,
  StarIcon,
  TagIcon,
  TrashIcon,
} from '@/components/icons';
import { deleteProduct, duplicateProduct, setInStock, setPublished } from '@/lib/adminProducts';
import { categories, fetchAllProductsAdmin, formatPrice, type CategoryId, type Product } from '@/lib/products';

type CategoryFilter = CategoryId | 'all';
type StockFilter = 'all' | 'in' | 'out';
type PublishFilter = 'all' | 'published' | 'hidden';

export default function AdminProductsPage() {
  const [products, setProducts] = useState<Product[] | null>(null);
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState<CategoryFilter>('all');
  const [stock, setStock] = useState<StockFilter>('all');
  const [publish, setPublish] = useState<PublishFilter>('all');
  const [priceTarget, setPriceTarget] = useState<Product | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  async function reload() {
    setProducts(await fetchAllProductsAdmin());
  }

  useEffect(() => {
    reload();
  }, []);

  const visible = useMemo(() => {
    if (!products) return [];
    const term = search.trim().toLowerCase();
    return products.filter((p) => {
      if (term && !p.name.toLowerCase().includes(term) && !p.slug.toLowerCase().includes(term)) return false;
      if (category !== 'all' && p.category !== category) return false;
      if (stock === 'in' && !p.inStock) return false;
      if (stock === 'out' && p.inStock) return false;
      if (publish === 'published' && !p.published) return false;
      if (publish === 'hidden' && p.published) return false;
      return true;
    });
  }, [products, search, category, stock, publish]);

  async function withBusy(id: string, action: () => Promise<void>) {
    setBusyId(id);
    try {
      await action();
      await reload();
    } catch (err) {
      alert(err instanceof Error ? err.message : 'הפעולה נכשלה.');
    } finally {
      setBusyId(null);
    }
  }

  return (
    <AdminShell title="מוצרים">
      <Link
        href="/admin/products/new"
        className="flex items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3.5 text-base font-bold text-on-brand transition-colors hover:bg-brand-400"
      >
        <PlusIcon className="h-5 w-5" />
        הוספת מוצר חדש
      </Link>

      <div className="relative mt-5">
        <SearchIcon className="pointer-events-none absolute top-1/2 start-3.5 h-4.5 w-4.5 -translate-y-1/2 text-mist-500" />
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="חיפוש מוצר..."
          className="w-full rounded-full border border-ink-600 bg-ink-850 py-3 ps-10 pe-4 text-sm outline-none focus:border-brand-500"
        />
      </div>

      <div className="mt-3 flex flex-wrap gap-2">
        <FilterChip active={category === 'all'} onClick={() => setCategory('all')}>
          כל הקטגוריות
        </FilterChip>
        {categories.map((c) => (
          <FilterChip key={c.id} active={category === c.id} onClick={() => setCategory(c.id)}>
            {c.name}
          </FilterChip>
        ))}
      </div>

      <div className="mt-2 flex flex-wrap gap-2">
        <FilterChip active={stock === 'all'} onClick={() => setStock('all')}>
          כל המלאי
        </FilterChip>
        <FilterChip active={stock === 'in'} onClick={() => setStock('in')}>
          במלאי
        </FilterChip>
        <FilterChip active={stock === 'out'} onClick={() => setStock('out')}>
          אזל
        </FilterChip>
        <FilterChip active={publish === 'published'} onClick={() => setPublish(publish === 'published' ? 'all' : 'published')}>
          מפורסם
        </FilterChip>
        <FilterChip active={publish === 'hidden'} onClick={() => setPublish(publish === 'hidden' ? 'all' : 'hidden')}>
          מוסתר
        </FilterChip>
      </div>

      {products === null ? (
        <div className="mt-10 grid place-items-center">
          <SpinnerIcon className="h-7 w-7 animate-spin text-brand-500" />
        </div>
      ) : visible.length === 0 ? (
        <p className="mt-10 text-center text-sm text-mist-500">לא נמצאו מוצרים תואמים.</p>
      ) : (
        <ul className="mt-5 space-y-3">
          {visible.map((product) => (
            <li key={product.id} className="rounded-card border border-ink-700 surface p-3">
              <div className="flex items-start gap-3">
                <div className="h-16 w-16 shrink-0 overflow-hidden rounded-xl border border-ink-700 bg-ink-950">
                  {product.images[0] ? (
                    <Image src={product.images[0]} alt="" width={64} height={64} className="h-full w-full object-cover" />
                  ) : null}
                </div>

                <div className="min-w-0 flex-1">
                  <p className="truncate text-sm font-extrabold">{product.name}</p>
                  <p className="mt-0.5 text-xs text-mist-500">
                    {categories.find((c) => c.id === product.category)?.name}
                  </p>
                  <p className="mt-1 text-sm font-bold">
                    {product.price !== undefined ? formatPrice(product.price) : 'ללא מחיר'}
                    {product.salePrice !== undefined ? (
                      <span className="ms-1.5 text-xs font-semibold text-brand-700">מבצע {formatPrice(product.salePrice)}</span>
                    ) : null}
                  </p>
                  <div className="mt-1.5 flex flex-wrap gap-1.5">
                    <Pill tone={product.published ? 'brand' : 'muted'}>{product.published ? 'מפורסם' : 'מוסתר'}</Pill>
                    <Pill tone={product.inStock ? 'brand' : 'warn'}>{product.inStock ? 'במלאי' : 'אזל'}</Pill>
                    {product.featured ? <Pill tone="star">מומלץ</Pill> : null}
                  </div>
                </div>
              </div>

              <div className="mt-3 grid grid-cols-6 gap-1.5 border-t border-ink-700 pt-3">
                <ActionButton label="עריכה" href={`/admin/products/edit?id=${product.id}`}>
                  <PencilIcon className="h-5 w-5" />
                </ActionButton>
                <ActionButton label="מחיר" onClick={() => setPriceTarget(product)}>
                  <TagIcon className="h-5 w-5" />
                </ActionButton>
                <ActionButton
                  label="מלאי"
                  busy={busyId === product.id}
                  onClick={() => withBusy(product.id!, () => setInStock(product.id!, !product.inStock))}
                >
                  <BoxIcon className="h-5 w-5" />
                </ActionButton>
                <ActionButton
                  label={product.published ? 'הסתרה' : 'פרסום'}
                  busy={busyId === product.id}
                  onClick={() => withBusy(product.id!, () => setPublished(product.id!, !product.published))}
                >
                  {product.published ? <EyeOffIcon className="h-5 w-5" /> : <EyeIcon className="h-5 w-5" />}
                </ActionButton>
                <ActionButton
                  label="שכפול"
                  busy={busyId === product.id}
                  onClick={() => withBusy(product.id!, () => duplicateProduct(product).then(() => {}))}
                >
                  <CopyIcon className="h-5 w-5" />
                </ActionButton>
                <ActionButton
                  label="מחיקה"
                  danger
                  busy={busyId === product.id}
                  onClick={() => {
                    if (!confirm(`למחוק את "${product.name}"? הפעולה לא ניתנת לביטול.`)) return;
                    withBusy(product.id!, () => deleteProduct(product.id!));
                  }}
                >
                  <TrashIcon className="h-5 w-5" />
                </ActionButton>
              </div>
            </li>
          ))}
        </ul>
      )}

      {priceTarget ? (
        <PriceSheet
          product={priceTarget}
          onClose={() => setPriceTarget(null)}
          onSaved={() => {
            setPriceTarget(null);
            reload();
          }}
        />
      ) : null}
    </AdminShell>
  );
}

function FilterChip({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`rounded-full border px-3.5 py-1.5 text-xs font-bold transition-colors ${
        active ? 'border-brand-500 bg-brand-500 text-on-brand' : 'border-ink-600 text-mist-300'
      }`}
    >
      {children}
    </button>
  );
}

function Pill({ tone, children }: { tone: 'brand' | 'muted' | 'warn' | 'star'; children: React.ReactNode }) {
  const styles = {
    brand: 'bg-brand-500/10 text-brand-700',
    muted: 'bg-mist-500/10 text-mist-500',
    warn: 'bg-amber-500/15 text-amber-700',
    star: 'bg-amber-400/15 text-amber-600',
  } as const;
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[10px] font-bold ${styles[tone]}`}>
      {tone === 'star' ? <StarIcon className="h-2.5 w-2.5" /> : null}
      {children}
    </span>
  );
}

function ActionButton({
  label,
  href,
  onClick,
  danger = false,
  busy = false,
  children,
}: {
  label: string;
  href?: string;
  onClick?: () => void;
  danger?: boolean;
  busy?: boolean;
  children: React.ReactNode;
}) {
  const classes = `flex flex-col items-center gap-1 rounded-xl py-2 text-[10px] font-semibold transition-colors ${
    danger ? 'text-red-600' : 'text-mist-300 hover:text-brand-700'
  }`;

  const content = busy ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : children;

  if (href) {
    return (
      <Link href={href} className={classes} aria-label={label}>
        {content}
        <span>{label}</span>
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} disabled={busy} className={classes} aria-label={label}>
      {content}
      <span>{label}</span>
    </button>
  );
}
