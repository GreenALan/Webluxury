'use client';
import { useEffect, useState, useCallback } from 'react';
import Link from 'next/link';
import type { ProductStatus } from '@prisma/client';
import { StatusBadge } from '@/components/admin/StatusBadge';
import { Pagination } from '@/components/admin/Pagination';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

type Item = {
  id: string;
  slug: string;
  titleZh: string;
  brand: string;
  price: string;
  status: ProductStatus;
  createdAt: string;
  category: { nameZh: string };
  images: Array<{ url: string }>;
};

export default function AdminProductsPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<ProductStatus | 'ALL'>('ALL');
  const [search, setSearch] = useState('');
  const [toDelete, setToDelete] = useState<Item | null>(null);

  const load = useCallback(async () => {
    const params = new URLSearchParams();
    params.set('page', String(page));
    if (status !== 'ALL') params.set('status', status);
    if (search) params.set('search', search);
    const res = await fetch(`/api/admin/products?${params.toString()}`);
    const json = (await res.json()) as { items: Item[]; total: number };
    setItems(json.items);
    setTotal(json.total);
  }, [page, status, search]);

  useEffect(() => {
    load();
  }, [load]);

  async function doDelete() {
    if (!toDelete) return;
    await fetch(`/api/admin/products/${toDelete.id}`, { method: 'DELETE' });
    setToDelete(null);
    await load();
  }

  async function setItemStatus(id: string, next: ProductStatus) {
    await fetch(`/api/admin/products/${id}/status`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: next })
    });
    await load();
  }

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">商品</h1>
        <Link
          href="/admin/products/new"
          className="px-4 py-2 bg-ink text-bone text-sm tracking-wider uppercase"
        >
          + 新建商品
        </Link>
      </div>

      <div className="flex items-center gap-3">
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as ProductStatus | 'ALL');
          }}
          className="border border-line px-3 py-2 text-sm"
        >
          <option value="ALL">全部状态</option>
          <option value="DRAFT">草稿</option>
          <option value="AVAILABLE">在售</option>
          <option value="RESERVED">保留</option>
          <option value="SOLD">已售</option>
          <option value="ARCHIVED">归档</option>
        </select>
        <input
          placeholder="搜索标题或序列号"
          value={search}
          onChange={(e) => {
            setPage(1);
            setSearch(e.target.value);
          }}
          className="border border-line px-3 py-2 text-sm flex-1 max-w-sm"
        />
      </div>

      <table className="w-full border border-line">
        <thead className="bg-bone-dark text-xs uppercase tracking-wider">
          <tr>
            <th className="text-left p-2"> </th>
            <th className="text-left p-2">标题</th>
            <th className="text-left p-2">品牌</th>
            <th className="text-left p-2">分类</th>
            <th className="text-right p-2">价格</th>
            <th className="text-left p-2">状态</th>
            <th className="text-right p-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((p) => (
            <tr key={p.id} className="border-t border-line align-top">
              <td className="p-2">
                {p.images[0] ? (
                  /* eslint-disable-next-line @next/next/no-img-element */
                  <img src={p.images[0].url} alt="" className="w-12 h-12 object-cover" />
                ) : (
                  <div className="w-12 h-12 bg-bone-dark" />
                )}
              </td>
              <td className="p-2">
                <Link href={`/admin/products/${p.id}/edit`} className="hover:text-accent">
                  {p.titleZh}
                </Link>
                <div className="text-xs text-ink-soft font-mono">{p.slug}</div>
              </td>
              <td className="p-2">{p.brand}</td>
              <td className="p-2">{p.category.nameZh}</td>
              <td className="p-2 text-right tabular-nums">¥{Number(p.price).toLocaleString()}</td>
              <td className="p-2">
                <select
                  value={p.status}
                  onChange={(e) => setItemStatus(p.id, e.target.value as ProductStatus)}
                  className="text-xs border border-line px-1 py-0.5"
                >
                  <option value="DRAFT">草稿</option>
                  <option value="AVAILABLE">在售</option>
                  <option value="RESERVED">保留</option>
                  <option value="SOLD">已售</option>
                  <option value="ARCHIVED">归档</option>
                </select>
                <div className="mt-1">
                  <StatusBadge status={p.status} />
                </div>
              </td>
              <td className="p-2 text-right text-xs space-x-3">
                <Link href={`/admin/products/${p.id}/edit`} className="hover:text-accent">
                  编辑
                </Link>
                <button
                  onClick={() => setToDelete(p)}
                  className="text-red-600 hover:text-red-800"
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={7} className="p-6 text-center text-sm text-ink-soft">
                暂无商品
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <Pagination page={page} pageSize={20} total={total} onChange={setPage} />

      <ConfirmDialog
        open={!!toDelete}
        title="删除商品"
        message={`确认删除 "${toDelete?.titleZh}"？图片也会一并删除（来源记录），无法撤销。`}
        confirmLabel="删除"
        destructive
        onConfirm={doDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
