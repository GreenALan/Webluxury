'use client';
import { useState, type FormEvent } from 'react';
import { useRouter } from 'next/navigation';

export default function AdminLoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await fetch('/api/admin/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password })
      });
      const json = await res.json();
      if (!res.ok) {
        setError(json.code === 'RATE_LIMITED' ? '失败次数过多，请稍后再试' : '邮箱或密码错误');
        return;
      }
      router.push('/admin');
      router.refresh();
    } catch {
      setError('网络错误，请重试');
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="min-h-screen flex items-center justify-center px-4">
      <form
        onSubmit={onSubmit}
        className="w-full max-w-sm bg-white border border-line p-8 space-y-4"
      >
        <h1 className="font-serif text-2xl tracking-wider">后台登录</h1>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">邮箱</span>
          <input
            type="email"
            required
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className="mt-1 w-full border border-line px-3 py-2 focus:outline-none focus:border-ink"
          />
        </label>
        <label className="block">
          <span className="text-xs uppercase tracking-wider text-ink-soft">密码</span>
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className="mt-1 w-full border border-line px-3 py-2 focus:outline-none focus:border-ink"
          />
        </label>
        {error && <p className="text-sm text-red-600">{error}</p>}
        <button
          type="submit"
          disabled={busy}
          className="w-full h-11 bg-ink text-bone tracking-wider uppercase text-sm disabled:opacity-50"
        >
          {busy ? '登录中…' : '登录'}
        </button>
      </form>
    </main>
  );
}
