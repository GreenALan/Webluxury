'use client';
import { useEffect, useState, type FormEvent } from 'react';

type User = {
  id: string;
  email: string;
  name: string;
  role: 'OWNER' | 'ADMIN';
  createdAt: string;
};

export default function AdminUsersPage() {
  const [list, setList] = useState<User[]>([]);
  const [inviting, setInviting] = useState(false);
  const [email, setEmail] = useState('');
  const [name, setName] = useState('');
  const [tempPassword, setTempPassword] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function load() {
    const res = await fetch('/api/admin/users');
    const json = (await res.json()) as { users: User[] };
    setList(json.users);
  }
  useEffect(() => {
    load();
  }, []);

  async function invite(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setTempPassword(null);
    const res = await fetch('/api/admin/users', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, name })
    });
    const json = (await res.json()) as { ok: boolean; code?: string; tempPassword?: string };
    if (!res.ok) {
      setError(json.code === 'DUPLICATE_EMAIL' ? '邮箱已存在' : '邀请失败');
      return;
    }
    setTempPassword(json.tempPassword ?? null);
    setEmail('');
    setName('');
    await load();
  }

  return (
    <div className="space-y-6 max-w-3xl">
      <div className="flex items-center justify-between">
        <h1 className="font-serif text-3xl">管理员</h1>
        {!inviting && (
          <button
            onClick={() => setInviting(true)}
            className="px-4 py-2 border border-line text-sm"
          >
            + 邀请管理员
          </button>
        )}
      </div>

      {inviting && (
        <form onSubmit={invite} className="border border-line p-6 space-y-3">
          <h2 className="text-sm uppercase tracking-wider">邀请新管理员</h2>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-soft">邮箱</span>
            <input
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              className="mt-1 w-full border border-line px-3 py-2"
            />
          </label>
          <label className="block">
            <span className="text-xs uppercase tracking-wider text-ink-soft">姓名</span>
            <input
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              className="mt-1 w-full border border-line px-3 py-2"
            />
          </label>
          {error && <p className="text-sm text-red-600">{error}</p>}
          {tempPassword && (
            <p className="text-sm bg-bone-dark p-3">
              临时密码：
              <code className="font-mono">{tempPassword}</code>
              （只显示一次，请立刻发给该管理员）
            </p>
          )}
          <div className="space-x-3">
            <button
              type="submit"
              className="px-6 py-2 bg-ink text-bone uppercase text-sm tracking-wider"
            >
              发邀请
            </button>
            <button
              type="button"
              onClick={() => {
                setInviting(false);
                setTempPassword(null);
                setError(null);
              }}
              className="text-xs text-ink-soft hover:text-ink"
            >
              关闭
            </button>
          </div>
        </form>
      )}

      <table className="w-full border border-line">
        <thead className="bg-bone-dark text-xs uppercase tracking-wider">
          <tr>
            <th className="text-left p-2">姓名</th>
            <th className="text-left p-2">邮箱</th>
            <th className="text-left p-2">角色</th>
            <th className="text-left p-2">加入</th>
          </tr>
        </thead>
        <tbody>
          {list.map((u) => (
            <tr key={u.id} className="border-t border-line">
              <td className="p-2">{u.name}</td>
              <td className="p-2 font-mono text-xs">{u.email}</td>
              <td className="p-2 text-xs">{u.role}</td>
              <td className="p-2 text-xs text-ink-soft">
                {new Date(u.createdAt).toISOString().slice(0, 10)}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}
