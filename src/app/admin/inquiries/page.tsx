'use client';
import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import type { InquiryStatus } from '@prisma/client';
import { Pagination } from '@/components/admin/Pagination';
import { ConfirmDialog } from '@/components/admin/ConfirmDialog';

type Item = {
  id: string;
  name: string;
  contact: string;
  message: string;
  locale: 'zh' | 'en';
  status: InquiryStatus;
  createdAt: string;
  product: { id: string; slug: string; titleZh: string; titleEn: string | null } | null;
};

export default function AdminInquiriesPage() {
  const [items, setItems] = useState<Item[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [status, setStatus] = useState<InquiryStatus | 'ALL'>('ALL');
  const [toDelete, setToDelete] = useState<Item | null>(null);

  const load = useCallback(async () => {
    const sp = new URLSearchParams();
    sp.set('page', String(page));
    if (status !== 'ALL') sp.set('status', status);
    const res = await fetch(`/api/admin/inquiries?${sp.toString()}`);
    const json = (await res.json()) as { items: Item[]; total: number };
    setItems(json.items);
    setTotal(json.total);
  }, [page, status]);

  useEffect(() => {
    load();
  }, [load]);

  async function markRead(id: string) {
    await fetch(`/api/admin/inquiries/${id}`, { method: 'PATCH' });
    await load();
  }

  async function doDelete() {
    if (!toDelete) return;
    await fetch(`/api/admin/inquiries/${toDelete.id}`, { method: 'DELETE' });
    setToDelete(null);
    await load();
  }

  return (
    <div className="space-y-4">
      <h1 className="font-serif text-3xl">询价</h1>

      <div className="flex items-center gap-3">
        <select
          value={status}
          onChange={(e) => {
            setPage(1);
            setStatus(e.target.value as InquiryStatus | 'ALL');
          }}
          className="border border-line px-3 py-2 text-sm"
        >
          <option value="ALL">全部</option>
          <option value="NEW">未读</option>
          <option value="READ">已读</option>
          <option value="REPLIED">已回复</option>
        </select>
        <span className="text-xs text-ink-soft">共 {total} 条</span>
      </div>

      <table className="w-full border border-line text-sm">
        <thead className="bg-bone-dark text-xs uppercase tracking-wider">
          <tr>
            <th className="text-left p-2 w-32">时间</th>
            <th className="text-left p-2">访客</th>
            <th className="text-left p-2">商品</th>
            <th className="text-left p-2">留言</th>
            <th className="text-left p-2 w-20">状态</th>
            <th className="text-right p-2 w-40">操作</th>
          </tr>
        </thead>
        <tbody>
          {items.map((i) => (
            <tr key={i.id} className="border-t border-line align-top">
              <td className="p-2 text-xs text-ink-soft">
                {new Date(i.createdAt).toISOString().slice(0, 16).replace('T', ' ')}
              </td>
              <td className="p-2">
                <div className="font-medium">{i.name}</div>
                <div className="text-xs text-ink-soft font-mono">{i.contact}</div>
                <div className="text-[10px] text-ink-soft uppercase">{i.locale}</div>
              </td>
              <td className="p-2">
                {i.product ? (
                  <Link
                    href={`/${i.locale}/products/${i.product.slug}`}
                    target="_blank"
                    className="hover:text-accent text-xs"
                  >
                    {i.product.titleZh}
                  </Link>
                ) : (
                  <span className="text-xs text-ink-soft">站点级</span>
                )}
              </td>
              <td className="p-2 whitespace-pre-line">{i.message}</td>
              <td className="p-2">
                <span
                  className={`inline-block text-[10px] tracking-widest uppercase px-2 py-0.5 ${
                    i.status === 'NEW'
                      ? 'bg-ink text-bone'
                      : i.status === 'READ'
                        ? 'border border-line text-ink-soft'
                        : 'border border-accent text-accent'
                  }`}
                >
                  {i.status === 'NEW' ? '未读' : i.status === 'READ' ? '已读' : '已回复'}
                </span>
              </td>
              <td className="p-2 text-right text-xs space-x-3">
                {i.status === 'NEW' && (
                  <button onClick={() => markRead(i.id)} className="hover:text-accent">
                    标记已读
                  </button>
                )}
                <button
                  onClick={() => setToDelete(i)}
                  className="text-red-600 hover:text-red-800"
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
          {items.length === 0 && (
            <tr>
              <td colSpan={6} className="p-6 text-center text-sm text-ink-soft">
                暂无询价
              </td>
            </tr>
          )}
        </tbody>
      </table>

      <Pagination page={page} pageSize={30} total={total} onChange={setPage} />

      <ConfirmDialog
        open={!!toDelete}
        title="删除询价"
        message={`确认删除来自 "${toDelete?.name}" 的询价？无法撤销。`}
        confirmLabel="删除"
        destructive
        onConfirm={doDelete}
        onCancel={() => setToDelete(null)}
      />
    </div>
  );
}
