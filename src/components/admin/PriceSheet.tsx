'use client';

import { useState } from 'react';
import { CloseIcon, SpinnerIcon } from '@/components/icons';
import { setPrice } from '@/lib/adminProducts';
import type { Product } from '@/lib/products';

export function PriceSheet({
  product,
  onClose,
  onSaved,
}: {
  product: Product;
  onClose: () => void;
  onSaved: (price?: number, salePrice?: number) => void;
}) {
  const [price, setPriceValue] = useState(product.price?.toString() ?? '');
  const [salePrice, setSalePriceValue] = useState(product.salePrice?.toString() ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function save() {
    setSaving(true);
    setError(null);
    const priceNum = price.trim() === '' ? undefined : Number(price);
    const saleNum = salePrice.trim() === '' ? undefined : Number(salePrice);
    if ((priceNum !== undefined && Number.isNaN(priceNum)) || (saleNum !== undefined && Number.isNaN(saleNum))) {
      setError('יש להזין מספר תקין.');
      setSaving(false);
      return;
    }
    try {
      await setPrice(product.id!, priceNum, saleNum);
      onSaved(priceNum, saleNum);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'השמירה נכשלה.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-70 flex items-end justify-center bg-black/40 backdrop-blur-sm sm:items-center sm:p-6">
      <button type="button" aria-label="סגירה" className="absolute inset-0" onClick={onClose} />
      <div
        role="dialog"
        aria-modal="true"
        aria-label={`עדכון מחיר — ${product.name}`}
        className="relative w-full max-w-sm rounded-t-card border border-ink-700 bg-ink-850 p-5 shadow-2xl sm:rounded-card"
      >
        <div className="flex items-center justify-between">
          <h2 className="text-base font-extrabold">{product.name}</h2>
          <button type="button" onClick={onClose} aria-label="סגירה" className="grid h-9 w-9 place-items-center rounded-lg text-mist-300">
            <CloseIcon className="h-5 w-5" />
          </button>
        </div>

        <div className="mt-4 space-y-3">
          <div>
            <label htmlFor="price" className="mb-1.5 block text-sm font-bold">
              מחיר (₪)
            </label>
            <input
              id="price"
              type="number"
              inputMode="decimal"
              value={price}
              onChange={(e) => setPriceValue(e.target.value)}
              placeholder="ריק = מחיר בוואטסאפ"
              className="w-full rounded-xl border border-ink-600 bg-ink-950 px-4 py-3.5 text-base outline-none focus:border-brand-500"
            />
          </div>
          <div>
            <label htmlFor="salePrice" className="mb-1.5 block text-sm font-bold">
              מחיר מבצע (אופציונלי)
            </label>
            <input
              id="salePrice"
              type="number"
              inputMode="decimal"
              value={salePrice}
              onChange={(e) => setSalePriceValue(e.target.value)}
              className="w-full rounded-xl border border-ink-600 bg-ink-950 px-4 py-3.5 text-base outline-none focus:border-brand-500"
            />
          </div>
          {error ? <p className="text-sm font-semibold text-red-600">{error}</p> : null}
        </div>

        <button
          type="button"
          onClick={save}
          disabled={saving}
          className="mt-5 flex w-full items-center justify-center gap-2 rounded-full bg-brand-500 px-6 py-3.5 text-base font-bold text-on-brand transition-colors hover:bg-brand-400 disabled:opacity-60"
        >
          {saving ? <SpinnerIcon className="h-5 w-5 animate-spin" /> : null}
          שמירה
        </button>
      </div>
    </div>
  );
}
