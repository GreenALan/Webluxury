'use client';
import { useState, type FormEvent } from 'react';

export type CategoryFormValue = {
  slug: string;
  nameZh: string;
  nameEn: string;
  icon: string;
  sortOrder: number;
};

type Props = {
  initial?: Partial<CategoryFormValue>;
  onSubmit: (v: CategoryFormValue) => Promise<{ ok: boolean; message?: string }>;
  submitLabel?: string;
};

export function CategoryForm({ initial, onSubmit, submitLabel = '保存' }: Props) {
  const [v, setV] = useState<CategoryFormValue>({
    slug: initial?.slug ?? '',
    nameZh: initial?.nameZh ?? '',
    nameEn: initial?.nameEn ?? '',
    icon: initial?.icon ?? '',
    sortOrder: initial?.sortOrder ?? 0
  });
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    const r = await onSubmit(v);
    if (!r.ok) setError(r.message ?? '保存失败');
    setBusy(false);
  }

  return (
    <form onSubmit={submit} className="space-y-3">
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">Slug (URL)</span>
          <input
            required
            pattern="[a-z0-9-]+"
            value={v.slug}
            onChange={(e) => setV({ ...v, slug: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">排序</span>
          <input
            type="number"
            min={0}
            max={9999}
            value={v.sortOrder}
            onChange={(e) => setV({ ...v, sortOrder: Number(e.target.value) })}
            className="mt-1 w-full border border-line px-3 py-2"
          />
        </label>
      </div>
      <div className="grid grid-cols-2 gap-3">
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">中文名</span>
          <input
            required
            value={v.nameZh}
            onChange={(e) => setV({ ...v, nameZh: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">英文名</span>
          <input
            required
            value={v.nameEn}
            onChange={(e) => setV({ ...v, nameEn: e.target.value })}
            className="mt-1 w-full border border-line px-3 py-2"
          />
        </label>
      </div>
      <label className="block">
        <span className="text-xs uppercase tracking-wider text-ink-soft">图标（emoji，可空）</span>
        <input
          value={v.icon}
          onChange={(e) => setV({ ...v, icon: e.target.value })}
          className="mt-1 w-full border border-line px-3 py-2"
        />
      </label>
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
