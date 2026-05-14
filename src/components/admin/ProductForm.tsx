'use client';
import { useState, type FormEvent } from 'react';
import type { Condition, ProductStatus } from '@prisma/client';
import { ImageUploader, type UploadedImage } from './ImageUploader';

export type ProductFormValue = {
  titleZh: string;
  titleEn: string;
  descZh: string;
  descEn: string;
  brand: string;
  categoryId: string;
  price: string;
  originalPrice: string;
  condition: Condition;
  sizeInfo: string; // JSON 字符串
  serialNumber: string;
  status: ProductStatus;
  photos: UploadedImage[];
  certs: UploadedImage[];
};

type Props = {
  initial?: Partial<ProductFormValue>;
  categories: Array<{ id: string; slug: string; nameZh: string }>;
  brandOptions: string[];
  onSubmit: (v: ProductFormValue) => Promise<{ ok: boolean; message?: string }>;
  submitLabel?: string;
};

const CONDITIONS: Condition[] = ['NEW', 'LIKE_NEW', 'EXCELLENT', 'GOOD', 'FAIR'];
const STATUSES: ProductStatus[] = ['DRAFT', 'AVAILABLE', 'RESERVED', 'SOLD', 'ARCHIVED'];
const CONDITION_LABEL: Record<Condition, string> = {
  NEW: '全新',
  LIKE_NEW: '几乎全新',
  EXCELLENT: '95 新',
  GOOD: '85 新',
  FAIR: '有明显痕迹'
};

export function ProductForm({
  initial,
  categories,
  brandOptions,
  onSubmit,
  submitLabel = '保存'
}: Props) {
  const [v, setV] = useState<ProductFormValue>({
    titleZh: initial?.titleZh ?? '',
    titleEn: initial?.titleEn ?? '',
    descZh: initial?.descZh ?? '',
    descEn: initial?.descEn ?? '',
    brand: initial?.brand ?? '',
    categoryId: initial?.categoryId ?? '',
    price: initial?.price ?? '',
    originalPrice: initial?.originalPrice ?? '',
    condition: initial?.condition ?? 'EXCELLENT',
    sizeInfo: initial?.sizeInfo ?? '',
    serialNumber: initial?.serialNumber ?? '',
    status: initial?.status ?? 'DRAFT',
    photos: initial?.photos ?? [],
    certs: initial?.certs ?? []
  });
  const [tab, setTab] = useState<'zh' | 'en'>('zh');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      JSON.parse(v.sizeInfo || '{}');
    } catch {
      setError('尺寸信息必须是合法 JSON');
      setBusy(false);
      return;
    }
    const r = await onSubmit(v);
    if (!r.ok) setError(r.message ?? '保存失败');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-6 max-w-3xl">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">品牌</span>
          <input
            list="brand-options"
            required
            value={v.brand}
            onChange={(e) => setV({ ...v, brand: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2"
          />
          <datalist id="brand-options">
            {brandOptions.map((b) => (
              <option key={b} value={b} />
            ))}
          </datalist>
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">分类</span>
          <select
            required
            value={v.categoryId}
            onChange={(e) => setV({ ...v, categoryId: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2"
          >
            <option value="">请选择…</option>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.nameZh}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="border border-line">
        <div className="flex border-b border-line">
          <button
            type="button"
            onClick={() => setTab('zh')}
            className={`px-4 py-2 text-xs uppercase tracking-wider ${tab === 'zh' ? 'bg-ink text-bone' : 'text-ink-soft'}`}
          >
            中文
          </button>
          <button
            type="button"
            onClick={() => setTab('en')}
            className={`px-4 py-2 text-xs uppercase tracking-wider ${tab === 'en' ? 'bg-ink text-bone' : 'text-ink-soft'}`}
          >
            English
          </button>
        </div>
        <div className="p-4 space-y-3">
          {tab === 'zh' ? (
            <>
              <input
                required
                placeholder="标题（中）"
                value={v.titleZh}
                onChange={(e) => setV({ ...v, titleZh: e.target.value })}
                className="w-full border border-line px-3 py-2"
              />
              <textarea
                rows={6}
                placeholder="描述（中）"
                value={v.descZh}
                onChange={(e) => setV({ ...v, descZh: e.target.value })}
                className="w-full border border-line px-3 py-2"
              />
            </>
          ) : (
            <>
              <input
                placeholder="Title (EN, optional)"
                value={v.titleEn}
                onChange={(e) => setV({ ...v, titleEn: e.target.value })}
                className="w-full border border-line px-3 py-2"
              />
              <textarea
                rows={6}
                placeholder="Description (EN, optional)"
                value={v.descEn}
                onChange={(e) => setV({ ...v, descEn: e.target.value })}
                className="w-full border border-line px-3 py-2"
              />
            </>
          )}
        </div>
      </div>

      <div className="grid grid-cols-3 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">价格 (CNY)</span>
          <input
            required
            pattern="\d+(\.\d{1,2})?"
            value={v.price}
            onChange={(e) => setV({ ...v, price: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">
            原价 (CNY，可空)
          </span>
          <input
            value={v.originalPrice}
            onChange={(e) => setV({ ...v, originalPrice: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">成色</span>
          <select
            value={v.condition}
            onChange={(e) => setV({ ...v, condition: e.target.value as Condition })}
            className="mt-1 w-full border border-line px-3 py-2"
          >
            {CONDITIONS.map((c) => (
              <option key={c} value={c}>
                {CONDITION_LABEL[c]}
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">序列号</span>
          <input
            value={v.serialNumber}
            onChange={(e) => setV({ ...v, serialNumber: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2 font-mono text-sm"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">状态</span>
          <select
            value={v.status}
            onChange={(e) => setV({ ...v, status: e.target.value as ProductStatus })}
            className="mt-1 w-full border border-line px-3 py-2"
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </select>
        </label>
      </div>

      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-soft">
          尺寸信息 (JSON，例: {`{"diameter":"40mm"}`})
        </span>
        <textarea
          rows={3}
          value={v.sizeInfo}
          onChange={(e) => setV({ ...v, sizeInfo: e.target.value })}
          className="mt-1 w-full border border-line px-3 py-2 font-mono text-sm"
        />
      </label>

      <div>
        <span className="text-xs uppercase tracking-wider text-ink-soft">商品图</span>
        <div className="mt-2">
          <ImageUploader
            value={v.photos}
            onChange={(next) => setV({ ...v, photos: next })}
            kind="PHOTO"
            max={15}
          />
        </div>
      </div>

      <div>
        <span className="text-xs uppercase tracking-wider text-ink-soft">鉴定附件</span>
        <div className="mt-2">
          <ImageUploader
            value={v.certs}
            onChange={(next) => setV({ ...v, certs: next })}
            kind="CERT"
            max={5}
          />
        </div>
      </div>

      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="submit"
        disabled={busy}
        className="px-6 py-2 bg-ink text-bone uppercase text-sm tracking-wider disabled:opacity-50"
      >
        {busy ? '保存中…' : submitLabel}
      </button>
    </form>
  );
}
