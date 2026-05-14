'use client';
import { useEffect, useState } from 'react';
import { CategoryForm, type CategoryFormValue } from '@/components/admin/CategoryForm';

type Category = {
  id: string;
  slug: string;
  nameZh: string;
  nameEn: string;
  icon: string | null;
  sortOrder: number;
};

export default function AdminCategoriesPage() {
  const [list, setList] = useState<Category[]>([]);
  const [editing, setEditing] = useState<Category | null>(null);
  const [creating, setCreating] = useState(false);

  async function load() {
    const res = await fetch('/api/admin/categories');
    const json = (await res.json()) as { categories: Category[] };
    setList(json.categories);
  }
  useEffect(() => {
    load();
  }, []);

  async function create(v: CategoryFormValue) {
    const res = await fetch('/api/admin/categories', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(v)
    });
    const json = (await res.json()) as { ok: boolean; code?: string };
    if (json.ok) {
      setCreating(false);
      await load();
      return { ok: true };
    }
    return { ok: false, message: json.code === 'DUPLICATE_SLUG' ? 'Slug 已被使用' : '保存失败' };
  }

  async function update(id: string, v: CategoryFormValue) {
    const res = await fetch(`/api/admin/categories/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        nameZh: v.nameZh,
        nameEn: v.nameEn,
        icon: v.icon,
        sortOrder: v.sortOrder
      })
    });
    const json = (await res.json()) as { ok: boolean };
    if (json.ok) {
      setEditing(null);
      await load();
      return { ok: true };
    }
    return { ok: false, message: '保存失败' };
  }

  async function remove(id: string) {
    if (!confirm('确定删除？')) return;
    const res = await fetch(`/api/admin/categories/${id}`, { method: 'DELETE' });
    const json = (await res.json()) as { ok: boolean; message?: string };
    if (!json.ok) {
      alert(json.message ?? '删除失败');
      return;
    }
    await load();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">分类</h1>
        {!creating && !editing && (
          <button
            onClick={() => setCreating(true)}
            className="px-4 py-2 border border-line text-sm"
          >
            + 新建分类
          </button>
        )}
      </div>

      {creating && (
        <div className="border border-line p-6 space-y-3">
          <h2 className="text-sm uppercase tracking-wider">新建分类</h2>
          <CategoryForm onSubmit={create} submitLabel="创建" />
          <button
            onClick={() => setCreating(false)}
            className="text-xs text-ink-soft hover:text-ink"
          >
            取消
          </button>
        </div>
      )}

      {editing && (
        <div className="border border-line p-6 space-y-3">
          <h2 className="text-sm uppercase tracking-wider">编辑：{editing.slug}</h2>
          <CategoryForm
            initial={{
              slug: editing.slug,
              nameZh: editing.nameZh,
              nameEn: editing.nameEn,
              icon: editing.icon ?? '',
              sortOrder: editing.sortOrder
            }}
            onSubmit={(v) => update(editing.id, v)}
          />
          <button
            onClick={() => setEditing(null)}
            className="text-xs text-ink-soft hover:text-ink"
          >
            取消
          </button>
        </div>
      )}

      <table className="w-full border border-line">
        <thead className="bg-bone-dark text-xs uppercase tracking-wider">
          <tr>
            <th className="text-left p-2">排序</th>
            <th className="text-left p-2">Slug</th>
            <th className="text-left p-2">中文名</th>
            <th className="text-left p-2">英文名</th>
            <th className="text-right p-2">操作</th>
          </tr>
        </thead>
        <tbody>
          {list.map((c) => (
            <tr key={c.id} className="border-t border-line">
              <td className="p-2">{c.sortOrder}</td>
              <td className="p-2 font-mono text-xs">{c.slug}</td>
              <td className="p-2">{c.nameZh}</td>
              <td className="p-2">{c.nameEn}</td>
              <td className="p-2 text-right space-x-3 text-xs">
                <button onClick={() => setEditing(c)} className="hover:text-accent">
                  编辑
                </button>
                <button
                  onClick={() => remove(c.id)}
                  className="text-red-600 hover:text-red-800"
                >
                  删除
                </button>
              </td>
            </tr>
          ))}
          {list.length === 0 && (
            <tr>
              <td colSpan={5} className="p-6 text-center text-ink-soft text-sm">
                暂无分类
              </td>
            </tr>
          )}
        </tbody>
      </table>
    </div>
  );
}
