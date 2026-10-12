'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState } from 'react';
import { cardImage, ils } from '@/lib/shop/logic';
import { COLOR_LIST } from '@/lib/shop/seed';
import { actions, newProductDraft, ORDER_STATUS_LABEL, useCurrentUser, useShop } from '@/lib/shop/store';
import type { Category, CategoryIcon, ColorOption, Coupon, OrderStatus, Product, ShippingMethod } from '@/lib/shop/types';
import { CategoryGlyph, IconEdit, IconTrash, IconUpload } from '../icons';
import { Logo } from '../Logo';
import { btn, Img, inputCls, Swatch, toast } from '../ui';

/**
 * /shop/admin — catalogue management without code changes: products,
 * photos, prices, stock, colors, categories, orders, shipping, coupons.
 * Demo backend: changes are stored in this browser (see src/lib/shop/store.ts).
 */

type Tab = 'products' | 'categories' | 'orders' | 'settings';

/** Downscales an uploaded photo to ≤1200px WebP so it fits in storage. */
async function fileToDataUrl(file: File, max = 1200): Promise<string> {
  const bmp = await createImageBitmap(file);
  const scale = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const canvas = document.createElement('canvas');
  canvas.width = Math.round(bmp.width * scale);
  canvas.height = Math.round(bmp.height * scale);
  canvas.getContext('2d')!.drawImage(bmp, 0, 0, canvas.width, canvas.height);
  return canvas.toDataURL('image/webp', 0.85);
}

function ImagesField({ images, onChange, label = 'תמונות' }: { images: string[]; onChange: (v: string[]) => void; label?: string }) {
  const [url, setUrl] = useState('');
  const [busy, setBusy] = useState(false);
  return (
    <div>
      <p className="mb-2 text-[13px] font-bold">{label}</p>
      <div className="flex flex-wrap gap-2">
        {images.map((src, i) => (
          <div key={src.slice(0, 64) + i} className="relative size-20 overflow-hidden rounded-xl ring-1 ring-x-line">
            <Img path={src} alt="" className="size-full object-cover" />
            {i === 0 && <span className="absolute bottom-0 inset-x-0 bg-x-blue text-center text-[10px] font-bold text-white">ראשית</span>}
            <div className="absolute top-0.5 left-0.5 flex gap-0.5">
              {i > 0 && (
                <button type="button" aria-label="הזזה קדימה" onClick={() => onChange([images[i], ...images.filter((_, j) => j !== i)])} className="grid size-5 place-items-center rounded bg-white/90 text-[11px] font-bold">
                  ★
                </button>
              )}
              <button type="button" aria-label="הסרת תמונה" onClick={() => onChange(images.filter((_, j) => j !== i))} className="grid size-5 place-items-center rounded bg-white/90 text-x-red">
                ×
              </button>
            </div>
          </div>
        ))}
        <label className="grid size-20 cursor-pointer place-items-center rounded-xl border-2 border-dashed border-x-line text-x-muted hover:border-x-blue hover:text-x-blue">
          <span className="flex flex-col items-center text-[11px] font-semibold">
            <IconUpload size={20} />
            {busy ? 'מעלה…' : 'העלאה'}
          </span>
          <input
            type="file"
            accept="image/*"
            multiple
            className="sr-only"
            onChange={async (e) => {
              const files = [...(e.target.files ?? [])];
              e.target.value = '';
              setBusy(true);
              try {
                const urls = await Promise.all(files.map((f) => fileToDataUrl(f)));
                onChange([...images, ...urls]);
              } catch {
                toast('לא ניתן לקרוא את הקובץ');
              }
              setBusy(false);
            }}
          />
        </label>
      </div>
      <div className="mt-2 flex gap-2">
        <input value={url} onChange={(e) => setUrl(e.target.value)} placeholder="או כתובת תמונה (https://… או /shop/img/…)" dir="ltr" className={`${inputCls} h-10 text-right text-[13px]`} />
        <button
          type="button"
          onClick={() => {
            if (!url.trim()) return;
            onChange([...images, url.trim()]);
            setUrl('');
          }}
          className={`${btn.ghost} h-10 shrink-0 px-4 text-[13px]`}
        >
          הוספה
        </button>
      </div>
    </div>
  );
}

function ProductEditor({ initial, onDone }: { initial: Product; onDone: () => void }) {
  const s = useShop();
  const [p, setP] = useState<Product>(initial);
  const [err, setErr] = useState<string | null>(null);
  const set = <K extends keyof Product>(k: K, v: Product[K]) => setP((x) => ({ ...x, [k]: v }));
  const lbl = 'block text-[13px] font-bold';
  const toggleColor = (c: ColorOption) =>
    set('colors', p.colors.some((x) => x.id === c.id) ? p.colors.filter((x) => x.id !== c.id) : [...p.colors, { ...c }]);

  return (
    <form
      className="space-y-4"
      onSubmit={(e) => {
        e.preventDefault();
        const r = actions.upsertProduct({ ...p, name: p.name.trim(), slug: p.slug.trim() });
        if (!r.ok) return setErr(r.error);
        toast('המוצר נשמר');
        onDone();
      }}
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <label className={lbl}>
          שם המוצר
          <input value={p.name} onChange={(e) => set('name', e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className={lbl}>
          מזהה URL (באנגלית)
          <input
            value={p.slug}
            onChange={(e) => set('slug', e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            dir="ltr"
            placeholder="flex-dragon"
            className={`${inputCls} mt-1 text-right`}
          />
        </label>
      </div>
      <label className={lbl}>
        תיאור
        <textarea value={p.description} onChange={(e) => set('description', e.target.value)} rows={3} className={`${inputCls} mt-1 h-auto py-3`} />
      </label>
      <div className="grid gap-4 sm:grid-cols-4">
        <label className={lbl}>
          מחיר (₪)
          <input type="number" min={0} step="0.01" value={p.price} onChange={(e) => set('price', +e.target.value)} className={`${inputCls} mt-1`} />
        </label>
        <label className={lbl}>
          מחיר לפני הנחה
          <input
            type="number"
            min={0}
            value={p.compareAtPrice ?? ''}
            onChange={(e) => set('compareAtPrice', e.target.value ? +e.target.value : undefined)}
            className={`${inputCls} mt-1`}
          />
        </label>
        <label className={lbl}>
          מלאי
          <input
            type="number"
            min={0}
            value={p.stock ?? ''}
            disabled={p.stock === null}
            onChange={(e) => set('stock', Math.max(0, Math.floor(+e.target.value)))}
            className={`${inputCls} mt-1 disabled:bg-x-soft`}
          />
          <span className="mt-1 flex items-center gap-1.5 font-normal">
            <input type="checkbox" checked={p.stock === null} onChange={(e) => set('stock', e.target.checked ? null : 0)} className="accent-x-blue" />
            ללא הגבלה (הזמנה אישית / דיגיטלי)
          </span>
        </label>
        <label className={lbl}>
          חומר
          <input value={p.material} onChange={(e) => set('material', e.target.value)} className={`${inputCls} mt-1`} />
        </label>
      </div>

      <fieldset>
        <legend className={lbl}>קטגוריות (הראשונה היא הראשית)</legend>
        <div className="mt-2 flex flex-wrap gap-2">
          {s.db.categories.map((c) => {
            const on = p.categories.includes(c.slug);
            return (
              <button
                key={c.slug}
                type="button"
                aria-pressed={on}
                onClick={() => set('categories', on ? p.categories.filter((x) => x !== c.slug) : [...p.categories, c.slug])}
                className={`rounded-full px-3.5 py-2 text-[13px] font-semibold ${on ? 'bg-x-blue text-white' : 'bg-x-soft'}`}
              >
                {c.name}
              </button>
            );
          })}
        </div>
      </fieldset>

      <ImagesField images={p.images} onChange={(v) => set('images', v)} />

      <fieldset>
        <legend className={lbl}>צבעים זמינים</legend>
        <div dir="ltr" className="mt-2 flex flex-wrap gap-3">
          {COLOR_LIST.map((c) => (
            <Swatch key={c.id} color={c} size={38} selected={p.colors.some((x) => x.id === c.id)} onClick={() => toggleColor(c)} />
          ))}
        </div>
        {p.colors.map((c) => (
          <div key={c.id} className="mt-3 rounded-xl bg-x-soft-2 p-3 ring-1 ring-x-line">
            <ImagesField
              label={`תמונות לצבע ${c.name} (אופציונלי — מחליפות את הגלריה כשהצבע נבחר)`}
              images={c.images ?? []}
              onChange={(v) => set('colors', p.colors.map((x) => (x.id === c.id ? { ...x, images: v.length ? v : undefined } : x)))}
            />
          </div>
        ))}
      </fieldset>

      <div className="flex flex-wrap gap-5 text-[14px] font-semibold">
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={p.published} onChange={(e) => set('published', e.target.checked)} className="size-4 accent-x-blue" /> מוצג בחנות
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={p.featured} onChange={(e) => set('featured', e.target.checked)} className="size-4 accent-x-blue" /> מוצר נבחר (דף הבית)
        </label>
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={p.digital} onChange={(e) => set('digital', e.target.checked)} className="size-4 accent-x-blue" /> מוצר דיגיטלי (ללא משלוח)
        </label>
      </div>

      <details className="rounded-xl bg-x-soft-2 p-3 ring-1 ring-x-line">
        <summary className="cursor-pointer text-[13px] font-bold">מתקדם: סדר תצוגה, מילות חיפוש, דירוג</summary>
        <div className="mt-3 grid gap-4 sm:grid-cols-3">
          <label className={lbl}>
            סדר תצוגה
            <input type="number" value={p.sortOrder} onChange={(e) => set('sortOrder', +e.target.value)} className={`${inputCls} mt-1`} />
          </label>
          <label className={`${lbl} sm:col-span-2`}>
            מילות חיפוש (מופרדות בפסיק)
            <input value={p.tags.join(', ')} onChange={(e) => set('tags', e.target.value.split(',').map((t) => t.trim()).filter(Boolean))} className={`${inputCls} mt-1`} />
          </label>
          <label className={lbl}>
            דירוג ממוצע
            <input type="number" min={0} max={5} step={0.1} value={p.rating} onChange={(e) => set('rating', Math.min(5, Math.max(0, +e.target.value)))} className={`${inputCls} mt-1`} />
          </label>
          <label className={lbl}>
            מספר ביקורות
            <input type="number" min={0} value={p.reviewCount} onChange={(e) => set('reviewCount', Math.max(0, Math.floor(+e.target.value)))} className={`${inputCls} mt-1`} />
          </label>
          <p className="self-end text-[12px] text-x-muted">יש להזין רק דירוגים שהתקבלו בפועל מלקוחות.</p>
        </div>
      </details>

      {err && (
        <p role="alert" className="rounded-xl bg-[#fdeced] px-4 py-3 text-[14px] font-semibold text-x-red">
          {err}
        </p>
      )}
      <div className="flex gap-2">
        <button type="submit" className={`${btn.blue} h-12 flex-1`}>
          שמירה
        </button>
        <button type="button" onClick={onDone} className={`${btn.ghost} h-12 flex-1`}>
          ביטול
        </button>
      </div>
    </form>
  );
}

function ProductsTab() {
  const s = useShop();
  const [editing, setEditing] = useState<Product | null>(null);
  const [q, setQ] = useState('');
  const list = useMemo(
    () => [...s.db.products].sort((a, b) => a.sortOrder - b.sortOrder).filter((p) => !q || p.name.includes(q) || p.slug.includes(q.toLowerCase())),
    [s.db.products, q],
  );
  if (editing) return <ProductEditor initial={editing} onDone={() => setEditing(null)} />;
  return (
    <div>
      <div className="mb-4 flex gap-2">
        <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="חיפוש מוצר…" className={`${inputCls} h-11`} />
        <button type="button" onClick={() => setEditing(newProductDraft())} className={`${btn.blue} h-11 shrink-0 px-5`}>
          + מוצר חדש
        </button>
      </div>
      <ul className="divide-y divide-x-line rounded-2xl ring-1 ring-x-line">
        {list.map((p) => (
          <li key={p.id} className="flex items-center gap-3 p-3">
            <span className="size-14 shrink-0 overflow-hidden rounded-xl bg-x-soft">{p.images[0] && <Img path={cardImage(p)} alt="" className="size-full object-cover" />}</span>
            <span className="min-w-0 flex-1">
              <span className="block truncate font-bold">
                {p.name} {!p.published && <span className="text-[11px] font-semibold text-x-red">(מוסתר)</span>}
              </span>
              <span className="block text-[12px] text-x-muted">
                {ils(p.price)} · מלאי: {p.stock === null ? 'ללא הגבלה' : p.stock} · {p.colors.length} צבעים
              </span>
            </span>
            <label className="hidden items-center gap-1 text-[12px] sm:flex">
              מלאי
              <input
                type="number"
                min={0}
                value={p.stock ?? ''}
                disabled={p.stock === null}
                onChange={(e) => actions.upsertProduct({ ...p, stock: Math.max(0, Math.floor(+e.target.value)) })}
                className="h-9 w-16 rounded-lg border border-x-line px-2 disabled:bg-x-soft"
                aria-label={`מלאי ${p.name}`}
              />
            </label>
            <button type="button" aria-label={`עריכת ${p.name}`} onClick={() => setEditing(p)} className="grid size-9 place-items-center rounded-full hover:bg-x-soft">
              <IconEdit size={19} />
            </button>
            <button
              type="button"
              aria-label={`מחיקת ${p.name}`}
              onClick={() => confirm(`למחוק את "${p.name}"?`) && actions.deleteProduct(p.id)}
              className="grid size-9 place-items-center rounded-full text-x-muted hover:bg-[#fdeced] hover:text-x-red"
            >
              <IconTrash size={19} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const ICONS: CategoryIcon[] = ['figurine', 'decor', 'gaming', 'stand', 'tools', 'animals', 'parts', 'stl'];

function CategoriesTab() {
  const s = useShop();
  const [edit, setEdit] = useState<{ c: Category; prev?: string } | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const cats = [...s.db.categories].sort((a, b) => a.sortOrder - b.sortOrder);
  return (
    <div>
      {edit ? (
        <form
          className="space-y-3 rounded-2xl bg-x-soft-2 p-4 ring-1 ring-x-line"
          onSubmit={(e) => {
            e.preventDefault();
            const r = actions.upsertCategory(edit.c, edit.prev);
            if (!r.ok) return setErr(r.error);
            setEdit(null);
            setErr(null);
            toast('הקטגוריה נשמרה');
          }}
        >
          <div className="grid gap-3 sm:grid-cols-3">
            <input aria-label="שם" placeholder="שם הקטגוריה" value={edit.c.name} onChange={(e) => setEdit({ ...edit, c: { ...edit.c, name: e.target.value } })} className={inputCls} />
            <input aria-label="שם קצר" placeholder="שם קצר (לאייקונים)" value={edit.c.shortName} onChange={(e) => setEdit({ ...edit, c: { ...edit.c, shortName: e.target.value } })} className={inputCls} />
            <input
              aria-label="מזהה URL"
              placeholder="slug באנגלית"
              dir="ltr"
              value={edit.c.slug}
              onChange={(e) => setEdit({ ...edit, c: { ...edit.c, slug: e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-') } })}
              className={`${inputCls} text-right`}
            />
          </div>
          <div className="flex flex-wrap gap-2">
            {ICONS.map((ic) => (
              <button
                key={ic}
                type="button"
                aria-pressed={edit.c.icon === ic}
                onClick={() => setEdit({ ...edit, c: { ...edit.c, icon: ic } })}
                className={`grid size-11 place-items-center rounded-xl ${edit.c.icon === ic ? 'bg-x-blue text-white' : 'bg-white ring-1 ring-x-line'}`}
              >
                <CategoryGlyph icon={ic} size={22} />
              </button>
            ))}
          </div>
          <ImagesField label="תמונת רקע" images={edit.c.image ? [edit.c.image] : []} onChange={(v) => setEdit({ ...edit, c: { ...edit.c, image: v[v.length - 1] ?? '' } })} />
          <label className="block text-[13px] font-bold">
            סדר תצוגה
            <input type="number" value={edit.c.sortOrder} onChange={(e) => setEdit({ ...edit, c: { ...edit.c, sortOrder: +e.target.value } })} className={`${inputCls} mt-1 w-32`} />
          </label>
          {err && <p className="text-[13px] font-semibold text-x-red">{err}</p>}
          <div className="flex gap-2">
            <button type="submit" className={`${btn.blue} h-11 flex-1`}>
              שמירה
            </button>
            <button type="button" onClick={() => setEdit(null)} className={`${btn.ghost} h-11 flex-1`}>
              ביטול
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setEdit({ c: { slug: '', name: '', shortName: '', icon: 'figurine', image: '', sortOrder: cats.length + 1 } })}
          className={`${btn.blue} mb-4 h-11 px-5`}
        >
          + קטגוריה חדשה
        </button>
      )}
      <ul className="mt-4 grid gap-3 sm:grid-cols-2">
        {cats.map((c) => (
          <li key={c.slug} className="flex items-center gap-3 rounded-2xl p-3 ring-1 ring-x-line">
            <span className="size-14 overflow-hidden rounded-xl bg-x-soft">{c.image && <Img path={c.image} alt="" className="size-full object-cover" />}</span>
            <span className="flex-1">
              <span className="block font-bold">{c.name}</span>
              <span className="block text-[12px] text-x-muted">{s.db.products.filter((p) => p.categories.includes(c.slug)).length} מוצרים</span>
            </span>
            <button type="button" aria-label={`עריכת ${c.name}`} onClick={() => setEdit({ c: { ...c }, prev: c.slug })} className="grid size-9 place-items-center rounded-full hover:bg-x-soft">
              <IconEdit size={19} />
            </button>
            <button
              type="button"
              aria-label={`מחיקת ${c.name}`}
              onClick={() => {
                const r = actions.deleteCategory(c.slug);
                if (!r.ok) toast(r.error);
              }}
              className="grid size-9 place-items-center rounded-full text-x-muted hover:text-x-red"
            >
              <IconTrash size={19} />
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

const STATUSES: OrderStatus[] = ['pending_payment', 'paid', 'processing', 'shipped', 'delivered', 'cancelled'];

function OrdersTab() {
  const s = useShop();
  if (!s.db.orders.length) return <p className="text-x-muted">אין עדיין הזמנות.</p>;
  return (
    <ul className="space-y-3">
      {s.db.orders.map((o) => (
        <li key={o.id} className="rounded-2xl p-4 ring-1 ring-x-line">
          <div className="flex flex-wrap items-center gap-3">
            <span className="font-black" dir="ltr">
              #{o.number}
            </span>
            <span className="text-[13px] text-x-muted">{new Date(o.createdAt).toLocaleString('he-IL', { dateStyle: 'short', timeStyle: 'short' })}</span>
            <span className="text-[13px]">
              {o.customer.fullName} · <span dir="ltr">{o.customer.phone}</span> · {o.email}
            </span>
            <span className="ms-auto font-extrabold">{ils(o.total)}</span>
            <select
              value={o.status}
              onChange={(e) => actions.setOrderStatus(o.id, e.target.value as OrderStatus)}
              aria-label={`סטטוס הזמנה ${o.number}`}
              className="h-9 rounded-lg border border-x-line px-2 text-[13px]"
            >
              {STATUSES.map((st) => (
                <option key={st} value={st}>
                  {ORDER_STATUS_LABEL[st]}
                </option>
              ))}
            </select>
          </div>
          <p className="mt-2 text-[13px] text-x-muted">
            {o.lines.map((l) => `${l.name}${l.colorName ? ` (${l.colorName})` : ''} ×${l.qty}`).join(' · ')}
          </p>
          <p className="mt-1 text-[12px] text-x-faint">
            {o.address.street ? `${o.address.street}, ${o.address.city}` : 'ללא משלוח'} · תשלום: {o.paymentMethod} · אסמכתא: {o.paymentRef ?? '—'}
          </p>
        </li>
      ))}
    </ul>
  );
}

function SettingsTab() {
  const s = useShop();
  const st = s.db.settings;
  const [methods, setMethods] = useState<ShippingMethod[]>(st.shippingMethods);
  const [coupons, setCoupons] = useState<Coupon[]>(st.coupons);
  return (
    <div className="space-y-8">
      <section>
        <h3 className="mb-3 text-[17px] font-extrabold">שיטות משלוח</h3>
        <div className="space-y-2">
          {methods.map((m, i) => (
            <div key={m.id} className="grid grid-cols-2 gap-2 rounded-xl p-3 ring-1 ring-x-line sm:grid-cols-4">
              <input aria-label="שם" value={m.name} onChange={(e) => setMethods(methods.map((x, j) => (j === i ? { ...x, name: e.target.value } : x)))} className={`${inputCls} h-10`} />
              <input aria-label="זמן אספקה" value={m.eta} onChange={(e) => setMethods(methods.map((x, j) => (j === i ? { ...x, eta: e.target.value } : x)))} className={`${inputCls} h-10`} />
              <label className="flex items-center gap-1 text-[12px]">
                מחיר
                <input type="number" min={0} value={m.price} onChange={(e) => setMethods(methods.map((x, j) => (j === i ? { ...x, price: +e.target.value } : x)))} className={`${inputCls} h-10`} />
              </label>
              <label className="flex items-center gap-1 text-[12px]">
                חינם מעל
                <input
                  type="number"
                  min={0}
                  value={m.freeFrom ?? ''}
                  placeholder="—"
                  onChange={(e) => setMethods(methods.map((x, j) => (j === i ? { ...x, freeFrom: e.target.value ? +e.target.value : null } : x)))}
                  className={`${inputCls} h-10`}
                />
              </label>
            </div>
          ))}
        </div>
      </section>
      <section>
        <h3 className="mb-3 text-[17px] font-extrabold">קופונים</h3>
        <div className="space-y-2">
          {coupons.map((c, i) => (
            <div key={i} className="grid grid-cols-2 items-center gap-2 rounded-xl p-3 ring-1 ring-x-line sm:grid-cols-6">
              <input aria-label="קוד" dir="ltr" value={c.code} onChange={(e) => setCoupons(coupons.map((x, j) => (j === i ? { ...x, code: e.target.value.toUpperCase() } : x)))} className={`${inputCls} h-10`} />
              <select aria-label="סוג" value={c.kind} onChange={(e) => setCoupons(coupons.map((x, j) => (j === i ? { ...x, kind: e.target.value as Coupon['kind'] } : x)))} className={`${inputCls} h-10`}>
                <option value="percent">אחוז הנחה</option>
                <option value="fixed">סכום קבוע</option>
                <option value="shipping">משלוח חינם</option>
              </select>
              <input aria-label="ערך" type="number" min={0} value={c.value} onChange={(e) => setCoupons(coupons.map((x, j) => (j === i ? { ...x, value: +e.target.value } : x)))} className={`${inputCls} h-10`} />
              <input aria-label="מינימום הזמנה" type="number" min={0} value={c.minSubtotal} onChange={(e) => setCoupons(coupons.map((x, j) => (j === i ? { ...x, minSubtotal: +e.target.value } : x)))} className={`${inputCls} h-10`} />
              <input aria-label="תיאור" value={c.label} onChange={(e) => setCoupons(coupons.map((x, j) => (j === i ? { ...x, label: e.target.value } : x)))} className={`${inputCls} h-10`} />
              <span className="flex items-center gap-2 text-[13px]">
                <label className="flex items-center gap-1">
                  <input type="checkbox" checked={c.active} onChange={(e) => setCoupons(coupons.map((x, j) => (j === i ? { ...x, active: e.target.checked } : x)))} className="accent-x-blue" /> פעיל
                </label>
                <button type="button" aria-label="מחיקה" onClick={() => setCoupons(coupons.filter((_, j) => j !== i))} className="text-x-muted hover:text-x-red">
                  <IconTrash size={17} />
                </button>
              </span>
            </div>
          ))}
        </div>
        <button
          type="button"
          onClick={() => setCoupons([...coupons, { code: 'NEW', kind: 'percent', value: 10, minSubtotal: 0, active: false, label: '' }])}
          className={`${btn.ghost} mt-2 h-10 px-4 text-[13px]`}
        >
          + קופון
        </button>
      </section>
      <button
        type="button"
        onClick={() => {
          actions.updateSettings({ shippingMethods: methods, coupons: coupons.filter((c) => c.code.trim()) });
          toast('ההגדרות נשמרו');
        }}
        className={`${btn.blue} h-12 w-full`}
      >
        שמירת הגדרות
      </button>
      <section className="space-y-3 rounded-2xl bg-x-soft p-4">
        <label className="flex items-center justify-between gap-3 text-[14px] font-semibold">
          הצגת התווית &quot;נתוני דוגמה&quot; באתר
          <input type="checkbox" checked={st.sampleDataNotice} onChange={(e) => actions.updateSettings({ sampleDataNotice: e.target.checked })} className="size-5 accent-x-blue" />
        </label>
        <p className="text-[12px] text-x-muted">כבו רק אחרי שכל המוצרים, המחירים, המלאי והדירוגים הוחלפו בנתונים אמיתיים.</p>
        <button
          type="button"
          onClick={() => confirm('לאפס את כל נתוני החנות לנתוני הדוגמה? (מוצרים, הזמנות, משתמשים)') && actions.resetDemo()}
          className="text-[13px] font-bold text-x-red"
        >
          איפוס נתוני ההדגמה
        </button>
      </section>
    </div>
  );
}

export function AdminView() {
  const s = useShop();
  const user = useCurrentUser();
  const router = useRouter();
  const [tab, setTab] = useState<Tab>('products');
  useEffect(() => {
    if (s.ready && !user) router.replace('/shop/login?next=/shop/admin');
  }, [s.ready, user, router]);
  if (!s.ready || !user) return null;
  if (user.role !== 'admin')
    return (
      <div className="mx-auto max-w-sm px-6 py-20 text-center">
        <p className="text-lg font-bold">אין הרשאת ניהול לחשבון הזה.</p>
        <Link href="/shop" className={`${btn.blue} mt-6 h-12 w-full`}>
          לחנות
        </Link>
      </div>
    );
  const tabs: { key: Tab; label: string }[] = [
    { key: 'products', label: `מוצרים (${s.db.products.length})` },
    { key: 'categories', label: `קטגוריות (${s.db.categories.length})` },
    { key: 'orders', label: `הזמנות (${s.db.orders.length})` },
    { key: 'settings', label: 'משלוח, קופונים והגדרות' },
  ];
  return (
    <div className="min-h-dvh bg-x-soft-2 pb-16">
      <header className="sticky top-0 z-30 border-b border-x-line bg-white/95 pt-[env(safe-area-inset-top)] backdrop-blur">
        <div className="mx-auto flex h-16 max-w-6xl items-center gap-4 px-4">
          <Logo className="text-[26px]" />
          <span className="rounded-full bg-x-blue-50 px-3 py-1 text-[12px] font-bold text-x-blue">ניהול חנות</span>
          <Link href="/shop" className="ms-auto text-[14px] font-bold text-x-blue">
            לחנות ←
          </Link>
        </div>
        <nav className="x-noscrollbar mx-auto flex max-w-6xl gap-1 overflow-x-auto px-4 pb-2">
          {tabs.map((t) => (
            <button
              key={t.key}
              type="button"
              onClick={() => setTab(t.key)}
              aria-current={tab === t.key ? 'page' : undefined}
              className={`shrink-0 rounded-full px-4 py-2 text-[14px] font-semibold ${tab === t.key ? 'bg-x-ink text-white' : 'hover:bg-x-soft'}`}
            >
              {t.label}
            </button>
          ))}
        </nav>
      </header>
      <main id="main" className="mx-auto mt-6 max-w-6xl px-4">
        <div className="rounded-[22px] bg-white p-4 shadow-x-card sm:p-6">
          <p className="mb-5 rounded-xl bg-[#f5f2ff] px-4 py-3 text-[13px] text-x-violet-600">
            מצב הדגמה: השינויים נשמרים בדפדפן הזה. לאחר חיבור Supabase (supabase/shop-schema.sql) הם יישמרו במסד הנתונים ויוצגו לכל הלקוחות.
          </p>
          {tab === 'products' && <ProductsTab />}
          {tab === 'categories' && <CategoriesTab />}
          {tab === 'orders' && <OrdersTab />}
          {tab === 'settings' && <SettingsTab />}
        </div>
      </main>
    </div>
  );
}
